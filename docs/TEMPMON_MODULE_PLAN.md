# Equipment Temperature Monitoring Module — Implementation Plan

**Module key:** `tempmon`  
**Data-module attribute:** `data-module="tempmon"`  
**API prefix:** `/api/tempmon/`  
**Frontend dir:** `/tempmon/`  
**Planned nav label:** `🌡️ Temp Monitor`  
**Permission key:** `tempmon`

---

## 1. Purpose & ISO 22000 Alignment

ISO 22000 Clause 8.5.4 (Control of monitoring and measuring) and Codex HACCP Principle 4 require that Critical Control Points (CCPs) be monitored continuously with defined critical limits, corrective actions, and verifiable records.

Temperature-controlled equipment (freezers, chillers, warmers) are CCPs in a central kitchen. This module replaces manual spot-check log books with real-time IoT telemetry, auto-alerts, and a full audit trail — satisfying:

| ISO 22000 Reference | Requirement | How This Module Covers It |
|---|---|---|
| 8.5.2 — Hazard analysis | Identify biological hazards from temperature abuse | Equipment type + critical limit config per device |
| 8.5.4 — CCPs | Monitor CCPs at defined frequency | Continuous readings from IoT gateway (configurable poll interval) |
| 8.5.4.3 — Critical limits | Set upper/lower limits | Per-device `criticalMin` / `criticalMax` fields |
| 8.5.4.4 — Corrective actions | Record CA when limit is breached | `TempMonAlert` → linked `TempMonCorrectiveAction` |
| 8.7 — Control of nonconformities | Document and close out deviations | Alert lifecycle: `open → acknowledged → resolved` |
| 8.9.4 — Calibration records | Thermometer calibration tracking | `TempMonDevice` has `lastCalibratedAt`, `calibrationDue` fields |
| 9.1.1 — Monitoring & measurement | Evidence of monitoring | Queryable reading history + exportable PDF reports |

---

## 2. Terminology

| Term | Definition |
|---|---|
| **Device** | An IoT-enabled thermometer/probe physically attached to a unit |
| **Unit** | A piece of equipment (freezer, chiller, warmer compartment) |
| **Gateway** | The IoT gateway that collects readings and POSTs them to the ingest API |
| **Reading** | A single temperature data point: value + timestamp + device ID |
| **Alert** | An auto-created record when a reading violates a critical limit |
| **Corrective Action (CA)** | A documented human response to close out an alert |
| **Sample Run** | A seed operation that back-fills synthetic readings for demo/testing |

---

## 3. Data Models

### 3.1 `TempMonUnit` — the physical equipment
```js
{
  name:           String,   required  // "Blast Freezer 1"
  type:           String,   enum: ['freezer','chiller','warmer','ambient']
  location:       String,             // "Prep Kitchen — Cold Room A"
  criticalMin:    Number,   required  // °C lower limit  e.g. -25
  criticalMax:    Number,   required  // °C upper limit  e.g. -15
  warningBuffer:  Number,   default:2 // degrees before critical → warning zone
  targetTemp:     Number,             // ideal operating temp (for display)
  active:         Boolean,  default:true
  notes:          String
  alertThresholdMinutes: Number, default:0
  // 0 = fire push notification immediately on first critical reading.
  // >0 = the unit must remain at critical temperature for this many consecutive
  //      minutes before the push notification is sent. This prevents false
  //      positives caused by brief door openings during normal kitchen operation
  //      (e.g. chefs loading warmers or blast chillers).
  //      Recommended: 20–30 min for kitchen equipment.
  // timestamps: true
}
```

### 3.2 `TempMonDevice` — the IoT thermometer/probe
```js
{
  unit:           ObjectId → TempMonUnit, required
  deviceId:       String,   required, unique   // hardware MAC / device token
  label:          String,             // "Probe A — Top shelf"
  firmware:       String
  batteryPct:     Number              // last reported battery level
  lastSeenAt:     Date                // updated on every ingest
  lastCalibratedAt: Date
  calibrationDue:   Date              // auto-warn when approaching
  calibrationIntervalDays: Number, default: 180
  active:         Boolean, default: true
  // timestamps: true
}
```

