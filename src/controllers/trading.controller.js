const { asyncHandler } = require('../utils/asyncHandler.js');
const TradingModel = require('../models/trading.model.js');

/**
 * trading.controller.js
 * 
 * Logic to handle requests for trading data.
 * Validates inputs and interacts with the TradingModel.
 */

const TradingController = {
    /**
     * GET /api/trading/watchlist
     * Returns list of 50 Nifty stocks
     */
    getWatchlist: asyncHandler(async (req, res) => {
        const stocks = await TradingModel.getWatchlist();
        res.json({
            success: true,
            count: stocks.length,
            data: stocks
        });
    }),

    /**
     * GET /api/trading/exchanges
     * Returns list of exchanges
     */
    getExchanges: asyncHandler(async (req, res) => {
        const exchanges = await TradingModel.getExchanges();
        res.json({
            success: true,
            data: exchanges
        });
    }),

    /**
     * GET /api/trading/script-types
     * Returns list of script types (EQ, FUT, etc.)
     */
    getScriptTypes: asyncHandler(async (req, res) => {
        const types = await TradingModel.getScriptTypes();
        res.json({
            success: true,
            data: types
        });
    }),

    /**
     * GET /api/trading/ohlc
     * Query params: symbol, interval (1m, 5m, 1d), limit
     */
    getOHLC: asyncHandler(async (req, res) => {
        const { symbol, interval, limit } = req.query;

        if (!symbol) {
            return res.status(400).json({
                success: false,
                message: 'Symbol is required'
            });
        }

        const candles = await TradingModel.getOHLC({
            symbol,
            interval: interval || '1d',
            limit: parseInt(limit) || 100
        });

        res.json({
            success: true,
            symbol,
            interval: interval || '1d',
            count: candles.length,
            data: candles
        });
    })
};

module.exports = TradingController;
