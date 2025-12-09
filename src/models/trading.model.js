const { tsClient } = require('../db/timescaleClient.js');

/**
 * trading.model.js
 * 
 * Handles database operations for:
 * 1. Watchlist (InternalTokenList)
 * 2. Reference Data (Exchanges, ScriptTypes)
 * 3. Market Data (1Min_OHLC, 5Min_OHLC, DayEnd_OHLC)
 * 4. Token Lookups (Token -> Symbol)
 */

const TradingModel = {
    /**
     * Fetch all Nifty 50 stocks from InternalTokenList
     */
    getWatchlist: async () => {
        const query = `
      SELECT token, symbol, name, exch_seg, instrumenttype, ltp, volume
      FROM InternalTokenList
      WHERE tradeable = TRUE
      ORDER BY symbol ASC
    `;
        const { rows } = await tsClient.query(query);
        return rows;
    },

    /**
     * Fetch list of interactions
     */
    getExchanges: async () => {
        const query = `SELECT * FROM Exchanges ORDER BY exchange_code`;
        const { rows } = await tsClient.query(query);
        return rows;
    },

    /**
     * Fetch list of instrument types
     */
    getScriptTypes: async () => {
        const query = `SELECT * FROM ScriptTypes ORDER BY type_code`;
        const { rows } = await tsClient.query(query);
        return rows;
    },

    /**
     * Get OHLC Data based on interval
     * @param {Object} params
     * @param {string} params.symbol - Stock symbol (e.g. RELIANCE)
     * @param {string} params.interval - '1m', '5m', '1d', etc.
     * @param {number} params.limit - Number of candles (default 100)
     */
    getOHLC: async ({ symbol, interval = '1d', limit = 100 }) => {
        let tableName = 'DayEnd_OHLC';
        let timeField = 'Date';

        // Select table based on interval
        switch (interval) {
            case '1m':
                tableName = '"1Min_OHLC"';
                timeField = '"Time"';
                break;
            case '5m':
            case '15m':
            case '30m':
            case '1h':
                tableName = '"5Min_OHLC"';
                timeField = '"Time"';
                break;
            case '1d':
            case '1w':
            case '1M':
            default:
                tableName = 'DayEnd_OHLC';
                timeField = '"Date"';
                break;
        }

        const query = `
      SELECT 
        "Symbol" as symbol,
        ${timeField} as time,
        "Open" as open,
        "High" as high,
        "Low" as low,
        "Close" as close,
        "Volume" as volume
      FROM ${tableName}
      WHERE "Symbol" = $1
      ORDER BY ${timeField} DESC
      LIMIT $2
    `;

        const { rows } = await tsClient.query(query, [symbol, limit]);

        // Reverse needed for charts (ascending order)
        return rows.reverse();
    },

    /**
     * Fetch Token Map (Token -> Symbol) for Nifty 50
     * Used by WebSocket services
     */
    getTokenMap: async () => {
        const query = `
      SELECT token, symbol 
      FROM InternalTokenList
      WHERE tradeable = TRUE
    `;
        const { rows } = await tsClient.query(query);

        // Convert to Map: { '3045': 'SBIN', ... }
        const map = {};
        rows.forEach(row => {
            map[row.token] = row.symbol;
        });
        return map;
    },

    /**
     * Get Token for a specific symbol
     * @param {string} symbol 
     */
    getTokenBySymbol: async (symbol) => {
        const query = `
      SELECT token 
      FROM InternalTokenList
      WHERE symbol = $1
      LIMIT 1
    `;
        const { rows } = await tsClient.query(query, [symbol]);
        return rows.length > 0 ? rows[0].token : null;
    }
};

module.exports = TradingModel;
