require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { MongoClient, ServerApiVersion } = require('mongodb');
const path = require('path');
const cors = require('cors');

let puppeteer = null;
try { puppeteer = require('puppeteer'); } catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Database connections ────────────────────────────────────────────────────

// 1. Mongoose — Maintenance Dashboard
const MAINTENANCE_MONGO_URI = process.env.MAINTENANCE_MONGODB_URI || 'mongodb://localhost:27017/central_kitchen_maintenance';
mongoose.connect(MAINTENANCE_MONGO_URI)
    .then(() => console.log('[Maintenance] MongoDB (Mongoose) connected'))
    .catch(err => console.error('[Maintenance] MongoDB connection error:', err));

// 2. Native driver — Kitchen Temp Log
const TEMPLOG_MONGO_URI = process.env.TEMPLOG_MONGODB_URI || 'mongodb://localhost:27017';
const TEMPLOG_DB_NAME   = process.env.TEMPLOG_DB_NAME || 'kitchenlog';
let templogDb;
MongoClient.connect(TEMPLOG_MONGO_URI)
    .then(client => {
        templogDb = client.db(TEMPLOG_DB_NAME);
        console.log('[TempLog] MongoDB (native) connected');
    })
    .catch(err => console.error('[TempLog] MongoDB connection error:', err));

function requireTemplogDb(req, res, next) {
    if (!templogDb) return res.status(503).json({ error: 'TempLog database not ready' });
    req.templogDb = templogDb;
    next();
}

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Maintenance static files (root) ────────────────────────────────────────
const noCacheHtml = { setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
}};
app.use(express.static(path.join(__dirname), noCacheHtml));

// ─── TempLog static files (/templog/) ───────────────────────────────────────
app.use('/templog', express.static(path.join(__dirname, 'templog'), noCacheHtml));
app.get('/templog', (req, res) => res.sendFile(path.join(__dirname, 'templog', 'index.html')));

// ─── Maintenance API Routes ──────────────────────────────────────────────────

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
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        maintenance_db: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        templog_db: templogDb ? 'Connected' : 'Disconnected',
    });
});

// ─── TempLog API Routes (/templog/api/) ─────────────────────────────────────

function validateCook(cook) {
    if (!cook || !cook.food || !cook.staff) return 'Missing required fields';
    if (cook.temp !== undefined && cook.temp !== '' && isNaN(parseFloat(cook.temp))) return 'Invalid temp';
    const traysNum = parseInt(cook.trays, 10);
    if (cook.trays !== undefined && cook.trays !== '' && (isNaN(traysNum) || traysNum < 1)) return 'Invalid trays';
    return null;
}

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

// Save cook
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

// Load recent cooks
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

// Export CSV
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

// Export PDF
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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ─── Error handler ───────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🍽  Master App running on http://localhost:${PORT}`);
    console.log(`   Maintenance Dashboard → http://localhost:${PORT}/`);
    console.log(`   Kitchen Temp Log      → http://localhost:${PORT}/templog/`);
    console.log(`   Health check          → http://localhost:${PORT}/api/health\n`);
});
