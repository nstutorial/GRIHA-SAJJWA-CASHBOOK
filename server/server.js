const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const { connectDB, mongoUri } = require("./config/db");
const authRoutes = require("./routes/auth");
const actionLockRoutes = require("./routes/action-lock");
const bootstrapRoutes = require("./routes/bootstrap");
const createCollectionsRouter = require("./routes/collections");
const businessRoutes = require("./routes/businesses");
const quotationRoutes = require("./routes/quotations");
const gstReturnsRoutes = require("./routes/gst-returns");
const { requireAuth } = require("./middleware/auth");

const app = express();
const root = __dirname;
const clientRoot = path.join(root, "..", "client");
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || "127.0.0.1";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
let connectPromise = null;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowedOrigin = origin === "null" ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin || "") ||
    /^http:\/\/localhost:\d+$/.test(origin || "") ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin || "") ||
    allowedOrigins.includes(origin);
  if (isAllowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "20mb" }));
const staticMaxAge = process.env.NODE_ENV === "production" ? "1d" : 0;
app.use(express.static(clientRoot, {
  etag: true,
  maxAge: staticMaxAge
}));

async function ensureDbConnection() {
  if (mongoose.connection.readyState === 1) return;
  if (!connectPromise) {
    connectPromise = connectDB().finally(() => {
      connectPromise = null;
    });
  }
  await connectPromise;
}

app.use("/api", async (req, res, next) => {
  try {
    await ensureDbConnection();
    next();
  } catch (error) {
    next(error);
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database: mongoose.connection.readyState === 1 ? "connected" : "not connected"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api", requireAuth);
app.use("/api/bootstrap", bootstrapRoutes);
app.use("/api/action-lock", actionLockRoutes);
app.use("/api/businesses", businessRoutes);
app.use("/api/quotations", quotationRoutes);
app.use("/api/gst-returns", gstReturnsRoutes);
app.use("/api", createCollectionsRouter({ root }));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.message || "Server error" });
});

async function start() {
  await connectDB();
  listenOnAvailablePort(port);
}

function listenOnAvailablePort(preferredPort, attempts = 5) {
  const server = app.listen(preferredPort, host, () => {
    console.log(`G.S. Steel Furniture app running at http://${host}:${preferredPort}/`);
    console.log(`MongoDB: ${mongoUri}`);
  });

  server.on("error", error => {
    if (error.code === "EADDRINUSE" && attempts > 0) {
      const nextPort = preferredPort + 1;
      console.warn(`Port ${preferredPort} is already in use. Trying ${nextPort}...`);
      listenOnAvailablePort(nextPort, attempts - 1);
      return;
    }
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

if (require.main === module) {
  start().catch(error => {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  });
}

module.exports = app;
