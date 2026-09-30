const express = require("express");
const models = require("../models");
const { normalizers } = require("../services/records");
const { text } = require("../utils/data");

const router = express.Router();
router.get("/", async (req, res, next) => {
  try {
    const filter = text(req.query.businessId) ? { businessId: text(req.query.businessId) } : {};
    const records = await models.quotations.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json(records.map(record => ({ ...record, ...normalizers.quotations(record) })));
  } catch (error) { next(error); }
});
router.post("/", async (req, res, next) => {
  try { res.status(201).json(await models.quotations.create(normalizers.quotations(req.body))); } catch (error) { next(error); }
});
router.patch("/:id", async (req, res, next) => {
  try {
    const record = await models.quotations.findByIdAndUpdate(req.params.id, normalizers.quotations(req.body), { new: true }).lean();
    if (!record) return res.status(404).json({ error: "Quotation not found" });
    res.json(record);
  } catch (error) { next(error); }
});
router.delete("/:id", async (req, res, next) => {
  try {
    const record = await models.quotations.findByIdAndDelete(req.params.id).lean();
    if (!record) return res.status(404).json({ error: "Quotation not found" });
    res.json({ ok: true, id: req.params.id });
  } catch (error) { next(error); }
});
module.exports = router;
