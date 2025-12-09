const { asyncHandler } = require('../utils/asyncHandler.js');
const TradingModel = require('../models/trading.model.js');

const getAvailableSymbols = asyncHandler(async (req, res) => {
  const { sort } = req.query; // 'price_desc', 'price_asc', 'alphabetical'

  // Fetch from the new authoritative source (InternalTokenList)
  // This already returns { token, symbol, name, exch_seg, instrumenttype, ltp, volume }
  let stocks = await TradingModel.getWatchlist();

  // Map to the format expected by the frontend
  const symbolsWithNames = stocks.map(stock => ({
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    // Use ltp from database if available, otherwise it might be 0 until a tick arrives
    price: stock.ltp ? parseFloat(stock.ltp) : 0,
    exchange: 'NSE'
  }));

  // Sort the data in memory
  if (sort === 'price_desc') {
    symbolsWithNames.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sort === 'price_asc') {
    symbolsWithNames.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else {
    // Default: Alphabetical by symbol
    symbolsWithNames.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  // Extract simple list of symbols
  const symbols = symbolsWithNames.map(s => s.symbol);

  res.json({
    symbols,
    symbolsWithNames,
    count: symbols.length
  });
});

module.exports = {
  getAvailableSymbols
};
