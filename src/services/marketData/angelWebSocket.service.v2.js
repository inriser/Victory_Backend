const { Parser } = require('binary-parser');
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const WebSocket = require('ws');
const { timescaleClient } = require('../../db/timescaleClient.js');
const { env } = require('../../config/env.js');
const { logger } = require('../../config/logger.js');
const { redisClient } = require('../../db/redisClient.js');
const realtimeAggregatorService = require('./realtimeAggregator.service.js');
const TradingModel = require('../../models/trading.model.js');




// Token Map (Loaded from DB)
let tokenMap = {};

// We will load this in init()
// const loadTokenMap = async () => { ... }

class AngelWebSocketServiceV2 {
  constructor() {
    this.ws = null;
    this.subscribers = [];
    this.isConnected = false;
    this.reconnectTimer = null;
    this.tickCount = 0;
    this.lastTickTime = null;
    this.heartbeatInterval = null;

    // Initialize Parsers
    this.initParsers();
  }

  initParsers() {
    // Helper to convert byte array to string
    const tokenFormatter = (arr) => String.fromCharCode(...arr).replace(/\0/g, '');
    const numberFormatter = (val) => Number(val);

    // Common Header Parser
    this.headerParser = new Parser()
      .endianness('little')
      .uint8('subscription_mode')
      .uint8('exchange_type')
      .array('token', { type: 'int8', length: 25, formatter: tokenFormatter })
      .int64('sequence_number', { formatter: numberFormatter })
      .int64('exchange_timestamp', { formatter: numberFormatter });

    // Mode 1: LTP Parser
    this.ltpParser = new Parser()
      .endianness('little')
      .nest('header', { type: this.headerParser })
      .int64('last_traded_price', { formatter: numberFormatter });

    // Mode 2: Quote Parser (Full OHLC)
    this.quoteParser = new Parser()
      .endianness('little')
      .nest('header', { type: this.headerParser })
      .int64('last_traded_price', { formatter: numberFormatter })
      .int64('last_traded_quantity', { formatter: numberFormatter })
      .int64('average_traded_price', { formatter: numberFormatter })
      .int64('volume_trade_for_day', { formatter: numberFormatter })
      .int64('total_buy_quantity', { formatter: numberFormatter })
      .int64('total_sell_quantity', { formatter: numberFormatter })
      .int64('open_price_day', { formatter: numberFormatter })
      .int64('high_price_day', { formatter: numberFormatter })
      .int64('low_price_day', { formatter: numberFormatter })
      .int64('close_price_day', { formatter: numberFormatter });
  }

  async init(broadcastCallback) {
    this.broadcastCallback = broadcastCallback;

    try {
      // Load tokens from DB
      tokenMap = await TradingModel.getTokenMap();
      logger.info(`[AngelWS-V2] Loaded ${Object.keys(tokenMap).length} tokens from Database.`);
    } catch (err) {
      logger.error(`[AngelWS-V2] Failed to load token map from DB: ${err.message}`);
    }

    this.connect();
    this.startSnapshotUpdater();
  }

