/**
 * Import stocks from stockList.json file
 * Populates internaltokenlist with all stocks from the JSON file
 */

const { logger } = require('../config/logger.js');
const { timescaleClient } = require('../db/timescaleClient.js');
const stockList = require('../data/stockList.json');

async function importFromStockList() {
    try {
        console.log('[ImportStocks] Connecting to database...');
        await timescaleClient.connect();
        console.log('[ImportStocks] Connected.');

        console.log(`[ImportStocks] Loading ${stockList.stocks.length} stocks from stockList.json...`);

        // Step 1: Clear existing data
        console.log('[ImportStocks] Clearing existing data from internaltokenlist...');
        await timescaleClient.query('TRUNCATE TABLE internaltokenlist');
        console.log('[ImportStocks] ✓ Table cleared');

        // Step 2: Get unique stocks
        const uniqueStocks = [];
        const seen = new Set();

        for (const stock of stockList.stocks) {
            const key = `${stock.symbol}-${stock.exchange}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueStocks.push(stock);
            }
        }

        console.log(`[ImportStocks] Processing ${uniqueStocks.length} unique stocks...`);

        let successCount = 0;
        let notFoundCount = 0;
        const notFoundSymbols = [];
        const stats = {
            byExchange: {},
            byIndex: {}
        };

        for (const stock of uniqueStocks) {
            try {
                // Look up stock details from angelonetokenlist
                // Try multiple variants to find the stock
                const symbolVariants = [
                    `${stock.symbol}-EQ`,
                    stock.symbol,
                    `${stock.symbol.replace('&', '')}`,
                    `${stock.symbol.replace('&', '')}-EQ`
                ];

                let found = false;

                for (const symbol of symbolVariants) {
                    const lookupQuery = `
                        SELECT token, symbol, name, exch_seg, instrumenttype
                        FROM angelonetokenlist
                        WHERE symbol ILIKE $1
                        AND exch_seg = $2
                        LIMIT 1
                    `;

                    const lookupResult = await timescaleClient.query(lookupQuery, [symbol, stock.exchange]);

                    if (lookupResult.rows.length > 0) {
                        const stockData = lookupResult.rows[0];

                        // Check if already exists
                        const checkQuery = `SELECT 1 FROM internaltokenlist WHERE symbol = $1 LIMIT 1`;
                        const checkResult = await timescaleClient.query(checkQuery, [stockData.symbol]);

                        if (checkResult.rows.length === 0) {
                            // Insert into internaltokenlist
                            const insertQuery = `
                                INSERT INTO internaltokenlist (
                                    token, symbol, name, exch_seg, instrumenttype, tradeable
                                )
                                VALUES ($1, $2, $3, $4, $5, $6)
                            `;

                            await timescaleClient.query(insertQuery, [
                                stockData.token,
                                stockData.symbol,
                                stockData.name,
                                stockData.exch_seg,
                                stockData.instrumenttype,
                                true
                            ]);

                            console.log(`[ImportStocks] ✓ ${stockData.symbol} (${stock.index})`);
                            successCount++;

                            // Track stats
                            stats.byExchange[stock.exchange] = (stats.byExchange[stock.exchange] || 0) + 1;
                            stats.byIndex[stock.index] = (stats.byIndex[stock.index] || 0) + 1;
                        }
                        found = true;
                        break;
                    }
                }

                if (!found) {
                    notFoundSymbols.push(`${stock.exchange}/${stock.symbol} (${stock.index})`);
                    notFoundCount++;
                }

            } catch (error) {
                logger.error(`[ImportStocks] Error processing ${stock.symbol}:`, error.message);
                notFoundCount++;
            }
        }

        console.log('\n[ImportStocks] ===== SUMMARY =====');
        console.log(`[ImportStocks] Total symbols in JSON: ${stockList.stocks.length}`);
        console.log(`[ImportStocks] Unique symbols processed: ${uniqueStocks.length}`);
        console.log(`[ImportStocks] Successfully added: ${successCount}`);
        console.log(`[ImportStocks] Not found: ${notFoundCount}`);

        console.log('\n[ImportStocks] Breakdown by Exchange:');
        Object.entries(stats.byExchange).forEach(([exchange, count]) => {
            console.log(`  ${exchange}: ${count} stocks`);
        });

        console.log('\n[ImportStocks] Breakdown by Index (top 10):');
        const topIndices = Object.entries(stats.byIndex)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        topIndices.forEach(([index, count]) => {
            console.log(`  ${index}: ${count} stocks`);
        });

        if (notFoundSymbols.length > 0 && notFoundSymbols.length < 50) {
            console.log('\n[ImportStocks] Symbols not found:');
            notFoundSymbols.forEach(symbol => console.log(`  - ${symbol}`));
        } else if (notFoundSymbols.length >= 50) {
            console.log(`\n[ImportStocks] ${notFoundSymbols.length} symbols not found (too many to list)`);
        }

        // Show final count
        const countQuery = 'SELECT COUNT(*) as count FROM internaltokenlist';
        const countResult = await timescaleClient.query(countQuery);
        console.log(`\n[ImportStocks] Total stocks in internaltokenlist: ${countResult.rows[0].count}`);

    } catch (error) {
        logger.error('[ImportStocks] Fatal error:', error);
        throw error;
    } finally {
        await timescaleClient.end();
    }
}

// Run if called directly
if (require.main === module) {
    importFromStockList()
        .then(() => {
            console.log('[ImportStocks] Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('[ImportStocks] Script failed:', error);
            process.exit(1);
        });
}

module.exports = importFromStockList;
