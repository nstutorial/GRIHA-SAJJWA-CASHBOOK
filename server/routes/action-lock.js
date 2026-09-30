const express = require("express");
const models = require("../models");
const { hashPassword } = require("../middleware/auth");
const { text } = require("../utils/data");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const record = await models.actionLocks.findOne({ key: "editDelete" }).lean();
    res.json({ hasPassword: Boolean(record?.passwordHash) });
  } catch (error) {
    next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const password = String(req.body.password || "");
    if (password.length < 4) {
      res.status(400).json({ error: "Password must be at least 4 characters." });
      return;
    }
    const { salt, hash } = hashPassword(password);
    await models.actionLocks.findOneAndUpdate(
      { key: "editDelete" },
      {
        key: "editDelete",
        passwordSalt: salt,
        passwordHash: hash,
        updatedBy: text(req.user?.username || req.user?.name)
      },
      { new: true, upsert: true }
    ).lean();
    res.json({ ok: true, hasPassword: true });
  } catch (error) {
    next(error);
  }
});

router.post("/verify", async (req, res, next) => {
  try {
    const password = String(req.body.password || "");
    const record = await models.actionLocks.findOne({ key: "editDelete" }).lean();
    if (!record?.passwordHash) {
      res.json({ ok: password === "1234" });
      return;
    }
    const { hash } = hashPassword(password, record.passwordSalt);
    res.json({ ok: hash === record.passwordHash });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
