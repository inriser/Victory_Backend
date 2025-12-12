/**
 * Index Calculation Service
 * Calculates real-time index values (NIFTY, Sensex, BANKNIFTY, etc.)
 * based on constituent stock prices from market_snapshot
 */

const { timescaleClient: tsClient } = require('../db/timescaleClient');
const { logger } = require('../config/logger');
const IndicesModel = require('../models/indices.model');
const { redisClient } = require('../db/redisClient');

class IndexCalculationService {
    /**
     * Calculate current index value based on constituent stock prices
     * Uses equal-weight averaging for simplicity
     * @param {string} indexName - Index name (e.g., 'NIFTY', 'BANKNIFTY')
     * @returns {Object} { value, change, changePercent, timestamp }
     */
    async calculateIndexValue(indexName) {
        try {
            // 1. Try fetching directly from Redis (Real-time Source of Truth)
            // The WebSocket service stores data as JSON in keys like "PRICE:LATEST:SYMBOL"
            // We map common index names to potential Redis keys.
            const keysToTry = [
                `PRICE:LATEST:${indexName}`,
                `PRICE:LATEST:${indexName.replace(' ', '')}`,      // e.g. "PRICE:LATEST:NIFTY50"
                `PRICE:LATEST:${indexName} 50`,                    // e.g. "PRICE:LATEST:NIFTY 50"
                `PRICE:LATEST:${indexName.replace('NIFTY', 'NIFTY 50')}`, // e.g. NIFTY -> NIFTY 50
                `ltp:${indexName}` // Fallback for legacy keys if any
            ];

            let ltp = null;
            let usedKey = null;

            for (const key of keysToTry) {
                const val = await redisClient.get(key);
                if (val) {
                    try {
                        const parsed = JSON.parse(val);
                        // Check if it's a valid object with 'price'
                        if (parsed && typeof parsed === 'object' && parsed.price !== undefined) {
                            ltp = parseFloat(parsed.price);
                            usedKey = key;
                            break;
                        }
                    } catch (e) {
                        // ignore parse error, maybe it was a raw string?
                        const raw = parseFloat(val);
                        if (!isNaN(raw)) {
                            ltp = raw;
                            usedKey = key;
                            break;
                        }
                    }
                }
            }

            if (ltp !== null) {
                // Fetch Previous Close for Change Calculation
                let change = 0;
                let changePercent = 0;

                // If we found a PRICE:LATEST key, look for PRICE:PREV_CLOSE
                if (usedKey.startsWith('PRICE:LATEST:')) {
                    const baseSymbol = usedKey.replace('PRICE:LATEST:', '');
                    const closeKey = `PRICE:PREV_CLOSE:${baseSymbol}`;

                    let prevClose = ltp;
                    const prevCloseVal = await redisClient.get(closeKey);
                    if (prevCloseVal) prevClose = parseFloat(prevCloseVal);

                    change = ltp - prevClose;
                    changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
                } else {
                    // Legacy path
                    const baseKeyName = usedKey.replace('ltp:', '');
                    const closeKey = `close:${baseKeyName}`;
                    const prevCloseStr = await redisClient.get(closeKey);
                    const prevClose = prevCloseStr ? parseFloat(prevCloseStr) : ltp;
                    change = ltp - prevClose;
                    changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
                }

                const result = {
                    symbol: indexName,
                    name: indexName,
                    value: parseFloat(ltp.toFixed(2)),
                    change: parseFloat(change.toFixed(2)),
                    changePercent: parseFloat(changePercent.toFixed(2)),
                    isRealtime: true,
                    timestamp: new Date()
                };

                // console.log(`[IndexInfo] ${indexName} Found in Redis! Value: ₹${ltp}`);
                return result;
            }

            // If we are here, Redis lookup failed.
            console.log(`[IndexCalc] No Redis data for ${indexName}. Calculation skipped to avoid wrong values.`);
            return null; // SKIP all synthetic calculation. Real indices cannot be calculated by simple average.

        } catch (error) {
            logger.error(`[IndexCalc] Error calculating ${indexName}:`, error);
            throw error;
        }
    }

    /**
     * Calculate all configured indices from DB
     * @returns {Array} Array of index values
     */
    async calculateAllIndices() {
        try {
            // 1. Get all active groups (Indices & Sectors)
            const groupsFn = await IndicesModel.getAllGroups();

            // Flatten: we want to calc value for ALL of them
            // groupsFn returns { indices: [], sectors: [], themes: [] }
            const allGroups = [
                ...groupsFn.indices,
                ...groupsFn.sectors,
                ...groupsFn.themes
            ];

            // 2. Parallel calculation
            const results = await Promise.all(
                allGroups.map(async (group) => {
                    try {
                        const data = await this.calculateIndexValue(group.name);
                        if (!data) return null;
                        // Merge calculated data with type info
                        return {
                            ...data,
                            type: this.getType(groupsFn, group.name),
                            exchange: group.exchange
                        };
                    } catch (err) {
                        logger.error(`[IndexCalc] Failed to calc index ${group.name}: ${err.message}`);
                        return null;
                    }
                })
            );

            // Filter out nulls
            return results.filter(r => r !== null);

        } catch (error) {
            logger.error('[IndexCalc] Error calculating all indices:', error);
            throw error;
        }
    }

    getType(groupsObj, name) {
        if (groupsObj.indices.some(i => i.name === name)) return 'index';
        if (groupsObj.sectors.some(s => s.name === name)) return 'Sector';
        return 'Theme';
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
            const baseValue = current ? current.value : 10000;

            for (let i = limit; i > 0; i--) {
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