### 3.3 `TempMonReading` — one temperature data point
```js
{
  device:     ObjectId → TempMonDevice, required
  unit:       ObjectId → TempMonUnit,   required  // denormalised for fast queries
  value:      Number,   required   // °C
  recordedAt: Date,     required   // gateway timestamp (not server receipt time)
  receivedAt: Date,     default: Date.now  // server receipt time
  gatewayId:  String               // which gateway forwarded this
  flagged:    Boolean, default: false  // true if outside criticalMin/criticalMax
  // no timestamps:true — receivedAt serves that purpose; keep collection lean
}
```
> **Index**: compound `{ unit: 1, recordedAt: -1 }` and `{ device: 1, recordedAt: -1 }`.  
> **TTL index**: Optionally expire readings older than 2 years (`expireAfterSeconds: 63072000`) to keep the collection bounded in production.

### 3.4 `TempMonAlert` — auto-created when critical limits are breached
```js
{
  unit:        ObjectId → TempMonUnit,    required
  device:      ObjectId → TempMonDevice,  required
  reading:     ObjectId → TempMonReading, required  // the triggering reading
  type:        String, enum: ['critical_high','critical_low','warning_high','warning_low','device_offline']
  value:       Number    // temperature at time of alert
  status:      String, enum: ['open','acknowledged','resolved'], default: 'open'
  acknowledgedBy: String
  acknowledgedAt: Date
  resolvedBy:  String
  resolvedAt:  Date
  correctiveAction: ObjectId → TempMonCorrectiveAction
  notificationSent: Boolean, default: false
  pushSentAt:       Date, default: null
  // null = push has not yet been sent (waiting for threshold duration)
  // timestamps: true
}
```

### 3.5 `TempMonCorrectiveAction` — HACCP corrective action record
```js
{
  alert:          ObjectId → TempMonAlert, required
  unit:           ObjectId → TempMonUnit,  required
  actionTaken:    String, required    // free text description
  takenBy:        String, required
  takenAt:        Date,   default: Date.now
  rootCause:      String
  preventiveMeasure: String
  productDisposalRequired: Boolean, default: false
  productDisposalDetails:  String
  verifiedBy:     String
  verifiedAt:     Date
  outcome:        String, enum: ['product_safe','product_discarded','equipment_repaired','other']
  // timestamps: true
}
```

### 3.6 `TempMonCalibration` — calibration event log
```js
{
  device:          ObjectId → TempMonDevice, required
  calibratedBy:    String, required
  calibratedAt:    Date,   required
  referenceTemp:   Number  // °C of reference standard
  readingBefore:   Number  // device reading before calibration
  readingAfter:    Number  // device reading after calibration
  offsetApplied:   Number  // correction offset recorded
  certificate:     String  // Cloudinary URL of calibration cert
  nextDueDate:     Date
  notes:           String
  // timestamps: true
}
```

---

## 4. API Endpoints

All routes under `/api/tempmon/` and protected by `requireAuth`.  
The ingest endpoint (`POST /api/tempmon/ingest`) additionally accepts a **gateway API key** (via `X-Gateway-Key` header) rather than a user JWT — this allows the IoT gateway to push data without a user session.

### Units
| Method | Path | Description |
|---|---|---|
| `GET`    | `/units`          | List all active units with latest reading |
| `POST`   | `/units`          | Create unit |
| `GET`    | `/units/:id`      | Unit detail + device list + last 24 h readings |
| `PUT`    | `/units/:id`      | Update unit settings / limits |
| `DELETE` | `/units/:id`      | Soft-delete (sets `active: false`) |

