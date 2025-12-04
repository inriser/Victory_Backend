const { getAllIntervalsData, getIntervalData } = require('../services/marketData/intervalCandles.service.js');
const { asyncHandler } = require('../utils/asyncHandler.js');

const fetchIntervalData = asyncHandler(async (req, res) => {
  const { symbol, interval, limit } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  if (!interval || interval === "undefined" || interval === "null" || interval.trim() === "") {
    return res.status(400).json({ error: 'Interval is required (1m, 5m, 15m, 1h, 1d, 1w)' });
  }

  const parsedLimit = limit ? parseInt(limit, 10) : 100;

  const data = await getIntervalData(symbol, interval, parsedLimit);

  return res.status(200).json({
    status: 'success',
    interval,
    count: data.length,
    data
  });
});

const fetchAllIntervals = asyncHandler(async (req, res) => {
  const { symbol } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }

  const data = await getAllIntervalsData(symbol);

  return res.status(200).json({
    status: 'success',
    data
  });
});

module.exports = { fetchIntervalData, fetchAllIntervals };
