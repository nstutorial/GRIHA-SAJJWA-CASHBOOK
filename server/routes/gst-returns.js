const express = require("express");
const models = require("../models");
const { logAudit } = require("../services/audit");
const { text, num } = require("../utils/data");

function inRange(date, from, to) {
  const value = text(date).slice(0, 10);
  return (!from || value >= from) && (!to || value <= to);
}

function buildReport(rows, from, to) {
  const invoices = rows.filter(row => row.billData && Array.isArray(row.billData.items) && inRange(row.date, from, to)).map(row => {
    const bill = row.billData;
    const customer = bill.customer || {};
    const totals = bill.goodsTotals || {};
    return {
      date: text(row.date).slice(0, 10), invoiceNo: text(row.memo), customer: text(customer.label || customer.name || row.party), gstin: text(customer.gstin),
      taxable: num(totals.taxable), igst: num(totals.igst), cgst: num(totals.cgst), sgst: num(totals.sgst), total: num(totals.total), items: bill.items
    };
  });
  const outward = invoices.reduce((sum, row) => ({
    taxable: sum.taxable + row.taxable, igst: sum.igst + row.igst, cgst: sum.cgst + row.cgst, sgst: sum.sgst + row.sgst, total: sum.total + row.total
  }), { taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 });
  const hsnMap = new Map();
  invoices.forEach(invoice => (invoice.items || []).forEach(item => {
    const key = `${text(item.hsn) || "-"}|${num(item.gst)}`;
    const summary = hsnMap.get(key) || { hsn: text(item.hsn) || "-", rate: num(item.gst), qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
    summary.qty += num(item.qty); summary.taxable += num(item.taxable); summary.igst += num(item.igst); summary.cgst += num(item.cgst); summary.sgst += num(item.sgst); summary.total += num(item.total);
    hsnMap.set(key, summary);
  }));
  return { from, to, invoices, outward, hsn: [...hsnMap.values()] };
}

const router = express.Router();
const invoiceKey = value => text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");

router.get("/gstr1", async (req, res, next) => {
  try {
    const rows = await models.gstr1Returns.find({}).sort({ returnPeriod: -1, createdAt: -1 }).lean();
    res.json(rows);
  } catch (error) { next(error); }
});

router.delete("/gstr1/:returnKey", async (req, res, next) => {
  try {
    const returnKey = text(req.params.returnKey).toUpperCase();
    if (!/^[0-9A-Z]{15}\\|(0[1-9]|1[0-2])\\d{4}$/.test(returnKey)) {
      res.status(400).json({ error: "Invalid GSTR-1 return key." });
      return;
    }
    const row = await models.gstr1Returns.findOneAndDelete({ returnKey }).lean();
    if (!row) {
      res.status(404).json({ error: "GSTR-1 return not found." });
      return;
    }
    await logAudit(req, {
      action: "delete",
      collection: "gstr1Returns",
      recordId: returnKey,
      before: { gstin: row.gstin, returnPeriod: row.returnPeriod, sourceFile: row.sourceFile, importedAt: row.importedAt },
      meta: { gstin: row.gstin, returnPeriod: row.returnPeriod }
    });
    res.json({ ok: true, returnKey });
  } catch (error) { next(error); }
});

router.delete("/gstr1", async (req, res, next) => {
  try {
    const result = await models.gstr1Returns.deleteMany({});
    await logAudit(req, {
      action: "delete",
      collection: "gstr1Returns",
      recordId: "all",
      meta: { deletedCount: result.deletedCount || 0 }
    });
    res.json({ ok: true, deletedCount: result.deletedCount || 0 });
  } catch (error) { next(error); }
});

router.post("/gstr1/import", async (req, res, next) => {
  try {
    const gstin = text(req.body.gstin).toUpperCase();
    const returnPeriod = text(req.body.returnPeriod);
    const invoices = Array.isArray(req.body.invoices) ? req.body.invoices : [];
    const summaries = Array.isArray(req.body.summaries) ? req.body.summaries : [];
    const hsnRows = Array.isArray(req.body.hsnRows) ? req.body.hsnRows : [];
    const documentRows = Array.isArray(req.body.documentRows) ? req.body.documentRows : [];
    const inputTotals = req.body.totals && typeof req.body.totals === "object" ? req.body.totals : {};
    if (!/^[0-9A-Z]{15}$/.test(gstin)) {
      res.status(400).json({ error: "A valid 15-character GSTIN is required." });
      return;
    }
    if (!/^(0[1-9]|1[0-2])\d{4}$/.test(returnPeriod)) {
      res.status(400).json({ error: "Return period must use MMYYYY format." });
      return;
    }
    if ((!invoices.length && !summaries.length && !hsnRows.length && !documentRows.length)
      || invoices.length + summaries.length + hsnRows.length + documentRows.length > 20000) {
      res.status(400).json({ error: "Provide between 1 and 20,000 supported GSTR-1 rows." });
      return;
    }
    const returnKey = `${gstin}|${returnPeriod}`;
    const recordData = {
      gstin,
      returnPeriod,
      returnKey,
      filingType: text(req.body.filingType),
      invoices: invoices.map(row => ({
        invoiceNo: text(row.invoiceNo),
        documentType: text(row.documentType),
        section: text(row.section),
        customer: text(row.customer),
        gstin: text(row.gstin).toUpperCase(),
        invoiceDate: text(row.invoiceDate).slice(0, 10),
        taxable: num(row.taxable),
        igst: num(row.igst),
        cgst: num(row.cgst),
        sgst: num(row.sgst),
        cess: num(row.cess),
        total: num(row.total)
      })).filter(row => row.invoiceNo),
      summaries: summaries.map(row => ({
        section: text(row.section),
        placeOfSupply: text(row.placeOfSupply),
        rate: num(row.rate),
        taxable: num(row.taxable),
        igst: num(row.igst),
        cgst: num(row.cgst),
        sgst: num(row.sgst),
        cess: num(row.cess),
        total: num(row.total)
      })),
      hsnRows: hsnRows.map(row => ({
        section: text(row.section),
        hsn: text(row.hsn),
        description: text(row.description),
        unit: text(row.unit),
        quantity: num(row.quantity),
        rate: num(row.rate),
        taxable: num(row.taxable),
        igst: num(row.igst),
        cgst: num(row.cgst),
        sgst: num(row.sgst),
        cess: num(row.cess),
        total: num(row.total)
      })),
      documentRows: documentRows.map(row => ({
        documentTypeCode: text(row.documentTypeCode),
        from: text(row.from),
        to: text(row.to),
        issued: num(row.issued),
        cancelled: num(row.cancelled),
        netIssued: num(row.netIssued)
      })),
      sections: Array.isArray(req.body.sections) ? req.body.sections.map(text).filter(Boolean) : [],
      totals: Object.fromEntries(["taxable", "igst", "cgst", "sgst", "cess", "total"].map(key => [key, num(inputTotals[key])])),
      sourceFile: text(req.body.fileName),
      importedAt: new Date().toISOString()
    };
    if (!recordData.invoices.length && !recordData.summaries.length) {
      res.status(400).json({ error: "No valid GSTR-1 invoice or summary rows were found." });
      return;
    }
    if (Buffer.byteLength(JSON.stringify(recordData), "utf8") > 12 * 1024 * 1024) {
      res.status(413).json({ error: "The normalized GSTR-1 return is too large to store. Import a smaller return file." });
      return;
    }
    const before = await models.gstr1Returns.findOne({ returnKey }).lean();
    const row = await models.gstr1Returns.findOneAndUpdate({ returnKey }, { $set: recordData }, {
      new: true, upsert: true, runValidators: true
    }).lean();
    await logAudit(req, {
      action: before ? "update" : "create",
      collection: "gstr1Returns",
      recordId: returnKey,
      before: before ? { gstin, returnPeriod, sourceFile: before.sourceFile, importedAt: before.importedAt } : null,
      after: { gstin, returnPeriod, sourceFile: row.sourceFile, importedAt: row.importedAt },
      meta: { gstin, returnPeriod, invoiceCount: row.invoices.length, summaryCount: row.summaries.length }
    });
    res.json({ row, replaced: Boolean(before) });
  } catch (error) { next(error); }
});

router.get("/gstr2b", async (req, res, next) => {
  try {
    const rows = await models.gst2bInvoices.find({}).sort({ invoiceDate: -1, createdAt: -1 }).lean();
    res.json(rows);
  } catch (error) { next(error); }
});

router.delete("/gstr2b/:id", async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
      res.status(400).json({ error: "Invalid GSTR-2B invoice id." });
      return;
    }
    const invoice = await models.gst2bInvoices.findByIdAndDelete(req.params.id).lean();
    if (!invoice) {
      res.status(404).json({ error: "GSTR-2B invoice not found." });
      return;
    }
    await logAudit(req, {
      action: "delete",
      collection: "gst2bInvoices",
      recordId: req.params.id,
      before: invoice,
      meta: { invoiceNo: invoice.invoiceNo, supplierGstin: invoice.supplierGstin }
    });
    res.json({ ok: true, id: req.params.id, invoiceNo: invoice.invoiceNo });
  } catch (error) { next(error); }
});

