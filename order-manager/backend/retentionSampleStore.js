const { ObjectId } = require("mongodb");

const { COLLECTIONS } = require("../../config/databaseLayout");
const { getDb } = require("./db");
const { enrichCombinedRow, normalizeDepartmentCode, normalizeLookupKey, normalizeText } = require("./reportRowUtils");

const SAMPLE_COLLECTION = COLLECTIONS.orderManager.RETENTION_SAMPLES;
const CONFIG_COLLECTION = COLLECTIONS.orderManager.RETENTION_SAMPLE_CONFIGS;
const CONFIG_KEY = "global";
const ALGORITHM_VERSION = "retention-sample-v1";
const ACTIVE_SAMPLE_STATUSES = ["required", "collected", "stored"];
let readyPromise = null;

async function getReadyDb() {
  const db = await getDb();
  if (!readyPromise) {
    readyPromise = ensureIndexes(db);
  }
  await readyPromise;
  return db;
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection(SAMPLE_COLLECTION).createIndexes([
      { key: { sampleKey: 1 }, unique: true },
      { key: { reportDate: 1, station: 1, status: 1, updatedAt: -1 } },
      { key: { reportDate: 1, station: 1, departmentCode: 1, prepWindow: 1, updatedAt: -1 } },
      { key: { reportDate: 1, station: 1, prepWindow: 1, status: 1 } }
    ]),
    db.collection(CONFIG_COLLECTION).createIndexes([
      { key: { key: 1 }, unique: true }
    ])
  ]);
}

function getDefaultRetentionSampleConfig() {
  return {
    key: CONFIG_KEY,
    enabled: true,
    algorithmVersion: ALGORITHM_VERSION,
    defaultPerDepartmentWindowCap: 1,
    stationOverrides: {},
    vulnerableServiceKeywords: [
      "vulnerable",
      "elderly",
      "senior",
      "hospital",
      "patient",
      "clinic",
      "childcare",
      "preschool",
      "nursery",
      "infant"
    ],
    exclusionKeywords: [
      "beverage",
      "drink",
      "juice",
      "coffee",
      "tea",
      "water",
      "soda",
      "packet",
      "packed",
      "packaged",
      "condiment",
      "sachet",
      "sauce cup",
      "disposable",
      "cutlery"
    ],
    highRiskKeywords: {
      seafood: ["fish", "fillet", "salmon", "mackerel", "otak", "prawn", "shrimp", "squid", "seafood", "鱼", "虾", "海鲜", "乌打"],
      protein: ["chicken", "beef", "pork", "duck", "lamb", "turkey", "ayam", "meat", "鸡", "牛", "猪", "鸭", "肉"],
      eggDairy: ["egg", "omelette", "custard", "cheese", "cream", "milk", "mayo", "butter", "蛋", "芝士", "奶", "忌廉"],
      gravySauce: ["gravy", "sauce", "curry", "braise", "stew", "jus", "sambal", "汁", "酱", "咖喱"],
      starch: ["rice", "nasi", "fried rice", "noodle", "mee", "bee hoon", "pasta", "porridge", "粥", "饭", "面"],
      chilledReadyToEat: ["salad", "cold", "sandwich", "wrap", "sushi", "fruit cup", "凉", "沙拉"]
    },
    kitchenPreparedKeywords: [
      "baked",
      "oven",
      "grilled",
      "fried",
      "roast",
      "steam",
      "stir",
      "煮",
      "炸",
      "烤",
      "炒",
      "蒸"
    ],
    storageRule: {
      label: "Follow site SOP retained-sample hold and storage requirements.",
      locationHint: "Retention sample chiller",
      disposalRule: "Dispose according to site SOP after hold period is complete."
    },
    updatedAt: ""
  };
}

async function getRetentionSampleConfig() {
  const db = await getReadyDb();
  const defaults = getDefaultRetentionSampleConfig();
  const collection = db.collection(CONFIG_COLLECTION);
  const existing = await collection.findOne({ key: CONFIG_KEY });
  if (existing) {
    return normalizeRetentionSampleConfig(existing);
  }

  const createdAt = new Date().toISOString();
  const document = {
    ...defaults,
    createdAt,
    updatedAt: createdAt
  };
  await collection.insertOne(document);
  return normalizeRetentionSampleConfig(document);
}

