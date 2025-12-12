const axios = require("axios");
const getPool = require("../db/db.js");

const getPortfolioBalance = async (req, res) => {
    try {
        const pool = getPool();
        const query = `SELECT * FROM portfolio_status;`;

        const result = await pool.query(query);
        return res.json({
            success: true,
            message: "Portfolio fetched successfully",
            data: result.rows
        });

    } catch (error) {
        console.error("Error fetching Portfolio:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
const getAllBrokers = async (req, res) => {
    try {
        const pool = getPool();
        const query = `SELECT * FROM broker_master ORDER BY id ASC;`;

        const result = await pool.query(query);
        return res.json({
            success: true,
            message: "Brokers fetched successfully",
            data: result.rows
        });

    } catch (error) {
        console.error("Error fetching brokers:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
const getPortfolio = async (req, res) => {
    const pool = getPool();

    try {
        // -----------------------------
        // 1) Read headers
        // -----------------------------
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

        if (!userId) {
            return res.json({
                status: false,
                message: "User ID missing in headers",
            });
        }

        // -----------------------------
        // 2) Call AngelOne API
        // -----------------------------
        const response = await axios.get(
            "https://apiconnect.angelone.in/rest/secure/angelbroking/portfolio/v1/getAllHolding",
            {
                headers: {
                    Authorization: "Bearer " + authToken,
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "X-UserType": "USER",
                    "X-SourceID": "WEB",
                    "X-ClientLocalIP": "192.168.1.101",
                    "X-ClientPublicIP": "103.55.41.12",
                    "X-MACAddress": "10-02-B5-43-0E-B8",
                    "X-PrivateKey": process.env.API_KEY,
                },
            }
        );

        const holdings = response.data.data?.holdings || [];

        // -----------------------------
        // 3) UPSERT Query — (user_id + isin)
        // -----------------------------
        const insertQuery = `
            INSERT INTO portfolio_status (
                user_ip, device_mac, user_id,
                tradingsymbol, exchange, isin, t1quantity, realisedquantity,
                quantity, authorisedquantity, product, collateralquantity,
                collateraltype, haircut, averageprice, ltp, symboltoken, close,
                profitandloss, pnlpercentage, created_at, updated_at, broker_id
            )
            VALUES (
                $1,$2,$3,
                $4,$5,$6,$7,$8,
                $9,$10,$11,$12,
                $13,$14,$15,$16,$17,$18,
                $19,$20, NOW(), NOW(), $21
            )
            ON CONFLICT (user_id, isin)
            DO UPDATE SET
                tradingsymbol = EXCLUDED.tradingsymbol,
                exchange = EXCLUDED.exchange,
                t1quantity = EXCLUDED.t1quantity,
                realisedquantity = EXCLUDED.realisedquantity,
                quantity = EXCLUDED.quantity,
                authorisedquantity = EXCLUDED.authorisedquantity,
                product = EXCLUDED.product,
                collateralquantity = EXCLUDED.collateralquantity,
                collateraltype = EXCLUDED.collateraltype,
                haircut = EXCLUDED.haircut,
                averageprice = EXCLUDED.averageprice,
                ltp = EXCLUDED.ltp,
                symboltoken = EXCLUDED.symboltoken,
                close = EXCLUDED.close,
                profitandloss = EXCLUDED.profitandloss,
                pnlpercentage = EXCLUDED.pnlpercentage,
                updated_at = NOW();
        `;

        // -----------------------------
        // 4) Insert / Update Loop
        // -----------------------------
        for (const h of holdings) {
            const values = [
                userIp,
                deviceMac,
                userId,
                h.tradingsymbol,
                h.exchange,
                h.isin,
                h.t1quantity,
                h.realisedquantity,
                h.quantity,
                h.authorisedquantity,
                h.product,
                h.collateralquantity,
                h.collateraltype,
                Number(h.haircut || 0),
                Number(h.averageprice || 0),
                Number(h.ltp || 0),
                h.symboltoken,
                Number(h.close || 0),
                Number(h.profitandloss || 0),
                Number(h.pnlpercentage || 0),
                1
            ];

            await pool.query(insertQuery, values);
        }

        // -----------------------------
        // 5) Fetch Latest Portfolio
        // -----------------------------
        const result = await pool.query(
            `
    SELECT *
    FROM portfolio_status
    WHERE user_id = $1
      AND DATE(updated_at) = CURRENT_DATE
    ORDER BY updated_at DESC;
    `,
            [userId]
        );


        return res.json({
            status: true,
            data: result.rows,
        });
    } catch (error) {
        console.error("Portfolio Error:", error);

        return res.status(500).json({
            status: false,
            message: error.message,
        });
    }
};

module.exports = { getPortfolio, getAllBrokers,getPortfolioBalance };