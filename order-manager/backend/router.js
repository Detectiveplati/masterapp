const express = require("express");

const { getMissingExtractorEnvVars, isExtractorConfigured, toCsv } = require("./extractor");
const { executeExtractionRun, isExtractionRunning } = require("./extractionService");
const {
  findLatestExtractionRunForDate,
  findRunByDateAndType,
  getLatestExtractionRun,
  summarizeResult
} = require("./reportStore");
const { listScheduledJobsForDate } = require("./jobStore");
const {
  getConfiguredTimeZone,
  getCurrentDateInTimeZone,
  getTomorrowDateInTimeZone
} = require("./dateUtils");

const AUTO_SLOT_META = {
  current_day_morning: {
    runType: "current_day_morning",
    label: "4:00 AM Current Day",
    scheduledTime: "04:00"
  },
  daily_initial: {
    runType: "daily_initial",
    label: "2:00 PM Auto",
    scheduledTime: "14:00"
  },
  daily_refresh: {
    runType: "daily_refresh",
    label: "8:00 PM Refresh",
    scheduledTime: "20:00"
  }
};

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

  router.get("/status", async (req, res) => {
    const requestedDate = normalizeDateInput(String(req.query && req.query.date ? req.query.date : "").trim());
    const timeZone = getConfiguredTimeZone();
    const reportDate = requestedDate || getCurrentDateInTimeZone(timeZone);

    try {
      res.json(await buildExtractionStatus(reportDate, timeZone));
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load extraction status." });
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

async function buildExtractionStatus(reportDate, timeZone) {
  const today = getCurrentDateInTimeZone(timeZone);
  const tomorrow = getTomorrowDateInTimeZone(timeZone);
  const slotTypes = resolveSlotTypesForDate(reportDate, today, tomorrow);

  const [latestRun, jobs, runsByTypeEntries] = await Promise.all([
    findLatestExtractionRunForDate(reportDate, {
      projection: {
        extractedAt: 1,
        reportDate: 1,
        runType: 1
      }
    }),
    listScheduledJobsForDate(reportDate),
    Promise.all(slotTypes.map(async (runType) => ([
      runType,
      await findRunByDateAndType(reportDate, runType, {
        projection: {
          _id: 1,
          extractedAt: 1,
          reportDate: 1,
          runType: 1
        }
      })
    ])))
  ]);

  const jobsByType = new Map(
    jobs
      .map((job) => [normalizeJobRunType(job.jobKey), job])
      .filter((entry) => entry[0])
  );
  const runsByType = new Map(runsByTypeEntries);

  return {
    reportDate,
    timeZone,
    expectedSlots: slotTypes.map((runType) => buildSlotStatus({
      reportDate,
      runType,
      today,
      tomorrow,
      timeZone,
      job: jobsByType.get(runType) || null,
      run: runsByType.get(runType) || null
    })),
    latestRun: latestRun
      ? {
          id: String(latestRun._id || ""),
          runType: latestRun.runType || "manual",
          extractedAt: latestRun.extractedAt || ""
        }
      : null
  };
}

function buildSlotStatus({ reportDate, runType, today, tomorrow, timeZone, job, run }) {
  const meta = AUTO_SLOT_META[runType];
  const state = resolveSlotState({ reportDate, runType, today, tomorrow, timeZone, job, run });

  return {
    slotKey: runType,
    label: meta.label,
    scheduledTime: meta.scheduledTime,
    status: state.code,
    statusLabel: state.label,
    finishedAt: job && job.finishedAt ? job.finishedAt : run && run.extractedAt ? run.extractedAt : "",
    error: job && job.status === "failed" ? String(job.error || "") : "",
    runId: run ? String(run._id || "") : ""
  };
}

function resolveSlotState({ reportDate, runType, today, tomorrow, timeZone, job, run }) {
  if (job && job.status === "failed") {
    return { code: "failed", label: "Failed" };
  }

  if (run || (job && job.status === "succeeded")) {
    return { code: "succeeded", label: "Succeeded" };
  }

  if (job && job.status === "running") {
    return { code: "pending", label: "Running" };
  }

  if (reportDate !== today && reportDate !== tomorrow) {
    return { code: "missing", label: "No record" };
  }

  return isSlotDueForDate(runType, reportDate, today, tomorrow, timeZone)
    ? { code: "pending", label: "Pending" }
    : { code: "not_due", label: "Not due yet" };
}

function resolveSlotTypesForDate(reportDate, today, tomorrow) {
  if (reportDate === today) {
    return ["current_day_morning"];
  }
  if (reportDate === tomorrow) {
    return ["daily_initial", "daily_refresh"];
  }
  return ["current_day_morning", "daily_initial", "daily_refresh"];
}

function isSlotDueForDate(runType, reportDate, today, tomorrow, timeZone) {
  if (reportDate === today && runType !== "current_day_morning") {
    return false;
  }
  if (reportDate === tomorrow && runType === "current_day_morning") {
    return false;
  }

  const nowParts = getTimePartsInTimeZone(new Date(), timeZone);
  if (!nowParts) {
    return false;
  }

  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const scheduledMinutes = runType === "current_day_morning"
    ? 4 * 60
    : runType === "daily_initial"
      ? 14 * 60
      : 20 * 60;

  return nowMinutes >= scheduledMinutes;
}

function normalizeJobRunType(jobKey) {
  const text = String(jobKey || "").trim();
  const match = text.match(/^order-manager:(.+)$/);
  return match ? match[1] : "";
}

function getTimePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(byType.hour);
  const minute = Number(byType.minute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return { hour, minute };
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
