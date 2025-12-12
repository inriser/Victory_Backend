/**
 * Fetch Historical Candle Data for ALL Stocks
 * Fetches 1min, 5min, and 1day candle data from Angel One API
 * Uses stocks from internaltokenlist table
 */

const axios = require('axios');
const { logger } = require('../config/logger');
const { timescaleClient: tsClient } = require('../db/timescaleClient');
const { env } = require('../config/env');

class HistoricalDataFetcher {
    constructor() {
        this.apiKey = env.angel.apiKey;
        this.authToken = env.angel.authToken;
        this.clientCode = env.angel.clientCode;
        this.baseUrl = 'https://apiconnect.angelone.in/rest/secure/angelbroking';
    }

    /**
     * Get all stocks from database
     */
    async getAllStocks() {
        try {
            const query = `
                SELECT token, symbol, exch_seg
                FROM internaltokenlist 
                WHERE tradeable = TRUE
            `;
            const result = await tsClient.query(query);
            logger.info(`[HistoricalFetch] Found ${result.rows.length} stocks in database`);
            return result.rows;
        } catch (error) {
            logger.error(`[HistoricalFetch] Error getting stocks from database:`, error);
            return [];
        }
    }

    /**
     * Fetch candle data from Angel One API using HTTP
     */
    async fetchCandleData(symbolToken, exchange, interval, fromDate, toDate) {
        try {
            const payload = {
                exchange: exchange || 'NSE',
                symboltoken: symbolToken,
                interval: interval,
                fromdate: fromDate,
                todate: toDate
            };

            const response = await axios.post(
                `${this.baseUrl}/historical/v2/getCandleData`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.authToken}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-UserType': 'USER',
                        'X-SourceID': 'WEB',
                        'X-ClientLocalIP': 'CLIENT_LOCAL_IP',
                        'X-ClientPublicIP': 'CLIENT_PUBLIC_IP',
                        'X-MACAddress': 'MAC_ADDRESS',
                        'X-PrivateKey': this.apiKey
                    },
                    timeout: 30000
                }
            );

            if (response.data && response.data.status && response.data.data) {
                return response.data.data;
            }

            return [];
        } catch (error) {
            if (error.response) {
                logger.error(`[HistoricalFetch] API Error for ${symbolToken}: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            } else {
                logger.error(`[HistoricalFetch] Error fetching candle data:`, error.message);
            }
            return [];
        }
    }

    /**
     * Save 1-minute candles to database
     */
    async save1MinCandles(symbol, candles) {
        if (!candles || candles.length === 0) return 0;

        try {
            const insertQuery = `
                INSERT INTO "1Min_OHLC" ("Symbol", "Time", "Open", "High", "Low", "Close", "Volume")
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT ("Symbol", "Time") DO UPDATE SET
                    "Open" = EXCLUDED."Open",
                    "High" = EXCLUDED."High",
                    "Low" = EXCLUDED."Low",
                    "Close" = EXCLUDED."Close",
                    "Volume" = EXCLUDED."Volume"
            `;

            let savedCount = 0;
            for (const candle of candles) {
                const [timestamp, open, high, low, close, volume] = candle;
                const time = new Date(timestamp);

                await tsClient.query(insertQuery, [
                    symbol,
                    time,
                    parseFloat(open),
                    parseFloat(high),
                    parseFloat(low),
                    parseFloat(close),
                    parseInt(volume)
                ]);
                savedCount++;
            }

            return savedCount;
        } catch (error) {
            logger.error(`[HistoricalFetch] Error saving 1-min candles for ${symbol}:`, error.message);
            return 0;
        }
    }

    /**
     * Save 5-minute candles to database
     */
    async save5MinCandles(symbol, candles) {
        if (!candles || candles.length === 0) return 0;

        try {
            const insertQuery = `
                INSERT INTO "5Min_OHLC" ("Symbol", "Time", "Open", "High", "Low", "Close", "Volume")
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT ("Symbol", "Time") DO UPDATE SET
                    "Open" = EXCLUDED."Open",
                    "High" = EXCLUDED."High",
                    "Low" = EXCLUDED."Low",
                    "Close" = EXCLUDED."Close",
                    "Volume" = EXCLUDED."Volume"
            `;

            let savedCount = 0;
            for (const candle of candles) {
                const [timestamp, open, high, low, close, volume] = candle;
                const time = new Date(timestamp);

                await tsClient.query(insertQuery, [
                    symbol,
                    time,
                    parseFloat(open),
                    parseFloat(high),
                    parseFloat(low),
                    parseFloat(close),
                    parseInt(volume)
                ]);
                savedCount++;
            }

            return savedCount;
        } catch (error) {
            logger.error(`[HistoricalFetch] Error saving 5-min candles for ${symbol}:`, error.message);
            return 0;
        }
    }

    /**
     * Save daily candles to database
     */
    async saveDailyCandles(symbol, candles) {
        if (!candles || candles.length === 0) return 0;

        try {
            const insertQuery = `
                INSERT INTO "DayEnd_OHLC" ("Symbol", "Date", "Open", "High", "Low", "Close", "Volume")
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT ("Symbol", "Date") DO UPDATE SET
                    "Open" = EXCLUDED."Open",
                    "High" = EXCLUDED."High",
                    "Low" = EXCLUDED."Low",
                    "Close" = EXCLUDED."Close",
                    "Volume" = EXCLUDED."Volume"
            `;

            let savedCount = 0;
            for (const candle of candles) {
                const [timestamp, open, high, low, close, volume] = candle;
                const date = new Date(timestamp);

                await tsClient.query(insertQuery, [
                    symbol,
                    date,
                    parseFloat(open),
                    parseFloat(high),
                    parseFloat(low),
                    parseFloat(close),
                    parseInt(volume)
                ]);
                savedCount++;
            }

            return savedCount;
        } catch (error) {
            logger.error(`[HistoricalFetch] Error saving daily candles for ${symbol}:`, error.message);
            return 0;
        }
    }

    /**
     * Fetch and save today's data for all stocks in database
     */
    async fetchTodaysData() {
        try {
            logger.info('[HistoricalFetch] Starting to fetch today\'s data...');

            // Get stocks from database
            const stocks = await this.getAllStocks();
            if (stocks.length === 0) {
                logger.error('[HistoricalFetch] No stocks found in database!');
                return;
            }

            // Get today's date range
            const today = new Date();
            const fromDate = new Date(today);
            fromDate.setHours(9, 15, 0, 0);
            const toDate = new Date(today);
            toDate.setHours(15, 30, 0, 0);

            const fromDateStr = this.formatDateTime(fromDate);
            const toDateStr = this.formatDateTime(toDate);

            logger.info(`[HistoricalFetch] Fetching data from ${fromDateStr} to ${toDateStr}`);
            logger.info(`[HistoricalFetch] Processing ${stocks.length} stocks...`);

            let totalStats = {
                processed: 0,
                oneMin: 0,
                fiveMin: 0,
                daily: 0,
                failed: 0
            };

            for (const stock of stocks) {
                try {
                    // logger.info(`[HistoricalFetch] Processing ${stock.symbol} (${stock.exch_seg})...`);

                    // 1. Fetch 1-minute candles
                    const oneMinCandles = await this.fetchCandleData(
                        stock.token,
                        stock.exch_seg, // USE DB EXCHANGE
                        'ONE_MINUTE',
                        fromDateStr,
                        toDateStr
                    );
                    const oneMinSaved = await this.save1MinCandles(stock.symbol, oneMinCandles);
                    totalStats.oneMin += oneMinSaved;

                    // Small delay to respect rate limits
                    await this.sleep(200);

                    // 2. Fetch Daily Candle (Skip 5min for speed if needed, but lets keep it)
                    // If 1min failed, maybe 5min works?

                    const fiveMinCandles = await this.fetchCandleData(
                        stock.token,
                        stock.exch_seg,
                        'FIVE_MINUTE',
                        fromDateStr,
                        toDateStr
                    );
                    const fiveMinSaved = await this.save5MinCandles(stock.symbol, fiveMinCandles);
                    totalStats.fiveMin += fiveMinSaved;

                    await this.sleep(200);

                    const dailyCandles = await this.fetchCandleData(
                        stock.token,
                        stock.exch_seg,
                        'ONE_DAY',
                        fromDateStr,
                        toDateStr
                    );
                    const dailySaved = await this.saveDailyCandles(stock.symbol, dailyCandles);
                    totalStats.daily += dailySaved;

                    totalStats.processed++;

                    // Log progress every 10 stocks or if data was saved
                    if (oneMinSaved > 0 || dailySaved > 0 || totalStats.processed % 20 === 0) {
                        logger.info(`[HistoricalFetch] ${totalStats.processed}/${stocks.length} - ${stock.symbol}: 1m=${oneMinSaved}, 1d=${dailySaved}`);
                    }

                    await this.sleep(300); // 3 requests per stock, approx .7s per stock. 500 stocks = 350s (6 mins). Acceptable.

                } catch (error) {
                    logger.error(`[HistoricalFetch] Error processing ${stock.symbol}:`, error.message);
                    totalStats.failed++;
                }
            }

            logger.info('[HistoricalFetch] ===== SUMMARY =====');
            logger.info(`[HistoricalFetch] Stocks processed: ${totalStats.processed}/${stocks.length}`);
            logger.info(`[HistoricalFetch] 1-min candles saved: ${totalStats.oneMin}`);
            logger.info(`[HistoricalFetch] 5-min candles saved: ${totalStats.fiveMin}`);
            logger.info(`[HistoricalFetch] Daily candles saved: ${totalStats.daily}`);
            logger.info(`[HistoricalFetch] Failed: ${totalStats.failed}`);

            return totalStats;

        } catch (error) {
            logger.error('[HistoricalFetch] Fatal error:', error);
            throw error;
        }
    }

    /**
     * Format date for Angel One API (YYYY-MM-DD HH:mm)
     */
    formatDateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution
async function main() {
    const fetcher = new HistoricalDataFetcher();

    try {
        await tsClient.connect();
        logger.info('[HistoricalFetch] Database connected');

        const stats = await fetcher.fetchTodaysData();

        logger.info('[HistoricalFetch] Script completed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('[HistoricalFetch] Script failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = HistoricalDataFetcher;
