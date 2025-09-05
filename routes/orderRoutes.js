const orderRouter = require("express").Router();

const {
  createOrder,
  getOrderStats,
  getRecentOrders,
  decreaseProductQuantity,
  getOrders,
  getTopOrders,
} = require("../controllers/orderController");
orderRouter.post("/orders", createOrder);
orderRouter.get("/orders/stats", getOrderStats);
orderRouter.get("/orders/recent", getRecentOrders);
orderRouter.put("/products/:id/decrease", decreaseProductQuantity);
orderRouter.get("/orders/paginated", getOrders);
orderRouter.get("/orders/top", getTopOrders);
module.exports = orderRouter;
