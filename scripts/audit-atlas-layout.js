#!/usr/bin/env node
'use strict';

const {
  closeAllClients,
  countDocumentsSafely,
  getMigrationPlan,
  getSourceClients,
  getTargetDb,
  parseArgs,
  resolveSourceNamespace
} = require('./database-layout-utils');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceClients = await getSourceClients();
  const targetCache = new Map();
  const plan = getMigrationPlan(options.owner);

  const payload = {
    auditedAt: new Date().toISOString(),
    sources: [],
    targets: [],
    plan: []
  };

  for (const sourceEntry of sourceClients) {
    const adminDb = sourceEntry.client.db().admin();
    const databases = await adminDb.listDatabases();
    payload.sources.push({
      client: sourceEntry.key,
      databases: databases.databases.map((database) => ({
        name: database.name,
        sizeOnDisk: database.sizeOnDisk || 0,
        empty: Boolean(database.empty)
      }))
    });
  }

  for (const item of plan) {
    if (!targetCache.has(item.owner)) {
      targetCache.set(item.owner, await getTargetDb(item.owner));
    }
    const target = targetCache.get(item.owner);
    const targetCollection = target.db.collection(item.targetCollection);
    const targetCount = await countDocumentsSafely(targetCollection);

    const sources = [];
    let sourceCount = 0;
    for (const source of item.sources) {
      const resolved = await resolveSourceNamespace(source);
      if (!resolved) {
        sources.push({
          namespace: `${source.dbName}.${source.collectionName}`,
          found: false,
          count: 0
        });
        continue;
      }

      const count = await countDocumentsSafely(resolved.collection);
      sourceCount += count;
      sources.push({
        namespace: `${resolved.dbName}.${resolved.collectionName}`,
        found: true,
        count
      });
    }

    payload.plan.push({
      owner: item.owner,
      targetDbName: target.dbName,
      targetCollection: item.targetCollection,
      targetCount,
      sourceCount,
      sources
    });
  }

  payload.targets = Array.from(targetCache.entries()).map(([owner, target]) => ({
    owner,
    dbName: target.dbName
  }));

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(`Atlas layout audit: ${payload.auditedAt}`);
  console.log('');
  for (const sourceEntry of payload.sources) {
    console.log(`[${sourceEntry.client}] databases`);
    for (const database of sourceEntry.databases) {
      console.log(`  - ${database.name} (${database.empty ? 'empty' : `${database.sizeOnDisk} bytes`})`);
    }
    console.log('');
  }

  for (const entry of payload.plan) {
    console.log(`${entry.owner} -> ${entry.targetDbName}.${entry.targetCollection}`);
    console.log(`  target count: ${entry.targetCount}`);
    console.log(`  source total: ${entry.sourceCount}`);
    for (const source of entry.sources) {
      console.log(`  source: ${source.namespace} | ${source.found ? source.count : 'missing'}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllClients();
  });
