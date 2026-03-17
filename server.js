/**
 * Master Kitchen Management Application Server
 * 
 * Integrates three applications:
 * 1. Maintenance Dashboard - Equipment and maintenance tracking (root)
 * 2. Kitchen Temp Log - Cooking temperature logs (/templog/)
 * 3. Procurement - Purchase request management (/procurement/)
 * 
 * @requires express - Web server framework
 * @requires mongoose - MongoDB ODM for maintenance app
 * @requires mongodb - Native driver for temp log app
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const mongoose = require('mongoose');
const { MongoClient, ServerApiVersion } = require('mongodb');
const net = require('net');
const path = require('path');
const fs  = require('fs');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requirePageAccess, requireAuth, requireAdmin } = require('./services/auth-middleware');

// Try to load puppeteer (optional - for PDF generation)
let puppeteer = null;
try { 
  puppeteer = require('puppeteer'); 
} catch (_) {
  console.warn('⚠️  Puppeteer not installed - PDF export unavailable');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Trust Railway/Heroku reverse proxy so req.protocol is 'https' in production
app.set('trust proxy', 1);

// ─── Database connections ────────────────────────────────────────────────────

// Seed default admin user if none exists
async function seedAdmin() {
    try {
        const User = require('./models/User');
        const count = await User.countDocuments();
        if (count === 0) {
            const admin = new User({
                username:     'admin',
                passwordHash: 'admin123',
                displayName:  'Administrator',
                role:         'admin',
                permissions:  { maintenance: true, foodsafety: true, templog: true, procurement: true, pest: true, tempmon: true }
            });
            await admin.save();
            console.log('✓ [Auth] Default admin created — username: admin / password: admin123');
        } else {
            console.log(`✓ [Auth] ${count} user(s) found in database`);
        }
    } catch (err) {
        console.error('✗ [Auth] Seed admin error:', err.message);
    }
}

/**
 * Auto-seed the 31 TempMon equipment units + paired devices.
 * Runs on first boot when the collection is empty.
 * Safe to re-run — uses findOneAndUpdate with $setOnInsert.
 */