router.delete("/gstr2b", async (req, res, next) => {
  try {
    const result = await models.gst2bInvoices.deleteMany({});
    await logAudit(req, {
      action: "delete",
      collection: "gst2bInvoices",
      recordId: "all",
      meta: { deletedCount: result.deletedCount || 0 }
    });
    res.json({ ok: true, deletedCount: result.deletedCount || 0 });
  } catch (error) { next(error); }
});

router.post("/gstr2b/import", async (req, res, next) => {
  try {
    const invoices = Array.isArray(req.body.invoices) ? req.body.invoices : [];
    if (!invoices.length || invoices.length > 20000) {
      res.status(400).json({ error: "Provide between 1 and 20,000 invoice rows." });
      return;
    }
    const uniqueInvoices = new Map();
    for (const row of invoices) {
      const number = text(row.invoiceNo);
      const key = invoiceKey(number);
      if (!number || !key) continue;
      const supplierGstin = text(row.gstin || row.supplierGstin).toUpperCase();
      const record = {
        invoiceNo: number,
        invoiceKey: key,
        supplier: text(row.supplier),
        supplierGstin,
        invoiceDate: text(row.invoiceDate || row.date).slice(0, 10),
        supplierFilingDate: text(row.supplierFilingDate).slice(0, 10),
        taxable: num(row.taxable),
        igst: num(row.igst),
        cgst: num(row.cgst),
        sgst: num(row.sgst),
        cess: num(row.cess),
        total: num(row.total),
        itcAvailable: text(row.itcAvailable).toUpperCase(),
        sourceFile: text(req.body.fileName),
        importedAt: new Date().toISOString()
      };
      uniqueInvoices.set(`${supplierGstin}|${key}`, record);
    }
    if (!uniqueInvoices.size) {
      res.status(400).json({ error: "No valid invoice numbers were found in the import." });
      return;
    }
    const supplierGstins = [...new Set([...uniqueInvoices.values()].map(row => row.supplierGstin).filter(Boolean))];
    if (supplierGstins.length > 1) {
      res.status(400).json({ error: "This GSTR-2B file contains invoices for multiple supplier GSTINs. Check the file and import the correct business statement." });
      return;
    }
    const operations = [...uniqueInvoices.values()].map(record => ({
      updateOne: {
        filter: { supplierGstin: record.supplierGstin, invoiceKey: record.invoiceKey },
        update: { $set: record },
        upsert: true
      }
    }));

    const result = await models.gst2bInvoices.bulkWrite(operations, { ordered: false });
    const rows = await models.gst2bInvoices.find({}).sort({ invoiceDate: -1, createdAt: -1 }).lean();
    res.json({
      rows,
      imported: uniqueInvoices.size,
      inserted: result.upsertedCount || 0,
      existing: result.matchedCount || 0,
      duplicateRows: invoices.length - uniqueInvoices.size
    });
  } catch (error) { next(error); }
});