### Devices
| Method | Path | Description |
|---|---|---|
| `GET`    | `/devices`        | List all devices |
| `POST`   | `/devices`        | Register device |
| `PUT`    | `/devices/:id`    | Update device metadata |
| `DELETE` | `/devices/:id`    | Decommission device |

### Readings & Ingest
| Method | Path | Description |
|---|---|---|
| `POST`   | `/ingest`             | **IoT gateway endpoint** — batch or single reading(s). Auth via gateway key. Triggers alert logic. |
| `GET`    | `/readings/:unitId`   | Paginated readings for a unit. Query params: `from`, `to`, `limit` |
| `GET`    | `/readings/:unitId/export` | CSV export of readings for date range |
| `POST`   | `/sample-data`        | **Dev/demo only** — seed synthetic readings for all units (or specific unit). Requires `admin` perm. |

### Alerts
| Method | Path | Description |
|---|---|---|
| `GET`    | `/alerts`             | List alerts. Query: `status`, `unitId`, `from`, `to` |
| `GET`    | `/alerts/:id`         | Alert detail with CA if present |
| `PUT`    | `/alerts/:id/acknowledge` | Mark as acknowledged |
| `PUT`    | `/alerts/:id/resolve` | Mark as resolved |

### Corrective Actions
| Method | Path | Description |
|---|---|---|
| `POST`   | `/corrective-actions`     | Create CA linked to an alert |
| `GET`    | `/corrective-actions/:id` | Get CA detail |
| `PUT`    | `/corrective-actions/:id` | Update CA (e.g. add verification) |

### Calibration
| Method | Path | Description |
|---|---|---|
| `GET`    | `/calibrations`              | List all calibration events + devices due for calibration |
| `POST`   | `/calibrations`              | Log a calibration event (Cloudinary upload for cert) |
| `GET`    | `/calibrations/due`          | Devices with calibration due within 30 days |

### Dashboard / Reports
| Method | Path | Description |
|---|---|---|
| `GET`    | `/dashboard`              | Summary stats: units in range, alerts open, devices offline |
| `GET`    | `/reports/daily`          | Daily min/max/avg per unit for a date range |
| `GET`    | `/reports/compliance`     | % compliance (readings in range) per unit per period |

---

## 5. IoT Gateway Integration

### Ingest Payload Format
The gateway POSTs JSON to `POST /api/tempmon/ingest`:

```json
{
  "gatewayId": "GW-001",
  "readings": [
    {
      "deviceId": "TH-A1B2C3",
      "value": -18.4,
      "recordedAt": "2026-03-07T10:15:00.000Z",
      "batteryPct": 82
    },
    {
      "deviceId": "TH-D4E5F6",
      "value": 3.1,
      "recordedAt": "2026-03-07T10:15:00.000Z",
      "batteryPct": 91
    }
  ]
}
```

### Authentication
- A static key stored in `GATEWAY_API_KEY` env var.
- Ingest route middleware checks `req.headers['x-gateway-key'] === process.env.GATEWAY_API_KEY`.
- If auth fails → `401`. This keeps gateway auth completely separate from user JWTs.

### Alert Trigger Logic (server-side, in the ingest handler)
```
For each reading received:
  1. Look up device → unit (with criticalMin/Max, warningBuffer, alertThresholdMinutes)
  2. Save TempMonReading document
  3. Update device.lastSeenAt and device.batteryPct
  4. Evaluate alert type:
       if value < criticalMin         → type = 'critical_low'
       if value > criticalMax         → type = 'critical_high'
       if value < criticalMin + buffer→ type = 'warning_low'
       if value > criticalMax - buffer→ type = 'warning_high'
  5. If alert type determined:
       a. Check for existing OPEN alert of same type for same unit (avoid duplicates)
       b. If none exists:
            - Create TempMonAlert with pushSentAt = null (pending)
            - If alertThresholdMinutes == 0: send push immediately, set pushSentAt = now
            - If alertThresholdMinutes > 0: do NOT send push yet — wait for threshold
       c. If alert already exists and pushSentAt is null:
            - Calculate alert age = now – alert.createdAt
            - If age ≥ alertThresholdMinutes × 60s: send push, set pushSentAt = now
  6. If value now IN range and there is an open warning/critical alert:
       - Auto-resolve the alert (status = 'resolved', resolvedAt = now)
         with a system note "Temperature returned to normal range automatically"
       - NO push notification was ever sent if temp recovered before threshold —
         this eliminates false positives from brief door openings.
```

