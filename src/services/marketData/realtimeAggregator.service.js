const { newOhlcQueries } = require('../../queries/index.js');
const { timescaleClient } = require('../../db/timescaleClient.js');
const { redisClient } = require('../../db/redisClient.js');
const { logger } = require('../../config/logger.js');

class RealtimeAggregatorService {
  constructor() {
    // Map<symbol, { startTime: number, open, high, low, close, volume, exchange }>
    this.activeCandles = new Map();

    // Periodic flush timer to save candles even if no new ticks arrive
    this.flushInterval = setInterval(() => {
      this.flushOldCandles();
    }, 60000); // Check every minute
  }

  /**
   * Process a new tick and aggregate into 1-minute candles
   * @param {string} symbol 
   * @param {number} price 
   * @param {number} volume (optional, incremental volume)
   * @param {Date} ts 
   */
  async onTick(symbol, price, volume = 0, ts = new Date()) {
    const timestamp = ts.getTime();
    // Calculate start of the minute for this tick
    const minuteStart = Math.floor(timestamp / 60000) * 60000;

    let candle = this.activeCandles.get(symbol);

    // If we have a candle but it belongs to a previous minute, flush it
    if (candle && candle.startTime < minuteStart) {
      await this.flushCandle(symbol, candle);
      candle = null; // Force creation of new candle
    }

    // Initialize new candle if needed
    if (!candle) {
      candle = {
        startTime: minuteStart,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: volume,
        exchange: 'NSE' // Defaulting to NSE as requested
      };
      this.activeCandles.set(symbol, candle);
    } else {
      // Update existing candle
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
      candle.close = price;
      candle.volume += volume;
    }
  }

  async flushCandle(symbol, candle) {
    try {
      const ts = new Date(candle.startTime);

      const candleData = {
        Symbol: symbol,
        ExchangeID: candle.exchange,
        Time: ts,
        Open: candle.open,
        High: candle.high,
        Low: candle.low,
        Close: candle.close,
        Volume: candle.volume
      };

      // 1. Save to Redis (latest 1-min candle)
      const redisKey = `TickerTick:1MIN:${symbol}`;
      await redisClient.set(redisKey, JSON.stringify(candleData));

      // 2. Insert into 1Min_OHLC DB table
      const query = newOhlcQueries.insert1MinCandle(candleData);
      await timescaleClient.query(query);

      // 3. Check for 5-minute aggregation
      await this.checkAndAggregate5Min(symbol, candle.exchange, ts);

    } catch (err) {
      // Ignore duplicate key errors
      if (err.code !== '23505') {
        logger.error(`[Aggregator] Failed to flush candle for ${symbol}: ${err.message}`);
      }
    }
  }

  /**
   * Check if we need to create a 5-minute candle
   * @param {string} symbol 
   * @param {string} exchange 
   * @param {Date} minuteTime 
   */
  async checkAndAggregate5Min(symbol, exchange, minuteTime) {
    const minute = minuteTime.getMinutes();

    // If minute is 4, 9, 14, 19... (ends of 5-min blocks: 0-4, 5-9)
    if ((minute + 1) % 5 === 0) {
      // Calculate start time of the 5-minute block
      const endTime = new Date(minuteTime.getTime() + 60000); // Start of next minute
      const startTime = new Date(endTime.getTime() - 5 * 60000); // 5 minutes ago

      try {
        // Aggregate from DB
        const aggQuery = newOhlcQueries.aggregateTo5Min(symbol, startTime, endTime);
        const result = await timescaleClient.query(aggQuery);

        if (result.rows.length > 0) {
          const aggCandle = result.rows[0];

          // Insert into 5Min_OHLC
          const insertQuery = newOhlcQueries.insert5MinCandle({
            Symbol: aggCandle.Symbol,
            ExchangeID: aggCandle.ExchangeID || exchange,
            Time: startTime, // 5-min candle time is the start of the interval
            Open: parseFloat(aggCandle.Open),
            High: parseFloat(aggCandle.High),
            Low: parseFloat(aggCandle.Low),
            Close: parseFloat(aggCandle.Close),
            Volume: parseFloat(aggCandle.Volume)
          });

          await timescaleClient.query(insertQuery);
          // logger.info(`[Aggregator] Created 5-min candle for ${symbol} at ${startTime.toISOString()}`);
        }
      } catch (err) {
        logger.error(`[Aggregator] Failed to aggregate 5-min candle for ${symbol}: ${err.message}`);
      }
    }
  }

  /**
   * Flush all candles that are older than the current minute
   */
  async flushOldCandles() {
    const now = Date.now();
    const currentMinuteStart = Math.floor(now / 60000) * 60000;

    const promises = [];

    for (const [symbol, candle] of this.activeCandles.entries()) {
      if (candle.startTime < currentMinuteStart) {
        promises.push(this.flushCandle(symbol, candle));
        this.activeCandles.delete(symbol);
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
      logger.info(`[Aggregator] Flushed ${promises.length} old candles`);
    }
  }
}

module.exports = new RealtimeAggregatorService();
