const axios = require("axios");
const getPool = require("../db/db.js");

const getTrade = async (req, res) => {
    const pool = getPool();

    try {
        // 1️⃣ Read headers
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.json({ success: false, message: "Auth token missing" });
        }

        const authToken = authHeader.replace("Bearer ", "").trim();

        const userIp =
            req.headers["x-client-ip"] ||
            req.headers["x-real-ip"] ||
            req.headers["x-forwarded-for"] ||
            req.socket.remoteAddress;

        const deviceMac =
            req.headers["device_mac"] ||
            req.headers["device-mac"] ||
            req.headers["x-device-mac"] ||
            null;

        const userId =
            req.headers["userid"] ||
            req.headers["user_id"] ||
            req.user?.id ||
            null;


        // 2️⃣ Call AngelOne TradeBook API
        const response = await axios.get(
            "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getTradeBook",
            {
                headers: {
                    "Authorization": "Bearer " + authToken,
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "X-UserType": "USER",
                    "X-SourceID": "WEB",
                    "X-ClientLocalIP": "192.168.1.101",
                    "X-ClientPublicIP": "103.55.41.12",
                    "X-MACAddress": "10-02-B5-43-0E-B8",
                    "X-PrivateKey": process.env.API_KEY
                }
            }
        );

        const trades = response.data.data || [];

        // 3️⃣ DB Insert Query
        const insertQuery = `
            INSERT INTO trade_status (
                user_ip, device_mac, user_id,
                exchange, producttype, tradingsymbol, instrumenttype, symbolgroup,
                strikeprice, optiontype, expirydate,
                marketlot, precision_value, multiplier,
                tradevalue, transactiontype, fillprice, fillsize,
                orderid, fillid, filltime, broker
            )
            VALUES (
                $1,$2,$3,
                $4,$5,$6,$7,$8,
                $9,$10,$11,
                $12,$13,$14,
                $15,$16,$17,$18,
                $19,$20,$21,$22
            )
            ON CONFLICT (fillid) DO NOTHING;
        `;

        // Insert Each Trade
        for (const t of trades) {
            const values = [
                userIp,
                deviceMac,
                userId,

                t.exchange,
                t.producttype,
                t.tradingsymbol,
                t.instrumenttype,
                t.symbolgroup,

                Number(t.strikeprice),
                t.optiontype,
                t.expirydate,

                Number(t.marketlot),
                Number(t.precision),
                Number(t.multiplier),

                Number(t.tradevalue),
                t.transactiontype,
                Number(t.fillprice),
                Number(t.fillsize),

                t.orderid,
                t.fillid,
                t.filltime,
                1
            ];

            await pool.query(insertQuery, values);
        }

        // 4️⃣ Return All Saved Trades
        const result = await pool.query(`
    SELECT *
    FROM trade_status
  WHERE created_at::date = CURRENT_DATE
    ORDER BY 
        filltime DESC,
        transaction_id DESC;
`);

        return res.status(200).json({
            status: "success",
            data: result.rows
        });

    } catch (error) {
        console.error("GET getTradeBook error:", error);

        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

module.exports = {
    getTrade
};