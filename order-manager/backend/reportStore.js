const { ObjectId } = require("mongodb");

const { COLLECTIONS } = require("../../config/databaseLayout");
const { getDb } = require("./db");
const { getCurrentDateInTimeZone } = require("./dateUtils");
const { enrichCombinedRow, normalizeText, parseTimeLabel } = require("./reportRowUtils");

let indexPromise = null;
const RUN_COLLECTION = COLLECTIONS.orderManager.EXTRACTION_RUNS;
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

  const csvRows = Array.isArray(run.csvRows) ? run.csvRows : [];
  const resolvedSections = buildResolvedDepartmentSections(csvRows);
  const chefs = resolvedSections.map((section) => section.chef).filter(Boolean);
  const mappingSummary = summarizeDepartmentMapping(csvRows);

  return {
    reportId: String(run._id),
    reportDate: run.reportDate || "",
    runType: normalizeRunType(run.runType || "manual"),
    extractedAt: run.extractedAt,
    reportType: run.reportType,
    sourceUrl: run.sourceUrl,
    sectionCount: resolvedSections.length,
    rowCount: countSectionRows(resolvedSections),
    entryCount: countSectionEntries(resolvedSections),
    mergeSummary: run.mergeSummary || null,
    mappingSummary,
    refreshSummary: run.refreshSummary || null,
    chefs,
    sections: resolvedSections,
    outputFiles: run.outputFiles || null
  };
}

function buildResolvedDepartmentSections(rows) {
  const sectionMap = new Map();

  for (const rawRow of Array.isArray(rows) ? rows : []) {
    const row = enrichCombinedRow(rawRow);
    const departmentName = normalizeText(row.resolvedDepartment);
    if (!departmentName || row.unmatchedReason || !row.dish) {
      continue;
    }

    if (!sectionMap.has(departmentName)) {
      sectionMap.set(departmentName, {
        chef: departmentName,
        department: departmentName,
        timeSet: new Set(),
        dishMap: new Map()
      });
    }

    const section = sectionMap.get(departmentName);
    const timeLabel = normalizeText(row.prepTimeLabel || row.prepTime || "");
    if (timeLabel) {
      section.timeSet.add(timeLabel);
    }

    if (!section.dishMap.has(row.dish)) {
      section.dishMap.set(row.dish, {
        dish: row.dish,
        totalQty: 0,
        timeQtyMap: new Map()
      });
    }

    const dish = section.dishMap.get(row.dish);
    dish.totalQty += row.qtyNumber;
    if (timeLabel) {
      dish.timeQtyMap.set(timeLabel, (dish.timeQtyMap.get(timeLabel) || 0) + row.qtyNumber);
    }
  }

  return Array.from(sectionMap.values())
    .map((section) => {
      const times = Array.from(section.timeSet).sort(compareTimeLabels);
      const rowsForSection = Array.from(section.dishMap.values())
        .map((dish) => {
          const row = {
            chef: section.chef,
            dish: dish.dish,
            total: formatQuantity(dish.totalQty)
          };
          for (const timeLabel of times) {
            const qty = dish.timeQtyMap.get(timeLabel) || 0;
            row[timeLabel] = qty ? formatQuantity(qty) : "";
          }
          return row;
        })
        .sort((left, right) => parseInt(right.total || "0", 10) - parseInt(left.total || "0", 10) || left.dish.localeCompare(right.dish));

      const entries = rowsForSection.flatMap((row) =>
        times
          .filter((timeLabel) => row[timeLabel])
          .map((timeLabel) => ({
            chef: section.chef,
            dish: row.dish,
            time: timeLabel,
            rawTime: timeLabel,
            value: row[timeLabel],
            total: row.total
          }))
      );

      return {
        chef: section.chef,
        department: section.department,
        headers: ["Dish", ...times, "Total"],
        times,
        rows: rowsForSection,
        entries
      };
    })
    .sort((left, right) => left.chef.localeCompare(right.chef));
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

function compareTimeLabels(left, right) {
  return parseTimeLabel(left) - parseTimeLabel(right) || left.localeCompare(right);
}

function formatQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) {
    return "";
  }
  return Number.isInteger(quantity) ? String(quantity) : String(quantity);
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

function summarizeDepartmentMapping(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    return {
      reviewDishCount: 0,
      resolvedRowCount: 0,
      reviewRowCount: 0,
      resolvedDepartmentCount: 0
    };
  }

  const resolvedDepartments = new Set();
  const reviewDishes = new Set();
  let resolvedRowCount = 0;
  let reviewRowCount = 0;

  for (const row of rows) {
    if (row && row.resolvedDepartment) {
      resolvedDepartments.add(String(row.resolvedDepartment).trim());
      resolvedRowCount += 1;
    }
    if (row && row.needsDepartmentReview) {
      reviewRowCount += 1;
      const dish = String(row.dish || "").trim();
      if (dish) {
        reviewDishes.add(dish);
      }
    }
  }

  return {
    reviewDishCount: reviewDishes.size,
    resolvedRowCount,
    reviewRowCount,
    resolvedDepartmentCount: resolvedDepartments.size
  };
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