async function seedTempMonUnits() {
    try {
        const TempMonUnit   = require('./models/TempMonUnit');
        const TempMonDevice = require('./models/TempMonDevice');

        console.log('⏳ [TempMon] Upserting 31 equipment units + TempMon devices…');

        const LIMITS = {
            freezer: { criticalMin: -25, criticalMax: -12, warningBuffer: 2, targetTemp: -18 },
            chiller: { criticalMin:   1, criticalMax:   8, warningBuffer: 2, targetTemp:   4 },
            warmer:  { criticalMin:  60, criticalMax:  90, warningBuffer: 5, targetTemp:  68 },
        };

        const SENSORS = [
            { sn: '09240013', name: 'CK-B4-FW-01',                             type: 'warmer'  },
            { sn: '09240014', name: 'CK-B4-FW-02',                             type: 'warmer'  },
            { sn: '09240127', name: 'CK-B4-FW-03',                             type: 'warmer'  },
            { sn: '09240128', name: 'CK-B4-FW-04',                             type: 'warmer'  },
            { sn: '09240129', name: 'CK-B4-FW-05',                             type: 'warmer'  },
            { sn: '09240130', name: 'CK-B5-FW-06',                             type: 'warmer'  },
            { sn: '82242245', name: 'CK-WC-01 (Packing Room WC)',              type: 'chiller' },
            { sn: '82242251', name: 'CK-WC-02 (Hot Kitchen Veg WC)',           type: 'chiller' },
            { sn: '82242252', name: 'CK-WC-03 (Hot Kitchen Meat WC)',          type: 'chiller' },
            { sn: '82242253', name: 'CK-WC-04 (Old Sauce Area Veg WC)',        type: 'chiller' },
            { sn: '82242249', name: 'CK-WC-05 (Processed Veg WC)',             type: 'chiller' },
            { sn: '82242250', name: 'CK-WC-06 (Veg Prep WC)',                  type: 'chiller' },
            { sn: '82242275', name: 'CK-WC-07 (06-24 Raw Fish WC)',            type: 'chiller' },
            { sn: '82242261', name: 'CK-WC-08 (06-24 Raw Meat WC)',            type: 'chiller' },
            { sn: '82242260', name: 'CK-WC-09 (05-26 Main Walk-In Chiller)',   type: 'chiller' },
            { sn: '82242254', name: 'CK-WC-11 (05-27 Chiller)',                type: 'chiller' },
            { sn: '82242256', name: 'CK-WC-12 (06-19 Bakery WC)',              type: 'chiller' },
            { sn: '82242255', name: 'CK-SC-01 (Fruit Room SC)',                type: 'chiller' },
            { sn: '82242248', name: 'CK-SC-02 (Salad Room SC)',                type: 'chiller' },
            { sn: '82242247', name: 'CK-C3-SC-01',                             type: 'chiller' },
            { sn: '82242258', name: 'CK-SC-05 (06-19 2-Door Right SC)',        type: 'chiller' },
            { sn: '82242259', name: 'CK-SC-06 (4-Door Left SC)',               type: 'chiller' },
            { sn: '82242246', name: 'CK-CC-01 (Dong Counter Chiller)',         type: 'chiller' },
            { sn: '82242257', name: 'CK-CC-03 (Cold Room CC)',                 type: 'chiller' },
            { sn: '82242262', name: 'CK-SF-01 (Retention Sample SF)',          type: 'freezer' },
            { sn: '82242264', name: 'CK-WF-01 (Braising RTC/RTE WF)',         type: 'freezer' },
            { sn: '82242263', name: 'CK-WF-02 (06-24 WF)',                    type: 'freezer' },
            { sn: '82242268', name: 'CK-WF-03 (05-26 Walk-In Freezer)',       type: 'freezer' },
            { sn: '82242267', name: 'CK-WF-04 (05-27 WF)',                    type: 'freezer' },
            { sn: '82242265', name: 'CK-WF-05 (06-19 Side WF)',               type: 'freezer' },
            { sn: '82242266', name: 'CK-WF-06 (06-19 Big WF)',               type: 'freezer' },
        ];

        let created = 0;
        for (const sensor of SENSORS) {
            const limits = LIMITS[sensor.type];
            const sn = normalizeSensorId(sensor.sn);

            const unitDoc = await TempMonUnit.findOneAndUpdate(
                { name: sensor.name },
                { $setOnInsert: { name: sensor.name, type: sensor.type, ...limits, active: true, alertThresholdMinutes: 30 } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            await TempMonDevice.findOneAndUpdate(
                { deviceId: sn },
                {
                    $set:         { unit: unitDoc._id, active: true },
                    $setOnInsert: { deviceId: sn, expectedIntervalMinutes: 5, label: sensor.name },
                },
                { upsert: true, new: true }
            );
            created++;
        }
        console.log(`✓ [TempMon] Equipment seed done — ${created} unit(s) upserted`);
    } catch (err) {
        console.error('✗ [TempMon] Seed error:', err.message);
    }
}

/**
 * Link all 31 LoRa sensor IDs → TempMon units in the TempLog (lora_devices) collection.
 * Called after the TempLog MongoClient connects. Safe to re-run (upsert).
 */
async function seedLoraLinks(db) {
    if (!db) { console.warn('⚠️  [TempMon] seedLoraLinks skipped — TempLog DB not ready'); return; }
    try {
        const TempMonUnit   = require('./models/TempMonUnit');
        const TYPE_TO_EQUIP = { warmer: 'warmer', chiller: 'chiller', freezer: 'freezer' };
        const SENSORS = [
            { sn: '09240013', name: 'CK-B4-FW-01',                             type: 'warmer'  },
            { sn: '09240014', name: 'CK-B4-FW-02',                             type: 'warmer'  },
            { sn: '09240127', name: 'CK-B4-FW-03',                             type: 'warmer'  },
            { sn: '09240128', name: 'CK-B4-FW-04',                             type: 'warmer'  },
            { sn: '09240129', name: 'CK-B4-FW-05',                             type: 'warmer'  },
            { sn: '09240130', name: 'CK-B5-FW-06',                             type: 'warmer'  },
            { sn: '82242245', name: 'CK-WC-01 (Packing Room WC)',              type: 'chiller' },
            { sn: '82242251', name: 'CK-WC-02 (Hot Kitchen Veg WC)',           type: 'chiller' },
            { sn: '82242252', name: 'CK-WC-03 (Hot Kitchen Meat WC)',          type: 'chiller' },
            { sn: '82242253', name: 'CK-WC-04 (Old Sauce Area Veg WC)',        type: 'chiller' },
            { sn: '82242249', name: 'CK-WC-05 (Processed Veg WC)',             type: 'chiller' },
            { sn: '82242250', name: 'CK-WC-06 (Veg Prep WC)',                  type: 'chiller' },
            { sn: '82242275', name: 'CK-WC-07 (06-24 Raw Fish WC)',            type: 'chiller' },
            { sn: '82242261', name: 'CK-WC-08 (06-24 Raw Meat WC)',            type: 'chiller' },
            { sn: '82242260', name: 'CK-WC-09 (05-26 Main Walk-In Chiller)',   type: 'chiller' },
            { sn: '82242254', name: 'CK-WC-11 (05-27 Chiller)',                type: 'chiller' },
            { sn: '82242256', name: 'CK-WC-12 (06-19 Bakery WC)',              type: 'chiller' },
            { sn: '82242255', name: 'CK-SC-01 (Fruit Room SC)',                type: 'chiller' },
            { sn: '82242248', name: 'CK-SC-02 (Salad Room SC)',                type: 'chiller' },
            { sn: '82242247', name: 'CK-C3-SC-01',                             type: 'chiller' },
            { sn: '82242258', name: 'CK-SC-05 (06-19 2-Door Right SC)',        type: 'chiller' },
            { sn: '82242259', name: 'CK-SC-06 (4-Door Left SC)',               type: 'chiller' },
            { sn: '82242246', name: 'CK-CC-01 (Dong Counter Chiller)',         type: 'chiller' },
            { sn: '82242257', name: 'CK-CC-03 (Cold Room CC)',                 type: 'chiller' },
            { sn: '82242262', name: 'CK-SF-01 (Retention Sample SF)',          type: 'freezer' },
            { sn: '82242264', name: 'CK-WF-01 (Braising RTC/RTE WF)',         type: 'freezer' },
            { sn: '82242263', name: 'CK-WF-02 (06-24 WF)',                    type: 'freezer' },
            { sn: '82242268', name: 'CK-WF-03 (05-26 Walk-In Freezer)',       type: 'freezer' },
            { sn: '82242267', name: 'CK-WF-04 (05-27 WF)',                    type: 'freezer' },
            { sn: '82242265', name: 'CK-WF-05 (06-19 Side WF)',               type: 'freezer' },
            { sn: '82242266', name: 'CK-WF-06 (06-19 Big WF)',               type: 'freezer' },
        ];
        let linked = 0;
        const now = new Date();
        for (const sensor of SENSORS) {
            const sn   = normalizeSensorId(sensor.sn);
            const unit = await TempMonUnit.findOne({ name: sensor.name }).lean();
            if (!unit) continue;
            await db.collection('lora_devices').updateOne(
                { sensorId: sn },
                {
                    $set: {
                        equipment:     TYPE_TO_EQUIP[sensor.type],
                        tempmonUnitId: String(unit._id),
                        enabled:       true,
                        updatedAt:     now,
                    },
                    $setOnInsert: { sensorId: sn, model: 'TAG08B', alias: sensor.name, createdAt: now },
                },
                { upsert: true }
            );
            linked++;
        }
        console.log(`✓ [TempMon] Linked ${linked} LoRa device(s) → TempMon units in TempLog DB`);
    } catch (err) {
        console.error('✗ [TempMon] seedLoraLinks error:', err.message);
    }
}

// 1. Mongoose — Maintenance Dashboard
const MAINTENANCE_MONGO_URI = process.env.MAINTENANCE_MONGODB_URI || 'mongodb://localhost:27017/central_kitchen_maintenance';
mongoose.connect(MAINTENANCE_MONGO_URI)
    .then(async () => {
        console.log('✓ [Maintenance] MongoDB (Mongoose) connected');
        await seedAdmin();
        await seedTempMonUnits();
    })
    .catch(err => console.error('✗ [Maintenance] MongoDB connection error:', err));

// 2. Native driver — Kitchen Temp Log
const TEMPLOG_MONGO_URI = process.env.TEMPLOG_MONGODB_URI || 'mongodb://localhost:27017';
const TEMPLOG_DB_NAME   = process.env.TEMPLOG_DB_NAME || 'kitchenlog';
let templogDb;

// Build MongoClient options — add serverApi when connecting to Atlas (srv URI)
// Use literal '1' instead of ServerApiVersion.One — the enum value may be undefined
// in some driver versions, causing a MongoParseError that silently kills the connection.
const templogClientOptions = TEMPLOG_MONGO_URI.startsWith('mongodb+srv')
    ? { serverApi: { version: '1', strict: false, deprecationErrors: false } }
    : {};

MongoClient.connect(TEMPLOG_MONGO_URI, templogClientOptions)
    .then(async client => {
        templogDb = client.db(TEMPLOG_DB_NAME);
        console.log(`✓ [TempLog] MongoDB connected (db: ${TEMPLOG_DB_NAME})`);
        // Handle unexpected disconnection
        client.on('close', () => {
            console.warn('⚠️  [TempLog] MongoDB connection closed');
            templogDb = null;
        });
        await seedLoraLinks(templogDb);
    })
    .catch(err => {
        console.error('✗ [TempLog] MongoDB connection error:', err.message);
        console.error('  URI used:', TEMPLOG_MONGO_URI.replace(/:([^@]+)@/, ':***@'));
    });

/**
 * Middleware to ensure TempLog database is ready
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function requireTemplogDb(req, res, next) {
    if (!templogDb) {
        console.error('[TempLog] DB not ready — TEMPLOG_MONGODB_URI may be misconfigured');
        return res.status(503).json({ error: 'TempLog database not ready. Check TEMPLOG_MONGODB_URI env var.' });
    }
    req.templogDb = templogDb;
    next();
}

// ─── Middleware ──────────────────────────────────────────────────────────────


// Prevent caching of HTML files (always get fresh version)
const noCacheHtml = { 
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store');
        }
    }
};

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Static file serving ────────────────────────────────────────────────────
// ─── Public shared assets (no auth required) ──────────────────────────────
app.get('/auth-guard.js', (req, res) => {
  if (process.env.BYPASS_AUTH === 'true') {
    // Serve a no-op guard that immediately reveals the page and sets a fake admin user
    res.setHeader('Content-Type', 'application/javascript');
    return res.send(
      'document.documentElement.style.visibility="";\n' +
      'window._authUser={id:"bypass",username:"bypass",displayName:"Test Admin",' +
      'role:"admin",permissions:{maintenance:true,foodsafety:true,templog:true,procurement:true}};'
    );
  }
  res.sendFile(path.join(__dirname, 'auth-guard.js'));
});
app.use('/css',   express.static(path.join(__dirname, 'public', 'css')));
app.use('/js',    express.static(path.join(__dirname, 'public', 'js')));
app.use('/icons', express.static(path.join(__dirname, 'public', 'icons')));

// PWA manifest and offline page — public, no auth required
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});
app.get('/offline.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'offline.html'));
});

// Service worker — must be served from root with correct scope headers
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Food Safety — requires 'foodsafety' permission
app.use('/foodsafety', requirePageAccess('foodsafety'), express.static(path.join(__dirname, 'foodsafety'), noCacheHtml));
app.get('/foodsafety', requirePageAccess('foodsafety'), (req, res) => res.sendFile(path.join(__dirname, 'foodsafety', 'index.html')));
app.get('/foodsafety/index.html', requirePageAccess('foodsafety'), (req, res) => res.sendFile(path.join(__dirname, 'foodsafety', 'index.html')));
// NC mini-hub — must be before the catch-all below
app.get('/foodsafety/nc',         requirePageAccess('foodsafety'), (req, res) => res.sendFile(path.join(__dirname, 'foodsafety', 'nc.html')));
// Employee Cert & Licence Tracker pages — must be before the catch-all below
app.get('/foodsafety/fhc',        requirePageAccess('foodsafety'), (req, res) => res.sendFile(path.join(__dirname, 'foodsafety', 'fhc.html')));
app.get('/foodsafety/fhc/new',    requirePageAccess('foodsafety'), (req, res) => res.sendFile(path.join(__dirname, 'foodsafety', 'fhc-form.html')));
app.get('/foodsafety/fhc/:id',    requirePageAccess('foodsafety'), (req, res) => res.sendFile(path.join(__dirname, 'foodsafety', 'fhc-form.html')));
app.get(/^\/foodsafety(?!\/uploads)(\/.*)?$/, requirePageAccess('foodsafety'), (req, res) => {
    res.sendFile(path.join(__dirname, 'foodsafety', 'index.html'));
});

// Auth pages — login is always public; admin requires admin role
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.use('/admin', requirePageAccess('__admin__'), express.static(path.join(__dirname, 'admin'), noCacheHtml));
app.get('/admin',  requirePageAccess('__admin__'), (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.get('/admin/', requirePageAccess('__admin__'), (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));

// Push notification test module — admin only
app.use('/push-test', requirePageAccess('__admin__'), express.static(path.join(__dirname, 'push-test'), noCacheHtml));
app.get('/push-test', requirePageAccess('__admin__'), (req, res) => res.sendFile(path.join(__dirname, 'push-test', 'index.html')));
app.get('/push-test/', requirePageAccess('__admin__'), (req, res) => res.sendFile(path.join(__dirname, 'push-test', 'index.html')));

// Hub page — any authenticated user
app.get('/', requirePageAccess(null), (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Maintenance Dashboard — requires 'maintenance' permission
app.use('/maintenance', requirePageAccess('maintenance'), express.static(path.join(__dirname, 'maintenance'), noCacheHtml));

// TempLog — requires 'templog' permission
app.use('/templog', requirePageAccess('templog'), express.static(path.join(__dirname, 'templog'), noCacheHtml));
app.get('/templog', requirePageAccess('templog'), (req, res) => res.sendFile(path.join(__dirname, 'templog', 'index.html')));

// Pest Control — requires 'pest' permission
app.use('/pest', requirePageAccess('pest'), express.static(path.join(__dirname, 'pest'), noCacheHtml));
app.get('/pest',       requirePageAccess('pest'), (req, res) => res.sendFile(path.join(__dirname, 'pest', 'index.html')));
app.get('/pest/',      requirePageAccess('pest'), (req, res) => res.sendFile(path.join(__dirname, 'pest', 'index.html')));

// Equipment Temperature Monitoring — requires 'tempmon' permission
app.use('/tempmon', requirePageAccess('tempmon'), express.static(path.join(__dirname, 'tempmon'), noCacheHtml));
app.get('/tempmon',  requirePageAccess('tempmon'), (req, res) => res.sendFile(path.join(__dirname, 'tempmon', 'index.html')));
app.get('/tempmon/', requirePageAccess('tempmon'), (req, res) => res.sendFile(path.join(__dirname, 'tempmon', 'index.html')));

// ISO Records Keeper — requires 'iso' permission
app.use('/iso', requirePageAccess('iso'), express.static(path.join(__dirname, 'iso'), noCacheHtml));
app.get('/iso',  requirePageAccess('iso'), (req, res) => res.sendFile(path.join(__dirname, 'iso', 'index.html')));
app.get('/iso/', requirePageAccess('iso'), (req, res) => res.sendFile(path.join(__dirname, 'iso', 'index.html')));

// Procurement — requires 'procurement' permission
app.use('/procurement', requirePageAccess('procurement'), express.static(path.join(__dirname, 'procurement'), noCacheHtml));
app.get('/procurement',             requirePageAccess('procurement'), (req, res) => res.sendFile(path.join(__dirname, 'procurement', 'index.html')));
app.get('/procurement/request',     requirePageAccess('procurement'), (req, res) => res.sendFile(path.join(__dirname, 'procurement', 'request-form.html')));
app.get('/procurement/requests',    requirePageAccess('procurement'), (req, res) => res.sendFile(path.join(__dirname, 'procurement', 'requests.html')));
app.get('/procurement/request/:id', requirePageAccess('procurement'), (req, res) => res.sendFile(path.join(__dirname, 'procurement', 'request-detail.html')));

// ─── API Routes ──────────────────────────────────────────────────────────────
// All routes are declared in routes/index.js — add new modules there, not here.
const apiRouter            = require('./routes');
const sendPushToPermission = apiRouter.sendPushToPermission;
app.use('/api', apiRouter);

// POST /api/tempmon/admin/seed — force re-seed all 31 equipment units + LoRa links (admin only)
// Registered after apiRouter so it only fires if the router passes (no conflict with tempmon routes)
app.post('/api/tempmon/admin/seed', requireAuth, requireAdmin, requireTemplogDb, async (req, res) => {
    try {
        await seedTempMonUnits();
        await seedLoraLinks(req.templogDb);
        const TempMonUnit = require('./models/TempMonUnit');
        const units  = await TempMonUnit.countDocuments({ active: true });
        const linked = await req.templogDb.collection('lora_devices')
            .countDocuments({ tempmonUnitId: { $exists: true, $ne: '' } });
        res.json({ ok: true, units, linked });
    } catch (err) {
        console.error('✗ [TempMon] Admin seed HTTP error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// QR code for procurement request form — auto-detects host (works on Railway)
app.get('/api/qr', async (req, res) => {
    try {
        const QRCode = require('qrcode');
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const targetUrl = `${baseUrl}/procurement/request`;
        const qrBuffer = await QRCode.toBuffer(targetUrl, {
            errorCorrectionLevel: 'M',
            type: 'png',
            width: 300,
            margin: 1
        });
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        res.send(qrBuffer);
    } catch (e) {
        console.error('QR generation failed:', e);
        res.status(500).json({ error: 'QR generation failed' });
    }
});

// Public URL (ngrok support)
app.get('/api/public-url', async (req, res) => {
    try {
        const http = require('http');
        const data = await new Promise((resolve, reject) => {
            const r = http.get('http://localhost:4040/api/tunnels', (resp) => {
                let body = '';
                resp.on('data', chunk => body += chunk);
                resp.on('end', () => resolve(JSON.parse(body)));
            });
            r.on('error', reject);
            r.setTimeout(1500, () => reject(new Error('timeout')));
        });
        const tunnel = data.tunnels.find(t => t.proto === 'https') || data.tunnels[0];
        if (tunnel) return res.json({ url: tunnel.public_url, source: 'ngrok' });
    } catch (_) {}
    const lanUrl = process.env.QR_BASE_URL || `http://localhost:${PORT}`;
    res.json({ url: lanUrl, source: 'local' });
});

// Health check
const { isCloudinaryConfigured } = require('./services/cloudinary-upload');
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        maintenance_db:  mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        templog_db:      templogDb ? 'Connected' : 'Disconnected',
        procurement_db:  mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        cloudinary:      isCloudinaryConfigured ? 'Configured' : 'NOT CONFIGURED — photo uploads disabled',
    });
});

// ─── TempLog API Routes (/templog/api/) ─────────────────────────────────────

/**
 * Validate cook data before saving
 * @param {Object} cook - Cook data object
 * @returns {string|null} Error message or null if valid
 */
function validateCook(cook) {
    if (!cook || !cook.food || !cook.staff) return 'Missing required fields';
    if (cook.temp !== undefined && cook.temp !== '' && isNaN(parseFloat(cook.temp))) return 'Invalid temp';
    const traysNum = parseInt(cook.trays, 10);
    if (cook.trays !== undefined && cook.trays !== '' && (isNaN(traysNum) || traysNum < 1)) return 'Invalid trays';
    return null;
}

/**
 * Build MongoDB date filter from query parameters
 * @param {Object} query - Express request query object
 * @returns {Object} MongoDB filter object
 */
function buildDateFilter(query) {
    const { year, month, startDate, endDate } = query;
    if (startDate || endDate) {
        const filter = {};
        if (startDate && endDate)   filter.startDate = { $gte: startDate, $lte: endDate };
        else if (startDate)         filter.startDate = { $gte: startDate };
        else                        filter.startDate = { $lte: endDate };
        return filter;
    }
    if (year && month) {
        const ym = `${year}-${String(month).padStart(2, '0')}`;
        return { startDate: new RegExp(`^${ym}-`) };
    }
    return {};
}

const EQUIPMENT_TEMPERATURES = ['chiller', 'freezer', 'food-warmer'];
const EQUIPMENT_PAGE_URL = '/templog/departments/equipment-temperature.html';

function normalizeEquipmentName(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'food warmer' || raw === 'warmer') return 'food-warmer';
    return raw;
}

function defaultConfigForEquipment(equipment) {
    const base = {
        equipment,
        warningDelayMinutes: 10,
        repeatMinutes: 30,
        pushEnabled: true
    };

    if (equipment === 'freezer') return { ...base, minTemp: -25, maxTemp: -15 };
    if (equipment === 'food-warmer') return { ...base, minTemp: 60, maxTemp: 85 };
    return { ...base, minTemp: 0, maxTemp: 5 };
}

function sanitizeConfigInput(raw, equipment) {
    const config = defaultConfigForEquipment(equipment);
    if (raw.minTemp !== undefined) config.minTemp = Number(raw.minTemp);
    if (raw.maxTemp !== undefined) config.maxTemp = Number(raw.maxTemp);
    if (raw.warningDelayMinutes !== undefined) config.warningDelayMinutes = Number(raw.warningDelayMinutes);
    if (raw.repeatMinutes !== undefined) config.repeatMinutes = Number(raw.repeatMinutes);
    if (raw.pushEnabled !== undefined) config.pushEnabled = !!raw.pushEnabled;

    if (!isFinite(config.minTemp) || !isFinite(config.maxTemp)) return { error: 'Invalid threshold values' };
    if (config.minTemp >= config.maxTemp) return { error: 'minTemp must be lower than maxTemp' };
    if (!Number.isFinite(config.warningDelayMinutes) || config.warningDelayMinutes < 0) return { error: 'Invalid warningDelayMinutes' };
    if (!Number.isFinite(config.repeatMinutes) || config.repeatMinutes < 1) return { error: 'Invalid repeatMinutes' };
    return { config };
}

async function getEquipmentConfig(db, equipment) {
    const saved = await db.collection('equipment_temp_configs').findOne({ equipment });
    return { ...defaultConfigForEquipment(equipment), ...(saved || {}) };
}

function evaluateTemperatureStatus(temp, config) {
    if (temp < config.minTemp) return { status: 'low', outOfRange: true };
    if (temp > config.maxTemp) return { status: 'high', outOfRange: true };
    return { status: 'normal', outOfRange: false };
}

const equipmentTempSseClients = new Set();

function sendSse(res, event, payload) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcastEquipmentTemperature(event, payload) {
    for (const res of equipmentTempSseClients) {
        try { sendSse(res, event, payload); } catch (_) {}
    }
}

// TempLog equipment-temperature alerts disabled — all temperature monitoring alerts
// are handled exclusively by the TempMon module.
async function processEquipmentAlarm(_req, _reading, _config) {}

async function ingestEquipmentReadings(req, readings) {
    if (!Array.isArray(readings) || readings.length === 0) return { count: 0, processed: [] };

    // Normalize equipment name so legacy 'warmer' entries are treated as 'food-warmer'
    const normalized = readings.map(r => ({ ...r, equipment: normalizeEquipmentName(r.equipment) }));
    await req.templogDb.collection('equipment_temp_readings').insertMany(normalized);

    const processed = [];
    for (const reading of normalized) {
        const config = await getEquipmentConfig(req.templogDb, reading.equipment);
        const status = evaluateTemperatureStatus(reading.temp, config);
        broadcastEquipmentTemperature('reading', { ...reading, ...status, config });
        await processEquipmentAlarm(req, reading, config);
        processed.push({ ...reading, ...status, config });
    }
    return { count: readings.length, processed };
}

/**
 * GET /templog/api/equipment-temp/config
 * Load configuration for all equipment or one target equipment
 */
app.get('/templog/api/equipment-temp/config', requireTemplogDb, async (req, res) => {
    try {
        const equipment = normalizeEquipmentName(req.query.equipment);
        if (equipment) {
            if (!EQUIPMENT_TEMPERATURES.includes(equipment)) return res.status(400).json({ error: 'Invalid equipment' });
            return res.json(await getEquipmentConfig(req.templogDb, equipment));
        }

        const all = await Promise.all(EQUIPMENT_TEMPERATURES.map(async (item) => getEquipmentConfig(req.templogDb, item)));
        res.json(all);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /templog/api/equipment-temp/config/:equipment
 * Save thresholds / warning settings for one equipment
 */
app.put('/templog/api/equipment-temp/config/:equipment', requireTemplogDb, async (req, res) => {
    try {
        const equipment = normalizeEquipmentName(req.params.equipment);
        if (!EQUIPMENT_TEMPERATURES.includes(equipment)) return res.status(400).json({ error: 'Invalid equipment' });
        const parsed = sanitizeConfigInput(req.body || {}, equipment);
        if (parsed.error) return res.status(400).json({ error: parsed.error });

        const doc = {
            ...parsed.config,
            updatedAt: new Date()
        };
        await req.templogDb.collection('equipment_temp_configs').updateOne(
            { equipment },
            { $set: doc },
            { upsert: true }
        );
        res.json({ ok: true, config: doc });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /templog/api/equipment-temp/readings
 * Ingest IoT gateway or single thermometer reading(s)
 */
app.post('/templog/api/equipment-temp/readings', requireTemplogDb, async (req, res) => {
    try {
        const payload = req.body || {};
        const incoming = Array.isArray(payload.readings) ? payload.readings : [payload];
        const valid = [];

        for (const raw of incoming) {
            const equipment = normalizeEquipmentName(raw.equipment);
            const temp = Number(raw.temp);
            if (!EQUIPMENT_TEMPERATURES.includes(equipment)) continue;
            if (!Number.isFinite(temp)) continue;
            const recordedAt = raw.recordedAt ? new Date(raw.recordedAt) : new Date();
            if (isNaN(recordedAt.getTime())) continue;

            valid.push({
                equipment,
                temp,
                source: String(raw.source || payload.source || 'iot-gateway'),
                gatewayId: String(raw.gatewayId || payload.gatewayId || ''),
                sensorId: String(raw.sensorId || ''),
                recordedAt,
                createdAt: new Date()
            });
        }

        if (!valid.length) return res.status(400).json({ error: 'No valid readings provided' });

        const result = await ingestEquipmentReadings(req, valid);
        res.json({ ok: true, count: result.count });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

// ─── TempMon models (same Mongoose connection as maintenance DB) ─────────────
const TempMonUnit    = require('./models/TempMonUnit');
const TempMonDevice  = require('./models/TempMonDevice');
const TempMonReading = require('./models/TempMonReading');
const TempMonAlert   = require('./models/TempMonAlert');
const TempMonConfig  = require('./models/TempMonConfig');
const { updateWarmerState: tmUpdateWarmerState } = require('./routes/tempmon');

// ── Push config cache (shared with routes/tempmon via same mongoose connection) ──
let _svPushConfigCache = null;
let _svPushConfigCacheTs = 0;
async function getSvPushConfig() {
    const now = Date.now();
    if (_svPushConfigCache && now - _svPushConfigCacheTs < 5 * 60 * 1000) return _svPushConfigCache;
    const cfg = await TempMonConfig.findOneAndUpdate(
        { key: 'global' },
        { $setOnInsert: { key: 'global' } },
        { upsert: true, new: true }
    );
    _svPushConfigCache = cfg;
    _svPushConfigCacheTs = now;
    return cfg;
}

// Map LoRa device unit type to TempLog equipment name (for backward compat)
const UNIT_TYPE_TO_EQUIPMENT = { freezer: 'freezer', chiller: 'chiller', warmer: 'food-warmer' };

/**
 * Forward a LoRa tag reading into the TempMon system (TempMonReading + alert logic)
 * whenever a lora_device document has a tempmonUnitId set.
 */
async function forwardToTempMon(loraDevice, sensorRow, gatewayId) {
    if (!loraDevice.tempmonUnitId) {
        // Sensor registered without a linked TempMon unit — readings stay in TempLog only.
        // Go to /tempmon/gateway.html and click ✏️ on the sensor to link it to a unit.
        return;
    }
    try {
        const unitId = loraDevice.tempmonUnitId;
        const unit = await TempMonUnit.findById(unitId);
        if (!unit) {
            console.warn(`[TempMon] Unit ${unitId} not found for sensor ${sensorRow.sensorId}. Re-link on gateway.html.`);
            return;
        }
        if (!unit.active) {
            console.warn(`[TempMon] Unit "${unit.name}" is inactive — skipping reading for ${sensorRow.sensorId}.`);
            return;
        }

        // Find or auto-create a TempMonDevice for this LoRa sensor
        let tmDevice = await TempMonDevice.findOne({ deviceId: sensorRow.sensorId });
        if (!tmDevice) {
            tmDevice = new TempMonDevice({
                unit:     unit._id,
                deviceId: sensorRow.sensorId,
                label:    loraDevice.alias || loraDevice.sensorId,
                active:   true
            });
            await tmDevice.save();
            console.log(`✓ [TempMon] Auto-created device for LoRa sensor ${sensorRow.sensorId} → unit "${unit.name}"`);
        } else if (String(tmDevice.unit) !== String(unit._id)) {
            // Unit linkage changed — update
            tmDevice.unit = unit._id;
            await tmDevice.save();
        }

        // Update heartbeat
        tmDevice.lastSeenAt = new Date();
        await tmDevice.save();

        // Store reading
        const flagged = sensorRow.temp < unit.criticalMin || sensorRow.temp > unit.criticalMax;
        const readingData = {
            device:     tmDevice._id,
            unit:       unit._id,
            value:      sensorRow.temp,
            recordedAt: sensorRow.recordedAt || new Date(),
            receivedAt: new Date(),
            gatewayId:  gatewayId || '',
            flagged
        };
        if (sensorRow.humidity != null) readingData.humidity = sensorRow.humidity;
        if (sensorRow.rssi    != null) readingData.rssi    = sensorRow.rssi;
        if (sensorRow.battery != null) readingData.battery = sensorRow.battery;
        // One reading per (device, 15-min slot) — if one already exists for this slot,
        // overwrite it with the latest value rather than storing a second row.
        const existingInSlot = await TempMonReading.findOne({ device: tmDevice._id, recordedAt: readingData.recordedAt });
        if (existingInSlot) {
            if (existingInSlot.value === sensorRow.temp) {
                console.log(`[TempMon] Skipping duplicate reading: ${sensorRow.sensorId} @ ${readingData.recordedAt}`);
                return;
            }
            // Same slot, different value (two transmissions snapped to same boundary) — overwrite
            await TempMonReading.updateOne({ _id: existingInSlot._id }, { $set: { value: sensorRow.temp, humidity: readingData.humidity, rssi: readingData.rssi, battery: readingData.battery, flagged, receivedAt: readingData.receivedAt } });
            console.log(`[TempMon] Updated slot reading: ${sensorRow.sensorId} @ ${readingData.recordedAt} → ${sensorRow.temp}°C`);
            return;
        }

        const reading = new TempMonReading(readingData);
        await reading.save();
        const rhStr  = sensorRow.humidity != null ? ` RH:${sensorRow.humidity}%` : '';
        const batStr = sensorRow.battery  != null ? ` Bat:${sensorRow.battery}V`  : '';
        console.log(`✓ [TempMon] Reading saved: ${sensorRow.sensorId} → "${unit.name}" ${sensorRow.temp}°C${rhStr}${batStr}${flagged ? ' ⚠️ FLAGGED' : ''}`);

        // Update warmer power state (on/off/fault detection) — no-op for non-warmer units
        await tmUpdateWarmerState(unit, tmDevice, sensorRow.temp, readingData.recordedAt);

        // Alert logic
        const alertType = tmEvaluateAlertType(sensorRow.temp, unit);
        if (alertType) {
            await tmMaybeCreateAlert(unit, tmDevice, reading._id, alertType, sensorRow.temp, readingData.recordedAt);
        } else {
            // Clear in-memory excursion timers so the next excursion starts a fresh countdown
            if (global._tempmonExcursionStart) {
                const prefix = String(unit._id) + '_';
                Object.keys(global._tempmonExcursionStart).forEach(k => {
                    if (k.startsWith(prefix)) delete global._tempmonExcursionStart[k];
                });
            }
            await TempMonAlert.updateMany(
                { unit: unit._id, type: { $in: ['critical_high', 'critical_low', 'warning_high', 'warning_low'] }, status: { $in: ['open', 'acknowledged'] } },
                { $set: { status: 'resolved', resolvedAt: new Date(), resolveNote: 'Temperature returned to normal range automatically' } }
            );
        }
    } catch (e) {
        if (e.code === 11000) {
            // Unique index violation — concurrent duplicate, safe to ignore
            console.log(`[TempMon] Duplicate reading race (ignored): ${sensorRow.sensorId} @ ${readingData?.recordedAt}`);
        } else {
            console.error(`[TempMon] forwardToTempMon error for ${sensorRow.sensorId}:`, e.message);
        }
    }
}

function tmEvaluateAlertType(value, unit) {
    // Warmers are monitored exclusively by the fault-state machine — no temperature range alerts
    if (unit.type === 'warmer') return null;
    const { criticalMin, criticalMax, warningBuffer = 2 } = unit;
    if (value < criticalMin)                 return 'critical_low';
    if (value > criticalMax)                 return 'critical_high';
    if (value < criticalMin + warningBuffer) return 'warning_low';
    if (value > criticalMax - warningBuffer) return 'warning_high';
    return null;
}

function tmBuildAlertLabel(type, value, unit) {
    return type === 'critical_high' ? `CRITICAL HIGH — ${value}°C (max ${unit.criticalMax}°C)`
         : type === 'critical_low'  ? `CRITICAL LOW — ${value}°C (min ${unit.criticalMin}°C)`
         : type === 'warning_high'  ? `Warning — temperature rising to ${value}°C`
         :                            `Warning — temperature dropping to ${value}°C`;
}

async function tmMaybeCreateAlert(unit, device, readingId, type, value, readingTs) {
    // Skip alert creation entirely when unit is marked as not in use
    if (unit.inUse === false) return;

    // Check for existing open/acknowledged alert (handles server restarts)
    const existing = await TempMonAlert.findOne({ unit: unit._id, type, status: { $in: ['open', 'acknowledged'] } });
    if (existing) return; // already alerted — no duplicate

    // Load push delays from DB config (cached 5 min)
    const cfg = await getSvPushConfig();
    const thresholdMs = type.startsWith('critical_')
        ? (cfg.pushDelayCriticalMinutes || 60) * 60 * 1000
        : (cfg.pushDelayWarningMinutes  || 120) * 60 * 1000;
    const thresholdLabel = type.startsWith('critical_')
        ? `${cfg.pushDelayCriticalMinutes || 60} min`
        : `${cfg.pushDelayWarningMinutes  || 120} min`;

    // Use the reading's own recordedAt so buffered readings from distant sensors
    // are evaluated against sensor-time, not server-arrival-time.
    const ts = (readingTs instanceof Date ? readingTs : new Date(readingTs || Date.now())).getTime();

    // In-memory excursion tracker
    if (!global._tempmonExcursionStart) global._tempmonExcursionStart = {};
    const key = `${unit._id}_${type}`;

    if (!global._tempmonExcursionStart[key]) {
        global._tempmonExcursionStart[key] = ts;
        return; // start timer using sensor timestamp, no alert yet
    }

    const elapsedMs = ts - global._tempmonExcursionStart[key];
    if (elapsedMs < thresholdMs) return; // still within grace period

    // Threshold exceeded — create alert record and send push immediately
    const alert = new TempMonAlert({
        unit: unit._id, device: device._id, reading: readingId, type, value,
        pushSentAt:       new Date(),
        notificationSent: true
    });
    await alert.save();

    if (typeof sendPushToPermission === 'function') {
        sendPushToPermission('tempmon', {
            title:   `${type.startsWith('critical') ? '🔴' : '🟡'} ${unit.name}: ${tmBuildAlertLabel(type, value, unit)}`,
            message: `Temperature has been out of range for ${thresholdLabel}. Check the unit.`,
            url:     '/tempmon/alerts.html'
        }).catch(() => {});
    }
}

const LORA_SUPPORTED_MODELS = ['TAG07', 'TAG08B', 'TAG08L', 'TAG09'];

function normalizeLoraModel(value) {
    const model = String(value || '').trim().toUpperCase();
    if (!model) return '';
    if (model === 'TAG08(B-L)' || model === 'TAG08' || model === 'TAG08B-L') return 'TAG08B';
    if (model === 'TAG08L') return 'TAG08L';
    if (model === 'TAG09') return 'TAG09';
    if (model === 'TAG07') return 'TAG07';
    // SDK HardwareType may include full strings like "TAG08B" or "TAG08(B-L)"
    if (model.startsWith('TAG08')) return model.includes('L') ? 'TAG08L' : 'TAG08B';
    if (model.startsWith('TAG09')) return 'TAG09';
    if (model.startsWith('TAG07')) return 'TAG07';
    return model;
}

function normalizeSensorId(value) {
    const s = String(value || '').trim().toUpperCase();
    // TZONE TAG sensor IDs are always 8 BCD digits from the wire (4 bytes × 2 nibbles).
    // Pad pure-numeric IDs shorter than 8 digits so wire IDs match stored ones.
    if (/^\d+$/.test(s) && s.length < 8) return s.padStart(8, '0');
    return s;
}

function parseRecordedAt(value) {
    if (value === undefined || value === null || value === '') return new Date();
    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = value > 1e12 ? value : value * 1000;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? new Date() : d;
    }
    const str = String(value).trim();
    // Handle compact YYMMDDHHmmss format from gateway RTC e.g. "260311022033" = 2026-03-11 02:20:33 UTC
    const compact = str.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
    if (compact) {
        const [, yy, mo, dd, hh, mm, ss] = compact;
        const d = new Date(Date.UTC(2000 + parseInt(yy, 10), parseInt(mo, 10) - 1, parseInt(dd, 10), parseInt(hh, 10), parseInt(mm, 10), parseInt(ss, 10)));
        return isNaN(d.getTime()) ? new Date() : d;
    }
    const numeric = Number(str);
    if (Number.isFinite(numeric) && str.match(/^\d+$/)) {
        const ms = numeric > 1e12 ? numeric : numeric * 1000;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? new Date() : d;
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? new Date() : d;
}

function pickFirst(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
    }
    return undefined;
}

function extractLoraSensorRows(payload) {
    const rows = [];
    const sourceRoot = payload && typeof payload === 'object' ? payload : {};

    // The HTTP gateway wraps sensor data in payload.data.tag07 (or tag08b, tag09, etc.)
    // The key name ("tag07") encodes the sensor model type.
    // Collect ALL tag* arrays — a single payload may contain multiple model types.
    const tagGroups = []; // [{rows, model}]
    const dataBlob = sourceRoot.data;
    if (dataBlob && typeof dataBlob === 'object' && !Array.isArray(dataBlob)) {
        for (const [k, v] of Object.entries(dataBlob)) {
            if (Array.isArray(v) && /^tag/i.test(k)) {
                tagGroups.push({ rows: v, model: normalizeLoraModel(k) });
            }
        }
    }

    // Fall back to top-level array candidates ONLY if the payload has no data{} envelope.
    // If data{} was present but had no tag* arrays, this is a gateway heartbeat/status
    // message (e.g. data:{alert,gsm,bat}) — do NOT treat sn/imei as a sensor ID.
    const hasDataEnvelope = dataBlob && typeof dataBlob === 'object' && !Array.isArray(dataBlob);
    if (tagGroups.length === 0 && !hasDataEnvelope) {
        const candidates = [
            sourceRoot.TagList, sourceRoot.SensorList,
            sourceRoot.tagList, sourceRoot.taglist,
            sourceRoot.tags,    sourceRoot.readings,
            sourceRoot.sensors, sourceRoot.items,
            Array.isArray(payload) ? payload : null
        ].filter(Array.isArray);
        if (candidates.length > 0) tagGroups.push({ rows: candidates[0], model: '' });
    }

    for (const group of tagGroups) {
        const inferredModel = group.model;
        for (const row of group.rows) {
        if (!row || typeof row !== 'object') continue;
        // HTTP: sensor ID = 'id'; SDK/TCP: 'SN'; others: 'sensorId', 'sn', etc.
        const sensorId = normalizeSensorId(
            pickFirst(row, ['id', 'sensorId', 'sensorID', 'sensor_id', 'SN', 'sn', 'tagId', 'deviceId', 'mac'])
        );
        const rawTemp = pickFirst(row, ['temp', 'temperature', 'Temperature', 'Temp', 'T']);
        const temp = Number(rawTemp);
        if (!sensorId) continue;

        // HTTP: 'humi'; SDK/TCP: 'Humidity'
        const humidityValue = pickFirst(row, ['humi', 'humidity', 'Humidity', 'H']);
        const humidity = Number(humidityValue);
        const rssiValue = pickFirst(row, ['rssi', 'RSSI']);
        const rssi = Number(rssiValue);
        // HTTP: 'bat'; TCP/SDK: 'bat', 'battery', 'Battery'
        const batteryValue = pickFirst(row, ['bat', 'battery', 'Battery', 'BAT', 'batt']);
        const battery = Number(batteryValue);
        const model = normalizeLoraModel(
            pickFirst(row, ['model', 'deviceModel', 'tagModel', 'HardwareType', 'hardwareType', 'TagType'])
        ) || inferredModel;

        rows.push({
            sensorId,
            temp: Number.isFinite(temp) ? temp : null,
            // SDK: Humidity == -1000 means not present/null
            humidity: Number.isFinite(humidity) && humidity !== -1000 ? humidity : null,
            rssi: Number.isFinite(rssi) ? rssi : null,
            battery: Number.isFinite(battery) && battery > 0 ? battery : null,
            model: model || '',
            recordedAt: parseRecordedAt(
                pickFirst(row, ['recordedAt', 'time', 'timestamp', 'rtc', 'RTC'])
                || sourceRoot.rtc || sourceRoot.RTC || sourceRoot.recordedAt
            ),
            raw: row
        });
        }
    }

    // Deduplicate: sensors transmit every 15 minutes by default.  Keep at most one reading
    // per sensor per 15-minute window and snap its timestamp to the START of that window
    // (e.g. a reading at 10:02:33 is stored as 10:00:00).  This produces a clean, regular
    // time-series — one entry per slot — regardless of the exact sensor fire-time offset.
    const BUCKET_MS = 15 * 60 * 1000;
    const deduped = new Map();
    for (const r of rows) {
        const bucketStart = Math.floor(new Date(r.recordedAt).getTime() / BUCKET_MS) * BUCKET_MS;
        deduped.set(r.sensorId + '|' + bucketStart, { ...r, recordedAt: new Date(bucketStart) });
    }
    return [...deduped.values()];
}

function parseLoraGatewayId(payload) {
    const root = payload && typeof payload === 'object' ? payload : {};
    const value = pickFirst(root, ['gatewayId', 'gatewayID', 'gateway', 'imei', 'IMEI', 'serial', 'Serial', 'gw']);
    return String(value || '').trim();
}

function validateLoraIngestAuth(req) {
    const token = process.env.LORA_HTTP_TOKEN;
    if (!token) return true;
    const supplied = String(req.headers['x-lora-token'] || req.query.token || req.body?.token || '');
    return supplied && supplied === token;
}

/**
 * GET /templog/api/lora/devices
 * List registered TAG devices and their mapping targets
 */
app.get('/templog/api/lora/devices', requireTemplogDb, async (req, res) => {
    try {
        const docs = await req.templogDb.collection('lora_devices')
            .find({})
            .sort({ createdAt: -1 })
            .toArray();
        res.json(docs);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /templog/api/lora/devices
 * Register a TAG08B/TAG09 device mapping
 */
app.post('/templog/api/lora/devices', requireTemplogDb, async (req, res) => {
    try {
        const sensorId = normalizeSensorId(req.body.sensorId);
        const model = normalizeLoraModel(req.body.model);
        const alias = String(req.body.alias || '').trim();
        const notes = String(req.body.notes || '').trim();

        if (!sensorId) return res.status(400).json({ error: 'sensorId is required' });
        if (!LORA_SUPPORTED_MODELS.includes(model)) return res.status(400).json({ error: 'Unsupported model. Use TAG07/TAG08B/TAG08L/TAG09' });

        // Support linking directly to a TempMon unit (preferred) OR the legacy generic type
        let equipment = normalizeEquipmentName(req.body.equipment);
        let tempmonUnitId = req.body.tempmonUnitId || null;

        if (tempmonUnitId) {
            // Validate the unit exists and derive equipment type from it
            const unit = await TempMonUnit.findById(tempmonUnitId).lean();
            if (!unit) return res.status(400).json({ error: 'TempMon unit not found' });
            equipment = UNIT_TYPE_TO_EQUIPMENT[unit.type] || equipment;
            tempmonUnitId = String(unit._id);
        } else {
            if (!EQUIPMENT_TEMPERATURES.includes(equipment)) return res.status(400).json({ error: 'Invalid equipment mapping — provide a valid tempmonUnitId or equipment type' });
        }

        const now = new Date();
        const doc = {
            sensorId,
            model,
            equipment,
            tempmonUnitId: tempmonUnitId || null,
            alias,
            notes,
            enabled: req.body.enabled !== false,
            updatedAt: now
        };

        await req.templogDb.collection('lora_devices').updateOne(
            { sensorId },
            { $set: doc, $setOnInsert: { createdAt: now } },
            { upsert: true }
        );

        // Immediately sync TempMonDevice so TempMon setup page reflects the registration
        if (tempmonUnitId) {
            await TempMonDevice.findOneAndUpdate(
                { deviceId: sensorId },
                { $set: { unit: tempmonUnitId, label: alias || sensorId, active: true } },
                { upsert: true, setDefaultsOnInsert: true }
            );
        }

        res.json({ ok: true, device: doc });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /templog/api/lora/devices/:sensorId
 * Update device mapping or enable/disable state
 */
app.put('/templog/api/lora/devices/:sensorId', requireTemplogDb, async (req, res) => {
    try {
        const sensorId = normalizeSensorId(req.params.sensorId);
        if (!sensorId) return res.status(400).json({ error: 'Invalid sensorId' });

        const update = { updatedAt: new Date() };
        if (req.body.model !== undefined) {
            const model = normalizeLoraModel(req.body.model);
            if (model && !LORA_SUPPORTED_MODELS.includes(model)) return res.status(400).json({ error: 'Unsupported model' });
            update.model = model;
        }
        // Allow linking/unlinking a TempMon unit
        if (req.body.tempmonUnitId !== undefined) {
            if (req.body.tempmonUnitId === null || req.body.tempmonUnitId === '') {
                update.tempmonUnitId = null;
            } else {
                const unit = await TempMonUnit.findById(req.body.tempmonUnitId).lean();
                if (!unit) return res.status(400).json({ error: 'TempMon unit not found' });
                update.tempmonUnitId = String(unit._id);
                // Sync equipment type for backward compat
                update.equipment = UNIT_TYPE_TO_EQUIPMENT[unit.type] || update.equipment;
            }
        }
        if (req.body.equipment !== undefined && req.body.tempmonUnitId === undefined) {
            const equipment = normalizeEquipmentName(req.body.equipment);
            if (!EQUIPMENT_TEMPERATURES.includes(equipment)) return res.status(400).json({ error: 'Invalid equipment mapping' });
            update.equipment = equipment;
        }
        if (req.body.alias !== undefined) update.alias = String(req.body.alias || '').trim();
        if (req.body.notes !== undefined) update.notes = String(req.body.notes || '').trim();
        if (req.body.enabled !== undefined) update.enabled = !!req.body.enabled;

        const result = await req.templogDb.collection('lora_devices').updateOne(
            { sensorId },
            { $set: update }
        );
        if (!result.matchedCount) return res.status(404).json({ error: 'Device not found' });

        // Sync TempMonDevice immediately so TempMon setup page reflects the unit change
        if (update.tempmonUnitId !== undefined) {
            if (update.tempmonUnitId === null) {
                await TempMonDevice.updateOne({ deviceId: sensorId }, { $set: { active: false } });
            } else {
                await TempMonDevice.findOneAndUpdate(
                    { deviceId: sensorId },
                    { $set: { unit: update.tempmonUnitId, active: true } },
                    { upsert: true, setDefaultsOnInsert: true }
                );
            }
        }

        const device = await req.templogDb.collection('lora_devices').findOne({ sensorId });
        res.json({ ok: true, device });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /templog/api/lora/devices/:sensorId
 * Remove a registered TAG device mapping
 */
app.delete('/templog/api/lora/devices/:sensorId', requireTemplogDb, async (req, res) => {
    try {
        const sensorId = normalizeSensorId(req.params.sensorId);
        if (!sensorId) return res.status(400).json({ error: 'Invalid sensorId' });

        const result = await req.templogDb.collection('lora_devices').deleteOne({ sensorId });
        if (!result.deletedCount) return res.status(404).json({ error: 'Device not found' });
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/lora/tcp-log
 * Download or view the in-memory TCP diagnostic log.
 * ?format=json  → JSON array of the last N entries
 * ?format=text  → plain text, one JSON line per entry (default, triggers download)
 * ?limit=N      → how many entries to return (default 200, max 500)
 */
app.get('/templog/api/lora/tcp-log', requirePageAccess('tempmon'), (req, res) => {
    const limit  = Math.max(1, Math.min(TCP_LOG_MAX, parseInt(req.query.limit || '200', 10)));
    const format = req.query.format || 'text';
    const slice  = loraTcpLog.slice(-limit);
    if (format === 'json') {
        return res.json(slice);
    }
    // Plain text download — one JSON object per line
    const body = slice.map(e => JSON.stringify(e)).join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lora-tcp-${new Date().toISOString().slice(0,10)}.log"`);
    res.send(body);
});

/**
 * GET /templog/api/lora/tcp-config
 * Returns the TCP connection details to display in the gateway UI.
 * On Railway, LORA_TCP_PROXY_HOST/PORT override the browser hostname.
 */
app.get('/templog/api/lora/tcp-config', requirePageAccess('tempmon'), (req, res) => {
    // Manual overrides take precedence, then Railway's auto-injected TCP proxy vars
    const proxyHost = process.env.LORA_TCP_PROXY_HOST || process.env.RAILWAY_TCP_PROXY_DOMAIN || '';
    const proxyPort = parseInt(process.env.LORA_TCP_PROXY_PORT || process.env.RAILWAY_TCP_PROXY_PORT || '0', 10);
    const internalPort = LORA_TCP_PORT;
    if (proxyHost && proxyPort) {
        res.json({ host: proxyHost, port: proxyPort, via: 'railway-proxy' });
    } else {
        // Local / LAN — client will use its own logic for host; just send port
        res.json({ host: null, port: internalPort, via: 'direct' });
    }
});

/**
 * GET /templog/api/lora/events
 * Recent raw gateway receive records for troubleshooting
 */
app.get('/templog/api/lora/events', requireTemplogDb, async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
        const events = await req.templogDb.collection('lora_gateway_events')
            .find({})
            .sort({ receivedAt: -1 })
            .limit(limit)
            .toArray();
        res.json(events);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/lora/status
 * Returns live status for all registered devices — latest reading, last seen, battery, signal
 */
app.get('/templog/api/lora/status', requireTemplogDb, async (req, res) => {
    try {
        const devices = await req.templogDb.collection('lora_devices').find({}).toArray();
        if (!devices.length) return res.json([]);

        // Scan recent gateway events to find latest reading per sensor
        const scanLimit = Math.max(50, Math.min(1000, parseInt(req.query.scan || '500', 10)));
        const events = await req.templogDb.collection('lora_gateway_events')
            .find({})
            .sort({ receivedAt: -1 })
            .limit(scanLimit)
            .toArray();

        // Build map: sensorId -> latest data from raw payload
        const latest = new Map();
        for (const ev of events) {
            const data = ev.payload && ev.payload.data ? ev.payload.data : {};
            for (const [k, v] of Object.entries(data)) {
                if (!Array.isArray(v) || !/^tag/i.test(k)) continue;
                for (const s of v) {
                    if (!s || !s.id) continue;
                    const sid = normalizeSensorId(s.id);
                    if (latest.has(sid)) continue; // already have newer
                    latest.set(sid, {
                        temp: s.temp,
                        humidity: s.humi != null ? s.humi : null,
                        battery: s.bat != null ? s.bat : null,
                        rssi: s.rssi != null ? s.rssi : null,
                        lastSeen: ev.receivedAt,
                        tagKey: k
                    });
                }
            }
        }

        const result = devices.map(d => {
            const sid = normalizeSensorId(d.sensorId);
            const live = latest.get(sid);
            const lastSeen = live ? new Date(live.lastSeen) : null;
            const ageMs = lastSeen ? Date.now() - lastSeen.getTime() : null;
            let status = 'offline';
            if (ageMs !== null) {
                if (ageMs < 10 * 60 * 1000) status = 'active';
                else if (ageMs < 30 * 60 * 1000) status = 'delayed';
            }
            return {
                sensorId: d.sensorId,
                model: d.model,
                equipment: d.equipment,
                tempmonUnitId: d.tempmonUnitId || null,
                alias: d.alias || '',
                enabled: d.enabled,
                status,
                temp: live ? live.temp : null,
                humidity: live ? live.humidity : null,
                battery: live ? live.battery : null,
                rssi: live ? live.rssi : null,
                lastSeen: live ? live.lastSeen : null
            };
        });
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/lora/discover
 * Scans recent gateway events and returns sensor IDs seen but not yet registered
 */
app.get('/templog/api/lora/discover', requireTemplogDb, async (req, res) => {
    try {
        const scanLimit = Math.max(10, Math.min(500, parseInt(req.query.scan || '200', 10)));
        const hours = Math.max(1, Math.min(720, parseFloat(req.query.hours || '24')));
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        const events = await req.templogDb.collection('lora_gateway_events')
            .find({ unmatchedCount: { $gt: 0 }, receivedAt: { $gte: since } })
            .sort({ receivedAt: -1 })
            .limit(scanLimit)
            .toArray();

        // Aggregate unmatched sensors: keep latest reading per sensorId
        const byId = new Map();
        for (const ev of events) {
            for (const u of (ev.unmatched || [])) {
                if (!u.sensorId) continue;
                const existing = byId.get(u.sensorId);
                const evTime = new Date(ev.receivedAt).getTime();
                if (!existing || evTime > existing.lastSeen) {
                    byId.set(u.sensorId, {
                        sensorId:  u.sensorId,
                        model:     u.model || '',
                        lastTemp:  u.temp,
                        lastSeen:  ev.receivedAt,
                        gatewayId: ev.gatewayId || '',
                        seenCount: (existing ? existing.seenCount : 0) + 1
                    });
                } else {
                    existing.seenCount++;
                }
            }
        }

        // Exclude already-registered sensor IDs
        const registered = await req.templogDb.collection('lora_devices')
            .find({}, { projection: { sensorId: 1 } }).toArray();
        const registeredIds = new Set(registered.map(r => normalizeSensorId(r.sensorId)));

        const unregistered = [...byId.values()]
            .filter(s => !registeredIds.has(normalizeSensorId(s.sensorId)))
            .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

        res.json({ sensors: unregistered, scannedEvents: events.length });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /templog/api/lora/receive
 * HTTP entrypoint for LoRa WiFi gateway payloads
 */
app.post('/templog/api/lora/receive', requireTemplogDb, async (req, res) => {
    try {
        if (!validateLoraIngestAuth(req)) return res.status(401).json({ error: 'Invalid token' });

        const payload = req.body || {};
        const gatewayId = parseLoraGatewayId(payload);
        const sensorRows = extractLoraSensorRows(payload);
        const now = new Date();

        const devices = await req.templogDb.collection('lora_devices').find({}).toArray();
        const enabledMap = new Map(
            devices
                .filter(d => d.enabled !== false)
                .map(d => [normalizeSensorId(d.sensorId), d])
        );
        const allMap = new Map(devices.map(d => [normalizeSensorId(d.sensorId), d]));
        const mappedReadings = [];
        const unmatched = [];

        for (const row of sensorRows) {
            const mapped = enabledMap.get(row.sensorId);
            if (!Number.isFinite(row.temp)) {
                unmatched.push({
                    sensorId: row.sensorId,
                    temp: null,
                    model: row.model || '',
                    reason: 'invalid_temp',
                    recordedAt: row.recordedAt
                });
                continue;
            }
            if (!mapped) {
                unmatched.push({
                    sensorId: row.sensorId,
                    temp: row.temp,
                    model: row.model || '',
                    reason: allMap.has(row.sensorId) ? 'disabled' : 'unregistered',
                    recordedAt: row.recordedAt
                });
                continue;
            }
            mappedReadings.push({
                equipment: mapped.equipment,
                temp: row.temp,
                source: 'lora-http-gateway',
                gatewayId,
                sensorId: row.sensorId,
                model: mapped.model || row.model || '',
                humidity: row.humidity,
                rssi: row.rssi,
                battery: row.battery,
                // row.recordedAt is already snapped to the 15-min bucket start by
                // extractLoraSensorRows.  Accept it only when it is within ±2 hours of the
                // server clock (guards against timezone-confused HTTP gateways whose RTC is
                // e.g. MYT = UTC+8 → 8 h ahead).  Fall back to server receipt time,
                // also snapped to the 15-min boundary, for rejected or missing RTCs.
                recordedAt: (function() {
                    const INTERVAL_MS = 15 * 60 * 1000;
                    const sensorTs = row.recordedAt; // Date snapped to 15-min boundary
                    if (sensorTs && Math.abs(new Date(sensorTs).getTime() - now.getTime()) < 2 * 60 * 60 * 1000) {
                        return new Date(sensorTs).toISOString();
                    }
                    // Gateway RTC absent or timezone-confused — use server receipt time snapped
                    return new Date(Math.floor(now.getTime() / INTERVAL_MS) * INTERVAL_MS).toISOString();
                })(),
                createdAt: now,
                _loraDevice: mapped   // carry device doc for TempMon forwarding
            });
        }

        let ingested = 0;
        if (mappedReadings.length) {
            // Forward to TempMon for any sensor linked to a unit (before stripping _loraDevice)
            await Promise.all(mappedReadings.map(r => forwardToTempMon(r._loraDevice, { sensorId: r.sensorId, temp: r.temp, humidity: r.humidity, rssi: r.rssi, battery: r.battery, recordedAt: r.recordedAt }, gatewayId)));

            // Strip internal helper field before inserting into TempLog collection
            const cleanReadings = mappedReadings.map(({ _loraDevice, ...rest }) => rest);
            const result = await ingestEquipmentReadings(req, cleanReadings);
            ingested = result.count;
        }

        await req.templogDb.collection('lora_gateway_events').insertOne({
            gatewayId,
            sensorCount: sensorRows.length,
            ingestedCount: ingested,
            unmatchedCount: unmatched.length,
            unmatched,
            payload,
            receivedAt: now
        });

        res.json({
            ok: true,
            gatewayId,
            received: sensorRows.length,
            ingested,
            unmatched
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/equipment-temp/readings
 * Returns trend readings for a selected equipment
 */
app.get('/templog/api/equipment-temp/readings', requireTemplogDb, async (req, res) => {
    try {
        const equipment = normalizeEquipmentName(req.query.equipment);
        if (!EQUIPMENT_TEMPERATURES.includes(equipment)) return res.status(400).json({ error: 'Invalid equipment' });

        const minutes = Math.max(5, Math.min(24 * 60, parseInt(req.query.minutes || '240', 10)));
        const limit = Math.max(10, Math.min(2000, parseInt(req.query.limit || '480', 10)));
        const since = new Date(Date.now() - minutes * 60 * 1000);

        const readings = await req.templogDb.collection('equipment_temp_readings')
            .find({ equipment, recordedAt: { $gte: since } })
            .sort({ recordedAt: 1 })
            .limit(limit)
            .toArray();

        const config = await getEquipmentConfig(req.templogDb, equipment);
        res.json({
            equipment,
            minutes,
            config,
            readings: readings.map(r => ({ ...r, ...evaluateTemperatureStatus(r.temp, config) }))
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/equipment-temp/latest
 * Returns the latest reading for each equipment
 */
app.get('/templog/api/equipment-temp/latest', requireTemplogDb, async (req, res) => {
    try {
        const latest = await Promise.all(EQUIPMENT_TEMPERATURES.map(async (equipment) => {
            const config = await getEquipmentConfig(req.templogDb, equipment);
            const reading = await req.templogDb.collection('equipment_temp_readings')
                .find({ equipment })
                .sort({ recordedAt: -1 })
                .limit(1)
                .next();
            if (!reading) return { equipment, config, reading: null, status: 'no-data' };
            return { equipment, config, reading, ...evaluateTemperatureStatus(reading.temp, config) };
        }));

        res.json(latest);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/equipment-temp/alerts
 * Returns latest alert events
 */
app.get('/templog/api/equipment-temp/alerts', requireTemplogDb, async (req, res) => {
    try {
        const equipment = normalizeEquipmentName(req.query.equipment);
        const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
        const filter = {};
        if (equipment) {
            if (!EQUIPMENT_TEMPERATURES.includes(equipment)) return res.status(400).json({ error: 'Invalid equipment' });
            filter.equipment = equipment;
        }

        const alerts = await req.templogDb.collection('equipment_temp_alerts')
            .find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .toArray();
        res.json(alerts);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/equipment-temp/stream
 * Server-sent events stream for real-time monitoring
 */
app.get('/templog/api/equipment-temp/stream', requireTemplogDb, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('retry: 5000\n\n');

    equipmentTempSseClients.add(res);

    try {
        const snapshot = await Promise.all(EQUIPMENT_TEMPERATURES.map(async (equipment) => {
            const config = await getEquipmentConfig(req.templogDb, equipment);
            const reading = await req.templogDb.collection('equipment_temp_readings')
                .find({ equipment })
                .sort({ recordedAt: -1 })
                .limit(1)
                .next();
            if (!reading) return { equipment, config, reading: null, status: 'no-data' };
            return { equipment, config, reading, ...evaluateTemperatureStatus(reading.temp, config) };
        }));
        sendSse(res, 'snapshot', snapshot);
    } catch (_) {}

    const heartbeat = setInterval(() => {
        try { res.write('event: heartbeat\ndata: {}\n\n'); } catch (_) {}
    }, 20000);

    req.on('close', () => {
        clearInterval(heartbeat);
        equipmentTempSseClients.delete(res);
    });
});

/**
 * POST /templog/api/cooks
 * Save a new cook record to the database
 */
app.post('/templog/api/cooks', requireTemplogDb, async (req, res) => {
    try {
        const cook = req.body;
        const err = validateCook(cook);
        if (err) return res.status(400).json({ error: err });
        await req.templogDb.collection('cooks_combioven').insertOne({ ...cook, createdAt: new Date() });
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/cooks
 * Retrieve cook records with optional filtering
 */
app.get('/templog/api/cooks', requireTemplogDb, async (req, res) => {
    try {
        const limit  = parseInt(req.query.limit || '8', 10);
        const filter = buildDateFilter(req.query);
        const cooks  = await req.templogDb.collection('cooks_combioven')
            .find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
        res.json(cooks);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/cooks/export
 * Export cook records as CSV file
 */
app.get('/templog/api/cooks/export', requireTemplogDb, async (req, res) => {
    try {
        const { year, month } = req.query;
        const filter = buildDateFilter(req.query);
        const cooks  = await req.templogDb.collection('cooks_combioven').find(filter).sort({ createdAt: 1 }).toArray();

        const headers = ['Food Item','Start Date','Start Time','End Time','Duration (min)','Core Temp (°C)','Staff','Numbers','Units'];
        const rows    = cooks.map(c => [c.food, c.startDate, c.startTime, c.endTime, c.duration, c.temp, c.staff, c.trays, c.units||'']);
        const csv     = [headers, ...rows].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');

        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        let suffix = 'all';
        if (year && month) suffix = `${monthNames[Math.max(1,Math.min(12,parseInt(month,10)))-1]}-${year}`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="kitchenlog-${suffix}.csv"`);
        res.send('\ufeff' + csv);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /templog/api/cooks/report.pdf
 * Generate PDF report of cook records (requires Puppeteer)
 */
app.get('/templog/api/cooks/report.pdf', requireTemplogDb, async (req, res) => {
    try {
        if (!puppeteer) return res.status(500).json({ error: 'PDF export requires puppeteer. Run: npm install puppeteer' });
        const { year, month, startDate, endDate } = req.query;
        const qs = [];
        if (startDate) qs.push(`startDate=${encodeURIComponent(startDate)}`);
        if (endDate)   qs.push(`endDate=${encodeURIComponent(endDate)}`);
        if (!startDate && !endDate && year && month) {
            qs.push(`year=${encodeURIComponent(year)}`, `month=${encodeURIComponent(month)}`);
        }
        qs.push('print=1');
        const url = `http://localhost:${PORT}/templog/departments/combioven-report.html?${qs.join('&')}`;

        const browser = await puppeteer.launch();
        const page    = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });
        await page.waitForFunction('window.__reportReady === true');
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top:'10mm', right:'10mm', bottom:'10mm', left:'10mm' }, scale: 0.9 });
        await browser.close();

        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        let suffix = 'all';
        if (year && month) suffix = `${monthNames[Math.max(1,Math.min(12,parseInt(month,10)))-1]}-${year}`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="kitchenlog-${suffix}.pdf"`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'PDF export failed' });
    }
});

// ─── Root route ──────────────────────────────────────────────────────────────

app.get('/maintenance', requirePageAccess('maintenance'), (req, res) => res.sendFile(path.join(__dirname, 'maintenance', 'maintenance.html')));

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🍽  Master Kitchen Management App`);
    console.log(`   Server running on http://localhost:${PORT}`);
    console.log(`   `);
    console.log(`   📋 Maintenance Dashboard → http://localhost:${PORT}/maintenance/`);
    console.log(`   🌡️  Kitchen Temp Log      → http://localhost:${PORT}/templog/`);
    console.log(`   🛒 Procurement           → http://localhost:${PORT}/procurement/`);
    console.log(`   🍽️  Food Safety NC        → http://localhost:${PORT}/foodsafety/`);
    console.log(`   🔐 Login                 → http://localhost:${PORT}/login`);
    console.log(`   ⚙️  Admin Panel           → http://localhost:${PORT}/admin/`);
    console.log(`   💚 Health Check          → http://localhost:${PORT}/api/health`);
    console.log(`\n   Access from tablet: http://<your-ip>:${PORT}\n`);

    // One-time: resolve any stale range alerts (warning/critical) on warmer units —
    // warmers are now monitored by fault-state machine only.
    if (!global._tempmonWarmerWarnCleaned) {
        global._tempmonWarmerWarnCleaned = true;
        (async () => {
            try {
                const TempMonUnit  = require('./models/TempMonUnit');
                const TempMonAlert = require('./models/TempMonAlert');
                const warmerUnits  = await TempMonUnit.find({ type: 'warmer', active: true }).select('_id').lean();
                if (warmerUnits.length) {
                    const ids    = warmerUnits.map(u => u._id);
                    const result = await TempMonAlert.updateMany(
                        { unit: { $in: ids }, type: { $in: ['warning_high', 'warning_low', 'critical_high', 'critical_low'] }, status: { $in: ['open', 'acknowledged'] } },
                        { $set: { status: 'resolved', resolvedAt: new Date(), resolveNote: 'Auto-closed: warmer units use fault detection only' } }
                    );
                    if (result.modifiedCount > 0)
                        console.log(`✓ [TempMon] Startup cleanup: resolved ${result.modifiedCount} stale warmer range alert(s)`);
                }
            } catch (e) { console.error('✗ [TempMon] Startup cleanup error:', e.message); }
        })();
    }
});

// ─── LoRa Gateway TCP Server ──────────────────────────────────────────────────
// Handles binary TCP/IP connections from RD07 WiFi LoRa Gateway
// Configure in TZConfig.exe: Data Transfer Protocol = TCP/IP, IP = <server-ip>, Port = LORA_TCP_PORT
// Protocol: TZONE LoRa Gateway WiFi TCP Communication v2.0
//   Frame: FF FF [LEN_H LEN_L] [CMD_H CMD_L] [PAYLOAD...] [XOR_CHECKSUM]
//   LEN = bytes from CMD_H onwards including checksum
//   Checksum = XOR of bytes from CMD_H through last payload byte

const LORA_TCP_PORT = parseInt(process.env.LORA_TCP_PORT || '4001', 10);

// ── TCP diagnostic log ───────────────────────────────────────────────────────
// Captures every LoRa TCP frame (raw hex + parsed fields) for diagnosis.
// Ring buffer: last 500 entries (in-memory, survives redeploy via API).
// File:        logs/lora-tcp.log — rotated when it exceeds 2 MB.
const TCP_LOG_MAX   = 500;
const TCP_LOG_FILE  = path.join(__dirname, 'logs', 'lora-tcp.log');
const loraTcpLog    = [];   // ring buffer

try { fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true }); } catch (_) {}

function logTcpFrame(entry) {
    const line = JSON.stringify(entry);
    loraTcpLog.push(entry);
    if (loraTcpLog.length > TCP_LOG_MAX) loraTcpLog.shift();
    try {
        // Rotate when file exceeds 2 MB
        try {
            if (fs.statSync(TCP_LOG_FILE).size > 2 * 1024 * 1024) {
                fs.renameSync(TCP_LOG_FILE, TCP_LOG_FILE + '.old');
            }
        } catch (_) {}
        fs.appendFileSync(TCP_LOG_FILE, line + '\n');
    } catch (_) {}
}

// Parse a 4-byte BCD sensor ID (e.g. 0x09 0x24 0x01 0x27 → "09240127")
function parseBcdSensorId(buf, offset) {
    let id = '';
    for (let i = 0; i < 4; i++) {
        const b = buf[offset + i];
        id += ((b >> 4) & 0x0F).toString() + (b & 0x0F).toString();
    }
    return id;
}

// Parse 2-byte big-endian temperature (bit15=fault, bit14=negative, bits13-0=val*10)
function parseTcpTemp(hi, lo) {
    const raw = (hi << 8) | lo;
    if (raw & 0x8000) return null; // sensor fault
    const neg = !!(raw & 0x4000);
    const val = (raw & 0x3FFF) / 10.0;
    return neg ? -val : val;
}

// Parse one binary tag record. isTag08B controls whether humidity is 1 or 2 bytes.
// Per TZONE TCP protocol v2.0: TAG09/TAG07/08 (type 01) = 17 bytes, TAG08B (type 04) = 18 bytes.
function parseTcpTagRecord(buf, offset, isTag08B) {
    const needed = isTag08B ? 18 : 17;
    if (buf.length - offset < needed) return null;
    const id       = parseBcdSensorId(buf, offset);       // 4 B
    const status   = buf[offset + 4];                     // 1 B
    const batMv    = (buf[offset + 5] << 8) | buf[offset + 6]; // 2 B big-endian mV
    const battery  = batMv / 1000.0;
    const temp     = parseTcpTemp(buf[offset + 7], buf[offset + 8]); // 2 B
    let humidity   = null;
    let rssiOff;
    if (isTag08B) {
        const hr = (buf[offset + 9] << 8) | buf[offset + 10]; // 2 B, unit 0.1%
        humidity = hr / 10.0;
        rssiOff = offset + 11;
    } else {
        const hb = buf[offset + 9]; // 1 B, 0xFF = not present (TAG09)
        humidity = (hb === 0xFF) ? null : hb;
        rssiOff = offset + 10;
    }
    const rssiRaw  = buf[rssiOff];                         // 1 B abs dBm
    const rssi     = -rssiRaw;
    // RTC: 6 B YY MM DD HH mm ss — each byte is a raw binary decimal value (not BCD).
    // e.g. year 2026 → byte 0x1A (26 decimal).  Use the byte value directly.
    const rtcOff   = rssiOff + 1;
    const rtcParts = [];
    for (let i = 0; i < 6; i++) {
        rtcParts.push(buf[rtcOff + i].toString().padStart(2, '0'));
    }
    const rtcStr = rtcParts.join(''); // YYMMDDHHmmss e.g. "260317043227"
    return {
        record: { id, temp, humidity, rssi, battery, status, rtc: rtcStr },
        bytesConsumed: needed
    };
}

// Ingest parsed TCP tag records into the database (reuses existing lora logic)
// gatewayRtc: the gateway's own synced RTC from the frame header — used as the
// anchor timestamp for batches of buffered readings whose sensor clocks are bad.
async function ingestTcpTagRecords(gatewayImei, tags, tagModel, gatewayRtc) {
    if (!templogDb) {
        console.warn('[TCP] DB not ready — discarding', tags.length, 'tag records');
        return;
    }
    const now = new Date();
    // Each sensor tag embeds its own RTC (raw-binary, now correctly decoded).
    // Use per-sensor rtc directly — this handles buffered offline readings properly
    // (e.g. a sensor offline since yesterday will be stored at yesterday's 07:00 slot,
    // not interpolated from "now").
    // The gateway's own UTC-synced RTC is passed as top-level fallback for any sensor
    // whose RTC is invalid or unreasonably far from the present.
    const anchorTime = (gatewayRtc instanceof Date && !isNaN(gatewayRtc)) ? gatewayRtc : now;

    const payload = {
        source: 'lora-tcp',
        imei: gatewayImei,
        rtc: anchorTime.toISOString(), // top-level fallback used by extractLoraSensorRows
        data: { [tagModel.toLowerCase()]: tags.map((t) => ({
            id: t.id, temp: t.temp, humi: t.humidity, rssi: t.rssi,
            bat: t.battery, sta: t.status,
            rtc: t.rtc   // per-sensor RTC string e.g. "260317042724" (correctly decoded)
        })) }
    };
    const gatewayId = String(gatewayImei || '').trim();
    const sensorRows = extractLoraSensorRows(payload);
    const devices = await templogDb.collection('lora_devices').find({}).toArray();
    const enabledMap = new Map(
        devices.filter(d => d.enabled !== false)
               .map(d => [normalizeSensorId(d.sensorId), d])
    );
    const allMap = new Map(devices.map(d => [normalizeSensorId(d.sensorId), d]));
    const mappedReadings = [];
    const unmatched = [];
    for (const row of sensorRows) {
        const mapped = enabledMap.get(row.sensorId);
        if (!Number.isFinite(row.temp)) {
            unmatched.push({ sensorId: row.sensorId, reason: 'invalid_temp' });
            continue;
        }
        if (!mapped) {
            unmatched.push({
                sensorId: row.sensorId, temp: row.temp, model: row.model || '',
                reason: allMap.has(row.sensorId) ? 'disabled' : 'unregistered'
            });
            continue;
        }
        mappedReadings.push({
            equipment: mapped.equipment, temp: row.temp,
            source: 'lora-tcp-gateway', gatewayId, sensorId: row.sensorId,
            model: mapped.model || row.model || '',
            humidity: row.humidity, rssi: row.rssi, battery: row.battery,
            recordedAt: row.recordedAt, createdAt: now,
            _loraDevice: mapped   // carry device doc for TempMon forwarding
        });
    }
    let ingested = 0;
    if (mappedReadings.length) {
        try {
            // Forward to TempMon for any sensor linked to a unit
            await Promise.all(mappedReadings.map(r => forwardToTempMon(r._loraDevice, { sensorId: r.sensorId, temp: r.temp, humidity: r.humidity, rssi: r.rssi, battery: r.battery, recordedAt: r.recordedAt }, gatewayId)));

            const cleanReadings = mappedReadings.map(({ _loraDevice, ...rest }) => rest);
            const result = await ingestEquipmentReadings({ templogDb }, cleanReadings);
            ingested = result.count;
        } catch (e) { console.error('[TCP] ingest error:', e.message); }
    }
    await templogDb.collection('lora_gateway_events').insertOne({
        gatewayId, sensorCount: sensorRows.length, ingestedCount: ingested,
        unmatchedCount: unmatched.length, unmatched, payload,
        receivedAt: now, proto: 'tcp'
    });
    console.log(`[TCP] gw=${gatewayId} sensors=${sensorRows.length} ingested=${ingested} unmatched=${unmatched.length}`);
}

// Process accumulated buffer.
// TZONE RD07 TCP frame format (v2.0 protocol):
//   TZ(2) + LEN(2) + payload(LEN bytes) + CRLF(2)
//   payload: $$(2) + HW_TYPE(2=0406) + FW(4) + IMEI(8) + RTC(6) + Res1(2)
//          + DevDataLen(2) + DevData(DevDataLen)
//          + TagDataLen(2) + [TagType(1)+NumRec(1)+RecLen(1)+Records(X)] when TagDataLen>0
//          + MsgID(2) + CRC16(2)
// NOTE: ALL frames use the same layout — sensor data vs heartbeat is determined
//       by TagDataLen field (0 = heartbeat/status only, >0 = sensor records present).
// Server ACK (ASCII): @ACK,{msgId}#\r\n
async function processTcpBuffer(socket, state) {
    let buf = state.buffer;
    let i = 0;
    while (i + 6 <= buf.length) {
        // Find TZ frame start: 0x54 ("T"), 0x5A ("Z")
        if (buf[i] !== 0x54 || buf[i + 1] !== 0x5A) { i++; continue; }
        if (buf.length - i < 4) break; // can't read LEN yet
        const payloadLen = (buf[i + 2] << 8) | buf[i + 3];
        const totalLen = 4 + payloadLen + 2; // TZ(2) + LEN(2) + payload + CRLF(2)
        if (buf.length - i < totalLen) break; // incomplete — wait for more data

        // Verify CRLF terminator
        if (buf[i + totalLen - 2] !== 0x0D || buf[i + totalLen - 1] !== 0x0A) {
            i++; continue;
        }

        const payload = buf.slice(i + 4, i + 4 + payloadLen);

        // Payload must begin with $$ (24 24)
        if (payload.length < 26 || payload[0] !== 0x24 || payload[1] !== 0x24) {
            i += totalLen; continue;
        }

        // Parse IMEI once per connection (8 bytes BCD at payload[8..15])
        if (!state.imei) {
            const b = payload.slice(8, 16);
            let id = (b[0] & 0xF).toString();
            for (let j = 1; j < 8; j++) id += ((b[j] >> 4) & 0xF).toString() + (b[j] & 0xF).toString();
            state.imei = id;
        }

        // Gateway's own RTC (payload[16..21], 6 raw-binary bytes: YY MM DD HH mm ss).
        // Each byte is the plain decimal value stored as a hex byte (e.g. year 26 → 0x1A).
        // NOT BCD — do NOT split into nibbles.  The server sends @UTC on every connect
        // so this clock is accurate UTC.
        let gatewayRtc = null;
        {
            let rtcStr = '';
            for (let j = 16; j < 22; j++) {
                rtcStr += payload[j].toString().padStart(2, '0');
            }
            const d = parseRecordedAt(rtcStr);
            if (Math.abs(d.getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000) gatewayRtc = d;
        }

        // FW version: payload[4]=major (0x03→3), payload[5]=minor (0x16→22 decimal)
        const fwStr = `${payload[4]}.${payload[5].toString().padStart(2, '0')}`;

        // Device data block (contains gateway battery / power voltage)
        const devDataLen = (payload[24] << 8) | payload[25];
        let batV = null, extV = null;
        if (devDataLen >= 8 && payload.length >= 26 + devDataLen) {
            // Battery at devData[4-5], PowerVol at devData[6-7], unit: 10 mV → /100 for V
            batV = ((payload[30] << 8) | payload[31]) / 100;
            extV = ((payload[32] << 8) | payload[33]) / 100;
        }

        // Tag data section starts right after device data
        const tagBase = 26 + devDataLen;
        if (payload.length < tagBase + 2) { i += totalLen; continue; }
        const tagDataLen = (payload[tagBase] << 8) | payload[tagBase + 1];

        // Message ID is 4 bytes from end of payload (MsgID 2B + CRC16 2B)
        const msgId = ((payload[payloadLen - 4] << 8) | payload[payloadLen - 3]) || 0;

        if (tagDataLen > 0) {
            // ── Frame with sensor tag records ──────────────────────────────
            // Tag section: TagType(1) + NumRecords(1) + RecordLen(1) + Records(tagDataLen bytes)
            if (payload.length < tagBase + 2 + 3) {
                i += totalLen; continue; // incomplete tag header
            }
            const tagType = payload[tagBase + 2]; // 01=TAG07/08/09, 04=TAG08B
            const numRec  = payload[tagBase + 3];
            const recLen  = payload[tagBase + 4];
            const recsOff = tagBase + 5;
            const isTag08B = (tagType === 0x04);

            console.log(`[TCP] sensor frame IMEI=${state.imei||'?'} tagType=0x${tagType.toString(16)} numRec=${numRec} recLen=${recLen}`);

            const tags = [];
            if (payload.length >= recsOff + numRec * recLen) {
                for (let r = 0; r < numRec; r++) {
                    const rec = parseTcpTagRecord(payload, recsOff + r * recLen, isTag08B);
                    if (rec) {
                        console.log(`[TCP]   tag id=${rec.record.id} temp=${rec.record.temp}°C humi=${rec.record.humidity} bat=${rec.record.battery}V rssi=${rec.record.rssi}dBm`);
                        tags.push(rec.record);
                    }
                }
            } else {
                // Not enough bytes — log raw for diagnosis
                console.log(`[TCP] tag raw: ${payload.slice(recsOff).toString('hex').toUpperCase().match(/.{1,2}/g).join(' ')}`);
            }

            // Diagnostic log — raw hex frame + parsed fields
            logTcpFrame({
                ts:        new Date().toISOString(),
                type:      'sensor',
                imei:      state.imei || '',
                fw:        fwStr,
                gwRtc:     gatewayRtc ? gatewayRtc.toISOString() : null,
                tagType:   `0x${tagType.toString(16).padStart(2,'0')}`,
                numRec,
                recLen,
                tags:      tags.map(t => ({ id: t.id, temp: t.temp, humi: t.humidity, rssi: t.rssi, bat: t.battery, rtc: t.rtc, sta: t.status })),
                rawHex:    buf.slice(i, i + totalLen).toString('hex').toUpperCase().match(/.{1,2}/g).join(' ')
            });

            if (tags.length) {
                const model = isTag08B ? 'TAG08B' : 'TAG09';
                ingestTcpTagRecords(state.imei || '', tags, model, gatewayRtc).catch(e =>
                    console.error('[TCP] ingest error:', e.message)
                );
            }
        } else {
            // ── Heartbeat / status frame (no sensor data) ──────────────────
            console.log(`[TCP] heartbeat IMEI=${state.imei||'?'} FW=${fwStr} bat=${batV}V ext=${extV}V`);
            logTcpFrame({
                ts:     new Date().toISOString(),
                type:   'heartbeat',
                imei:   state.imei || '',
                fw:     fwStr,
                gwRtc:  gatewayRtc ? gatewayRtc.toISOString() : null,
                bat:    batV,
                ext:    extV,
                rawHex: buf.slice(i, i + totalLen).toString('hex').toUpperCase().match(/.{1,2}/g).join(' ')
            });
            if (templogDb) {
                templogDb.collection('lora_gateway_events').insertOne({
                    gatewayId: state.imei || socket.remoteAddress,
                    sensorCount: 0, ingestedCount: 0, unmatchedCount: 0, unmatched: [],
                    payload: { source: 'lora-tcp', imei: state.imei || '', fw: fwStr,
                               data: { bat: batV, exvol: extV } },
                    receivedAt: new Date(), proto: 'tcp'
                }).catch(e => console.error('[TCP] DB heartbeat error:', e.message));
            }
        }

        // ACK (ASCII per protocol spec): @ACK,{msgId}#\r\n
        socket.write(`@ACK,${msgId}#\r\n`);

        i += totalLen;
    }
    state.buffer = buf.slice(i);
}

const loraTcpServer = net.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[TCP] LoRa gateway connected: ${remote}`);
    const state = { buffer: Buffer.alloc(0), imei: '' };

    // Send RTC sync immediately on connect (UTC time, required by protocol)
    const nowUtc = new Date();
    const rtcSync = nowUtc.toISOString().replace('T', ' ').slice(0, 19);
    socket.write(`@UTC,${rtcSync}#\r\n`);

    socket.on('data', (chunk) => {
        state.buffer = Buffer.concat([state.buffer, chunk]);
        processTcpBuffer(socket, state).catch(e => console.error('[TCP] process error:', e.message));
    });

    socket.on('end',   () => console.log(`[TCP] gateway disconnected: ${remote}`));
    socket.on('error', (err) => console.warn(`[TCP] socket error (${remote}): ${err.message}`));
});

loraTcpServer.on('error', (err) => console.error('[TCP] server error:', err.message));

loraTcpServer.listen(LORA_TCP_PORT, '0.0.0.0', () => {
    console.log(`📡 LoRa TCP server listening on port ${LORA_TCP_PORT}`);
    console.log(`   TZConfig → Data Transfer Protocol: TCP/IP, Port: ${LORA_TCP_PORT}`);
});
