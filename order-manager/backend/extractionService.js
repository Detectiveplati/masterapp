const process = require("process");

const { resolveExtractionDepartments } = require("./departmentResolver");
const { formatDateInTimeZone } = require("./dateUtils");
const { runExtraction } = require("./extractor");
const { buildComparisonKey, enrichCombinedRows, normalizeText } = require("./reportRowUtils");
const { findRunByDateAndType, saveExtractionResult } = require("./reportStore");

let activeRun = null;

function isExtractionRunning() {
  return Boolean(activeRun);
}

async function executeExtractionRun({ reportDate, runType = "manual" }) {
  if (activeRun) {
    throw new Error("An extraction is already running.");
  }

  activeRun = performExtraction({ reportDate, runType });
  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
}

async function performExtraction({ reportDate, runType }) {
  const extraction = await runExtraction({
    reportDate,
    saveFiles: false,
    reportType: "combined"
  });
  extraction.csvRows = await resolveExtractionDepartments(extraction.csvRows || []);

  let baselineRun = null;
  if (runType === "daily_refresh") {
    baselineRun = await findRunByDateAndType(reportDate, "daily_initial", {
      projection: {
        _id: 1,
        extractedAt: 1,
        csvRows: 1
      }
    });
    enrichRowsWithRefreshFlags(extraction, baselineRun);
  } else {
    enrichRowsWithDefaultFlags(extraction);
  }

  extraction.runType = runType;

  return saveExtractionResult(extraction, {
    reportDate,
    runType,
    baselineRunId: baselineRun ? baselineRun._id : ""
  });
}

function enrichRowsWithDefaultFlags(extraction) {
  const rows = Array.isArray(extraction.csvRows) ? extraction.csvRows : [];
  extraction.csvRows = enrichCombinedRows(rows.map((row) => ({
    ...row,
    isEdited: false,
    isNewAtRefresh: false,
    hasAlert: false,
    changeAlertLabel: "",
    changedFields: []
  })));
  extraction.refreshSummary = null;
}

function enrichRowsWithRefreshFlags(extraction, baselineRun) {
  const currentRows = Array.isArray(extraction.csvRows) ? extraction.csvRows : [];
  const baselineRows = baselineRun && Array.isArray(baselineRun.csvRows) ? baselineRun.csvRows : [];
  const baselineMap = new Map();

  for (const row of baselineRows) {
    const key = buildComparisonKey(row);
    if (!baselineMap.has(key)) {
      baselineMap.set(key, []);
    }
    baselineMap.get(key).push(row);
  }

  let editedRowCount = 0;
  let newRowCount = 0;

  extraction.csvRows = enrichCombinedRows(currentRows.map((row) => {
    const key = buildComparisonKey(row);
    const bucket = baselineMap.get(key) || [];
    const previousRow = bucket.length ? bucket.shift() : null;
    const changedFields = previousRow ? detectChangedFields(previousRow, row) : [];
    const isNewAtRefresh = !previousRow;
    const isEdited = Boolean(previousRow && changedFields.length);
    if (isNewAtRefresh) {
      newRowCount += 1;
    } else if (isEdited) {
      editedRowCount += 1;
    }

    return {
      ...row,
      isEdited,
      isNewAtRefresh,
      hasAlert: isEdited || isNewAtRefresh,
      changeAlertLabel: isNewAtRefresh ? "加单！" : isEdited ? "改单！" : "",
      changedFields
    };
  }));

  extraction.refreshSummary = {
    baselineRunId: baselineRun ? String(baselineRun._id) : "",
    baselineExtractedAt: baselineRun ? baselineRun.extractedAt : "",
    editedRowCount,
    newRowCount,
    unchangedRowCount: extraction.csvRows.length - editedRowCount - newRowCount
  };
}

function detectChangedFields(previousRow, currentRow) {
  const fields = [
    "functionTime",
    "functionTimeLabel",
    "qty",
    "eventType",
    "notes",
    "chefCellValue",
    "chefCellTime",
    "chefRowTotal",
    "unmatchedReason"
  ];

  return fields.filter((field) => normalizeText(previousRow[field]) !== normalizeText(currentRow[field]));
}

module.exports = {
  executeExtractionRun,
  formatDateInTimeZone,
  isExtractionRunning
};
