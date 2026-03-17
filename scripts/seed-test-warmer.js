'use strict';
/**
 * Creates (or resets) a TEST WARMER unit + test device in the database.
 *
 * Short timeouts so you can observe transitions within 2 minutes:
 *   offConfirmMinutes : 2  (instead of 20)
 *   faultMinutes      : 2  (instead of 30)
 *
 * Usage:
 *   cd masterapp
 *   node scripts/seed-test-warmer.js
 *
 * Then inject readings with:
 *   node scripts/inject-test-readings.js
 *
 * Reads MAINTENANCE_MONGODB_URI from a .env file in the masterapp directory.
 * If no .env is present, falls back to localhost.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const TempMonUnit   = require('../models/TempMonUnit');
const TempMonDevice = require('../models/TempMonDevice');

const MONGO_URI = process.env.MAINTENANCE_MONGODB_URI
  || 'mongodb://localhost:27017/central_kitchen_maintenance';

const TEST_UNIT_NAME   = '[TEST] Warmer State Machine';
const TEST_DEVICE_ID   = 'TEST-WARMER-001';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  // Clean up any previous test unit + device
  const old = await TempMonUnit.findOneAndDelete({ name: TEST_UNIT_NAME });
  if (old) await TempMonDevice.deleteMany({ unit: old._id });
  await TempMonDevice.deleteMany({ deviceId: TEST_DEVICE_ID });

  const unit = await TempMonUnit.create({
    name:     TEST_UNIT_NAME,
    type:     'warmer',
    location: 'Test Bench',
    area:     'Test',

    // Standard warmer thresholds (UK hot-holding legal minimum)
    criticalMin:   63,   // °C — warmer must reach this to be ACTIVE
    criticalMax:   90,   // °C — upper alert limit
    warningBuffer:  2,
    targetTemp:    70,

    alertThresholdMinutes: 0,  // alert immediately for testing
    inUse: true,

    // *** Short timeouts for rapid testing ***
    warmerStateConfig: {
      roomTempCeiling:   35,  // ≤ 35°C = off / room temp
      warmupStartTemp:   40,  // > 40°C = warming up
      offConfirmMinutes:  2,  // 2 min at room temp → confirmed OFF
      faultMinutes:       2,  // 2 min stuck in warming-up → FAULT
    },

    warmerState: { state: 'unknown' }
  });

  const device = await TempMonDevice.create({
    unit:     unit._id,
    deviceId: TEST_DEVICE_ID,
    label:    'Test probe',
    expectedIntervalMinutes: 1,
    active: true
  });

  console.log('\n✅ Test warmer unit + device created:');
  console.log('   Unit name :', unit.name);
  console.log('   Unit ID   :', unit._id.toString());
  console.log('   Device ID :', device.deviceId);
  console.log('   Target    : ≥', unit.criticalMin, '°C to be ACTIVE');
  console.log('   Fault in  : 2 min stuck in 40–63°C range');
  console.log('   Off after : 2 min ≤ 35°C');
  console.log('\nNext step — run the injector:');
  console.log('   node scripts/inject-test-readings.js');
  console.log('\nView at: /tempmon/unit.html?id=' + unit._id.toString());

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});