### Timed Threshold Design Rationale
> During normal kitchen operation, a blast chiller door may be opened for 5–10 minutes
> while chefs load product. This causes a transient temperature rise that resolves
> itself once the door is closed. With `alertThresholdMinutes = 25`, no push notification
> fires unless the temperature remains critical for 25 consecutive minutes, which
> indicates a genuine equipment fault or a prolonged food safety risk.
>
> The alert record is **still created** immediately (for audit purposes) — only the
> push notification delivery is deferred. If the temperature recovers before the
> threshold is met, the alert is auto-resolved and the push is never sent.

A background cron (`setInterval`, every 60 seconds) checks all open alerts with
`pushSentAt: null` and fires the deferred push notification once the threshold age is met.

### Offline / Device-Offline Detection
A cron job (scheduled via `setInterval` at server start, every 5 minutes) checks:
- Any device where `lastSeenAt < now - device.expectedInterval * 1.5`
- Creates a `device_offline` alert if not already open
- Closes offline alert once device resumes sending

---

## 6. Push Notification Alerts

Reuse existing `services/notification-service.js` and `PushSubscription` model.

### Notification Triggers
| Event | Message |
|---|---|
| `critical_high` | `🔴 [Unit Name]: CRITICAL HIGH — {value}°C (max {criticalMax}°C)` |
| `critical_low`  | `🔴 [Unit Name]: CRITICAL LOW — {value}°C (min {criticalMin}°C)` |
| `warning_high`  | `🟡 [Unit Name]: Warning — temperature rising {value}°C` |
| `warning_low`   | `🟡 [Unit Name]: Warning — temperature dropping {value}°C` |
| `device_offline`| `⚫ [Device Label] on [Unit Name] has stopped reporting` |
| `calibration_due` | `🔧 [Device Label] calibration due in 7 days` |

Notifications go to all users with `tempmon` permission (same pattern as pest/maintenance alerts).

### Timed Threshold — No False Positives
Each unit has an `alertThresholdMinutes` setting (default `0` = immediate).

| Setting | Behaviour |
|---|---|
| `0` | Push fires on the first critical reading (legacy / lab use) |
| `20` | Push fires only after 20 consecutive minutes at critical temp |
| `30` | Recommended for blast chillers and warmers in active kitchen service |

The alert record is created immediately regardless of threshold (for audit trail). If the temperature recovers before the threshold, the alert auto-resolves with no push sent.

---

## 7. Sample Data Generator (`POST /api/tempmon/sample-data`)

Admin-only endpoint that back-fills realistic synthetic readings so the UI is functional before physical devices arrive.

### Behaviour
- Accepts optional `{ unitId, hours, intervalMinutes }` in body.
- Defaults: last 72h of readings, one reading every 5 minutes per device.
- Generates normally distributed values centred on `unit.targetTemp` with configurable variance.
- Randomly injects 2–4 excursion events (brief out-of-range spikes) to test alert rendering.
- Idempotent: deletes existing sample readings for the target unit/period before inserting, so it can be re-run safely.
- Tags sample readings with a `isSample: Boolean` field on `TempMonReading` so they can be filtered out of compliance reports once real data arrives.

### Purge Endpoint
`DELETE /api/tempmon/sample-data/:unitId` — removes all `isSample: true` readings for a unit.

### Auto-Device Creation
If a unit has no registered device, the sample data generator automatically creates a
`SAMPLE_<unitId>` placeholder device so testing can begin immediately without manual device setup.
The same auto-creation applies to the live simulation engine.

---

