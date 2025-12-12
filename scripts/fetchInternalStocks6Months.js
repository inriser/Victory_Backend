/**
 * fetchInternalStocks6Months.js
 * Fetches 1-minute OHLC data for all tradeable stocks in InternalTokenList
 * Saves to 1Min_OHLC, 5Min_OHLC, and candles_ohlc (daily) tables
 */

const axios = require('axios');
const { tsClient, initTimescale } = require('../src/db/timescaleClient.js');
const { env } = require('../src/config/env.js');

// Rate limiting: delay between API calls (ms)
const RATE_LIMIT_DELAY = 500;

// How many days of 1-minute data to fetch
const DAYS_TO_FETCH = 7;

/**
 * Format a Date object as "YYYY-MM-DD HH:MM" for Angel One API
 */
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
}

/**
 * Fetch 1-minute candles from Angel One API
 */
async function fetch1MinCandles(symbol, token, exchange, fromDateStr, toDateStr) {
    try {
        const response = await axios.post(
            'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData',
            {
                exchange: exchange || 'NSE',
                symboltoken: token,
                interval: 'ONE_MINUTE',
                fromdate: fromDateStr,
                todate: toDateStr,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-UserType': 'USER',
                    'X-SourceID': 'WEB',
                    'X-ClientLocalIP': '127.0.0.1',
                    'X-ClientPublicIP': '127.0.0.1',
                    'X-MACAddress': 'mac_address',
                    'X-PrivateKey': 'i2mbnczo',  // Historical API Key
                    Authorization: `Bearer ${env.angel.authToken}`,
                },
            }
        );

        if (response.data && response.data.status && response.data.data) {
            return response.data.data;
        } else {
            return [];
        }
    } catch (err) {
        console.error(`   ❌ API Error for ${symbol}:`, err.response?.data?.message || err.message);
        return [];
    }
}

/**
 * Save candles to 1Min_OHLC table
 */
async function save1MinCandles(symbol, exchange, candles) {
    if (!candles || candles.length === 0) return 0;

    const CHUNK_SIZE = 500;
    let totalSaved = 0;

    for (let i = 0; i < candles.length; i += CHUNK_SIZE) {
        const chunk = candles.slice(i, i + CHUNK_SIZE);
        const values = [];
        const params = [];
        let idx = 1;

        for (const c of chunk) {
            values.push(
                `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`
            );

            params.push(
                symbol,
                exchange || 'NSE',
                new Date(c[0]),
                parseFloat(c[1]),
                parseFloat(c[2]),
                parseFloat(c[3]),
                parseFloat(c[4]),
                parseInt(c[5]) || 0
            );

            idx += 8;
        }

        const query = `
            INSERT INTO "1Min_OHLC" ("Symbol", "ExchangeID", "Time", "Open", "High", "Low", "Close", "Volume")
            VALUES ${values.join(', ')}
            ON CONFLICT ("Symbol", "Time") DO UPDATE SET
                "Open" = EXCLUDED."Open",
                "High" = EXCLUDED."High",
                "Low" = EXCLUDED."Low",
                "Close" = EXCLUDED."Close",
                "Volume" = EXCLUDED."Volume"
        `;

        try {
            await tsClient.query(query, params);
            totalSaved += chunk.length;
        } catch (err) {
            console.error(`   ❌ 1Min DB Error for ${symbol}:`, err.message);
        }
    }

    return totalSaved;
}

/**
 * Aggregate 1-min candles to 5-min and save to 5Min_OHLC table
 */
async function save5MinCandles(symbol, exchange, candles) {
    if (!candles || candles.length === 0) return 0;

    // Group candles by 5-minute buckets
    const buckets = {};

    for (const c of candles) {
        const time = new Date(c[0]);
        // Round down to nearest 5 minutes
        const mins = time.getMinutes();
        const bucket5Min = Math.floor(mins / 5) * 5;
        time.setMinutes(bucket5Min, 0, 0);

        const key = time.toISOString();

        if (!buckets[key]) {
            buckets[key] = {
                time: time,
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4]),
                volume: parseInt(c[5]) || 0
            };
        } else {
            buckets[key].high = Math.max(buckets[key].high, parseFloat(c[2]));
            buckets[key].low = Math.min(buckets[key].low, parseFloat(c[3]));
            buckets[key].close = parseFloat(c[4]); // Last close
            buckets[key].volume += parseInt(c[5]) || 0;
        }
    }

    const aggregated = Object.values(buckets);
    if (aggregated.length === 0) return 0;

    const CHUNK_SIZE = 500;
    let totalSaved = 0;

    for (let i = 0; i < aggregated.length; i += CHUNK_SIZE) {
        const chunk = aggregated.slice(i, i + CHUNK_SIZE);
        const values = [];
        const params = [];
        let idx = 1;

        for (const c of chunk) {
            values.push(
                `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`
            );

            params.push(
                symbol,
                exchange || 'NSE',
                c.time,
                c.open,
                c.high,
                c.low,
                c.close,
                c.volume
            );

            idx += 8;
        }

        const query = `
            INSERT INTO "5Min_OHLC" ("Symbol", "ExchangeID", "Time", "Open", "High", "Low", "Close", "Volume")
            VALUES ${values.join(', ')}
            ON CONFLICT ("Symbol", "Time") DO UPDATE SET
                "Open" = EXCLUDED."Open",
                "High" = EXCLUDED."High",
                "Low" = EXCLUDED."Low",
                "Close" = EXCLUDED."Close",
                "Volume" = EXCLUDED."Volume"
        `;

        try {
            await tsClient.query(query, params);
            totalSaved += chunk.length;
        } catch (err) {
            console.error(`   ❌ 5Min DB Error for ${symbol}:`, err.message);
        }
    }

    return totalSaved;
}

