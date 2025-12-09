const cors = require('cors');
const express = require('express');
const { errorHandler1 } = require('./middleware/error.middleware.js');
const { notFound } = require('./middleware/notFound.middleware.js');
const routes = require('./routes/index.js');

function createApp() {
  const app = express();

  const corsOptions = {
    origin: [
      'http://localhost:3000',
      'http://localhost:8081',
      'http://localhost:8082',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8081',
      'http://127.0.0.1:8082',
      'https://data.inrise.in',
      'https://inrise.in',
    ],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.use(express.json());

  app.use(routes);

  app.use(notFound);
  app.use(errorHandler1);

  return app;
}

module.exports = { createApp }
