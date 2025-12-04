const { Pool } = require("pg");

//default connection
// const defaultConfig = {
//     user: 'postgres',
//     host: 'localhost',
//     database: 'Victory',
//     password: 'user@011',
//     port: 5432
// }

const defaultConfig = {
    user: 'victory_user',
    host: '13.233.176.13',
    database: 'victory_db',
    password: 'Victory@#123',
    port: 5432
}

let defaultPool;

//connecting to the database
const getPool = () => {
    if (!defaultPool) {
        defaultPool = new Pool(defaultConfig);
    }
    return defaultPool;
};

module.exports = getPool;