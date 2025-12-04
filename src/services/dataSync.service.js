const { angelService } = require('./angel.service.js');
const { insertCandle, hasHistoricalData } = require('../models/candleOhlc.model.js');

class DataSyncService {
  constructor() {
    this.isRunning = false;
    this.syncInterval = null;
    this.symbols = ['SBIN', 'INFY', 'TCS'];
  }

  async syncHistoricalData(symbol, force = false) {
    try {
      // Check if data already exists (unless force is true)
      if (!force) {
        const dataExists = await hasHistoricalData(symbol);

        if (dataExists) {
          return { symbol, skipped: true, message: 'Data already exists' };
        }
      }

      const symbolToken = angelService.getSymbolToken(symbol);

      // 1. Fetch Daily Candles (Last 3 Months)
      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 3); // 3 months ago

      const formatDate = (d) => d.toISOString().split('T')[0] + ' 09:15';


      const dailyData = await angelService.getHistoricalData({
        symbolToken,
        interval: 'ONE_DAY',
        fromDate: formatDate(fromDate),
        toDate: formatDate(toDate),
      });

      let insertedDailyCandles = 0;
      if (dailyData && Array.isArray(dailyData)) {
        for (const candle of dailyData) {
          try {
            await insertCandle({
              symbol,
              ts: candle[0],
              open: candle[1],
              high: candle[2],
              low: candle[3],
              close: candle[4],
              volume: candle[5],
            });
            insertedDailyCandles++;
          } catch (err) {
            // Ignore duplicate key errors (data already exists)
            if (err.code !== '23505') {
              console.error(`[DataSync] ${symbol}: Error inserting daily candle:`, err.message);
            }
          }
        }
      }

      // 2. Fetch 1-Minute Candles (Last 30 Days) - Store as FULL OHLC
      const fromDateIntraday = new Date();
      fromDateIntraday.setDate(fromDateIntraday.getDate() - 30); // Last 30 days


      const minuteData = await angelService.getHistoricalData({
        symbolToken,
        interval: 'ONE_MINUTE',
        fromDate: formatDate(fromDateIntraday),
        toDate: formatDate(toDate),
      });

      let insertedMinuteCandles = 0;
      if (minuteData && Array.isArray(minuteData)) {
        for (const candle of minuteData) {
          try {
            // Store minute candles as FULL OHLC data (not just close price!)
            await insertCandle({
              symbol,
              ts: candle[0],      // timestamp
              open: candle[1],    // open
              high: candle[2],    // high
              low: candle[3],     // low
              close: candle[4],   // close
              volume: candle[5],  // volume
            });
            insertedMinuteCandles++;
          } catch (err) {
            // Ignore duplicate key errors
            if (err.code !== '23505') {
              console.error(`[DataSync] ${symbol}: Error inserting minute candle:`, err.message);
            }
          }
        }
      }

      return { symbol, dailyCandles: insertedDailyCandles, minuteCandles: insertedMinuteCandles };
    } catch (error) {
      console.error(`[DataSync] ${symbol}: ✗ Failed -`, error.message);
      return { symbol, error: error.message };
    }
  }

  async syncAllSymbols(force = false) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const results = [];

      // Sync each symbol sequentially to avoid rate limiting
      for (const symbol of this.symbols) {
        const result = await this.syncHistoricalData(symbol, force);
        results.push(result);

        // Small delay between symbols to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds delay
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const totalDailyCandles = results.reduce((sum, r) => sum + (r.dailyCandles || 0), 0);
      const totalMinuteCandles = results.reduce((sum, r) => sum + (r.minuteCandles || 0), 0);
      const skipped = results.filter(r => r.skipped).length;

      return results;
    } catch (error) {
      console.error('[DataSync] ✗ Sync failed:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  // One-time sync on startup (only if database is empty)
  async initialSync() {
    // Check if any data exists for the first symbol
    const dataExists = await hasHistoricalData(this.symbols[0]);

    if (dataExists) {
      console.log('[DataSync] Data already exists, skipping initial sync');
      return;
    }

    await this.syncAllSymbols(false);
  }

  // Manual sync (can be triggered via API)
  async manualSync(force = false) {
    return await this.syncAllSymbols(force);
  }
}

const dataSyncService = new DataSyncService();

module.exports = { dataSyncService }