## 7b. Live Simulation Engine

A server-side tick engine for testing in production-like conditions before physical IoT
devices arrive on-site.

### Endpoints (admin only)
| Method | Path | Description |
|---|---|---|
| `GET`  | `/sim/status`  | Returns `{ active, intervalMinutes, excursionUnitId, excursionActive }` |
| `POST` | `/sim/start`   | Start sim. Body: `{ intervalMinutes: 2, excursionUnitId }` |
| `POST` | `/sim/stop`    | Stop sim |

### Behaviour
- Each tick injects one realistic reading per active unit using box-muller normal distribution.
- Readings tagged `isSample: true` — excluded from compliance reports.
- **Excursion mode**: set `excursionUnitId` to force one unit into critical temperature range, allowing push notification threshold testing without waiting for a real fault.
- First tick fires immediately on start (no delay before first reading).
- Sim state persists in `global._tempmonSimConfig` per server process.
- Sim status is visible in the Setup → Sample Data tab.

---

## 8. Frontend Pages

### 8.1 `/tempmon/index.html` — Live Dashboard
- Grid of **unit cards** — one per unit, auto-refreshing every 30 s.
- Each card shows:
  - Unit name + type icon (🧊 freezer / ❄️ chiller / 🔥 warmer)
  - Current temperature (large, colour-coded: green/yellow/red)
  - Min / Max in last 24 h
  - Battery level of device(s)
  - Last reading timestamp ("2 min ago")
  - Alert badge if any open alerts
- Summary bar at top: total units, units in range (green), out of range (red), offline devices.
- Clicking a card navigates to the unit detail page.

### 8.2 `/tempmon/unit.html` — Unit Detail & Chart
- Temperature line chart (last 24 h by default, date range picker for historical).
- Horizontal reference lines for `criticalMin`, `criticalMax`, `warningBuffer` zones.
- Table of raw readings below chart (paginated).
- Open alerts panel — with Acknowledge / Resolve buttons.
- Device info panel (battery, last calibration, calibration due date).
- CSV export button for the selected date range.

### 8.3 `/tempmon/alerts.html` — Alert Management
- Filterable table: All / Open / Acknowledged / Resolved; by unit; by date range.
- Inline acknowledge button.
- "Log Corrective Action" button → opens a modal form (action taken, root cause, outcome).
- HACCP-compliant — each alert row links to its CA record when one exists.
- Print/PDF button for exporting alert + CA logs for audit.

### 8.4 `/tempmon/setup.html` — Units & Devices Configuration
- Two-tab layout: **Units** tab, **Devices** tab.
- Units tab: add/edit/deactivate units, set critical limits, warning buffer, target temp.
- Devices tab: register new device (paste `deviceId` from hardware), link to unit, set calibration interval.
- Sample Data section (admin only): "Generate Sample Data" and "Clear Sample Data" buttons per unit, with a status indicator.

### 8.5 `/tempmon/calibration.html` — Calibration Log
- "Devices Due" panel at top — flags any device with `calibrationDue < now + 30 days`.
- Log form: select device, enter reference temp, before/after readings, upload calibration cert (Cloudinary).
- History table per device.
- Print button for ISO 22000 calibration records.

### 8.6 `/tempmon/report.html` — Compliance Report
- Period selector (week / month / custom range).
- Per-unit compliance summary table: % readings in range, total excursions, MKTE (Mean Kinetic Temperature Equivalent — optional advanced metric).
- Alert + CA summary.
- Print/PDF with report header (matches existing print pattern).

---

## 9. Directory & File Structure

```
tempmon/
  index.html          ← Live dashboard
  unit.html           ← Unit detail + chart
  alerts.html         ← Alert management + CA logging
  setup.html          ← Units/devices configuration + sample data
  calibration.html    ← Calibration log
  report.html         ← Compliance report PDF

models/
  TempMonUnit.js
  TempMonDevice.js
  TempMonReading.js
  TempMonAlert.js
  TempMonCorrectiveAction.js
  TempMonCalibration.js

routes/
  tempmon.js          ← All tempmon routes (units, devices, ingest, alerts, CAs, calibration, reports, sample-data)
```

