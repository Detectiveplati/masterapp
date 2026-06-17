# MasterApp — Full System Reference & Rewrite Planning Document

> Generated for planning a full rewrite. This document is a complete inventory of the current
> system's architecture, data models, API surface, business logic, and frontend conventions.
> Use it as the source-of-truth spec when designing the new architecture in another AI tool.

---

## 0. High-Level Summary

**What it is:** A unified central-kitchen operations platform — one Node/Express server hosting
~12 modules (maintenance, procurement, food safety NCs + digital forms, pest control, ISO
records, equipment temperature monitoring (TempMon), legacy temp logging + LoRa sensor gateway,
order extraction/kitchen execution ("Order Manager"), label printing, push notifications, and
admin/user management). Frontend is vanilla HTML/CSS/JS (no framework, no bundler) served as
static files with a shared auth-guard script and a PWA shell (service worker).

**Stack:**
- Node.js (>=18), Express 5
- MongoDB — **three separate databases** (Mongoose for core, native driver for templog & order
  manager)
- JWT auth via httpOnly cookie (`ck_auth`), 400-day expiry
- bcryptjs for password hashing
- Cloudinary for photo uploads (local-disk fallback)
- web-push (VAPID) for push notifications
- Puppeteer (optional) for server-rendered PDF reports
- QRCode generation, multer/multer-storage-cloudinary, xlsx export
- node-cron for scheduled jobs (Order Manager extraction, TempMon background checks)
- Deployed on Railway; `trust proxy` enabled

**Core architectural rule (from AGENTS.md):** All DB names/collections come from
`config/databaseLayout.js` — there are exactly 3 databases, each with a strict naming
convention (`core_*`, `templog_*`, `order_manager_*`). Any rewrite should preserve this
separation (or deliberately consolidate it — that's a design decision for the new system,
but the boundaries below show what currently depends on what).

---

## 1. Database Layout

### 1.1 Databases

| DB | Default name | Primary env vars | Used by |
|---|---|---|---|
| Core | `masterapp_core` | `MASTERAPP_CORE_MONGODB_URI`, `MASTERAPP_CORE_DB_NAME` | Auth, admin, maintenance, procurement, food safety (NC + forms), pest, ISO, TempMon, push subscriptions, label printing |
| TempLog | `masterapp_templog` | `MASTERAPP_TEMPLOG_MONGODB_URI`, `MASTERAPP_TEMPLOG_DB_NAME` | LoRa gateway data, legacy equipment temp readings, combi-oven cook logs |
| Order Manager | `masterapp_order_manager` | `MASTERAPP_ORDER_MANAGER_MONGODB_URI`, `MASTERAPP_ORDER_MANAGER_DB_NAME` | Extraction runs, job runs, cook sessions, departments, dish catalog |

Legacy fallback env vars and DB names exist for migration purposes
(`MAINTENANCE_MONGODB_URI` → `central_kitchen_maintenance`, `TEMPLOG_MONGODB_URI`/`TEMPLOG_DB_NAME`
→ `kitchenlog`, `ORDER_MANAGER_DB_NAME` → `kitchenlog`, generic `MONGODB_URI`/`MONGODB_DB_NAME`).
A rewrite does **not** need to replicate these fallbacks unless data migration from the legacy
DBs is in scope.

### 1.2 Core DB Collections (`core_*`) — 31 collections

| Constant | Physical name | Purpose |
|---|---|---|
| AREAS | core_areas | Kitchen/facility areas |
| AREA_ISSUES | core_area_issues | Area maintenance issues |
| EQUIPMENT | core_equipment | Equipment catalog & status |
| EQUIPMENT_ISSUES | core_equipment_issues | Equipment-specific issue reports |
| MAINTENANCE_RECORDS | core_maintenance_records | Equipment maintenance history |
| NOTIFICATIONS | core_notifications | In-app notification log |
| PUSH_SUBSCRIPTIONS | core_push_subscriptions | Web push subscriptions |
| USERS | core_users | User accounts |
| PROCUREMENT_REQUESTS | core_procurement_requests | Purchase requests |
| FOOD_SAFETY_NCS | core_food_safety_ncs | Food safety non-conformances |
| FOOD_HANDLER_CERTS | core_food_handler_certs | Food handler cert/licence tracker |
| FOOD_SAFETY_FORM_ASSIGNMENTS | core_food_safety_form_assignments | User→template+unit assignments |
| FOOD_SAFETY_CHECKLIST_MONTHS | core_food_safety_checklist_months | Monthly digital checklist data + signatures + PDF archive |
| ISO_EMPLOYEES | core_iso_employees | ISO employee registry |
| ISO_RECORDS | core_iso_records | ISO record filing tracker |
| PEST_STATIONS | core_pest_stations | Rat trap station master data |
| PEST_SESSIONS | core_pest_sessions | Weekly pest inspection rounds |
| PEST_FINDINGS | core_pest_findings | Per-station findings per session |
| TEMP_MON_UNITS | core_tempmon_units | Monitored equipment (freezer/chiller/warmer/ambient) |
| TEMP_MON_DEVICES | core_tempmon_devices | IoT probes |
| TEMP_MON_READINGS | core_tempmon_readings | Temperature data points (high volume) |
| TEMP_MON_ALERTS | core_tempmon_alerts | Temp deviation / offline / warmer-fault alerts |
| TEMP_MON_CONFIGS | core_tempmon_configs | Global TempMon config (singleton, key='global') |
| TEMP_MON_CALIBRATIONS | core_tempmon_calibrations | Probe calibration log |
| TEMP_MON_CORRECTIVE_ACTIONS | core_tempmon_corrective_actions | HACCP corrective actions linked to alerts |
| LABEL_PRINT_TEMPLATES | core_label_print_templates | Label design templates |
| LABEL_PRINT_ITEMS | core_label_print_items | Printable item catalog |
| LABEL_PRINT_PRINTERS | core_label_print_printers | Registered printers |
| LABEL_PRINT_JOBS | core_label_print_jobs | Print job log |
| LABEL_PRINT_DIAGNOSTIC_LOGS | core_label_print_diagnostic_logs | Client/server diagnostic events |

### 1.3 TempLog DB Collections (`templog_*`) — 7 collections

| Constant | Physical name | Purpose |
|---|---|---|
| COOKS_COMBIOVEN | templog_cooks_combioven | Combi-oven cook session logs |
| EQUIPMENT_TEMP_READINGS | templog_equipment_temp_readings | Legacy generic equipment temp readings |
| EQUIPMENT_TEMP_CONFIGS | templog_equipment_temp_configs | Legacy min/max thresholds per equipment type |
| EQUIPMENT_TEMP_ALERTS | templog_equipment_temp_alerts | (disabled — legacy, unused) |
| EQUIPMENT_TEMP_STATES | templog_equipment_temp_states | Equipment temp state snapshots |
| LORA_DEVICES | templog_lora_devices | Registered LoRa TAG sensors + mapping to TempMon units/legacy equipment |
| LORA_GATEWAY_EVENTS | templog_lora_gateway_events | Raw gateway ingest event log (diagnostics) |

### 1.4 Order Manager DB Collections (`order_manager_*`) — 7 collections

| Constant | Physical name | Purpose |
|---|---|---|
| EXTRACTION_RUNS | order_manager_extraction_runs | Order extraction batch results |
| JOB_RUNS | order_manager_job_runs | Scheduled job execution log |
| COOK_SESSIONS | order_manager_cook_sessions | Cook session records |
| DEPARTMENTS | order_manager_departments | Kitchen departments ↔ POS order types |
| DISH_CATALOG | order_manager_dish_catalog | Dish/menu item catalog |
| RETENTION_SAMPLES | order_manager_retention_samples | Retention sample records |
| RETENTION_SAMPLE_CONFIGS | order_manager_retention_sample_configs | Retention sample config |

---

## 2. Authentication & Authorization

### 2.1 Login & Session

- **POST `/api/auth/login`** — body `{ username, password }`. Username matched
  case-insensitively/trimmed. Password compared via bcryptjs. On success, signs JWT and sets
  `ck_auth` httpOnly cookie (`sameSite: 'lax'`, `secure: true` in production), expiry **400
  days**.
- **POST `/api/auth/logout`** — clears `ck_auth`.
- **GET `/api/auth/me`** — requires auth; re-reads user from DB (fresh permissions) and returns
  user minus `passwordHash`.
- **GET/PATCH `/api/auth/notification-preferences`** — per-module notification toggles for
  modules: `maintenance`, `foodsafety`, `tempmon`, `procurement`, `pest`, `iso`. Top-level
  `pushEnabled` gates everything.
- **`BYPASS_AUTH=true`** env var disables auth entirely for local testing — injects a fake admin
  user. (Likely not needed in rewrite, but document the dev-mode convenience.)

### 2.2 User Model

Fields: `username` (unique, lowercase), `passwordHash` (bcrypt, pre-save hook auto-hashes
plaintext), `displayName`, `position`, `labelPrintDepartmentName`, `role` (`admin`|`user`),
`active` (soft-delete), `permissions` (object of booleans), `notificationPreferences`
(per-module object), timestamps.

**Permission keys (modules):**
`maintenance`, `foodsafety`, `foodsafetyforms`, `labelprint`, `templog`, `procurement`, `pest`,
`tempmon`, `iso`. Plus special pseudo-module `__admin__` for the admin panel.

### 2.3 Middleware (`services/auth-middleware.js`)

- `requireAuth` — JSON 401 if missing/invalid JWT; loads fresh user from DB.
- `requireAdmin` — 403 unless `role === 'admin'`.
- `requirePermission(module)` / `requireAnyPermission([modules])` — 403 unless user has that
  permission or is admin.
