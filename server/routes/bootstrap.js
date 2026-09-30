const express = require("express");
const { bootstrapData } = require("../services/records");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    res.json(await bootstrapData(req.query));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
