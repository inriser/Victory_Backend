/**
 * Populate InternalTokenList with provided stock symbols
 * Looks up token data from AngelOneTokenList and inserts into internaltokenlist
 */

const { logger } = require('../config/logger.js');
const { timescaleClient } = require('../db/timescaleClient.js');

// Stock symbols to add to internal list
const STOCK_SYMBOLS = [
    'TRENT', 'INFY', 'TCS', 'SBIN', 'HDFCBANK', 'RELIANCE', 'ICICIBANK', 'BAJFINANCE',
    'NTPC', 'TMPV', 'LT', 'ETERNAL', 'ITC', 'POWERGRID', 'M&M', 'HCLTECH',
    'HINDUNILVR', 'BEL', 'KOTAKBANK', 'TATASTEEL', 'MARUTI', 'AXISBANK', 'BAJAJFINSV',
    'BHARTIARTL', 'SUNPHARMA', 'ADANIPORTS', 'ASIANPAINT', 'TECHM', 'ULTRACEMCO', 'TITAN',
    'YESBANK', 'IDFCFIRSTB', 'BANKBARODA', 'INDUSINDBK', 'FEDERALBNK', 'INDIGO', 'SHRIRAMFIN',
    'SUZLON', 'CANBK', 'TATAPOWER', 'DIXON', 'ADANIENT', 'HAL', 'LTIM', 'BAJAJ-AUTO',
    'VEDL', 'WIPRO', 'PNB', 'HINDALCO', 'COALINDIA', 'ADANIPOWER', 'SHREECEM', 'IDEA',
    'WAAREEENER', 'JSWENERGY', 'KAYNES', 'M&MFIN', 'OBEROIRLTY', 'BDL', 'IREDA', 'NATIONALUM',
    'METROBRAND', 'BAJAJHFL', 'INDUSTOWER', 'PATANJALI', 'RVNL', 'LINDEINDIA', 'POWERINDIA',
    'HEROMOTOCO', 'MAZDOCK', 'COFORGE', 'LTF', 'PAYTM', 'MAHABANK', 'NAM-INDIA', 'AUBANK',
    'DEEPAKNTR', 'POLICYBZR', 'INDIANB', 'NMDC', 'BHEL', 'SCHAEFFLER', 'PERSISTENT', 'ABCAPITAL',
    'SAIL', 'COCHINSHIP', 'HUDCO', 'GODREJPROP', 'NLCINDIA', 'ASHOKLEY', 'MPHASIS', 'PREMIERENE',
    'BANKINDIA', 'LTTS', 'SWIGGY', 'NTPCGREEN', 'POONAWALLA', 'BANDHANBNK', 'SBICARD', 'OFSS',
    'CONCOR', 'LUPIN', 'SJVN', 'MOTILALOFS', 'TIINDIA', 'GLENMARK', 'TATAELXSI', 'PETRONET',
    'BIOCON', 'ASTRAL', 'LLOYDSME', 'UCOBANK', 'FORTIS', 'NYKAA', 'EXIDEIND', 'MARICO',
    'AUROPHARMA', 'TATATECH', '360ONE', 'JSWINFRA', 'APLAPOLLO', 'CENTRALBK', 'MUTHOOTFIN',
    'CGPOWER', 'LICHSGFIN', 'KPITTECH', 'SOLARINDS', 'GMRAIRPORT', 'PRESTIGE', 'BLUESTARCO',
    'ESCORTS', 'CUMMINSIND', 'KEI', 'SUPREMEIND', 'MRF', 'ACC', 'MFSL', 'TORNTPOWER',
    'SRF', 'KALYANKJIL', 'ENRIN', 'CRISIL', 'IRB', 'VMM', 'COLPAL', 'PAGEIND',
    'IRCTC', 'PIIND', 'NAUKRI', 'MEDANTA', 'ALKEM', 'UNOMINDA', 'EMAMILTD', 'SONACOMS',
    'JKCEMENT', 'NHPC', 'THERMAX', 'HINDPETRO', 'HDFCAMC', 'PHOENIXLTD', 'GLAXO', 'IPCALAB',
    'COROMANDEL', 'BHARATFORG', 'ZYDUSLIFE', 'OIL', 'BALKRISIND', 'IGL', 'ATGL', 'TATACOMM',
    'GODREJIND', 'SYNGENE', 'AJANTPHARM', 'ABBOTINDIA', 'APOLLOTYRE', 'PGHH', 'JUBLFOOD', 'JSL',
    'KPRMILL', 'AWL', 'UBL', 'GICRE', 'VOLTAS', 'AIAENG', 'PSB', 'FLUOROCHEM',
    'BERGEPAINT', 'ENDURANCE', 'BHARTIHEXA', 'GLAND', 'NIACL', 'DALBHARAT', 'GUJGASLTD', '3MINDIA',
    'SUNTV', 'HONAUT', 'HINDCOPPER', 'AFFLE', 'WOCKPHARMA', 'HSCL', 'BRIGADE', 'MCX',
    'CAMS', 'RPOWER', 'AMBER', 'ABREL', 'PGEL', 'KAJARIACER', 'KFINTECH', 'FIVESTAR',
    'REDINGTON', 'SAMMAANCAP', 'GODFRYPHLP', 'ANGELONE', 'IIFL', 'RBLBANK', 'ARE&M', 'ZEEL',
    'CYIENT', 'WELCORP', 'CUB', 'MANAPPURAM', 'NBCC', 'INOXWIND', 'TATACHEM', 'LALPATHLAB',
    'IEX', 'PNBHOUSING', 'NH', 'COHANCE', 'NUVAMA', 'PPLPHARMA', 'ELGIEQUIP', 'CHOLAHLDNG',
    'KEC', 'RADICO', 'MSUMI', 'NAVINFLUOR', 'KPIL', 'NCC', 'JBCHEPHARM', 'FSL',
    'SKFINDIA', 'APARINDS', 'ASTERDM', 'GESHIP', 'KIMS', 'CARBORUNIV', 'GSPL', 'TIMKEN',
    'ATUL', 'ZENTEC', 'CROMPTON', 'SIGNATURE', 'DELHIVERY', 'CDSL', 'LAURUSLABS', 'KARURVYSYA',
    'BLS', 'GODIGIT', 'SAGILITY', 'AADHARHFC', 'MGL', 'PCBL', 'TRITURBINE', 'CASTROLIND',
    'ZENSARTECH', 'CGCL', 'JYOTICNC', 'CESC', 'RAMCOCEM', 'AARTIIND', 'HBLENGINE', 'TRIDENT',
    'NEULANDLAB', 'OLAELEC', 'STARHEALTH', 'JINDALSAW', 'IFCI', 'IKS', 'CHAMBLFERT', 'APTUS',
    'AFCONS', 'DEEPAKFERT', 'JWL', 'AEGISVOPAK', 'NEWGEN', 'MRPL', 'ANANDRATHI', 'SHYAMMETL',
    'JBMA', 'SWANCORP', 'WHIRLPOOL', 'TEJASNET', 'IRCON', 'BEML', 'ANANTRAJ', 'NATCOPHARM',
    'GILLETTE', 'AEGISLOG', 'DEVYANI', 'IGIL', 'FIRSTCRY', 'CREDITACC', 'DATAPATTNS', 'GRSE',
    'BSE', 'MANKIND', 'UNIONBANK', 'UPL', 'DABUR', 'ITCHOTELS', 'POLYCAB', 'SBILIFE',
    'EICHERMOT', 'HDFCLIFE', 'JSWSTEEL', 'GRASIM', 'TATACONSUM', 'MAXHEALTH', 'DRREDDY', 'ONGC',
    'CIPLA', 'APOLLOHOSP', 'JIOFIN', 'NESTLEIND', 'CHOLAFIN', 'ICICIPRULI', 'PFC', 'ICICIGI',
    'RECLTD', 'BPCL', 'IOC', 'GAIL', 'VGUARD', 'BATAINDIA', 'CENTURYPLY', 'HAVELLS',
    'CERA', 'DIVISLAB', 'TORNTPHARM', 'DLF', 'LODHA', 'SOBHA', 'IOB', 'HINDZINC',
    'JINDALSTEL', 'PFOCUS', 'HATHWAY', 'SAREGAMA', 'NETWORK18', 'NAZARA', 'PVRINOX', 'DBCORP',
    'TIPSMUSIC', 'UNITDSPR', 'BRITANNIA', 'GODREJCP', 'VBL', 'TVSMOTOR', 'BOSCHLTD', 'MOTHERSON'
];

