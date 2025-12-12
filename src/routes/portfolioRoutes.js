const express = require("express");
const router = express.Router();
const { getPortfolio,getAllBrokers,getPortfolioBalance } = require("../controllers/portfolioController");

router.get("/get", getPortfolio);
router.get("/getAllBrokers", getAllBrokers);
router.get("/getPortfolioBalance", getPortfolioBalance);

module.exports = router;