const { MongoClient } = require("mongodb");
const { getOrderManagerDbName, getOrderManagerMongoUri } = require("../../config/databaseLayout");

let clientPromise = null;

function getMongoUri() {
  const configuredUri = getOrderManagerMongoUri();

  if (configuredUri) {
    return configuredUri;
  }

  if (isProductionEnv()) {
    return "";
  }

  return "mongodb://localhost:27017";
}

function getDbName() {
  return getOrderManagerDbName();
}

async function getDb() {
  if (!clientPromise) {
    const mongoUri = getMongoUri();
    if (!mongoUri) {
      throw new Error("Order manager MongoDB URI is not configured. Set MASTERAPP_ORDER_MANAGER_MONGODB_URI, ORDER_MANAGER_MONGODB_URI, or TEMPLOG_MONGODB_URI.");
    }
    clientPromise = MongoClient.connect(mongoUri, getMongoClientOptions(mongoUri)).catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  const client = await clientPromise;
  return client.db(getDbName());
}

async function closeDb() {
  if (!clientPromise) {
    return;
  }

  const client = await clientPromise;
  await client.close();
  clientPromise = null;
}

module.exports = {
  closeDb,
  getDb,
  getDbName,
  getMongoClientOptions,
  getMongoUri,
  isProductionEnv
};

function getMongoClientOptions(mongoUri = getMongoUri()) {
  const options = {
    appName: process.env.ORDER_MANAGER_MONGODB_APP_NAME || "masterapp-order-manager",
    maxPoolSize: parsePositiveInteger(process.env.ORDER_MANAGER_MONGODB_MAX_POOL_SIZE, 20),
    minPoolSize: parsePositiveInteger(process.env.ORDER_MANAGER_MONGODB_MIN_POOL_SIZE, 0),
    maxIdleTimeMS: parsePositiveInteger(process.env.ORDER_MANAGER_MONGODB_MAX_IDLE_MS, 30000),
    serverSelectionTimeoutMS: parsePositiveInteger(process.env.ORDER_MANAGER_MONGODB_SERVER_SELECTION_TIMEOUT_MS, 10000),
    connectTimeoutMS: parsePositiveInteger(process.env.ORDER_MANAGER_MONGODB_CONNECT_TIMEOUT_MS, 10000),
    socketTimeoutMS: parsePositiveInteger(process.env.ORDER_MANAGER_MONGODB_SOCKET_TIMEOUT_MS, 45000)
  };

  if (String(mongoUri || "").startsWith("mongodb+srv://")) {
    options.serverApi = {
      version: "1",
      strict: false,
      deprecationErrors: false
    };
  }

  return options;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function isProductionEnv() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}
