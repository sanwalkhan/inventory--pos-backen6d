const moment = require('moment-timezone');
const nodemailer = require('nodemailer');
const { Order } = require('../models/orderModel');
const User = require('../models/userModel');

// Configure SMTP transporter (Gmail)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // false for TLS (587)
  auth: {
    user: 'shahshahzaibkazmi@gmail.com',
    pass: 'fssm orjq hqjo riir', // App password, not normal Gmail password
  },
});

// Fetch today's orders within Asia/Karachi timezone
async function fetchTodaysOrders() {
  const startOfDay = moment().tz('Asia/Karachi').startOf('day').toDate();
  const endOfDay = moment().tz('Asia/Karachi').endOf('day').toDate();

  return Order.find({
    date: { $gte: startOfDay, $lte: endOfDay },
  }).populate('items.productId');
}

// Aggregate sales data
function aggregateSalesData(orders) {
  const report = {};

  orders.forEach(order => {
    const cashierKey = `${order.cashierId}||${order.cashierName}`;
    if (!report[cashierKey]) report[cashierKey] = {};

    order.items.forEach(item => {
      const pid = item.productId._id.toString();
      if (!report[cashierKey][pid]) {
        report[cashierKey][pid] = {
          name: item.productId.name,
          price: item.price,
          totalQuantity: 0,
          revenue: 0,
        };
      }
      report[cashierKey][pid].totalQuantity += item.quantity;
      report[cashierKey][pid].revenue += item.price * item.quantity;
    });
  });

  return report;
}

// Generate HTML email
function generateHTMLReport(reportData) {
  let html = `<h2>Daily Product Selling Report - ${moment().tz('Asia/Karachi').format('YYYY-MM-DD')}</h2>`;

  for (const [cashierKey, products] of Object.entries(reportData)) {
    const [cashierId, cashierName] = cashierKey.split('||');
    html += `<h3>Cashier: ${cashierName} (ID: ${cashierId})</h3>`;
    html += `<table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <tr>
        <th>Product</th>
        <th>Price (RS)</th>
        <th>Quantity Sold</th>
        <th>Revenue (RS)</th>
      </tr>`;

    Object.values(products).forEach(product => {
      html += `<tr>
        <td>${product.name}</td>
        <td>${product.price.toFixed(2)}</td>
        <td>${product.totalQuantity}</td>
        <td>${product.revenue.toFixed(2)}</td>
      </tr>`;
    });

    html += `</table><br/>`;
  }
  return html;
}

// Fetch admin emails
async function fetchAdminEmails() {
  const admins = await User.find({ role: 'admin' }).select('email').lean();
  return admins.map(a => a.email).filter(Boolean);
}

// Main function (can be used by both API & cron)
async function sendDailySalesReportEmail() {
  try {
    const orders = await fetchTodaysOrders();
    if (orders.length === 0) {
      console.log('No orders found for today. Skipping email.');
      return { success: false, message: 'No orders today.' };
    }

    const reportData = aggregateSalesData(orders);
    const htmlReport = generateHTMLReport(reportData);
    const adminEmails = await fetchAdminEmails();

    if (adminEmails.length === 0) {
      console.log('No admin emails found.');
      return { success: false, message: 'No admin emails found.' };
    }

    const mailOptions = {
      from: '"Sales Report" <shahshahzaibkazmi@gmail.com>',
      to: adminEmails.join(','),
      subject: `Daily Sales Report - ${moment().tz('Asia/Karachi').format('YYYY-MM-DD')}`,
      html: htmlReport,
    };

    await transporter.sendMail(mailOptions);
    console.log('Daily sales report email sent to admins.');

    return { success: true, message: 'Daily sales report email sent successfully.' };
  } catch (error) {
    console.error('Error sending daily sales report email:', error);
    return { success: false, message: 'Failed to send daily sales report email.' };
  }
}

module.exports = {
  sendDailySalesReportEmail,
};
