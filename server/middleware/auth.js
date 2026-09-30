const crypto = require("crypto");
const models = require("../models");
const { num, text } = require("../utils/data");

const jwtSecret = process.env.JWT_SECRET || "gssteelcashbooksecretkey";
const tokenTtlMs = 1000 * 60 * 60 * 24 * 7;

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function signTokenPayload(payload) {
  return crypto
    .createHmac("sha256", jwtSecret)
    .update(payload)
    .digest("base64url");
}

function createToken(user) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    sub: String(user._id),
    username: user.username,
    role: user.role || "admin",
    exp: Date.now() + tokenTtlMs
  }));
  return `${header}.${payload}.${signTokenPayload(`${header}.${payload}`)}`;
}

function verifyToken(token) {
  const parts = text(token).split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = signTokenPayload(`${header}.${payload}`);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded.sub || num(decoded.exp) < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 64, "sha512").toString("hex");
  return { salt, hash };
}

function publicUser(user) {
  return {
    id: String(user._id),
    name: text(user.name),
    username: text(user.username),
    role: text(user.role) || "admin",
    blocked: user.blocked === true
  };
}

async function requireAuth(req, res, next) {
  const header = text(req.headers.authorization);
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7) : "";
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  const user = await models.users.findById(decoded.sub).lean();
  if (!user) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  if (user.blocked === true) {
    res.status(403).json({ error: "User is blocked." });
    return;
  }
  req.user = publicUser(user);
  next();
}

function requireAdmin(req, res, next) {
  if (text(req.user?.role).toLowerCase() !== "admin") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}

module.exports = {
  createToken,
  hashPassword,
  publicUser,
  requireAdmin,
  requireAuth,
  verifyToken
};
