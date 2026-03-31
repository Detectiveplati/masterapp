#!/usr/bin/env node
'use strict';

const {
  closeAllClients,
  countDocumentsSafely,
  getMigrationPlan,
  getTargetDb,
  normalizeIndexSpec,
  parseArgs,
  resolveSourceNamespace
} = require('./database-layout-utils');

const BATCH_SIZE = 250;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = getMigrationPlan(options.owner);
  const results = [];

  for (const item of plan) {
    const target = await getTargetDb(item.owner);
    const targetNamespace = `${target.dbName}.${item.targetCollection}`;
    const targetCollection = target.db.collection(item.targetCollection);
    const indexMap = new Map();
    let sourceTotal = 0;
    let copiedCount = 0;

    const sourceResults = [];

    for (const source of item.sources) {
      const resolved = await resolveSourceNamespace(source);
      const sourceNamespace = `${source.dbName}.${source.collectionName}`;
      if (!resolved) {
        sourceResults.push({
          namespace: sourceNamespace,
          count: 0,
          copied: 0,
          status: 'missing'
        });
        continue;
      }

      const count = await countDocumentsSafely(resolved.collection);
      sourceTotal += count;

      const sameNamespace = sourceNamespace === targetNamespace;
      const sourceResult = {
        namespace: sourceNamespace,
        count,
        copied: 0,
        status: sameNamespace ? 'same-namespace' : options.execute ? 'copied' : 'dry-run'
      };

      if (!sameNamespace) {
        const indexes = await resolved.collection.indexes();
        for (const index of indexes) {
          if (index.name === '_id_') {
            continue;
          }
          indexMap.set(index.name, normalizeIndexSpec(index));
        }
      }

      if (options.execute && !sameNamespace && count > 0) {
        const cursor = resolved.collection.find({});
        let operations = [];

        while (await cursor.hasNext()) {
          const document = await cursor.next();
          operations.push({
            replaceOne: {
              filter: { _id: document._id },
              replacement: document,
              upsert: true
            }
          });

          if (operations.length >= BATCH_SIZE) {
            const result = await targetCollection.bulkWrite(operations, { ordered: false });
            copiedCount += result.upsertedCount + result.modifiedCount + result.matchedCount;
            sourceResult.copied += operations.length;
            operations = [];
          }
        }

        if (operations.length) {
          const result = await targetCollection.bulkWrite(operations, { ordered: false });
          copiedCount += result.upsertedCount + result.modifiedCount + result.matchedCount;
          sourceResult.copied += operations.length;
        }
      }

      sourceResults.push(sourceResult);
    }

    if (options.execute && indexMap.size) {
      await targetCollection.createIndexes(Array.from(indexMap.values()));
    }

    results.push({
      owner: item.owner,
      targetNamespace,
      sourceTotal,
      targetCount: await countDocumentsSafely(targetCollection),
      copiedCount,
      execute: options.execute,
      sources: sourceResults
    });
  }

  console.log(JSON.stringify({
    migratedAt: new Date().toISOString(),
    execute: options.execute,
    results
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllClients();
  });
