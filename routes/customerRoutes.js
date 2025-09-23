const express = require("express");
const {
  customer,
  getCustomers,
  getCustomerById,
  refund,
  getRefundHistory
} = require("../controllers/customerController");

const customerRouter = express.Router();

customerRouter.post("/upsert", customer);           // Upsert customer
customerRouter.get("/", getCustomers);               // Get all customers with pagination
customerRouter.get("/:id", getCustomerById);         // Get single customer by id
customerRouter.post("/refund", refund);              // Process refund
customerRouter.get("/:customerId/refund-history", getRefundHistory); // Get refund history for a customer

module.exports = customerRouter;