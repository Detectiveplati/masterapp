const cron = require("node-cron");

const { executeExtractionRun, isExtractionRunning } = require("./extractionService");
const {
  getConfiguredTimeZone,
  getCurrentDateInTimeZone,
  getTomorrowDateInTimeZone
} = require("./dateUtils");
const { getMissingExtractorEnvVars, isExtractorConfigured } = require("./extractor");
const {
  acquireScheduledJobLock,
  markScheduledJobFailed,
  markScheduledJobSucceeded
} = require("./jobStore");

const SCHEDULE_SPECS = [
  { runType: "current_day_morning", hour: 4, minute: 0 },
  { runType: "daily_initial", hour: 14, minute: 0 },
  { runType: "daily_refresh", hour: 20, minute: 0 }
];
const RECONCILE_INTERVAL_MS = 60 * 1000;
const CATCH_UP_WINDOW_MINUTES = 8 * 60;
let reconcileTimer = null;
let reconcileInFlight = false;
let completedRunCache = new Set();

function startScheduler() {
  const enabled = parseBoolean(
    process.env.ORDER_MANAGER_SCHEDULE_ENABLED,
    true
  );
  const timeZone = getConfiguredTimeZone();

  if (!enabled) {
    console.log("Order manager scheduler disabled");
    return;
  }

  if (!isExtractorConfigured()) {
    console.warn(
      `Order manager scheduler disabled because extractor env is incomplete: ${getMissingExtractorEnvVars().join(", ")}`
    );
    return;
  }

  SCHEDULE_SPECS.forEach((spec) => {
    cron.schedule(
      `${spec.minute} ${spec.hour} * * *`,
      () => runScheduledJob(spec.runType, timeZone),
      { timezone: timeZone }
    );
  });
  runScheduledCatchUp(timeZone).catch((error) => {
    console.error("Order manager scheduler catch-up failed:", error.message || error);
  });
  if (!reconcileTimer) {
    reconcileTimer = setInterval(() => {
      runScheduledCatchUp(timeZone).catch((error) => {
        console.error("Order manager scheduler reconciliation failed:", error.message || error);
      });
    }, RECONCILE_INTERVAL_MS);
  }
  console.log(`Order manager scheduler active (timezone: ${timeZone})`);
}

async function runScheduledJob(runType, timeZone) {
  if (isExtractionRunning()) {
    console.log(`Skipping scheduled ${runType} extraction because another extraction is running.`);
    return;
  }

  const reportDate = resolveScheduledReportDate(runType, timeZone);
  const cacheKey = buildRunCacheKey(runType, reportDate);
  clearCompletedRunCache(reportDate);
  if (completedRunCache.has(cacheKey)) {
    return;
  }
  const jobKey = `order-manager:${runType}`;
  const locked = await acquireScheduledJobLock(jobKey, reportDate);
  if (!locked) {
    completedRunCache.add(cacheKey);
    return;
  }

  try {
    const savedRun = await executeExtractionRun({ reportDate, runType });
    await markScheduledJobSucceeded(jobKey, reportDate, {
      runId: String(savedRun._id || ""),
      extractedAt: savedRun.extractedAt
    });
    completedRunCache.add(cacheKey);
    console.log(`Scheduled ${runType} extraction saved for ${reportDate} at ${savedRun.extractedAt} (${timeZone})`);
  } catch (error) {
    await markScheduledJobFailed(jobKey, reportDate, error.message || error);
    console.error(`Scheduled ${runType} extraction failed for ${reportDate}:`, error.message || error);
  }
}

async function runScheduledCatchUp(timeZone) {
  if (reconcileInFlight || isExtractionRunning()) {
    return;
  }

  reconcileInFlight = true;
  try {
    const dueRuns = getDueScheduledRuns(timeZone);
    for (const dueRun of dueRuns) {
      if (isExtractionRunning()) {
        break;
      }
      await runScheduledJob(dueRun.runType, timeZone);
    }
  } finally {
    reconcileInFlight = false;
  }
}

function getDueScheduledRuns(timeZone) {
  const parts = getTimePartsInTimeZone(new Date(), timeZone);
  if (!parts) {
    return [];
  }

  const nowMinutes = parts.hour * 60 + parts.minute;
  return SCHEDULE_SPECS.filter((spec) => {
    const scheduledMinutes = spec.hour * 60 + spec.minute;
    const diff = nowMinutes - scheduledMinutes;
    return diff >= 0 && diff <= CATCH_UP_WINDOW_MINUTES;
  });
}

function getTimePartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
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
  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day),
    hour,
    minute
  };
}

function resolveScheduledReportDate(runType, timeZone) {
  if (runType === "current_day_morning") {
    return getCurrentDateInTimeZone(timeZone);
  }
  return getTomorrowDateInTimeZone(timeZone);
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  return String(value).toLowerCase() === "true";
}

function buildRunCacheKey(runType, reportDate) {
  return `${String(runType || "").trim()}||${String(reportDate || "").trim()}`;
}

function clearCompletedRunCache(activeReportDate) {
  const keepSuffix = `||${String(activeReportDate || "").trim()}`;
  completedRunCache = new Set(
    Array.from(completedRunCache).filter((entry) => entry.endsWith(keepSuffix))
  );
}

module.exports = {
  startScheduler
};
