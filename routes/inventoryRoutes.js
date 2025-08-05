const inventoryRouter = require("express").Router();
const { getInventory } = require("../controllers/inventoryController");
inventoryRouter.get("/inventory", getInventory);
module.exports = inventoryRouter;
