const { WebSocketServer } = require('ws');

let wss = null;

function attachPriceSocket(server) {
  console.log('[PriceSocket] Initializing WebSocketServer on path: /ws/prices');
  wss = new WebSocketServer({ server, path: '/ws/prices' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'info', message: 'Connected to prices stream (v2)' }));
  });

  setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: 'ping', ts: new Date().toISOString() }));
      }
    });
  }, 30000);

  // DISABLED: Using real Angel One data instead of simulated ticks
  // startSimulatedTicks(wss);

  return wss;
}

function broadcastPrice(data) {
  if (!wss) return;

  const payload = JSON.stringify({
    type: 'price',
    data: data
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

module.exports = { attachPriceSocket, broadcastPrice }
