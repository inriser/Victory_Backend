const express = require("express");
const cors = require("cors");
const errorHandler = require("./middleware/errorHandler.middleware");
const { startServer } = require("./server.js");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const path = require("path")
require("dotenv").config();

const app = express();
const PORT = 3002;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(
    session({
        store: new FileStore({
            path: "./sessions",
            ttl: 28 * 60 * 60, //28 hrs
            reapInterval: 60 * 60,
        }),
        secret: "secretKey1234",
        resave: false,
        saveUninitialized: true,
        cookie: { maxAge: 28 * 60 * 60 * 1000 },
    })
);

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

const userRoutes = require("./routes/users.route");
const genderRoutes = require("./routes/gender.route");
const prefStocksRoutes = require("./routes/prefStocks.route");
const preferenceOnAppRoutes = require("./routes/preferenceOnApp.route");
const timeLineContentRoutes = require("./routes/timeLineContent.route");
const tradeRecommendationsRoutes = require("./routes/tradeRecommendations.route");
const ExitTypeRoutes = require("./routes/exitType.route");
const ScriptTableRoutes = require("./routes/scriptTable.route");
const ScriptTypeRoutes = require("./routes/scriptType.route");
const tradeTypeRoutes = require("./routes/tradeType.route");
const termTypesRoutes = require("./routes/termTypes.route");
const GrievanceRoutes = require("./routes/grievance.route");
const GrievanceMetaRoutes = require("./routes/grievanceMeta.route");
const ContactBookRoutes = require("./routes/contactBook.route");
const TextsRoutes = require("./routes/texts.route");
const UserKycRoutes = require("./routes/userKyc.route");
const NotificationRoutes = require("./routes/notifications.route");
const NotificationTypeRoutes = require("./routes/notificationType.route");
const ProPlanTransactionsRoutes = require("./routes/proPlanTransactions.route");
const PlanTypesRoutes = require("./routes/planTypes.route");
const PlanActivationTypesRoutes = require("./routes/planActivationType.route");
const InvoiceRoutes = require("./routes/invoice.route");
const PaymentGatewayRoutes = require("./routes/paymentGateway.route");
const LearningModuleMasterRoutes = require("./routes/learningModules.route");
const LearningModulesRoutes = require("./routes/learningModule.route");
// const LearningGraphRoutes = require("./routes/learningGraph.route");
const ChapterMasterRoutes = require("./routes/chapterMaster.route");
const LearningGraphStatusRoutes = require("./routes/learningGraphStatus.route");
const GroupCommunicationRoutes = require("./routes/groupCommunication.route");
const LikesDislikesRoutes = require("./routes/likesDislikes.route");
const CommentsRoutes = require("./routes/comments.route");
const ContentWishlistedRoutes = require("./routes/contentWishlisted.route.js");
const CommunityPostsRoutes = require("./routes/communityPosts.route.js");
const ContentTypesRoutes = require("./routes/contentType.route.js");
const ContentLinkageRoutes = require("./routes/contentLinkage.route.js");
const ContentPinnedSavedForLaterRoutes = require("./routes/contentPinnedSavedForLater.route.js");
const ContentPollsRoutes = require("./routes/contentPolls.route.js");
const RedFlagRoutes = require("./routes/redFlag.route.js");
const RedFlagStatusRoutes = require("./routes/redFlagStatus.route.js");
const PrivacyRoutes = require("./routes/privacy.route.js");
const PinRoutes = require("./routes/pin.route.js");
const WishlistControlTableRoutes = require("./routes/wishlistControlTable.route.js");
const OrderTransactionsRoutes = require("./routes/orderTransaction.route.js");
const SaveTokenRoute = require("./routes/saveTokens.route.js");
const PlaceOrderRoute = require("./routes/orderPlace.route.js");
const ModifyOrderRoute = require("./routes/modifyPlace.route.js");
const CancelOrderRoute = require("./routes/orderCancel.route.js");
const SaveGetProfileRoute = require("./routes/saveGetProfile.route.js");
const fundAndMarginRoute = require("./routes/func&Margin.route.js");
const ModulesRoutes = require("./routes/module.route.js");
const ActionsRoutes = require("./routes/action.route.js");
const AffialiateSchemesRoutes = require("./routes/affiliateSchemes.route.js");
const BenefitTypesRoutes = require("./routes/benefitType.route.js");
const AffiliatesTransactionsRoutes = require("./routes/affiliateTransactions.route.js");
const TransactionTypesRoutes = require("./routes/transactionTypes.route.js");
const badgesProgrammeRoutes = require("./routes/badgesProgramme.routes.js");
const AffiliateBalanceRoutes = require("./routes/affiliateBalance.route.js");
const badgesEarnedRoutes = require("./routes/badgesEarned.route.js");
const FetchingCountsRoutes = require("./routes/fetchingCounts.route.js");
const NewsFeedRoutes = require("./routes/newsFeed.route.js");
const AuthRoutes = require("./routes/authRoutes.js");
const signupRoutes = require("./routes/signupRoutes.js");
const autonewsfeedRoutes = require("./routes/autonewsfeedRoutes");
const insidertradingRoutes = require("./routes/insidetradingRoutes");
const GrievancesResponseRoutes = require("./routes/grievanceResponse.route.js");
const buyshareRoutes = require("./routes/buyshare.route.js");
const funcAndMarginRoute = require("./routes/func&Margin.route");
const fundRoute = require("./routes/fundRoute");
const brokerageRoutes = require("./routes/brokerageRoutes");
const orderRoutes = require("./routes/orderRoutes");
const tradeRoutes = require("./routes/tradeRoutes");
const portfolioRoutes = require("./routes/portfolioRoutes");
const positionRoutes = require("./routes/positionRoutes");
const ScriptRoutes = require("./routes/script.route.js")
const LearningCategoryRoutes = require("./routes/learningcategory.route.js");
const LearningProgressRoutes = require("./routes/learningProgress.route");
const tagSectorRoutes = require("./routes/tagSectorRoutes.route.js");
const tagindustryRoutes = require("./routes/tagindustryRoutes.route.js");
const moversRoutes = require("./routes/movers.routes.js");
const symbolsRoutes = require("./routes/symbols.routes.js");
const intervalsRoutes = require("./routes/intervals.routes.js");
const indicesRoutes = require("./routes/indices.routes.js");
const tradingRoutes = require("./routes/trading.routes.js");

