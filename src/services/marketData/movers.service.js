const { logger } = require('../../config/logger.js');
const { redisClient } = require('../../db/redisClient.js');
const { timescaleClient } = require('../../db/timescaleClient.js');

const REDIS_GAINERS_KEY = 'market:gainers';
const REDIS_LOSERS_KEY = 'market:losers';
const REDIS_STOCK_PREFIX = 'stock:';
const CACHE_TTL = 86400; // 24 hours TTL for stock details

/**
 * Update a single stock's ranking in Redis sorted sets
 * @param {string} symbol - Stock symbol
 * @param {number} percentChange - Percent change from previous close
 * @param {number} price - Current price
 * @param {number} change - Price change
 * @param {string} name - Stock name (optional)
 */
async function updateMoverInRedis(symbol, percentChange, price, change, name = null) {
  try {
    if (!redisClient.isOpen) {
      logger.warn('[Movers] Redis not connected, skipping update');
      return;
    }

    // Add to appropriate sorted set
    if (percentChange >= 0) {
      // Gainer - higher score = better rank
      await redisClient.zAdd(REDIS_GAINERS_KEY, { score: percentChange, value: symbol });
      // Remove from losers if present
      await redisClient.zRem(REDIS_LOSERS_KEY, symbol);
    } else {
      // Loser - use absolute value, higher score = bigger loss
      await redisClient.zAdd(REDIS_LOSERS_KEY, { score: Math.abs(percentChange), value: symbol });
      // Remove from gainers if present
      await redisClient.zRem(REDIS_GAINERS_KEY, symbol);
    }

    // Store stock details in hash
    const stockKey = `${REDIS_STOCK_PREFIX}${symbol}`;
    await redisClient.hSet(stockKey, {
      symbol,
      name: name || symbol,
      price: price.toString(),
      change: change.toString(),
      percentChange: percentChange.toString(),
      updatedAt: new Date().toISOString()
    });

    // Set TTL on stock details
    await redisClient.expire(stockKey, CACHE_TTL);

  } catch (error) {
    logger.error(`[Movers] Error updating Redis for ${symbol}: ${error.message}`);
  }
}

/**
 * Get top movers from Redis
 * @param {number} limit - Number of gainers/losers to return
 * @returns {Object} { gainers, losers }
 */

async function getMoversFromRedis(limit = 5) {
  try {
    if (!redisClient.isOpen) {
      logger.warn('[Movers] Redis client not open');
      return null;
    }

    // Get top gainers (highest scores) - get from end of sorted set
    const gainerSymbols = await redisClient.sendCommand(['ZREVRANGE', REDIS_GAINERS_KEY, '0', String(limit - 1)]);
    logger.info(`[Movers] Found ${gainerSymbols.length} gainer symbols:`, gainerSymbols);

    // Get top losers (lowest scores, which are most negative) - get from start
    // We store absolute value for losers, so higher score = bigger loss
    // So we need ZREVRANGE to get the biggest losers first
    const loserSymbols = await redisClient.sendCommand(['ZREVRANGE', REDIS_LOSERS_KEY, '0', String(limit - 1)]);
    logger.info(`[Movers] Found ${loserSymbols.length} loser symbols:`, loserSymbols);

    // Fetch details for each stock
    const gainers = await Promise.all(
      gainerSymbols.map(async (symbol) => {
        const stockKey = `${REDIS_STOCK_PREFIX}${symbol}`;
        const details = await redisClient.hGetAll(stockKey);
        if (!details || !details.symbol) return null;
        return {
          symbol: details.symbol,
          name: details.name || details.symbol,
          price: parseFloat(details.price),
          change: parseFloat(details.change),
          percentChange: parseFloat(details.percentChange)
        };
      })
    );

    const losers = await Promise.all(
      loserSymbols.map(async (symbol) => {
        const stockKey = `${REDIS_STOCK_PREFIX}${symbol}`;
        const details = await redisClient.hGetAll(stockKey);
        if (!details || !details.symbol) return null;
        return {
          symbol: details.symbol,
          name: details.name || details.symbol,
          price: parseFloat(details.price),
          change: parseFloat(details.change),
          percentChange: parseFloat(details.percentChange)
        };
      })
    );

    // Filter out nulls
    const result = {
      gainers: gainers.filter(g => g !== null),
      losers: losers.filter(l => l !== null)
    };

    logger.info(`[Movers] Returning ${result.gainers.length} gainers and ${result.losers.length} losers`);
    return result;

  } catch (error) {
    logger.error(`[Movers] Error fetching from Redis: ${error.message}`);
    return null;
  }
}
/**
 * Populate Redis from TimescaleDB (initial load or fallback)
 */


async function populateRedisFromDB() {
  logger.info('[Movers] Populating Redis from market_snapshot...');

  const query = `
    SELECT 
      symbol,
      latest_price as ltp,
      prev_close,
      ((latest_price - prev_close) / prev_close) * 100 as change_percent,
      (latest_price - prev_close) as price_change
    FROM market_snapshot
    WHERE prev_close > 0
  `;

  try {
    const result = await timescaleClient.query(query);

    for (const row of result.rows) {
      await updateMoverInRedis(
        row.symbol,
        parseFloat(row.change_percent),
        parseFloat(row.ltp),
        parseFloat(row.price_change),
        row.symbol
      );

      // Also set the previous close key for the WebSocket service to use
      const prevCloseKey = `PRICE:PREV_CLOSE:${row.symbol}`;
      await redisClient.set(prevCloseKey, row.prev_close.toString());
    }

    logger.info(`[Movers] Populated Redis with ${result.rows.length} stocks`);
  } catch (error) {
    logger.error(`[Movers] Error populating Redis: ${error.message}`);
  }
}

/**
 * Get Top Gainers and Losers
 * Returns top N gainers and top N losers based on 24h change
 * @param {number} limit - Number of gainers/losers to return
 * @returns {Object} { gainers, losers }
 */

async function getMarketMovers(limit = 5) {
  try {
    // Try Redis first
    const redisData = await getMoversFromRedis(limit);

    if (redisData && redisData.gainers.length > 0 && redisData.losers.length > 0) {
      logger.info(`[Movers] Returning ${redisData.gainers.length} gainers and ${redisData.losers.length} losers from Redis`);
      return redisData;
    }

    // If Redis is empty, return empty data instead of querying slow DB
    // The background population will fill Redis eventually
    logger.warn('[Movers] Redis cache empty, returning empty data (background population in progress)');
    return {
      gainers: [],
      losers: []
    };

  } catch (error) {
    logger.error('[Movers] Error fetching market movers:', error);
    // Return empty data instead of throwing
    return {
      gainers: [],
      losers: []
    };
  }
}

module.exports = { getMarketMovers, populateRedisFromDB, getMoversFromRedis, updateMoverInRedis };
