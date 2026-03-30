const express = require("express");

const { getMissingExtractorEnvVars, isExtractorConfigured, toCsv } = require("./extractor");
const { executeExtractionRun, isExtractionRunning } = require("./extractionService");
const {
  getLatestExtractionRun,
  summarizeResult
} = require("./reportStore");

function createExtractionRouter() {
  const router = express.Router();

  let latestResult = null;

  router.get("/latest", async (req, res) => {
    try {
      if (!latestResult) {
        latestResult = await getLatestExtractionRun();
      }

      res.json({
        isRunning: isExtractionRunning(),
        latestResult: summarizeResult(latestResult)
      });
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load latest extraction." });
    }
  });

  router.post("/extract", express.json(), async (req, res) => {
    if (isExtractionRunning()) {
      return res.status(409).json({ error: "An extraction is already running." });
    }

    if (!isExtractorConfigured()) {
      return res.status(503).json({
        error: "Extractor is not configured for production.",
        missingEnvVars: getMissingExtractorEnvVars()
      });
    }

    const reportDate = normalizeDateInput(req.body && req.body.date);
    if (!reportDate) {
      return res.status(400).json({ error: "A valid date is required." });
    }

    try {
      latestResult = await executeExtractionRun({ reportDate, runType: "manual" });
      res.json(summarizeResult(latestResult));
    } catch (error) {
      res.status(500).json({ error: error.message || "Extraction failed." });
    }
  });

  router.get("/latest.csv", async (req, res) => {
    try {
      if (!latestResult) {
        latestResult = await getLatestExtractionRun({
          projection: {
            extractedAt: 1,
            csvRows: 1
          }
        });
      }

      if (!latestResult) {
        return res.status(404).json({ error: "No extracted data available yet." });
      }

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="order-manager-${latestResult.extractedAt.slice(0, 10)}.csv"`
      );
      res.send(`\uFEFF${toCsv(latestResult.csvRows || [])}`);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not export latest extraction." });
    }
  });

  return router;
}

function normalizeDateInput(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!slashMatch) {
    return "";
  }

  const [, day, month, year] = slashMatch;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

module.exports = {
  createExtractionRouter
};
