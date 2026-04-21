'use strict';

const mongoose = require('mongoose');
const TempMonRuntimeLog = require('../models/TempMonRuntimeLog');

const VALID_LEVELS = new Set(['debug', 'info', 'warn', 'error']);
const MAX_DETAIL_STRING = 800;
const MAX_DETAIL_ARRAY = 30;
const MAX_DETAIL_KEYS = 40;

function safeString(value, max = 240) {
  return String(value == null ? '' : value).slice(0, max);
}

function sanitizeDetails(value, depth = 0) {
  if (value == null) return value;
  if (depth > 4) return '[truncated-depth]';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[buffer:${value.length}]`;
  if (Array.isArray(value)) return value.slice(0, MAX_DETAIL_ARRAY).map((entry) => sanitizeDetails(entry, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).slice(0, MAX_DETAIL_KEYS).forEach(([key, entry]) => {
      if (/password|secret|token|cookie|authorization|uri|connection/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = sanitizeDetails(entry, depth + 1);
      }
    });
    return out;
  }
  if (typeof value === 'string') return value.slice(0, MAX_DETAIL_STRING);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return safeString(value, MAX_DETAIL_STRING);
}

async function logTempMonRuntime(input = {}) {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const eventType = safeString(input.eventType || 'runtime', 120) || 'runtime';
    await TempMonRuntimeLog.create({
      level: VALID_LEVELS.has(input.level) ? input.level : 'info',
      eventType,
      message: safeString(input.message || eventType, 500),
      gatewayId: safeString(input.gatewayId, 160),
      sensorId: safeString(input.sensorId, 80),
      unitId: safeString(input.unitId, 80),
      deviceId: safeString(input.deviceId, 80),
      details: sanitizeDetails(input.details || {})
    });
  } catch (_) {
    // Runtime logging must never interrupt ingestion.
  }
}

function logTempMonRuntimeSoon(input = {}) {
  setImmediate(() => {
    logTempMonRuntime(input).catch(() => {});
  });
}

module.exports = {
  logTempMonRuntime,
  logTempMonRuntimeSoon,
  sanitizeDetails
};
