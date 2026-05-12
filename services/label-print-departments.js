'use strict';

function normalizeDepartmentName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function slugifyDepartmentName(value) {
  return normalizeDepartmentName(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isLabelPrintAdmin(user) {
  return Boolean(user && user.role === 'admin');
}

function assignedLabelPrintDepartment(user) {
  return normalizeDepartmentName(user && user.labelPrintDepartmentName);
}

module.exports = {
  normalizeDepartmentName,
  slugifyDepartmentName,
  isLabelPrintAdmin,
  assignedLabelPrintDepartment
};
