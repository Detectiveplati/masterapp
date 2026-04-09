'use strict';

const express = require('express');
const dns = require('dns');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const xlsx = require('xlsx');
const router = express.Router();

const LabelPrintItem = require('../models/LabelPrintItem');
const LabelPrintTemplate = require('../models/LabelPrintTemplate');
const LabelPrintPrinter = require('../models/LabelPrintPrinter');
const LabelPrintJob = require('../models/LabelPrintJob');
const { requireAuth, requirePermission } = require('../services/auth-middleware');

router.use(requireAuth, requirePermission('labelprint'));

let defaultsPromise = null;
const PLACEHOLDER_COUNT = 10;
const EXCEL_SOURCE_PATH = path.join(process.env.USERPROFILE || 'C:\\Users\\Zack', 'Desktop', '#05-27', 'Sauce Department.xlsx');
const BUNDLED_CATALOG_PATH = path.join(__dirname, '..', 'label-print', 'data', 'catalog.json');

async function ensureDefaults() {
  if (defaultsPromise) return defaultsPromise;
  defaultsPromise = (async () => {
    const printerCount = await LabelPrintPrinter.countDocuments();

    await syncCatalog();

    if (!printerCount) {
      await LabelPrintPrinter.create({
        name: 'Brother QL-820NWB',
        model: 'QL-820NWB',
        connectionType: 'web-serial-bluetooth',
        host: '',
        port: 9100,
        serialBaudRate: 9600,
        status: 'unavailable',
        bridgeAvailable: false,
        objectNameMap: {
          name: 'name',
          description: 'description',
          sku: 'sku',
          barcode: 'barcode',
          quantity: 'quantity',
          dateTime: 'dateTime'
        }
      });
    }
  })();
  return defaultsPromise;
}

async function syncCatalog() {
  const excelCatalog = readCatalogFromExcel();
  if (excelCatalog.items.length && excelCatalog.templates.length) {
    await replaceCatalog(excelCatalog);
    return;
  }

  const bundledCatalog = readBundledCatalog();
  if (bundledCatalog.items.length) {
    await replaceCatalog(bundledCatalog);
    return;
  }

  await replaceCatalog(buildPlaceholderCatalog());
}

function readCatalogFromExcel() {
  if (!EXCEL_SOURCE_PATH || !fs.existsSync(EXCEL_SOURCE_PATH)) {
    return { templates: [], items: [] };
  }

  const workbook = xlsx.readFile(EXCEL_SOURCE_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
  return buildCatalogFromRows(rows);
}

function readBundledCatalog() {
  if (!fs.existsSync(BUNDLED_CATALOG_PATH)) {
    return { templates: [], items: [] };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(BUNDLED_CATALOG_PATH, 'utf8'));
    return {
      templates: Array.isArray(payload.templates) ? payload.templates : [],
      items: Array.isArray(payload.items) ? payload.items : []
    };
  } catch (_err) {
    return { templates: [], items: [] };
  }
}

