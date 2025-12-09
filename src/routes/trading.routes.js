const express = require('express');
const TradingController = require('../controllers/trading.controller.js');

const router = express.Router();

/**
 * Trading Routes
 * Base Path: /api/trading
 */

router.get('/watchlist', TradingController.getWatchlist);
router.get('/exchanges', TradingController.getExchanges);
router.get('/script-types', TradingController.getScriptTypes);
router.get('/ohlc', TradingController.getOHLC);

module.exports = router;
