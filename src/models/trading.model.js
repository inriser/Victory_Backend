const { tsClient } = require('../db/timescaleClient.js');
const { redisClient } = require('../db/redisClient.js');

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
     * Fetch all tradeable stocks with market snapshot data
     */
    getWatchlist: async () => {
        const query = `
      SELECT 
        i.token, 
        i.symbol, 
        i.name, 
        i.exch_seg, 
        i.instrumenttype, 
        COALESCE(m.latest_price::numeric, i.ltp) as ltp,
        i.volume,
        m.prev_close::numeric as prev_close
      FROM InternalTokenList i
      LEFT JOIN market_snapshot m ON i.symbol = m.symbol
      WHERE i.tradeable = TRUE
      ORDER BY i.symbol ASC
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
        // Redis Cache Key
        const cacheKey = `ohlc:${symbol}:${interval}:${limit}`;

        try {
            // Check Redis First
            const cachedData = await redisClient.get(cacheKey);
            if (cachedData) {
                return JSON.parse(cachedData);
            }
        } catch (err) {
            console.error('Redis Fetch Error:', err);
            // Continue to DB on error
        }

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
                tableName = 'candles_ohlc'; // Correct table name
                timeField = 'ts'; // Lowercase for candles_ohlc
                break;
        }

        // Handle different column casing between tables
        // 1Min_OHLC uses "PascalCase" columns
        // candles_ohlc uses lowercase columns
        let query;

        if (tableName === 'candles_ohlc') {
            query = `
              SELECT 
                symbol,
                ts as time,
                open,
                high,
                low,
                close,
                volume
              FROM ${tableName}
              WHERE symbol = $1
              ORDER BY ${timeField} DESC
              LIMIT $2
            `;
        } else {
            query = `
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
        }

        const { rows } = await tsClient.query(query, [symbol, limit]);

        // Process Data (Reverse for charts: Old -> New)
        const result = rows.reverse();

        // [Feature] For 1m interval, fetch the latest candle from pure Redis (TickerTick)
        if (interval === '1m') {
            try {
                // TickerTick key format: TickerTick:1MIN:<SYMBOL> (or <SYMBOL>-EQ)
                // We try exact symbol first, then with -EQ suffix if needed, but usually symbol matches.
                // Based on user screenshot: TickerTick:1MIN:360ONE-EQ

                // Try exact match
                let tickerKey = `TickerTick:1MIN:${symbol}`;
                let tickerData = await redisClient.get(tickerKey);

                // If not found, try appending -EQ if not present
                if (!tickerData && !symbol.endsWith('-EQ')) {
                    tickerKey = `TickerTick:1MIN:${symbol}-EQ`;
                    tickerData = await redisClient.get(tickerKey);
                }

                if (tickerData) {
                    const latestCandle = JSON.parse(tickerData);

                    // Convert TickerTick keys (TitleCase) to API keys (lowercase)
                    // Redis: { Time, Open, High, Low, Close, Volume, ... }
                    // API/Result: { time, open, high, low, close, volume }

                    const formattedCandle = {
                        symbol: latestCandle.Symbol,
                        time: new Date(latestCandle.Time),
                        open: Number(latestCandle.Open),
                        high: Number(latestCandle.High),
                        low: Number(latestCandle.Low),
                        close: Number(latestCandle.Close),
                        volume: Number(latestCandle.Volume)
                    };

                    // Check if this candle is newer than the last one in DB result
                    const lastDbCandle = result[result.length - 1];

                    if (!lastDbCandle || new Date(formattedCandle.time) > new Date(lastDbCandle.time)) {
                        result.push(formattedCandle);

                        // If we exceeded limit, shift one off the start (oldest)
                        if (result.length > limit) {
                            result.shift();
                        }
                    } else if (lastDbCandle && new Date(formattedCandle.time).getTime() === new Date(lastDbCandle.time).getTime()) {
                        // Update the last candle content if times match (latest update)
                        result[result.length - 1] = formattedCandle;
                    }
                }
            } catch (err) {
                console.error('TickerTick Fetch Error:', err);
            }
        }

        // Save to Redis (Cache for 60 seconds)
        try {
            await redisClient.set(cacheKey, JSON.stringify(result), { EX: 60 });
        } catch (err) {
            console.error('Redis Set Error:', err);
        }

        return result;
    },

    /**
     * Fetch Token Map (Token -> Symbol) for Nifty 50
     * Used by WebSocket services
     */
    getTokenMap: async () => {
        const query = `
      SELECT token, symbol, exch_seg
      FROM InternalTokenList
      WHERE tradeable = TRUE
    `;
        const { rows } = await tsClient.query(query);

        // Convert to Map: { '3045': { symbol: 'SBIN', exchange: 'NSE' }, ... }
        // Note: exch_seg usually returns "NSE", "BSE", "NFO" etc.
        const map = {};
        rows.forEach(row => {
            map[row.token] = {
                symbol: row.symbol,
                exchange: row.exch_seg
            };
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
