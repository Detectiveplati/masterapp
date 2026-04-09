"use strict";

const express = require("express");
const { requireAuth, requirePermission } = require("../services/auth-middleware");
const { getDb, getDbName, getMongoUri, isProductionEnv } = require("../order-manager/backend/db");
const { getMissingExtractorEnvVars, isExtractorConfigured } = require("../order-manager/backend/extractor");
const { createExtractionRouter } = require("../order-manager/backend/router");
const { createOrderSummaryRouter } = require("../order-manager/backend/orderSummaryRouter");
const { createChefPreorderRouter } = require("../order-manager/backend/chefPrepRouter");
const { createDepartmentCatalogRouter } = require("../order-manager/backend/departmentCatalogRouter");
const { createRetentionSampleRouter } = require("../order-manager/backend/retentionSampleRouter");
const { createTemplogRouter } = require("../order-manager/backend/templogRouter");

const router = express.Router();

router.get("/health", async (req, res) => {
  const mongoUri = getMongoUri();
  const missingEnvVars = getMissingExtractorEnvVars();
  const mongoConfigured = Boolean(String(mongoUri || "").trim());
  const usingAtlas = /^mongodb\+srv:\/\//i.test(String(mongoUri || "").trim());
  const scheduleEnabled = String(process.env.ORDER_MANAGER_SCHEDULE_ENABLED || "true").toLowerCase() === "true";
  const production = isProductionEnv();
  const productionReady = mongoConfigured && (!scheduleEnabled || isExtractorConfigured());

  try {
    const db = await getDb();
    await db.command({ ping: 1 });

    const payload = {
      status: productionReady ? "ok" : "degraded",
      module: "order-manager",
      dbName: getDbName(),
      production,
      productionReady,
      mongoConfigured,
      usingAtlas,
      extractorConfigured: isExtractorConfigured(),
      missingEnvVars,
      scheduleEnabled,
      timeZone: process.env.ORDER_MANAGER_SCHEDULE_TIMEZONE || "Asia/Singapore"
    };

    res.status(productionReady ? 200 : 503).json(payload);
  } catch (error) {
    res.status(503).json({
      status: "error",
      module: "order-manager",
      dbName: getDbName(),
      production,
      productionReady: false,
      mongoConfigured,
      usingAtlas,
      extractorConfigured: isExtractorConfigured(),
      missingEnvVars,
      error: error.message || "Could not connect to order-manager database."
    });
  }
});

router.use(requireAuth, requirePermission("templog"));
router.use("/extractions", createExtractionRouter());
router.use("/order-summary", createOrderSummaryRouter());
router.use("/chef-preorder", createChefPreorderRouter());
router.use("/departments", createDepartmentCatalogRouter());
router.use("/retention-samples", createRetentionSampleRouter());
router.use("/kitchen", createTemplogRouter());

module.exports = router;
