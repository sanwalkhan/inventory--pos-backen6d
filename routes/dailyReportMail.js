const express = require('express');
const mailrouter = express.Router();
const { sendDailySalesReportEmail } = require('../controllers/dailyReportMail');

// Manual trigger for testing
mailrouter.post('/send-daily-report', async (req, res) => {
  const result = await sendDailySalesReportEmail();
  if (result.success) {
    res.status(200).json(result);
  } else {
    res.status(400).json(result);
  }
});

module.exports = mailrouter;
