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
        console.log('Connected to database.\n');
        
        // Stocks visible in user's screenshot
        const testStocks = ['AUROPHARM', 'AUROPHARMA', 'BIOCON', 'GLAND', 'GLENMARK', 'LUPIN'];
        
        console.log('=== Checking candles_ohlc (Daily Data) ===');
        for (const symbol of testStocks) {
            const res = await client.query(
                `SELECT symbol, ts, open, close FROM candles_ohlc WHERE symbol = $1 ORDER BY ts DESC LIMIT 3`,
                [symbol]
            );
            console.log(`${symbol}: ${res.rowCount} rows`);
            if (res.rows.length > 0) {
                res.rows.forEach(r => console.log(`  ${r.ts} | Open: ${r.open} | Close: ${r.close}`));
            }
        }
        
        console.log('\n=== Checking 1Min_OHLC (Intraday Data) ===');
        for (const symbol of testStocks) {
            const res = await client.query(
                `SELECT "Symbol", "Time", "Close" FROM "1Min_OHLC" WHERE "Symbol" = $1 ORDER BY "Time" DESC LIMIT 3`,
                [symbol]
            );
            console.log(`${symbol}: ${res.rowCount} rows`);
            if (res.rows.length > 0) {
                res.rows.forEach(r => console.log(`  ${r.Time} | Close: ${r.Close}`));
            }
        }
        
        console.log('\n=== Sample symbols in candles_ohlc ===');
        const sampleRes = await client.query(`SELECT DISTINCT symbol FROM candles_ohlc LIMIT 20`);
        console.log('Symbols:', sampleRes.rows.map(r => r.symbol).join(', '));

    } catch (e) {
        console.error(e);
    } finally {
        await client.end();
    }
}
run();
