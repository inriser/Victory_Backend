const axios = require("axios");
const getPool = require("../db/db.js");

const getPosition = async (req, res) => {
    const pool = getPool();

    try {
        // ---------------- HEADER READ ----------------
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


        // ---------------- CALL ANGELONE API ----------------
        const response = await axios.get(
            "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/getPosition",
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

        const positions = response.data.data || [];

        // ---------------- UPSERT QUERY ----------------
        const insertQuery = `
            INSERT INTO position_status (
                user_ip, device_mac, user_id,
                symboltoken, symbolname, instrumenttype, priceden, pricenum,
                genden, gennum, precision_value, multiplier, boardlotsize,
                exchange, producttype, tradingsymbol, symbolgroup, strikeprice,
                optiontype, expirydate, lotsize, cfbuyqty, cfsellqty, cfbuyamount,
                cfsellamount, buyavgprice, sellavgprice, avgnetprice, netvalue,
                netqty, totalbuyvalue, totalsellvalue, cfbuyavgprice, cfsellavgprice,
                totalbuyavgprice, totalsellavgprice, netprice, buyqty, sellqty,
                buyamount, sellamount, pnl, realised, unrealised, ltp, close, broker
            )
            VALUES (
                $1,$2,$3,
                $4,$5,$6,$7,$8,
                $9,$10,$11,$12,$13,
                $14,$15,$16,$17,$18,
                $19,$20,$21,$22,$23,$24,
                $25,$26,$27,$28,$29,
                $30,$31,$32,$33,$34,
                $35,$36,$37,$38,$39,
                $40,$41,$42,$43,$44,$45,$46,$47
            )
            ON CONFLICT (symboltoken, producttype)
            DO UPDATE SET
                buyqty = EXCLUDED.buyqty,
                sellqty = EXCLUDED.sellqty,
                netqty = EXCLUDED.netqty,
                buyavgprice = EXCLUDED.buyavgprice,
                sellavgprice = EXCLUDED.sellavgprice,
                pnl = EXCLUDED.pnl,
                unrealised = EXCLUDED.unrealised,
                ltp = EXCLUDED.ltp,
                last_updated = NOW();
        `;

        for (const p of positions) {
            const values = [
                userIp, deviceMac, userId,
                p.symboltoken, p.symbolname, p.instrumenttype,
                Number(p.priceden), Number(p.pricenum),
                Number(p.genden), Number(p.gennum), Number(p.precision),
                Number(p.multiplier), Number(p.boardlotsize),

                p.exchange, p.producttype, p.tradingsymbol, p.symbolgroup,
                Number(p.strikeprice),

                p.optiontype, p.expirydate, Number(p.lotsize),
                Number(p.cfbuyqty), Number(p.cfsellqty),
                Number(p.cfbuyamount), Number(p.cfsellamount),

                Number(p.buyavgprice), Number(p.sellavgprice),
                Number(p.avgnetprice), Number(p.netvalue),
                Number(p.netqty),

                Number(p.totalbuyvalue), Number(p.totalsellvalue),
                Number(p.cfbuyavgprice), Number(p.cfsellavgprice),
                Number(p.totalbuyavgprice), Number(p.totalsellavgprice),

                Number(p.netprice), Number(p.buyqty), Number(p.sellqty),
                Number(p.buyamount), Number(p.sellamount),

                Number(p.pnl), Number(p.realised), Number(p.unrealised),
                Number(p.ltp), Number(p.close), 1
            ];

            await pool.query(insertQuery, values);
        }

        // ---------------- RETURN SORTED DATA ----------------
        const result = await pool.query(`
            SELECT *
            FROM position_status
            WHERE last_updated::date = CURRENT_DATE
            ORDER BY last_updated DESC;
        `);

        return res.status(200).json({
            status: "success",
            data: result.rows
        });

    } catch (error) {
        return res.status(500).json({
            status: "error",
            message: error.message
        });
    }
};

module.exports = {
    getPosition
};