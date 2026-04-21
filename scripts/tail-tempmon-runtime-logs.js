'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { getCoreDbName, getCoreMongoUri } = require('../config/databaseLayout');
const TempMonRuntimeLog = require('../models/TempMonRuntimeLog');

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleString('en-SG', { hour12: false }) : '';
}

function fmtDetails(details) {
  const keys = Object.keys(details || {});
  if (!keys.length) return '';
  return ` ${JSON.stringify(details)}`;
}

async function main() {
  const uri = getCoreMongoUri();
  const dbName = getCoreDbName();
  if (!uri) throw new Error('Core MongoDB URI is not configured.');

  const limit = Math.max(1, Math.min(500, Number(argValue('limit', '50')) || 50));
  const sinceMinutes = Math.max(1, Math.min(60 * 24 * 30, Number(argValue('sinceMinutes', String(24 * 60))) || (24 * 60)));
  const query = {
    createdAt: { $gte: new Date(Date.now() - sinceMinutes * 60 * 1000) }
  };
  ['level', 'eventType', 'gatewayId', 'sensorId'].forEach((key) => {
    const value = argValue(key, '').trim();
    if (value) query[key] = value;
  });

  await mongoose.connect(uri, { dbName });
  const logs = await TempMonRuntimeLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  logs.reverse().forEach((log) => {
    const subject = [log.gatewayId && `gw=${log.gatewayId}`, log.sensorId && `sensor=${log.sensorId}`].filter(Boolean).join(' ');
    console.log(`[${fmtDate(log.createdAt)}] ${String(log.level || '').toUpperCase().padEnd(5)} ${log.eventType}${subject ? ` ${subject}` : ''} - ${log.message}${fmtDetails(log.details)}`);
  });
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err && err.stack || err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
