const express = require("express");
const fs = require("fs");
const path = require("path");
const models = require("../models");
const { logAudit } = require("../services/audit");
const {
  bootstrapData,
  modelName,
  normalizers,
  queryFilter,
  saveRecord
} = require("../services/records");
const { text } = require("../utils/data");

function createCollectionsRouter({ root }) {
  const router = express.Router();

  router.get("/:collection", async (req, res, next) => {
    try {
      const collection = req.params.collection;
      const Model = modelName(collection);
      const limit = Math.min(Math.max(Number(req.query.limit || 2000), 1), 20000);
      const page = Math.max(Number(req.query.page || 1), 1);
      const skip = (page - 1) * limit;
      const filter = queryFilter(collection, req.query);
      const [rows, total] = await Promise.all([
        Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        req.query.page ? Model.countDocuments(filter) : Promise.resolve(null)
      ]);
      if (req.query.page) {
        res.json({ rows, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
        return;
      }
      res.json(rows);
    } catch (error) {
      next(error);
    }
  });

  router.post("/seed", async (req, res, next) => {
    try {
      const seedPath = path.join(root, "data", "seed-data.json");
      const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
      const result = {};

      for (const [name, Model] of Object.entries(models)) {
        if (name === "users" || name === "auditLogs" || name === "actionLocks") continue;
        const existing = await Model.countDocuments();
        if (existing) {
          result[name] = { skipped: true, count: existing };
          continue;
        }

        const rows = (seed[name] || []).map(normalizers[name]);
        if (rows.length) await Model.insertMany(rows, { ordered: false });
        result[name] = { inserted: rows.length };
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/sync", async (req, res, next) => {
    try {
      const payload = req.body || {};
      const result = {};
      const collections = ["transactions", "dues", "customers", "cheques", "outgoingCheques", "suppliers", "supplierOpeningBalances", "items", "purchases", "notes", "manualCreditors", "manualChartAccounts"];

      for (const collection of collections) {
        const rows = Array.isArray(payload[collection]) ? payload[collection] : [];
        result[collection] = { saved: 0 };
        for (const row of rows) {
          await saveRecord(collection, row, "web");
          result[collection].saved += 1;
        }
      }

      const settings = Array.isArray(payload.settings) ? payload.settings : [];
      result.settings = { saved: 0 };
      for (const setting of settings) {
        const normalized = normalizers.settings(setting);
        if (!normalized.key) continue;
        await models.settings.findOneAndUpdate(
          { key: normalized.key },
          normalized,
          { new: true, upsert: true }
        ).lean();
        result.settings.saved += 1;
      }

      const chequeOverrides = payload.chequeOverrides && typeof payload.chequeOverrides === "object" ? payload.chequeOverrides : {};
      result.chequeOverrides = { saved: 0 };
      for (const [chequeNo, response] of Object.entries(chequeOverrides)) {
        const normalizedChequeNo = text(chequeNo);
        if (!normalizedChequeNo) continue;
        const updated = await models.cheques.findOneAndUpdate(
          { chequeNo: normalizedChequeNo },
          { response: text(response) || "Pending" },
          { new: true }
        ).lean();
        if (updated) result.chequeOverrides.saved += 1;
      }

      res.json({
        ok: true,
        result,
        bootstrap: await bootstrapData()
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:collection", async (req, res, next) => {
    try {
      const collection = req.params.collection;
      const record = await saveRecord(collection, req.body, "web");
      res.status(201).json(record);
    } catch (error) {
      next(error);
    }
  });

  router.put("/settings/:key", async (req, res, next) => {
    try {
      const before = await models.settings.findOne({ key: req.params.key }).lean();
      const record = await models.settings.findOneAndUpdate(
        { key: req.params.key },
        { key: req.params.key, value: req.body.value },
        { new: true, upsert: true }
      ).lean();
      await logAudit(req, {
        action: "edit",
        collection: "settings",
        recordId: req.params.key,
        before,
        after: record
      });
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:collection/:id", async (req, res, next) => {
    try {
      const Model = modelName(req.params.collection);
      const before = await Model.findById(req.params.id).lean();
      const record = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
      if (!record) {
        res.status(404).json({ error: "Record not found" });
        return;
      }
      await logAudit(req, {
        action: "edit",
        collection: req.params.collection,
        recordId: req.params.id,
        before,
        after: record
      });
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:collection/:id", async (req, res, next) => {
    try {
      const Model = modelName(req.params.collection);
      const record = await Model.findByIdAndDelete(req.params.id).lean();
      if (!record) {
        res.status(404).json({ error: "Record not found" });
        return;
      }
      await logAudit(req, {
        action: "delete",
        collection: req.params.collection,
        recordId: req.params.id,
        before: record
      });
      res.json({ ok: true, id: req.params.id });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createCollectionsRouter;
