const { COLLECTIONS } = require("../../config/databaseLayout");
const { getDb } = require("./db");

let indexPromise = null;
const JOB_LEASE_MS = 90 * 60 * 1000;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection(COLLECTIONS.orderManager.JOB_RUNS);
  if (!indexPromise) {
    indexPromise = collection.createIndexes([
      { key: { jobKey: 1, scheduledFor: 1 }, unique: true },
      { key: { status: 1, startedAt: -1 } },
      { key: { status: 1, leaseExpiresAt: 1 } }
    ]);
  }
  await indexPromise;
  return collection;
}

async function acquireScheduledJobLock(jobKey, scheduledFor) {
  const collection = await getCollection();
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + JOB_LEASE_MS).toISOString();
  const startedAt = now.toISOString();

  try {
    await collection.insertOne({
      jobKey,
      scheduledFor,
      status: "running",
      startedAt,
      leaseExpiresAt,
      finishedAt: "",
      error: ""
    });
    return true;
  } catch (error) {
    if (!error || error.code !== 11000) {
      throw error;
    }

    const staleRecovery = await collection.updateOne(
      {
        jobKey,
        scheduledFor,
        status: "running",
        leaseExpiresAt: { $lt: startedAt }
      },
      {
        $set: {
          status: "running",
          startedAt,
          leaseExpiresAt,
          finishedAt: "",
          error: ""
        }
      }
    );

    return staleRecovery.modifiedCount > 0;
  }
}

async function markScheduledJobSucceeded(jobKey, scheduledFor, meta = {}) {
  const collection = await getCollection();
  await collection.updateOne(
    { jobKey, scheduledFor },
    {
      $set: {
        status: "succeeded",
        finishedAt: new Date().toISOString(),
        leaseExpiresAt: "",
        result: meta
      }
    }
  );
}

async function markScheduledJobFailed(jobKey, scheduledFor, errorMessage) {
  const collection = await getCollection();
  await collection.updateOne(
    { jobKey, scheduledFor },
    {
      $set: {
        status: "failed",
        finishedAt: new Date().toISOString(),
        leaseExpiresAt: "",
        error: String(errorMessage || "")
      }
    }
  );
}

module.exports = {
  acquireScheduledJobLock,
  markScheduledJobFailed,
  markScheduledJobSucceeded
};
