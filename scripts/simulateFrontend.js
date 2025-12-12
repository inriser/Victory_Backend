const { Client } = require('pg');
const { env } = require('../src/config/env');

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
        console.log('Connected.');

        // 1. Fetch Watchlist
        // Emulating TradingModel.getWatchlist
        const watchlistRes = await client.query(`SELECT symbol, exch_seg FROM InternalTokenList WHERE tradeable = TRUE`);
        console.log(`Watchlist Size: ${watchlistRes.rowCount}`);
        const watchlist = watchlistRes.rows;

        // 2. Fetch Index Stocks
        const indexName = 'NIFTY';
        // Emulating IndicesModel.getConstituents
        // Note: type defaulted to 'index' usually, but here checking just by group_name first
        const indexRes = await client.query(`SELECT symbol FROM "IndicesControl" WHERE group_name = $1`, [indexName]);
        console.log(`Index '${indexName}' Constituents: ${indexRes.rowCount}`);
        const indexSymbols = new Set(indexRes.rows.map(r => r.symbol));

        // 3. Filter
        const filtered = watchlist.filter(s => indexSymbols.has(s.symbol));
        console.log(`Filtered Count: ${filtered.length}`);
        if (filtered.length > 0) {
            console.log('Sample Filtered Exchange:', filtered[0].exch_seg);
        }

        if (filtered.length === 0) {
            console.log('--- DIAGNOSTICS ---');
            const sampleIdx = [...indexSymbols][0];
            if (sampleIdx) {
                console.log(`Sample Index Symbol: '${sampleIdx}'`);
                // Check if this symbol exists in InternalTokenList AT ALL (ignoring tradeable)
                const checkRes = await client.query(`SELECT * FROM InternalTokenList WHERE symbol = $1`, [sampleIdx]);
                if (checkRes.rowCount > 0) {
                    console.log(`Symbol '${sampleIdx}' found in InternalTokenList. Tradeable status: ${checkRes.rows[0].tradeable}`);
                } else {
                    console.log(`Symbol '${sampleIdx}' NOT found in InternalTokenList.`);
                }
            } else {
                console.log("Index has no constituents.");
            }
        } else {
            console.log('Logic Valid. Frontend should display data.');
        }

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}
run();
