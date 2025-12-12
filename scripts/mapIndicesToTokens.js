const fs = require('fs');
const path = require('path');
const { createClient } = require('redis');
const { Client } = require('pg');
const { env } = require('../src/config/env');

const redisClient = createClient({ url: env.redis.url });

// Adjust DB config and fix env path usage
const dbConfig = {
    user: env.pg.user,
    host: env.pg.host,
    database: env.pg.database,
    password: env.pg.password,
    port: env.pg.port,
};

const pgClient = new Client(dbConfig);

async function run() {
    try {
        await redisClient.connect();
        await pgClient.connect();
        console.log('Connected to DB and Redis.');

        // 1. Fetch Index Names from DB
        console.log('Fetching Indices from IndicesControl...');
        // We select distinct group_name
        const indexQuery = `SELECT DISTINCT group_name FROM "IndicesControl" WHERE is_active = true`;
        const res = await pgClient.query(indexQuery);
        const indices = res.rows;
        console.log(`Found ${indices.length} unique indices/sectors.`);

        // 2. Load Angel Master
        const masterPath = path.join(__dirname, '../src/config/OpenAPIScripMaster.json');
        if (!fs.existsSync(masterPath)) {
            console.error('OpenAPIScripMaster.json not found!');
            process.exit(1);
        }
        console.log('Loading Angel Master List (this may take a moment)...');
        const masterData = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
        console.log(`Loaded ${masterData.length} tokens.`);

        const updates = [];
        const notFound = [];

        // 3. Map Index -> Token
        for (const idx of indices) {
            const myName = idx.group_name;
            const myNameUpper = myName.toUpperCase();

            // Heuristic Mapping
            let angelName = myName;

            if (myNameUpper === 'NIFTY') angelName = 'Nifty 50';
            if (myNameUpper === 'BANKNIFTY' || myNameUpper === 'BANK NIFTY') angelName = 'Nifty Bank';
            if (myNameUpper === 'FINNIFTY') angelName = 'Nifty Fin Service';
            if (myNameUpper === 'SENSEX') angelName = 'SENSEX';
            if (myNameUpper === 'NIFTY AUTO') angelName = 'Nifty Auto';
            if (myNameUpper === 'NIFTY IT') angelName = 'Nifty IT';
            if (myNameUpper === 'NIFTY METAL') angelName = 'Nifty Metal';
            if (myNameUpper === 'NIFTY FMCG') angelName = 'Nifty FMCG';
            if (myNameUpper === 'NIFTY PHARMA') angelName = 'Nifty Pharma';
            if (myNameUpper === 'NIFTY REALTY') angelName = 'Nifty Realty';
            if (myNameUpper === 'NIFTY MEDIA') angelName = 'Nifty Media';
            if (myNameUpper === 'NIFTY PSU BANK') angelName = 'Nifty PSU Bank';
            if (myNameUpper === 'NIFTY PRIVATE BANK') angelName = 'Nifty Pvt Bank';
            if (myNameUpper === 'NIFTY CONSUMER DURABLES') angelName = 'Nifty Cons Durable';
            if (myNameUpper === 'NIFTY OIL & GAS') angelName = 'Nifty Oil & Gas';

            // Search Logic
            let match = masterData.find(t => {
                const tSym = t.symbol.toLowerCase();
                const aName = angelName.toLowerCase();
                // Angel symbols generally match our expected name
                // e.g. "Nifty 50", "SENSEX"
                return tSym === aName &&
                    (t.instrumenttype === 'AMXIDX' || t.instrumenttype === 'INDEX') &&
                    t.exch_seg === (myNameUpper === 'SENSEX' ? 'BSE' : 'NSE');
            });

            // Special Fallbacks
            if (!match && myNameUpper === 'SENSEX') {
                match = masterData.find(t => t.symbol === 'SENSEX' && t.exch_seg === 'BSE');
            }
            if (!match && myNameUpper.includes('BANK')) {
                // Try "Nifty Bank" again if fuzzy
                match = masterData.find(t => t.symbol === 'Nifty Bank' && t.exch_seg === 'NSE');
            }

            if (match) {
                console.log(`✅ MATCH: ${myName} -> ${match.symbol} (${match.token})`);

                updates.push({
                    token: match.token,
                    symbol: myName, // Mapped to our Alias ('NIFTY')
                    name: match.name,
                    exch_seg: match.exch_seg,
                    instrumenttype: match.instrumenttype
                });

                // Pre-fill Redis
                const key = `PRICE:LATEST:${myName}`;
                const dummy = {
                    symbol: myName,
                    price: 0,
                    ts: new Date().toISOString(),
                    volume: 0,
                    status: 'Waiting for WebSocket Update'
                };
                const exists = await redisClient.exists(key);
                if (!exists) {
                    await redisClient.set(key, JSON.stringify(dummy));
                }

            } else {
                console.log(`❌ NO MATCH: ${myName} (Tried: ${angelName})`);
                notFound.push(myName);
            }
        }

        // 4. Update InternalTokenList
        if (updates.length > 0) {
            console.log(`Updating InternalTokenList with ${updates.length} indices...`);
            for (const u of updates) {
                // Using unquoted InternalTokenList to allow PG to resolve case (default lowercase usually)
                const q = `
                    INSERT INTO InternalTokenList (token, symbol, name, exch_seg, instrumenttype, tradeable, ltp, volume, updated_at)
                    VALUES ($1, $2, $3, $4, $5, true, 0, 0, NOW())
                    ON CONFLICT (token) DO UPDATE 
                    SET symbol = $2, tradeable = true, updated_at = NOW(); 
                `;
                await pgClient.query(q, [u.token, u.symbol, u.name, u.exch_seg, u.instrumenttype]);
            }
            console.log('Database Updated Successfully.');
        }

        // 5. Save Map File
        fs.writeFileSync(path.join(__dirname, 'indicesTokenMap.json'), JSON.stringify(updates, null, 2));
        console.log(`Saved mapping map.`);

    } catch (err) {
        console.error('Script Error:', err);
    } finally {
        await redisClient.disconnect();
        await pgClient.end();
    }
}

run();
