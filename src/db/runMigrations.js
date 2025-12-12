/**
 * Run Database Migrations
 * 
 * Executes SQL migration files in order
 * Usage: node src/db/runMigrations.js
 */

const { tsClient } = require('./timescaleClient.js');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
    try {
        console.log('Connecting to database...');
        await tsClient.connect();

        console.log('Running migrations...');

        const migrationFile = '006_create_indices_control_table.sql';
        const filePath = path.join(__dirname, 'migrations', migrationFile);

        if (!fs.existsSync(filePath)) {
            console.error(`Migration file ${migrationFile} not found!`);
            process.exit(1);
        }

        console.log(`Executing ${migrationFile}...`);
        const sql = fs.readFileSync(filePath, 'utf-8');

        await tsClient.query(sql);

        console.log('Migration completed successfully!');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await tsClient.end();
    }
}

runMigrations();
