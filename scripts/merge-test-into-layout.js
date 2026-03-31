#!/usr/bin/env node
'use strict';

const {
  closeAllClients,
  getTargetDb,
  parseArgs
} = require('./database-layout-utils');

const { MongoClient, BSON } = require('mongodb');
const {
  COLLECTIONS,
  getCoreMongoUri
} = require('../config/databaseLayout');

const SOURCE_DB_NAME = 'test';

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const skipTempMonReadings = process.argv.includes('--skip-tempmon-readings');
  const sourceUri = process.env.TEST_MONGODB_URI || getCoreMongoUri();
  if (!sourceUri) {
    throw new Error('No MongoDB URI configured for test merge.');
  }

  const sourceClient = await MongoClient.connect(sourceUri, getMongoClientOptions(sourceUri));
  const sourceDb = sourceClient.db(SOURCE_DB_NAME);
  const coreTarget = await getTargetDb('core');
  const coreDb = coreTarget.db;

  const summary = {
    mergedAt: new Date().toISOString(),
    sourceDb: SOURCE_DB_NAME,
    targetDb: coreDb.databaseName,
    execute: options.execute,
    collections: {}
  };

  const unitIdMap = new Map();
  const deviceIdMap = new Map();
  const readingIdMap = new Map();
  const alertIdMap = new Map();
  const maintenanceRecordIdMap = new Map();
  const pestSessionIdMap = new Map();
  const pestStationIdMap = new Map();

  summary.collections[COLLECTIONS.core.USERS] = await mergeByBusinessKey({
    sourceCollection: sourceDb.collection('users'),
    targetCollection: coreDb.collection(COLLECTIONS.core.USERS),
    businessKeyBuilder: (doc) => ({ username: doc.username }),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.PUSH_SUBSCRIPTIONS] = await mergeByBusinessKey({
    sourceCollection: sourceDb.collection('pushsubscriptions'),
    targetCollection: coreDb.collection(COLLECTIONS.core.PUSH_SUBSCRIPTIONS),
    businessKeyBuilder: (doc) => ({ endpoint: doc.endpoint }),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.PROCUREMENT_REQUESTS] = await mergeById({
    sourceCollection: sourceDb.collection('procurementrequests'),
    targetCollection: coreDb.collection(COLLECTIONS.core.PROCUREMENT_REQUESTS),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.NOTIFICATIONS] = await mergeById({
    sourceCollection: sourceDb.collection('notifications'),
    targetCollection: coreDb.collection(COLLECTIONS.core.NOTIFICATIONS),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.EQUIPMENT] = await mergeById({
    sourceCollection: sourceDb.collection('equipment'),
    targetCollection: coreDb.collection(COLLECTIONS.core.EQUIPMENT),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.EQUIPMENT_ISSUES] = await mergeById({
    sourceCollection: sourceDb.collection('equipmentissues'),
    targetCollection: coreDb.collection(COLLECTIONS.core.EQUIPMENT_ISSUES),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.MAINTENANCE_RECORDS] = await mergeById({
    sourceCollection: sourceDb.collection('maintenancerecords'),
    targetCollection: coreDb.collection(COLLECTIONS.core.MAINTENANCE_RECORDS),
    execute: options.execute,
    onMerged: (sourceDoc, targetDoc) => {
      maintenanceRecordIdMap.set(String(sourceDoc._id), targetDoc._id);
    }
  });

  summary.collections[COLLECTIONS.core.AREAS] = await mergeByBusinessKey({
    sourceCollection: sourceDb.collection('areas'),
    targetCollection: coreDb.collection(COLLECTIONS.core.AREAS),
    businessKeyBuilder: (doc) => ({ areaId: doc.areaId }),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.AREA_ISSUES] = await mergeAreaIssues({
    sourceCollection: sourceDb.collection('areaissues'),
    targetCollection: coreDb.collection(COLLECTIONS.core.AREA_ISSUES),
    maintenanceRecordIdMap,
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.FOOD_SAFETY_NCS] = await mergeById({
    sourceCollection: sourceDb.collection('foodsafetyncs'),
    targetCollection: coreDb.collection(COLLECTIONS.core.FOOD_SAFETY_NCS),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.FOOD_HANDLER_CERTS] = await mergeById({
    sourceCollection: sourceDb.collection('foodhandlercerts'),
    targetCollection: coreDb.collection(COLLECTIONS.core.FOOD_HANDLER_CERTS),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.ISO_EMPLOYEES] = await mergeById({
    sourceCollection: sourceDb.collection('isoemployees'),
    targetCollection: coreDb.collection(COLLECTIONS.core.ISO_EMPLOYEES),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.ISO_RECORDS] = await mergeById({
    sourceCollection: sourceDb.collection('isorecords'),
    targetCollection: coreDb.collection(COLLECTIONS.core.ISO_RECORDS),
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.PEST_SESSIONS] = await mergeById({
    sourceCollection: sourceDb.collection('pestsessions'),
    targetCollection: coreDb.collection(COLLECTIONS.core.PEST_SESSIONS),
    execute: options.execute,
    onMerged: (sourceDoc, targetDoc) => {
      pestSessionIdMap.set(String(sourceDoc._id), targetDoc._id);
    }
  });

  summary.collections[COLLECTIONS.core.PEST_STATIONS] = await mergeByBusinessKey({
    sourceCollection: sourceDb.collection('peststations'),
    targetCollection: coreDb.collection(COLLECTIONS.core.PEST_STATIONS),
    businessKeyBuilder: (doc) => ({ rtsNo: doc.rtsNo }),
    execute: options.execute,
    onMerged: (sourceDoc, targetDoc) => {
      pestStationIdMap.set(String(sourceDoc._id), targetDoc._id);
    }
  });

  summary.collections[COLLECTIONS.core.PEST_FINDINGS] = await mergePestFindings({
    sourceCollection: sourceDb.collection('pestfindings'),
    targetCollection: coreDb.collection(COLLECTIONS.core.PEST_FINDINGS),
    pestSessionIdMap,
    pestStationIdMap,
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.TEMP_MON_UNITS] = await mergeTempMonUnits({
    sourceCollection: sourceDb.collection('tempmonunits'),
    targetCollection: coreDb.collection(COLLECTIONS.core.TEMP_MON_UNITS),
    unitIdMap,
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.TEMP_MON_DEVICES] = await mergeTempMonDevices({
    sourceCollection: sourceDb.collection('tempmondevices'),
    targetCollection: coreDb.collection(COLLECTIONS.core.TEMP_MON_DEVICES),
    unitIdMap,
    deviceIdMap,
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.TEMP_MON_CONFIGS] = await mergeByBusinessKey({
    sourceCollection: sourceDb.collection('tempmonconfigs'),
    targetCollection: coreDb.collection(COLLECTIONS.core.TEMP_MON_CONFIGS),
    businessKeyBuilder: (doc) => ({ key: doc.key }),
    execute: options.execute
  });

  if (skipTempMonReadings) {
    summary.collections[COLLECTIONS.core.TEMP_MON_READINGS] = {
      skipped: true
    };
  } else {
    summary.collections[COLLECTIONS.core.TEMP_MON_READINGS] = await mergeTempMonReadings({
      sourceCollection: sourceDb.collection('tempmonreadings'),
      targetCollection: coreDb.collection(COLLECTIONS.core.TEMP_MON_READINGS),
      unitIdMap,
      deviceIdMap,
      readingIdMap,
      execute: options.execute
    });
  }

  summary.collections[COLLECTIONS.core.TEMP_MON_ALERTS] = await mergeTempMonAlerts({
    sourceCollection: sourceDb.collection('tempmonalerts'),
    targetCollection: coreDb.collection(COLLECTIONS.core.TEMP_MON_ALERTS),
    unitIdMap,
    deviceIdMap,
    readingIdMap,
    alertIdMap,
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.TEMP_MON_CALIBRATIONS] = await mergeTempMonCalibrations({
    sourceCollection: sourceDb.collection('tempmoncalibrations'),
    targetCollection: coreDb.collection(COLLECTIONS.core.TEMP_MON_CALIBRATIONS),
    deviceIdMap,
    execute: options.execute
  });

  summary.collections[COLLECTIONS.core.TEMP_MON_CORRECTIVE_ACTIONS] = await mergeTempMonCorrectiveActions({
    sourceCollection: sourceDb.collection('tempmoncorrectiveactions'),
    targetCollection: coreDb.collection(COLLECTIONS.core.TEMP_MON_CORRECTIVE_ACTIONS),
    unitIdMap,
    alertIdMap,
    execute: options.execute
  });

  console.log(JSON.stringify(summary, null, 2));

  await sourceClient.close();
}

async function mergeById({ sourceCollection, targetCollection, execute, transformDocument = null, onMerged = null }) {
  const docs = await sourceCollection.find({}).toArray();
  let inserted = 0;
  let matched = 0;
  for (const doc of docs) {
    const nextDoc = transformDocument ? await transformDocument(doc) : doc;
    if (!nextDoc) {
      continue;
    }
    const existing = await targetCollection.findOne({ _id: nextDoc._id }, { projection: { _id: 1 } });
    if (existing) {
      matched += 1;
      if (onMerged) {
        onMerged(doc, existing);
      }
      continue;
    }
    if (execute) {
      await targetCollection.insertOne(nextDoc);
    }
    inserted += 1;
    if (onMerged) {
      onMerged(doc, nextDoc);
    }
  }
  return { sourceCount: docs.length, inserted, matched };
}

async function mergeByBusinessKey({ sourceCollection, targetCollection, businessKeyBuilder, execute, transformDocument = null, onMerged = null }) {
  const docs = await sourceCollection.find({}).toArray();
  let inserted = 0;
  let updated = 0;
  for (const doc of docs) {
    const nextDoc = transformDocument ? await transformDocument(doc) : cloneDocument(doc);
    if (!nextDoc) {
      continue;
    }
    const businessKey = businessKeyBuilder(nextDoc);
    const existing = await targetCollection.findOne(businessKey, { projection: { _id: 1 } });
    if (existing) {
      if (execute) {
        const replacement = { ...nextDoc, _id: existing._id };
        await targetCollection.replaceOne({ _id: existing._id }, replacement, { upsert: true });
      }
      updated += 1;
      if (onMerged) {
        onMerged(doc, { _id: existing._id });
      }
      continue;
    }
    if (execute) {
      await targetCollection.insertOne(nextDoc);
    }
    inserted += 1;
    if (onMerged) {
      onMerged(doc, nextDoc);
    }
  }
  return { sourceCount: docs.length, inserted, updated };
}

async function mergeAreaIssues({ sourceCollection, targetCollection, maintenanceRecordIdMap, execute }) {
  return mergeById({
    sourceCollection,
    targetCollection,
    execute,
    transformDocument: async (doc) => {
      const nextDoc = cloneDocument(doc);
      if (Array.isArray(nextDoc.relatedMaintenanceRecords)) {
        nextDoc.relatedMaintenanceRecords = nextDoc.relatedMaintenanceRecords
          .map((id) => maintenanceRecordIdMap.get(String(id)) || id);
      }
      return nextDoc;
    }
  });
}

async function mergePestFindings({ sourceCollection, targetCollection, pestSessionIdMap, pestStationIdMap, execute }) {
  return mergeById({
    sourceCollection,
    targetCollection,
    execute,
    transformDocument: async (doc) => {
      const nextDoc = cloneDocument(doc);
      nextDoc.sessionId = pestSessionIdMap.get(String(doc.sessionId)) || doc.sessionId;
      nextDoc.stationId = pestStationIdMap.get(String(doc.stationId)) || doc.stationId;
      return nextDoc;
    }
  });
}

async function mergeTempMonUnits({ sourceCollection, targetCollection, unitIdMap, execute }) {
  return mergeByBusinessKey({
    sourceCollection,
    targetCollection,
    execute,
    businessKeyBuilder: (doc) => ({ name: doc.name }),
    onMerged: (sourceDoc, targetDoc) => {
      unitIdMap.set(String(sourceDoc._id), targetDoc._id);
    }
  });
}

async function mergeTempMonDevices({ sourceCollection, targetCollection, unitIdMap, deviceIdMap, execute }) {
  return mergeByBusinessKey({
    sourceCollection,
    targetCollection,
    execute,
    businessKeyBuilder: (doc) => ({ deviceId: doc.deviceId }),
    transformDocument: async (doc) => {
      const nextDoc = cloneDocument(doc);
      nextDoc.unit = unitIdMap.get(String(doc.unit)) || doc.unit;
      return nextDoc;
    },
    onMerged: (sourceDoc, targetDoc) => {
      deviceIdMap.set(String(sourceDoc._id), targetDoc._id);
    }
  });
}

async function mergeTempMonReadings({ sourceCollection, targetCollection, unitIdMap, deviceIdMap, readingIdMap, execute }) {
  const docs = await sourceCollection.find({}).toArray();
  let inserted = 0;
  let matched = 0;
  for (const doc of docs) {
    const nextDoc = cloneDocument(doc);
    nextDoc.unit = unitIdMap.get(String(doc.unit)) || doc.unit;
    nextDoc.device = deviceIdMap.get(String(doc.device)) || doc.device;
    const filter = {
      device: nextDoc.device,
      recordedAt: nextDoc.recordedAt,
      value: nextDoc.value
    };
    const existing = await targetCollection.findOne(filter, { projection: { _id: 1 } });
    if (existing) {
      matched += 1;
      readingIdMap.set(String(doc._id), existing._id);
      continue;
    }
    if (execute) {
      await targetCollection.insertOne(nextDoc);
    }
    inserted += 1;
    readingIdMap.set(String(doc._id), nextDoc._id);
  }
  return { sourceCount: docs.length, inserted, matched };
}

async function mergeTempMonAlerts({ sourceCollection, targetCollection, unitIdMap, deviceIdMap, readingIdMap, alertIdMap, execute }) {
  return mergeById({
    sourceCollection,
    targetCollection,
    execute,
    transformDocument: async (doc) => {
      const nextDoc = cloneDocument(doc);
      nextDoc.unit = unitIdMap.get(String(doc.unit)) || doc.unit;
      nextDoc.device = deviceIdMap.get(String(doc.device)) || doc.device;
      nextDoc.reading = doc.reading ? (readingIdMap.get(String(doc.reading)) || null) : doc.reading;
      return nextDoc;
    },
    onMerged: (sourceDoc, targetDoc) => {
      alertIdMap.set(String(sourceDoc._id), targetDoc._id);
    }
  });
}

async function mergeTempMonCalibrations({ sourceCollection, targetCollection, deviceIdMap, execute }) {
  return mergeById({
    sourceCollection,
    targetCollection,
    execute,
    transformDocument: async (doc) => {
      const nextDoc = cloneDocument(doc);
      nextDoc.device = deviceIdMap.get(String(doc.device)) || doc.device;
      return nextDoc;
    }
  });
}

async function mergeTempMonCorrectiveActions({ sourceCollection, targetCollection, unitIdMap, alertIdMap, execute }) {
  return mergeByBusinessKey({
    sourceCollection,
    targetCollection,
    execute,
    businessKeyBuilder: (doc) => ({ alert: alertIdMap.get(String(doc.alert)) || doc.alert }),
    transformDocument: async (doc) => {
      const nextDoc = cloneDocument(doc);
      nextDoc.unit = unitIdMap.get(String(doc.unit)) || doc.unit;
      nextDoc.alert = alertIdMap.get(String(doc.alert)) || doc.alert;
      return nextDoc;
    }
  });
}

function cloneDocument(doc) {
  return BSON.EJSON.deserialize(BSON.EJSON.serialize(doc));
}

function getMongoClientOptions(uri) {
  if (String(uri || '').startsWith('mongodb+srv://') || String(uri || '').includes('mongodb.net')) {
    return {
      serverApi: {
        version: '1',
        strict: false,
        deprecationErrors: false
      }
    };
  }
  return {};
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllClients();
  });
