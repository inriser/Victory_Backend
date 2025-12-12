/**
 * Indices Controller
 * Handles API requests for index data (NIFTY, Sensex, BANKNIFTY, etc.)
 */

const indexCalculationService = require('../services/indexCalculation.service');
const IndicesModel = require('../models/indices.model');
const { logger } = require('../config/logger');

class IndicesController {
    /**
     * GET /api/indices
     * Get all indices with current values
     */
    async getAllIndices(req, res, next) {
        try {
            const indices = await indexCalculationService.calculateAllIndices();

            res.json({
                success: true,
                count: indices.length,
                data: indices,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('[IndicesController] Error fetching all indices:', error);
            next(error);
        }
    }

    /**
     * GET /api/indices/:indexName
     * Get specific index with current value
     */
    async getIndex(req, res, next) {
        try {
            const { indexName } = req.params;
            const index = await indexCalculationService.calculateIndexValue(indexName.toUpperCase());

            res.json({
                success: true,
                data: index
            });
        } catch (error) {
            logger.error(`[IndicesController] Error fetching index ${req.params.indexName}:`, error);
            next(error);
        }
    }

    /**
     * GET /api/indices/:indexName/history
     * Get index with historical data for charts
     */
    async getIndexHistory(req, res, next) {
        try {
            const { indexName } = req.params;
            const { interval = '1d', limit = 30 } = req.query;

            const data = await indexCalculationService.getIndexWithHistory(
                indexName.toUpperCase(),
                interval,
                parseInt(limit)
            );

            res.json({
                success: true,
                data
            });
        } catch (error) {
            logger.error(`[IndicesController] Error fetching index history ${req.params.indexName}:`, error);
            next(error);
        }
    }

    /**
     * GET /api/indices/:indexName/stocks
     * Get list of stocks belonging to an index
     */
    async getIndexStocks(req, res, next) {
        try {
            const { indexName } = req.params;
            const stocks = await IndicesModel.getIndexStocks(indexName);

            res.json({
                success: true,
                index: indexName.toUpperCase(),
                count: stocks.length,
                data: stocks.map(s => s.symbol) // Return array of symbols
            });
        } catch (error) {
            logger.error(`[IndicesController] Error fetching stocks for ${req.params.indexName}:`, error);
            next(error);
        }
    }

    /**
     * GET /api/indices/groups
     * Get all available indices, sectors, and themes
     */
    async getAllGroups(req, res, next) {
        try {
            const groups = await IndicesModel.getAllGroups();

            res.json({
                success: true,
                data: groups
            });
        } catch (error) {
            logger.error('[IndicesController] Error fetching groups:', error);
            next(error);
        }
    }

    /**
     * GET /api/indices/:groupName/constituents
     * Get constituent stocks for any index/sector/theme
     */
    async getConstituents(req, res, next) {
        try {
            const { groupName } = req.params;
            const { type = 'index', exchange } = req.query;

            const constituents = await IndicesModel.getConstituents(groupName, type, exchange);

            res.json({
                success: true,
                group: groupName,
                type,
                count: constituents.length,
                data: constituents
            });
        } catch (error) {
            logger.error(`[IndicesController] Error fetching constituents for ${req.params.groupName}:`, error);
            next(error);
        }
    }
}

module.exports = new IndicesController();