function buildCatalogFromRows(rows) {
  const templates = [];
  const items = [];
  const seenTemplates = new Set();

  for (const row of rows) {
    const englishName = String(readColumn(row, (normalized) => normalized.startsWith('english')) || '').trim();
    if (!englishName) continue;

    const chineseName = String(readColumn(row, (normalized) => normalized.startsWith('chinese')) || '').trim();
    const storage = String(readColumn(row, (normalized) => normalized.includes('storagecondition')) || '').trim();
    const shelfLife = String(readColumn(row, (normalized) => normalized === 'shelflife') || '').trim();
    const location = String(readColumn(row, (normalized) => normalized === 'location') || '').trim();
    const templateFile = String(readColumn(row, (normalized) => normalized === 'templatefile') || '').trim();
    const assignmentStatus = String(readColumn(row, (normalized) => normalized === 'assignmentstatus') || '').trim().toUpperCase();

    let templateNumber = Number(readColumn(row, (normalized) => normalized === 'templateno'));
    if ((!Number.isFinite(templateNumber) || templateNumber <= 0) && templateFile) {
      const match = templateFile.match(/^(\d{1,3})\./);
      if (match) templateNumber = Number(match[1]);
    }

    const hasTemplate = Number.isFinite(templateNumber) && templateNumber > 0;
    const templateKey = hasTemplate ? `template-${templateNumber}` : `template-na-${items.length + 1}`;
    const displayDescription = [chineseName, storage, shelfLife].filter(Boolean).join(' · ');

    if (hasTemplate && !seenTemplates.has(templateKey)) {
      seenTemplates.add(templateKey);
      templates.push({
        key: templateKey,
        name: `Template ${templateNumber}`,
        description: templateFile || `Assigned from Sauce Department.xlsx as printer template ${templateNumber}.`,
        printerTemplateNumber: templateNumber,
        mediaWidthMm: 62,
        printWidthMm: 58,
        heightMm: 62,
        fieldSchema: [],
        preview: { widthMm: 58, heightMm: 62 },
        active: true
      });
    }

    items.push({
      name: englishName,
      description: displayDescription || `Location ${location || 'N/A'}`,
      category: normalizeCategory(storage, shelfLife),
      templateKey,
      sku: templateFile || 'NA',
      barcode: '',
      defaultQuantity: 1,
      defaultCutMode: 'auto-cut',
      defaultFieldValues: {
        assignmentStatus,
        location,
        hasTemplate
      },
      active: true
    });
  }

  return { templates, items };
}

function readColumn(row, matcher) {
  const key = Object.keys(row).find((rawKey) => matcher(normalizeHeader(rawKey), rawKey));
  return key ? row[key] : '';
}

function normalizeHeader(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function buildPlaceholderCatalog() {
  const templates = Array.from({ length: PLACEHOLDER_COUNT }, (_value, index) => {
    const number = index + 1;
    return {
      key: `template-${number}`,
      name: `Template ${number}`,
      description: `Placeholder template ${number}, mapped to printer template ${number}.`,
      printerTemplateNumber: number,
      mediaWidthMm: 62,
      printWidthMm: 58,
      heightMm: 62,
      fieldSchema: [
        { key: 'name', label: 'Name', required: true },
        { key: 'description', label: 'Description' },
        { key: 'quantity', label: 'Quantity' }
      ],
      preview: { widthMm: 58, heightMm: 62 },
      active: true
    };
  });

  const items = Array.from({ length: PLACEHOLDER_COUNT }, (_value, index) => {
    const number = index + 1;
    return {
      name: `Placeholder ${number}`,
      description: `Linked to Template ${number} and printer tag ${number}.`,
      category: 'Placeholders',
      templateKey: `template-${number}`,
      sku: `TPL-${String(number).padStart(2, '0')}`,
      barcode: `TPL${String(number).padStart(2, '0')}`,
      defaultQuantity: 1,
      defaultCutMode: 'auto-cut',
      defaultFieldValues: {
        name: `Placeholder ${number}`,
        description: `Template ${number}`,
        quantity: '1'
      },
      active: true
    };
  });

  return { templates, items };
}

async function replaceCatalog({ templates, items }) {
  await LabelPrintTemplate.deleteMany({});
  await LabelPrintItem.deleteMany({});
  await LabelPrintTemplate.insertMany(templates);
  await LabelPrintItem.insertMany(items);
}

function normalizeCategory(storage, shelfLife) {
  const storageText = String(storage || '').trim();
  const shelfText = String(shelfLife || '').trim();
  const storageLead = storageText.split(/\s+/)[0];
  return storageLead || shelfText || 'Imported';
}

function buildQuery(req) {
  const query = {};
  if (req.query.active !== 'false') {
    query.active = true;
  }
  if (req.query.category) {
    query.category = String(req.query.category).trim();
  }
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).trim(), 'i');
    query.$or = [{ name: rx }, { description: rx }, { sku: rx }, { barcode: rx }];
  }
  return query;
}

