// worker.js
import dotenv from "dotenv";
import cron from "node-cron";
import { sendDailySalesReportEmail } from "./controllers/dailyReportMail.js";
import "./models/dbConnection.js";

dotenv.config();

console.log("📦 Worker service started...");

cron.schedule(
  "0 0 * * *",
  async () => {
    console.log(
      "⏰ Running Daily Sales Report at",
      new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })
    );
    try {
      await sendDailySalesReportEmail();
      console.log("✅ Email sent successfully!");
    } catch (err) {
      console.error("❌ Error sending daily report:", err.message);
    }
  },
  {
    timezone: "Asia/Karachi",
  }
);

// keep process alive
setInterval(() => {
  console.log("Worker running...", new Date().toISOString());
}, 1000 * 60 * 10);
