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

require('dotenv').config();
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
MongoClient.connect(TEMPLOG_MONGO_URI)
    .then(client => {
        templogDb = client.db(TEMPLOG_DB_NAME);
        console.log('✓ [TempLog] MongoDB (native) connected');
    })
    .catch(err => console.error('✗ [TempLog] MongoDB connection error:', err));

/**
 * Middleware to ensure TempLog database is ready
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function requireTemplogDb(req, res, next) {
    if (!templogDb) return res.status(503).json({ error: 'TempLog database not ready' });
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
app.get('/auth-guard.js', (req, res) => res.sendFile(path.join(__dirname, 'auth-guard.js')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js',  express.static(path.join(__dirname, 'public', 'js')));

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

// Hub page — any authenticated user
app.get('/', requirePageAccess(null), (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Maintenance Dashboard — requires 'maintenance' permission
app.use('/maintenance', requirePageAccess('maintenance'), express.static(path.join(__dirname, 'maintenance'), noCacheHtml));
app.use(requirePageAccess('maintenance'), express.static(path.join(__dirname, 'maintenance'), noCacheHtml)); // legacy root-relative asset paths

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

        const headers = ['Food Item','Start Date','Start Time','End Time','Duration (min)','Core Temp (°C)','Staff','Trays'];
        const rows    = cooks.map(c => [c.food, c.startDate, c.startTime, c.endTime, c.duration, c.temp, c.staff, c.trays]);
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