router.get("/gstr3b", async (req, res, next) => {
  try {
    const rows = await models.gstr3bReturns.find({}).sort({ returnPeriod: -1 }).lean();
    res.json(rows);
  } catch (error) { next(error); }
});

router.post("/gstr3b/import", async (req, res, next) => {
  try {
    const gstin = text(req.body.gstin).toUpperCase();
    const returnPeriod = text(req.body.returnPeriod);
    const values = req.body.values && typeof req.body.values === "object" ? req.body.values : null;
    const sectionsAvailable = Array.isArray(req.body.sectionsAvailable)
      ? req.body.sectionsAvailable.map(text).filter(section => ["outward", "itc", "payment"].includes(section))
      : [];
    if (!gstin || !/^\d{15}$/.test(gstin)) {
      res.status(400).json({ error: "A valid 15-character GSTIN is required." });
      return;
    }
    if (!/^(0[1-9]|1[0-2])\d{4}$/.test(returnPeriod)) {
      res.status(400).json({ error: "Return period must use MMYYYY format." });
      return;
    }
    if (!values || !Object.keys(values).length) {
      res.status(400).json({ error: "No recognized GSTR-3B return values were provided." });
      return;
    }
    const returnKey = `${gstin}|${returnPeriod}`;
    const before = await models.gstr3bReturns.findOne({ returnKey }).lean();
    const record = await models.gstr3bReturns.findOneAndUpdate({ returnKey }, {
      $set: { gstin, returnPeriod, returnKey, values, sectionsAvailable, sourceFile: text(req.body.fileName), importedAt: new Date().toISOString() }
    }, { new: true, upsert: true, runValidators: true }).lean();
    await logAudit(req, {
      action: before ? "update" : "create",
      collection: "gstr3bReturns",
      recordId: returnKey,
      before: before ? { gstin, returnPeriod, sourceFile: before.sourceFile, importedAt: before.importedAt } : null,
      after: { gstin, returnPeriod, sourceFile: record.sourceFile, importedAt: record.importedAt },
      meta: { gstin, returnPeriod, sourceFile: record.sourceFile }
    });
    res.json({ row: record, replaced: Boolean(before) });
  } catch (error) { next(error); }
});