app.get("/", (req, res) => {
    res.json("Hello from Victory Backend");
});

app.use("/api/users", userRoutes);
app.use("/api/gender", genderRoutes);
app.use("/api/prefstock", prefStocksRoutes);
app.use("/api/preferenceonapp", preferenceOnAppRoutes);
app.use("/api/timelinecontent", timeLineContentRoutes);
app.use("/api/traderecommendation", tradeRecommendationsRoutes);
app.use("/api/exittype", ExitTypeRoutes);
app.use("/api/scripttable", ScriptTableRoutes);
app.use("/api/scripttype", ScriptTypeRoutes);
app.use("/api/tradetype", tradeTypeRoutes);
app.use("/api/termtype", termTypesRoutes);
app.use("/api/grievance", GrievanceRoutes);
app.use("/api/grievancemeta", GrievanceMetaRoutes);
app.use("/api/grievanceresponse", GrievancesResponseRoutes)
app.use("/api/contactbook", ContactBookRoutes);
app.use("/api/texts", TextsRoutes);
app.use("/api/userkyc", UserKycRoutes);
app.use("/api/notifications", NotificationRoutes);
app.use("/api/notificationtype", NotificationTypeRoutes);
app.use("/api/proplantransaction", ProPlanTransactionsRoutes);
app.use("/api/plantype", PlanTypesRoutes);
app.use("/api/planactivationtype", PlanActivationTypesRoutes);
app.use("/api/invoice", InvoiceRoutes);
app.use("/api/paymentgateway", PaymentGatewayRoutes);
app.use("/api/learningmodules", LearningModuleMasterRoutes);
app.use("/api/learningmodule", LearningModulesRoutes);
app.use("/api/chaptermaster", ChapterMasterRoutes);
app.use("/api/learningcategory", LearningCategoryRoutes);
app.use("/api/learninggraphstatus", LearningGraphStatusRoutes);
app.use("/api/groupcommunication", GroupCommunicationRoutes);
app.use("/api/likesdislikes", LikesDislikesRoutes);
app.use("/api/comments", CommentsRoutes);
app.use("/api/contentwishlisted", ContentWishlistedRoutes);
app.use("/api/communitypost", CommunityPostsRoutes);
app.use("/api/contenttype", ContentTypesRoutes);
app.use("/api/contentlinkage", ContentLinkageRoutes);
app.use("/api/contentpinned", ContentPinnedSavedForLaterRoutes);
app.use("/api/contentpoll", ContentPollsRoutes);
app.use("/api/redflag", RedFlagRoutes);
app.use("/api/redflagstatus", RedFlagStatusRoutes);
app.use("/api/privacy", PrivacyRoutes);
app.use("/api/pin", PinRoutes);
app.use("/api/wishlistcontrol", WishlistControlTableRoutes);
app.use("/api/scripts", ScriptRoutes);
app.use("/api/ordertransactions", OrderTransactionsRoutes);
app.use("/api/save-token", SaveTokenRoute);
app.use("/api/placeorder", PlaceOrderRoute);
app.use("/api/modifyorder", ModifyOrderRoute);
app.use("/api/cancelorder", CancelOrderRoute);
app.use("/api/savegetprofile", SaveGetProfileRoute);
app.use("/api/fundandmargin", fundAndMarginRoute);
app.use("/api/module", ModulesRoutes);
app.use("/api/action", ActionsRoutes);
app.use("/api/affiliateschemes", AffialiateSchemesRoutes);
app.use("/api/benefittypes", BenefitTypesRoutes);
app.use("/api/affiliatetransactions", AffiliatesTransactionsRoutes);
app.use("/api/transactiontypes", TransactionTypesRoutes);
app.use("/api/badgesprogramme", badgesProgrammeRoutes);
app.use("/api/affiliatebalance", AffiliateBalanceRoutes);
app.use("/api/badgesearned", badgesEarnedRoutes);
app.use("/api/fetchingcount", FetchingCountsRoutes);
app.use("/api/newsfeed", NewsFeedRoutes);
app.use("/api/check-user", AuthRoutes);
app.use("/api/signup", signupRoutes);
app.use("/api/autonewsfeed", autonewsfeedRoutes);
app.use("/api/insidertrading", insidertradingRoutes);
app.use("/api/buyshare", buyshareRoutes);
app.use("/api/fundandmargin", funcAndMarginRoute);
app.use("/api", fundRoute);
app.use("/api/brokerage", brokerageRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/trade", tradeRoutes);
app.use("/api/position", positionRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/script", ScriptRoutes);
app.use("/api/tagsector", tagSectorRoutes);
app.use("/api/tagindustry", tagindustryRoutes);
app.use("/api/learningcategory", LearningCategoryRoutes);
app.use("/api/learningprogress", LearningProgressRoutes);
app.use("/api/movers", moversRoutes);
app.use("/api/symbols", symbolsRoutes);
app.use("/api/intervals", intervalsRoutes);
app.use("/api/indices", indicesRoutes);
app.use("/api/trading", tradingRoutes);

app.use(errorHandler);

// app.listen(PORT, () => {
//     console.log(`Server running at port : http://localhost:${PORT}`);
// });
// require('./services/autonewsfeedCron');
// require('./services/insidetradingCron');

startServer().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start v2 server', err);
    process.exit(1);
});

const { startSmartApiStream } = require("./services/smartapiStream");
startSmartApiStream();

const HOST = "192.168.1.14";

app.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}`);
});