const { WebSocketV2 } = require('smartapi-javascript');
const { env } = require('../../config/env.js');
const { logger } = require('../../config/logger.js');
const { angelService } = require('../angel.service.js');
const { redisClient } = require('../../db/redisClient.js');
const realtimeAggregatorService = require('./realtimeAggregator.service.js');

// Token Map (Loaded from DB)
let tokenMap = {};

class AngelWebSocketService {
  constructor() {
    this.ws = null;
    this.subscribers = [];
    this.isConnected = false;
    this.reconnectTimer = null;
    this.tickCount = 0;
    this.lastTickTime = null;
  }

  async init(broadcastCallback) {
    this.broadcastCallback = broadcastCallback;

    // Load Token Map from DB
    try {
      const TradingModel = require('../../models/trading.model.js');
      tokenMap = await TradingModel.getTokenMap();
      logger.info(`[AngelWS-V1] Loaded ${Object.keys(tokenMap).length} tokens from Database.`);
    } catch (err) {
      logger.error(`[AngelWS-V1] Failed to load token map: ${err.message}`);
    }

    this.connect();
  }

  connect() {
    try {
      const { apiKey, clientCode, feedToken, authToken } = env.angel;

      // Debug: Log what we're getting from env
      console.log('[AngelWS] Credentials check:', {
        apiKey: apiKey ? `${apiKey.substring(0, 4)}...` : 'MISSING',
        clientCode: clientCode ? `${clientCode.substring(0, 4)}...` : 'MISSING',
        feedToken: feedToken ? `${feedToken.substring(0, 20)}...` : 'MISSING',
        authToken: authToken ? `${authToken.substring(0, 20)}...` : 'MISSING'
      });

      if (!apiKey || !clientCode || !feedToken || !authToken) {
        logger.error('[AngelWS] Missing credentials for WebSocket connection');
        logger.error('[AngelWS] Missing:', {
          apiKey: !apiKey,
          clientCode: !clientCode,
          feedToken: !feedToken,
          authToken: !authToken
        });
        return;
      }


      // Debug: Log exact values being passed to WebSocketV2
      const wsConfig = {
        jwttoken: authToken,
        apikey: apiKey,
        clientcode: clientCode,
        feedtoken: feedToken,
      };
      console.log('[AngelWS] WebSocketV2 config:', JSON.stringify(wsConfig, null, 2));

      this.ws = new WebSocketV2(wsConfig);

      this.ws.connect().then(() => {
        this.isConnected = true;
        logger.info('[AngelWS] Connected to Angel One WebSocket');
        this.subscribeToTokens();
      }).catch((err) => {
        logger.error(`[AngelWS] Connection failed: ${err.message}`);
        this.scheduleReconnect();
      });

      this.ws.on('tick', (data) => {
        // Log raw data from Angel to understand the exact structure
        console.log('[AngelWS] Raw tick payload:', JSON.stringify(data.price, data.symbol, data.last_traded_quantity));

        // Some SmartAPI implementations send an array of ticks; handle both cases
        if (Array.isArray(data)) {
          data.forEach((tick) => this.handleTick(tick));
        } else {
          this.handleTick(data);
        }
      });

      this.ws.on('error', (err) => {
        logger.error(`[AngelWS] Error: ${err.message}`);
      });

      this.ws.on('close', () => {
        logger.warn('[AngelWS] Connection closed');
        this.isConnected = false;
        this.scheduleReconnect();
      });

    } catch (error) {
      logger.error(`[AngelWS] Setup error: ${error.message}`);
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info('[AngelWS] Attempting to reconnect...');
      this.connect();
    }, 5000);
  }

  subscribeToTokens() {
    if (!this.isConnected) return;

    // Map symbols to tokens
    // Note: HDFCBANK disabled until data is fetched with correct token (1333)
    const symbols = ['SBIN', 'INFY', 'TCS', 'RELIANCE', 'HDFCBANK'];
    const tokens = symbols.map(s => angelService.getSymbolToken(s));

    const jsonReq = {
      correlationID: "abcde12345",
      action: 1, // 1 = Subscribe
      mode: 2,   // 2 = Full Quote (includes OHLC)
      exchangeType: 1, // 1 = NSE
      tokens: tokens
    };

    this.ws.fetchData(jsonReq);
    logger.info(`[AngelWS] Subscribed to tokens: ${tokens.join(', ')}`);
  }

  async handleTick(tick) {
    // Map token back to symbol if possible
    if (!tick || !tick.token) return;

    // Angel WS is sending token like '"3045"' (with embedded quotes),
    // so normalize it before lookup.
    const normalizedToken = String(tick.token).replace(/"/g, '');

    const symbol = tokenMap[normalizedToken];
    if (!symbol) return;

    // Angel sends prices in paise (e.g. 97390 = 973.90),
    // so convert to rupees before using.
    const rawPrice = Number(tick.last_traded_price);
    if (isNaN(rawPrice) || rawPrice <= 0) {
      console.warn(`[AngelWS] Invalid price for ${symbol}: ${rawPrice}`);
      return;
    }
    const price = rawPrice / 100;

    // Validate price is within reasonable range
    // Stock prices should be between 1 and 100,000 rupees
    if (price < 1 || price > 100000) {
      console.warn(`[AngelWS] Price out of range for ${symbol}: ${price}`);
      return;
    }

    // Prefer exchange timestamp if provided, fallback to server receipt time
    // Angel One sends timestamps in milliseconds
    let ts;
    if (tick.exchange_timestamp) {
      const ms = Number(tick.exchange_timestamp);
      if (!isNaN(ms)) {
        // Exchange timestamp is already in IST (Indian market time)
        ts = new Date(ms);
      } else {
        // Fallback: use current IST time
        ts = new Date();
      }
    } else {
      // No exchange timestamp, use current time (server is assumed to be in IST or we convert)
      ts = new Date();
    }

    // Log with IST time for debugging
    const istTime = new Date(ts.getTime()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log('[AngelWS] Realtime tick', {
      token: normalizedToken,
      symbol,
      price,
      utc: ts.toISOString(),
      ist: istTime
    });

    // Track tick reception
    this.tickCount++;
    this.lastTickTime = ts;

    if (this.tickCount % 10 === 0) {
      logger.info(`[AngelWS] Received ${this.tickCount} ticks. Latest: ${symbol} @ ${price} at ${istTime}`);
    }

    // Convert OHLC values from paise to rupees and validate
    const convertAndValidate = (value) => {
      const num = Number(value);
      if (isNaN(num) || num <= 0) return null;
      const converted = num / 100;
      return (converted >= 1 && converted <= 100000) ? converted : null;
    };

    const open = convertAndValidate(tick.open_price_day);
    const high = convertAndValidate(tick.high_price_day);
    const low = convertAndValidate(tick.low_price_day);
    const close = convertAndValidate(tick.close_price_day);

    // 1. Save latest price to Redis (High Performance)
    try {
      const tickData = {
        symbol,
        price,
        ts: ts.toISOString(),
        open: open || price,
        high: high || price,
        low: low || price,
        close: close || price,
        volume: tick.volume_trade_for_day || 0
      };
      // Store as simple string for fast retrieval
      await redisClient.set(`PRICE:LATEST:${symbol}`, JSON.stringify(tickData));

      // Also publish to a channel if we want to use Redis Pub/Sub later
      // await redisClient.publish('PRICE_UPDATES', JSON.stringify(tickData));
    } catch (err) {
      logger.error(`[AngelWS] Redis Error: ${err.message}`);
    }

    // 1b. Save tick to DB (for 1s resolution) 
    // DISABLED FOR PERFORMANCE: We only save aggregated candles now.
    /*
    try {
        // We don't await this to avoid blocking
      insertTick({ symbol, ts, value: price }).catch(err => logger.error(`DB Insert Error: ${err.message}`));
  } catch (err) {
      // ignore
  }
  */

    // 2. Aggregate into 1-minute candles (for 1m+ resolution)
    try {
      realtimeAggregatorService.onTick(symbol, price, 0, ts);
    } catch (err) {
      logger.error(`[AngelWS] Aggregation error: ${err.message}`);
    }

    // 3. Broadcast to frontend (only send valid data)
    if (this.broadcastCallback) {
      this.broadcastCallback({
        symbol,
        ts: ts.toISOString(),
        value: price,
        // Add other fields if needed for candlestick construction on frontend
        open: open || price,
        high: high || price,
        low: low || price,
        close: close || price,
        volume: tick.volume_trade_for_day || 0
      });
    }
  }
}

module.exports = new AngelWebSocketService();
