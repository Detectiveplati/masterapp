'use strict';

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'foodsafety-forms-debug.log');
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

function ensureLogDir() {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (_) {}
}

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < MAX_SIZE_BYTES) return;
    const rotated = `${LOG_FILE}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.renameSync(LOG_FILE, rotated);
  } catch (_) {}
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return JSON.stringify({ error: 'serialize_failed' });
  }
}

function logFoodSafetyDebug(event, details) {
  try {
    ensureLogDir();
    rotateIfNeeded();
    const line = `${new Date().toISOString()} ${event} ${safeJson(details || {})}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    console.error('✗ [FoodSafety Debug Log] write failed:', err.message);
  }
}

function readFoodSafetyDebugLines(limit) {
  ensureLogDir();
  try {
    const count = Math.max(1, Math.min(Number(limit) || 200, 1000));
    if (!fs.existsSync(LOG_FILE)) return [];
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.slice(-count);
  } catch (err) {
    console.error('✗ [FoodSafety Debug Log] read failed:', err.message);
    return [];
  }
}

module.exports = {
  LOG_FILE,
  logFoodSafetyDebug,
  readFoodSafetyDebugLines
};