- `requirePageAccess(module)` / `requirePageAccessAny([modules])` — HTML-page variant; redirects
  to `/login?next=...` (unauth) or `/?access=denied` (wrong perms). `module === null` = any
  authenticated user; `module === '__admin__'` = admin only.
- `requireFoodSafetyFormsAssignedPageAccess(getTarget)` /
  `requireFoodSafetyFormsAssignedAccess(getTarget)` — validates that the user is assigned to the
  specific `templateCode` + `unitCode` (or has blanket `foodsafety` permission), else redirects
  to the user's own assignment or `/foodsafety-forms/forms`.
- Helper: `hasFoodSafetyFormsAccess`, `hasFoodSafetyAssignmentAccess`,
  `listFoodSafetyFormAssignments`, `canAccessAllFoodSafetyForms`,
  `getFoodSafetyFormsFallbackUrl`, `currentMonthKey()`.

### 2.4 Admin API (`/api/admin`, all `requireAuth`+`requireAdmin`)

- `GET/POST /users`, `PUT /users/:id`, `PUT /users/:id/password`, `PUT /permissions` (bulk).
- `GET /label-print-departments` — distinct department names from active label items.
- `GET /foodsafety-form-templates` — template metadata + unit options.
- `GET/POST/DELETE /foodsafety-form-assignments` — assign/unassign user↔template↔unit
  (denormalizes username/displayName/position onto the assignment for fast lookups).

---

## 3. Push Notifications

- **Library:** `web-push` (VAPID). Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`.
- **Model `PushSubscription`** (`core_push_subscriptions`): `endpoint` (unique), `keys.p256dh`,
  `keys.auth`, `userId` (nullable — pre-auth subs), `userAgent`, `createdAt`.
- **Routes (`/api/push`):**
  - `GET /vapid-public-key` (public)
  - `POST /subscribe`, `DELETE /unsubscribe`
  - `POST /test` (admin, broadcast to all)
  - `GET /subscriptions` (admin)
- **Core send functions:**
  - `sendPushToAll({title, message, url})` — all subs, TTL 259200s (3 days), auto-deletes
    404/410 (expired) subs.
  - `sendPushToPermission(permission, {title, message, url})` — only to users with that
    permission (or admin), plus legacy `userId: null` subs. Exported from `routes/index.js` and
    used across modules (e.g., TempMon alerts, area-issue reports).
- **Notification model** (`core_notifications`): `type` (overdue/upcoming/issue-reported/
  critical/resolved/assigned), `title`, `message`, `relatedEquipment`, `relatedIssue`, `read`,
  timestamps. Routes: list (unread-first, limit 50, populated refs), unread-count, mark-read,
  mark-all-read, delete.
- **Service (`services/notification-service.js`)**: `createNotification`,
  `createOverdueNotification`, `createUpcomingNotification`, `createIssueReportedNotification`.

---

## 4. Module: Maintenance Dashboard (`/maintenance/`, permission `maintenance`)

### 4.1 Models

**Equipment** (`core_equipment`): `equipmentId` (auto `EQ00001`...), `qrCode` (data URL), `name`,
`type`, `brand`, `modelNumber`, `serialNumber`, `location`, `status`
(`operational`|`needs_action`), `purchaseDate`, `warrantyExpiry`, `installationDate`,
`expectedLifespan`, `maintenanceFrequency` (days, default 90), `lastServiceDate`,
`nextServiceDate` (auto-calculated), `operatingInstructions`, `safetyNotes`, `photos[]`,
`purchaseCost`, `supplierContact`, `assignedTechnician`. Indexes: equipmentId, status,
nextServiceDate.

**Area** (`core_areas`): `areaId` (auto `AREA0001`...), `name` (unique), `qrCode`, `description`,
`assignedSupervisor`.

**AreaIssue** (`core_area_issues`): `issueId` (auto `ISS00001`...), `area`, `category`
(Plumbing/Electrical/HVAC/Structural/Cleaning/Safety Hazard/Pest Control/Other), `title`,
`description`, `priority` (Normal/Urgent), `status` (Open/In Progress/Resolved/Closed),
`photos[]`, `reportedBy`, `contactNumber`, `reportedDate`, `specificLocation`, `assignedTo`,
`resolutionNotes`, `resolvedDate`, `relatedMaintenanceRecords[]` (ref MaintenanceRecord).

**EquipmentIssue** (`core_equipment_issues`): `equipmentId`, `description`, `reportedBy`
(default 'Anonymous'), `status` (open/resolved), `reportedDate`, `resolvedDate`, `resolvedBy`,
`imagePath`.

**MaintenanceRecord** (`core_maintenance_records`): `equipmentId` (ref), `maintenanceType`
(Routine Check/Repair/Emergency/Preventive/Cleaning/Part Replacement/Calibration), `date`,
`activityDescription`, `issuesFound`, `actionsTaken`, `partsReplaced[]`, `partsCost`,
`laborHours`, `laborCost`, `totalCost` (auto = partsCost+laborCost), `performedBy`,
`beforePhotos[]`, `afterPhotos[]`, `notes`, `nextScheduledDate`, `equipmentStatusAfter`.

### 4.2 API

**Equipment** (`/api/equipment`):
- `GET /` (filters: type, status [`needs_action` alias matches needs_action/maintenance/
  broken/offline], location, search regex on name+equipmentId)
- `GET /stats` — total/operational/needs_action/overdue/due_this_week
- `GET /due-maintenance?days=30`, `GET /overdue`
- `GET /:equipmentId`
- `POST /` — creates + auto-generates QR code
- `POST /bulk-import` — CSV import, `?replace=true` option, returns {imported,updated,skipped,errors}
- `PUT /:equipmentId`
- `POST /:equipmentId/generate-qr`, `GET /:equipmentId/download-qr` (PNG)
- `DELETE /:equipmentId` — also deletes related records

**Equipment Issues** (`/api/equipment-issues`):
- `GET /equipment/:equipmentId`, `GET /counts` (open count map), `GET /all-open`
- `POST /` (multipart, optional `image`) — `{equipmentId, description, reportedBy?}`
- `PATCH /:id/resolve` — `{resolvedBy?}`
- `DELETE /:id`

**Maintenance Records** (`/api/maintenance`, alias `/api/records`):
- `GET /` (filters: equipmentId, maintenanceType, startDate, endDate, performedBy)
- `GET /:id`, `GET /equipment/:equipmentId`
- `POST /` (multipart, optional `image`) — also updates linked Equipment's
  `lastServiceDate`/`status`/`nextServiceDate`
- `PUT /:id`, `DELETE /:id`

**Area Issues** (`/api/issues`):
- `GET /` (filters: area, category, priority, status, search)
- `GET /open`, `GET /area/:area`, `GET /:id`
- `POST /` (multipart, optional `image`) — sends push to `maintenance` permission users
- `PUT /:id` — auto-sets `resolvedDate` when status→Resolved
- `DELETE /:id`

**Areas** (`/api/areas`):
- `GET /`, `GET /:id`
- `POST /` — auto-generates QR code
- `PUT /:id`
- `POST /:id/generate-qr`, `GET /:id/download-qr` (PNG)
- `DELETE /:id`

**Reports** (`/api/reports`):
- `GET /costs?startDate&endDate&equipmentId&groupBy=month|type|equipment` → totals + breakdowns
- `GET /downtime?startDate&endDate` → per-equipment downtime/incident/emergency counts
- `GET /compliance` → summary (onSchedule/due7/due30/overdue/complianceRate) + overdueList +
  dueList
- `GET /dashboard-stats` → equipment/maintenance/issues summary blocks

### 4.3 Business Logic

- **QR service** (`services/qr-service.js`): `getPublicBaseUrl(req)` resolves via ngrok tunnel →
  `QR_BASE_URL` env → request host. `generateEquipmentQRCode` → links to
  `/report-issue.html?id=...`. `generateAreaQRCode` → links to
  `/maintenance/area-maintenance.html?area=...`. `generateQRCodeBuffer` for PNG download
  (600px, margin 2).
- **Maintenance calculator** (`services/maintenance-calculator.js`): `calculateNextMaintenanceDate`,
  `isMaintenanceOverdue`, `getDaysUntilMaintenance`, `isMaintenanceDueWithin` — all date math
  normalized to midnight.

### 4.4 Pages

`maintenance.html` (dashboard + charts), `equipment-list.html`, `equipment-details.html`,
`add-equipment.html`, `all-issues.html` (tabbed equipment/area issues), `issue-details.html`,
`report-issue.html` (public QR-scan form, bilingual EN/中文, auto-detect language), `areas.html`
(QR codes + print-all), `area-maintenance.html`, `log-maintenance.html`, `api-test.html` (dev
tool).

---

## 5. Module: Procurement (`/procurement/`, permission `procurement`)

### 5.1 Model — ProcurementRequest (`core_procurement_requests`)

`itemNameEn` (required), `itemNameZh`, `category` (Equipment/Ingredient/Consumable/Cleaning/
Other), `quantity`, `unit`, `estimatedPrice`, `supplier`, `priority` (Low/High/Urgent),
`dateNeeded`, `requestorName` (required), `department`, `comments`, `imagePath`, `status`
(Pending/Approved/Ordered/Received/Done/Cancelled), `checklist` {quoteObtained,
managerApproved, orderPlaced, paymentProcessed, itemReceived, invoiceFiled}, `purchaserNotes`,
`createdAt`, `updatedAt` (auto-bumped), `completedAt` (set when status→Done).

### 5.2 API (`/api/requests`)

- `POST /` (multipart, optional `image`)
- `GET /` (filters: status, priority, category, search across itemNameEn/itemNameZh/
  requestorName/department)
- `GET /:id`
- `PATCH /:id` — updates status/checklist/purchaserNotes; sets/clears `completedAt`
- `DELETE /:id` — also deletes local image file if present

### 5.3 Pages

`requests.html` (admin dashboard, stats, checklist toggles), `request-form.html` (public
bilingual EN/中文 staff form), `request-detail.html` (full detail + photo modal + status
management).

---

## 6. Module: Food Safety NC (legacy) (`/foodsafety/`, permission `foodsafety`)

### 6.1 Model — FoodSafetyNC (`core_food_safety_ncs`)

`unit` (required), `specificLocation`, `description` (required), `priority` (Normal/Urgent),
`photo`, `reportedBy` (required), `status` (Open/Resolved), `resolution` {resolver, notes,
photo, resolvedAt}.

### 6.2 API (`/api/foodsafety`)

- `POST /report` (multipart, optional `photo`) — `{unit, specificLocation, description,
  priority?, reportedBy}`
- `GET /list?unit=&status=`
- `GET /:id`
- `POST /:id/resolve` (multipart, optional `resolutionPhoto`) — `{resolver, notes}` → status=Resolved
- `DELETE /:id`

Photo strategy: Cloudinary first, fallback to local disk `/foodsafety/uploads/` (random hex
filename) if Cloudinary not configured.

### 6.3 Pages

`index.html` (hub), `nc.html` (NC sub-hub), `nc-list.html`, `nc-detail.html`, `report-nc.html`
(bilingual).

---

## 7. Module: Food Safety Forms (`/foodsafety-forms/`, `/foodsafety/checklists*`, permission
`foodsafetyforms` or `foodsafety`)

A monthly digital checklist/log system covering 6 kitchen units, multi-language (EN/ZH/TA for
some templates), with finalize→verify workflow and PDF archiving.

### 7.1 Template Config (`config/foodSafetyChecklistTemplate.js`)

**6 units:** `#06-24`, `#06-15/16/17/27`, `#06-19`, `#06-08`, `#05-26`, `#05-27`.

