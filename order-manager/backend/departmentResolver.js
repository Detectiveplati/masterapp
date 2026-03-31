const { getDb } = require("./db");
const { COLLECTIONS } = require("../../config/databaseLayout");
const {
  ensureDepartmentsExist,
  getDepartmentMap,
  listDepartments,
  syncDishCatalog
} = require("./departmentCatalogStore");
const {
  enrichCombinedRows,
  normalizeDepartmentCode,
  normalizeDishKey,
  normalizeText
} = require("./reportRowUtils");

const RUN_COLLECTION = COLLECTIONS.orderManager.EXTRACTION_RUNS;

async function resolveExtractionDepartments(rows, options = {}) {
  const normalizedRows = enrichCombinedRows(Array.isArray(rows) ? rows : []);
  if (!normalizedRows.length) {
    return [];
  }

  const sourceDepartments = normalizedRows
    .map((row) => normalizeText(row.sourceDepartment || row.sourceChef || row.chef || ""))
    .filter(Boolean);

  await ensureDepartmentsExist(sourceDepartments);
  if (options.syncCatalog !== false) {
    await syncDishCatalog(normalizedRows);
  }

  const [departmentMap, dishCatalogMap] = await Promise.all([
    getDepartmentMap(),
    getDishCatalogMap()
  ]);

  return applyDepartmentResolution(normalizedRows, {
    departmentMap,
    dishCatalogMap
  });
}

function applyDepartmentResolution(rows, context) {
  const departmentMap = context && context.departmentMap ? context.departmentMap : new Map();
  const dishCatalogMap = context && context.dishCatalogMap ? context.dishCatalogMap : new Map();

  return rows.map((row) => {
    const sourceDepartment = normalizeText(row.sourceDepartment || row.sourceChef || row.chef || "");
    const sourceDepartmentCodes = normalizeDepartmentCodeList(
      Array.isArray(row.sourceDepartmentsSeen) && row.sourceDepartmentsSeen.length
        ? row.sourceDepartmentsSeen
        : [row.sourceDepartmentCode || sourceDepartment]
    );
    const dishKey = normalizeDishKey(row.dish || row.dishChinese || row.dishEnglish || "");
    const catalogEntry = dishCatalogMap.get(dishKey);
    const manualDepartmentCodes = normalizeDepartmentCodeList(
      catalogEntry && Array.isArray(catalogEntry.resolvedDepartmentCodes) && catalogEntry.resolvedDepartmentCodes.length
        ? catalogEntry.resolvedDepartmentCodes
        : [catalogEntry && catalogEntry.resolvedDepartmentCode ? catalogEntry.resolvedDepartmentCode : ""]
    );
    const manualDepartmentRecords = manualDepartmentCodes
      .map((code) => departmentMap.get(code))
      .filter(Boolean);
    const activeManualDepartments = manualDepartmentRecords.filter((department) => department.active !== false);
    const sourceDepartmentRecords = sourceDepartmentCodes
      .map((code) => departmentMap.get(code))
      .filter(Boolean);
    const activeSourceDepartments = sourceDepartmentRecords.filter((department) => department.active !== false);
    const effectiveDepartments = manualDepartmentCodes.length
      ? activeManualDepartments
      : activeSourceDepartments;
    const hasInactiveSelection = (manualDepartmentCodes.length ? manualDepartmentCodes : sourceDepartmentCodes).some((code) => {
      const department = departmentMap.get(code);
      return !department || department.active === false;
    });
    const mappingSource = manualDepartmentCodes.length
      ? activeManualDepartments.length
        ? "catalog"
        : "review"
      : activeSourceDepartments.length
        ? "source"
        : "review";

    return {
      ...row,
      sourceChef: sourceDepartment,
      sourceDepartment,
      sourceDepartmentCode: sourceDepartmentCodes[0] || "",
      sourceDepartmentsSeen: Array.isArray(row.sourceDepartmentsSeen) && row.sourceDepartmentsSeen.length
        ? row.sourceDepartmentsSeen
        : sourceDepartment ? [sourceDepartment] : [],
      resolvedDepartment: effectiveDepartments[0] ? effectiveDepartments[0].name : "",
      resolvedDepartments: effectiveDepartments.map((department) => department.name),
      resolvedDepartmentCode: effectiveDepartments[0] ? effectiveDepartments[0].code : "",
      resolvedDepartmentCodes: effectiveDepartments.map((department) => department.code),
      mappingSource,
      needsDepartmentReview: hasInactiveSelection || !effectiveDepartments.length,
      chef: effectiveDepartments[0] ? effectiveDepartments[0].name : ""
    };
  });
}

async function reapplyDepartmentAssignmentsToAllRuns() {
  const db = await getDb();
  const runs = await db.collection(RUN_COLLECTION)
    .find(
      { reportType: "combined" },
      {
        projection: {
          _id: 1,
          csvRows: 1
        }
      }
    )
    .toArray();

  if (!runs.length) {
    return {
      updatedRunCount: 0,
      updatedRowCount: 0
    };
  }

  const [departmentMap, dishCatalogMap] = await Promise.all([
    getDepartmentMap(),
    getDishCatalogMap()
  ]);

  let updatedRunCount = 0;
  let updatedRowCount = 0;
  const now = new Date().toISOString();
  const operations = [];

  for (const run of runs) {
    const originalRows = enrichCombinedRows(Array.isArray(run.csvRows) ? run.csvRows : []);
    const resolvedRows = applyDepartmentResolution(originalRows, {
      departmentMap,
      dishCatalogMap
    });
    updatedRunCount += 1;
    updatedRowCount += resolvedRows.length;
    operations.push({
      updateOne: {
        filter: { _id: run._id },
        update: {
          $set: {
            csvRows: resolvedRows,
            updatedAt: now
          }
        }
      }
    });
  }

  if (operations.length) {
    await db.collection(RUN_COLLECTION).bulkWrite(operations, { ordered: false });
  }

  return {
    updatedRunCount,
    updatedRowCount
  };
}

async function getCombiOvenDepartmentCodes() {
  const departments = await listDepartments();
  return departments
    .filter((department) => department.active && /烤炉|oven/i.test(department.name))
    .map((department) => department.code);
}

async function getDishCatalogMap() {
  const db = await getDb();
  const documents = await db.collection(COLLECTIONS.orderManager.DISH_CATALOG)
    .find({}, { projection: { normalizedDishKey: 1, resolvedDepartmentCode: 1, resolvedDepartmentCodes: 1 } })
    .toArray();

  return new Map(
    documents.map((document) => [
      normalizeDishKey(document.normalizedDishKey),
      {
        normalizedDishKey: normalizeDishKey(document.normalizedDishKey),
        resolvedDepartmentCode: normalizeDepartmentCode(document.resolvedDepartmentCode || ""),
        resolvedDepartmentCodes: normalizeDepartmentCodeList(
          Array.isArray(document.resolvedDepartmentCodes) && document.resolvedDepartmentCodes.length
            ? document.resolvedDepartmentCodes
            : [document.resolvedDepartmentCode || ""]
        )
      }
    ])
  );
}

function normalizeDepartmentCodeList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeDepartmentCode(value))
      .filter(Boolean)
  ));
}

module.exports = {
  applyDepartmentResolution,
  getCombiOvenDepartmentCodes,
  reapplyDepartmentAssignmentsToAllRuns,
  resolveExtractionDepartments
};