`routes/index.js` addition:
```js
router.use('/tempmon', require('./tempmon'));
```

`shell.js` additions:
- `MODULE_INFO` entry: `tempmon: { label: '🌡️ Temp Monitor' }`
- `NAV` entry (above the first divider before Admin):
```js
{
  icon: '🌡️', label: 'Temp Monitor', module: 'tempmon',
  href: '/tempmon/', perm: 'tempmon',
  children: [
    { href: '/tempmon/',              label: '📡 Live Dashboard'    },
    { href: '/tempmon/alerts.html',   label: '🔴 Alerts'            },
    { href: '/tempmon/report.html',   label: '📊 Compliance Report' },
    { href: '/tempmon/calibration.html', label: '🔧 Calibration'   },
    { href: '/tempmon/setup.html',    label: '⚙️ Setup'             },
  ],
},
```

`index.html` hub card:
```html
<a class="hub-card tempmon" data-perm="tempmon" href="/tempmon/">
  <span class="hub-icon">🌡️</span>
  <div class="hub-info">
    <h3>Temp Monitor</h3>
    <p>Real-time freezer, chiller &amp; warmer temperature monitoring</p>
    <span class="lock-note">tempmon access required</span>
  </div>
  <span class="go-btn">→</span>
</a>
```

---

## 10. Charting

Use **Chart.js** (CDN) — already used semantically in the `maintenance` module's `charts.js`. Include it only on pages that need it (`unit.html`, `report.html`) via:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
```
> This is the one new CDN dependency. Chart.js 4 is already referenced in the maintenance module so it aligns with existing usage.

---

## 11. Implementation Phases

### Phase 1 — Core Data Layer (backend)
1. Create 6 Mongoose models
2. Create `routes/tempmon.js` with units CRUD + device CRUD
3. Register in `routes/index.js`
4. Manual test via Postman / REST client

### Phase 2 — Ingest & Alerting
5. Implement `POST /ingest` with gateway key auth + alert trigger logic
6. Wire push notifications via existing `notification-service.js`
7. Implement device-offline cron check
8. Implement sample data generator + purge endpoints

### Phase 3 — Frontend: Dashboard + Unit Detail
9. Build `index.html` live dashboard with auto-refresh cards
10. Build `unit.html` with Chart.js temperature chart + readings table

### Phase 4 — Alerts & Corrective Actions
11. Build `alerts.html` with full alert lifecycle + CA modal
12. Wire CA submission to backend

### Phase 5 — Setup, Calibration & Reports
13. Build `setup.html` (units/devices config + sample data controls)
14. Build `calibration.html` with Cloudinary cert upload
15. Build `report.html` with PDF print

### Phase 6 — Integration & Nav
16. Add hub card to `index.html`
17. Add `MODULE_INFO` + `NAV` entry to `shell.js`
18. Admin: add `tempmon` to permission keys in user model / admin UI

---

## 12. Key Design Decisions

| Decision | Rationale |
|---|---|
| Denormalise `unit` on `TempMonReading` | Avoids multi-hop populate on every dashboard load; readings volume is high |
| Separate `recordedAt` vs `receivedAt` | Gateway timestamp is authoritative for HACCP records; server receipt time is for debugging lag |
| Auto-resolve alerts when temp returns to range | Reduces alert fatigue; manual CA still required for critical types |
| `isSample` flag on readings | Allows compliance reports to exclude synthetic data with a simple filter |
| Gateway key separate from JWT | Devices can never hold a rotating JWT; a static env-var key is simpler and appropriate for a trusted LAN gateway |
| No TTL index by default | Operator can opt in — HACCP records should be retained ≥ 3 years per most national food safety regulators |

---

*Generated: 2026-03-07 — ready for implementation approval.*