router.get('/templates', async (_req, res) => {
  try {
    await ensureDefaults();
    const templates = await LabelPrintTemplate.find({ active: true }).sort({ printerTemplateNumber: 1 }).lean();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/items', async (req, res) => {
  try {
    await ensureDefaults();
    const items = await LabelPrintItem.find(buildQuery(req)).sort({ category: 1, name: 1 }).lean();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/items/:id', async (req, res) => {
  try {
    await ensureDefaults();
    const item = await LabelPrintItem.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/items', express.json(), async (req, res) => {
  try {
    await ensureDefaults();
    const item = new LabelPrintItem(req.body || {});
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/items/:id', express.json(), async (req, res) => {
  try {
    await ensureDefaults();
    const item = await LabelPrintItem.findByIdAndUpdate(req.params.id, { $set: req.body || {} }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/printers', async (_req, res) => {
  try {
    await ensureDefaults();
    const printers = await LabelPrintPrinter.find({ active: true }).sort({ name: 1 }).lean();
    res.json(printers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/printers/discover', async (req, res) => {
  try {
    await ensureDefaults();
    const port = clampPort(req.query.port);
    const host = String(req.query.host || '').trim();
    let targets = [];

    if (host) {
      targets = [host];
    } else {
      const prefixes = discoverPrivatePrefixes();
      for (const prefix of prefixes) {
        for (let suffix = 1; suffix <= 254; suffix += 1) {
          targets.push(`${prefix}.${suffix}`);
        }
      }
      targets = Array.from(new Set(targets));
    }

    const found = await scanHosts(targets, port);
    res.json({
      port,
      scanned: targets.length,
      results: found
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not scan network for printers.' });
  }
});

router.put('/printers/:id', express.json(), async (req, res) => {
  try {
    await ensureDefaults();
    const body = req.body || {};
    const update = {};
    ['name', 'model', 'connectionType', 'host', 'status', 'androidClientId', 'bridgeAvailable'].forEach((key) => {
      if (body[key] !== undefined) update[key] = body[key];
    });
    if (body.port !== undefined) update.port = Number(body.port) || 9100;
    if (body.serialBaudRate !== undefined) update.serialBaudRate = Number(body.serialBaudRate) || 9600;
    if (body.objectNameMap && typeof body.objectNameMap === 'object') update.objectNameMap = body.objectNameMap;
    const printer = await LabelPrintPrinter.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    res.json(printer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/printers/:id/connect-test', async (req, res) => {
  try {
    await ensureDefaults();
    const printer = await LabelPrintPrinter.findById(req.params.id);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    if (!printer.host) return res.status(400).json({ error: 'Set printer IP/host first.' });
    await testPrinterConnection(printer.host, printer.port || 9100);
    printer.status = 'ready';
    printer.lastSeenAt = new Date();
    await printer.save();
    res.json({
      ok: true,
      printer: printer.toObject(),
      message: `Connected to ${printer.host}:${printer.port || 9100}`
    });
  } catch (err) {
    const printer = await LabelPrintPrinter.findById(req.params.id).catch(() => null);
    if (printer) {
      printer.status = 'error';
      await printer.save().catch(() => {});
    }
    res.status(400).json({ error: err.message || 'Could not reach printer over the network.' });
  }
});

router.post('/print-jobs', express.json(), async (req, res) => {
  try {
    await ensureDefaults();
    const body = req.body || {};
    const clientHandled = Boolean(body.clientHandled);
    const item = body.itemId ? await LabelPrintItem.findById(body.itemId).lean() : null;
    const printer = body.printerId ? await LabelPrintPrinter.findById(body.printerId) : null;
    const template = body.templateKey
      ? await LabelPrintTemplate.findOne({ key: body.templateKey }).lean()
      : item
        ? await LabelPrintTemplate.findOne({ key: item.templateKey }).lean()
        : null;

    if (!template) return res.status(400).json({ error: 'Template not found for print job.' });
    if (!printer) return res.status(400).json({ error: 'Printer not found for print job.' });
    if (!clientHandled && !printer.host) return res.status(400).json({ error: 'Printer IP/host is not configured.' });

    const quantity = Math.max(1, Number(body.quantity) || Number(item && item.defaultQuantity) || 1);
    const requestedBy = {
      id: String(req.user._id || req.user.id || ''),
      username: req.user.username || '',
      displayName: req.user.displayName || req.user.username || ''
    };

    const job = await LabelPrintJob.create({
      item: item ? item._id : null,
      itemSnapshot: item || body.itemSnapshot || {},
      printer: printer ? printer._id : null,
      templateKey: template.key,
      printerTemplateNumber: Number(body.printerTemplateNumber) || template.printerTemplateNumber,
      quantity,
      cutMode: body.cutMode === 'no-cut' ? 'no-cut' : 'auto-cut',
      payload: body.payload || buildTemplatePayload({
        template,
        printer,
        quantity,
        cutMode: body.cutMode === 'no-cut' ? 'no-cut' : 'auto-cut'
      }),
      requestedBy,
      status: body.status || 'queued',
      bridgeResult: body.bridgeResult || {},
      error: body.error || '',
      completedAt: body.completedAt ? new Date(body.completedAt) : null
    });

    if (clientHandled) {
      job.status = body.status || 'success';
      job.bridgeResult = body.bridgeResult || {};
      job.error = body.error || '';
      job.completedAt = body.completedAt ? new Date(body.completedAt) : new Date();
      await job.save();

      printer.status = job.status === 'success' ? 'ready' : 'error';
      printer.bridgeAvailable = true;
      printer.lastSeenAt = new Date();
      await printer.save();

      res.status(201).json(job);
      return;
    }

    try {
      const printPayload = body.payload || buildTemplatePayload({
        template,
        printer,
        quantity,
        cutMode: body.cutMode === 'no-cut' ? 'no-cut' : 'auto-cut'
      });
      await sendTemplateToPrinter(printer, printPayload);
      job.status = 'success';
      job.bridgeResult = { transport: 'network-raw-tcp', host: printer.host, port: printer.port || 9100 };
      job.completedAt = new Date();
      await job.save();
      printer.status = 'ready';
      printer.lastSeenAt = new Date();
      await printer.save();
    } catch (printErr) {
      job.status = 'failed';
      job.error = printErr.message || 'Print failed';
      job.bridgeResult = { transport: 'network-raw-tcp', error: printErr.message || 'Print failed' };
      job.completedAt = new Date();
      await job.save();
      printer.status = 'error';
      await printer.save();
    }

    res.status(201).json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/print-jobs/:id', express.json(), async (req, res) => {
  try {
    const update = {};
    ['status', 'bridgeResult', 'error', 'payload', 'cutMode', 'quantity'].forEach((key) => {
      if (req.body && req.body[key] !== undefined) update[key] = req.body[key];
    });
    if (req.body && req.body.completedAt) {
      update.completedAt = new Date(req.body.completedAt);
    } else if (req.body && req.body.status && req.body.status !== 'queued') {
      update.completedAt = new Date();
    }
    const job = await LabelPrintJob.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!job) return res.status(404).json({ error: 'Print job not found' });
    res.json(job);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/print-jobs', async (req, res) => {
  try {
    await ensureDefaults();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
    const jobs = await LabelPrintJob.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(jobs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/printers/:id/test-print', express.json(), async (req, res) => {
  try {
    await ensureDefaults();
    const printer = await LabelPrintPrinter.findById(req.params.id);
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    const template = await LabelPrintTemplate.findOne({ key: 'template-1' }).lean();
    if (!template) return res.status(404).json({ error: 'Default test template not found' });
    if (!printer.host) return res.status(400).json({ error: 'Printer IP/host is not configured.' });

    const payload = {
      printerId: String(printer._id),
      printerTemplateNumber: template.printerTemplateNumber,
      copies: 1,
      cutMode: 'auto-cut'
    };

    const job = await LabelPrintJob.create({
      printer: printer._id,
      itemSnapshot: { name: 'Test Print', description: 'Printer setup validation' },
      templateKey: template.key,
      printerTemplateNumber: template.printerTemplateNumber,
      quantity: 1,
      cutMode: 'auto-cut',
      payload,
      requestedBy: {
        id: String(req.user._id || req.user.id || ''),
        username: req.user.username || '',
        displayName: req.user.displayName || req.user.username || ''
      },
      status: 'test'
    });

    try {
      await sendTemplateToPrinter(printer, payload);
      job.status = 'success';
      job.bridgeResult = { transport: 'network-raw-tcp', testPrint: true, host: printer.host, port: printer.port || 9100 };
      job.completedAt = new Date();
      await job.save();
      printer.status = 'ready';
      printer.lastSeenAt = new Date();
      await printer.save();
    } catch (err) {
      job.status = 'failed';
      job.error = err.message || 'Test print failed';
      job.completedAt = new Date();
      await job.save();
      printer.status = 'error';
      await printer.save();
      throw err;
    }

    res.json({ printer: printer.toObject(), payload, jobId: String(job._id), message: 'Test print sent.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function buildTemplatePayload({ template, printer, quantity, cutMode }) {
  return {
    printerId: String(printer._id || ''),
    templateKey: template.key,
    printerTemplateNumber: template.printerTemplateNumber,
    copies: quantity,
    cutMode,
    serialBaudRate: Number(printer.serialBaudRate) || 9600
  };
}

async function sendTemplateToPrinter(printer, payload) {
  const bytes = buildPtouchTemplateJob(printer, payload);
  await sendRawTcp(printer.host, printer.port || 9100, bytes);
}

function buildPtouchTemplateJob(printer, payload) {
  const chunks = [];
  chunks.push(Buffer.from([0x1B, 0x69, 0x61, 0x03])); // ESC i a 03h => P-touch Template mode
  chunks.push(Buffer.from('^II', 'ascii'));
  chunks.push(Buffer.from(`^TS${formatTemplateNumber(payload.printerTemplateNumber)}`, 'ascii'));
  chunks.push(Buffer.from(`^CN${String(Math.floor(payload.copies / 100) % 10)}${String(Math.floor(payload.copies / 10) % 10)}${String(payload.copies % 10)}`, 'ascii'));
  chunks.push(Buffer.from(payload.cutMode === 'no-cut' ? '^CO0010' : '^CO1011', 'ascii'));
  chunks.push(Buffer.from('^FF', 'ascii'));
  return Buffer.concat(chunks);
}

function sendRawTcp(host, port, bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.write(bytes);
      socket.end();
    });
    socket.setTimeout(5000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Timed out connecting to printer at ${host}:${port}`));
    });
    socket.on('close', (hadError) => {
      if (!hadError) resolve();
    });
    socket.on('error', (err) => reject(err));
  });
}

function testPrinterConnection(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.end();
      resolve();
    });
    socket.setTimeout(3000);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Timed out connecting to printer at ${host}:${port}`));
    });
    socket.on('error', (err) => reject(err));
  });
}

function clampPort(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 9100;
  return Math.max(1, Math.min(65535, Math.round(parsed)));
}

function formatTemplateNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '001';
  return String(Math.max(1, Math.min(255, Math.round(parsed)))).padStart(3, '0');
}

function discoverPrivatePrefixes() {
  const interfaces = os.networkInterfaces();
  const prefixes = new Set();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue;
      const address = String(entry.address || '').trim();
      if (!isPrivateIpv4(address)) continue;
      const octets = address.split('.');
      if (octets.length === 4) {
        prefixes.add(`${octets[0]}.${octets[1]}.${octets[2]}`);
      }
    }
  }

  return Array.from(prefixes);
}

function isPrivateIpv4(address) {
  const octets = address.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  if (octets[0] === 10) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  return false;
}

async function scanHosts(hosts, port) {
  const pending = [...hosts];
  const found = [];
  const concurrency = 32;

  async function worker() {
    while (pending.length) {
      const host = pending.shift();
      if (!host) return;
      try {
        await testPrinterConnection(host, port);
        const hostname = await lookupHostname(host);
        found.push({
          host,
          port,
          name: hostname || `Printer @ ${host}`,
          source: hostname ? 'reverse-dns' : 'tcp-probe'
        });
      } catch (_err) {
        // Ignore unreachable hosts.
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length || 1) }, () => worker()));
  found.sort((a, b) => a.host.localeCompare(b.host, 'en'));
  return found;
}

function lookupHostname(host) {
  return new Promise((resolve) => {
    dns.reverse(host, (err, hostnames) => {
      if (err || !Array.isArray(hostnames) || !hostnames.length) {
        resolve('');
        return;
      }
      resolve(String(hostnames[0] || ''));
    });
  });
}

module.exports = router;
