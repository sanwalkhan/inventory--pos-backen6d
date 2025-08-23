const express = require("express");
const router = express.Router();
const { getPermissions } = require("../controllers/managerController");

router.get("/manager/permissions/:userId", getPermissions);

module.exports = router;
