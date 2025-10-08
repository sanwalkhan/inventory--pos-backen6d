const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbotController");
const { authenticate } = require("../middleware/authmiddleware");

router.post("/chat", authenticate, chatbotController.chatWithBot);

router.get("/history", authenticate, chatbotController.getChatHistory);

router.delete("/history", authenticate, chatbotController.clearChatHistory);

module.exports = router;
