function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
  const chef = normalizeText(row && row.chef);
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

  return {
    ...nextRow,
    reportDate: normalizeDate(nextRow.reportDate) || String(nextRow.reportDate || "").trim(),
    dishChinese: String(nextRow.dishChinese || "").trim() || dishNames.chinese,
    dishEnglish: String(nextRow.dishEnglish || "").trim() || dishNames.english,
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

module.exports = {
  buildComparisonKey,
  enrichCombinedRow,
  enrichCombinedRows,
  normalizeDate,
  normalizeText,
  parseInteger,
  parseTimeLabel,
  splitBilingualDish
};