  connect() {
    try {
      const { apiKey, clientCode, feedToken, authToken } = env.angel;

      if (!apiKey || !clientCode || !feedToken || !authToken) {
        logger.error('[AngelWS-V2] Missing credentials for WebSocket connection');
        return;
      }

      logger.info('[AngelWS-V2] Connecting to Angel One WebSocket...');

      // Angel One WebSocket URL
      const wsUrl = 'wss://smartapisocket.angelone.in/smart-stream';

      // Create WebSocket with proper headers
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': authToken,
          'x-api-key': apiKey,
          'x-client-code': clientCode,
          'x-feed-token': feedToken,
        },
      });

      // Set binary type to arraybuffer
      this.ws.binaryType = 'arraybuffer';

      this.ws.on('open', () => {
        this.isConnected = true;
        logger.info('[AngelWS-V2] Connected to Angel One WebSocket');
        this.subscribeToTokens();
        this.startHeartbeat();
      });

      this.ws.on('message', (data) => {
        try {
          // Handle heartbeat/ping messages (string)
          if (typeof data === 'string') {
            if (data === 'ping' || data === 'pong') return;
            // Try JSON parse
            try {
              const parsed = JSON.parse(data);
              this.handleMessage(parsed);
            } catch (e) {
              // Ignore non-JSON strings
            }
            return;
          }

          // Handle Binary Data (Buffer or ArrayBuffer)
          if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
            this.handleBinaryTick(data);
          }
        } catch (error) {
          logger.error(`[AngelWS-V2] Message handling error: ${error.message}`);
        }
      });

      this.ws.on('error', (err) => {
        logger.error(`[AngelWS-V2] WebSocket error: ${err.message}`);
      });

      this.ws.on('close', (code, reason) => {
        logger.warn(`[AngelWS-V2] Connection closed. Code: ${code}, Reason: ${reason}`);
        this.isConnected = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      });

    } catch (error) {
      logger.error(`[AngelWS-V2] Setup error: ${error.message}`);
      this.scheduleReconnect();
    }
  }

  startHeartbeat() {
    // Send ping every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info('[AngelWS-V2] Attempting to reconnect...');
      this.connect();
    }, 5000);
  }

  subscribeToTokens() {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn('[AngelWS-V2] Cannot subscribe - not connected');
      return;
    }

    // Use tokens from the loaded map
    const tokens = Object.keys(tokenMap);

    if (tokens.length === 0) {
      logger.warn('[AngelWS-V2] No tokens to subscribe to!');
      return;
    }

    const subscriptionMessage = {
      correlationID: 'abcde12345',
      action: 1, // 1 = Subscribe
      params: {
        mode: 2, // 2 = Full Quote (includes OHLC)
        tokenList: [
          {
            exchangeType: 1, // 1 = NSE
            tokens: tokens
          }
        ]
      }
    };

    logger.info(`[AngelWS-V2] Subscribing to ${tokens.length} tokens...`);
    this.ws.send(JSON.stringify(subscriptionMessage));
  }

  handleMessage(message) {
    // Handle JSON messages (mostly subscription responses)
    if (message.action === 'subscribe') {
      logger.info('[AngelWS-V2] Subscription confirmed');
    } else {
      logger.info('[AngelWS-V2] Received JSON:', JSON.stringify(message).substring(0, 100));
    }
  }

  handleBinaryTick(data) {
    try {
      // Convert Buffer to Buffer (if needed)
      const buffer = Buffer.from(data);

      // Read first byte for subscription mode
      const mode = buffer.readUInt8(0);

      let parsedData = null;

      if (mode === 1) { // LTP
        parsedData = this.ltpParser.parse(buffer);
      } else if (mode === 2) { // Quote
        parsedData = this.quoteParser.parse(buffer);
      } else {
        // logger.debug(`[AngelWS-V2] Unknown mode: ${mode}`);
        return;
      }

      if (parsedData) {
        this.processTick(parsedData);
      }

    } catch (err) {
      logger.error(`[AngelWS-V2] Parse error: ${err.message}. Buffer length: ${data.length || data.byteLength}`);
    }
  }

  async processTick(data) {
    const { header, last_traded_price, open_price_day, high_price_day, low_price_day, close_price_day, volume_trade_for_day } = data;

    // Normalize token
    const normalizedToken = header.token.replace(/"/g, '').trim();

    // Lookup symbol from map
    const tokenInfo = tokenMap[normalizedToken];

    if (!tokenInfo) {
      // logger.warn(`[AngelWS-V2] Unknown token: ${normalizedToken}`);
      return;
    }

    const symbol = tokenInfo.symbol;
    const exchange = tokenInfo.exchange; // Available for future use if needed

    // Convert paise to rupees
    const price = last_traded_price / 100;
    const open = (open_price_day || last_traded_price) / 100;
    const high = (high_price_day || last_traded_price) / 100;
    const low = (low_price_day || last_traded_price) / 100;
    const close = (close_price_day || last_traded_price) / 100;

    // Timestamp
    const ts = new Date(header.exchange_timestamp || Date.now());
    const istTime = ts.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    try {
      const tickData = {
        symbol,
        price,
        ts: ts.toISOString(),
        open,
        high,
        low,
        close,
        volume: volume_trade_for_day || 0
      };
      await redisClient.set(`PRICE:LATEST:${symbol}`, JSON.stringify(tickData));

      // Also store previous close for percent change calculation
      const prevCloseKey = `PRICE:PREV_CLOSE:${symbol}`;
      const existingPrevClose = await redisClient.get(prevCloseKey);

      // If we don't have a previous close yet, use the open price as fallback
      if (!existingPrevClose) {
        await redisClient.set(prevCloseKey, open.toString());
      }

      // Calculate percent change from previous close
      const prevClose = existingPrevClose ? parseFloat(existingPrevClose) : open;
      if (prevClose > 0) {
        const percentChange = ((price - prevClose) / prevClose) * 100;
        const priceChange = price - prevClose;

        // Update gainers/losers in Redis
        const { updateMoverInRedis } = require('./movers.service.js');
        await updateMoverInRedis(symbol, percentChange, price, priceChange, symbol);
      }

    } catch (err) {
      logger.error(`[AngelWS-V2] Redis Error: ${err.message}`);
    }

    // 2. Aggregate
    try {

      realtimeAggregatorService.onTick(symbol, price, volume_trade_for_day || 0, ts);
    } catch (err) {
      logger.error(`[AngelWS-V2] Aggregation error: ${err.message}`);
    }

    // 3. Broadcast
    if (this.broadcastCallback) {
      this.broadcastCallback({
        symbol,
        ts: ts.toISOString(),
        value: price,
        open,
        high,
        low,
        close,
        volume: volume_trade_for_day || 0
      });
    }
  }
  startSnapshotUpdater() {
    // Update market_snapshot table every minute
    setInterval(async () => {
      try {
        if (!this.isConnected) return;

        logger.info('[AngelWS-V2] Syncing market_snapshot from Redis...');

        // Get all latest price keys
        const keys = await redisClient.keys('PRICE:LATEST:*');
        if (keys.length === 0) return;

        const prices = [];
        for (const key of keys) {
          const data = await redisClient.get(key);
          if (data) {
            prices.push(JSON.parse(data));
          }
        }

        if (prices.length === 0) return;

        // 1. Batch update market_snapshot using unnest for performance
        // We conditionally update prev_close if the new timestamp is from a different day
        // This handles the "rollover" when market opens on a new day (e.g., Monday morning)
        const marketSnapshotQuery = `
          UPDATE market_snapshot as m
          SET 
            prev_close = CASE 
              WHEN v.latest_ts::date > m.latest_ts::date THEN m.latest_price 
              ELSE m.prev_close 
            END,
            prev_close_ts = CASE 
              WHEN v.latest_ts::date > m.latest_ts::date THEN m.latest_ts 
              ELSE m.prev_close_ts 
            END,
            latest_price = v.latest_price,
            latest_ts = v.latest_ts::timestamptz,
            updated_at = NOW()
          FROM (VALUES 
            ${prices.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}::numeric, $${i * 3 + 3})`).join(',')}
          ) as v(symbol, latest_price, latest_ts)
          WHERE m.symbol = v.symbol
        `;

        const marketSnapshotValues = [];
        prices.forEach(p => {
          marketSnapshotValues.push(p.symbol, p.price, p.ts);
        });

        await timescaleClient.query(marketSnapshotQuery, marketSnapshotValues);

        logger.info(`[AngelWS-V2] Synced ${prices.length} stocks to market_snapshot`);

        // 2. Batch update InternalTokenList with LTP and Volume
        try {
          const { internalTokenListQueries } = require('../../queries/index.js');

          // Prepare data for InternalTokenList update
          const stockUpdates = prices.map(p => ({
            symbol: p.symbol,
            ltp: p.price,
            volume: p.volume || 0
          }));

          const internalTokenQuery = internalTokenListQueries.batchUpdateLtpAndVolume(stockUpdates);

          if (internalTokenQuery) {
            await timescaleClient.query(internalTokenQuery.text, internalTokenQuery.values);
            logger.info(`[AngelWS-V2] Synced ${stockUpdates.length} stocks to InternalTokenList`);
          }
        } catch (internalErr) {
          // Log error but don't fail the entire sync
          logger.error(`[AngelWS-V2] InternalTokenList sync error: ${internalErr.message}`);
        }

      } catch (err) {
        logger.error(`[AngelWS-V2] Snapshot sync error: ${err.message}`);
      }
    }, 60000); // 1 minute
  }
}

const angelWebSocketServiceV2 = new AngelWebSocketServiceV2();

module.exports = { angelWebSocketServiceV2 };