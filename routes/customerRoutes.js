const express = require("express");
const {
  customer,
  getCustomers,
  getCustomerById,
  refund,
} = require("../controllers/customerController");

const customerRouter = express.Router();

customerRouter.post("/upsert", customer);           // Upsert customer
customerRouter.get("/", getCustomers);               // Get all customers
customerRouter.get("/:id", getCustomerById);         // Get single customer by id
customerRouter.post("/refund", refund);              // Refund route (new)

module.exports = customerRouter;