async function updateRetentionSampleConfig(input = {}) {
  const db = await getReadyDb();
  const current = await getRetentionSampleConfig();
  const nextConfig = normalizeRetentionSampleConfig({
    ...current,
    ...sanitizeRetentionSampleConfigInput(input),
    key: CONFIG_KEY,
    updatedAt: new Date().toISOString()
  });

  await db.collection(CONFIG_COLLECTION).updateOne(
    { key: CONFIG_KEY },
    {
      $set: nextConfig,
      $setOnInsert: { createdAt: new Date().toISOString() }
    },
    { upsert: true }
  );

  return nextConfig;
}

function sanitizeRetentionSampleConfigInput(input) {
  const defaults = getDefaultRetentionSampleConfig();
  const stationOverrides = input && typeof input.stationOverrides === "object" && input.stationOverrides
    ? input.stationOverrides
    : defaults.stationOverrides;

  return {
    enabled: input && typeof input.enabled === "boolean" ? input.enabled : defaults.enabled,
    defaultPerDepartmentWindowCap: Math.max(1, Number(input && input.defaultPerDepartmentWindowCap) || defaults.defaultPerDepartmentWindowCap),
    vulnerableServiceKeywords: sanitizeStringArray(input && input.vulnerableServiceKeywords, defaults.vulnerableServiceKeywords),
    exclusionKeywords: sanitizeStringArray(input && input.exclusionKeywords, defaults.exclusionKeywords),
    kitchenPreparedKeywords: sanitizeStringArray(input && input.kitchenPreparedKeywords, defaults.kitchenPreparedKeywords),
    highRiskKeywords: normalizeHighRiskKeywords(input && input.highRiskKeywords ? input.highRiskKeywords : defaults.highRiskKeywords),
    stationOverrides: sanitizeStationOverrides(stationOverrides),
    storageRule: {
      label: normalizeText(input && input.storageRule && input.storageRule.label) || defaults.storageRule.label,
      locationHint: normalizeText(input && input.storageRule && input.storageRule.locationHint) || defaults.storageRule.locationHint,
      disposalRule: normalizeText(input && input.storageRule && input.storageRule.disposalRule) || defaults.storageRule.disposalRule
    }
  };
}

function normalizeRetentionSampleConfig(config) {
  const defaults = getDefaultRetentionSampleConfig();
  return {
    ...defaults,
    ...config,
    vulnerableServiceKeywords: sanitizeStringArray(config && config.vulnerableServiceKeywords, defaults.vulnerableServiceKeywords),
    exclusionKeywords: sanitizeStringArray(config && config.exclusionKeywords, defaults.exclusionKeywords),
    kitchenPreparedKeywords: sanitizeStringArray(config && config.kitchenPreparedKeywords, defaults.kitchenPreparedKeywords),
    highRiskKeywords: normalizeHighRiskKeywords(config && config.highRiskKeywords ? config.highRiskKeywords : defaults.highRiskKeywords),
    stationOverrides: sanitizeStationOverrides(config && config.stationOverrides ? config.stationOverrides : defaults.stationOverrides),
    storageRule: {
      label: normalizeText(config && config.storageRule && config.storageRule.label) || defaults.storageRule.label,
      locationHint: normalizeText(config && config.storageRule && config.storageRule.locationHint) || defaults.storageRule.locationHint,
      disposalRule: normalizeText(config && config.storageRule && config.storageRule.disposalRule) || defaults.storageRule.disposalRule
    }
  };
}

function sanitizeStationOverrides(value) {
  const output = {};
  for (const [stationKey, rawOverride] of Object.entries(value || {})) {
    output[String(stationKey || "").trim().toLowerCase()] = {
      enabled: typeof rawOverride.enabled === "boolean" ? rawOverride.enabled : true,
      perDepartmentWindowCap: Math.max(1, Number(rawOverride.perDepartmentWindowCap) || 1)
    };
  }
  return output;
}

