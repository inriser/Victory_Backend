/**
 * Indices Routes
 * API endpoints for index data (NIFTY, Sensex, BANKNIFTY, etc.)
 */

const express = require('express');
const router = express.Router();
const indicesController = require('../controllers/indices.controller');

// GET /api/indices - Get all indices
router.get('/', indicesController.getAllIndices.bind(indicesController));

// GET /api/indices/:indexName - Get specific index
router.get('/:indexName', indicesController.getIndex.bind(indicesController));

// GET /api/indices/:indexName/history - Get index with historical data
router.get('/:indexName/history', indicesController.getIndexHistory.bind(indicesController));

module.exports = router;
