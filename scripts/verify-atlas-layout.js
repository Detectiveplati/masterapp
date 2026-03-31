#!/usr/bin/env node
'use strict';

const {
  closeAllClients,
  countDocumentsSafely,
  getMigrationPlan,
  getTargetDb,
  parseArgs,
  resolveSourceNamespace
} = require('./database-layout-utils');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = getMigrationPlan(options.owner);
  const results = [];
  let hasMismatch = false;

  for (const item of plan) {
    const target = await getTargetDb(item.owner);
    const targetCollection = target.db.collection(item.targetCollection);
    const targetCount = await countDocumentsSafely(targetCollection);

    let sourceTotal = 0;
    const uniqueSourceIds = new Set();
    const sourceBreakdown = [];

    for (const source of item.sources) {
      const resolved = await resolveSourceNamespace(source);
      if (!resolved) {
        sourceBreakdown.push({
          namespace: `${source.dbName}.${source.collectionName}`,
          count: 0,
          found: false
        });
        continue;
      }

      const count = await countDocumentsSafely(resolved.collection);
      sourceTotal += count;
      const idDocuments = await resolved.collection.find({}, { projection: { _id: 1 } }).toArray();
      for (const document of idDocuments) {
        uniqueSourceIds.add(String(document._id));
      }
      sourceBreakdown.push({
        namespace: `${resolved.dbName}.${resolved.collectionName}`,
        count,
        found: true
      });
    }

    const sourceUniqueCount = uniqueSourceIds.size;
    const ok = targetCount >= sourceUniqueCount;
    if (!ok) {
      hasMismatch = true;
    }

    results.push({
      owner: item.owner,
      targetNamespace: `${target.dbName}.${item.targetCollection}`,
      targetCount,
      sourceTotal,
      sourceUniqueCount,
      ok,
      sources: sourceBreakdown
    });
  }

  console.log(JSON.stringify({
    verifiedAt: new Date().toISOString(),
    ok: !hasMismatch,
    results
  }, null, 2));

  if (hasMismatch) {
    process.exitCode = 1;
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
