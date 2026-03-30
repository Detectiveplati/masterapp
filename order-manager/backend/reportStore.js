const { ObjectId } = require("mongodb");

const { getDb } = require("./db");
const { getCurrentDateInTimeZone } = require("./dateUtils");

let indexPromise = null;
const RUN_COLLECTION = "order_manager_extraction_runs";
const REPORT_DATE_CACHE_TTL_MS = 60 * 1000;
let reportDateCache = {
  expiresAt: 0,
  values: null
};

async function getReadyDb() {
  const db = await getDb();
  if (!indexPromise) {
    indexPromise = ensureIndexes(db);
  }
  await indexPromise;
  return db;
}

async function ensureIndexes(db) {
  await db.collection(RUN_COLLECTION).createIndexes([
    { key: { extractedAt: -1 } },
    { key: { reportDate: -1, extractedAt: -1 } },
    { key: { reportType: 1, extractedAt: -1 } },
    { key: { reportType: 1, reportDate: 1, extractedAt: -1 } },
    { key: { reportType: 1, reportDate: 1, runType: 1 } }
  ]);
}

async function saveExtractionResult(extraction, meta = {}) {
  const db = await getReadyDb();
  const reportDate = normalizeDate(meta.reportDate || extraction.reportDate || "");
  const runType = normalizeRunType(meta.runType || extraction.runType || "manual");
  const runDocument = {
    reportType: extraction.reportType,
    extractedAt: extraction.extractedAt,
    reportDate,
    runType,
    sourceUrl: extraction.sourceUrl || "",
    sectionCount: extraction.sectionCount || 0,
    sections: extraction.sections || [],
    csvRows: extraction.csvRows || [],
    mergeSummary: extraction.mergeSummary || null,
    refreshSummary: extraction.refreshSummary || null,
    outputFiles: extraction.outputFiles || null,
    baselineRunId: meta.baselineRunId ? String(meta.baselineRunId) : "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const collection = db.collection(RUN_COLLECTION);
  const filter = reportDate && runType !== "manual"
    ? { reportType: runDocument.reportType, reportDate, runType }
    : { reportType: runDocument.reportType, extractedAt: runDocument.extractedAt };

  await collection.updateOne(filter, { $set: runDocument }, { upsert: true });
  reportDateCache = {
    expiresAt: 0,
    values: null
  };

  return collection.findOne(filter, buildFindOptions({ sort: { extractedAt: -1 } }));
}

async function getLatestExtractionRun(options = {}) {
  const db = await getReadyDb();
  return db.collection(RUN_COLLECTION).findOne(
    { reportType: "combined" },
    buildFindOptions({ sort: { extractedAt: -1 } }, options)
  );
}

async function getRunById(runId, options = {}) {
  const db = await getReadyDb();
  if (!ObjectId.isValid(String(runId || "").trim())) {
    return null;
  }

  return db.collection(RUN_COLLECTION).findOne(
    {
      _id: new ObjectId(String(runId).trim()),
      reportType: "combined"
    },
    buildFindOptions({}, options)
  );
}

async function findRunByDateAndType(reportDate, runType, options = {}) {
  const db = await getReadyDb();
  const normalizedDate = normalizeDate(reportDate);
  const normalizedType = normalizeRunType(runType);
  if (!normalizedDate || !normalizedType) {
    return null;
  }

  return db.collection(RUN_COLLECTION).findOne(
    { reportType: "combined", reportDate: normalizedDate, runType: normalizedType },
    buildFindOptions({ sort: { extractedAt: -1 } }, options)
  );
}

async function listExtractionRuns() {
  const db = await getReadyDb();
  const runs = await db.collection(RUN_COLLECTION)
    .find({ reportType: "combined" })
    .project({
      extractedAt: 1,
      reportDate: 1,
      runType: 1,
      sectionCount: 1,
      mergeSummary: 1,
      refreshSummary: 1
    })
    .sort({ extractedAt: -1 })
    .toArray();

  return runs.map((run) => ({
    id: String(run._id),
    reportDate: run.reportDate || "",
    extractedAt: run.extractedAt,
    runType: normalizeRunType(run.runType || "manual"),
    sectionCount: run.sectionCount || 0,
    matchedRowCount: run.mergeSummary ? run.mergeSummary.matchedRowCount : 0,
    updateCount: run.refreshSummary ? (run.refreshSummary.editedRowCount + run.refreshSummary.newRowCount) : 0,
    label: buildRunLabel(run)
  }));
}

async function listAvailableReportDates() {
  if (reportDateCache.values && Date.now() < reportDateCache.expiresAt) {
    return reportDateCache.values.slice();
  }

  const db = await getReadyDb();
  const collection = db.collection(RUN_COLLECTION);
  const topLevelDates = await collection.distinct("reportDate", {
    reportType: "combined",
    reportDate: { $type: "string", $ne: "" }
  });
  const fallbackRowDates = topLevelDates.length
    ? []
    : await collection.distinct("csvRows.reportDate", {
        reportType: "combined",
        "csvRows.reportDate": { $type: "string", $ne: "" }
      });

  const dates = Array.from(new Set([...(topLevelDates || []), ...(fallbackRowDates || [])]))
    .filter((date) => normalizeDate(date))
    .sort();

  reportDateCache = {
    expiresAt: Date.now() + REPORT_DATE_CACHE_TTL_MS,
    values: dates
  };

  return dates.slice();
}

async function findPreferredExtractionRun(requestedRunId = "", requestedDate = "", options = {}) {
  const db = await getReadyDb();
  const collection = db.collection(RUN_COLLECTION);
  const normalizedDate = normalizeDate(requestedDate);

  const selectedRun = await getRunById(requestedRunId, options);
  if (selectedRun && (!normalizedDate || selectedRun.reportDate === normalizedDate)) {
    return selectedRun;
  }

  if (normalizedDate) {
    const runForDate = await collection.findOne(
      { reportType: "combined", reportDate: normalizedDate },
      buildFindOptions({ sort: { extractedAt: -1 } }, options)
    );
    if (runForDate) {
      return runForDate;
    }
  }

  const today = getCurrentDateInTimeZone();
  const todayRun = await collection.findOne(
    { reportType: "combined", reportDate: today },
    buildFindOptions({ sort: { extractedAt: -1 } }, options)
  );
  if (todayRun) {
    return todayRun;
  }

  return getLatestExtractionRun(options);
}

async function findLatestExtractionRunForDate(requestedDate = "", options = {}) {
  const db = await getReadyDb();
  const collection = db.collection(RUN_COLLECTION);
  const normalizedDate = normalizeDate(requestedDate);

  if (normalizedDate) {
    const runForDate = await collection.findOne(
      { reportType: "combined", reportDate: normalizedDate },
      buildFindOptions({ sort: { extractedAt: -1 } }, options)
    );
    if (runForDate) {
      return runForDate;
    }
  }

  const today = getCurrentDateInTimeZone();
  const todayRun = await collection.findOne(
    { reportType: "combined", reportDate: today },
    buildFindOptions({ sort: { extractedAt: -1 } }, options)
  );
  if (todayRun) {
    return todayRun;
  }

  return getLatestExtractionRun(options);
}

function summarizeResult(run) {
  if (!run) {
    return null;
  }

  const sections = Array.isArray(run.sections) ? run.sections : [];
  const chefs = Array.isArray(run.chefs) && run.chefs.length
    ? run.chefs
    : sections.map((section) => section.chef).filter(Boolean);

  return {
    reportId: String(run._id),
    reportDate: run.reportDate || "",
    runType: normalizeRunType(run.runType || "manual"),
    extractedAt: run.extractedAt,
    reportType: run.reportType,
    sourceUrl: run.sourceUrl,
    sectionCount: run.sectionCount,
    rowCount: Array.isArray(run.rows) ? run.rows.length : countSectionRows(sections),
    entryCount: Array.isArray(run.entries) ? run.entries.length : countSectionEntries(sections),
    mergeSummary: run.mergeSummary || null,
    refreshSummary: run.refreshSummary || null,
    chefs,
    sections,
    outputFiles: run.outputFiles || null
  };
}

function buildFindOptions(baseOptions, options = {}) {
  const nextOptions = { ...(baseOptions || {}) };
  if (options && options.projection) {
    nextOptions.projection = options.projection;
  }
  return nextOptions;
}

function countSectionRows(sections) {
  return sections.reduce((sum, section) => sum + (Array.isArray(section.rows) ? section.rows.length : 0), 0);
}

function countSectionEntries(sections) {
  return sections.reduce((sum, section) => sum + (Array.isArray(section.entries) ? section.entries.length : 0), 0);
}

function buildRunLabel(run) {
  const date = run.reportDate || "Unknown date";
  const runType = normalizeRunType(run.runType || "manual");
  const runTypeLabel = runType === "daily_initial"
    ? "2:00 PM"
    : runType === "daily_refresh"
      ? "8:00 PM refresh"
      : runType === "current_day_morning"
        ? "4:00 AM current day"
      : "manual";
  const updateSuffix = run.refreshSummary && (run.refreshSummary.editedRowCount || run.refreshSummary.newRowCount)
    ? ` • ! ${run.refreshSummary.editedRowCount + run.refreshSummary.newRowCount} updates`
    : "";
  return `${date} • ${runTypeLabel}${updateSuffix}`;
}

function normalizeRunType(value) {
  const text = String(value || "").trim();
  if (
    text === "daily_initial"
    || text === "daily_refresh"
    || text === "current_day_morning"
    || text === "manual"
  ) {
    return text;
  }
  return "manual";
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

module.exports = {
  findLatestExtractionRunForDate,
  findPreferredExtractionRun,
  findRunByDateAndType,
  getLatestExtractionRun,
  getRunById,
  listAvailableReportDates,
  listExtractionRuns,
  saveExtractionResult,
  summarizeResult
};