async function populateInternalTokenList() {
    try {
        console.log('[PopulateInternal] Connecting to database...');
        await timescaleClient.connect();
        console.log('[PopulateInternal] Connected.');

        console.log(`[PopulateInternal] Starting to populate ${STOCK_SYMBOLS.length} stocks...`);

        let successCount = 0;
        let notFoundCount = 0;
        let alreadyExistsCount = 0;
        const notFoundSymbols = [];

        for (const baseSymbol of STOCK_SYMBOLS) {
            console.log(`[PopulateInternal] Processing ${baseSymbol}...`);

            // Try different symbol formats to find in AngelOneTokenList
            const symbolVariants = [
                `${baseSymbol}-EQ`,  // Most common format for NSE equity
                baseSymbol,          // Without suffix
                `${baseSymbol.replace('&', '')}`, // M&M might be stored as MM
                `${baseSymbol.replace('&', '')}-EQ`
            ];

            let found = false;

            for (const symbol of symbolVariants) {
                try {
                    // Lookup in AngelOneTokenList (lowercase table name)
                    const lookupQuery = `
                        SELECT token, symbol, name, exch_seg, instrumenttype
                        FROM angelonetokenlist
                        WHERE symbol ILIKE $1
                        AND exch_seg = 'NSE'
                        LIMIT 1
                    `;

                    const lookupResult = await timescaleClient.query(lookupQuery, [symbol]);

                    if (lookupResult.rows.length > 0) {
                        const stock = lookupResult.rows[0];

                        // Check if already exists in internaltokenlist
                        const checkQuery = `
                            SELECT symbol FROM internaltokenlist WHERE symbol = $1
                        `;
                        const checkResult = await timescaleClient.query(checkQuery, [stock.symbol]);

                        if (checkResult.rows.length > 0) {
                            console.log(`[PopulateInternal] ⚠ ${stock.symbol} already exists, skipping`);
                            alreadyExistsCount++;
                            found = true;
                            break;
                        }

                        // Insert into internaltokenlist
                        const insertQuery = `
                            INSERT INTO internaltokenlist (token, symbol, name, exch_seg, instrumenttype, tradeable)
                            VALUES ($1, $2, $3, $4, $5, $6)
                        `;

                        await timescaleClient.query(insertQuery, [
                            stock.token,
                            stock.symbol,
                            stock.name,
                            stock.exch_seg,
                            stock.instrumenttype,
                            true // tradeable
                        ]);

                        console.log(`[PopulateInternal] ✓ Added ${stock.symbol} (${stock.name})`);
                        successCount++;
                        found = true;
                        break;
                    }
                } catch (error) {
                    logger.error(`[PopulateInternal] Error processing ${symbol}:`, error.message);
                }
            }

            if (!found) {
                console.log(`[PopulateInternal] ✗ Not found: ${baseSymbol}`);
                notFoundSymbols.push(baseSymbol);
                notFoundCount++;
            }
        }

        console.log('\n[PopulateInternal] ===== SUMMARY =====');
        console.log(`[PopulateInternal] Total symbols processed: ${STOCK_SYMBOLS.length}`);
        console.log(`[PopulateInternal] Successfully added: ${successCount}`);
        console.log(`[PopulateInternal] Already existed: ${alreadyExistsCount}`);
        console.log(`[PopulateInternal] Not found: ${notFoundCount}`);

        if (notFoundSymbols.length > 0) {
            console.log('\n[PopulateInternal] Symbols not found in AngelOneTokenList:');
            console.log(notFoundSymbols.join(', '));
        }

        // Show final count
        const countQuery = 'SELECT COUNT(*) as count FROM internaltokenlist';
        const countResult = await timescaleClient.query(countQuery);
        console.log(`\n[PopulateInternal] Total stocks in internaltokenlist: ${countResult.rows[0].count}`);

    } catch (error) {
        logger.error('[PopulateInternal] Fatal error:', error);
        throw error;
    } finally {
        await timescaleClient.end();
    }
}

// Run if called directly
if (require.main === module) {
    populateInternalTokenList()
        .then(() => {
            console.log('[PopulateInternal] Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('[PopulateInternal] Script failed:', error);
            process.exit(1);
        });
}

module.exports = populateInternalTokenList;
