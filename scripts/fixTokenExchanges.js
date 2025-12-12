const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { env } = require('../src/config/env');

// Connect to DB
const client = new Client({
    user: env.pg.user,
    host: env.pg.host,
    database: env.pg.database,
    password: env.pg.password,
    port: env.pg.port,
});

async function run() {
    try {
        await client.connect();
        console.log('Connected to DB.');

        // 1. Load Scrip Master (Optimized to Map)
        console.log('Loading Scrip Master...');
        const masterPath = path.join(__dirname, '../src/config/OpenAPIScripMaster.json');
        const rawMaster = fs.readFileSync(masterPath, 'utf8');
        const masterData = JSON.parse(rawMaster);

        // Create Lookup Map: Symbol -> NSE Token Data
        // Filtering for NSE Equity (EQ) to ensure we get the right instrument
        const nseMap = new Map();
        masterData.forEach(item => {
            if (item.exch_seg === 'NSE' && item.symbol.endsWith('-EQ')) {
                // Remove -EQ for lookup key to match our clean symbols
                const cleanSym = item.symbol.replace('-EQ', '');
                nseMap.set(cleanSym, item);
            }
        });
        console.log(`Loaded ${nseMap.size} NSE Equity instruments.`);

        // 2. Fetch BSE Stocks from InternalTokenList
        console.log('Fetching BSE stocks from InternalTokenList...');
        const res = await client.query(`SELECT token, symbol, exch_seg FROM InternalTokenList WHERE exch_seg = 'BSE'`);
        const bseStocks = res.rows;
        console.log(`Found ${bseStocks.length} BSE stocks.`);

        // 3. Update to NSE
        let updatedCount = 0;
        for (const stock of bseStocks) {
            const nseItem = nseMap.get(stock.symbol);
            if (nseItem) {
                // Check if target token already exists
                const existingRes = await client.query(`SELECT token FROM InternalTokenList WHERE token = $1`, [nseItem.token]);

                if (existingRes.rowCount > 0) {
                    // NSE entry already exists, so just DELETE the BSE entry to remove duplicate
                    await client.query(`DELETE FROM InternalTokenList WHERE token = $1`, [stock.token]);
                    console.log(`Deleted Duplicate BSE(${stock.token}) for ${stock.symbol} (NSE exists)`);
                } else {
                    // NSE entry does not exist, UPDATE the BSE entry
                    await client.query(
                        `UPDATE InternalTokenList SET token = $1, exch_seg = 'NSE', instrumenttype = 'EQ' WHERE symbol = $2 AND exch_seg = 'BSE'`,
                        [nseItem.token, stock.symbol]
                    );
                    console.log(`Converted ${stock.symbol}: BSE(${stock.token}) -> NSE(${nseItem.token})`);
                }
                updatedCount++;
            } else {
                console.log(`Skipping ${stock.symbol}: No NSE equivalent found in Master.`);
            }
        }

        console.log(`Completed. Updated ${updatedCount} stocks.`);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
