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

  cron.schedule("0 4 * * *", () => runScheduledJob("current_day_morning", timeZone), { timezone: timeZone });
  cron.schedule("0 14 * * *", () => runScheduledJob("daily_initial", timeZone), { timezone: timeZone });
  cron.schedule("0 20 * * *", () => runScheduledJob("daily_refresh", timeZone), { timezone: timeZone });
  console.log(`Order manager scheduler active (timezone: ${timeZone})`);
}

async function runScheduledJob(runType, timeZone) {
  if (isExtractionRunning()) {
    console.log(`Skipping scheduled ${runType} extraction because another extraction is running.`);
    return;
  }

  const reportDate = resolveScheduledReportDate(runType, timeZone);
  const jobKey = `order-manager:${runType}`;
  const locked = await acquireScheduledJobLock(jobKey, reportDate);
  if (!locked) {
    console.log(`Skipping scheduled ${runType} extraction because ${reportDate} is already recorded.`);
    return;
  }

  try {
    const savedRun = await executeExtractionRun({ reportDate, runType });
    await markScheduledJobSucceeded(jobKey, reportDate, {
      runId: String(savedRun._id || ""),
      extractedAt: savedRun.extractedAt
    });
    console.log(`Scheduled ${runType} extraction saved for ${reportDate} at ${savedRun.extractedAt} (${timeZone})`);
  } catch (error) {
    await markScheduledJobFailed(jobKey, reportDate, error.message || error);
    console.error(`Scheduled ${runType} extraction failed for ${reportDate}:`, error.message || error);
  }
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

module.exports = {
  startScheduler
};
