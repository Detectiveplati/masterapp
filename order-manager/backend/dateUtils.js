function getConfiguredTimeZone() {
  return process.env.ORDER_MANAGER_SCHEDULE_TIMEZONE || "Asia/Singapore";
}

function formatDateInTimeZone(date = new Date(), timeZone = getConfiguredTimeZone()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(date);
}

function getCurrentDateInTimeZone(timeZone = getConfiguredTimeZone()) {
  return formatDateInTimeZone(new Date(), timeZone);
}

function getDateOffsetInTimeZone(offsetDays = 0, timeZone = getConfiguredTimeZone()) {
  const now = new Date();
  const nextDate = new Date(now.getTime() + Number(offsetDays || 0) * 24 * 60 * 60 * 1000);
  return formatDateInTimeZone(nextDate, timeZone);
}

function getTomorrowDateInTimeZone(timeZone = getConfiguredTimeZone()) {
  return getDateOffsetInTimeZone(1, timeZone);
}

module.exports = {
  getDateOffsetInTimeZone,
  formatDateInTimeZone,
  getConfiguredTimeZone,
  getCurrentDateInTimeZone,
  getTomorrowDateInTimeZone
};
