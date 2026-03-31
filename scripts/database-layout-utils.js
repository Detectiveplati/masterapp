#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { MongoClient } = require('mongodb');
const {
  COLLECTION_MIGRATION_PLAN,
  getCoreDbName,
  getCoreMongoUri,
  getOrderManagerDbName,
  getOrderManagerMongoUri,
  getTemplogDbName,
  getTemplogMongoUri
} = require('../config/databaseLayout');

const clientCache = new Map();
const namespaceCache = new Map();

function parseArgs(argv) {
  const options = {
    execute: false,
    json: false,
    owner: '',
    limit: 0
  };

  for (const rawArg of Array.isArray(argv) ? argv : []) {
    const arg = String(rawArg || '').trim();
    if (!arg) {
      continue;
    }
    if (arg === '--execute') {
      options.execute = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg.startsWith('--owner=')) {
      options.owner = arg.split('=').slice(1).join('=').trim();
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const limit = Number(arg.split('=').slice(1).join('=').trim());
      options.limit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0;
    }
  }

  return options;
}

function getMigrationPlan(owner = '') {
  const normalizedOwner = String(owner || '').trim();
  if (!normalizedOwner) {
    return COLLECTION_MIGRATION_PLAN.slice();
  }
  return COLLECTION_MIGRATION_PLAN.filter((item) => item.owner === normalizedOwner);
}

function getTargetDbConfig(owner) {
  if (owner === 'core') {
    return { uri: getCoreMongoUri(), dbName: getCoreDbName() };
  }
  if (owner === 'templog') {
    return { uri: getTemplogMongoUri(), dbName: getTemplogDbName() };
  }
  if (owner === 'orderManager') {
    return { uri: getOrderManagerMongoUri(), dbName: getOrderManagerDbName() };
  }
  throw new Error(`Unknown database owner: ${owner}`);
}

function getCandidateSourceUris() {
  return Array.from(new Set(
    [
      getCoreMongoUri(),
      getTemplogMongoUri(),
      getOrderManagerMongoUri(),
      process.env.MONGODB_URI
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
}

async function getClient(uri, label) {
  const cacheKey = `${label}:${uri}`;
  if (!clientCache.has(cacheKey)) {
    clientCache.set(
      cacheKey,
      MongoClient.connect(uri, getMongoClientOptions(uri)).catch((error) => {
        clientCache.delete(cacheKey);
        throw error;
      })
    );
  }
  return clientCache.get(cacheKey);
}

async function getSourceClients() {
  const uris = getCandidateSourceUris();
  const clients = [];

  for (let index = 0; index < uris.length; index += 1) {
    const uri = uris[index];
    const client = await getClient(uri, `source-${index + 1}`);
    clients.push({
      key: `source-${index + 1}`,
      uri,
      client
    });
  }

  return clients;
}

async function getTargetDb(owner) {
  const config = getTargetDbConfig(owner);
  if (!config.uri) {
    throw new Error(`No MongoDB URI configured for ${owner}.`);
  }
  const client = await getClient(config.uri, `target-${owner}`);
  return {
    client,
    db: client.db(config.dbName),
    dbName: config.dbName,
    uri: config.uri
  };
}

async function resolveSourceNamespace(source) {
  const namespaceKey = `${source.dbName}.${source.collectionName}`;
  if (namespaceCache.has(namespaceKey)) {
    return namespaceCache.get(namespaceKey);
  }

  const sourceClients = await getSourceClients();
  for (const entry of sourceClients) {
    const db = entry.client.db(source.dbName);
    const collections = await db.listCollections({ name: source.collectionName }, { nameOnly: true }).toArray();
    if (collections.length) {
      const resolved = {
        clientKey: entry.key,
        uri: entry.uri,
        db,
        collection: db.collection(source.collectionName),
        dbName: source.dbName,
        collectionName: source.collectionName
      };
      namespaceCache.set(namespaceKey, resolved);
      return resolved;
    }
  }

  namespaceCache.set(namespaceKey, null);
  return null;
}

async function countDocumentsSafely(collection) {
  try {
    return await collection.countDocuments();
  } catch (_) {
    return 0;
  }
}

async function closeAllClients() {
  const promises = Array.from(clientCache.values());
  clientCache.clear();
  namespaceCache.clear();
  await Promise.allSettled(promises.map(async (clientPromise) => {
    const client = await clientPromise;
    await client.close();
  }));
}

function getMongoClientOptions(uri) {
  if (String(uri || '').startsWith('mongodb+srv://')) {
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

function normalizeIndexSpec(index) {
  const normalized = {
    key: index.key
  };

  for (const [field, value] of Object.entries(index)) {
    if (['v', 'ns', 'background', 'key'].includes(field)) {
      continue;
    }
    if (field === 'name' || field === 'unique' || field === 'sparse' || field === 'expireAfterSeconds' || field === 'partialFilterExpression') {
      normalized[field] = value;
    }
  }

  return normalized;
}

module.exports = {
  closeAllClients,
  countDocumentsSafely,
  getMigrationPlan,
  getSourceClients,
  getTargetDb,
  normalizeIndexSpec,
  parseArgs,
  resolveSourceNamespace
};
