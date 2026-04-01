const express = require("express");
const { ObjectId } = require("mongodb");

const { COLLECTIONS } = require("../../config/databaseLayout");
const { getCombiOvenDepartmentCodes } = require("./departmentResolver");
const { applyDemoRefreshOverlay } = require("./demoRefreshOverlay");
const { getDb } = require("./db");
const { getCurrentDateInTimeZone } = require("./dateUtils");
const { findLatestExtractionRunForDate, listAvailableReportDates } = require("./reportStore");
const { enrichCombinedRow, normalizeDepartmentCode, parseInteger, parseTimeLabel } = require("./reportRowUtils");

let cookSessionIndexPromise = null;

function createTemplogRouter() {
  const router = express.Router();

  router.get("/combioven/latest", async (req, res) => {
    req.params = { ...(req.params || {}), station: "combioven" };
    return handleStationLatest(req, res);
  });

  router.get("/stations/:station/latest", async (req, res) => {
    return handleStationLatest(req, res);
  });

  router.get("/cooks", async (req, res) => {
    try {
      const limit = Math.max(1, Number(req.query.limit) || 50);
      const station = getRequestedStation(req);
      const entries = await loadCookEntries({ limit, station });
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load cook log entries." });
    }
  });

  router.get("/cooks/status", async (req, res) => {
    try {
      const limit = Math.max(1, Number(req.query.limit) || 500);
      const station = getRequestedStation(req);
      const entries = await loadCookEntries({ limit, statusOnly: true, station });
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load cook status entries." });
    }
  });

  router.post("/cooks", express.json(), async (req, res) => {
    try {
      const entry = sanitizeCookEntry(req.body || {});
      const station = getRequestedStation(req);
      const collection = await getCookSessionCollection();
      const result = await collection.insertOne({
        ...entry,
        station,
        createdAt: new Date().toISOString()
      });
      res.status(201).json({
        ok: true,
        sessionId: String(result.insertedId),
        sourceIds: entry.sourceIds,
        matchKeys: entry.matchKeys,
        reportDates: entry.reportDates,
        batchCount: entry.batchCount,
        food: entry.food,
        startDate: entry.startDate
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save cook entry." });
    }
  });

  router.delete("/cooks/:sessionId", async (req, res) => {
    try {
      const sessionId = String(req.params.sessionId || "").trim();
      const station = getRequestedStation(req);
      if (!ObjectId.isValid(sessionId)) {
        return res.status(400).json({ error: "Invalid cook session id." });
      }

      const collection = await getCookSessionCollection();
      const result = await collection.deleteOne({
        _id: new ObjectId(sessionId),
        station
      });

      if (!result.deletedCount) {
        return res.status(404).json({ error: "Cook session not found." });
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not undo cook entry." });
    }
  });

  router.get("/cooks/export", async (req, res) => {
    try {
      const station = getRequestedStation(req);
      const entries = await loadCookEntries({ sortAscending: true, station });
      const headers = ["food", "orderSummary", "batchCount", "orderCount", "totalQty", "startDate", "startTime", "endTime", "duration", "temp", "staff"];
      const csv = withUtf8Bom(toCsv(entries, headers));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="order-manager-${station}-temp-log.csv"`);
      res.send(csv);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not export cook log." });
    }
  });

  return router;
}

async function handleStationLatest(req, res) {
  try {
    const station = getRequestedStation(req);
    const stationConfig = getKitchenStationConfig(station);
    const requestedDate = normalizeDate(req.query.date || "");
    const run = await findLatestExtractionRunForDate(requestedDate, {
      projection: {
        reportDate: 1,
        runType: 1,
        extractedAt: 1,
        refreshSummary: 1,
        baselineRunId: 1,
        csvRows: 1
      }
    });
    if (!run) {
      return res.status(404).json({ error: "No extracted report found in MongoDB. Run the extractor first." });
    }

    const overlay = applyDemoRefreshOverlay(run, Array.isArray(run.csvRows) ? run.csvRows : [], {
      preferredChefPattern: stationConfig.departmentPattern
    });
    const rows = overlay.rows;
    const stationDepartmentCodes = await getStationDepartmentCodes(station);
    const reportDates = await listAvailableReportDates();
    const selectedDate = selectReportDate(reportDates, normalizeDate(requestedDate || run.reportDate || ""));
    const items = [];
    let totalQty = 0;
    let updatedItemCount = 0;
    for (const row of rows) {
      if (!isKitchenStationRow(row, stationDepartmentCodes, stationConfig.departmentPattern) || row.unmatchedReason) {
        continue;
      }
      if (selectedDate && row.reportDate !== selectedDate) {
        continue;
      }
      const item = buildKitchenOrder(row);
      items.push(item);
      totalQty += item.qtyNumber;
      if (item.hasAlert) {
        updatedItemCount += 1;
      }
    }
    const prepSlots = groupPrepSlots(items);

    res.json({
      station,
      sourceFilename: `Latest report for ${selectedDate || run.reportDate || run.extractedAt.slice(0, 10)}`,
      extractedAt: run.extractedAt,
      runType: run.runType || "manual",
      refreshSummary: overlay.refreshSummary,
      reportDates,
      selectedDate,
      itemCount: items.length,
      totalQty,
      updatedItemCount,
      prepSlots
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load kitchen orders." });
  }
}

function buildKitchenOrder(row) {
  const normalizedRow = enrichCombinedRow(row);
  const dishName = splitBilingualDish(
    normalizedRow.dish || "",
    normalizedRow.dishChinese,
    normalizedRow.dishEnglish
  );
  const prepSortKey = normalizedRow.prepSortKey;
  const prepWindow = getPrepWindow(prepSortKey);
  return {
    id: [normalizedRow.reportDate, normalizedRow.prepTime, normalizedRow.orderNumber, normalizedRow.dish].join("||"),
    reportDate: normalizedRow.reportDate || "",
    chef: normalizedRow.resolvedDepartment || "",
    sourceDepartment: normalizedRow.sourceDepartment || "",
    resolvedDepartment: normalizedRow.resolvedDepartment || "",
    dish: normalizedRow.dish || "",
    dishChinese: dishName.chinese,
    dishEnglish: dishName.english,
    displayFood: `${dishName.chinese} ${dishName.english}`.trim(),
    prepTime: normalizedRow.prepTime || "",
    prepSlot: normalizedRow.prepTimeLabel || normalizedRow.prepTime || "",
    prepSortKey,
    prepWindow: prepWindow.key,
    prepWindowLabel: prepWindow.label,
    prepWindowSortKey: prepWindow.sortKey,
    functionTime: normalizedRow.functionTime || "",
    functionTimeLabel: normalizedRow.functionTimeLabel || normalizedRow.functionTime || "",
    functionSortKey: normalizedRow.functionSortKey,
    qty: normalizedRow.qty || "",
    qtyNumber: normalizedRow.qtyNumber,
    orderNumber: normalizedRow.orderNumber || "",
    eventType: normalizedRow.eventType || "",
    notes: normalizedRow.notes || "",
    cookingNotes: summarizeCookingNotes(normalizedRow),
    isEdited: Boolean(normalizedRow.isEdited),
    isNewAtRefresh: Boolean(normalizedRow.isNewAtRefresh),
    hasAlert: Boolean(normalizedRow.hasAlert),
    changeAlertLabel: normalizedRow.changeAlertLabel || "",
    changedFields: Array.isArray(normalizedRow.changedFields) ? normalizedRow.changedFields : []
  };
}

function isKitchenStationRow(row, stationDepartmentCodes, departmentPattern) {
  if (!row || row.unmatchedReason || row.needsDepartmentReview) {
    return false;
  }
  const resolvedDepartmentCodes = Array.from(new Set(
    (Array.isArray(row.resolvedDepartmentCodes) ? row.resolvedDepartmentCodes : [row && (row.resolvedDepartmentCode || row.resolvedDepartment || "")])
      .map((value) => normalizeDepartmentCode(value))
      .filter(Boolean)
  ));
  if (Array.isArray(stationDepartmentCodes) && stationDepartmentCodes.length) {
    return resolvedDepartmentCodes.some((code) => stationDepartmentCodes.includes(code));
  }
  return (Array.isArray(row.resolvedDepartments) ? row.resolvedDepartments : [row && (row.resolvedDepartment || "")])
    .some((departmentName) => departmentPattern.test(String(departmentName || "")));
}

function splitBilingualDish(value, preferredChinese = "", preferredEnglish = "") {
  const chinese = String(preferredChinese || "").trim();
  const english = String(preferredEnglish || "").trim();
  if (chinese || english) {
    if (chinese && english) {
      return { chinese, english };
    }
    if (chinese && !english) {
      return { chinese, english: hasChineseCharacters(chinese) ? "" : chinese };
    }
    const translated = lookupChineseDishName(english);
    return {
      chinese: translated || english,
      english
    };
  }

  const text = String(value || "").trim();
  const match = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (match) {
    return {
      chinese: match[1].trim(),
      english: match[2].trim()
    };
  }

  const translatedChinese = lookupChineseDishName(text);
  if (translatedChinese) {
    return {
      chinese: translatedChinese,
      english: text
    };
  }

  if (hasChineseCharacters(text)) {
    return {
      chinese: text,
      english: ""
    };
  }

  return {
      chinese: text,
      english: ""
  };
}

function lookupChineseDishName(value) {
  const key = normalizeDishLookupKey(value);
  return ENGLISH_TO_CHINESE_DISH_NAMES[key] || "";
}

function normalizeDishLookupKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasChineseCharacters(value) {
  return /[\u3400-\u9fff]/.test(String(value || ""));
}

function summarizeCookingNotes(row) {
  return [
    row.orderNumber ? `Order ${row.orderNumber}` : "",
    row.qty ? `Qty ${row.qty}` : "",
    row.functionTime ? `Function ${row.functionTime}` : "",
    row.eventType || "",
    row.notes || ""
  ].filter(Boolean).join(" • ");
}

function groupPrepSlots(items) {
  const slotMap = new Map();
  for (const item of items) {
    const slotKey = item.prepWindow || "other";
    if (!slotMap.has(slotKey)) {
      slotMap.set(slotKey, {
        prepSlot: item.prepWindowLabel || item.prepSlot,
        prepWindow: slotKey,
        prepSortKey: item.prepWindowSortKey ?? item.prepSortKey,
        totalQty: 0,
        itemCount: 0,
        items: []
      });
    }

    const slot = slotMap.get(slotKey);
    slot.totalQty += item.qtyNumber;
    slot.itemCount += 1;
    slot.items.push(item);
  }

  return Array.from(slotMap.values())
    .map((slot) => ({
      ...slot,
      items: slot.items.sort(compareTimeFirstOrderItems)
    }))
    .sort((left, right) => left.prepSortKey - right.prepSortKey);
}

function getPrepWindow(prepSortKey) {
  if (Number.isFinite(prepSortKey) && prepSortKey >= 240 && prepSortKey < 720) {
    return {
      key: "morning",
      label: "早班订单 Morning Orders • 备餐 Prep 4:00 AM - 12:00 PM",
      sortKey: 240
    };
  }

  if (Number.isFinite(prepSortKey) && prepSortKey >= 720 && prepSortKey <= 1080) {
    return {
      key: "afternoon",
      label: "午班订单 Afternoon Orders • 备餐 Prep 12:00 PM - 6:00 PM",
      sortKey: 720
    };
  }

  return {
    key: "other",
    label: "其他备餐时间 Other Prep Times",
    sortKey: 9999
  };
}

function compareOrderItems(left, right) {
  return (
    left.reportDate.localeCompare(right.reportDate) ||
    left.prepSortKey - right.prepSortKey ||
    left.functionSortKey - right.functionSortKey ||
    left.dish.localeCompare(right.dish) ||
    Number(right.hasAlert) - Number(left.hasAlert) ||
    left.orderNumber.localeCompare(right.orderNumber)
  );
}

function compareTimeFirstOrderItems(left, right) {
  return (
    left.prepSortKey - right.prepSortKey ||
    left.functionSortKey - right.functionSortKey ||
    left.dish.localeCompare(right.dish) ||
    Number(right.hasAlert) - Number(left.hasAlert) ||
    left.orderNumber.localeCompare(right.orderNumber)
  );
}

function compareGroupedOrderItems(left, right) {
  return (
    left.dish.localeCompare(right.dish) ||
    left.prepSortKey - right.prepSortKey ||
    left.functionSortKey - right.functionSortKey ||
    Number(right.hasAlert) - Number(left.hasAlert) ||
    left.orderNumber.localeCompare(right.orderNumber)
  );
}

function normalizeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "";
}

function selectReportDate(reportDates, requestedDate) {
  if (requestedDate && reportDates.includes(requestedDate)) {
    return requestedDate;
  }

  const today = getCurrentDateInTimeZone();
  if (reportDates.includes(today)) {
    return today;
  }

  return reportDates[reportDates.length - 1] || "";
}

async function getCookSessionCollection() {
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.orderManager.COOK_SESSIONS);
  if (!cookSessionIndexPromise) {
    cookSessionIndexPromise = collection.createIndexes([
      { key: { station: 1, createdAt: -1 } },
      { key: { station: 1, startDate: -1, createdAt: -1 } }
    ]);
  }
  await cookSessionIndexPromise;
  return collection;
}

async function loadCookEntries(options = {}) {
  const collection = await getCookSessionCollection();
  const limit = Math.max(0, Number(options.limit) || 0);
  const station = normalizeStationKey(options.station);
  const projection = options.statusOnly
    ? {
        batchCount: 1,
        sourceIds: 1,
        matchKeys: 1,
        reportDates: 1,
        startDate: 1,
        createdAt: 1
      }
    : {
        food: 1,
        orderSummary: 1,
        orderNumbers: 1,
        batchCount: 1,
        orderCount: 1,
        totalQty: 1,
        sourceIds: 1,
        matchKeys: 1,
        reportDates: 1,
        startDate: 1,
        startTime: 1,
        endTime: 1,
        duration: 1,
        temp: 1,
        staff: 1,
        createdAt: 1
      };
  let cursor = collection.find({ station }).project(projection);

  cursor = cursor.sort({ createdAt: options.sortAscending ? 1 : -1 });
  if (limit > 0) {
    cursor = cursor.limit(limit);
  }

  const entries = await cursor.toArray();
  return entries.map((entry) => ({
    sessionId: String(entry._id),
    food: entry.food,
    orderSummary: entry.orderSummary,
    orderNumbers: entry.orderNumbers,
    batchCount: entry.batchCount,
    orderCount: entry.orderCount,
    totalQty: entry.totalQty,
    sourceIds: Array.isArray(entry.sourceIds) ? entry.sourceIds : [],
    matchKeys: Array.isArray(entry.matchKeys) ? entry.matchKeys : [],
    reportDates: Array.isArray(entry.reportDates) ? entry.reportDates : [],
    startDate: entry.startDate,
    startTime: entry.startTime,
    endTime: entry.endTime,
    duration: entry.duration,
    temp: entry.temp,
    staff: entry.staff,
    createdAt: entry.createdAt
  }));
}

function sanitizeCookEntry(entry) {
  const required = ["food", "startDate", "startTime", "endTime", "duration", "temp", "staff"];
  for (const field of required) {
    if (!String(entry[field] || "").trim()) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  const batchItems = Array.isArray(entry.batchItems)
    ? entry.batchItems.map((item) => ({
        sourceId: String(item.sourceId || "").trim(),
        food: String(item.food || "").trim(),
        orderNumber: String(item.orderNumber || "").trim(),
        prepTime: String(item.prepTime || "").trim(),
        functionTime: String(item.functionTime || "").trim(),
        qty: String(item.qty || "").trim(),
        eventType: String(item.eventType || "").trim(),
        notes: String(item.notes || "").trim(),
        reportDate: String(item.reportDate || "").trim()
      }))
    : [];
  const sourceIds = [];
  const matchKeys = [];
  const reportDates = [];
  const seenSourceIds = new Set();
  const seenMatchKeys = new Set();
  const seenReportDates = new Set();

  for (const item of batchItems) {
    if (item.sourceId && !seenSourceIds.has(item.sourceId)) {
      seenSourceIds.add(item.sourceId);
      sourceIds.push(item.sourceId);
    }

    const matchKey = buildCookMatchKey(item);
    if (matchKey && !seenMatchKeys.has(matchKey)) {
      seenMatchKeys.add(matchKey);
      matchKeys.push(matchKey);
    }

    const reportDate = String(item.reportDate || "").trim();
    if (reportDate && !seenReportDates.has(reportDate)) {
      seenReportDates.add(reportDate);
      reportDates.push(reportDate);
    }
  }

  return {
    food: String(entry.food).trim(),
    orderSummary: String(entry.orderSummary || "").trim(),
    orderNumbers: Array.isArray(entry.orderNumbers) ? entry.orderNumbers.map((value) => String(value || "").trim()).filter(Boolean) : [],
    batchCount: String(entry.batchCount || "").trim(),
    orderCount: String(entry.orderCount || "").trim(),
    totalQty: String(entry.totalQty || "").trim(),
    batchItems,
    sourceIds,
    matchKeys,
    reportDates,
    startDate: String(entry.startDate).trim(),
    startTime: String(entry.startTime).trim(),
    endTime: String(entry.endTime).trim(),
    duration: String(entry.duration).trim(),
    temp: String(entry.temp).trim(),
    staff: String(entry.staff).trim()
  };
}

function toCsv(rows, headers) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header] || "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function escapeCsv(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

function withUtf8Bom(text) {
  return `\uFEFF${text}`;
}

function buildCookMatchKey(item) {
  const reportDate = String(item.reportDate || "").trim();
  const orderNumber = String(item.orderNumber || "").trim();
  const prepTime = String(item.prepTime || "").trim();
  const functionTime = String(item.functionTime || "").trim();
  const qty = String(item.qty || "").trim();
  const foodKey = buildFoodKey(item.food || "");

  if (!reportDate || !prepTime || !foodKey) {
    return "";
  }

  return [reportDate, orderNumber, prepTime, functionTime, qty, foodKey].join("||");
}

function buildFoodKey(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

module.exports = {
  createTemplogRouter
};

function getRequestedStation(req) {
  return normalizeStationKey((req.params && req.params.station) || req.query.station || "");
}

function normalizeStationKey(value) {
  const station = String(value || "").trim().toLowerCase();
  return station === "stirfry" ? "stirfry" : "combioven";
}

function getKitchenStationConfig(station) {
  if (station === "stirfry") {
    return {
      key: "stirfry",
      departmentPattern: /^炒(?:\s*[\(（]|$)|^stir[\s-]?fried\b/i
    };
  }

  return {
    key: "combioven",
    departmentPattern: /烤炉|oven/i
  };
}

async function getStationDepartmentCodes(station) {
  if (station === "combioven") {
    return getCombiOvenDepartmentCodes();
  }

  const db = await getDb();
  const departments = await db.collection(COLLECTIONS.orderManager.DEPARTMENTS)
    .find({ active: { $ne: false } }, { projection: { code: 1, name: 1 } })
    .toArray();

  return departments
    .filter((department) => isStirFryDepartment(department))
    .map((department) => normalizeDepartmentCode(department.code || department.name || ""));
}

function isStirFryDepartment(department) {
  const code = normalizeDepartmentCode(department && (department.code || ""));
  const name = String(department && (department.name || "")).trim();
  if (code === "炒-stir-fried") {
    return true;
  }
  return /^炒(?:\s*[\(（]|$)|^stir[\s-]?fried\b/i.test(name);
}

const ENGLISH_TO_CHINESE_DISH_NAMES = {
  "ayam panggang kunyit": "黄姜娘惹烤鸡",
  "bbq mackerel otak wrapped in banana leaf": "娘惹乌打",
  "cantonese style baked fish fillet topped w garlicky soya sauce spring onion": "港式烤鱼,蒜茸酱,青葱",
  "cantonese style baked fish fillet topped with garlicky soya sauce and spring onion": "港式烤鱼,蒜茸酱,青葱",
  "grilled fish fillet w nonya spices": "烤鱼片与娘惹香料",
  "grilled fish fillet w teriyaki sauce": "烤鱼片与日式酱",
  "ikan assam pedas": "烤亚叁红鱼",
  "oven baked cajun chicken w garlic flake cherry tomato confit": "烤印第安鸡与小番茄,蒜蓉和香菜",
  "oven baked cajun chicken with garlic flake cherry tomato confit": "烤印第安鸡与小番茄,蒜蓉和香菜"
};
