const dotenv = require('dotenv');

dotenv.config();

const env = {
  port: Number(process.env.PORT) || 3002,

  pg: {
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
  },

  angel: {
    apiKey: process.env.HISTORICAL_API_KEY,
    clientCode: process.env.SMART_CLIENT_CODE,
    authToken: process.env.SMART_AUTH_TOKEN,
    feedToken: process.env.SMART_FEED_TOKEN
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
};


module.exports = { env }