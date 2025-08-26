const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const cron = require("node-cron");
require("dotenv").config({ path: ".env" });
require("./models/dbConnection");
const http = require("http"); // For WebSocket
const { Server } = require("socket.io");

// Import Routes
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

const app = express();
const port = process.env.PORT;

// Middleware
app.use(bodyParser.json());
const allowedOrigins = ["http://localhost:5173", "http://localhost:5174" , "https://pos-inventory-frontend-zeta.vercel.app/"];
 app.use(cors({ origin: true, credentials: true }));


// Routes
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
app.use("/api", managerrouter)
app.use("/api",managerSettingRouter);
app.use("/api",themeRouter);


// Schedule: Run every day at 12 AM Pakistan time
cron.schedule(
  "0 0 * * *",
  async () => {
    console.log(
      "Running Daily Sales Report Job at",
      new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })
    );
    await sendDailySalesReportEmail();
  },
  {
    timezone: "Asia/Karachi",
  }
);

// --- WebSocket Setup ---
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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

// Start Server with WebSocket
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
