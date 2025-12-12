const { tsClient } = require('../db/timescaleClient.js');

/**
 * indices.model.js
 * 
 * Handles database operations for indices, sectors, and themes
 * Uses the IndicesControl table for dynamic constituent management
 */

const IndicesModel = {
    /**
     * Get all available indices/sectors/themes grouped by type
     * @returns {Object} { indices: [], sectors: [], themes: [] }
     */
    async getAllGroups() {
        const query = `
            SELECT DISTINCT type, group_name, exchange
            FROM "IndicesControl"
            WHERE is_active = true
            ORDER BY type, group_name
        `;
        const { rows } = await tsClient.query(query);

        // Group by type
        const result = {
            indices: [],
            sectors: [],
            themes: []
        };

        console.log(result)
        rows.forEach(row => {
            const item = {
                name: row.group_name,
                symbol: row.group_name, // Use group_name as symbol for compatibility
                exchange: row.exchange,
                // Placeholder values - these should be fetched from index calculation service
                value: 0,
                change: 0,
                changePercent: 0
            };

            if (row.type === 'index') {
                result.indices.push(item);
            } else if (row.type === 'sector') {
                result.sectors.push(item);
            } else if (row.type === 'theme') {
                result.themes.push(item);
            }
        });

        return result;
    },

    /**
     * Get constituent stocks for a specific index/sector/theme
     * @param {string} type - 'index', 'sector', or 'theme' (optional, filters if provided)
     * @param {string} exchange - 'NSE' or 'BSE' (optional)
     * @returns {Array} Array of stock symbols
     */
    async getConstituents(groupName, type = null, exchange = null) {
        // Calculate change/percent dynamically to be safe
        let query = `
            SELECT 
                ic.symbol, 
                ic.exchange,
                ms.latest_price as price,
                (ms.latest_price - ms.prev_close) as change,
                CASE 
                    WHEN ms.prev_close > 0 THEN ((ms.latest_price - ms.prev_close) / ms.prev_close) * 100 
                    ELSE 0 
                END as "changePercent",
                ms.prev_close
            FROM "IndicesControl" ic
            LEFT JOIN market_snapshot ms ON ic.symbol = ms.symbol
            WHERE ic.group_name = $1 
            AND ic.is_active = true
        `;

        const params = [groupName];
        let paramIndex = 2;

        if (type) {
            query += ` AND ic.type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        if (exchange) {
            query += ` AND ic.exchange = $${paramIndex}`;
            params.push(exchange);
        }

        query += ` ORDER BY ic.symbol`;

        const { rows } = await tsClient.query(query, params);
        return rows;
    },

    /**
     * Check if a symbol belongs to a specific index/sector/theme
     * @param {string} symbol - Stock symbol
     * @param {string} groupName - Index/sector/theme name
     * @param {string} type - 'index', 'sector', or 'theme'
     * @returns {boolean}
     */
    async isConstituent(symbol, groupName, type = 'index') {
        const query = `
            SELECT EXISTS(
                SELECT 1 FROM "IndicesControl"
                WHERE symbol = $1 
                AND group_name = $2 
                AND type = $3
                AND is_active = true
            ) as is_member
        `;

        const { rows } = await tsClient.query(query, [symbol, groupName, type]);
        return rows[0]?.is_member || false;
    },

    /**
     * Get all indices/sectors/themes that a stock belongs to
     * @param {string} symbol - Stock symbol
     * @returns {Object} { indices: [], sectors: [], themes: [] }
     */
    async getStockMemberships(symbol) {
        const query = `
            SELECT type, group_name, exchange
            FROM "IndicesControl"
            WHERE symbol = $1 AND is_active = true
            ORDER BY type, group_name
        `;

        const { rows } = await tsClient.query(query, [symbol]);

        const result = {
            indices: [],
            sectors: [],
            themes: []
        };

        rows.forEach(row => {
            const item = {
                name: row.group_name,
                exchange: row.exchange
            };

            if (row.type === 'index') {
                result.indices.push(item);
            } else if (row.type === 'sector') {
                result.sectors.push(item);
            } else if (row.type === 'theme') {
                result.themes.push(item);
            }
        });

        return result;
    },

    /**
     * Legacy method: Get index stocks (for backward compatibility)
     * Maps old index names to new system
     */
    async getIndexStocks(indexName) {
        // Map commonly used index names
        const indexMap = {
            'NIFTY50': 'NIFTY',
            'NIFTY 50': 'NIFTY',
            'BANKNIFTY': 'BANKNIFTY',
            'BANK NIFTY': 'BANKNIFTY',
            'FINNIFTY': 'FINNIFTY',
            'SENSEX': 'Sensex',
            'BSE100': 'BSE 100'
        };

        const mappedName = indexMap[indexName.toUpperCase()] || indexName;

        return await this.getConstituents(mappedName, 'index');
    }
};

module.exports = IndicesModel;
