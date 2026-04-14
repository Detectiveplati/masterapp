const DATABASES = {
  core: {
    envUri: "MASTERAPP_CORE_MONGODB_URI",
    envDbName: "MASTERAPP_CORE_DB_NAME",
    fallbackUriEnv: "MAINTENANCE_MONGODB_URI",
    fallbackDbName: "central_kitchen_maintenance",
    defaultDbName: "masterapp_core"
  },
  templog: {
    envUri: "MASTERAPP_TEMPLOG_MONGODB_URI",
    envDbName: "MASTERAPP_TEMPLOG_DB_NAME",
    fallbackUriEnv: "TEMPLOG_MONGODB_URI",
    fallbackDbNameEnv: "TEMPLOG_DB_NAME",
    fallbackDbName: "kitchenlog",
    defaultDbName: "masterapp_templog"
  },
  orderManager: {
    envUri: "MASTERAPP_ORDER_MANAGER_MONGODB_URI",
    envDbName: "MASTERAPP_ORDER_MANAGER_DB_NAME",
    fallbackUriEnv: "ORDER_MANAGER_MONGODB_URI",
    fallbackFallbackUriEnv: "TEMPLOG_MONGODB_URI",
    fallbackDbNameEnv: "ORDER_MANAGER_DB_NAME",
    fallbackFallbackDbNameEnv: "TEMPLOG_DB_NAME",
    fallbackDbName: "kitchenlog",
    defaultDbName: "masterapp_order_manager"
  }
};

const COLLECTIONS = {
  core: {
    AREA_ISSUES: "core_area_issues",
    AREAS: "core_areas",
    EQUIPMENT: "core_equipment",
    EQUIPMENT_ISSUES: "core_equipment_issues",
    FOOD_HANDLER_CERTS: "core_food_handler_certs",
    FOOD_SAFETY_FORM_ASSIGNMENTS: "core_food_safety_form_assignments",
    FOOD_SAFETY_CHECKLIST_MONTHS: "core_food_safety_checklist_months",
    FOOD_SAFETY_NCS: "core_food_safety_ncs",
    ISO_EMPLOYEES: "core_iso_employees",
    ISO_RECORDS: "core_iso_records",
    MAINTENANCE_RECORDS: "core_maintenance_records",
    NOTIFICATIONS: "core_notifications",
    PEST_FINDINGS: "core_pest_findings",
    PEST_SESSIONS: "core_pest_sessions",
    PEST_STATIONS: "core_pest_stations",
    LABEL_PRINT_ITEMS: "core_label_print_items",
    LABEL_PRINT_DIAGNOSTIC_LOGS: "core_label_print_diagnostic_logs",
    LABEL_PRINT_JOBS: "core_label_print_jobs",
    LABEL_PRINT_PRINTERS: "core_label_print_printers",
    LABEL_PRINT_TEMPLATES: "core_label_print_templates",
    PROCUREMENT_REQUESTS: "core_procurement_requests",
    PUSH_SUBSCRIPTIONS: "core_push_subscriptions",
    TEMP_MON_ALERTS: "core_tempmon_alerts",
    TEMP_MON_CALIBRATIONS: "core_tempmon_calibrations",
    TEMP_MON_CONFIGS: "core_tempmon_configs",
    TEMP_MON_CORRECTIVE_ACTIONS: "core_tempmon_corrective_actions",
    TEMP_MON_DEVICES: "core_tempmon_devices",
    TEMP_MON_READINGS: "core_tempmon_readings",
    TEMP_MON_UNITS: "core_tempmon_units",
    USERS: "core_users"
  },
  templog: {
    COOKS_COMBIOVEN: "templog_cooks_combioven",
    EQUIPMENT_TEMP_ALERTS: "templog_equipment_temp_alerts",
    EQUIPMENT_TEMP_CONFIGS: "templog_equipment_temp_configs",
    EQUIPMENT_TEMP_READINGS: "templog_equipment_temp_readings",
    EQUIPMENT_TEMP_STATES: "templog_equipment_temp_states",
    LORA_DEVICES: "templog_lora_devices",
    LORA_GATEWAY_EVENTS: "templog_lora_gateway_events"
  },
  orderManager: {
    COOK_SESSIONS: "order_manager_cook_sessions",
    DEPARTMENTS: "order_manager_departments",
    DISH_CATALOG: "order_manager_dish_catalog",
    EXTRACTION_RUNS: "order_manager_extraction_runs",
    JOB_RUNS: "order_manager_job_runs",
    RETENTION_SAMPLES: "order_manager_retention_samples",
    RETENTION_SAMPLE_CONFIGS: "order_manager_retention_sample_configs"
  }
};

