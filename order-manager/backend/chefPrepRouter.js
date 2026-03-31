const express = require("express");

const { findLatestExtractionRunForDate, listAvailableReportDates } = require("./reportStore");
const { getCurrentDateInTimeZone } = require("./dateUtils");
const { enrichCombinedRow, parseTimeLabel } = require("./reportRowUtils");

function createChefPreorderRouter() {
  const router = express.Router();

  router.get("/latest", async (req, res) => {
    try {
      const requestedDate = normalizeDate(req.query.date || "");
      const run = await findLatestExtractionRunForDate(requestedDate, {
        projection: {
          reportDate: 1,
          runType: 1,
          extractedAt: 1,
          refreshSummary: 1,
          csvRows: 1
        }
      });
      if (!run) {
        return res.status(404).json({ error: "No extracted reports were found in MongoDB. Run the extractor first." });
      }

      const rows = Array.isArray(run.csvRows) ? run.csvRows : [];
      const resolvedDate = requestedDate || run.reportDate || "";
      const reportDates = await listAvailableReportDates();
      const payload = buildChefPreorderPayload(rows, {
        sourceFilename: `Latest report for ${resolvedDate || run.extractedAt.slice(0, 10)}`,
        sourceModifiedAt: run.extractedAt,
        runType: run.runType || "manual",
        refreshSummary: run.refreshSummary || null,
        selectedDate: resolvedDate,
        reportDates
      });
      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load chef pre-order data." });
    }
  });

  return router;
}

function buildChefPreorderPayload(rows, meta) {
  const filteredRows = [];
  for (const row of rows) {
    if (!row.resolvedDepartment || row.needsDepartmentReview || row.unmatchedReason) {
      continue;
    }
    filteredRows.push(enrichCombinedRow(row));
  }
  const reportDates = Array.isArray(meta.reportDates) ? meta.reportDates : [];
  const selectedDate = selectReportDate(reportDates, normalizeDate(meta.selectedDate || ""));
  const activeRows = selectedDate
    ? filteredRows.filter((row) => row.reportDate === selectedDate)
    : filteredRows;
  const chefs = groupByChef(activeRows);

  return {
    ...meta,
    reportDates: Array.isArray(meta.reportDates) ? meta.reportDates : [],
    selectedDate,
    chefCount: chefs.length,
    departmentCount: chefs.length,
    dishCount: chefs.reduce((sum, chef) => sum + chef.items.length, 0),
    totalQty: chefs.reduce((sum, chef) => sum + chef.totalQty, 0),
    chefs
  };
}

function groupByChef(rows) {
  const chefMap = new Map();

  for (const row of rows) {
    const departmentName = row.resolvedDepartment;
    if (!chefMap.has(departmentName)) {
      chefMap.set(departmentName, {
        chef: departmentName,
        department: departmentName,
        totalQty: 0,
        dishMap: new Map()
      });
    }

    const chef = chefMap.get(departmentName);
    chef.totalQty += row.qtyNumber;

    if (!chef.dishMap.has(row.dish)) {
      chef.dishMap.set(row.dish, {
        dish: row.dish,
        dishChinese: row.dishChinese || row.dish,
        dishEnglish: row.dishEnglish || "",
        totalQty: 0,
        prepSlots: new Set()
      });
    }

    const dish = chef.dishMap.get(row.dish);
    dish.totalQty += row.qtyNumber;
    if (row.prepTimeLabel || row.prepTime) {
      dish.prepSlots.add(row.prepTimeLabel || row.prepTime);
    }
  }

  return Array.from(chefMap.values())
    .map((chef) => ({
      chef: chef.chef,
      department: chef.department,
      totalQty: chef.totalQty,
      items: Array.from(chef.dishMap.values())
        .map((item) => ({
          dish: item.dish,
          dishChinese: item.dishChinese,
          dishEnglish: item.dishEnglish,
          totalQty: item.totalQty,
          prepSlots: Array.from(item.prepSlots).sort(compareTimeLabels)
        }))
        .sort((left, right) => right.totalQty - left.totalQty || left.dish.localeCompare(right.dish))
    }))
    .sort((a, b) => a.chef.localeCompare(b.chef));
}

function compareTimeLabels(left, right) {
  return parseTimeLabel(left) - parseTimeLabel(right) || left.localeCompare(right);
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

module.exports = {
  createChefPreorderRouter
};
