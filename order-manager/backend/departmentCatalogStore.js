const { getDb } = require("./db");
const { COLLECTIONS } = require("../../config/databaseLayout");
const {
  normalizeDepartmentCode,
  normalizeDishKey,
  normalizeText,
  splitBilingualDish
} = require("./reportRowUtils");

const DEPARTMENT_COLLECTION = COLLECTIONS.orderManager.DEPARTMENTS;
const DISH_COLLECTION = COLLECTIONS.orderManager.DISH_CATALOG;

let indexPromise = null;

async function getReadyDb() {
  const db = await getDb();
  if (!indexPromise) {
    indexPromise = ensureIndexes(db);
  }
  await indexPromise;
  return db;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(DEPARTMENT_COLLECTION).createIndexes([
      { key: { code: 1 }, unique: true },
      { key: { active: 1, sortOrder: 1, name: 1 } }
    ]),
    db.collection(DISH_COLLECTION).createIndexes([
      { key: { normalizedDishKey: 1 }, unique: true },
      { key: { resolvedDepartmentCodes: 1, lastSeenAt: -1 } },
      { key: { needsReview: 1, lastSeenAt: -1 } },
      { key: { updatedAt: -1 } }
    ])
  ]);
}

async function listDepartments() {
  const db = await getReadyDb();
  const departments = await db.collection(DEPARTMENT_COLLECTION)
    .find({})
    .sort({ active: -1, sortOrder: 1, name: 1 })
    .toArray();

  return departments.map(mapDepartmentDocument);
}

async function getDepartmentMap() {
  const departments = await listDepartments();
  return new Map(departments.map((department) => [department.code, department]));
}

async function upsertDepartment(input) {
  const db = await getReadyDb();
  const normalized = normalizeDepartmentInput(input);
  const now = new Date().toISOString();

  await db.collection(DEPARTMENT_COLLECTION).updateOne(
    { code: normalized.code },
    {
      $set: {
        name: normalized.name,
        active: normalized.active,
        sortOrder: normalized.sortOrder,
        updatedAt: now
      },
      $setOnInsert: {
        createdAt: now
      }
    },
    { upsert: true }
  );

  return getDepartmentByCode(normalized.code);
}

async function ensureDepartmentsExist(names) {
  const db = await getReadyDb();
  const now = new Date().toISOString();
  const uniqueNames = Array.from(new Set(
    (Array.isArray(names) ? names : [])
      .map((name) => normalizeText(name))
      .filter(Boolean)
  ));
  if (!uniqueNames.length) {
    return [];
  }

  const operations = uniqueNames.map((name, index) => {
    const code = normalizeDepartmentCode(name);
    return {
      updateOne: {
        filter: { code },
        update: {
          $setOnInsert: {
            code,
            name,
            active: true,
            sortOrder: index,
            createdAt: now
          },
          $set: {
            updatedAt: now
          }
        },
        upsert: true
      }
    };
  });

  await db.collection(DEPARTMENT_COLLECTION).bulkWrite(operations, { ordered: false });
  return listDepartments();
}

async function getDepartmentByCode(code) {
  const db = await getReadyDb();
  if (!normalizeText(code)) {
    return null;
  }
  const document = await db.collection(DEPARTMENT_COLLECTION).findOne({
    code: normalizeDepartmentCode(code)
  });
  return document ? mapDepartmentDocument(document) : null;
}

