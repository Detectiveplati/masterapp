const express = require("express");

const {
  getRetentionSampleById,
  getRetentionSampleConfig,
  listRetentionSamples,
  transitionRetentionSample,
  updateRetentionSampleConfig
} = require("./retentionSampleStore");

function createRetentionSampleRouter() {
  const router = express.Router();

  router.get("/", async (req, res) => {
    try {
      const samples = await listRetentionSamples({
        date: req.query.date || req.query.reportDate || "",
        station: req.query.station || "",
        status: req.query.status || ""
      });
      res.json(samples);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load retention sample tasks." });
    }
  });

  router.get("/config", async (_req, res) => {
    try {
      res.json(await getRetentionSampleConfig());
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load retention sample config." });
    }
  });

  router.put("/config", express.json(), async (req, res) => {
    try {
      res.json(await updateRetentionSampleConfig(req.body || {}));
    } catch (error) {
      res.status(400).json({ error: error.message || "Could not update retention sample config." });
    }
  });

  router.get("/:sampleId", async (req, res) => {
    try {
      const sample = await getRetentionSampleById(req.params.sampleId);
      if (!sample) {
        return res.status(404).json({ error: "Retention sample task not found." });
      }
      res.json(sample);
    } catch (error) {
      res.status(500).json({ error: error.message || "Could not load retention sample task." });
    }
  });

  for (const action of ["collect", "store", "dispose", "miss", "cancel"]) {
    router.post(`/:sampleId/${action}`, express.json(), async (req, res) => {
      try {
        const sample = await transitionRetentionSample(req.params.sampleId, action, req.body || {});
        res.json(sample);
      } catch (error) {
        const message = error.message || `Could not ${action} retention sample task.`;
        const statusCode = /not found/i.test(message) ? 404 : /invalid/i.test(message) ? 400 : 500;
        res.status(statusCode).json({ error: message });
      }
    });
  }

  return router;
}

module.exports = {
  createRetentionSampleRouter
};
