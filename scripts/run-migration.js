const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const config = {
    host: 'ec2-13-233-176-13.ap-south-1.compute.amazonaws.com',
    port: 5432,
    user: 'victory_user',
    password: 'Victory@#123',
    database: 'victory_market_db',
    ssl: { rejectUnauthorized: false } // Usually needed for AWS/Remote DBs
};

async function runMigration() {
    const client = new Client(config);
    try {
        await client.connect();
        console.log('✅ Connected to database');

        const sqlPath = path.join(__dirname, '../src/Migration/create_internal_token_list.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running migration...');
        await client.query(sql);
        console.log('✅ Migration completed successfully!');

    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