function normalizeHighRiskKeywords(rawMap) {
  const defaults = getDefaultRetentionSampleConfig().highRiskKeywords;
  const output = {};
  for (const key of Object.keys(defaults)) {
    output[key] = sanitizeStringArray(rawMap && rawMap[key], defaults[key]);
  }
  return output;
}

function sanitizeStringArray(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  return Array.from(new Set(source.map((value) => normalizeText(value).toLowerCase()).filter(Boolean)));
}

function normalizeStation(value) {
  const station = String(value || "").trim().toLowerCase();
  return station === "stirfry" ? "stirfry" : station === "combioven" ? "combioven" : "";
}

function normalizeReportDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "";
}

async function syncRetentionSamplesForStation(options = {}) {
  const db = await getReadyDb();
  const config = await getRetentionSampleConfig();
  const station = normalizeStation(options.station);
  const reportDate = normalizeReportDate(options.reportDate);
  const items = Array.isArray(options.items) ? options.items : [];
  const stationConfig = config.stationOverrides[station] || { enabled: true, perDepartmentWindowCap: config.defaultPerDepartmentWindowCap };

  if (!config.enabled || !stationConfig.enabled || !reportDate) {
    return [];
  }

  const selectedCandidates = selectRetentionSampleCandidates(items, {
    station,
    reportDate,
    config,
    capPerWindow: stationConfig.perDepartmentWindowCap
  });

  const collection = db.collection(SAMPLE_COLLECTION);
  const existing = await collection.find({
    reportDate,
    station
  }).toArray();
  const existingByKey = new Map(existing.map((document) => [document.sampleKey, document]));
  const selectedByWindow = new Map();

  for (const candidate of selectedCandidates) {
    const sampleDocument = buildSampleDocumentFromCandidate(candidate, {
      station,
      reportDate,
      config,
      sourceRunId: options.sourceRunId,
      sourceRunType: options.sourceRunType,
      sourceExtractedAt: options.sourceExtractedAt
    });
    const windowKey = buildWindowKey(sampleDocument);
    if (!selectedByWindow.has(windowKey)) {
      selectedByWindow.set(windowKey, []);
    }
    selectedByWindow.get(windowKey).push(sampleDocument.sampleKey);

    const existingDocument = existingByKey.get(sampleDocument.sampleKey);
    if (existingDocument) {
      const update = buildUpsertUpdateDocument(existingDocument, sampleDocument);
      await collection.updateOne({ _id: existingDocument._id }, { $set: update });
      continue;
    }

    await collection.insertOne(sampleDocument);
  }

  for (const document of existing) {
    const windowKey = buildWindowKey(document);
    const selectedWindowKeys = selectedByWindow.get(windowKey) || [];
    if (selectedWindowKeys.includes(document.sampleKey)) {
      continue;
    }
    if (!ACTIVE_SAMPLE_STATUSES.includes(document.status) || document.status !== "required") {
      continue;
    }

    await collection.updateOne(
      { _id: document._id },
      {
        $set: {
          status: "cancelled",
          cancellationReason: "Superseded by latest retention-sample selection.",
          cancelledAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    );
  }

  return listRetentionSamples({
    reportDate,
    station
  });
}

function buildUpsertUpdateDocument(existingDocument, sampleDocument) {
  const update = {
    ...sampleDocument,
    createdAt: existingDocument.createdAt || sampleDocument.createdAt,
    updatedAt: new Date().toISOString()
  };

  if (existingDocument.status === "cancelled" && /^Superseded\b/i.test(String(existingDocument.cancellationReason || ""))) {
    update.status = "required";
    update.cancelledAt = "";
    update.cancelledBy = "";
    update.cancellationReason = "";
  } else {
    update.status = existingDocument.status || sampleDocument.status;
    update.collectedAt = existingDocument.collectedAt || "";
    update.collectedBy = existingDocument.collectedBy || "";
    update.storedAt = existingDocument.storedAt || "";
    update.storedBy = existingDocument.storedBy || "";
    update.storageLocation = existingDocument.storageLocation || sampleDocument.storageLocation || "";
    update.disposedAt = existingDocument.disposedAt || "";
    update.disposedBy = existingDocument.disposedBy || "";
    update.missedAt = existingDocument.missedAt || "";
    update.missedBy = existingDocument.missedBy || "";
    update.missReason = existingDocument.missReason || "";
    update.cancelledAt = existingDocument.cancelledAt || "";
    update.cancelledBy = existingDocument.cancelledBy || "";
    update.cancellationReason = existingDocument.cancellationReason || "";
  }

  return update;
}

function buildSampleDocumentFromCandidate(candidate, meta) {
  const now = new Date().toISOString();
  const sampleKey = [
    candidate.reportDate,
    meta.station,
    candidate.departmentCode,
    candidate.prepWindow,
    candidate.dishKey
  ].join("||");

  return {
    sampleKey,
    taskType: "retention_sample",
    status: "required",
    station: meta.station,
    reportDate: candidate.reportDate,
    department: candidate.department,
    departmentCode: candidate.departmentCode,
    prepWindow: candidate.prepWindow,
    prepWindowLabel: candidate.prepWindowLabel,
    prepSortKey: candidate.prepSortKey,
    prepSlot: candidate.prepSlot,
    dish: candidate.dish,
    dishKey: candidate.dishKey,
    dishChinese: candidate.dishChinese,
    dishEnglish: candidate.dishEnglish,
    displayFood: candidate.displayFood,
    qtyReference: String(candidate.totalQty),
    qtyTotal: candidate.totalQty,
    orderCount: candidate.orderCount,
    orderNumbers: candidate.orderNumbers,
    comparisonKeys: candidate.comparisonKeys,
    selectionReason: candidate.selectionReason,
    riskTier: candidate.riskTier,
    riskScore: candidate.riskScore,
    scoreBreakdown: candidate.scoreBreakdown,
    flags: candidate.flags,
    sourceRunId: String(meta.sourceRunId || ""),
    sourceRunType: String(meta.sourceRunType || ""),
    sourceExtractedAt: String(meta.sourceExtractedAt || ""),
    sourceSnapshot: {
      sourceItemCount: candidate.sourceItemCount,
      spreadOrderCount: candidate.orderCount,
      spreadPrepCount: candidate.prepSlotCount
    },
    algorithmVersion: ALGORITHM_VERSION,
    ruleSnapshot: {
      station: meta.station,
      perDepartmentWindowCap: meta.config.defaultPerDepartmentWindowCap,
      storageRule: meta.config.storageRule,
      vulnerableServiceKeywords: meta.config.vulnerableServiceKeywords,
      exclusionKeywords: meta.config.exclusionKeywords
    },
    storageRuleLabel: meta.config.storageRule.label,
    storageLocationHint: meta.config.storageRule.locationHint,
    disposalRuleLabel: meta.config.storageRule.disposalRule,
    storageLocation: "",
    collectedAt: "",
    collectedBy: "",
    storedAt: "",
    storedBy: "",
    disposedAt: "",
    disposedBy: "",
    missedAt: "",
    missedBy: "",
    missReason: "",
    cancelledAt: "",
    cancelledBy: "",
    cancellationReason: "",
    createdAt: now,
    updatedAt: now
  };
}

function buildWindowKey(document) {
  return [
    normalizeReportDate(document.reportDate),
    normalizeStation(document.station),
    normalizeDepartmentCode(document.departmentCode || document.department),
    normalizeText(document.prepWindow || "")
  ].join("||");
}

function selectRetentionSampleCandidates(items, options = {}) {
  const config = options.config || getDefaultRetentionSampleConfig();
  const reportDate = normalizeReportDate(options.reportDate);
  const capPerWindow = Math.max(1, Number(options.capPerWindow) || 1);
  const groupedCandidates = new Map();

  for (const rawItem of Array.isArray(items) ? items : []) {
    const item = enrichKitchenItem(rawItem, reportDate);
    if (!item.reportDate || item.reportDate !== reportDate) {
      continue;
    }
    if (!isEligibleKitchenItem(item, config)) {
      continue;
    }

    const candidateKey = [
      item.reportDate,
      normalizeDepartmentCode(item.departmentCode || item.department),
      item.prepWindow,
      normalizeLookupKey(item.dish || item.displayFood)
    ].join("||");

    if (!groupedCandidates.has(candidateKey)) {
      groupedCandidates.set(candidateKey, createCandidateSeed(item));
    }

    accumulateCandidate(groupedCandidates.get(candidateKey), item, config);
  }

  const candidates = Array.from(groupedCandidates.values()).map((candidate) => finalizeCandidate(candidate, config));
  const groupedByWindow = new Map();
  for (const candidate of candidates) {
    const key = [
      candidate.reportDate,
      candidate.departmentCode,
      candidate.prepWindow
    ].join("||");
    if (!groupedByWindow.has(key)) {
      groupedByWindow.set(key, []);
    }
    groupedByWindow.get(key).push(candidate);
  }

  const selected = [];
  for (const group of groupedByWindow.values()) {
    group
      .sort(compareRetentionCandidates)
      .slice(0, capPerWindow)
      .forEach((candidate) => selected.push(candidate));
  }

  return selected.sort((left, right) => (
    left.prepSortKey - right.prepSortKey ||
    left.department.localeCompare(right.department) ||
    right.riskScore - left.riskScore ||
    left.dish.localeCompare(right.dish)
  ));
}

function enrichKitchenItem(item, fallbackReportDate) {
  const normalized = item && typeof item === "object" ? item : {};
  const reportDate = normalizeReportDate(normalized.reportDate || fallbackReportDate);
  const department = normalizeText(normalized.resolvedDepartment || normalized.department || normalized.chef || "");
  const dish = normalizeText(normalized.dish || normalized.displayFood || "");
  const dishChinese = normalizeText(normalized.dishChinese || "");
  const dishEnglish = normalizeText(normalized.dishEnglish || "");
  const displayFood = normalizeText(normalized.displayFood || `${dishChinese} ${dishEnglish}` || dish);

  return {
    ...enrichCombinedRow({
      reportDate,
      resolvedDepartment: department,
      resolvedDepartmentCode: normalized.resolvedDepartmentCode || normalized.departmentCode || department,
      dish
    }),
    reportDate,
    station: normalizeStation(normalized.station || ""),
    department,
    departmentCode: normalizeDepartmentCode(normalized.resolvedDepartmentCode || normalized.departmentCode || department),
    dish,
    dishKey: normalizeLookupKey(dish || displayFood),
    dishChinese,
    dishEnglish,
    displayFood: displayFood || dish,
    prepSlot: normalizeText(normalized.prepSlot || normalized.prepTime || ""),
    prepWindow: normalizeText(normalized.prepWindow || "other") || "other",
    prepWindowLabel: normalizeText(normalized.prepWindowLabel || normalized.prepSlot || normalized.prepTime || ""),
    prepSortKey: Number.isFinite(Number(normalized.prepWindowSortKey))
      ? Number(normalized.prepWindowSortKey)
      : Number(normalized.prepSortKey) || Number.MAX_SAFE_INTEGER,
    prepTime: normalizeText(normalized.prepTime || normalized.prepSlot || ""),
    functionTime: normalizeText(normalized.functionTime || ""),
    qtyNumber: Number(normalized.qtyNumber) || 0,
    qty: String(normalized.qty || normalized.qtyNumber || "").trim(),
    orderNumber: String(normalized.orderNumber || "").trim(),
    comparisonKey: String(normalized.comparisonKey || normalized.id || "").trim(),
    notes: normalizeText(normalized.notes || normalized.cookingNotes || ""),
    eventType: normalizeText(normalized.eventType || ""),
    hasAlert: Boolean(normalized.hasAlert),
    isEdited: Boolean(normalized.isEdited),
    isNewAtRefresh: Boolean(normalized.isNewAtRefresh)
  };
}

function isEligibleKitchenItem(item, config) {
  if (!item.reportDate || !item.department || !item.dish || item.qtyNumber <= 0) {
    return false;
  }

  const textBlob = buildKeywordBlob(item);
  if (matchesAnyKeyword(textBlob, config.exclusionKeywords)) {
    return false;
  }

  return isLikelyKitchenPrepared(item, config);
}

function isLikelyKitchenPrepared(item, config) {
  if (item.station === "combioven" || item.station === "stirfry") {
    return true;
  }
  return matchesAnyKeyword(buildKeywordBlob(item), config.kitchenPreparedKeywords);
}

function createCandidateSeed(item) {
  return {
    reportDate: item.reportDate,
    department: item.department,
    departmentCode: item.departmentCode,
    prepWindow: item.prepWindow,
    prepWindowLabel: item.prepWindowLabel,
    prepSlot: item.prepSlot,
    prepSortKey: item.prepSortKey,
    dish: item.dish,
    dishKey: item.dishKey,
    dishChinese: item.dishChinese,
    dishEnglish: item.dishEnglish,
    displayFood: item.displayFood || item.dish,
    totalQty: 0,
    orderNumbers: [],
    comparisonKeys: [],
    orderSet: new Set(),
    prepSlotSet: new Set(),
    sourceItemCount: 0,
    flags: {
      hasAlert: false,
      vulnerableService: false
    }
  };
}

function accumulateCandidate(candidate, item, config) {
  candidate.totalQty += item.qtyNumber;
  candidate.sourceItemCount += 1;
  if (item.orderNumber && !candidate.orderSet.has(item.orderNumber)) {
    candidate.orderSet.add(item.orderNumber);
    candidate.orderNumbers.push(item.orderNumber);
  }
  if (item.comparisonKey && !candidate.comparisonKeys.includes(item.comparisonKey)) {
    candidate.comparisonKeys.push(item.comparisonKey);
  }
  if (item.prepSlot) {
    candidate.prepSlotSet.add(item.prepSlot);
  }
  candidate.flags.hasAlert = candidate.flags.hasAlert || item.hasAlert || item.isEdited || item.isNewAtRefresh;
  candidate.flags.vulnerableService = candidate.flags.vulnerableService || detectVulnerableService(item, config);
}

function finalizeCandidate(candidate, config) {
  const keywordBlob = normalizeLookupKey([
    candidate.dish,
    candidate.dishChinese,
    candidate.dishEnglish,
    candidate.displayFood
  ].join(" "));

  const riskMatches = {
    seafood: matchesAnyKeyword(keywordBlob, config.highRiskKeywords.seafood),
    protein: matchesAnyKeyword(keywordBlob, config.highRiskKeywords.protein),
    eggDairy: matchesAnyKeyword(keywordBlob, config.highRiskKeywords.eggDairy),
    gravySauce: matchesAnyKeyword(keywordBlob, config.highRiskKeywords.gravySauce),
    starch: matchesAnyKeyword(keywordBlob, config.highRiskKeywords.starch),
    chilledReadyToEat: matchesAnyKeyword(keywordBlob, config.highRiskKeywords.chilledReadyToEat)
  };
  const highRiskMatchCount = Object.values(riskMatches).filter(Boolean).length;
  const riskTier = highRiskMatchCount >= 2 || riskMatches.seafood || riskMatches.chilledReadyToEat
    ? "high"
    : highRiskMatchCount === 1
      ? "medium"
      : "baseline";
  const baseTierScore = riskTier === "high" ? 300 : riskTier === "medium" ? 180 : 60;
  const serviceRiskScore = candidate.flags.vulnerableService ? 80 : 0;
  const volumeScore = Math.min(90, candidate.totalQty);
  const spreadScore = Math.min(30, candidate.orderSet.size * 10) + Math.min(10, candidate.prepSlotSet.size * 5);
  const changeScore = candidate.flags.hasAlert ? 25 : 0;
  const riskScore = baseTierScore + serviceRiskScore + volumeScore + spreadScore + changeScore;
  const selectionReason = riskTier === "high"
    ? "High-risk dish profile selected before volume-only candidates."
    : riskTier === "medium"
      ? "Moderate-risk dish selected with quantity and spread tie-breakers."
      : "No higher-risk dish found, so the highest-volume cooked dish was selected.";

  return {
    ...candidate,
    orderCount: candidate.orderSet.size,
    prepSlotCount: candidate.prepSlotSet.size,
    riskTier,
    riskScore,
    scoreBreakdown: {
      riskTier: baseTierScore,
      serviceRisk: serviceRiskScore,
      volume: volumeScore,
      spread: spreadScore,
      change: changeScore
    },
    selectionReason
  };
}

function compareRetentionCandidates(left, right) {
  const tierRank = { high: 3, medium: 2, baseline: 1 };
  return (
    (tierRank[right.riskTier] || 0) - (tierRank[left.riskTier] || 0) ||
    right.riskScore - left.riskScore ||
    right.totalQty - left.totalQty ||
    right.orderCount - left.orderCount ||
    left.dish.localeCompare(right.dish)
  );
}

function detectVulnerableService(item, config) {
  const blob = buildKeywordBlob(item);
  return matchesAnyKeyword(blob, config.vulnerableServiceKeywords);
}

function buildKeywordBlob(item) {
  return normalizeLookupKey([
    item.dish,
    item.dishChinese,
    item.dishEnglish,
    item.displayFood,
    item.notes,
    item.eventType,
    item.department
  ].join(" "));
}

function matchesAnyKeyword(text, keywords) {
  const normalizedText = normalizeLookupKey(text);
  return (Array.isArray(keywords) ? keywords : []).some((keyword) => normalizedText.includes(normalizeLookupKey(keyword)));
}

async function listRetentionSamples(filters = {}) {
  const db = await getReadyDb();
  const query = {};
  const reportDate = normalizeReportDate(filters.reportDate || filters.date);
  const station = normalizeStation(filters.station || "");
  const status = normalizeText(filters.status || "");

  if (reportDate) {
    query.reportDate = reportDate;
  }
  if (station) {
    query.station = station;
  }
  if (status) {
    query.status = status;
  }

  const documents = await db.collection(SAMPLE_COLLECTION)
    .find(query)
    .sort({ reportDate: -1, prepSortKey: 1, department: 1, updatedAt: -1 })
    .toArray();

  return documents.map(mapRetentionSampleDocument);
}

async function getRetentionSampleById(sampleId) {
  const db = await getReadyDb();
  if (!ObjectId.isValid(String(sampleId || "").trim())) {
    return null;
  }

  const document = await db.collection(SAMPLE_COLLECTION).findOne({
    _id: new ObjectId(String(sampleId).trim())
  });
  return document ? mapRetentionSampleDocument(document) : null;
}

async function transitionRetentionSample(sampleId, action, payload = {}) {
  const db = await getReadyDb();
  if (!ObjectId.isValid(String(sampleId || "").trim())) {
    throw new Error("Invalid retention sample id.");
  }

  const collection = db.collection(SAMPLE_COLLECTION);
  const _id = new ObjectId(String(sampleId).trim());
  const existing = await collection.findOne({ _id });
  if (!existing) {
    throw new Error("Retention sample task not found.");
  }

  const nextAction = String(action || "").trim().toLowerCase();
  const actor = normalizeText(payload.actor || payload.by || "");
  const storageLocation = normalizeText(payload.storageLocation || "");
  const reason = normalizeText(payload.reason || payload.notes || "");
  const now = new Date().toISOString();
  const update = {
    updatedAt: now
  };

  if (nextAction === "collect") {
    update.status = "collected";
    update.collectedAt = now;
    update.collectedBy = actor;
  } else if (nextAction === "store") {
    update.status = "stored";
    update.storedAt = now;
    update.storedBy = actor;
    update.storageLocation = storageLocation || existing.storageLocation || existing.storageLocationHint || "";
    if (!existing.collectedAt) {
      update.collectedAt = now;
      update.collectedBy = actor;
    }
  } else if (nextAction === "dispose") {
    update.status = "disposed";
    update.disposedAt = now;
    update.disposedBy = actor;
  } else if (nextAction === "miss") {
    update.status = "missed";
    update.missedAt = now;
    update.missedBy = actor;
    update.missReason = reason;
  } else if (nextAction === "cancel") {
    update.status = "cancelled";
    update.cancelledAt = now;
    update.cancelledBy = actor;
    update.cancellationReason = reason;
  } else {
    throw new Error("Unsupported retention sample action.");
  }

  await collection.updateOne({ _id }, { $set: update });
  return getRetentionSampleById(sampleId);
}

function mapRetentionSampleDocument(document) {
  return {
    id: String(document._id || ""),
    sampleKey: String(document.sampleKey || ""),
    taskType: String(document.taskType || "retention_sample"),
    status: String(document.status || "required"),
    station: String(document.station || ""),
    reportDate: String(document.reportDate || ""),
    department: String(document.department || ""),
    departmentCode: String(document.departmentCode || ""),
    prepWindow: String(document.prepWindow || ""),
    prepWindowLabel: String(document.prepWindowLabel || ""),
    prepSortKey: Number(document.prepSortKey) || Number.MAX_SAFE_INTEGER,
    prepSlot: String(document.prepSlot || ""),
    dish: String(document.dish || ""),
    dishChinese: String(document.dishChinese || ""),
    dishEnglish: String(document.dishEnglish || ""),
    displayFood: String(document.displayFood || document.dish || ""),
    qtyReference: String(document.qtyReference || ""),
    qtyTotal: Number(document.qtyTotal) || 0,
    orderCount: Number(document.orderCount) || 0,
    orderNumbers: Array.isArray(document.orderNumbers) ? document.orderNumbers : [],
    comparisonKeys: Array.isArray(document.comparisonKeys) ? document.comparisonKeys : [],
    selectionReason: String(document.selectionReason || ""),
    riskTier: String(document.riskTier || ""),
    riskScore: Number(document.riskScore) || 0,
    scoreBreakdown: document.scoreBreakdown || {},
    flags: document.flags || {},
    sourceRunId: String(document.sourceRunId || ""),
    sourceRunType: String(document.sourceRunType || ""),
    sourceExtractedAt: String(document.sourceExtractedAt || ""),
    sourceSnapshot: document.sourceSnapshot || {},
    algorithmVersion: String(document.algorithmVersion || ALGORITHM_VERSION),
    ruleSnapshot: document.ruleSnapshot || {},
    storageRuleLabel: String(document.storageRuleLabel || ""),
    storageLocationHint: String(document.storageLocationHint || ""),
    disposalRuleLabel: String(document.disposalRuleLabel || ""),
    storageLocation: String(document.storageLocation || ""),
    collectedAt: String(document.collectedAt || ""),
    collectedBy: String(document.collectedBy || ""),
    storedAt: String(document.storedAt || ""),
    storedBy: String(document.storedBy || ""),
    disposedAt: String(document.disposedAt || ""),
    disposedBy: String(document.disposedBy || ""),
    missedAt: String(document.missedAt || ""),
    missedBy: String(document.missedBy || ""),
    missReason: String(document.missReason || ""),
    cancelledAt: String(document.cancelledAt || ""),
    cancelledBy: String(document.cancelledBy || ""),
    cancellationReason: String(document.cancellationReason || ""),
    createdAt: String(document.createdAt || ""),
    updatedAt: String(document.updatedAt || "")
  };
}

module.exports = {
  ACTIVE_SAMPLE_STATUSES,
  ALGORITHM_VERSION,
  getDefaultRetentionSampleConfig,
  getRetentionSampleById,
  getReadyDb,
  getRetentionSampleConfig,
  listRetentionSamples,
  mapRetentionSampleDocument,
  normalizeReportDate,
  normalizeStation,
  selectRetentionSampleCandidates,
  syncRetentionSamplesForStation,
  transitionRetentionSample,
  updateRetentionSampleConfig
};
