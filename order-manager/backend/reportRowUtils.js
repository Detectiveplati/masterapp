function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeLookupKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDishKey(value) {
  return normalizeLookupKey(value);
}

function normalizeDepartmentCode(value) {
  return normalizeLookupKey(value).replace(/\s+/g, "-");
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function parseInteger(value) {
  const number = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function parseTimeLabel(value) {
  const text = String(value || "").trim().toUpperCase();
  const match = text.match(/^(AM|PM)?\s*(\d{1,2}):(\d{2})(AM|PM)?$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  const period = match[1] || match[4] || "";
  let hour = Number(match[2]);
  const minute = Number(match[3]);

  if (period === "AM") {
    if (hour === 12) hour = 0;
  } else if (period === "PM") {
    if (hour !== 12) hour += 12;
  }

  return hour * 60 + minute;
}

function splitBilingualDish(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (match) {
    return {
      chinese: match[1].trim(),
      english: match[2].trim()
    };
  }

  if (/[\u3400-\u9fff]/.test(text)) {
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

function buildComparisonKey(row) {
  const reportDate = normalizeDate(row && row.reportDate);
  const chef = normalizeText(row && (row.sourceDepartment || row.sourceChef || row.chef));
  const dish = normalizeText(row && row.dish);
  const prepTime = normalizeText((row && (row.prepTimeLabel || row.prepTime)) || "");
  const orderNumber = normalizeText(row && row.orderNumber);
  return [reportDate, chef, dish, prepTime, orderNumber].join("||");
}

function enrichCombinedRow(row) {
  const nextRow = row && typeof row === "object" ? row : {};
  const dishNames = splitBilingualDish(nextRow.dish);
  const prepTimeLabel = nextRow.prepTimeLabel || nextRow.prepTime || "";
  const functionTimeLabel = nextRow.functionTimeLabel || nextRow.functionTime || "";
  const existingQtyNumber = Number(nextRow.qtyNumber);
  const existingPrepSortKey = Number(nextRow.prepSortKey);
  const existingFunctionSortKey = Number(nextRow.functionSortKey);

  const resolvedDepartmentNames = normalizeDepartmentList(
    Array.isArray(nextRow.resolvedDepartments)
      ? nextRow.resolvedDepartments
      : [nextRow.resolvedDepartment || ""]
  );
  const resolvedDepartmentCodes = normalizeDepartmentCodeList(
    Array.isArray(nextRow.resolvedDepartmentCodes)
      ? nextRow.resolvedDepartmentCodes
      : [nextRow.resolvedDepartmentCode || nextRow.resolvedDepartment || ""]
  );

  return {
    ...nextRow,
    reportDate: normalizeDate(nextRow.reportDate) || String(nextRow.reportDate || "").trim(),
    dishChinese: String(nextRow.dishChinese || "").trim() || dishNames.chinese,
    dishEnglish: String(nextRow.dishEnglish || "").trim() || dishNames.english,
    sourceDepartment: normalizeText(nextRow.sourceDepartment || nextRow.sourceChef || ""),
    sourceDepartmentCode: normalizeDepartmentCode(nextRow.sourceDepartmentCode || nextRow.sourceDepartment || nextRow.sourceChef || ""),
    resolvedDepartment: resolvedDepartmentNames[0] || "",
    resolvedDepartments: resolvedDepartmentNames,
    resolvedDepartmentCode: resolvedDepartmentCodes[0] || "",
    resolvedDepartmentCodes,
    mappingSource: normalizeText(nextRow.mappingSource || ""),
    needsDepartmentReview: Boolean(nextRow.needsDepartmentReview),
    qtyNumber: Number.isFinite(existingQtyNumber) ? existingQtyNumber : parseInteger(nextRow.qty),
    prepSortKey: Number.isFinite(existingPrepSortKey) ? existingPrepSortKey : parseTimeLabel(prepTimeLabel),
    functionSortKey: Number.isFinite(existingFunctionSortKey) ? existingFunctionSortKey : parseTimeLabel(functionTimeLabel),
    comparisonKey: String(nextRow.comparisonKey || "").trim() || buildComparisonKey(nextRow)
  };
}

function enrichCombinedRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map(enrichCombinedRow);
}

function normalizeDepartmentList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeText(value))
      .filter(Boolean)
  ));
}

function normalizeDepartmentCodeList(values) {
  return Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeDepartmentCode(value))
      .filter(Boolean)
  ));
}

function getResolvedDepartmentEntries(row) {
  const nextRow = enrichCombinedRow(row);
  const names = nextRow.resolvedDepartments;
  const codes = nextRow.resolvedDepartmentCodes;
  const length = Math.max(names.length, codes.length);
  const entries = [];

  for (let index = 0; index < length; index += 1) {
    const name = normalizeText(names[index] || "");
    const code = normalizeDepartmentCode(codes[index] || name || "");
    if (!name && !code) {
      continue;
    }
    entries.push({
      name,
      code
    });
  }

  if (!entries.length && nextRow.resolvedDepartment) {
    entries.push({
      name: nextRow.resolvedDepartment,
      code: nextRow.resolvedDepartmentCode || normalizeDepartmentCode(nextRow.resolvedDepartment)
    });
  }

  return entries;
}

module.exports = {
  buildComparisonKey,
  enrichCombinedRow,
  enrichCombinedRows,
  getResolvedDepartmentEntries,
  normalizeDepartmentCode,
  normalizeDepartmentCodeList,
  normalizeDishKey,
  normalizeDepartmentList,
  normalizeLookupKey,
  normalizeDate,
  normalizeText,
  parseInteger,
  parseTimeLabel,
  splitBilingualDish
};
