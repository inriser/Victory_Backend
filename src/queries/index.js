/**
 * Queries Index
 * Central export for all query modules
 */

const { newOhlcQueries } = require('./new_ohlc.queries.js');
const { internalTokenListQueries } = require('./internalTokenList.queries.js');

module.exports = { newOhlcQueries, internalTokenListQueries };