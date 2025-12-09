/**
 * Index Calculation Service
 * Calculates real-time index values (NIFTY, Sensex, BANKNIFTY, etc.)
 * based on constituent stock prices from market_snapshot
 */

const { timescaleClient: tsClient } = require('../db/timescaleClient');
const { logger } = require('../config/logger');

// Index constituents configuration
const INDEX_CONSTITUENTS = {
    NIFTY: {
        name: 'NIFTY 50',
        baseValue: 1000, // Base index value
        constituents: [
            'SHRIRAMFIN', 'BAJFINANCE', 'BAJAJFINSV', 'HINDALCO', 'HCLTECH',
            'INFY', 'SBILIFE', 'SBIN', 'MARUTI', 'TECHM', 'TCS', 'WIPRO',
            'M&M', 'EICHERMOT', 'HDFCLIFE', 'LT', 'HDFCBANK', 'ADANIENT',
            'JSWSTEEL', 'KOTAKBANK', 'GRASIM', 'TATACONSUM', 'TITAN', 'POWERGRID',
            'BEL', 'MAXHEALTH', 'ICICIBANK', 'BAJAJ-AUTO', 'DRREDDY', 'ITC',
            'ONGC', 'CIPLA', 'COALINDIA', 'ETERNAL', 'TATASTEEL', 'NTPC',
            'ULTRACEMCO', 'APOLLOHOSP', 'JIOFIN', 'RELIANCE', 'ASIANPAINT',
            'NESTLEIND', 'AXISBANK', 'BHARTIARTL', 'ADANIPORTS', 'TRENT',
            'TMPV', 'SUNPHARMA', 'INDUSINDBK', 'HINDUNILVR'
        ]
    },
    BANKNIFTY: {
        name: 'BANK NIFTY',
        baseValue: 1000,
        constituents: [
            'HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'SBIN', 'AXISBANK',
            'INDUSINDBK', 'BAJFINANCE', 'BAJAJFINSV', 'SBILIFE', 'HDFCLIFE',
            'BANDHANBNK', 'FEDERALBNK'
        ]
    }
    // Add more indices as needed (Sensex, NIFTY IT, etc.)
};

class IndexCalculationService {
    /**
     * Calculate current index value based on constituent stock prices
     * Uses equal-weight averaging for simplicity
     * @param {string} indexName - Index name (e.g., 'NIFTY', 'BANKNIFTY')
     * @returns {Object} { value, change, changePercent, timestamp }
     */
    async calculateIndexValue(indexName) {
        try {
            const indexConfig = INDEX_CONSTITUENTS[indexName];
            if (!indexConfig) {
                throw new Error(`Index ${indexName} not configured`);
            }

            const { constituents, baseValue } = indexConfig;

            // Get current prices from market_snapshot (using correct column names)
            const query = `
                SELECT 
                    symbol,
                    latest_price as current_price,
                    prev_close as prev_close_price
                FROM market_snapshot
                WHERE symbol = ANY($1::text[])
                AND latest_price IS NOT NULL
                AND latest_price > 0
            `;

            const result = await tsClient.query(query, [constituents]);
            const stockPrices = result.rows;

            if (stockPrices.length === 0) {
                logger.warn(`[IndexCalc] No price data found for ${indexName}`);
                return {
                    symbol: indexName,
                    name: indexConfig.name,
                    value: 0,
                    change: 0,
                    changePercent: 0,
                    timestamp: new Date()
                };
            }

            // Calculate equal-weighted average
            const totalCurrentPrice = stockPrices.reduce((sum, stock) => sum + parseFloat(stock.current_price), 0);
            const totalPrevClose = stockPrices.reduce((sum, stock) => sum + parseFloat(stock.prev_close_price || stock.current_price), 0);

            const avgCurrentPrice = totalCurrentPrice / stockPrices.length;
            const avgPrevClose = totalPrevClose / stockPrices.length;

            // Improved scaling factor to match actual NIFTY values
            // NIFTY 50 actual value: ~21,000-26,000
            // Average stock price: ~1,500-2,500
            // BANK NIFTY actual value: ~54,000-56,000, avg bank stock price: ~2,000-2,500
            // Scaling factor: ~12.9 for NIFTY, ~24 for BANKNIFTY
            const scalingFactor = indexName === 'NIFTY' ? 12.9 : 24;

            const indexValue = avgCurrentPrice * scalingFactor;
            const prevIndexValue = avgPrevClose * scalingFactor;

            const change = indexValue - prevIndexValue;
            const changePercent = prevIndexValue > 0 ? (change / prevIndexValue) * 100 : 0;

            return {
                symbol: indexName,
                name: indexConfig.name,
                value: parseFloat(indexValue.toFixed(2)),
                change: parseFloat(change.toFixed(2)),
                changePercent: parseFloat(changePercent.toFixed(2)),
                constituentsCount: stockPrices.length,
                totalConstituents: constituents.length,
                timestamp: new Date()
            };

        } catch (error) {
            logger.error(`[IndexCalc] Error calculating ${indexName}:`, error);
            throw error;
        }
    }

    /**
     * Calculate all configured indices
     * @returns {Array} Array of index values
     */
    async calculateAllIndices() {
        try {
            const indices = Object.keys(INDEX_CONSTITUENTS);
            const results = await Promise.all(
                indices.map(indexName => this.calculateIndexValue(indexName))
            );
            return results;
        } catch (error) {
            logger.error('[IndexCalc] Error calculating all indices:', error);
            throw error;
        }
    }

    /**
     * Get index value with historical data (for charts)
     * @param {string} indexName - Index name
     * @param {string} interval - Time interval ('1d', '1w', '1M')
     * @param {number} limit - Number of data points
     * @returns {Object} { current, history }
     */
    async getIndexWithHistory(indexName, interval = '1d', limit = 30) {
        try {
            // Get current value
            const current = await this.calculateIndexValue(indexName);

            // For now, return mock historical data
            // TODO: Implement actual historical calculation from DayEnd_OHLC
            const history = [];
            for (let i = limit; i > 0; i--) {
                const baseValue = current.value;
                const randomChange = (Math.random() - 0.5) * (baseValue * 0.02); // ±2% variation
                history.push({
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                    value: baseValue + randomChange
                });
            }

            return {
                current,
                history
            };

        } catch (error) {
            logger.error(`[IndexCalc] Error getting index history for ${indexName}:`, error);
            throw error;
        }
    }
}

module.exports = new IndexCalculationService();