router.get("/tally-imports", async (req, res, next) => {
  try {
    const rows = await models.tallyGstImports.find({}).sort({ kind: 1 }).lean();
    res.json(rows);
  } catch (error) { next(error); }
});

router.post("/tally-imports/import", async (req, res, next) => {
  try {
    const kind = text(req.body.kind).toLowerCase();
    const inputRows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!["sales", "purchases"].includes(kind)) {
      res.status(400).json({ error: "Import kind must be sales or purchases." });
      return;
    }
    if (!inputRows.length || inputRows.length > 20000) {
      res.status(400).json({ error: "Provide between 1 and 20,000 Tally rows." });
      return;
    }
    const rows = inputRows.map(row => ({
      date: text(row.date).slice(0, 10),
      invoiceNo: text(row.invoiceNo),
      party: text(row.party),
      gstin: text(row.gstin).toUpperCase(),
      taxable: num(row.taxable),
      igst: num(row.igst),
      cgst: num(row.cgst),
      sgst: num(row.sgst),
      cess: num(row.cess),
      tax: num(row.tax),
      total: num(row.total)
    })).filter(row => row.date || row.invoiceNo || row.taxable || row.total);
    if (!rows.length) {
      res.status(400).json({ error: "No usable Tally register rows were found." });
      return;
    }
    if (Buffer.byteLength(JSON.stringify(rows), "utf8") > 12 * 1024 * 1024) {
      res.status(413).json({ error: "The normalized Tally register is too large to store as one import. Split it by month or financial year and import smaller files." });
      return;
    }
    const before = await models.tallyGstImports.findOne({ kind }).lean();
    const record = await models.tallyGstImports.findOneAndUpdate({ kind }, {
      $set: { kind, rows, rowCount: rows.length, sourceFile: text(req.body.fileName), importedAt: new Date().toISOString() }
    }, { new: true, upsert: true, runValidators: true }).lean();
    await logAudit(req, {
      action: before ? "update" : "create",
      collection: "tallyGstImports",
      recordId: kind,
      before: before ? { kind, rowCount: before.rowCount, sourceFile: before.sourceFile, importedAt: before.importedAt } : null,
      after: { kind, rowCount: record.rowCount, sourceFile: record.sourceFile, importedAt: record.importedAt },
      meta: { kind, rowCount: record.rowCount, sourceFile: record.sourceFile }
    });
    res.json({ row: record, replaced: Boolean(before) });
  } catch (error) { next(error); }
});

router.get("/", async (req, res, next) => {
  try {
    const from = text(req.query.from);
    const to = text(req.query.to);
    const rows = await models.transactions.find({ billData: { $ne: null } }).lean();
    res.json(buildReport(rows, from, to));
  } catch (error) { next(error); }
});

module.exports = router;
