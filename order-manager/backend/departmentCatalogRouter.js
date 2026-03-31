const express = require("express");

const {
  getDepartmentCatalogDashboard,
  listDepartments,
  listDishCatalog,
  saveDishDepartmentAssignment,
  upsertDepartment
} = require("./departmentCatalogStore");
const { reapplyDepartmentAssignmentsToAllRuns } = require("./departmentResolver");
const { findLatestExtractionRunForDate } = require("./reportStore");

function createDepartmentCatalogRouter() {
  const router = express.Router();

  router.get("/dashboard", async (req, res) => {
    try {
      const filters = readCatalogFilters(req);
      const [dashboard, latestAudit] = await Promise.all([
        getDepartmentCatalogDashboard(filters),
        loadLatestRunAudit(req.query.date || "")
      ]);
      res.json({
        ...dashboard,
        latestAudit,
        filters
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load department dashboard." });
    }
  });

  router.get("/departments", async (req, res) => {
    try {
      const departments = await listDepartments();
      res.json(departments);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not list departments." });
    }
  });

  router.post("/departments", express.json(), async (req, res) => {
    try {
      const department = await upsertDepartment(req.body || {});
      const rebuild = await reapplyDepartmentAssignmentsToAllRuns();
      res.status(201).json({
        department,
        rebuild
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save department." });
    }
  });

  router.put("/departments/:code", express.json(), async (req, res) => {
    try {
      const department = await upsertDepartment({
        ...(req.body || {}),
        code: req.params.code
      });
      const rebuild = await reapplyDepartmentAssignmentsToAllRuns();
      res.json({
        department,
        rebuild
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update department." });
    }
  });

  router.get("/dishes", async (req, res) => {
    try {
      const dishes = await listDishCatalog(readCatalogFilters(req));
      res.json(dishes);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not list dishes." });
    }
  });

  router.put("/dishes/:dishKey", express.json(), async (req, res) => {
    try {
      const dish = await saveDishDepartmentAssignment(req.params.dishKey, req.body || {});
      const rebuild = await reapplyDepartmentAssignmentsToAllRuns();
      res.json({
        dish,
        rebuild
      });
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not save dish assignment." });
    }
  });

  return router;
}

async function loadLatestRunAudit(requestedDate) {
  const run = await findLatestExtractionRunForDate(requestedDate, {
    projection: {
      reportDate: 1,
      extractedAt: 1,
      csvRows: 1
    }
  });
  if (!run) {
    return null;
  }

  const rows = Array.isArray(run.csvRows) ? run.csvRows : [];
  const reviewRows = rows.filter((row) => row && row.needsDepartmentReview);
  const sourceOnlyRows = rows.filter((row) => row && row.mappingSource === "source");
  const unresolvedDishes = new Set(
    reviewRows
      .map((row) => String(row.dish || "").trim())
      .filter(Boolean)
  );

  return {
    reportDate: run.reportDate || "",
    extractedAt: run.extractedAt || "",
    rowCount: rows.length,
    reviewRowCount: reviewRows.length,
    sourceOnlyRowCount: sourceOnlyRows.length,
    unresolvedDishCount: unresolvedDishes.size
  };
}

function readCatalogFilters(req) {
  return {
    q: String(req.query.q || "").trim(),
    status: String(req.query.status || "").trim(),
    departmentCode: String(req.query.departmentCode || "").trim(),
    limit: Number(req.query.limit) || 400
  };
}

module.exports = {
  createDepartmentCatalogRouter
};
