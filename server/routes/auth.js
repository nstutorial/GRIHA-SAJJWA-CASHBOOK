const express = require("express");
const models = require("../models");
const { createToken, hashPassword, publicUser, requireAdmin, requireAuth } = require("../middleware/auth");
const { logAudit } = require("../services/audit");
const { text } = require("../utils/data");

const router = express.Router();

router.get("/signup-status", async (req, res, next) => {
  try {
    const [userCount, setupClaim] = await Promise.all([
      models.users.countDocuments(),
      models.settings.findOne({ key: "initialAdminClaim" }).lean()
    ]);
    res.json({ enabled: userCount === 0 && !setupClaim });
  } catch (error) {
    next(error);
  }
});

router.post("/signup", async (req, res, next) => {
  try {
    const name = text(req.body.name);
    const username = text(req.body.username || req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    if (!username || password.length < 6) {
      res.status(400).json({ error: "Username and 6 character password are required." });
      return;
    }
    if (await models.users.exists({})) {
      res.status(403).json({ error: "Public signup is closed. Ask the administrator to create your account." });
      return;
    }
    try {
      await models.settings.create({ key: "initialAdminClaim", value: true });
    } catch (claimError) {
      if (claimError.code === 11000) {
        res.status(403).json({ error: "Public signup is closed. Ask the administrator to create your account." });
        return;
      }
      throw claimError;
    }
    const exists = await models.users.findOne({ username }).lean();
    if (exists) {
      await models.settings.deleteOne({ key: "initialAdminClaim" });
      res.status(409).json({ error: "User already exists." });
      return;
    }
    const { salt, hash } = hashPassword(password);
    let user;
    try {
      user = await models.users.create({
        name: name || username,
        username,
        passwordSalt: salt,
        passwordHash: hash,
        role: "admin",
        lastLoginAt: new Date().toISOString()
      });
    } catch (createError) {
      await models.settings.deleteOne({ key: "initialAdminClaim" });
      throw createError;
    }
    res.status(201).json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const username = text(req.body.username || req.body.email).toLowerCase();
    const password = String(req.body.password || "");
    const user = await models.users.findOne({ username });
    if (!user) {
      res.status(401).json({ error: "Invalid login details." });
      return;
    }
    if (user.blocked === true) {
      res.status(403).json({ error: "This user is blocked. Contact admin." });
      return;
    }
    const { hash } = hashPassword(password, user.passwordSalt);
    if (hash !== user.passwordHash) {
      res.status(401).json({ error: "Invalid login details." });
      return;
    }
    user.lastLoginAt = new Date().toISOString();
    await user.save();
    res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.get("/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const users = await models.users.find({})
      .sort({ createdAt: 1, username: 1 })
      .lean();
    res.json(users.map(publicUser));
  } catch (error) {
    next(error);
  }
});

router.post("/users", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const name = text(req.body.name);
    const username = text(req.body.username).toLowerCase();
    const password = String(req.body.password || "");
    if (!name || !/^[a-z0-9._-]{3,64}$/.test(username) || password.length < 8) {
      res.status(400).json({ error: "Name, a 3–64 character username, and an 8 character password are required." });
      return;
    }
    const { salt, hash } = hashPassword(password);
    const user = await models.users.create({ name, username, passwordSalt: salt, passwordHash: hash, role: req.body.role === "admin" ? "admin" : "user" });
    await logAudit(req, { action: "create", collection: "users", recordId: user._id, after: publicUser(user) });
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
    next(error);
  }
});

router.patch("/users/:id/block", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const blocked = req.body.blocked === true;
    if (String(req.params.id) === String(req.user.id) && blocked) {
      res.status(400).json({ error: "You cannot block your own account." });
      return;
    }
    const user = await models.users.findByIdAndUpdate(
      req.params.id,
      { blocked },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id/password", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const password = String(req.body.password || "");
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." });
      return;
    }
    const { salt, hash } = hashPassword(password);
    const user = await models.users.findByIdAndUpdate(
      req.params.id,
      { passwordSalt: salt, passwordHash: hash },
      { new: true }
    );
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters." });
      return;
    }
    const user = await models.users.findById(req.user.id);
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const { hash } = hashPassword(currentPassword, user.passwordSalt);
    if (hash !== user.passwordHash) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    const nextPassword = hashPassword(newPassword);
    user.passwordSalt = nextPassword.salt;
    user.passwordHash = nextPassword.hash;
    await user.save();
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
