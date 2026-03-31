# Agent Rules — Masterapp

These rules apply to any AI agent editing this repository.

## Priority

1. Preserve the live database layout already established in `config/databaseLayout.js`.
2. Prefer explicit naming over framework defaults.
3. Do not create new databases, collections, or models ad hoc.
4. Keep legacy databases read-only unless the task is an approved migration.

## Canonical Database Layout

Use only these three application databases unless the user explicitly approves a new one:

- `masterapp_core`
- `masterapp_templog`
- `masterapp_order_manager`

Legacy databases such as `central_kitchen_maintenance`, `maintenance_dashboard`, `kitchenlog`, `iso_records`, `procurementapp`, and `test` are migration sources, not the target architecture.

## Database Routing Rules

- All database names and collection names must come from `config/databaseLayout.js`.
- Never hardcode a new database name or collection name in route files, model files, or scripts.
- If a new collection is required, add it to `config/databaseLayout.js` first, then reference the constant everywhere else.
- If a new database is proposed, stop and require explicit user approval before implementing it.

## Collection Ownership

- `masterapp_core`: auth, admin, procurement, maintenance, food safety, pest, ISO, push subscriptions, TempMon model data
- `masterapp_templog`: LoRa gateway data, equipment temperature logs, combi oven cook logs
- `masterapp_order_manager`: extraction runs, job runs, cook sessions, departments, dish catalog

Do not place a collection in a different database because it feels convenient.

## Naming Format

Use these naming rules for all new persistence objects:

- Core collections: `core_<domain>`, plural when it stores multiple records
- TempLog collections: `templog_<domain>`
- Order Manager collections: `order_manager_<domain>`

Examples:

- `core_supplier_contacts`
- `templog_probe_health_events`
- `order_manager_menu_snapshots`

Do not use vague names like `data`, `records2`, `new_table`, `misc`, or bare names without a domain prefix.

## Mongoose Rules

- Every new Mongoose model must bind to an explicit collection name as the third argument to `mongoose.model(...)`.
- Do not rely on Mongoose pluralization.
- Keep schemas explicit. Do not use `strict: false`.
- Respect existing unique keys and business identifiers.

Example:

```js
module.exports = mongoose.model('SupplierContact', schema, COLLECTIONS.core.SUPPLIER_CONTACTS);
```

## Native Mongo Rules

- For native-driver modules, always use `COLLECTIONS.<group>.<NAME>` constants.
- Do not call `db.collection('literal_name')` for newly introduced collections.
- If touching Order Manager DB code, use the helpers in `order-manager/backend/db.js`.

## Environment Variable Rules

Preferred variables:

- `MASTERAPP_CORE_MONGODB_URI`
- `MASTERAPP_CORE_DB_NAME`
- `MASTERAPP_TEMPLOG_MONGODB_URI`
- `MASTERAPP_TEMPLOG_DB_NAME`
- `MASTERAPP_ORDER_MANAGER_MONGODB_URI`
- `MASTERAPP_ORDER_MANAGER_DB_NAME`

Do not introduce a new env var for database routing if the existing layout helpers already cover the need.

## Migration Rules

- Never delete old data as part of a normal refactor.
- Migration work must be copy-first, verify-second, cutover-last.
- Use the scripts in `scripts/` for audit, migration, and verification when moving data.
- Treat `test` and other legacy databases as sources to merge from, not places to keep writing to.

## Structure Rules

- New backend persistence logic must live in one of these places:
  - `models/` for Mongoose models
  - `routes/` for route handlers using those models
  - `services/` for shared utility logic
  - `scripts/` for one-off audit or migration tooling
  - `order-manager/backend/` for Order Manager-specific native Mongo logic
- Do not bury database logic inside random frontend files or unrelated modules.
- If a change affects both schema naming and runtime access, update both in the same task.

## Health and Verification

When changing DB structure:

- update `/api/health` if the visible DB status would otherwise become misleading
- keep `order-manager/health` aligned with the real configured DB
- verify syntax with `node --check`
- verify counts or connectivity with the migration scripts when applicable

## Things Agents Must Not Do

- Do not create a fourth production database without approval.
- Do not write new production data into `test`.
- Do not rename collections in Atlas manually without updating code constants first.
- Do not split one domain across multiple databases unless the user explicitly asks for that architecture.
- Do not hardcode localhost assumptions into production-facing DB code.
