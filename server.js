const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cron = require("node-cron");
require("dotenv").config({ path: ".env" });
require("./models/dbConnection");
const http = require("http"); // For WebSocket
const { Server } = require("socket.io");
const { PeerServer } = require("peer");
 
// ------------------ PeerJS ------------------
const peerServer = PeerServer({
  port: 9000,
  path: "/peerjs",
  allow_discovery: true,
  debug: true,
  corsOptions: {
    origin: [process.env.FRONTEND_URL || "http://localhost:5173"],
    credentials: true,
  },
});
 
// ------------------ Import Routes ------------------
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
 
// ------------------ App Setup ------------------
const app = express();
const port = process.env.PORT || 5000;
 
// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173", // your frontend domain
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(bodyParser.json());
 
// ------------------ Routes ------------------
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
 
// ------------------ CRON Job ------------------
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
 
// ------------------ WebSocket Setup ------------------
const server = http.createServer(app);
 
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
});
 
io.on("connection", (socket) => {
  console.log("A client connected:", socket.id);
 
  // Example test event
  socket.on("ping", (msg) => {
    console.log("Ping received:", msg);
    socket.emit("pong", "Hello from server!");
  });
 
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});
 
// ------------------ PeerJS Events ------------------
peerServer.on("connection", (client) => {
  console.log("PeerJS client connected:", client.getId());
});
 
peerServer.on("disconnect", (client) => {
  console.log("PeerJS client disconnected:", client.getId());
});
 
peerServer.on("error", (error) => {
  console.error("PeerJS server error:", error);
});
 
// ------------------ Start Servers ------------------
console.log("PeerJS server running on port 9000");
console.log("WebSocket endpoint: ws://localhost:9000/peerjs");
 
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
 
// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down PeerJS server...");
  process.exit(0);
});