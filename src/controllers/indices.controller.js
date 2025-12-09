/**
 * Indices Controller
 * Handles API requests for index data (NIFTY, Sensex, BANKNIFTY, etc.)
 */

const indexCalculationService = require('../services/indexCalculation.service');
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
}

module.exports = new IndicesController();
