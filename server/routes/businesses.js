const express = require("express");
const models = require("../models");
const { normalizers } = require("../services/records");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try { res.json(await models.businesses.find({}).sort({ name: 1 }).lean()); } catch (error) { next(error); }
});
router.post("/", async (req, res, next) => {
  try { res.status(201).json(await models.businesses.create(normalizers.businesses(req.body))); } catch (error) { next(error); }
});
router.patch("/:id", async (req, res, next) => {
  try {
    const record = await models.businesses.findByIdAndUpdate(req.params.id, normalizers.businesses(req.body), { new: true }).lean();
    if (!record) return res.status(404).json({ error: "Business not found" });
    res.json(record);
  } catch (error) { next(error); }
});
router.delete("/:id", async (req, res, next) => {
  try {
    const record = await models.businesses.findByIdAndDelete(req.params.id).lean();
    if (!record) return res.status(404).json({ error: "Business not found" });
    res.json({ ok: true, id: req.params.id });
  } catch (error) { next(error); }
});
module.exports = router;
