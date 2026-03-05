'use strict';
/**
 * API Route Aggregator
 *
 * All API routers are mounted here under their respective prefixes.
 * server.js mounts this whole file at /api — so each entry below
 * maps to  /api/<prefix>.
 *
 * To add a new module:
 *   1. Create routes/<module>.js
 *   2. Add the router.use() line here
 *   3. Do NOT add individual app.use('/api/...') calls in server.js
 */
const express    = require('express');
const router     = express.Router();
const pushRouter = require('./push');

// Auth & Admin
router.use('/auth',             require('./auth'));
router.use('/admin',            require('./admin'));

// Food Safety
router.use('/foodsafety',       require('./foodsafety'));
router.use('/fhc',              require('./fhc'));

// Maintenance
router.use('/equipment',        require('./equipment'));
router.use('/equipment-issues', require('./equipmentIssues'));
router.use('/maintenance',      require('./maintenance'));
router.use('/records',          require('./maintenance')); // legacy alias — keep for backwards compat
router.use('/issues',           require('./issues'));
router.use('/areas',            require('./areas'));
router.use('/reports',          require('./reports'));
router.use('/notifications',    require('./notifications'));
router.use('/seed',             require('./seed'));

// Push notifications
router.use('/push',             pushRouter);

// Pest Control
router.use('/pest',             require('./pest'));

// Procurement
router.use('/requests',         require('./procurementRequests'));

// Re-export sendPushToPermission so server.js can use it for the templog push trigger
router.sendPushToPermission = pushRouter.sendPushToPermission;

module.exports = router;
