// -----------------------------------------------------------------------------
// fetch100Stocks1Year.js – Fetch 1 year of DAILY data for top 100 NSE stocks
// Converted to CommonJS
// -----------------------------------------------------------------------------

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const { tsClient, initTimescale } = require('../db/timescaleClient.js');
const { env } = require('../config/env.js');

// CommonJS automatically provides __dirname
// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Format a Date object as "YYYY-MM-DD HH:MM" in IST.
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
 * Fetch 1 year of DAILY candles for a single stock
 */
async function fetchDailyCandles(symbol, token, fromDateStr, toDateStr) {
  console.log(`\n📊 Fetching ${symbol} (token: ${token})`);
  console.log(`   Range: ${fromDateStr} → ${toDateStr}`);

  try {
    const response = await axios.post(
      'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData',
      {
        exchange: 'NSE',
        symboltoken: token,
        interval: 'ONE_DAY',
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
          'X-PrivateKey': env.angel.apiKey,
          Authorization: `Bearer ${env.angel.authToken}`,
          'X-ClientCode': env.angel.clientCode,
        },
      }
    );

    if (response.data && response.data.status && response.data.data) {
      console.log(`   ✅ Got ${response.data.data.length} daily candles`);
      return response.data.data;
    } else {
      console.warn('   ⚠️  No data:', response.data.message || response.data);
      return [];
    }
  } catch (err) {
    console.error('   ❌ Request failed:', err.response?.data || err.message);
    return [];
  }
}

/**
 * Save daily candles to database
 */
async function saveCandles(symbol, candles) {
  if (!candles || candles.length === 0) {
    console.log('   ⚠️  No candles to save');
    return 0;
  }

  console.log(`   💾 Saving ${candles.length} candles for ${symbol}...`);
  const CHUNK_SIZE = 1000;
  let totalSaved = 0;

  for (let i = 0; i < candles.length; i += CHUNK_SIZE) {
    const chunk = candles.slice(i, i + CHUNK_SIZE);
    const values = [];
    const params = [];
    let idx = 1;

    for (const c of chunk) {
      values.push(
        `($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6})`
      );

      params.push(
        symbol,
        new Date(c[0]),
        parseFloat(c[1]),
        parseFloat(c[2]),
        parseFloat(c[3]),
        parseFloat(c[4]),
        parseInt(c[5]) || 0
      );

      idx += 7;
    }

    const query = `
      INSERT INTO candles_ohlc (symbol, ts, open, high, low, close, volume)
      VALUES ${values.join(', ')}
      ON CONFLICT (symbol, ts) DO NOTHING
    `;

    try {
      await tsClient.query(query, params);
      totalSaved += chunk.length;
    } catch (err) {
      console.error('   ❌ DB error:', err.message);
    }
  }

  console.log(`   ✅ Saved ${totalSaved} candles for ${symbol}`);
  return totalSaved;
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting 1-year DAILY data fetch for top 100 stocks...\n');
  await initTimescale();

  const stocksPath = path.join(__dirname, 'top100stocks.json');
  const rawStocks = JSON.parse(fs.readFileSync(stocksPath, 'utf8'));

  const stocks = Object.keys(rawStocks).map(key => ({
    token: key,
    symbol: rawStocks[key]
  }));

  console.log("📋 Loaded", stocks.length, "stocks");


  console.log(`📋 Loaded ${stocks.length} stocks\n`);

  // Date range
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  oneYearAgo.setHours(9, 15, 0, 0);
  now.setHours(15, 30, 0, 0);

  const fromDate = formatDate(oneYearAgo);
  const toDate = formatDate(now);

  console.log(`📅 Date Range: ${fromDate} → ${toDate}\n`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];

    console.log(`\n[${i + 1}/${stocks.length}] Processing ${stock.symbol}...`);

    try {
      const candles = await fetchDailyCandles(
        stock.symbol,
        stock.token,
        fromDate,
        toDate
      );

      if (candles && candles.length > 0) {
        await saveCandles(stock.symbol, candles);
        successCount++;
      } else {
        failCount++;
      }

      // Rate limiting
      if (i < stocks.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (e) {
      console.error(`❌ Error processing ${stock.symbol}:`, e.message);
      failCount++;
    }
  }

  console.log('\n\n🎉 Data fetch complete!');
  console.log(`   ✅ Success: ${successCount} stocks`);
  console.log(`   ❌ Failed: ${failCount} stocks`);

  await tsClient.end();
  process.exit(0);
}

// Execute
main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
