#!/usr/bin/env node
/**
 * seed-tempmon.js
 * One-time script to create all TempMon units and register LoRa sensors
 * from the "Temp sensor id.xlsx" spreadsheet.
 *
 * Run once:  node seed-tempmon.js
 * Safe to re-run — uses upsert on name / deviceId / sensorId.
 * Uses the configured core/templog database layout with legacy env fallbacks.
 */
'use strict';
require('dotenv').config();
const mongoose   = require('mongoose');
const { MongoClient } = require('mongodb');
const {
  COLLECTIONS,
  getCoreDbName,
  getCoreMongoUri,
  getTemplogDbName,
  getTemplogMongoUri
} = require('./config/databaseLayout');

// ── Models ────────────────────────────────────────────────────────────────────
const TempMonUnit   = require('./models/TempMonUnit');
const TempMonDevice = require('./models/TempMonDevice');

// ── Temperature limit defaults ────────────────────────────────────────────────
const LIMITS = {
  freezer: { criticalMin: -25, criticalMax: -12, warningBuffer: 2, targetTemp: -18 },
  chiller: { criticalMin:   1, criticalMax:   8, warningBuffer: 2, targetTemp:   4 },
  warmer:  { criticalMin:  60, criticalMax:  90, warningBuffer: 5, targetTemp:  68 },
};

// ── Equipment type → TempLog equipment label ──────────────────────────────────
const TYPE_TO_EQUIP = { freezer: 'freezer', chiller: 'chiller', warmer: 'food-warmer' };