**13 templates total:**

Matrix monthly (formType `matrix_monthly`, periodType `monthly`, tick-grid per day/week):
1. `CAC-PRP-07-F01-A` (Rev01) — Equipment Cleanliness & Maintenance, Unit #06-24 (sections:
   Seafood Room, Meat Room, Dry Store/Chiller/Freezer, Foot Bath, Sump Room, Changing Room,
   Toilet, Weekly Areas) — supports Tamil.
2. `CAC-PRP-07-F01-B` (Rev01) — same for Unit #06-15/16/17/27 (sections: Office/Changing/
   Chemical Store, Ingredient Prep, Hot Kitchen, Cold Kitchen, Cooling & Packing, Dishing &
   Packing, Holding & Collection, Corridor, Washing Area, Toilets, Weekly Areas) — **default
   template**.
3. `CAC-PRP-07-F01-C` (Rev01) — Unit #06-19 (Processing Area, Sandwich Room, Cake Room, Beverage
   Area, Walk-in Chiller/Freezer, Washing Area, Toilet, Weekly Areas).
4. `CAC-PRP-07-F01-D` (Rev01) — Unit #06-08 (Pre-Wash Zone, Clean Ware Holding, Sump Area,
   Toilet, Weekly Areas).
5. `CAC-PRP-07-F01-E` (Rev01) — Unit #05-26 (Hot Kitchen, Vegetable Processing, Packing Room, Dry
   Store/Chiller, Washing Area, Changing Room, Toilet, Weekly Areas).
6. `CAC-PRP-07-F01-F` (Rev00) — Unit #05-27 (Hot Kitchen, Ingredient Prep, Packing Room, Dry
   Store/Chiller, Washing Area, Changing Room, Toilet, Weekly Areas).
7. `CAC-PRP-08-F01` (Rev00) — Daily Personal Hygiene Checklist, applies to all 6 units. Items:
   Hands (gloves), Finger nails, Production attire, Health status. Tamil for #06-24.
8. `CAC-PRP-07-F02` (Rev00) — Daily Vehicle Cleanliness Checklist. Units = 21 vehicle plate
   numbers (GBA2807Y, GBD4397J, GBD9017Z, GBE1650S, GBE1676T, GBG9171U, GBG9234Y, GBH8368X,
   GBH8417M, GBJ4644P, GBJ4923J, GBK709H, GBM3470P, YP5038D, YP7957M, YR1175G, YR2874R, YR2985D,
   YR3792L, YR3849H, YR3893D). Items: Exterior/interior cleaned, Dashboard cleaned, Pest-free, No
   foul odour.

Log-entry templates (formType `log_entries` — repeatable row-based entry, plus footer):
9. `CAC-PRP-06-F01` (Rev00) — Reuse Metal Oil Tin Record, Unit #05-27, monthly. Fields: date,
   quantity, covered (Y/N), fragments (Y/N), cleanDry (Y/N), status (pass/fail), checkedBy.
   Footer: remarks, verifiedByText.
10. `CAC-SOP-03-F01` (Rev00) — Thawing Record, Unit #06-24. Fields: date, productName,
    cleanPackage (Y/N), runningWater (Y/N), thawStart (time), thawEnd (time), checkedBy. Footer:
    verifiedByText. Languages EN/ZH/TA.
11. `CAC-SOP-03-F03` (Rev05) — Blast Freezing Record, Unit #05-27. Fields: date, productName,
    trayCount, finishedCoreTemp, startCookingTime, endCookingTime, blastFreezingTemp,
    blastFreezingStartTime, blastFreezingEndTime, surfaceTempBefore, surfaceTempAfter,
    recordedBy (temperature fields have +/- stepper UI).
12. `CAC-SOP-03-F05` (Rev01) — Fruits & Vegetables Washing & Sanitizing Record, Unit
    #06-15/16/17/27. Fields: date, time, pumpReady (Y/N), contactTime (select 4/5/6 min),
    foreignParticlesFree (Y/N), status (pass/fail), checkedBy. Footer: remarks, verifiedByText.
13. `CAC-SOP-03-F06` (Rev00) — Verification of F&V PPM Dispenser Pump Record, Unit
    #06-15/16/17/27. Fields: date, verificationTime, location, chlorineReading (50–100ppm),
    checkedBy, remarks. Footer: verifiedByText.

**Field types:** text (max 255), date (YYYY-MM-DD), time (HH:MM), number (min/max), yes_no
(Y/N), pass_fail (P/F), textarea (max 4000), select (with options).

**Frequency labels:** daily ("Daily"/"每日"), weekly ("Weekly"/"每周").

Plus a special external-report template:
`CAC-SOP-02-F01-TEMPMON` (`TEMPMON_FOODSAFETY_TEMPLATE_CODE`, `formType: external_report`,
title "Monthly Equipment Temperature Log", category "Temperature Monitoring") — bridges to
TempMon monthly unit reports.

### 7.2 Models

**FoodSafetyChecklistMonth** (`core_food_safety_checklist_months`): `templateCode`,
`templateVersion`, `formType`, `periodType`, `unitCode`, `unitLabel`, `monthKey` (YYYY-MM),
`year`, `month`, `daysInMonth`, `status` (draft/finalized/verified), `data` (mixed — matrix:
`{ sectionKey: { remarks, checks: { itemKey: [bool per day/week] }, lastEditedAt/By } }`; log:
`{ entries: [...], footer: {remarks, verifiedByText}, lastEditedAt/By }`), `progress`
{completedCells, totalCells, completionRate}, `lastEditedBy` {userId,name,at}, `finalizedBy`,
`finalization` {userId, name, position, roleLabel="Filled By", typedSignature,
signatureDataUrl, confirmed, at}, `verification` {same shape, roleLabel="Verified By"},
`reportArchive` {fileName, contentType, size, generatedAt, data (Buffer/PDF)}. Unique index:
templateCode+unitCode+monthKey.

**FoodSafetyFormAssignment** (`core_food_safety_form_assignments`): `userId`, `username`,
`displayName`, `position`, `templateCode`, `unitCode`, `active`. Unique index:
userId+templateCode+unitCode.

### 7.3 API (`/api/foodsafety-checklists`)

- `GET /meta` — `{template, templates[], allUnitOptions[], defaults}`
- `GET /forms-summary?month=YYYY-MM` — `{monthKey, assignments[]}` — library mode if user has
  `foodsafety`, else only their own assignments
- `GET /reports-summary?month=YYYY-MM&status=draft|finalized|verified|due|not_due` — merges DB
  records with library templates including missing forms (requires `foodsafety` permission)
- `GET /month?template=&month=&unit=` — fetch (auto-creates record if missing)
- `PUT /month` — save draft `{templateCode, unitCode, monthKey, data, keepStatus?}`, recomputes
  progress, resets to draft unless keepStatus
- `POST /month/finalize` — `{..., signerName, typedSignature, signatureDataUrl, confirmed,
  signerPosition?}` → status=finalized
- `POST /month/reopen` — clears signatures, status=draft
- `POST /month/verify` — `{..., verifierName, typedSignature, signatureDataUrl, confirmed,
  verifierPosition?}` → status=verified (requires already finalized)
- `GET /month/report-tempmon?month=&unit=` — TempMon bridge report (requires `foodsafety`)
- `GET /month/report?template=&month=&unit=` — full report data
- `GET /debug/logs?limit=200` — debug log viewer (requires `foodsafety`)

### 7.4 PDF Generation (in `server.js`, via Puppeteer)

