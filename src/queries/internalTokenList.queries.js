/**
 * internalTokenList.queries.js
 * 
 * Database queries for InternalTokenList table operations
 * Handles LTP and Volume updates for the watchlist
 */

const internalTokenListQueries = {
    /**
     * Update LTP and Volume for a single stock
     * @param {string} symbol - Stock symbol
     * @param {number} ltp - Last traded price
     * @param {number} volume - Trading volume
     * @returns {Object} Query object with text and values
     */
    updateLtpAndVolume: (symbol, ltp, volume) => {
        return {
            text: `
        UPDATE InternalTokenList
        SET 
          ltp = $2,
          volume = $3,
          updated_at = NOW()
        WHERE symbol = $1
      `,
            values: [symbol, ltp, volume]
        };
    },

    /**
     * Batch update LTP and Volume for multiple stocks
     * Uses PostgreSQL unnest for efficient bulk updates
     * @param {Array<Object>} stocks - Array of {symbol, ltp, volume}
     * @returns {Object} Query object with text and values
     */
    batchUpdateLtpAndVolume: (stocks) => {
        if (!stocks || stocks.length === 0) {
            return null;
        }

        // Build parameterized query using unnest
        const query = `
      UPDATE InternalTokenList as i
      SET 
        ltp = v.ltp::numeric,
        volume = v.volume::bigint,
        updated_at = NOW()
      FROM (VALUES 
        ${stocks.map((_, idx) => `($${idx * 3 + 1}, $${idx * 3 + 2}::numeric, $${idx * 3 + 3}::bigint)`).join(',')}
      ) as v(symbol, ltp, volume)
      WHERE i.symbol = v.symbol
    `;

        // Flatten the values array
        const values = [];
        stocks.forEach(stock => {
            values.push(stock.symbol, stock.ltp, stock.volume);
        });

        return {
            text: query,
            values: values
        };
    },

    /**
     * Get all stocks from InternalTokenList with their current LTP and Volume
     * @returns {Object} Query object
     */
    getAllStocks: () => {
        return {
            text: `
        SELECT 
          token,
          symbol,
          name,
          exch_seg,
          instrumenttype,
          ltp,
          volume,
          websocket_enabled,
          tradeable,
          updated_at
        FROM InternalTokenList
        WHERE tradeable = TRUE
        ORDER BY symbol ASC
      `,
            values: []
        };
    },

    /**
     * Get a single stock by symbol
     * @param {string} symbol - Stock symbol
     * @returns {Object} Query object
     */
    getStockBySymbol: (symbol) => {
        return {
            text: `
        SELECT 
          token,
          symbol,
          name,
          exch_seg,
          instrumenttype,
          ltp,
          volume,
          websocket_enabled,
          tradeable,
          updated_at
        FROM InternalTokenList
        WHERE symbol = $1
        LIMIT 1
      `,
            values: [symbol]
        };
    }
};

module.exports = { internalTokenListQueries };
