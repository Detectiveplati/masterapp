'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const router = express.Router();

const LabelPrintItem = require('../models/LabelPrintItem');
const LabelPrintDiagnosticLog = require('../models/LabelPrintDiagnosticLog');
const LabelPrintTemplate = require('../models/LabelPrintTemplate');
const LabelPrintPrinter = require('../models/LabelPrintPrinter');
const LabelPrintJob = require('../models/LabelPrintJob');
const { requireAuth, requirePermission } = require('../services/auth-middleware');

router.use(requireAuth, requirePermission('labelprint'));

let defaultsPromise = null;
const PLACEHOLDER_COUNT = 10;
const EXCEL_SOURCE_PATH = path.join(process.env.USERPROFILE || 'C:\\Users\\Zack', 'Desktop', '#05-27', 'Sauce Department.xlsx');
const BUNDLED_CATALOG_PATH = path.join(__dirname, '..', 'label-print', 'data', 'catalog.json');
const SAUCE_DEPARTMENT = {
  code: 'sauce',
  name: 'Sauce Department',
  signature: 'Sauce Department / 酱料部',
  signaturePlacement: 'bottom-right',
  signatureEmbeddedInTemplate: true
};

async function ensureDefaults() {
  if (defaultsPromise) return defaultsPromise;
  defaultsPromise = (async () => {
    const printerCount = await LabelPrintPrinter.countDocuments();
    const templateCount = await LabelPrintTemplate.countDocuments();
    const itemCount = await LabelPrintItem.countDocuments();

    if (!templateCount || !itemCount) {
      await syncCatalog();
    }

    if (!printerCount) {
      await LabelPrintPrinter.create({
        name: 'Brother QL-820NWB',
        model: 'QL-820NWB',
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
  return applyDepartmentMetadata(buildCatalogFromRows(rows), SAUCE_DEPARTMENT);
}

function readBundledCatalog() {
  if (!fs.existsSync(BUNDLED_CATALOG_PATH)) {
    return { templates: [], items: [] };
  }
  try {
    const payload = JSON.parse(fs.readFileSync(BUNDLED_CATALOG_PATH, 'utf8'));
    return applyDepartmentMetadata({
      templates: Array.isArray(payload.templates) ? payload.templates : [],
      items: Array.isArray(payload.items) ? payload.items : []
    }, SAUCE_DEPARTMENT);
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
        name: englishName || `Template ${templateNumber}`,
        nameEnglish: englishName,
        nameChinese: chineseName,
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
      nameEnglish: englishName,
      nameChinese: chineseName,
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
      nameEnglish: `Template ${number}`,
      nameChinese: '',
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
      nameEnglish: `Placeholder ${number}`,
      nameChinese: '',
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

function applyDepartmentMetadata(catalog, department) {
  if (!department) return catalog;

  return {
    templates: (catalog.templates || []).map((template) => ({
      ...template,
      departmentCode: department.code,
      departmentName: department.name,
      departmentSignature: department.signature,
      departmentSignaturePlacement: department.signaturePlacement,
      departmentSignatureEmbeddedInTemplate: department.signatureEmbeddedInTemplate
    })),
    items: (catalog.items || []).map((item) => ({
      ...item,
      departmentCode: department.code,
      departmentName: department.name
    }))
  };
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
    query.$or = [{ name: rx }, { nameEnglish: rx }, { nameChinese: rx }, { description: rx }, { sku: rx }, { barcode: rx }];
  }
  return query;
}

function deriveChineseName(item) {
  if (item && item.nameChinese) return String(item.nameChinese).trim();
  const description = String(item && item.description || '').trim();
  if (!description) return '';
  return description.split('·')[0].trim();
}

function serializeItem(item) {
  const plainItem = item && typeof item.toObject === 'function' ? item.toObject() : item;
  return {
    ...plainItem,
    nameEnglish: String(plainItem && (plainItem.nameEnglish || plainItem.name) || '').trim(),
    nameChinese: deriveChineseName(plainItem)
  };
}

async function buildTemplateUsageMap() {
  const counts = await LabelPrintItem.aggregate([
    { $match: { active: true } },
    { $group: { _id: '$templateKey', usageCount: { $sum: 1 } } }
  ]);
  return new Map(counts.map((entry) => [String(entry._id || ''), Number(entry.usageCount) || 0]));
}

function normalizeTemplateInput(input = {}, existingTemplate = null) {
  const fallbackName = String(existingTemplate && existingTemplate.name || '').trim();
  const fallbackEnglish = String(existingTemplate && existingTemplate.nameEnglish || '').trim();
  const fallbackChinese = String(existingTemplate && existingTemplate.nameChinese || '').trim();
  const fallbackDescription = String(existingTemplate && existingTemplate.description || '').trim();
  const fallbackNumber = Number(existingTemplate && existingTemplate.printerTemplateNumber) || 1;
  const fallbackHeight = Number(existingTemplate && existingTemplate.heightMm) || 62;

  const nameEnglish = String(input.nameEnglish !== undefined ? input.nameEnglish : fallbackEnglish || fallbackName).trim();
  const nameChinese = String(input.nameChinese !== undefined ? input.nameChinese : fallbackChinese).trim();
  const name = String(input.name !== undefined ? input.name : nameEnglish || fallbackName).trim() || `Template ${fallbackNumber}`;
  const description = String(input.description !== undefined ? input.description : fallbackDescription).trim();
  const printerTemplateNumber = Math.max(1, Math.min(255, Math.round(Number(input.printerTemplateNumber !== undefined ? input.printerTemplateNumber : fallbackNumber) || fallbackNumber)));
  const heightMm = [29, 62, 100].includes(Number(input.heightMm)) ? Number(input.heightMm) : fallbackHeight;

  return {
    key: String(input.key !== undefined ? input.key : existingTemplate && existingTemplate.key || `template-${printerTemplateNumber}`).trim() || `template-${printerTemplateNumber}`,
    name,
    nameEnglish,
    nameChinese,
    description,
    printerTemplateNumber,
    mediaWidthMm: Number(input.mediaWidthMm !== undefined ? input.mediaWidthMm : existingTemplate && existingTemplate.mediaWidthMm) || 62,
    printWidthMm: Number(input.printWidthMm !== undefined ? input.printWidthMm : existingTemplate && existingTemplate.printWidthMm) || 58,
    heightMm,
    active: input.active !== undefined ? Boolean(input.active) : existingTemplate ? existingTemplate.active !== false : true,
    preview: {
      widthMm: Number(input.preview && input.preview.widthMm !== undefined ? input.preview.widthMm : existingTemplate && existingTemplate.preview && existingTemplate.preview.widthMm) || 58,
      heightMm: Number(input.preview && input.preview.heightMm !== undefined ? input.preview.heightMm : existingTemplate && existingTemplate.preview && existingTemplate.preview.heightMm) || heightMm
    },
    departmentCode: String(input.departmentCode !== undefined ? input.departmentCode : existingTemplate && existingTemplate.departmentCode || '').trim(),
    departmentName: String(input.departmentName !== undefined ? input.departmentName : existingTemplate && existingTemplate.departmentName || '').trim(),
    departmentSignature: String(input.departmentSignature !== undefined ? input.departmentSignature : existingTemplate && existingTemplate.departmentSignature || '').trim(),
    departmentSignaturePlacement: String(input.departmentSignaturePlacement !== undefined ? input.departmentSignaturePlacement : existingTemplate && existingTemplate.departmentSignaturePlacement || '').trim(),
    departmentSignatureEmbeddedInTemplate: input.departmentSignatureEmbeddedInTemplate !== undefined
      ? Boolean(input.departmentSignatureEmbeddedInTemplate)
      : Boolean(existingTemplate && existingTemplate.departmentSignatureEmbeddedInTemplate),
    supportedOptions: {
      autoCut: input.supportedOptions && input.supportedOptions.autoCut !== undefined
        ? Boolean(input.supportedOptions.autoCut)
        : !(existingTemplate && existingTemplate.supportedOptions) || existingTemplate.supportedOptions.autoCut !== false,
      noCut: input.supportedOptions && input.supportedOptions.noCut !== undefined
        ? Boolean(input.supportedOptions.noCut)
        : !(existingTemplate && existingTemplate.supportedOptions) || existingTemplate.supportedOptions.noCut !== false
    },
    fieldSchema: Array.isArray(input.fieldSchema) ? input.fieldSchema : (existingTemplate && existingTemplate.fieldSchema) || []
  };
}

router.get('/templates', async (_req, res) => {
  try {
    await ensureDefaults();
    const includeInactive = _req.query.active === 'false';
    const query = includeInactive ? {} : { active: true };
    const templates = await LabelPrintTemplate.find(query).sort({ printerTemplateNumber: 1 }).lean();
    const usageMap = await buildTemplateUsageMap();
    res.json(templates.map((template) => ({
      ...template,
      nameEnglish: template.nameEnglish || template.name || '',
      nameChinese: template.nameChinese || '',
      usageCount: usageMap.get(String(template.key || '')) || 0
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/templates/:id', async (req, res) => {
  try {
    await ensureDefaults();
    const template = await LabelPrintTemplate.findById(req.params.id).lean();
    if (!template) return res.status(404).json({ error: 'Template not found' });
    const usageMap = await buildTemplateUsageMap();
    res.json({
      ...template,
      nameEnglish: template.nameEnglish || template.name || '',
      nameChinese: template.nameChinese || '',
      usageCount: usageMap.get(String(template.key || '')) || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/templates', express.json(), async (req, res) => {
  try {
    await ensureDefaults();
    const payload = normalizeTemplateInput(req.body || {});
    const collision = await LabelPrintTemplate.findOne({
      $or: [
        { key: payload.key },
        { printerTemplateNumber: payload.printerTemplateNumber }
      ]
    }).lean();
    if (collision) {
      return res.status(400).json({ error: 'A template with this key or printer template number already exists.' });
    }
    const template = await LabelPrintTemplate.create(payload);
    res.status(201).json(template);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/templates/:id', express.json(), async (req, res) => {
  try {
    await ensureDefaults();
    const existingTemplate = await LabelPrintTemplate.findById(req.params.id);
    if (!existingTemplate) return res.status(404).json({ error: 'Template not found' });

    const payload = normalizeTemplateInput(req.body || {}, existingTemplate.toObject());
    const collision = await LabelPrintTemplate.findOne({
      _id: { $ne: existingTemplate._id },
      $or: [
        { key: payload.key },
        { printerTemplateNumber: payload.printerTemplateNumber }
      ]
    }).lean();
    if (collision) {
      return res.status(400).json({ error: 'Another template already uses this key or printer template number.' });
    }

    Object.assign(existingTemplate, payload);
    await existingTemplate.save();
    res.json(existingTemplate);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/items', async (req, res) => {
  try {
    await ensureDefaults();
    const items = await LabelPrintItem.find(buildQuery(req)).sort({ category: 1, name: 1 }).lean();
    res.json(items.map(serializeItem));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/items/:id', async (req, res) => {
  try {
    await ensureDefaults();
    const item = await LabelPrintItem.findById(req.params.id).lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(serializeItem(item));
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

router.put('/printers/:id', express.json(), async (req, res) => {
  try {
    await ensureDefaults();
    const body = req.body || {};
    const update = {};
    ['name', 'model', 'status', 'androidClientId', 'bridgeAvailable'].forEach((key) => {
      if (body[key] !== undefined) update[key] = body[key];
    });
    if (body.serialBaudRate !== undefined) update.serialBaudRate = Number(body.serialBaudRate) || 9600;
    if (body.objectNameMap && typeof body.objectNameMap === 'object') update.objectNameMap = body.objectNameMap;
    const printer = await LabelPrintPrinter.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
    if (!printer) return res.status(404).json({ error: 'Printer not found' });
    res.json(printer);
  } catch (err) {
    res.status(400).json({ error: err.message });
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
    if (!clientHandled) {
      return res.status(400).json({ error: 'Only client-handled Bluetooth print logging is supported.' });
    }

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
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/diagnostic-logs', express.json({ limit: '64kb' }), async (req, res) => {
  try {
    await ensureDefaults();
    const body = req.body || {};
    const log = await LabelPrintDiagnosticLog.create({
      source: String(body.source || 'client').trim() || 'client',
      level: ['info', 'warn', 'error'].includes(body.level) ? body.level : 'info',
      eventType: String(body.eventType || 'runtime').trim() || 'runtime',
      message: String(body.message || '').slice(0, 600),
      details: body.details || {},
      device: {
        sessionId: String(body.device && body.device.sessionId || '').slice(0, 120),
        userAgent: String(body.device && body.device.userAgent || '').slice(0, 500),
        origin: String(body.device && body.device.origin || '').slice(0, 200),
        href: String(body.device && body.device.href || '').slice(0, 500),
        displayMode: String(body.device && body.device.displayMode || '').slice(0, 80)
      },
      runtime: body.runtime || {},
      requestedBy: {
        id: String(req.user._id || req.user.id || ''),
        username: req.user.username || '',
        displayName: req.user.displayName || req.user.username || ''
      }
    });
    res.status(201).json({ ok: true, id: String(log._id) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Could not save diagnostic log.' });
  }
});

router.get('/diagnostic-logs', async (req, res) => {
  try {
    await ensureDefaults();
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
    const query = {};
    if (req.query.sessionId) query['device.sessionId'] = String(req.query.sessionId);
    if (req.query.level) query.level = String(req.query.level);
    if (req.query.eventType) query.eventType = String(req.query.eventType);

    const logs = await LabelPrintDiagnosticLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Could not load diagnostic logs.' });
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

module.exports = router;