- `GET /api/foodsafety-checklists/month/report.pdf?template=&month=&unit=&lang=&refresh=` —
  renders `/foodsafety-forms/checklists-report.html?...&print=1`, waits for
  `window.__reportReady === true`, generates PDF (paper size/orientation from template config,
  margins 8mm, scale 0.9), caches into `reportArchive`.
- `GET /api/foodsafety-checklists/month/report-tempmon.pdf?month=&unit=` — renders
  `/foodsafety-forms/tempmon-report.html?...&print=1`, same caching pattern, requires existing
  record.

### 7.5 Related: Food Handler Certs (`/api/fhc`)

**Model FoodHandlerCert** (`core_food_handler_certs`): `businessEntity`, `employeeName`,
`previousCertDate`, `startDate`, `expiryDate`, `isRefresher`, `isCancelled`,
`cancellationReason`, `remarks`. Virtual `validityStatus` (invalid/expiring/valid, computed from
expiry+cancellation).

Routes: `GET /?entity=&validity=valid|expiring|invalid&search=`, `GET /entities` (distinct list),
`GET/POST/PUT/DELETE /:id`.

### 7.6 Pages

- `/foodsafety-forms/index.html` — landing (Forms Workspace / Reports Dashboard)
- `/foodsafety-forms/forms` → `foodsafety/forms.html` — assigned forms list, month/unit/template
  selector
- `/foodsafety-forms/checklists` → `foodsafety/checklists.html` — matrix grid entry, sections ×
  days/weeks, remarks, status pill, save/finalize, signature modal
- `/foodsafety-forms/log` → `foodsafety/log-form.html` — log-entry forms (add row, temp
  steppers, time pickers w/ "Now", footer fields, signature modal)
- `/foodsafety-forms/checklists-report.html` — print-optimized PDF source (A4, page breaks)
- `/foodsafety-forms/tempmon-report.html` — TempMon monthly print-optimized report
- `/foodsafety-forms/reports` → `foodsafety/reports.html` — month selector, status filters,
  summary cards, table with PDF links
- `/foodsafety/fhc.html`, `/foodsafety/fhc-form.html` — cert tracker + edit form

### 7.7 Debug logging

`services/foodsafety-debug-log.js` — rotating log file `logs/foodsafety-forms-debug.log` (2MB
cap), events: forms-summary, forms-summary-error, month-load-error, reports-summary,
reports-summary-error, forms-page-open, etc. `services/foodsafety-tempmon-report.js` exposes
`isTempMonFoodSafetyTemplate`, `getTempMonFoodSafetyEntryUrl`, `getTempMonFoodSafetyPdfUrl`,
plus the `TEMPMON_FOODSAFETY_*` constants.

---

## 8. Module: ISO Records Keeper (`/iso/`, permission `iso`)

### 8.1 Models

**IsoRecord** (`core_iso_records`): `recordName`, `department` (default "General"), `category`
(default "Others"; values include "Cooking Temperature Logs", "Units (Multiple Locations)",
"Fruits & Vegetables", "Others"), `personInCharge`, `frequency` (Daily/Monthly),
`latestDateFiled`, `comment`, `commentResolved`.

Computed status (not stored): `Not Filed` (no date) / `Up to Date` (monthsDiff <= 0) / `N Month(s)
Late` (monthsDiff >= 1), based on months between now and `latestDateFiled`.

**IsoEmployee** (`core_iso_employees`): `name`.

### 8.2 API

`/api/iso-records`: `GET /` (sorted createdAt asc, includes computed `status`), `GET /export`
(.xlsx download with all fields + status), `POST /`, `PUT /:id`, `DELETE /:id`.

`/api/iso-employees`: `GET /` (sorted by name), `POST /`, `DELETE /:id`.

### 8.3 Seed Data (34 default records, auto-loaded if collection empty)

- **Cooking Temp Logs (12, daily):** Pan Fry, Soup & Salad, Night Shift, Dim Sum, Braising, Deep
  Fry, Combi Oven, Cakes & Kueh, Fried Rice, Stir Fry, Paste, Sauce
