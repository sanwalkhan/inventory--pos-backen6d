const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cron = require("node-cron");
require("dotenv").config();
require("./models/dbConnection");
const http = require("http");
const { Server } = require("socket.io");
const { ExpressPeerServer } = require("peer");
const Currency = require("./models/currancyModel");

// Allowed frontend origin from .env
const allowedOrigins = "*";

// Initialize default currency if not exists
(async () => {
  const count = await Currency.countDocuments();
  if (count === 0) {
    await Currency.create({});
    console.log("Default PKR currency created");
  }
})();

// Initialize Express
const app = express();
const port = process.env.PORT || 8080;

// Create HTTP server
const server = http.createServer(app);

// --- Socket.IO Setup ---
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Store connected users for notifications
const connectedUsers = new Map();

io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);

  socket.on("authenticate", (data) => {
    if (data.userId) {
      socket.join(`user_${data.userId}`);
      connectedUsers.set(socket.id, data.userId);
      console.log(`User ${data.userId} joined room user_${data.userId}`);
    }
  });

  socket.on("ping", (msg) => {
    console.log("Ping received:", msg);
    socket.emit("pong", "Hello from server!");
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    const userId = connectedUsers.get(socket.id);
    if (userId) connectedUsers.delete(socket.id);
  });
});

// Make io available to routes
app.locals.io = io;
app.use((req, res, next) => {
  req.io = io;
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
  });
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
server.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`🌐 Allowed Origin: ${allowedOrigins}`);
  console.log("🔌 Socket.IO server running with real-time notifications");
  console.log("🩺 Health Check: GET /");
});
