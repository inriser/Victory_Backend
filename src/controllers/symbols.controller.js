const { asyncHandler } = require('../utils/asyncHandler.js');
const { tsClient } = require('../db/timescaleClient.js');
const fs = require('fs');
const path = require('path');

const scriptsPath = path.join(__dirname, '../script/symbolNames.json');

const getAvailableSymbols = asyncHandler(async (req, res) => {
 
  const { sort } = req.query; // 'price_desc', 'price_asc', 'alphabetical'

  let query = `
    SELECT symbol, latest_price
    FROM market_snapshot
  `;

  if (sort === 'price_desc') {
    query += ` ORDER BY latest_price DESC`;
  } else if (sort === 'price_asc') {
    query += ` ORDER BY latest_price ASC`;
  } else {
    query += ` ORDER BY symbol ASC`;
  }

  let result;
  try {
    result = await tsClient.query(query);
  } catch (err) {
    console.warn('Error querying market_snapshot, falling back to candles_ohlc:', err.message);
    result = await tsClient.query(
      `SELECT DISTINCT symbol FROM candles_ohlc ORDER BY symbol ASC`
    );
  }

  const symbols = result.rows.map(row => row.symbol);

  let stockNames = {};
  try {
    const data = fs.readFileSync(scriptsPath, 'utf8');
    stockNames = JSON.parse(data);
  } catch (err) {
    console.warn('Could not load stock names:', err.message);
  }

  // Combine symbols with names and price
  const symbolsWithNames = result.rows.map(row => ({
    symbol: row.symbol,
    name: stockNames[row.symbol] || row.symbol,
    price: row.latest_price || null
  }));

  res.json({
    symbols,
    symbolsWithNames,
    count: symbols.length
  });
});

// Export for CommonJS
module.exports = {
  getAvailableSymbols
};