async function syncDishCatalog(rows) {
  const db = await getReadyDb();
  const now = new Date().toISOString();
  const aggregates = buildDishAggregates(rows);
  const departmentNames = Array.from(new Set(
    aggregates.flatMap((entry) => entry.sourceDepartmentsSeen)
  ));
  await ensureDepartmentsExist(departmentNames);

  if (!aggregates.length) {
    return [];
  }

  await db.collection(DISH_COLLECTION).bulkWrite(
    aggregates.map((entry) => ({
      updateOne: {
        filter: { normalizedDishKey: entry.normalizedDishKey },
        update: {
          $set: {
            dish: entry.dish,
            dishChinese: entry.dishChinese,
            dishEnglish: entry.dishEnglish,
            sourceDepartment: entry.sourceDepartment,
            sourceDepartmentCode: entry.sourceDepartmentCode,
            lastSeenAt: now,
            updatedAt: now
          },
          $addToSet: {
            sourceDepartmentsSeen: {
              $each: entry.sourceDepartmentsSeen
            }
          },
          $inc: {
            seenCount: entry.seenCount
          },
          $setOnInsert: {
            normalizedDishKey: entry.normalizedDishKey,
            resolvedDepartmentCode: "",
            resolvedDepartmentCodes: [],
            needsReview: false,
            notes: "",
            createdAt: now
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );

  return listDishCatalog();
}

async function listDishCatalog(filters = {}) {
  const db = await getReadyDb();
  const query = buildDishCatalogQuery(filters);
  const limit = Math.max(1, Math.min(Number(filters.limit) || 400, 1000));
  const documents = await db.collection(DISH_COLLECTION)
    .find(query)
    .sort({ lastSeenAt: -1, dish: 1 })
    .limit(limit)
    .toArray();
  const departmentMap = await getDepartmentMap();
  return documents
    .map((document) => mapDishDocument(document, departmentMap))
    .filter((document) => matchesDishCatalogFilters(document, filters))
    .sort(compareDishCatalogEntries);
}

async function getDishCatalogEntry(normalizedDishKey) {
  const db = await getReadyDb();
  const key = normalizeDishKey(normalizedDishKey);
  if (!key) {
    return null;
  }
  const document = await db.collection(DISH_COLLECTION).findOne({ normalizedDishKey: key });
  if (!document) {
    return null;
  }
  const departmentMap = await getDepartmentMap();
  return mapDishDocument(document, departmentMap);
}

async function saveDishDepartmentAssignment(normalizedDishKey, input) {
  const db = await getReadyDb();
  const key = normalizeDishKey(normalizedDishKey);
  if (!key) {
    throw new Error("A valid dish key is required.");
  }

  const resolvedDepartmentCodes = normalizeDepartmentCodeList(
    Array.isArray(input.resolvedDepartmentCodes)
      ? input.resolvedDepartmentCodes
      : [input.resolvedDepartmentCode || ""]
  );
  if (resolvedDepartmentCodes.length) {
    await ensureDepartmentsExist(
      resolvedDepartmentCodes.map((code) => input.resolvedDepartmentName || code)
    );
  }

  const now = new Date().toISOString();
  await db.collection(DISH_COLLECTION).updateOne(
    { normalizedDishKey: key },
    {
      $set: {
        resolvedDepartmentCode: resolvedDepartmentCodes[0] || "",
        resolvedDepartmentCodes,
        notes: normalizeText(input.notes || ""),
        updatedAt: now
      },
      $setOnInsert: {
        normalizedDishKey: key,
        createdAt: now,
        dish: "",
        dishChinese: "",
        dishEnglish: "",
        sourceDepartment: "",
        sourceDepartmentCode: "",
        sourceDepartmentsSeen: [],
        resolvedDepartmentCodes: [],
        seenCount: 0,
        lastSeenAt: ""
      }
    },
    { upsert: true }
  );

  const departmentMap = await getDepartmentMap();
  const selectedDepartments = resolvedDepartmentCodes
    .map((code) => departmentMap.get(code))
    .filter(Boolean);
  await db.collection(DISH_COLLECTION).updateOne(
    { normalizedDishKey: key },
    {
      $set: {
        needsReview: resolvedDepartmentCodes.some((code) => {
          const department = departmentMap.get(code);
          return !department || department.active === false;
        }),
        resolvedDepartmentNameSnapshot: selectedDepartments.map((department) => department.name).join(", ")
      }
    }
  );

  return getDishCatalogEntry(key);
}

async function getDepartmentCatalogDashboard(filters = {}) {
  const db = await getReadyDb();
  const [departments, dishes, allDishDocuments] = await Promise.all([
    listDepartments(),
    listDishCatalog(filters),
    db.collection(DISH_COLLECTION)
      .find({}, { projection: { resolvedDepartmentCode: 1, resolvedDepartmentCodes: 1, sourceDepartment: 1, sourceDepartmentCode: 1, sourceDepartmentsSeen: 1 } })
      .toArray()
  ]);
  const departmentMap = new Map(departments.map((department) => [department.code, department]));

  const countsByDepartment = new Map();
  let mappedDishCount = 0;
  let needsReviewCount = 0;

  for (const document of allDishDocuments) {
    const mappedDish = mapDishDocument(document, departmentMap);
    if (!mappedDish.needsReview && mappedDish.effectiveDepartmentCodes.length) {
      mappedDishCount += 1;
      mappedDish.effectiveDepartmentCodes.forEach((departmentCode) => {
        countsByDepartment.set(
          departmentCode,
          (countsByDepartment.get(departmentCode) || 0) + 1
        );
      });
    } else {
      needsReviewCount += 1;
    }
  }

  return {
    stats: {
      departmentCount: departments.length,
      dishCount: allDishDocuments.length,
      mappedDishCount,
      needsReviewCount
    },
    departments: departments.map((department) => ({
      ...department,
      assignedDishCount: countsByDepartment.get(department.code) || 0
    })),
    dishes
  };
}

function buildDishAggregates(rows) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const dishName = normalizeText(row && row.dish);
    if (!dishName) {
      continue;
    }
    const key = normalizeDishKey(dishName);
    if (!key) {
      continue;
    }

    if (!map.has(key)) {
      const dishNames = splitBilingualDish(dishName);
      map.set(key, {
        normalizedDishKey: key,
        dish: dishName,
        dishChinese: normalizeText(row.dishChinese) || dishNames.chinese,
        dishEnglish: normalizeText(row.dishEnglish) || dishNames.english,
        sourceDepartment: "",
        sourceDepartmentCode: "",
        sourceDepartmentsSeen: [],
        seenCount: 0
      });
    }

    const entry = map.get(key);
    const sourceDepartment = normalizeText(row.sourceDepartment || row.sourceChef || row.chef || "");
    const sourceDepartmentCode = normalizeDepartmentCode(sourceDepartment);
    if (sourceDepartment && !entry.sourceDepartmentsSeen.includes(sourceDepartment)) {
      entry.sourceDepartmentsSeen.push(sourceDepartment);
    }
    if (!entry.sourceDepartment && sourceDepartment) {
      entry.sourceDepartment = sourceDepartment;
      entry.sourceDepartmentCode = sourceDepartmentCode;
    }
    entry.seenCount += 1;
  }

  return Array.from(map.values());
}

function buildDishCatalogQuery(filters) {
  const query = {};
  const search = normalizeText(filters.q || "");
  if (search) {
    query.$or = [
      { dish: { $regex: escapeRegex(search), $options: "i" } },
      { dishChinese: { $regex: escapeRegex(search), $options: "i" } },
      { dishEnglish: { $regex: escapeRegex(search), $options: "i" } }
    ];
  }

  return query;
}

function mapDepartmentDocument(document) {
  return {
    id: String(document._id),
    code: normalizeDepartmentCode(document.code || document.name || ""),
    name: normalizeText(document.name),
    active: document.active !== false,
    sortOrder: Number.isFinite(Number(document.sortOrder)) ? Number(document.sortOrder) : 0
  };
}

function mapDishDocument(document, departmentMap) {
  const sourceDepartment = normalizeText(document.sourceDepartment);
  const sourceDepartmentCode = normalizeDepartmentCode(document.sourceDepartmentCode || document.sourceDepartment || "");
  const sourceDepartmentsSeen = Array.isArray(document.sourceDepartmentsSeen)
    ? document.sourceDepartmentsSeen.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  const sourceDepartmentCodes = normalizeDepartmentCodeList(
    sourceDepartmentsSeen.length
      ? sourceDepartmentsSeen
      : [sourceDepartmentCode]
  );
  const sourceDepartmentRecords = sourceDepartmentCodes
    .map((code) => departmentMap.get(code))
    .filter(Boolean);
  const resolvedDepartmentCodes = normalizeDepartmentCodeList(
    Array.isArray(document.resolvedDepartmentCodes) && document.resolvedDepartmentCodes.length
      ? document.resolvedDepartmentCodes
      : [document.resolvedDepartmentCode || ""]
  );
  const manualDepartmentRecords = resolvedDepartmentCodes
    .map((code) => departmentMap.get(code))
    .filter(Boolean);
  const hasManualOverride = resolvedDepartmentCodes.length > 0;
  const activeSourceDepartments = sourceDepartmentRecords.filter((department) => department.active !== false);
  const activeManualDepartments = manualDepartmentRecords.filter((department) => department.active !== false);
  const effectiveDepartments = hasManualOverride
    ? activeManualDepartments
    : activeSourceDepartments;
  const inactiveSelectedDepartmentCodes = hasManualOverride
    ? resolvedDepartmentCodes.filter((code) => {
        const department = departmentMap.get(code);
        return !department || department.active === false;
      })
    : sourceDepartmentCodes.filter((code) => {
        const department = departmentMap.get(code);
        return !department || department.active === false;
      });
  const needsReview = inactiveSelectedDepartmentCodes.length > 0 || !effectiveDepartments.length;

  return {
    id: String(document._id),
    normalizedDishKey: document.normalizedDishKey,
    dish: normalizeText(document.dish),
    dishChinese: normalizeText(document.dishChinese),
    dishEnglish: normalizeText(document.dishEnglish),
    sourceDepartment,
    sourceDepartmentCode,
    sourceDepartmentsSeen,
    sourceDepartmentCodes,
    resolvedDepartmentCode: resolvedDepartmentCodes[0] || "",
    resolvedDepartmentCodes,
    resolvedDepartment: activeManualDepartments.map((department) => department.name).join(", "),
    resolvedDepartments: activeManualDepartments.map((department) => department.name),
    effectiveDepartmentCode: effectiveDepartments[0] ? effectiveDepartments[0].code : "",
    effectiveDepartmentCodes: effectiveDepartments.map((department) => department.code),
    effectiveDepartment: effectiveDepartments.map((department) => department.name).join(", "),
    effectiveDepartments: effectiveDepartments.map((department) => department.name),
    usesSourceDepartment: !hasManualOverride,
    hasManualOverride,
    inactiveSelectedDepartmentCodes,
    notes: normalizeText(document.notes || ""),
    lastSeenAt: document.lastSeenAt || "",
    seenCount: Number.isFinite(Number(document.seenCount)) ? Number(document.seenCount) : 0,
    needsReview
  };
}

function normalizeDepartmentInput(input) {
  const name = normalizeText(input && (input.name || input.displayName));
  if (!name) {
    throw new Error("Department name is required.");
  }

  return {
    code: normalizeDepartmentCode(input && (input.code || name)),
    name,
    active: input && Object.prototype.hasOwnProperty.call(input, "active") ? Boolean(input.active) : true,
    sortOrder: Number.isFinite(Number(input && input.sortOrder)) ? Number(input.sortOrder) : 0
  };
}

function matchesDishCatalogFilters(document, filters) {
  const status = normalizeText(filters.status || "");
  if (status === "needs-review" && !document.needsReview) {
    return false;
  }
  if (status === "mapped" && document.needsReview) {
    return false;
  }

  const departmentCode = normalizeDepartmentCode(filters.departmentCode || "");
  if (departmentCode && !document.effectiveDepartmentCodes.includes(departmentCode)) {
    return false;
  }

  return true;
}

function compareDishCatalogEntries(left, right) {
  if (left.needsReview !== right.needsReview) {
    return left.needsReview ? -1 : 1;
  }

  const rightSeen = Date.parse(right.lastSeenAt || "") || 0;
  const leftSeen = Date.parse(left.lastSeenAt || "") || 0;
  if (rightSeen !== leftSeen) {
    return rightSeen - leftSeen;
  }

  return String(left.dish || "").localeCompare(String(right.dish || ""), undefined, { sensitivity: "base" });
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = {
  ensureDepartmentsExist,
  getDepartmentCatalogDashboard,
  getDepartmentMap,
  getDishCatalogEntry,
  listDepartments,
  listDishCatalog,
  saveDishDepartmentAssignment,
  syncDishCatalog,
  upsertDepartment
};

function normalizeDepartmentCodeList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeDepartmentCode(value))
      .filter(Boolean)
  ));
}