const COLLECTION_MIGRATION_PLAN = [
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.USERS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "users" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.PROCUREMENT_REQUESTS,
    sources: [
      { dbName: "central_kitchen_maintenance", collectionName: "procurementrequests" },
      { dbName: "procurementapp", collectionName: "procurementrequests" }
    ]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.NOTIFICATIONS,
    sources: [
      { dbName: "maintenance_dashboard", collectionName: "notifications" },
      { dbName: "central_kitchen_maintenance", collectionName: "notifications" }
    ]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.EQUIPMENT,
    sources: [
      { dbName: "maintenance_dashboard", collectionName: "equipment" },
      { dbName: "central_kitchen_maintenance", collectionName: "equipment" }
    ]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.EQUIPMENT_ISSUES,
    sources: [
      { dbName: "maintenance_dashboard", collectionName: "equipmentissues" },
      { dbName: "central_kitchen_maintenance", collectionName: "equipmentissues" }
    ]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.MAINTENANCE_RECORDS,
    sources: [
      { dbName: "maintenance_dashboard", collectionName: "maintenancerecords" },
      { dbName: "central_kitchen_maintenance", collectionName: "maintenancerecords" }
    ]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.AREAS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "areas" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.AREA_ISSUES,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "areaissues" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.FOOD_SAFETY_NCS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "foodsafetyncs" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.FOOD_HANDLER_CERTS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "foodhandlercerts" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.ISO_EMPLOYEES,
    sources: [
      { dbName: "central_kitchen_maintenance", collectionName: "isoemployees" },
      { dbName: "iso_records", collectionName: "employees" }
    ]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.ISO_RECORDS,
    sources: [
      { dbName: "central_kitchen_maintenance", collectionName: "isorecords" },
      { dbName: "iso_records", collectionName: "records" }
    ]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.PEST_SESSIONS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "pestsessions" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.PEST_FINDINGS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "pestfindings" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.PEST_STATIONS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "peststations" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.LABEL_PRINT_ITEMS,
    sources: []
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.LABEL_PRINT_DIAGNOSTIC_LOGS,
    sources: []
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.LABEL_PRINT_JOBS,
    sources: []
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.LABEL_PRINT_PRINTERS,
    sources: []
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.LABEL_PRINT_TEMPLATES,
    sources: []
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.PUSH_SUBSCRIPTIONS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "pushsubscriptions" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.TEMP_MON_UNITS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "tempmonunits" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.TEMP_MON_DEVICES,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "tempmondevices" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.TEMP_MON_READINGS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "tempmonreadings" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.TEMP_MON_ALERTS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "tempmonalerts" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.TEMP_MON_CONFIGS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "tempmonconfigs" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.TEMP_MON_CALIBRATIONS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "tempmoncalibrations" }]
  },
  {
    owner: "core",
    targetCollection: COLLECTIONS.core.TEMP_MON_CORRECTIVE_ACTIONS,
    sources: [{ dbName: "central_kitchen_maintenance", collectionName: "tempmoncorrectiveactions" }]
  },
  {
    owner: "templog",
    targetCollection: COLLECTIONS.templog.LORA_DEVICES,
    sources: [{ dbName: "kitchenlog", collectionName: "lora_devices" }]
  },
  {
    owner: "templog",
    targetCollection: COLLECTIONS.templog.LORA_GATEWAY_EVENTS,
    sources: [{ dbName: "kitchenlog", collectionName: "lora_gateway_events" }]
  },
  {
    owner: "templog",
    targetCollection: COLLECTIONS.templog.EQUIPMENT_TEMP_READINGS,
    sources: [{ dbName: "kitchenlog", collectionName: "equipment_temp_readings" }]
  },
  {
    owner: "templog",
    targetCollection: COLLECTIONS.templog.EQUIPMENT_TEMP_CONFIGS,
    sources: [{ dbName: "kitchenlog", collectionName: "equipment_temp_configs" }]
  },
  {
    owner: "templog",
    targetCollection: COLLECTIONS.templog.EQUIPMENT_TEMP_ALERTS,
    sources: [{ dbName: "kitchenlog", collectionName: "equipment_temp_alerts" }]
  },
  {
    owner: "templog",
    targetCollection: COLLECTIONS.templog.EQUIPMENT_TEMP_STATES,
    sources: [{ dbName: "kitchenlog", collectionName: "equipment_temp_states" }]
  },
  {
    owner: "templog",
    targetCollection: COLLECTIONS.templog.COOKS_COMBIOVEN,
    sources: [{ dbName: "kitchenlog", collectionName: "cooks_combioven" }]
  },
  {
    owner: "orderManager",
    targetCollection: COLLECTIONS.orderManager.EXTRACTION_RUNS,
    sources: [{ dbName: "kitchenlog", collectionName: "order_manager_extraction_runs" }]
  },
  {
    owner: "orderManager",
    targetCollection: COLLECTIONS.orderManager.JOB_RUNS,
    sources: [{ dbName: "kitchenlog", collectionName: "order_manager_job_runs" }]
  },
  {
    owner: "orderManager",
    targetCollection: COLLECTIONS.orderManager.COOK_SESSIONS,
    sources: [{ dbName: "kitchenlog", collectionName: "order_manager_cook_sessions" }]
  },
  {
    owner: "orderManager",
    targetCollection: COLLECTIONS.orderManager.DEPARTMENTS,
    sources: [{ dbName: "kitchenlog", collectionName: "order_manager_departments" }]
  },
  {
    owner: "orderManager",
    targetCollection: COLLECTIONS.orderManager.DISH_CATALOG,
    sources: [{ dbName: "kitchenlog", collectionName: "order_manager_dish_catalog" }]
  }
];

