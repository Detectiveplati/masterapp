const express = require("express");

const { findPreferredExtractionRun, listAvailableReportDates } = require("./reportStore");
const { getCurrentDateInTimeZone } = require("./dateUtils");
const { enrichCombinedRow, parseTimeLabel } = require("./reportRowUtils");

function createOrderSummaryRouter() {
  const router = express.Router();

  router.get("/latest", async (req, res) => {
    try {
      const run = await findPreferredExtractionRun("", req.query.date, {
        projection: {
          reportDate: 1,
          runType: 1,
          extractedAt: 1,
          refreshSummary: 1,
          csvRows: 1
        }
      });
      if (!run) {
        return res.status(404).json({ error: "No extracted report found in MongoDB. Run the extractor first." });
      }

      const rows = [];
      for (const row of Array.isArray(run.csvRows) ? run.csvRows : []) {
        if (row.unmatchedReason || !row.reportDate || !row.chef || !row.dish) {
          continue;
        }
        rows.push(enrichCombinedRow(row));
      }

      const selectedDate = normalizeDate(req.query.date);
      const reportDates = await listAvailableReportDates();
      const activeDate = selectReportDate(reportDates, selectedDate);
      const filteredRows = activeDate ? rows.filter((row) => row.reportDate === activeDate) : rows;

      const payload = buildSummaryPayload(filteredRows, {
        reportId: String(run._id),
        sourceFilename: `MongoDB report ${run.reportDate || run.extractedAt.slice(0, 10)}`,
        runType: run.runType || "manual",
        refreshSummary: run.refreshSummary || null,
        reportDates,
        selectedDate: activeDate
      });

      res.json(payload);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not build order summary." });
    }
  });

  return router;
}

function buildSummaryPayload(rows, meta) {
  const chefMap = new Map();
  const orderSet = new Set();
  let totalQty = 0;

  for (const row of rows) {
    const qtyNumber = row.qtyNumber;
    totalQty += qtyNumber;
    if (row.orderNumber) orderSet.add(row.orderNumber);

    if (!chefMap.has(row.chef)) {
      chefMap.set(row.chef, {
        chef: row.chef,
        totalQty: 0,
        orderSet: new Set(),
        editedOrderSet: new Set(),
        dishMap: new Map()
      });
    }

    const chef = chefMap.get(row.chef);
    chef.totalQty += qtyNumber;
    if (row.orderNumber) chef.orderSet.add(row.orderNumber);
    if (row.hasAlert && row.orderNumber) chef.editedOrderSet.add(row.orderNumber);

    const dishKey = row.dish;
    if (!chef.dishMap.has(dishKey)) {
      chef.dishMap.set(dishKey, {
        dish: row.dish,
        dishChinese: row.dishChinese || row.dish,
        dishEnglish: row.dishEnglish || "",
        totalQty: 0,
        orderSet: new Set(),
        prepTimes: new Set(),
        editedOrderSet: new Set(),
        hasUpdates: false
      });
    }

    const dish = chef.dishMap.get(dishKey);
    dish.totalQty += qtyNumber;
    if (row.orderNumber) dish.orderSet.add(row.orderNumber);
    if (row.prepTimeLabel || row.prepTime) dish.prepTimes.add(row.prepTimeLabel || row.prepTime);
    if (row.hasAlert && row.orderNumber) dish.editedOrderSet.add(row.orderNumber);
    if (row.hasAlert) dish.hasUpdates = true;
  }

  const chefs = Array.from(chefMap.values())
    .map((chef) => ({
      chef: chef.chef,
      totalQty: chef.totalQty,
      orderCount: chef.orderSet.size,
      editedOrderCount: chef.editedOrderSet.size,
      dishCount: chef.dishMap.size,
      dishes: Array.from(chef.dishMap.values())
        .map((dish) => ({
          dish: dish.dish,
          dishChinese: dish.dishChinese,
          dishEnglish: dish.dishEnglish,
          totalQty: dish.totalQty,
          orderCount: dish.orderSet.size,
          editedOrderCount: dish.editedOrderSet.size,
          hasUpdates: dish.hasUpdates,
          prepTimes: Array.from(dish.prepTimes).sort(compareTimeLabels)
        }))
        .sort((left, right) => Number(right.hasUpdates) - Number(left.hasUpdates) || right.totalQty - left.totalQty || left.dish.localeCompare(right.dish))
    }))
    .sort((left, right) => right.editedOrderCount - left.editedOrderCount || right.totalQty - left.totalQty || left.chef.localeCompare(right.chef));

  return {
    ...meta,
    totalQty,
    orderCount: orderSet.size,
    updatedOrderCount: new Set(
      rows
        .filter((row) => row.hasAlert && row.orderNumber)
        .map((row) => row.orderNumber)
    ).size,
    chefCount: chefs.length,
    chefs
  };
}

function normalizeDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim()) ? String(value).trim() : "";
}

function compareTimeLabels(left, right) {
  return parseTimeLabel(left) - parseTimeLabel(right) || left.localeCompare(right);
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
  createOrderSummaryRouter
};
