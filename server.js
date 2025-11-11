const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cron = require("node-cron");
require("dotenv").config();
require("./models/dbConnection");
const http = require("http");
const { ExpressPeerServer } = require("peer");
const Currency = require("./models/currancyModel");

// Import your SocketHandler class
const SocketHandler = require("./socket/socketHandler"); // Adjust path as needed

// Allowed frontend origin from .env
const allowedOrigins = "*";


// Initialize Express
const app = express();
const port = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer(app);

// --- Initialize SocketHandler (Single Instance) ---
const socketHandler = new SocketHandler(server);
const io = socketHandler.io; // Get the io instance from SocketHandler

// Make io available to routes
app.locals.io = io;
app.locals.socketHandler = socketHandler;
app.use((req, res, next) => {
  req.io = io;
  req.socketHandler = socketHandler;
  next();
});

// --- Middleware ---
app.use(bodyParser.json());

// CORS
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

// --- Health Check Endpoint ---
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date(),
    message: "Server is running",
    socketConnections: io.engine.clientsCount,
  });
});

// --- Socket Status Endpoint ---
app.get("/socket-status", (req, res) => {
  res.json(socketHandler.getStatus());
});

// --- Routes Imports ---
const authRouter = require("./routes/authRoutes");
const adminRouter = require("./routes/adminRoutes");
const userRouter = require("./routes/userRoutes");
const orderRouter = require("./routes/orderRoutes");
const inventoryRouter = require("./routes/inventoryRoutes");
const categoryRouter = require("./routes/categoryRoutes");
const subcategoryRouter = require("./routes/subcategoryRoutes");
const productRouter = require("./routes/productRoutes");
const customerRouter = require("./routes/customerRoutes");
const saleSummaryRouter = require("./routes/saleSummaryRoutes");
const adminHomeRouter = require("./routes/adminDashboardRoutes");
const reportRouter = require("./routes/reportRoutes");
const adminSettingRouter = require("./routes/adminSettingRoutes");
const supplierRouter = require("./routes/supplierRoutes");
const cashierDashboardRouter = require("./routes/cashierDashboardRoutes");
const mailrouter = require("./routes/dailyReportMail");
const { sendDailySalesReportEmail } = require("./controllers/dailyReportMail");
const managerrouter = require("./routes/managerRoutes");
const managerSettingRouter = require("./routes/managerSettingRoutes");
const themeRouter = require("./routes/themeRoutes");
const cashierRouter = require("./routes/cashierRoutes");
const supervisorRouter = require("./routes/supervisorRoutes");
const resetPasswordRouter = require("./routes/ResetPasswordRoutes");
const currencyRouter = require("./routes/currencyRoutes");
const NotificationRouter = require("./routes/notificationRoutes");
const chatbotRouter = require("./routes/chatbotRoutes");
const logorouter = require("./routes/logoRoutes");
const orgnazationRouter = require("./routes/organizationRoutes");
const { cleanupUnverifiedUsers } = require("./controllers/authController");

// --- Register Routes ---
app.use("/api", NotificationRouter);
app.use("/api", authRouter);
app.use("/api", adminRouter);
app.use("/api", userRouter);
app.use("/api", categoryRouter);
app.use("/api", subcategoryRouter);
app.use("/api", productRouter);
app.use("/api", orderRouter);
app.use("/api/customers", customerRouter);
app.use("/api", inventoryRouter);
app.use("/api", saleSummaryRouter);
app.use("/api", adminHomeRouter);
app.use("/api", reportRouter);
app.use("/api", adminSettingRouter);
app.use("/api", supplierRouter);
app.use("/api", cashierDashboardRouter);
app.use("/api", mailrouter);
app.use("/api", managerrouter);
app.use("/api", managerSettingRouter);
app.use("/api", themeRouter);
app.use("/api", cashierRouter);
app.use("/api", supervisorRouter);
app.use("/api", resetPasswordRouter);
app.use("/api", currencyRouter);
app.use("/api/chatbot", chatbotRouter);
app.use("/api",logorouter)
app.use("/api",orgnazationRouter)

// --- PeerJS integrated on same port ---
const peerServer = ExpressPeerServer(server, {
  path: "/peerjs",
  allow_discovery: true,
});
app.use("/peerjs", peerServer);

// PeerJS events
peerServer.on("connection", (client) =>
  console.log("PeerJS client connected:", client.getId())
);
peerServer.on("disconnect", (client) =>
  console.log("PeerJS client disconnected:", client.getId())
);
peerServer.on("error", (error) =>
  console.error("PeerJS server error:", error)
);

// --- Cron Job: Daily Sales Report ---
cron.schedule(
  "0 0 * * *",
  async () => {
    console.log(
      "Running Daily Sales Report Job at",
      new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })
    );
    await sendDailySalesReportEmail();
  },
  { timezone: "Asia/Karachi" }
);
cron.schedule(
  "0 2 * * *",
  async () => {
    console.log(
      "Running Daily Sales Report Job at",
      new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })
    );
    await cleanupUnverifiedUsers();
  },
  { timezone: "Asia/Karachi" }
);

// --- Graceful Shutdown ---
process.on("SIGINT", () => {
  console.log("\nShutting down servers...");
  io.close(() => console.log("Socket.IO server closed"));
  server.close(() => {
    console.log("HTTP server closed");
    process.exit(0);
  });
});

// --- Start Server ---
server.listen(port, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`🌐 Allowed Origin: ${allowedOrigins}`);
  console.log("🔌 SocketHandler initialized with real-time features");
  console.log("🩺 Health Check: GET /");
  console.log("📊 Socket Status: GET /socket-status");
});