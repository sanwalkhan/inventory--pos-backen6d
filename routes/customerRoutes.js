const express = require("express");
const {
  customer,
  getCustomers,
  getCustomerById,
} = require("../controllers/customerController");

const customerRouter = express.Router();

customerRouter.post("/upsert", customer);           // Upsert customer
customerRouter.get("/", getCustomers);               // Get all customers
customerRouter.get("/:id", getCustomerById);         // Get single customer by id

module.exports = customerRouter;