/**
 * Aggregate 1-min candles to daily and save to DayEnd_OHLC table
 */
async function saveDailyCandles(symbol, exchange, candles) {
    if (!candles || candles.length === 0) return 0;

    // Group candles by day
    const buckets = {};

    for (const c of candles) {
        const time = new Date(c[0]);
        // Round to start of day
        time.setHours(0, 0, 0, 0);

        const key = time.toISOString();

        if (!buckets[key]) {
            buckets[key] = {
                time: time,
                open: parseFloat(c[1]),
                high: parseFloat(c[2]),
                low: parseFloat(c[3]),
                close: parseFloat(c[4]),
                volume: parseInt(c[5]) || 0
            };
        } else {
            buckets[key].high = Math.max(buckets[key].high, parseFloat(c[2]));
            buckets[key].low = Math.min(buckets[key].low, parseFloat(c[3]));
            buckets[key].close = parseFloat(c[4]); // Last close
            buckets[key].volume += parseInt(c[5]) || 0;
        }
    }

    const aggregated = Object.values(buckets);
    if (aggregated.length === 0) return 0;

    let totalSaved = 0;

    for (const c of aggregated) {
        const query = `
            INSERT INTO dayend_ohlc ("Symbol", "ExchangeID", "Date", "Open", "High", "Low", "Close", "Volume")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT ("Symbol", "Date") DO UPDATE SET
                "Open" = EXCLUDED."Open",
                "High" = EXCLUDED."High",
                "Low" = EXCLUDED."Low",
                "Close" = EXCLUDED."Close",
                "Volume" = EXCLUDED."Volume"
        `;

        try {
            await tsClient.query(query, [symbol, exchange || 'NSE', c.time, c.open, c.high, c.low, c.close, c.volume]);
            totalSaved++;
        } catch (err) {
            console.error(`   ❌ Daily DB Error for ${symbol}:`, err.message);
        }
    }

    return totalSaved;
}

/**
 * Main function
 */
async function main() {
    console.log(`🚀 Fetching ${DAYS_TO_FETCH} days of data for InternalTokenList stocks...\n`);
    console.log(`   Will save to: 1Min_OHLC, 5Min_OHLC, and candles_ohlc (daily)\n`);

    await initTimescale();

    // Get all tradeable stocks from InternalTokenList
    const stocksResult = await tsClient.query(`
        SELECT token, symbol, exch_seg 
        FROM InternalTokenList 
        WHERE tradeable = TRUE
        ORDER BY symbol ASC
    `);

    const stocks = stocksResult.rows;
    console.log(`📋 Found ${stocks.length} tradeable stocks\n`);

    // Date range: X days ago to today
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - DAYS_TO_FETCH);

    startDate.setHours(9, 15, 0, 0);
    now.setHours(15, 30, 0, 0);

    const fromDate = formatDate(startDate);
    const toDate = formatDate(now);

    console.log(`📅 Date Range: ${fromDate} → ${toDate}\n`);

    let successCount = 0;
    let failCount = 0;
    let total1Min = 0;
    let total5Min = 0;
    let totalDaily = 0;

    for (let i = 0; i < stocks.length; i++) {
        const stock = stocks[i];
        const progress = `[${i + 1}/${stocks.length}]`;

        process.stdout.write(`${progress} ${stock.symbol} (${stock.exch_seg})... `);

        try {
            const candles = await fetch1MinCandles(
                stock.symbol,
                stock.token,
                stock.exch_seg,
                fromDate,
                toDate
            );

            if (candles && candles.length > 0) {
                // Save to all three tables
                const saved1m = await save1MinCandles(stock.symbol, stock.exch_seg, candles);
                const saved5m = await save5MinCandles(stock.symbol, stock.exch_seg, candles);
                const savedDaily = await saveDailyCandles(stock.symbol, stock.exch_seg, candles);

                total1Min += saved1m;
                total5Min += saved5m;
                totalDaily += savedDaily;

                console.log(`✅ 1m:${saved1m} | 5m:${saved5m} | daily:${savedDaily}`);
                successCount++;
            } else {
                console.log(`⚠️  No data`);
                failCount++;
            }

            // Rate limiting
            if (i < stocks.length - 1) {
                await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
            }
        } catch (e) {
            console.log(`❌ Error: ${e.message}`);
            failCount++;
        }
    }

    console.log('\n\n🎉 Data fetch complete!');
    console.log(`   ✅ Success: ${successCount} stocks`);
    console.log(`   ⚠️  Failed/No Data: ${failCount} stocks`);
    console.log(`   📊 1Min Candles: ${total1Min}`);
    console.log(`   📊 5Min Candles: ${total5Min}`);
    console.log(`   📊 Daily Candles: ${totalDaily}`);

    await tsClient.end();
    process.exit(0);
}

// Execute
main().catch((err) => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
});
