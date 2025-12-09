const axios = require("axios");
const getPool = require("../db/db.js");

const getOrder = async (req, res) => {
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

        // ⭐ Correct header read
        const deviceMac =
            req.headers["device_mac"] ||
            req.headers["device-mac"] ||
            req.headers["x-device-mac"] ||
            null;

        // ⭐ Frontend user ID
        const userId =
            req.headers["userid"] ||
            req.headers["user_id"] ||
            req.user?.id ||
            null;


        // ========== 2️⃣ Call AngelOne OrderBook API ==========
        const response = await axios.get(
            "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getOrderBook",
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

        const orders = response.data.data || [];

        // ========== 3️⃣ Insert into Database ==========
        const insertQuery = `
            INSERT INTO order_status
            (user_ip, device_mac, user_id, internal_order_id, broker, interal_type,
             order_timestamp, variety, trading_symbol, symbol_token, transaction_type,
             exchange, order_type, product_type, duration, price, square_off, stop_loss,
             quantity, response_timestamp, status, message, error_code, script, orderid,
             unique_order_id, filledshares, unfilledshares, created_at)
            VALUES
            ($1,$2,$3,$4,$5,$6,
             $7,$8,$9,$10,$11,
             $12,$13,$14,$15,$16,$17,$18,
             $19,$20,$21,$22,$23,$24,$25,$26,$27,$28, NOW())
            ON CONFLICT (orderid) DO NOTHING;
        `;

        for (const order of orders) {

            const statusText = (order.status || "").toString().trim().toLowerCase();

            const isCancelled = statusText === "cancelled";

            const internalOrderId = isCancelled ? 3 : 1;
            const interalType = isCancelled ? "Cancel" : "Place";

            const values = [
                userIp,
                deviceMac,
                userId,
                internalOrderId,
                1,
                interalType,
                order.exchtime || null,
                order.variety,
                order.tradingsymbol,
                order.symboltoken,
                order.transactiontype,
                order.exchange,
                order.ordertype,
                order.producttype,
                order.duration,
                order.price,
                order.squareoff,
                order.stoploss,
                order.quantity,
                order.exchtime || null,                 // response_timestamp
                order.status,            // boolean field
                order.text,
                order.error_code || "",
                order.tradingsymbol,
                order.orderid,
                order.uniqueorderid,
                Number(order.filledshares || 0),
                Number(order.unfilledshares || 0)
            ];

            await pool.query(insertQuery, values);
        }

        // ========== 4️⃣ Fetch Saved Orders ==========
        const result = await pool.query(`
          SELECT *
FROM order_status
WHERE created_at::date = CURRENT_DATE
ORDER BY transaction_id DESC
        `);

        return res.status(200).json({
            status: "success",
            data: result.rows
        });

    } catch (error) {
        console.error("GET getOrder error:", error);

        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

const placeOrder = async (req, res) => {
    const pool = getPool();
    try {
        const body = req.body;

        const authToken = req.headers["authorization"]?.replace("Bearer ", "");

        const user_ip = req.ip || req.headers["x-forwarded-for"] || null;
        const device_mac = req.headers["device_mac"] || null;
        const user_id = req.headers["userid"] || null;
        const internaltype = req.headers["internaltype"] || null;
        const url =
            "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder";

        const response = await axios.post(url, body, {
            headers: {
                "Authorization": "Bearer " + authToken,
                "Content-Type": "application/json",
                "X-UserType": "USER",
                "X-SourceID": "WEB",
                "X-ClientLocalIP": "192.168.1.101",
                "X-ClientPublicIP": "103.55.41.12",
                "X-MACAddress": "10-02-B5-43-0E-B8",
                "X-PrivateKey": process.env.API_KEY
            }
        });

        const r = response.data;
        const d = r.data || {};
        // 🔵 2) INSERT INTO DB
        const insertSql = `
            INSERT INTO orders_transactions (
                user_ip, device_mac, user_id, internal_order_id, broker, interal_type,
                order_timestamp, variety, tradingsymbol, symboltoken, transactiontype,
                exchange, ordertype, producttype, duration, price, squareoff, stoploss,
                quantity, response_timestamp, status, message, error_code, script,
                orderid, unique_order_id
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,
                NOW(),$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,$17,
                $18,NOW(),$19,$20,$21,$22,
                $23,$24
            )
        `;

        await pool.query(insertSql, [
            user_ip,
            device_mac,
            user_id,
            1,                      // internal_order_id → PLACE
            1,                      // broker
            internaltype,                // interal_type
            body.variety,
            body.tradingsymbol,
            body.symboltoken,
            body.transactiontype,
            body.exchange,
            body.ordertype,
            body.producttype,
            body.duration,
            body.price,
            body.squareoff,
            body.stoploss,
            body.quantity,
            r.status,
            r.message,
            r.errorcode,
            d.script,
            d.orderid,
            d.uniqueorderid
        ]);


        return res.json({
            success: true,
            angelResponse: r
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            angelError: error.response?.data
        });
    }
};

const modifyOrder = async (req, res) => {
    const pool = getPool();

    try {
        const body = req.body;

        const authToken = req.headers["authorization"]?.replace("Bearer ", "");
        const user_ip = req.ip || req.headers["x-forwarded-for"] || null;
        const device_mac = req.headers["device_mac"] || null;
        const user_id = req.headers["userid"] || null;
        const internaltype = req.headers["internaltype"] || null;

        // Extract fields (for saving in DB)
        const {
            transactiontype,
            squareoff,
            stoploss,
            script
        } = body;

        // These fields should NOT go to Angel API
        delete body.transactiontype;
        delete body.squareoff;
        delete body.stoploss;
        delete body.script;

        // Angel Modify API
        const url =
            "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/modifyOrder";

        const response = await axios.post(url, body, {
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
        });

        const r = response.data;
        const d = r.data || {};

        // SAVE TRANSACTION LOG
        await pool.query(
            `
            INSERT INTO orders_transactions (
                user_ip, device_mac, user_id, internal_order_id, broker, interal_type,
                order_timestamp, variety, tradingsymbol, symboltoken,
                exchange, ordertype, producttype, duration, price, quantity,
                response_timestamp, status, message, error_code,
                orderid, unique_order_id,
                script, transactiontype, squareoff, stoploss
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,
                NOW(),$7,$8,$9,
                $10,$11,$12,$13,$14,$15,
                NOW(),$16,$17,$18,
                $19,$20,
                $21,$22,$23,$24
            )
        `,
            [
                user_ip, device_mac, user_id,
                2, // modify
                1, // broker
                internaltype,
                body.variety || "NORMAL",
                body.tradingsymbol,
                body.symboltoken,
                body.exchange,
                body.ordertype,
                body.producttype,
                body.duration,
                body.price,
                body.quantity,
                r.status,
                r.message,
                r.errorcode,
                body.orderid,
                d?.uniqueorderid || null,
                script,
                transactiontype,
                squareoff,
                stoploss
            ]
        );

        // UPDATE order_status
        const upd = await pool.query(
            `
            UPDATE order_status 
            SET 
                price = $1::numeric,
                quantity = $2::numeric,
                product_type = $3,
                order_type = $4,
                duration = $5,
                interal_type = $7,
                internal_order_id = 2,
                square_off = $8::numeric,
                stop_loss = $9::numeric,
                response_timestamp = NOW()
            WHERE orderid::text = $6::text
            RETURNING *;
            `,
            [
                body.price,
                body.quantity,
                body.producttype,
                body.ordertype,
                body.duration,
                body.orderid,
                internaltype,
                squareoff,
                stoploss
            ]
        );

        return res.json({
            success: true,
            angelResponse: r,
            updatedOrder: upd.rows[0]
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message,
            angelError: error.response?.data
        });
    }
};

const cancelOrder = async (req, res) => {
    const pool = getPool();

    try {
        const fullBody = req.body; // FULL BODY (item from frontend)

        const { variety, orderid } = fullBody;   // Angel API ke liye required 2 fields

        const authToken = req.headers["authorization"]?.replace("Bearer ", "");
        const user_ip = req.ip || req.headers["x-forwarded-for"] || null;
        const device_mac = req.headers["device_mac"] || null;
        const user_id = req.headers["userid"] || null;

        // ⭐ Body clean for Angel API
        const angelPayload = { variety, orderid };

        const angelUrl =
            "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/cancelOrder";

        // ⭐ 1) Call AngelOne Cancel API
        const response = await axios.post(angelUrl, angelPayload, {
            headers: {
                "Authorization": "Bearer " + authToken,
                "Content-Type": "application/json",
                "X-UserType": "USER",
                "X-SourceID": "WEB",
                "X-ClientLocalIP": "192.168.1.101",
                "X-ClientPublicIP": "103.55.41.12",
                "X-MACAddress": "10-02-B5-43-0E-B8",
                "X-PrivateKey": process.env.API_KEY
            }
        });

        const r = response.data;
        const d = r.data || {};

        // ⭐ 2) Save FULL ORDER DATA in orders_transactions
        const insertSql = `
            INSERT INTO orders_transactions (
                user_ip, device_mac, user_id, internal_order_id, broker, interal_type,
                order_timestamp, variety, tradingsymbol, symboltoken, transactiontype,
                exchange, ordertype, producttype, duration, price, quantity,
                squareoff, stoploss, script,
                response_timestamp, status, message, error_code,
                orderid, unique_order_id
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,
                NOW(),$7,$8,$9,$10,
                $11,$12,$13,$14,$15,$16,
                $17,$18,$19,
                NOW(),$20,$21,$22,
                $23,$24
            )
        `;

        await pool.query(insertSql, [
            user_ip,
            device_mac,
            user_id,
            3,
            1,
            "Cancel",
            variety,
            fullBody.tradingsymbol,
            fullBody.symboltoken,
            fullBody.transactiontype,
            fullBody.exchange,
            fullBody.ordertype,
            fullBody.producttype,
            fullBody.duration,
            fullBody.price,
            fullBody.quantity,
            fullBody.squareoff ?? 0,
            fullBody.stoploss ?? 0,
            fullBody.script,
            r.status,
            r.message,
            r.errorcode,
            orderid,
            d.uniqueorderid || null
        ]);

        // ⭐ 3) Update order_status table
        const updateStatusSql = `
            UPDATE order_status
            SET 
                interal_type = 'Cancel',
                internal_order_id = 3,
                status = 'cancelled',
                message = $1,
                error_code = $2,
                variety = $3,
                square_off = $4::numeric,
                stop_loss = $5::numeric,
                response_timestamp = NOW()
            WHERE orderid = $6
        `;

        await pool.query(updateStatusSql, [
            r.message,
            r.errorcode,
            variety,
            fullBody.squareoff ?? 0,
            fullBody.stoploss ?? 0,
            orderid
        ]);

        return res.json({
            success: true,
            angelResponse: r,
            message: "Order cancelled successfully & database updated."
        });

    } catch (error) {
        console.error("Cancel Order Error:", error);

        return res.status(500).json({
            success: false,
            error: error.message,
            angelError: error.response?.data
        });
    }
};

// const cancelOrder = async (req, res) => {
//     const pool = getPool();

//     try {
//         const body = req.body;  // { variety, orderid }

//         const authToken = req.headers["authorization"]?.replace("Bearer ", "");
//         const user_ip = req.ip || req.headers["x-forwarded-for"] || null;
//         const device_mac = req.headers["device_mac"] || null;
//         const user_id = req.headers["userid"] || null;

//         const angelUrl =
//             "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/cancelOrder";

//         // 1️⃣ Call Angel One Cancel API
//         const response = await axios.post(angelUrl, {
//             variety: body.variety,
//             orderid: body.orderid
//         }, {
//             headers: {
//                 "Authorization": "Bearer " + authToken,
//                 "Content-Type": "application/json",
//                 "X-UserType": "USER",
//                 "X-SourceID": "WEB",
//                 "X-ClientLocalIP": "192.168.1.101",
//                 "X-ClientPublicIP": "103.55.41.12",
//                 "X-MACAddress": "10-02-B5-43-0E-B8",
//                 "X-PrivateKey": process.env.API_KEY
//             }
//         });

//         const r = response.data;
//         const d = r.data || {};

//         // 2️⃣ INSERT INTO orders_transactions
//         const insertSql = `
//             INSERT INTO orders_transactions (
//                 user_ip, device_mac, user_id, internal_order_id, broker, interal_type,
//                 order_timestamp, variety, response_timestamp, status, message, error_code,
//                 orderid, unique_order_id
//             )
//             VALUES (
//                 $1,$2,$3,$4,$5,$6,
//                 NOW(),$7,NOW(),$8,$9,$10,
//                 $11,$12
//             )
//         `;

//         await pool.query(insertSql, [
//             user_ip,
//             device_mac,
//             user_id,
//             3,
//             1,
//             "Cancel",
//             body.variety,
//             r.status,
//             r.message,
//             r.errorcode,
//             d.orderid,
//             d.uniqueorderid
//         ]);

//         const updateStatusSql = `
//             UPDATE order_status
//             SET 
//                 interal_type = $1,
//                 internal_order_id = $2,
//                 status = $3,
//                 message = $4,
//                 error_code = $5,
//                 variety = $6,
//                 response_timestamp = NOW()
//             WHERE orderid = $7
//         `;

//         await pool.query(updateStatusSql, [
//             "Cancel",
//             3,
//             "cancelled",
//             r.message,
//             r.errorcode,
//             body.variety,
//             body.orderid
//         ]);

//         return res.json({
//             success: true,
//             angelResponse: r,
//             message: "Order cancelled successfully & status updated."
//         });
//     } catch (error) {
//         console.error("Cancel Order Error:", error);
//         return res.status(500).json({
//             success: false,
//             error: error.message,
//             angelError: error.response?.data
//         });
//     }
// };

module.exports = {
    getOrder, placeOrder, cancelOrder, modifyOrder
};