'use strict';
const express = require('express');
const router = express.Router();
const FoodSafetyChecklistMonth = require('../models/FoodSafetyChecklistMonth');
const FoodSafetyFormAssignment = require('../models/FoodSafetyFormAssignment');
const {
  requireAuth,
  requirePermission,
  requireAnyPermission,
  requireFoodSafetyFormsAssignedAccess
} = require('../services/auth-middleware');
const { logFoodSafetyDebug, readFoodSafetyDebugLines, LOG_FILE } = require('../services/foodsafety-debug-log');
const {
  TEMPLATES,
  DEFAULT_TEMPLATE,
  DEFAULT_TEMPLATE_CODE,
  DEFAULT_UNIT_CODE,
  getTemplateByUnit,
  getTemplateByCode,
  getUnit,
  buildEmptyMonthData,
  calculateProgress,
  getDaysInMonth,
  getWeekCount,
  sanitizeMonthData
} = require('../config/foodSafetyChecklistTemplate');

function parseMonthKey(raw) {
  const value = String(raw || '').trim();
  if (/^\d{4}-\d{2}$/.test(value)) return value;
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function parseMonthParts(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return { year, month };
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMissingFormStatus(template, monthKey) {
  if (!template || template.periodType !== 'monthly') return 'due';
  return monthKey < currentMonthKey() ? 'due' : 'not_due';
}

function makeActor(req) {
  return {
    userId: String(req.user && (req.user.id || req.user._id) || ''),
    name: String(req.user && (req.user.displayName || req.user.username) || 'Unknown User'),
    position: String(req.user && req.user.position || ''),
    at: new Date()
  };
}

function isFinalizedOrVerified(status) {
  return status === 'finalized' || status === 'verified';
}

function resolveTemplateAndUnit(unitCode, templateCode) {
  const template = templateCode ? getTemplateByCode(templateCode) : getTemplateByUnit(unitCode || DEFAULT_UNIT_CODE);
  const unit = getUnit(template, unitCode || DEFAULT_UNIT_CODE);
  return { template, unit };
}

function getEntryPath(template) {
  return template.formType === 'log_entries' ? '/foodsafety-forms/log' : '/foodsafety-forms/checklists';
}

function getEntryUrl(template, monthKey, unitCode) {
  return `${getEntryPath(template)}?template=${encodeURIComponent(template.code)}&month=${encodeURIComponent(monthKey)}&unit=${encodeURIComponent(unitCode)}`;
}

function getPdfUrl(templateCode, monthKey, unitCode) {
  return `/api/foodsafety-checklists/month/report.pdf?template=${encodeURIComponent(templateCode)}&month=${encodeURIComponent(monthKey)}&unit=${encodeURIComponent(unitCode)}`;
}

async function ensureMonthRecord(monthKey, unitCode, templateCode) {
  const { template, unit } = resolveTemplateAndUnit(unitCode, templateCode);
  const existing = await FoodSafetyChecklistMonth.findOne({
    templateCode: template.code,
    monthKey,
    unitCode: unit.code
  });
  if (existing) return existing;

  const { year, month } = parseMonthParts(monthKey);
  const progress = calculateProgress(template, {}, monthKey);
  return FoodSafetyChecklistMonth.create({
    templateCode: template.code,
    templateVersion: template.revision,
    formType: template.formType,
    periodType: template.periodType,
    unitCode: unit.code,
    unitLabel: unit.label,
    monthKey,
    year,
    month,
    daysInMonth: getDaysInMonth(monthKey),
    status: 'draft',
    data: buildEmptyMonthData(template, monthKey),
    progress
  });
}

function serializeRecord(record) {
  const template = getTemplateByCode(record.templateCode);
  return {
    _id: record._id,
    templateCode: record.templateCode,
    templateVersion: record.templateVersion,
    formType: template.formType,
    periodType: template.periodType,
    unitCode: record.unitCode,
    unitLabel: record.unitLabel,
    monthKey: record.monthKey,
    year: record.year,
    month: record.month,
    daysInMonth: record.daysInMonth,
    status: record.status,
    data: sanitizeMonthData(template, record.data, record.monthKey),
    progress: record.progress || calculateProgress(template, record.data, record.monthKey),
    lastEditedBy: record.lastEditedBy || {},
    finalizedBy: record.finalizedBy || {},
    finalization: record.finalization || {},
    verification: record.verification || {},
    reportArchive: record.reportArchive ? {
      fileName: record.reportArchive.fileName || '',
      contentType: record.reportArchive.contentType || 'application/pdf',
      size: record.reportArchive.size || 0,
      generatedAt: record.reportArchive.generatedAt || null
    } : {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function toAssignmentSummary(assignment, monthKey) {
  const template = getTemplateByCode(assignment.templateCode);
  const unit = getUnit(template, assignment.unitCode);
  return {
    assignmentId: `${assignment._id || assignment.userId}:${template.code}:${monthKey}`,
    templateCode: template.code,
    templateTitle: template.title,
    templateTitleZh: template.titleZh,
    formType: template.formType,
    category: template.category,
    categoryZh: template.categoryZh,
    frequency: template.periodType,
    monthKey,
    monthLabel: monthKey,
    unitCode: unit.code,
    unitLabel: unit.label,
    unitLabelZh: unit.labelZh || unit.label,
    assignedTo: assignment.displayName || assignment.username || '',
    assignedPosition: assignment.position || '',
    status: assignment.active === false ? 'inactive' : 'active',
    entryUrl: getEntryUrl(template, monthKey, unit.code)
  };
}

function buildLibrarySummaries(monthKey, actor) {
  return TEMPLATES.flatMap((template) => (template.unitOptions || []).map((unit) => ({
    assignmentId: `${actor.userId}:${template.code}:${unit.code}:${monthKey}`,
    templateCode: template.code,
    templateTitle: template.title,
    templateTitleZh: template.titleZh,
    formType: template.formType,
    category: template.category,
    categoryZh: template.categoryZh,
    frequency: template.periodType,
    monthKey,
    monthLabel: monthKey,
    unitCode: unit.code,
    unitLabel: unit.label,
    unitLabelZh: unit.labelZh || unit.label,
    assignedTo: actor.name,
    assignedPosition: actor.position || '',
    status: 'active',
    entryUrl: getEntryUrl(template, monthKey, unit.code)
  })));
}

router.get('/meta', requireAuth, requireAnyPermission(['foodsafetyforms', 'foodsafety']), async (_req, res) => {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const allUnitOptions = TEMPLATES.flatMap((template) => (template.unitOptions || []).map((unit) => ({
    templateCode: template.code,
    unitCode: unit.code,
    label: unit.label,
    labelZh: unit.labelZh || unit.label
  })));
  res.json({
    template: DEFAULT_TEMPLATE,
    templates: TEMPLATES.map((template) => ({
      code: template.code,
      formType: template.formType,
      periodType: template.periodType,
      revision: template.revision,
      title: template.title,
      titleZh: template.titleZh,
      unitOptions: template.unitOptions
    })),
    allUnitOptions,
    defaults: {
      templateCode: DEFAULT_TEMPLATE_CODE,
      unitCode: DEFAULT_UNIT_CODE,
      monthKey
    }
  });
});

router.get('/forms-summary', requireAuth, requireAnyPermission(['foodsafetyforms', 'foodsafety']), async (req, res) => {
  try {
    const now = new Date();
    const monthKey = parseMonthKey(req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const actor = makeActor(req);
    let assignments = [];
    const canSeeAllForms = Boolean(req.user && (
      req.user.role === 'admin' ||
      (req.user.permissions && req.user.permissions.foodsafety)
    ));
    if (canSeeAllForms) {
      assignments = buildLibrarySummaries(monthKey, actor);
    } else {
      assignments = await FoodSafetyFormAssignment.find({ userId: actor.userId, active: true }).lean();
      assignments = assignments.map((assignment) => toAssignmentSummary(assignment, monthKey));
    }
    logFoodSafetyDebug('forms-summary', {
      username: req.user && req.user.username,
      role: req.user && req.user.role,
      monthKey,
      count: assignments.length,
      mode: canSeeAllForms ? 'library' : 'assigned'
    });
    res.json({
      monthKey,
      assignments
    });
  } catch (err) {
    logFoodSafetyDebug('forms-summary-error', {
      username: req.user && req.user.username,
      role: req.user && req.user.role,
      error: err.message
    });
    res.status(500).json({ error: err.message });
  }
});

const requireAssignedChecklistAccessFromQuery = requireFoodSafetyFormsAssignedAccess((req) => ({
  templateCode: req.query.template,
  unitCode: req.query.unit,
  monthKey: parseMonthKey(req.query.month)
}));

const requireAssignedChecklistAccessFromBody = requireFoodSafetyFormsAssignedAccess((req) => ({
  templateCode: req.body.templateCode,
  unitCode: req.body.unitCode,
  monthKey: parseMonthKey(req.body.monthKey)
}));

router.get('/reports-summary', requireAuth, requirePermission('foodsafety'), async (req, res) => {
  try {
    const monthKey = req.query.month ? parseMonthKey(req.query.month) : parseMonthKey(new Date());
    const status = String(req.query.status || '').trim();
    const filter = { monthKey };
    if (status && status !== 'due' && status !== 'not_due') filter.status = status;

    const records = await FoodSafetyChecklistMonth.find(filter).sort({ monthKey: -1, unitCode: 1 }).lean();
    const byUnit = new Map(records.map((record) => [`${record.templateCode}:${record.unitCode}`, record]));
    const actor = makeActor(req);
    const library = buildLibrarySummaries(monthKey, actor);
    const items = library.map((summary) => {
      const record = byUnit.get(`${summary.templateCode}:${summary.unitCode}`);
      if (!record) {
        const missingStatus = getMissingFormStatus(getTemplateByCode(summary.templateCode), summary.monthKey);
        return {
          _id: '',
          templateCode: summary.templateCode,
          templateTitle: summary.templateTitle,
          templateTitleZh: summary.templateTitleZh,
          formType: summary.formType,
          category: summary.category,
          categoryZh: summary.categoryZh,
          unitCode: summary.unitCode,
          unitLabel: summary.unitLabel,
          monthKey: summary.monthKey,
          status: missingStatus,
          submittedAt: null,
          submittedBy: '',
          verifiedAt: null,
          verifiedBy: '',
          archivedAt: null,
          archiveSize: 0,
          pdfUrl: '',
          entryUrl: summary.entryUrl
        };
      }
      const template = getTemplateByCode(record.templateCode);
      return {
        _id: String(record._id),
        templateCode: record.templateCode,
        templateTitle: template.title,
        templateTitleZh: template.titleZh,
        formType: template.formType,
        category: template.category,
        categoryZh: template.categoryZh,
        unitCode: record.unitCode,
        unitLabel: record.unitLabel,
        monthKey: record.monthKey,
        status: record.status,
        submittedAt: record.finalization && record.finalization.at ? record.finalization.at : null,
        submittedBy: record.finalization && record.finalization.name ? record.finalization.name : '',
        verifiedAt: record.verification && record.verification.at ? record.verification.at : null,
        verifiedBy: record.verification && record.verification.name ? record.verification.name : '',
        archivedAt: record.reportArchive && record.reportArchive.generatedAt ? record.reportArchive.generatedAt : null,
        archiveSize: record.reportArchive && record.reportArchive.size ? record.reportArchive.size : 0,
        pdfUrl: getPdfUrl(record.templateCode, record.monthKey, record.unitCode),
        entryUrl: getEntryUrl(template, record.monthKey, record.unitCode)
      };
    });

    for (const record of records) {
      const key = `${record.templateCode}:${record.unitCode}`;
      if (items.some((item) => `${item.templateCode}:${item.unitCode}` === key)) continue;
      const template = getTemplateByCode(record.templateCode);
      items.push({
        _id: String(record._id),
        templateCode: record.templateCode,
        templateTitle: template.title,
        templateTitleZh: template.titleZh,
        formType: template.formType,
        category: template.category,
        categoryZh: template.categoryZh,
        unitCode: record.unitCode,
        unitLabel: record.unitLabel,
        monthKey: record.monthKey,
        status: record.status,
        submittedAt: record.finalization && record.finalization.at ? record.finalization.at : null,
        submittedBy: record.finalization && record.finalization.name ? record.finalization.name : '',
        verifiedAt: record.verification && record.verification.at ? record.verification.at : null,
        verifiedBy: record.verification && record.verification.name ? record.verification.name : '',
        archivedAt: record.reportArchive && record.reportArchive.generatedAt ? record.reportArchive.generatedAt : null,
        archiveSize: record.reportArchive && record.reportArchive.size ? record.reportArchive.size : 0,
        pdfUrl: getPdfUrl(record.templateCode, record.monthKey, record.unitCode),
        entryUrl: getEntryUrl(template, record.monthKey, record.unitCode)
      });
    }

    const filteredItems = items.filter((item) => !status || item.status === status);
    logFoodSafetyDebug('reports-summary', {
      username: req.user && req.user.username,
      role: req.user && req.user.role,
      monthKey,
      status: status || 'all',
      recordCount: records.length,
      itemCount: filteredItems.length
    });

    res.json({ items: filteredItems });
  } catch (err) {
    console.error('✗ [FoodSafety Checklists] GET /reports-summary:', err.message);
    logFoodSafetyDebug('reports-summary-error', {
      username: req.user && req.user.username,
      role: req.user && req.user.role,
      error: err.message
    });
    res.status(500).json({ error: err.message });
  }
});

router.get('/month', requireAssignedChecklistAccessFromQuery, async (req, res) => {
  try {
    const monthKey = parseMonthKey(req.query.month);
    const unitCode = String(req.query.unit || DEFAULT_UNIT_CODE);
    const templateCode = String(req.query.template || '').trim();
    const record = await ensureMonthRecord(monthKey, unitCode, templateCode);
    const template = getTemplateByCode(record.templateCode);
    res.json({
      template: {
        ...template,
        dayCount: getDaysInMonth(monthKey),
        weekCount: getWeekCount(monthKey),
        print: template.paper
      },
      record: serializeRecord(record)
    });
  } catch (err) {
    console.error('✗ [FoodSafety Checklists] GET /month:', err.message);
    logFoodSafetyDebug('month-load-error', {
      username: req.user && req.user.username,
      role: req.user && req.user.role,
      monthKey: req.query.month,
      unitCode: req.query.unit,
      error: err.message
    });
    res.status(500).json({ error: err.message });
  }
});

router.get('/debug/logs', requireAuth, requirePermission('foodsafety'), async (req, res) => {
  const limit = Number(req.query.limit) || 200;
  res.json({
    logFile: LOG_FILE,
    lines: readFoodSafetyDebugLines(limit)
  });
});

router.put('/month', requireAssignedChecklistAccessFromBody, async (req, res) => {
  try {
    const monthKey = parseMonthKey(req.body.monthKey);
    const unitCode = String(req.body.unitCode || DEFAULT_UNIT_CODE);
    const templateCode = String(req.body.templateCode || '').trim();
    const actor = makeActor(req);
    const { template, unit } = resolveTemplateAndUnit(unitCode, templateCode);
    const { year, month } = parseMonthParts(monthKey);
    const data = sanitizeMonthData(template, req.body.data, monthKey);
    if (template.formType === 'matrix_monthly') {
      for (const section of template.sections) {
        data[section.id].lastEditedAt = actor.at;
        data[section.id].lastEditedById = actor.userId;
        data[section.id].lastEditedByName = actor.name;
      }
    } else {
      data.lastEditedAt = actor.at;
      data.lastEditedById = actor.userId;
      data.lastEditedByName = actor.name;
    }

    const progress = calculateProgress(template, data, monthKey);
    const updateDoc = {
      templateVersion: template.revision,
      formType: template.formType,
      periodType: template.periodType,
      unitLabel: unit.label,
      year,
      month,
      daysInMonth: getDaysInMonth(monthKey),
      data,
      progress,
      lastEditedBy: actor
    };
    if (req.body.keepStatus !== true) {
      updateDoc.status = 'draft';
    }
    const record = await FoodSafetyChecklistMonth.findOneAndUpdate(
      { templateCode: template.code, monthKey, unitCode: unit.code },
      {
        $set: updateDoc,
        $setOnInsert: { templateCode: template.code, unitCode: unit.code }
      },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ ok: true, record: serializeRecord(record) });
  } catch (err) {
    console.error('✗ [FoodSafety Checklists] PUT /month:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/month/finalize', requireAssignedChecklistAccessFromBody, async (req, res) => {
  try {
    const monthKey = parseMonthKey(req.body.monthKey);
    const unitCode = String(req.body.unitCode || DEFAULT_UNIT_CODE);
    const templateCode = String(req.body.templateCode || '').trim();
    const actor = makeActor(req);
    const { template } = resolveTemplateAndUnit(unitCode, templateCode);
    const signerName = String(req.body.signerName || actor.name).trim();
    const typedSignature = String(req.body.typedSignature || '').trim();
    const signatureDataUrl = String(req.body.signatureDataUrl || '').trim();
    const confirmed = req.body.confirmed === true;
    if (!confirmed) return res.status(400).json({ error: 'Finalization confirmation is required' });
    if (!signerName) return res.status(400).json({ error: 'Signer name is required' });
    if (!signatureDataUrl) return res.status(400).json({ error: 'Filler signature is required' });
    const record = await ensureMonthRecord(monthKey, unitCode, templateCode);
    record.status = 'finalized';
    record.finalizedBy = actor;
    record.lastEditedBy = actor;
    record.progress = calculateProgress(template, record.data, monthKey);
    record.finalization = {
      userId: actor.userId,
      name: signerName,
      position: String(req.body.signerPosition || actor.position || ''),
      roleLabel: 'Filled By',
      typedSignature,
      signatureDataUrl,
      confirmed: true,
      at: actor.at
    };
    if (!record.verification || !record.verification.roleLabel) {
      record.verification = { roleLabel: 'Verified By' };
    }
    await record.save();
    res.json({ ok: true, record: serializeRecord(record) });
  } catch (err) {
    console.error('✗ [FoodSafety Checklists] POST /month/finalize:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/month/reopen', requireAssignedChecklistAccessFromBody, async (req, res) => {
  try {
    const monthKey = parseMonthKey(req.body.monthKey);
    const unitCode = String(req.body.unitCode || DEFAULT_UNIT_CODE);
    const templateCode = String(req.body.templateCode || '').trim();
    const actor = makeActor(req);
    const record = await ensureMonthRecord(monthKey, unitCode, templateCode);
    record.status = 'draft';
    record.lastEditedBy = actor;
    record.finalizedBy = { userId: '', name: '', at: null };
    record.finalization = { userId: '', name: '', position: '', roleLabel: 'Filled By', typedSignature: '', signatureDataUrl: '', confirmed: false, at: null };
    record.verification = { userId: '', name: '', position: '', roleLabel: 'Verified By', typedSignature: '', signatureDataUrl: '', confirmed: false, at: null };
    await record.save();
    res.json({ ok: true, record: serializeRecord(record) });
  } catch (err) {
    console.error('✗ [FoodSafety Checklists] POST /month/reopen:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.post('/month/verify', requireAuth, requirePermission('foodsafety'), async (req, res) => {
  try {
    const monthKey = parseMonthKey(req.body.monthKey);
    const unitCode = String(req.body.unitCode || DEFAULT_UNIT_CODE);
    const templateCode = String(req.body.templateCode || '').trim();
    const actor = makeActor(req);
    const verifierName = String(req.body.verifierName || actor.name).trim();
    const typedSignature = String(req.body.typedSignature || '').trim();
    const signatureDataUrl = String(req.body.signatureDataUrl || '').trim();
    const confirmed = req.body.confirmed === true;
    if (!confirmed) return res.status(400).json({ error: 'Verification confirmation is required' });
    if (!verifierName) return res.status(400).json({ error: 'Verifier name is required' });
    if (!signatureDataUrl) return res.status(400).json({ error: 'Verifier signature is required' });
    const record = await ensureMonthRecord(monthKey, unitCode, templateCode);
    if (!isFinalizedOrVerified(record.status)) {
      return res.status(400).json({ error: 'Form must be submitted before verification' });
    }
    record.status = 'verified';
    record.lastEditedBy = actor;
    record.verification = {
      userId: actor.userId,
      name: verifierName,
      position: String(req.body.verifierPosition || actor.position || ''),
      roleLabel: 'Verified By',
      typedSignature,
      signatureDataUrl,
      confirmed: true,
      at: actor.at
    };
    await record.save();
    res.json({ ok: true, record: serializeRecord(record) });
  } catch (err) {
    console.error('✗ [FoodSafety Checklists] POST /month/verify:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.get('/month/report', requireAssignedChecklistAccessFromQuery, async (req, res) => {
  try {
    const monthKey = parseMonthKey(req.query.month);
    const unitCode = String(req.query.unit || DEFAULT_UNIT_CODE);
    const templateCode = String(req.query.template || '').trim();
    const record = await ensureMonthRecord(monthKey, unitCode, templateCode);
    const template = getTemplateByCode(record.templateCode);
    res.json({
      template: {
        ...template,
        dayCount: getDaysInMonth(monthKey),
        weekCount: getWeekCount(monthKey),
        print: template.paper
      },
      record: serializeRecord(record)
    });
  } catch (err) {
    console.error('✗ [FoodSafety Checklists] GET /month/report:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
