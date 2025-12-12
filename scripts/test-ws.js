const WebSocket = require('ws');

const url = 'ws://192.168.1.14:3002/ws/prices';
console.log(`Connecting to ${url}...`);

const ws = new WebSocket(url);

ws.on('open', () => {
    console.log('✅ Connected successfully to IP!');
    ws.close();
});

ws.on('error', (err) => {
    console.error('❌ Connection failed:', err.message);
    if (err.message.includes('404')) {
        console.error('Status: 404 Not Found (Server reachable but path incorrect)');
    } else {
        console.error('Possible firewall or binding issue');
    }
});
