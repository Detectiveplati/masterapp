'use strict';

const TEMPMON_FOODSAFETY_TEMPLATE_CODE = 'CAC-SOP-02-F01-TEMPMON';
const TEMPMON_FOODSAFETY_FORM_TYPE = 'external_report';
const TEMPMON_FOODSAFETY_TITLE = 'Monthly Equipment Temperature Log';
const TEMPMON_FOODSAFETY_CATEGORY = 'Temperature Monitoring';

function isTempMonFoodSafetyTemplate(templateCode) {
  return String(templateCode || '').trim() === TEMPMON_FOODSAFETY_TEMPLATE_CODE;
}

function getTempMonFoodSafetyEntryUrl(unitId, monthKey) {
  return `/tempmon/report.html?unitId=${encodeURIComponent(String(unitId || '').trim())}&month=${encodeURIComponent(String(monthKey || '').trim())}`;
}

function getTempMonFoodSafetyPdfUrl(unitId, monthKey) {
  return `/api/foodsafety-checklists/month/report-tempmon.pdf?unit=${encodeURIComponent(String(unitId || '').trim())}&month=${encodeURIComponent(String(monthKey || '').trim())}`;
}

module.exports = {
  TEMPMON_FOODSAFETY_TEMPLATE_CODE,
  TEMPMON_FOODSAFETY_FORM_TYPE,
  TEMPMON_FOODSAFETY_TITLE,
  TEMPMON_FOODSAFETY_CATEGORY,
  isTempMonFoodSafetyTemplate,
  getTempMonFoodSafetyEntryUrl,
  getTempMonFoodSafetyPdfUrl
};
