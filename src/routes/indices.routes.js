/**
 * Indices Routes
 * API endpoints for index data (NIFTY, Sensex, BANKNIFTY, etc.)
 */

const express = require('express');
const router = express.Router();
const indicesController = require('../controllers/indices.controller');

// GET /api/indices/groups - Get all groups (indices, sectors, themes)
router.get('/groups', indicesController.getAllGroups.bind(indicesController));

// GET /api/indices/:groupName/constituents - Get constituents for a group (type=index|sector|theme)
router.get('/:groupName/constituents', indicesController.getConstituents.bind(indicesController));

// GET /api/indices/:indexName/stocks - Get list of stocks in index (must be before /:indexName)
router.get('/:indexName/stocks', indicesController.getIndexStocks.bind(indicesController));

// GET /api/indices/:indexName/history - Get index with historical data (must be before /:indexName)
router.get('/:indexName/history', indicesController.getIndexHistory.bind(indicesController));

// GET /api/indices - Get all indices (current values)
router.get('/', indicesController.getAllIndices.bind(indicesController));

// GET /api/indices/:indexName - Get specific index (must be last among param routes)
router.get('/:indexName', indicesController.getIndex.bind(indicesController));

module.exports = router;