function getCoreMongoUri() {
  return process.env[DATABASES.core.envUri]
    || process.env[DATABASES.core.fallbackUriEnv]
    || "";
}

function getCoreDbName() {
  const explicitDbName = process.env[DATABASES.core.envDbName];
  if (explicitDbName) {
    return explicitDbName;
  }

  const explicitUri = process.env[DATABASES.core.envUri];
  const explicitUriDbName = parseDbNameFromUri(explicitUri);
  if (explicitUriDbName) {
    return explicitUriDbName;
  }
  if (explicitUri) {
    return DATABASES.core.defaultDbName;
  }

  const legacyUriDbName = parseDbNameFromUri(process.env[DATABASES.core.fallbackUriEnv]);
  return legacyUriDbName || DATABASES.core.fallbackDbName;
}

function getTemplogMongoUri() {
  return process.env[DATABASES.templog.envUri]
    || process.env[DATABASES.templog.fallbackUriEnv]
    || process.env.MONGODB_URI
    || "";
}

function getTemplogDbName() {
  const explicitDbName = process.env[DATABASES.templog.envDbName];
  if (explicitDbName) {
    return explicitDbName;
  }

  const explicitUri = process.env[DATABASES.templog.envUri];
  const explicitUriDbName = parseDbNameFromUri(explicitUri);
  if (explicitUriDbName) {
    return explicitUriDbName;
  }
  if (explicitUri) {
    return DATABASES.templog.defaultDbName;
  }

  return process.env[DATABASES.templog.fallbackDbNameEnv]
    || process.env.MONGODB_DB_NAME
    || parseDbNameFromUri(process.env[DATABASES.templog.fallbackUriEnv])
    || DATABASES.templog.fallbackDbName;
}

function getOrderManagerMongoUri() {
  return process.env[DATABASES.orderManager.envUri]
    || process.env[DATABASES.orderManager.fallbackUriEnv]
    || process.env[DATABASES.orderManager.fallbackFallbackUriEnv]
    || process.env.MONGODB_URI
    || "";
}

function getOrderManagerDbName() {
  const explicitDbName = process.env[DATABASES.orderManager.envDbName];
  if (explicitDbName) {
    return explicitDbName;
  }

  const explicitUri = process.env[DATABASES.orderManager.envUri];
  const explicitUriDbName = parseDbNameFromUri(explicitUri);
  if (explicitUriDbName) {
    return explicitUriDbName;
  }
  if (explicitUri) {
    return DATABASES.orderManager.defaultDbName;
  }

  return process.env[DATABASES.orderManager.fallbackDbNameEnv]
    || parseDbNameFromUri(process.env[DATABASES.orderManager.fallbackUriEnv])
    || process.env[DATABASES.orderManager.fallbackFallbackDbNameEnv]
    || process.env.MONGODB_DB_NAME
    || parseDbNameFromUri(process.env[DATABASES.orderManager.fallbackFallbackUriEnv])
    || DATABASES.orderManager.fallbackDbName;
}

function parseDbNameFromUri(uri) {
  const trimmed = String(uri || "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const withoutQuery = trimmed.split("?")[0];
    const slashIndex = withoutQuery.lastIndexOf("/");
    if (slashIndex < 0) {
      return "";
    }
    const dbName = withoutQuery.slice(slashIndex + 1).trim();
    if (!dbName || dbName.includes(":")) {
      return "";
    }
    return dbName;
  } catch (_) {
    return "";
  }
}

module.exports = {
  COLLECTION_MIGRATION_PLAN,
  COLLECTIONS,
  DATABASES,
  getCoreDbName,
  getCoreMongoUri,
  getOrderManagerDbName,
  getOrderManagerMongoUri,
  getTemplogDbName,
  getTemplogMongoUri
};