- **Units — Multiple Locations (15):** for each of 5 units (#06-15/16/17/27, #06-19, #06-08,
  #05-26, #05-27): Daily Personal Hygiene, Kitchen Equipment Temp Log, Warmer Temp Record
- **Fruits & Vegetables (2):** Cleaning & Sanitizing (daily), PPM Dispenser Pump Verification
  (monthly) — for #06-15/16/17/27
- **Others (5):** Retention Sample Disposal (monthly), Reuse Metal Tin (monthly), Vehicle
  Cleanliness Log (daily) + 2 more

### 8.4 Page

`/iso/index.html` — summary cards (Up to Date / Late / Not Filed, clickable filters), category
tabs, editable table, "Filed" button (sets latestDateFiled=today), XLSX export, inline
comment/commentResolved.

---

## 9. Module: Pest Control (`/pest/`, permission `pest`)

### 9.1 Models

**PestStation** (`core_pest_stations`): `rtsNo` (unique Number), `locationDescription`, `unit`,
`isActive`. **23 pre-seeded stations** spanning units 05-26, 05-27, 06-08, 06-15, 06-16, 06-17,
06-19, 06-24, 06-27 (full list with descriptions — see source for exact text, e.g. "Outside
Packaging Room (05-27)", "Bakery dual chiller/freezer (06-19)", etc.).

**PestSession** (`core_pest_sessions`): `date`, `conductedBy`, `notes`, `status`
(draft/submitted), `periodLabel` (blank=current, set=archived).

**PestFinding** (`core_pest_findings`): `sessionId` (ref), `stationId` (ref), `cockroach`
(Number≥0), `others` (Number≥0), `newCockroaches` (Number≥0), `trapStatus`
(normal/new-trap/gone), `remarks`, `photos[]` {url, publicId, uploadedAt}. Unique index:
sessionId+stationId.

### 9.2 API (`/api/pest`)

- Stations: `GET /stations`, `POST /stations` (409 if rtsNo exists), `PUT /stations/:id`
- Sessions: `GET /sessions`, `POST /sessions` (auto-creates blank findings for all active
  stations), `GET /sessions/:id` (populated), `PUT /sessions/:id/submit`, `DELETE /sessions/:id`
  (cascades findings)
- Findings: `PUT /findings/:id`, `POST /findings/:id/photos` (multipart `photo`, Cloudinary or
  base64 fallback), `DELETE /findings/:id/photos/:photoIdx`
- Report: `GET /report?limit=10` — grid of submitted sessions × stations (max 52)
- `POST /seed-stations` — re-import the 23 standard stations (skip existing)

### 9.3 Pages

`index.html` (dashboard + stats + new-session modal), `report.html` (grid view, color-coded:
red=findings>0, orange=new-trap, grey=gone), `stations.html` (CRUD + seed button),
`record.html` (per-session findings entry + photo gallery + submit).

---

## 10. Module: TempMon — Equipment Temperature Monitoring (`/tempmon/`, permission `tempmon`)

### 10.1 Models

**TempMonUnit** (`core_tempmon_units`): `name`, `type` (freezer/chiller/warmer/ambient),
`location`, `area`, `criticalMin`, `criticalMax`, `warningBuffer` (legacy, default 2),
`targetTemp`, `active`, `inUse` (false = alerts suppressed but readings still stored),
`inUseComment`, `notes`, `alertThresholdMinutes` (0=immediate), `warmerStateConfig`
{roomTempCeiling=35, warmupStartTemp=40, offConfirmMinutes=20, faultMinutes=30,
slopeWindowReadings, riseMinPerMin=0.10, fallMinPerMin=0.08}, `warmerState` {state
(off/warming_up/active/cooling/fault/unknown), since}.

**Default type ranges:** chiller {0,6,target 3}, freezer {-25,-14,target -18}, warmer
{70,90,target 75}.

**TempMonDevice** (`core_tempmon_devices`): `unit` (ref, indexed), `deviceId` (unique,
indexed), `label`, `firmware`, `batteryPct`, `expectedIntervalMinutes` (default 5),
`lastSeenAt`, `lastCalibratedAt`, `calibrationDue`, `calibrationIntervalDays` (default 180),
`active`.

**TempMonReading** (`core_tempmon_readings`, high volume): `device` (ref), `unit` (ref,
denormalized), `value`, `humidity`, `rssi`, `battery`, `recordedAt` (sensor RTC — authoritative),
`receivedAt`, `gatewayId`, `flagged`. Indexes: {unit,recordedAt desc}, {device,recordedAt desc},
unique {device,recordedAt,value}.

**TempMonAlert** (`core_tempmon_alerts`): `unit` (ref, indexed), `device` (ref), `reading` (ref,
nullable), `type` (critical_high/critical_low/warning_high/warning_low [legacy]/device_offline/
warmer_fault), `value`, `status` (open/acknowledged/resolved, indexed), `acknowledgedBy/At`,
`resolvedBy/At`, `resolveNote`, `correctiveAction` (ref), `notificationSent`, `pushSentAt`.

**TempMonCorrectiveAction** (`core_tempmon_corrective_actions`): `alert` (ref, unique), `unit`
(ref, indexed), `actionTaken`, `takenBy`, `takenAt`, `rootCause`, `preventiveMeasure`,
`productDisposalRequired`, `productDisposalDetails`, `verifiedBy`, `verifiedAt`, `outcome`
(product_safe/product_discarded/equipment_repaired/other/'').

**TempMonCalibration** (`core_tempmon_calibrations`): `device` (ref, indexed), `calibratedBy`,
`calibratedAt`, `referenceTemp`, `readingBefore`, `readingAfter`, `offsetApplied`, `certificate`
(Cloudinary URL), `certificateId`, `nextDueDate`, `notes`.

**TempMonConfig** (`core_tempmon_configs`, singleton key='global'): `pushDelayCriticalMinutes`
(default 60), `pushDelayWarningMinutes` (default 120, legacy).

### 10.2 Alert / Excursion Logic

- On ingest, `evaluateAlertType(value, unit)`: warmers → null (handled by fault state machine
  only); else `critical_low` if value<criticalMin, `critical_high` if value>criticalMax, else
  null.
- `maybeCreateOrNotifyAlert`: skip if `unit.inUse===false`; dedup against existing
  open/acknowledged alert of same type; track excursion start time in-memory
  (`global._tempmonExcursionStart[unitId_type]`) keyed by **sensor-recorded timestamp** (not
  server time, so buffered readings are evaluated correctly); once elapsed ≥
  `alertThresholdMinutes`, create TempMonAlert + `sendPushToPermission('tempmon', ...)`.
- When back in range: clear excursion timers, auto-resolve open critical/warning alerts with
  `resolveNote: "Temperature returned to normal range automatically"`.
- **Device offline**: cron every 5 min checks `lastSeenAt` > 2h ago (and `inUse !== false`) →
  create `device_offline` alert + push.
- **Pending push safety-net**: cron every 60s finds critical alerts with `pushSentAt: null` and
  resends.
- **Startup**: auto-resolve legacy warning_* alerts; for units with `alertThresholdMinutes > 0`
  and no open alert, walk back readings to seed in-progress excursions and fire overdue alerts
  if already past threshold.

### 10.3 Warmer Fault-State Machine (`updateWarmerState`, called on every warmer ingest)

Zones: **Room** (temp ≤ roomTempCeiling), **Mid** (roomCeiling < temp < targetLow), **Active**
(temp ≥ criticalMin/targetLow). Slope = (latest−oldest)/(minutes) over rolling window of N
readings (`slopeWindowReadings`); rising if slope > `riseMinPerMin` (0.10), falling if slope <
`-fallMinPerMin` (0.08), else flat.

Transitions:
- off → warming_up (rising from room)
- warming_up → active (reaches targetLow); → fault (flat in mid-zone for `faultMinutes`)
- active → cooling (falling); → fault (flat in mid-zone after dropping below target,
  unrecoverable)
- cooling → off (sustained room temp for `offConfirmMinutes`); → warming_up (rising again)
- fault → active (reaches targetLow); → cooling (consistently negative slope)

A `warmer_fault` TempMonAlert is created on transition into `fault` (if `inUse !== false`) and
auto-resolved on transition out.

### 10.4 API (`/api/tempmon`)

- Units: `GET /units` (with latestReading + openAlerts count, aggregated), `GET /units/:id`
  (+linked devices), `POST /units`, `PUT /units/:id`, `DELETE /units/:id` (soft, active=false),
  `POST /admin/apply-type-default-ranges` (batch-set thresholds by type + sync FoodSafety
  checklist records)
- Devices: `GET /devices`, `POST /devices` (auto-link/migrate by deviceId), `PUT /devices/:id`,
  `DELETE /devices/:id`, `GET /devices/:id/diag`
- Ingest: `POST /ingest` (header `X-Gateway-Key`) — body `{gatewayId, readings:[{deviceId, value,
  recordedAt?, batteryPct?}]}` → `{ok, saved, skipped, alerts}`
- Readings: `GET /readings/:unitId?from=&to=&limit=2500`, `GET /readings/:unitId/export` (CSV)
- Alerts: `GET /alerts?status=open|acknowledged|resolved|active&unitId=&from=&to=&limit=100`,
  `GET /alerts/:id`, `PUT /alerts/:id/acknowledge`, `PUT /alerts/:id/resolve` (admin)
- Corrective actions: `POST /corrective-actions` (auto-resolves linked alert), `GET
  /corrective-actions/:id`, `PUT /corrective-actions/:id`
- Calibrations: `GET /calibrations?deviceId=`, `GET /calibrations/due` (within 30 days), `POST
  /calibrations` (multipart, optional certificate)
- Dashboard: `GET /dashboard` — totalUnits, openAlerts, offlineDevices, dueCalibrations,
  unitsOutOfRange
- Reports: `GET /reports/daily?from=&to=&unitId=` (min/max/avg/count/excursions per unit), `GET
  /reports/compliance?from=&to=` (% per unit), `GET /reports/monthly-unit?unitId=&month=`
  (am/pm sampling for food-safety report — warmers: first 2 in-range readings per day or
  "Not-In-Use"; chiller/freezer: 1 stable random in-range reading per window), `POST
  /reports/monthly-unit/confirm` → creates FoodSafetyChecklistMonth record
- Config: `GET/PUT /config`, `POST /test-push`
- Admin/debug: `POST /debug/inject` (admin, simulate reading), `DELETE /alerts?from=&to=` (admin,
  purge resolved), `DELETE /readings/:unitId?from=&to=` (admin, purge)
- Separate PDF endpoints in server.js: `GET /api/tempmon/reports/monthly-unit.pdf?unitId=&month=`
  (Puppeteer render of `/tempmon/report.html`)
- `POST /api/tempmon/admin/seed` (admin) — re-runs the 31-unit seed + LoRa links

### 10.5 31 Pre-seeded Equipment Units + LoRa Sensors

On first boot (`seedTempMonUnits` in server.js), upserts 31 equipment units with paired LoRa
sensor serials:
- **Warmers (6):** CK-B4-FW-01..05 (sn 09240013-09240014, 09240127-09240129), CK-B5-FW-06 (sn
  09240130). Limits: criticalMin 60, criticalMax 90, targetTemp 68, warningBuffer 5.
- **Chillers (16):** CK-WC-01..09,11,12 / CK-SC-01,02,05,06 / CK-CC-01,03 / CK-C3-SC-01 — various
  locations (Packing Room, Hot Kitchen Veg/Meat, Sauce Area, Processed Veg, Veg Prep, Raw
  Fish/Meat, Main Walk-In Chiller, Bakery, Fruit Room, Salad Room, Dong Counter, Cold Room).
  Limits: criticalMin 1, criticalMax 8, targetTemp 4, warningBuffer 2.
- **Freezers (7):** CK-SF-01 (Retention Sample), CK-WF-01..06 (Braising, 06-24, 05-26, 05-27,
  06-19 side/big). Limits: criticalMin -25, criticalMax -12, targetTemp -18, warningBuffer 2.

All units seeded with `active: true`, `alertThresholdMinutes: 30`. Each gets a TempMonDevice
with `expectedIntervalMinutes: 5`. Full sensor-serial → unit-name table exists in
`server.js::seedTempMonUnits` / `seedLoraLinks` (must be preserved verbatim for hardware
continuity — see source for the full 31-row table).

### 10.6 Cron Jobs

1. Device offline check — every 5 min
2. Pending-push safety net — every 60s
3. Startup cleanup (legacy warning alerts) + startup excursion seeding (described above)

### 10.7 Pages

`index.html` (unit cards: in-range/warning/critical/offline), `unit.html` (chart + readings +
manual injection), `alerts.html` (filter/ack/resolve/CA form), `setup.html` (admin, `?tab=
gateway|devices`), `report.html` (monthly compliance report builder), `gateway-log.html` (TCP/
HTTP diagnostics), `warmer-test.html`, `dev-test.html`, `calibration-due.html`.

---

## 11. Module: TempLog / LoRa Gateway (`/templog/`, permission `templog`)

Legacy temp-logging hub + LoRa sensor ingestion bridge into TempMon.

### 11.1 Collections (TempLog DB)

**LORA_DEVICES** (`templog_lora_devices`): `sensorId` (unique, 8-char BCD normalized —
numeric IDs <8 digits zero-padded), `model` (TAG07/TAG08B/TAG08L/TAG09 — normalization handles
"TAG08(B-L)" → TAG08B etc.), `equipment` (legacy: freezer/chiller/food-warmer/ambient),
`tempmonUnitId` (nullable — if set, readings forward to TempMon), `alias`, `notes`, `enabled`,
timestamps.

**LORA_GATEWAY_EVENTS** (`templog_lora_gateway_events`): `gatewayId`, `sensorCount`,
`ingestedCount`, `unmatchedCount`, `unmatched[]` {sensorId, temp, model, reason
(unregistered/disabled/invalid_temp), recordedAt}, `payload` (raw), `receivedAt`.

**EQUIPMENT_TEMP_READINGS** (`templog_equipment_temp_readings`): `equipment`
(freezer/chiller/food-warmer), `temp`, `source` (lora-http-gateway/iot-gateway/manual),
`gatewayId`, `sensorId`, `model`, `humidity`, `rssi`, `battery`, `recordedAt`, `createdAt`.

**EQUIPMENT_TEMP_CONFIGS** (`templog_equipment_temp_configs`): `equipment` (unique),
`minTemp`, `maxTemp`, `updatedAt`. Defaults: freezer {-25,-14}, chiller {0,6} — note: server.js
default differs slightly (-25/-15 and 0/5; reconcile during rewrite), food-warmer {60,85} or
{70,90}, ambient {20,30}.

**COOKS_COMBIOVEN** (`templog_cooks_combioven`): combi-oven cook session records — `equipment`,
`sessionId`, `startTime`, `endTime`, `tempTarget`, `tempAchieved`, `cycleType`, `notes`.

### 11.2 LoRa Sensor ID & Payload Handling

- `normalizeSensorId`: uppercase + trim; pure-numeric IDs <8 digits zero-padded to 8 (TZONE TAG
  sensors transmit 8 BCD digits / 4 bytes).
- `normalizeLoraModel`: handles "TAG08(B-L)"→TAG08B, "TAG08L"→TAG08L, "TAG09"→TAG09,
  "TAG07"→TAG07, plus HardwareType strings.
- `parseRecordedAt`: handles compact `YYMMDDHHmmss` gateway RTC format (UTC), unix
  seconds/millis (auto-detect via >1e12), ISO strings, fallback to now.
- `extractLoraSensorRows(payload)`: HTTP gateway wraps sensor arrays under `payload.data.tag07`/
  `tag08b`/etc — collects **all** `tag*` arrays (multi-model payloads). Falls back to top-level
  array candidates (`TagList`, `SensorList`, `tags`, `readings`, `sensors`, `items`, or raw
  array) **only** if no `data{}` envelope present (to avoid misreading gateway heartbeats).
  Field mapping per row: sensorId from
  id/sensorId/sensorID/sensor_id/SN/sn/tagId/deviceId/mac; temp from
  temp/temperature/Temperature/Temp/T; humidity from humi/humidity/Humidity/H (-1000 = null);
  rssi from rssi/RSSI; battery from bat/battery/Battery/BAT/batt (≤0 = null); model inferred
  from key name or row field. Deduplicates by sensorId+recordedAt.
- `validateLoraIngestAuth`: optional `LORA_HTTP_TOKEN` env — checked against
  `X-Lora-Token` header, `?token=`, or `body.token`.

### 11.3 TempMon Forwarding (`forwardToTempMon`, in server.js)

For each LoRa reading with `tempmonUnitId` set: load TempMonUnit (skip if missing/inactive),
auto-create/relink TempMonDevice by sensorId, update `lastSeenAt`, dedupe against existing
TempMonReading at same `{device, recordedAt}` (overwrite if value differs, skip if identical),
save TempMonReading (flagged if outside critical range), call `tmUpdateWarmerState`, run alert
evaluation (`tmEvaluateAlertType` / `tmMaybeCreateAlert` — same excursion-timer logic as §10.2,
duplicated in server.js).

### 11.4 API

**Equipment temp config/readings (in server.js):**
- `GET/PUT /templog/api/equipment-temp/config[/:equipment]`
- `POST /templog/api/equipment-temp/readings` — `{readings:[...]}`, broadcasts via SSE
  (`equipmentTempSseClients`), `processEquipmentAlarm` is a **no-op** (alerts fully migrated to
  TempMon)
- `GET /templog/api/equipment-temp/readings?equipment=&minutes=240&limit=480` (trend)
- `GET /templog/api/equipment-temp/latest`
- `GET /templog/api/equipment-temp/alerts` (disabled, always empty)

**LoRa device registry & ingest:**
- `GET /templog/api/lora/devices`, `POST /templog/api/lora/devices` (register; auto-link
  TempMonDevice if `tempmonUnitId`), `PUT /templog/api/lora/devices/:sensorId`, `DELETE
  /templog/api/lora/devices/:sensorId`
- `GET /templog/api/lora/tcp-log?format=json|text&limit=200`, `GET /templog/api/lora/tcp-config`
  (Railway TCP proxy via `LORA_TCP_PROXY_HOST/PORT` or `RAILWAY_TCP_PROXY_DOMAIN/_PORT`)
- `GET /templog/api/lora/events?limit=50`
- `GET /templog/api/lora/status` — per-device live status (latest reading, battery, signal,
  offline age)
- `GET /templog/api/lora/discover?scan=200&hours=24` — unregistered sensors seen recently
- `POST /templog/api/lora/receive` — main HTTP ingest entrypoint (auth via
  `validateLoraIngestAuth`); returns `{ok, gatewayId, received, ingested, unmatched}`; also
  writes a `LORA_GATEWAY_EVENTS` record.

### 11.5 Cook Logs API

- `GET /templog/api/cooks` (filter by date/year/month/date-range via `buildDateFilter`), `POST
  /templog/api/cooks`, `GET /templog/api/cooks/export` (CSV), `GET
  /templog/api/cooks/report.pdf` (Puppeteer, optional).
- Validation (`validateCook`): requires `food` + `staff`; `temp` numeric if present; `trays`
  integer ≥1 if present.

### 11.6 Pages

`index.html`, `departments/combioven.html`, `departments/combioven-data.html`,
`departments/combioven-report.html` (printable PDF template), `departments/
equipment-temperature.html`, `departments/lora-control-panel.html` (registry + discovery + link
to TempMon units).

---

## 12. Module: Order Manager (`/order-manager/`, permission `templog`, isolated backend)

Separate native-Mongo backend (`order-manager/backend/`) connected to the Order Manager DB. Pulls
order data from an external POS/kitchen extraction service on a schedule, diffing
initial-vs-refresh runs to flag new/edited orders for kitchen staff.

### 12.1 Models / Collections

**EXTRACTION_RUNS** (`order_manager_extraction_runs`): `reportDate` (YYYY-MM-DD), `runType`
(current_day_morning/daily_initial/daily_refresh/manual), `extractedAt` (ISO), `csvRows[]` (each:
`functionTime`, `functionTimeLabel`, `qty`, `eventType`, `notes`, `chefCellValue`,
`chefCellTime`, `chefRowTotal`, `unmatchedReason`, `isEdited`, `isNewAtRefresh`, `hasAlert`,
`changeAlertLabel` ["加单！"=new / "改单！"=edited], `changedFields[]`), `baselineRunId`
(nullable, for refresh runs), `refreshSummary` {baselineRunId, baselineExtractedAt,
editedRowCount, newRowCount, unchangedRowCount}.

**JOB_RUNS** (`order_manager_job_runs`): `jobKey` (e.g. `order-manager:daily_refresh`,
indexed), `reportDate` (indexed), `status` (running/succeeded/failed), `startedAt`,
`finishedAt`, `error`, `metadata` {runId, extractedAt}.

**COOK_SESSIONS** (`order_manager_cook_sessions`): `equipment`, `sessionId` (unique, indexed),
`startTime`, `endTime`, `tempTarget`, `tempAchieved`, `cycleType`, `status`
(active/complete/error), `notes`.

**DEPARTMENTS** (`order_manager_departments`): `name` (unique, indexed), `posOrderType`,
`description`, `active`.

**DISH_CATALOG** (`order_manager_dish_catalog`): `itemCode` (unique, indexed), `itemName`,
`department` (ref Department), `description`, `allergens[]`, `notes`, `active`.

**RETENTION_SAMPLES / RETENTION_SAMPLE_CONFIGS** — present in `databaseLayout.js` but not
deep-dived (likely supports the "Retention Sample" ISO record / TempMon retention-sample
freezer); confirm during implementation by reading `order-manager/backend/` source for any
retention-sample routes/models.

### 12.2 Scheduler (`order-manager/backend/scheduler.js`)

- Env `ORDER_MANAGER_SCHEDULE_ENABLED` (default true); timezone from
  `ORDER_MANAGER_TIMEZONE`/dateUtils.
- 3 daily jobs: `current_day_morning` @ 04:00, `daily_initial` @ 14:00, `daily_refresh` @ 20:00.
- Lock-based execution (`acquireScheduledJobLock(jobKey, reportDate)`) prevents duplicate runs;
  60s reconciliation loop over an 8-hour catch-up window; completed-run cache avoids
  re-execution.
- `executeExtractionRun({reportDate, runType})`:
  1. `runExtraction({reportDate, reportType:'combined'})` — calls external extractor service
  2. `resolveExtractionDepartments(csvRows)` — enrich with department info
  3. If `daily_refresh`: diff against `daily_initial` baseline via `buildComparisonKey(row)` over
     fields `[functionTime, functionTimeLabel, qty, eventType, notes, chefCellValue,
     chefCellTime, chefRowTotal, unmatchedReason]` (normalized: trim/lowercase) → populates
     `changedFields`, `isEdited`, `isNewAtRefresh`, `changeAlertLabel`
  4. Otherwise default all flags false
  5. `saveExtractionResult(...)`

### 12.3 API (`/api/extraction`)

- `GET /latest`, `GET /status?date=YYYY-MM-DD` (scheduled-slot status + latest run), `POST
  /extract` (manual, body `{date}}`; 409 if running, 503 if extractor not configured), `GET
  /latest.csv`, `GET /latest.json`.

### 12.4 Pages

`index.html`, `order-summary.html`, `chef-preorder.html`, `extractor.html`,
`department-mappings.html`, `kitchen/combioven.html`, `kitchen/kitchentemplog.html`,
`kitchen/stirfry.html`, `kitchen/auto-orders.html`.

### 12.5 Connection Config

URI/DB-name fallback chain: `MASTERAPP_ORDER_MANAGER_*` → `ORDER_MANAGER_*` →
`TEMPLOG_MONGODB_URI`/`TEMPLOG_DB_NAME` → default `masterapp_order_manager`. Pool tuning env
vars: `ORDER_MANAGER_MONGODB_MAX_POOL_SIZE` (20), `MIN_POOL_SIZE` (0), `MAX_IDLE_MS` (30000),
`SERVER_SELECTION_TIMEOUT_MS` (10000), `CONNECT_TIMEOUT_MS` (10000), `SOCKET_TIMEOUT_MS` (45000).

---

## 13. Module: Label Printing (`/label-print/`, permission `labelprint`)

Bluetooth thermal-label printing for a Brother QL-820NWB, via the **Web Serial API** (Android
Chrome). Department-scoped catalog for staff; full admin tooling for templates/printers/items.

### 13.1 Models

**LabelPrintTemplate** (`core_label_print_templates`): `key` (unique), `name`, `nameEnglish`,
`nameChinese`, `description`, `printerTemplateNumber` (1-255, unique), `mediaWidthMm` (default
62), `printWidthMm` (default 58), `heightMm` (enum 29/62/100), `supportedOptions` {autoCut,
noCut}, `fieldSchema[]` {key, label, type, required}, `preview` {widthMm=58, heightMm=62},
`departmentCode`, `departmentName`, `departmentSignature`, `departmentSignaturePlacement`,
`departmentSignatureEmbeddedInTemplate`, `active`, `designLayout` (mixed canvas JSON).

**LabelPrintItem** (`core_label_print_items`): `name`, `nameEnglish`, `nameChinese`,
`description`, `category` (default "Uncategorized"), `templateKey` (required), `sku`,
`barcode`, `departmentCode`, `departmentName`, `storageCondition`, `defaultQuantity` (1-999),
`defaultCutMode` (auto-cut/no-cut), `businessEntity`, `address`, `halalCertNumber`,
`shelfLifeDays` (default 3), `defaultFieldValues` (mixed), `allowedOptions`
{allowCutOverride=true}, `active`. Index {category,name}.

**LabelPrintPrinter** (`core_label_print_printers`): `name`, `model` (default "QL-820NWB"),
`androidClientId`, `serialBaudRate` (default 115200, 1-921600), `businessEntity`, `address`,
`halalCertNumber` (default "C1086"), `halalLogoDataUrl`, `status`
(unavailable/ready/printing/error), `bridgeAvailable`, `active`, `lastSeenAt`, `objectNameMap`
(mixed — default {name, description, sku, barcode, quantity, dateTime}).

**LabelPrintJob** (`core_label_print_jobs`): `item` (ref, nullable), `itemSnapshot` (mixed
denormalized), `printer` (ref, nullable), `templateKey`, `printerTemplateNumber`, `quantity`
(1-999), `cutMode`, `payload` (mixed {printerId, templateKey, printerTemplateNumber, copies,
cutMode, serialBaudRate}), `requestedBy` {id, username, displayName}, `status`
(queued/success/failed/bridge_unavailable/test), `bridgeResult` (mixed), `error`, `completedAt`.
Index {createdAt desc}.

**LabelPrintDiagnosticLog** (`core_label_print_diagnostic_logs`): `source` (client/server),
`level` (info/warn/error), `eventType` (default "runtime"), `message` (max 600), `details`
(mixed), `device` {sessionId (`lpdiag-<ts>-<rand>`), userAgent, origin, href, displayMode},
`runtime` (mixed), `requestedBy` {id, username, displayName}. Indexes: {createdAt desc},
{device.sessionId, createdAt desc}, {eventType, createdAt desc}.

### 13.2 Access Control (`services/label-print-departments.js`)

- `normalizeDepartmentName`, `slugifyDepartmentName` (kebab-case, Chinese-aware),
  `isLabelPrintAdmin(user)` = `role==='admin'`, `assignedLabelPrintDepartment(user)` =
  normalized `user.labelPrintDepartmentName`.
- **Non-admins** are hard-locked to their assigned department: items/lists auto-filtered, no
  template/printer management, no diagnostics access, no department switcher.
- **Admins** can switch department via `?departmentName=`/`?departmentSlug=`, full CRUD
  everywhere.
- Note: `isLabelPrintOnlyUser` in server.js — if a non-admin user has ONLY `labelprint`
  permission (plus an assigned department) and nothing else, the hub `/` redirects them straight
  to `/label-print/`.

### 13.3 API (`/api/label-print`)

- Templates: `GET /templates[?active=false]`, `GET /templates/:id` (+usage count), `POST
  /templates` (admin, validates key & printerTemplateNumber uniqueness), `PUT /templates/:id`
  (admin — remaps `templateKey` on items if key changes), `PUT /templates/:id/layout` (admin,
  5MB limit, saves canvas design)
- Items: `GET /items[?active=false&departmentName=]` (dept-filtered for non-admins), `GET
  /items/:id`, `POST /items` (admin), `PUT /items/:id` (admin)
- Departments: `GET /departments[?departmentSlug=]` — returns available departments + user's
  assigned dept + permissions
- Printers: `GET /printers`, `PUT /printers/:id` (admin)
- Print jobs: `POST /print-jobs` (client logs completed Bluetooth print), `GET /print-jobs`
  (admin, 30 most recent), `PUT /print-jobs/:id` (admin)
- Assets: `GET /assets/halal-logo`, `POST /assets/halal-logo` (admin, PNG/JPEG/GIF ≤4MB, saved to
  `label-print/assets/` + base64 in printer doc)
- Diagnostics: `POST /diagnostic-logs` (≤64KB), `GET
  /diagnostic-logs?limit=30&sessionId=&level=&eventType=` (admin)

### 13.4 Frontend (Web Serial / Bluetooth)

- **Constants:** `DEFAULT_SERIAL_BAUD_RATE=115200`, `LEGACY_SERIAL_BAUD_RATE=9600`,
  `BLUETOOTH_RFCOMM_SERVICE_ID='00001101-0000-1000-8000-00805f9b34fb'`,
  `DIAGNOSTIC_SESSION_KEY`, `HALAL_LOGO_STORAGE_KEY`, `BROTHER_STATUS_RESPONSE_LENGTH=32`.
- `index.html`/`app.js` — staff launcher: fuzzy search (Levenshtein ≤1) across name fields/
  sku/barcode/storage, category filter, department switcher (admin), quantity steppers (1-999,
  persisted in component state), quick-print button, admin 3-dot menu (per-item template/cut/
  field overrides), printer setup modal (printer select, baud rate, halal logo, authorized-ports
  list, pair new device), Bluetooth auto-reconnect with banner, admin diagnostics panel
  (runtime log ring buffer 250, export/upload).
- `template-setup.html`/`template-setup.js` — admin CRUD for templates (search, active filter,
  usage counts, validation for key/number uniqueness).
- `label-designer.html`/`label-designer.js` — WYSIWYG canvas (696×271px @ 2x zoom = 1392×542,
  font "Noto Sans SC"/"Arial Unicode MS"). Predefined field library: `entity` (28px center top),
  `address` (13px center), `nameChinese` (60px center, prominent), `nameEnglish` (22px center),
  `dateProduction`/`dateExpiry` (36px right), `departmentName` (12px right bottom),
  `storageCondition`/`shelfLifeDays` (12px left bottom), `halalCert` (11px center). Drag/resize/
  rotate, save layout to template, print test.
- `bluetooth-probe.html` — diagnostics: secure-context check, Web Serial availability,
  authorized ports, display mode, pairing history, **Brother status response parser**
  (`parseBrotherStatusResponse` — validates 32-byte header `[0x80,0x20,0x42]`, extracts media
  width/type/length, status/phase type, error flags: no media, cutter jam, cover open, etc.)

### 13.5 Print Job Flow

1. User taps print → `runPrint(item, options)`. If not connected, attempt silent reconnect to
   saved port, else show reconnect banner.
2. Build payload `{printerId, templateKey, printerTemplateNumber, copies, cutMode,
   serialBaudRate}`.
3. Write Brother command bytes to `port.writable`.
4. Read 32-byte status response, parse via `parseBrotherStatusResponse`.
5. `POST /print-jobs` with full payload + itemSnapshot (audit trail), `completedAt` set.

---

## 14. Photo Upload Service (`services/cloudinary-upload.js`)

- Config detection via `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`.
- `memUpload(fieldName)` — multer memoryStorage, 10MB limit, image/* only, `.single(fieldName)`.
- Pattern: parse multipart synchronously → respond 201 immediately → upload buffer to Cloudinary
  in background (`uploadBufferToCloudinary(buffer, mimetype, folder, timeoutMs=20000)` —
  transformations: width 1200, crop limit, quality auto:good, format webp; 20s timeout, never
  blocks the route, resolves null on failure).
- Folders used: `maintenance/equipment-issues`, `procurement`, `foodsafety/nc`, `pest/findings`,
  etc.
- **Foodsafety-specific fallback**: if Cloudinary unconfigured, saves to local disk
  `/foodsafety/uploads/{timestamp}-{random6hex}.{ext}`.
- **Pest-specific fallback**: base64 data: URL stored directly in `PestFinding.photos[].url`.

---

## 15. Frontend Conventions

### 15.1 API Client (`public/js/api.js`)
- `API_BASE = ${window.location.origin}/api/...` — auto-detects host (works for localhost,
  LAN IP, ngrok, Railway).
- Shared `fetchJson(url, options)` wrapper: `credentials: 'include'`, JSON parse, throws on
  non-OK.

### 15.2 Auth Guard (`auth-guard.js`)
- Pattern: `<script>document.documentElement.style.visibility='hidden'</script><script
  src="/auth-guard.js"></script>` in `<head>`.
- Fetches `/api/auth/me`; admins pass everything; non-admins checked against
  `user.permissions[<module-derived-from-URL>]`. Module inferred from path prefix
  (`/maintenance`→maintenance, `/foodsafety-forms`→foodsafetyforms|foodsafety,
  `/foodsafety`→foodsafety, `/templog`→templog, `/label-print`→labelprint,
  `/procurement`→procurement, `/admin`→admin role).
- Caches user on `window._authUser`. Redirects to `/login?next=...` (unauth) or
  `/?access=denied` (forbidden). Reveals page on success.
- `BYPASS_AUTH=true` serves a no-op guard with a fake admin `window._authUser`.

### 15.3 PWA Shell
- `public/sw.js` — cache name `ck-shell-v3`. Cache-first for `/css/`, `/js/`, `/icons/`,
  `/manifest.json`, `/auth-guard.js` (stale-while-revalidate); network-first for HTML
  navigations with `offline.html` fallback; `/api/*` always network-only.
- `public/manifest.json` — name "Central Kitchen" / short "CK Hub", `start_url`/`scope`="/",
  `display`="standalone", theme `#ff7a18`, background `#f4f5f7`, icons 192/512 (any + maskable).

### 15.4 Static Routing Pattern (server.js)
Each module follows: `app.use('/<module>', requirePageAccess('<perm>'),
express.static(path.join(__dirname, '<module>'), noCacheHtml))` + explicit `GET /<module>` →
`index.html`. `noCacheHtml` sets `Cache-Control: no-store` on `.html` responses (always fresh).
Several modules have extra named routes registered *before* the static/catch-all (e.g.
foodsafety's `/nc`, `/fhc`, `/fhc/new`, `/fhc/:id`; label-print's admin-only
`template-setup.html`/`label-designer.html`/`bluetooth-probe.html` via
`labelPrintAdminPage()`).

---

## 16. Scripts (`scripts/`)

| Script | Purpose |
|---|---|
| `database-layout-utils.js` | Shared utils for migration scripts: MongoClient caching, plan parsing, doc counting, index normalization |
| `migrate-atlas-layout.js` | Batch-copy collections per migration plan (250-doc batches, recreates indexes) |
| `audit-atlas-layout.js` | Compare source vs target collection counts/dupes |
| `verify-atlas-layout.js` | Post-migration verification |
| `merge-test-into-layout.js` | Merge `test` DB into production layout (ObjectId remapping; optional skip of tempmon readings) |
| `seed-test-warmer.js` | Create/reset a TEST WARMER unit+device with short timeouts for fault-state testing |
| `inject-test-readings.js` | Simulate readings for warmer state-machine test scenarios |
| `patch-template-height.js` | One-shot data fix: LabelPrintTemplate heightMm 62→29 |
| `cleanup-label-print-bad-departments.js` | Removes ~40 bad/Chinese department names from LabelPrintItem |

npm scripts: `db:audit-layout`, `db:migrate-layout`, `db:verify-layout`, `db:merge-test`.

---

## 17. Environment Variables (Full List)

```
PORT
NODE_ENV
JWT_SECRET
BYPASS_AUTH

MASTERAPP_CORE_MONGODB_URI / MASTERAPP_CORE_DB_NAME
MASTERAPP_TEMPLOG_MONGODB_URI / MASTERAPP_TEMPLOG_DB_NAME
MASTERAPP_ORDER_MANAGER_MONGODB_URI / MASTERAPP_ORDER_MANAGER_DB_NAME
# legacy fallbacks: MAINTENANCE_MONGODB_URI, TEMPLOG_MONGODB_URI, TEMPLOG_DB_NAME,
# ORDER_MANAGER_MONGODB_URI, ORDER_MANAGER_DB_NAME, MONGODB_URI, MONGODB_DB_NAME

CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET

VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_EMAIL

QR_BASE_URL
LORA_HTTP_TOKEN
LORA_TCP_PROXY_HOST / LORA_TCP_PROXY_PORT (or RAILWAY_TCP_PROXY_DOMAIN / _PORT)

ORDER_MANAGER_SCHEDULE_ENABLED
ORDER_MANAGER_TIMEZONE
ORDER_MANAGER_MONGODB_MAX_POOL_SIZE / MIN_POOL_SIZE / MAX_IDLE_MS /
  SERVER_SELECTION_TIMEOUT_MS / CONNECT_TIMEOUT_MS / SOCKET_TIMEOUT_MS
# (extractor service env vars — check order-manager/backend source for exact names)
```

---

## 18. Suggested Rewrite Plan (Phased)

This is a *suggested* sequencing — the other AI tool should treat it as a starting point and
adjust based on whatever new stack/framework is chosen. The guiding principle: **get auth + one
high-value module fully working end-to-end first**, then expand module-by-module, because each
module is largely independent (only shared pieces are auth, push, photo upload, and the
PDF/report pattern).

### Phase 0 — Foundations
- Decide on stack (keep Node/Express/Mongo, or migrate to a framework like Next.js/NestJS,
  Postgres, etc. — this is the big architectural decision the other AI should help with).
- Recreate the 3-database (or consolidated) layout and collection naming convention. Decide
  whether to preserve the 3-DB split or consolidate to one DB with logical schemas.
- Auth system: User model + permission keys (9 modules + `__admin__`), JWT/session strategy
  (cookie vs token), login/me/logout, admin user management + permission matrix UI.
- Shared infra: photo upload (Cloudinary or alternative + local fallback), push notifications
  (VAPID/web-push or alternative), PDF generation approach (Puppeteer or alternative),
  PWA shell/service worker if mobile installability is required.
- Set up CI/health checks (`/api/health` equivalent) and Railway (or chosen host) deployment
  config.

### Phase 1 — Core Operational Modules (Maintenance, Procurement, Food Safety NC)
- Equipment / Areas / Issues / Maintenance Records CRUD + QR code generation + reports.
- Procurement request workflow (bilingual public form + admin tracking).
- Food Safety NC reporting (bilingual public/staff form + admin resolution flow).
- These three share simple CRUD + photo upload + QR patterns — good for establishing the new
  app's conventions (forms, lists, detail pages, status badges, bilingual UI pattern).

### Phase 2 — TempMon + TempLog/LoRa
- TempMonUnit/Device/Reading/Alert/Config/CorrectiveAction/Calibration models.
- Ingest endpoint + alert/excursion logic + warmer fault-state machine (preserve exact
  thresholds/algorithm — this is hardware-calibrated logic).
- Seed the 31 equipment units + sensor-serial mappings (pull exact table from current
  `server.js::seedTempMonUnits`/`seedLoraLinks`).
- LoRa gateway ingest (`/templog/api/lora/receive`) + device registry + TempMon forwarding.
- Cron jobs: offline detection, pending-push safety net, startup excursion seeding.
- This is the most hardware/timing-sensitive module — recommend dedicating careful QA/testing
  time (the `scripts/seed-test-warmer.js` + `inject-test-readings.js` testing pattern is worth
  preserving).

### Phase 3 — Food Safety Forms (Digital Checklists)
- Port the 13 template definitions (matrix + log-entry types), 6 units, multi-language support
  (EN/ZH/TA).
- FoodSafetyChecklistMonth model + draft/finalize/verify workflow + signatures.
- Form assignment system (admin assigns user↔template↔unit).
- PDF report generation + archiving (reuse Phase 0's PDF approach).
- TempMon monthly report bridge (`CAC-SOP-02-F01-TEMPMON`).
- Food Handler Cert tracker (separate small CRUD module, can be done in parallel).

### Phase 4 — Pest Control + ISO Records
- Both are smaller, mostly independent CRUD modules — good candidates to parallelize with
  Phase 3.
- Pest: 23 pre-seeded stations, session/finding workflow, photo upload, grid report.
- ISO: 34 seeded records, computed-status logic, XLSX export.

### Phase 5 — Label Printing
- Template/Item/Printer/Job/DiagnosticLog models + department-based access control.
- Web Serial/Bluetooth printing flow (Brother QL-820NWB protocol) — this is browser-API-heavy
  and hardware-specific; consider whether the new stack changes the printing approach (e.g.
  native app vs PWA).
- Label designer (WYSIWYG canvas) — significant frontend effort; could be deferred or simplified
  in v1 if templates rarely change.

### Phase 6 — Order Manager
- Separate backend service; extraction run/job models, scheduler (3 daily jobs + diffing
  logic), external extractor service integration.
- Kitchen-facing pages (combioven, stir-fry, auto-orders) — clarify with stakeholders which of
  these are actively used before investing rewrite effort.

### Phase 7 — Notifications, PWA polish, Migration
- Push notification preferences UI, per-module toggles.
- PWA installability (manifest, service worker, offline page) if needed on the new stack.
- Data migration from existing MongoDB collections to new schema (write migration scripts
  analogous to `scripts/migrate-atlas-layout.js`, copy-first/verify-second/cutover-last).
- Parallel-run period (old + new app pointing at same/synced data) before full cutover.

---

## 19. Open Questions for the Rewrite (flag to stakeholders)

1. **Keep 3-database split or consolidate?** Current split exists for historical/migration
   reasons — a fresh build may not need it.
2. **Which modules are still actively used?** (e.g. legacy `/foodsafety` NC vs new
   `/foodsafety-forms`; Order Manager's kitchen pages; `/templog` legacy equipment-temp vs
   TempMon — TempMon appears to be the active system, TempLog mostly a LoRa bridge now.)
3. **Hardware dependencies that must be preserved exactly:** 31 TempMon unit/sensor mappings,
   LoRa TAG sensor ID normalization (8-digit BCD), warmer fault-state-machine thresholds, Brother
   QL-820NWB label printer protocol/Web-Serial flow.
4. **Multi-language requirements**: which modules truly need EN/ZH/TA, and is the current
   per-template language config the right long-term approach (e.g. i18n library instead)?
5. **PDF generation**: Puppeteer is heavy (esp. on Railway) — is there a lighter alternative
   (e.g. a PDF library that doesn't need a headless browser) now that requirements are known?
6. **Mobile/offline requirements**: is the PWA/service-worker approach still needed, or would a
   native app better serve QR-scan/label-printing staff workflows?
7. **Retention sample collections** (`RETENTION_SAMPLES`/`RETENTION_SAMPLE_CONFIGS`) — present in
   DB layout but not deep-dived; confirm scope/usage before rewrite.
