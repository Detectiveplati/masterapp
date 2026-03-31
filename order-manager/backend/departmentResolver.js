const { getDb } = require("./db");
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

const RUN_COLLECTION = "order_manager_extraction_runs";

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
    const sourceDepartmentCode = normalizeDepartmentCode(sourceDepartment);
    const dishKey = normalizeDishKey(row.dish || row.dishChinese || row.dishEnglish || "");
    const catalogEntry = dishCatalogMap.get(dishKey);
    const resolvedDepartmentCode = catalogEntry && catalogEntry.resolvedDepartmentCode
      ? normalizeDepartmentCode(catalogEntry.resolvedDepartmentCode)
      : "";
    const resolvedDepartmentRecord = resolvedDepartmentCode
      ? departmentMap.get(resolvedDepartmentCode)
      : null;
    const resolvedDepartment = resolvedDepartmentRecord
      ? resolvedDepartmentRecord.name
      : sourceDepartment;
    const effectiveDepartmentCode = resolvedDepartmentRecord
      ? resolvedDepartmentRecord.code
      : sourceDepartmentCode;
    const mappingSource = resolvedDepartmentRecord
      ? "catalog"
      : sourceDepartment
        ? "source"
        : "unassigned";

    return {
      ...row,
      sourceChef: sourceDepartment,
      sourceDepartment,
      sourceDepartmentCode,
      resolvedDepartment,
      resolvedDepartmentCode: effectiveDepartmentCode,
      mappingSource,
      needsDepartmentReview: !resolvedDepartmentRecord,
      chef: resolvedDepartment
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
  const configuredCodes = departments
    .filter((department) => department.active && department.feedsCombiOven)
    .map((department) => department.code);
  if (configuredCodes.length) {
    return configuredCodes;
  }

  return departments
    .filter((department) => /烤炉|oven/i.test(department.name))
    .map((department) => department.code);
}

async function getDishCatalogMap() {
  const db = await getDb();
  const documents = await db.collection("order_manager_dish_catalog")
    .find({}, { projection: { normalizedDishKey: 1, resolvedDepartmentCode: 1 } })
    .toArray();

  return new Map(
    documents.map((document) => [
      normalizeDishKey(document.normalizedDishKey),
      {
        normalizedDishKey: normalizeDishKey(document.normalizedDishKey),
        resolvedDepartmentCode: normalizeDepartmentCode(document.resolvedDepartmentCode || "")
      }
    ])
  );
}

module.exports = {
  applyDepartmentResolution,
  getCombiOvenDepartmentCodes,
  reapplyDepartmentAssignmentsToAllRuns,
  resolveExtractionDepartments
};
