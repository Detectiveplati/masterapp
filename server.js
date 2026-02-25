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
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requirePageAccess } = require('./services/auth-middleware');

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
                permissions:  { maintenance: true, foodsafety: true, templog: true, procurement: true }
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

// 1. Mongoose — Maintenance Dashboard
const MAINTENANCE_MONGO_URI = process.env.MAINTENANCE_MONGODB_URI || 'mongodb://localhost:27017/central_kitchen_maintenance';
mongoose.connect(MAINTENANCE_MONGO_URI)
    .then(async () => {
        console.log('✓ [Maintenance] MongoDB (Mongoose) connected');
        await seedAdmin();
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
    .then(client => {
        templogDb = client.db(TEMPLOG_DB_NAME);
        console.log(`✓ [TempLog] MongoDB connected (db: ${TEMPLOG_DB_NAME})`);
        // Handle unexpected disconnection
        client.on('close', () => {
            console.warn('⚠️  [TempLog] MongoDB connection closed');
            templogDb = null;
        });
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

// Service worker — must be served from root with correct scope headers
app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

// Food Safety NC — requires 'foodsafety' permission
app.use('/foodsafety', requirePageAccess('foodsafety'), express.static(path.join(__dirname, 'foodsafety'), noCacheHtml));
app.get('/foodsafety', requirePageAccess('foodsafety'), (req, res) => res.sendFile(path.join(__dirname, 'foodsafety', 'index.html')));
app.get('/foodsafety/index.html', requirePageAccess('foodsafety'), (req, res) => res.sendFile(path.join(__dirname, 'foodsafety', 'index.html')));
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

// Procurement — requires 'procurement' permission
app.use('/procurement', requirePageAccess('procurement'), express.static(path.join(__dirname, 'procurement'), noCacheHtml));
app.get('/procurement',             requirePageAccess('procurement'), (req, res) => res.sendFile(path.join(__dirname, 'procurement', 'index.html')));
app.get('/procurement/request',     requirePageAccess('procurement'), (req, res) => res.sendFile(path.join(__dirname, 'procurement', 'request-form.html')));
app.get('/procurement/requests',    requirePageAccess('procurement'), (req, res) => res.sendFile(path.join(__dirname, 'procurement', 'requests.html')));
app.get('/procurement/request/:id', requirePageAccess('procurement'), (req, res) => res.sendFile(path.join(__dirname, 'procurement', 'request-detail.html')));

// ─── Auth & Admin API Routes ──────────────────────────────────────────────────
const authRoutes  = require('./routes/auth');
const adminRoutes = require('./routes/admin');
app.use('/api/auth',  authRoutes);
app.use('/api/admin', adminRoutes);

// ─── Maintenance API Routes ──────────────────────────────────────────────────
// Food Safety NC API Routes
const foodsafetyRoutes = require('./routes/foodsafety');
app.use('/api/foodsafety', foodsafetyRoutes);

const equipmentRoutes          = require('./routes/equipment');
const maintenanceRoutes        = require('./routes/maintenance');
const issuesRoutes             = require('./routes/issues');
const equipmentIssuesRoutes    = require('./routes/equipmentIssues');
const areasRoutes              = require('./routes/areas');
const reportsRoutes            = require('./routes/reports');
const notificationsRoutes      = require('./routes/notifications');
const seedRoutes               = require('./routes/seed');

app.use('/api/equipment',        equipmentRoutes);
app.use('/api/equipment-issues', equipmentIssuesRoutes);
app.use('/api/maintenance',      maintenanceRoutes);
app.use('/api/records',          maintenanceRoutes);  // legacy
app.use('/api/issues',           issuesRoutes);
app.use('/api/areas',            areasRoutes);
app.use('/api/reports',          reportsRoutes);
app.use('/api/notifications',    notificationsRoutes);
app.use('/api/seed',             seedRoutes);

// Push notifications
const pushRoutes = require('./routes/push');
const sendPushToPermission = pushRoutes.sendPushToPermission;
app.use('/api/push', pushRoutes);

// ─── Procurement API Routes ──────────────────────────────────────────────────
const procurementRequestsRoutes = require('./routes/procurementRequests');
app.use('/api/requests', procurementRequestsRoutes);

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
    if (raw === 'food warmer') return 'food-warmer';
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

async function processEquipmentAlarm(req, reading, config) {
    const { status, outOfRange } = evaluateTemperatureStatus(reading.temp, config);
    const states = req.templogDb.collection('equipment_temp_states');
    const state = await states.findOne({ equipment: reading.equipment });
    const recordedAt = new Date(reading.recordedAt);

    if (!outOfRange) {
        await states.updateOne(
            { equipment: reading.equipment },
            {
                $set: {
                    equipment: reading.equipment,
                    outOfRangeSince: null,
                    lastDirection: 'normal',
                    updatedAt: new Date()
                }
            },
            { upsert: true }
        );
        return;
    }

    const outOfRangeSince = state && state.outOfRangeSince ? new Date(state.outOfRangeSince) : recordedAt;
    const elapsedMs = Math.max(0, recordedAt.getTime() - outOfRangeSince.getTime());
    const shouldWarn = elapsedMs >= config.warningDelayMinutes * 60 * 1000;

    await states.updateOne(
        { equipment: reading.equipment },
        {
            $set: {
                equipment: reading.equipment,
                outOfRangeSince,
                lastDirection: status,
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );

    if (!shouldWarn) return;

    const lastPushAt = state && state.lastPushAt ? new Date(state.lastPushAt) : null;
    const canPush = !lastPushAt || (recordedAt.getTime() - lastPushAt.getTime()) >= (config.repeatMinutes * 60 * 1000);
    if (!canPush) return;

    const minutesOut = Math.round(elapsedMs / 60000);
    const message = `${reading.equipment} is ${status.toUpperCase()} at ${reading.temp.toFixed(1)} C for ${minutesOut} min (threshold ${config.minTemp} to ${config.maxTemp} C).`;
    const alertDoc = {
        equipment: reading.equipment,
        status,
        temp: reading.temp,
        minTemp: config.minTemp,
        maxTemp: config.maxTemp,
        warningDelayMinutes: config.warningDelayMinutes,
        minutesOut,
        message,
        source: reading.source || 'iot-gateway',
        gatewayId: reading.gatewayId || '',
        createdAt: recordedAt
    };

    await req.templogDb.collection('equipment_temp_alerts').insertOne(alertDoc);

    await states.updateOne(
        { equipment: reading.equipment },
        { $set: { lastPushAt: recordedAt, lastAlertAt: recordedAt } },
        { upsert: true }
    );

    broadcastEquipmentTemperature('alert', alertDoc);

    if (config.pushEnabled && typeof sendPushToPermission === 'function') {
        try {
            await sendPushToPermission('templog', {
                title: `Temperature Alert: ${reading.equipment}`,
                message,
                url: EQUIPMENT_PAGE_URL
            });
        } catch (err) {
            console.warn('[TempLog] Push alert skipped:', err.message);
        }
    }
}

async function ingestEquipmentReadings(req, readings) {
    if (!Array.isArray(readings) || readings.length === 0) return { count: 0, processed: [] };

    await req.templogDb.collection('equipment_temp_readings').insertMany(readings);

    const processed = [];
    for (const reading of readings) {
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

const LORA_SUPPORTED_MODELS = ['TAG08B', 'TAG08L', 'TAG09'];

function normalizeLoraModel(value) {
    const model = String(value || '').trim().toUpperCase();
    if (model === 'TAG08(B-L)' || model === 'TAG08') return 'TAG08B';
    if (model === 'TAG09') return 'TAG09';
    return model;
}

function normalizeSensorId(value) {
    return String(value || '').trim().toUpperCase();
}

function parseRecordedAt(value) {
    if (value === undefined || value === null || value === '') return new Date();
    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = value > 1e12 ? value : value * 1000;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? new Date() : d;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric) && String(value).trim().match(/^\d+$/)) {
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
    const listCandidates = [
        sourceRoot.readings,
        sourceRoot.sensors,
        sourceRoot.SensorList,
        sourceRoot.data,
        sourceRoot.items,
        Array.isArray(payload) ? payload : null
    ].filter(Array.isArray);

    const inputRows = listCandidates.length > 0 ? listCandidates[0] : [sourceRoot];

    for (const row of inputRows) {
        if (!row || typeof row !== 'object') continue;
        const sensorId = normalizeSensorId(pickFirst(row, ['sensorId', 'sensorID', 'sensor_id', 'SN', 'sn', 'tagId', 'deviceId', 'mac']));
        const rawTemp = pickFirst(row, ['temp', 'temperature', 'Temperature', 'Temp', 'T']);
        const temp = Number(rawTemp);
        if (!sensorId || !Number.isFinite(temp)) continue;

        const humidityValue = pickFirst(row, ['humidity', 'Humidity', 'H']);
        const humidity = Number(humidityValue);
        const rssiValue = pickFirst(row, ['rssi', 'RSSI']);
        const rssi = Number(rssiValue);
        const model = normalizeLoraModel(pickFirst(row, ['model', 'deviceModel', 'tagModel']) || sourceRoot.model);

        rows.push({
            sensorId,
            temp,
            humidity: Number.isFinite(humidity) ? humidity : null,
            rssi: Number.isFinite(rssi) ? rssi : null,
            model: model || '',
            recordedAt: parseRecordedAt(pickFirst(row, ['recordedAt', 'time', 'timestamp', 'rtc', 'RTC']) || sourceRoot.recordedAt || sourceRoot.time || sourceRoot.timestamp),
            raw: row
        });
    }
    return rows;
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
        const equipment = normalizeEquipmentName(req.body.equipment);
        const alias = String(req.body.alias || '').trim();
        const notes = String(req.body.notes || '').trim();

        if (!sensorId) return res.status(400).json({ error: 'sensorId is required' });
        if (!EQUIPMENT_TEMPERATURES.includes(equipment)) return res.status(400).json({ error: 'Invalid equipment mapping' });
        if (!LORA_SUPPORTED_MODELS.includes(model)) return res.status(400).json({ error: 'Unsupported model. Use TAG08B/TAG08L/TAG09' });

        const now = new Date();
        const doc = {
            sensorId,
            model,
            equipment,
            alias,
            notes,
            enabled: req.body.enabled !== false,
            createdAt: now,
            updatedAt: now
        };

        await req.templogDb.collection('lora_devices').updateOne(
            { sensorId },
            { $set: doc, $setOnInsert: { createdAt: now } },
            { upsert: true }
        );
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
            if (!LORA_SUPPORTED_MODELS.includes(model)) return res.status(400).json({ error: 'Unsupported model' });
            update.model = model;
        }
        if (req.body.equipment !== undefined) {
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

        const devices = await req.templogDb.collection('lora_devices').find({ enabled: true }).toArray();
        const map = new Map(devices.map(d => [normalizeSensorId(d.sensorId), d]));
        const mappedReadings = [];
        const unmatched = [];

        for (const row of sensorRows) {
            const mapped = map.get(row.sensorId);
            if (!mapped) {
                unmatched.push({ sensorId: row.sensorId, temp: row.temp, model: row.model || '', recordedAt: row.recordedAt });
                continue;
            }
            mappedReadings.push({
                equipment: mapped.equipment,
                temp: row.temp,
                source: 'lora-http-gateway',
                gatewayId,
                sensorId: row.sensorId,
                model: row.model || mapped.model || '',
                humidity: row.humidity,
                rssi: row.rssi,
                recordedAt: row.recordedAt,
                createdAt: now
            });
        }

        let ingested = 0;
        if (mappedReadings.length) {
            const result = await ingestEquipmentReadings(req, mappedReadings);
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
});
