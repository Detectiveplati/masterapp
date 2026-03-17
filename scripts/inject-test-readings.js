'use strict';
/**
 * Injects simulated temperature readings to test the warmer state machine.
 *
 * Requires the server to be running locally (or set BASE_URL env var).
 * Run seed-test-warmer.js first to create the test unit + device.
 *
 * Usage:
 *   node scripts/inject-test-readings.js [scenario]
 *
 * Scenarios:
 *   warmup-to-active   — room temp → warming up → reaches target (ACTIVE)
 *   fault              — room temp → warming up → stays stuck for 2+ min (FAULT)
 *   off                — active → cooling → confirmed off
 *   all                — runs all three scenarios in sequence (default)
 */

require('dotenv').config();

const BASE_URL    = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const GATEWAY_KEY = process.env.GATEWAY_API_KEY || '';
const DEVICE_ID   = 'TEST-WARMER-001';

async function post(temp, minsAgo = 0) {
  const recordedAt = new Date(Date.now() - minsAgo * 60000).toISOString();
  const body = JSON.stringify({
    gatewayId: 'test-script',
    readings: [{ deviceId: DEVICE_ID, value: temp, recordedAt }]
  });
  const headers = { 'Content-Type': 'application/json' };
  if (GATEWAY_KEY) headers['x-gateway-key'] = GATEWAY_KEY;

  const res = await fetch(`${BASE_URL}/api/tempmon/ingest`, { method: 'POST', headers, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) { console.log(`[${new Date().toLocaleTimeString()}] ${msg}`); }

const SCENARIOS = {
  // ── Scenario 1: normal startup ─────────────────────────────────────────────
  async 'warmup-to-active'() {
    log('▶ Scenario: warmup-to-active');
    log('  Sending 25°C (room temp) → expect state: cooling / off');
    await post(25); await sleep(1000);

    log('  Sending 50°C (warming up) → expect state: warming_up');
    await post(50); await sleep(1000);

    log('  Sending 70°C (above target 63°C) → expect state: active');
    await post(70); await sleep(1000);

    log('✅ warmup-to-active done. Check /tempmon/unit.html state pill.');
  },

  // ── Scenario 2: fault — stuck below target ──────────────────────────────────
  async 'fault'() {
    log('▶ Scenario: fault (back-dated readings to simulate 3 min stuck at 50°C)');
    log('  Sending 25°C (room temp, 10 min ago) → off baseline');
    await post(25, 10); await sleep(800);

    log('  Sending 50°C, 3 min ago → warming_up start (ts = 3 min ago)');
    await post(50, 3); await sleep(800);

    log('  Sending 50°C, now → still in warming_up zone after 3 min → FAULT');
    await post(50, 0); await sleep(800);

    log('✅ fault scenario done. Check unit — state should be fault, push should fire.');
  },

  // ── Scenario 3: active → cooling → off ─────────────────────────────────────
  async 'off'() {
    log('▶ Scenario: active → cooling → off');
    log('  Sending 70°C → active');
    await post(70); await sleep(1000);

    log('  Sending 28°C → cooling (back-dated 3 min) → then now → confirmed off');
    await post(28, 3); await sleep(800);
    await post(28, 0); await sleep(800);

    log('✅ off scenario done. State should be off after 2+ min at ≤35°C.');
  }
};

async function main() {
  const scenario = process.argv[2] || 'all';

  if (scenario === 'all') {
    for (const [name, fn] of Object.entries(SCENARIOS)) {
      await fn();
      log('--- pause 2s ---');
      await sleep(2000);
    }
  } else if (SCENARIOS[scenario]) {
    await SCENARIOS[scenario]();
  } else {
    console.error(`Unknown scenario: ${scenario}`);
    console.error('Valid: ' + Object.keys(SCENARIOS).join(', ') + ', all');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('✗', err.message);
  process.exit(1);
});