// ── Sensor list (from Temp sensor id.xlsx, SN column) ────────────────────────
// Format: { sn, name, type }
//   type: 'warmer' | 'chiller' | 'freezer'
const SENSORS = [
  // ── Food Warmers (FW) ───────────────────────────────────────────────────────
  { sn: '9240013', name: 'CK-B4-FW-01',                             type: 'warmer'  },
  { sn: '9240014', name: 'CK-B4-FW-02',                             type: 'warmer'  },
  { sn: '9240127', name: 'CK-B4-FW-03',                             type: 'warmer'  },
  { sn: '9240128', name: 'CK-B4-FW-04',                             type: 'warmer'  },
  { sn: '9240129', name: 'CK-B4-FW-05',                             type: 'warmer'  },
  { sn: '9240130', name: 'CK-B5-FW-06',                             type: 'warmer'  },

  // ── Walk-in Chillers (WC) ───────────────────────────────────────────────────
  { sn: '82242245', name: 'CK-WC-01 (Packing Room WC)',             type: 'chiller' },
  { sn: '82242251', name: 'CK-WC-02 (Hot Kitchen Veg WC)',          type: 'chiller' },
  { sn: '82242252', name: 'CK-WC-03 (Hot Kitchen Meat WC)',         type: 'chiller' },
  { sn: '82242253', name: 'CK-WC-04 (Old Sauce Area Veg WC)',       type: 'chiller' },
  { sn: '82242249', name: 'CK-WC-05 (Processed Veg WC)',            type: 'chiller' },
  { sn: '82242250', name: 'CK-WC-06 (Veg Prep WC)',                 type: 'chiller' },
  { sn: '82242275', name: 'CK-WC-07 (06-24 Raw Fish WC)',           type: 'chiller' },
  { sn: '82242261', name: 'CK-WC-08 (06-24 Raw Meat WC)',           type: 'chiller' },
  { sn: '82242260', name: 'CK-WC-09 (05-26 Main Walk-In Chiller)',  type: 'chiller' },
  { sn: '82242254', name: 'CK-WC-11 (05-27 Chiller)',               type: 'chiller' },
  { sn: '82242256', name: 'CK-WC-12 (06-19 Bakery WC)',             type: 'chiller' },

  // ── Standing Chillers (SC) ──────────────────────────────────────────────────
  { sn: '82242255', name: 'CK-SC-01 (Fruit Room SC)',               type: 'chiller' },
  { sn: '82242248', name: 'CK-SC-02 (Salad Room SC)',               type: 'chiller' },
  { sn: '82242247', name: 'CK-C3-SC-01',                            type: 'chiller' },
  { sn: '82242258', name: 'CK-SC-05 (06-19 2-Door Right SC)',       type: 'chiller' },
  { sn: '82242259', name: 'CK-SC-06 (4-Door Left SC)',              type: 'chiller' },

  // ── Counter Chillers (CC) ───────────────────────────────────────────────────
  { sn: '82242246', name: 'CK-CC-01 (Dong Counter Chiller)',        type: 'chiller' },
  { sn: '82242257', name: 'CK-CC-03 (Cold Room CC)',                type: 'chiller' },

  // ── Standing Freezer (SF) ───────────────────────────────────────────────────
  { sn: '82242262', name: 'CK-SF-01 (Retention Sample SF)',         type: 'freezer' },

  // ── Walk-in Freezers (WF) ───────────────────────────────────────────────────
  { sn: '82242264', name: 'CK-WF-01 (Braising RTC/RTE WF)',        type: 'freezer' },
  { sn: '82242263', name: 'CK-WF-02 (06-24 WF)',                   type: 'freezer' },
  { sn: '82242268', name: 'CK-WF-03 (05-26 Walk-In Freezer)',      type: 'freezer' },
  { sn: '82242267', name: 'CK-WF-04 (05-27 WF)',                   type: 'freezer' },
  { sn: '82242265', name: 'CK-WF-05 (06-19 Side WF)',              type: 'freezer' },
  { sn: '82242266', name: 'CK-WF-06 (06-19 Big WF)',               type: 'freezer' },
];

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const MAINTENANCE_URI = getCoreMongoUri();
  const TEMPLOG_URI     = getTemplogMongoUri();
  const MAINTENANCE_DB  = getCoreDbName();
  const TEMPLOG_DB      = getTemplogDbName();

  if (!MAINTENANCE_URI || !TEMPLOG_URI) {
    console.error('❌ Missing maintenance or templog MongoDB configuration in .env');
    process.exit(1);
  }

  // Connect Mongoose (TempMon models)
  console.log('🔗 Connecting to Maintenance DB…');
  await mongoose.connect(MAINTENANCE_URI, { dbName: MAINTENANCE_DB });
  console.log(`   ✓ Connected (${MAINTENANCE_DB})`);

  // Connect native driver (lora_devices)
  console.log('🔗 Connecting to TempLog DB…');
  const templogClient = await MongoClient.connect(TEMPLOG_URI,
    TEMPLOG_URI.startsWith('mongodb+srv') ? { tls: true } : {}
  );
  const templogDb = templogClient.db(TEMPLOG_DB);
  console.log(`   ✓ Connected (${TEMPLOG_DB})\n`);

  let created = 0, updated = 0, skipped = 0;

  for (const sensor of SENSORS) {
    const limits = LIMITS[sensor.type];
    const equipment = TYPE_TO_EQUIP[sensor.type];
    const sn = sensor.sn.trim().toUpperCase();

    // 1 ── Upsert TempMonUnit ─────────────────────────────────────────────────
    const unitDoc = await TempMonUnit.findOneAndUpdate(
      { name: sensor.name },
      {
        $setOnInsert: {
          name:          sensor.name,
          type:          sensor.type,
          ...limits,
          active:        true,
          alertThresholdMinutes: 30,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const unitId = unitDoc._id;
    const isNewUnit = unitDoc.createdAt &&
      (Date.now() - new Date(unitDoc.createdAt).getTime()) < 10000;

    // 2 ── Upsert TempMonDevice ───────────────────────────────────────────────
    await TempMonDevice.findOneAndUpdate(
      { deviceId: sn },
      {
        $set:        { unit: unitId, label: sensor.name, active: true },
        $setOnInsert: { deviceId: sn, expectedIntervalMinutes: 5 },
      },
      { upsert: true, new: true }
    );

    // 3 ── Upsert lora_devices in TempLog DB ─────────────────────────────────
    const now = new Date();
    const loraResult = await templogDb.collection(COLLECTIONS.templog.LORA_DEVICES).updateOne(
      { sensorId: sn },
      {
        $set: {
          equipment,
          tempmonUnitId: String(unitId),
          model:         'TAG08B',
          alias:         sensor.name,
          enabled:       true,
          updatedAt:     now,
        },
        $setOnInsert: { sensorId: sn, createdAt: now },
      },
      { upsert: true }
    );

    const action = loraResult.upsertedCount ? 'CREATED' : 'UPDATED';
    console.log(`  ${action === 'CREATED' ? '✅' : '🔄'} [${action}] ${sensor.name}  SN:${sn}  type:${sensor.type}  unit:${unitId}`);
    if (action === 'CREATED') created++; else updated++;
  }

  console.log(`\n✅ Done — ${created} created, ${updated} updated, ${skipped} skipped`);
  console.log('⚠️  Default temp limits applied (adjust per unit in Setup if needed):');
  console.log('   Freezer: -25 to -12°C  |  Chiller: 1 to 8°C  |  Warmer: 60 to 90°C');

  await mongoose.disconnect();
  await templogClient.close();
}

main().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
