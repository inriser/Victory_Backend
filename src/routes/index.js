const express = require('express');
// const ort dataCleanupRoutes from './dataCleanup.routes.js';
const healthRoutes = require('./health.routes.js');
const intervalsRoutes = require('./intervals.routes.js');
const marketDataRoutes = require('./marketData.routes.js');
const priceRoutes = require('./price.routes.js');
const statusRoutes = require('./status.routes.js');
const symbolsRoutes = require('./symbols.routes.js');
const moversRoutes = require('./movers.routes.js');
const tradingRoutes = require('./trading.routes.js');
const indicesRoutes = require('./indices.routes.js');

const router = express.Router();

router.use('/api', marketDataRoutes);
router.use('/api', priceRoutes);
// router.use('/api', dataCleanupRoutes);
router.use('/api', statusRoutes);
router.use('/api/symbols', symbolsRoutes);
router.use('/api', intervalsRoutes);
router.use('/api/movers', moversRoutes);
router.use('/api/trading', tradingRoutes);
router.use('/api/indices', indicesRoutes);
router.use('/', healthRoutes);

module.exports = router;

