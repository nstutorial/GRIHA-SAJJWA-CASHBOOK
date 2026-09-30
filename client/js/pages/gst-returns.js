let gstReportTab = "gstr1";
let gstr1ImportedView = "groups";
let gstReportData = null;
let gst2bStatement = null;
let gst2bExpandedSuppliers = new Set();
let gstr3bReturns = [];
let gstr3bSavedReport = null;
let gstr1Returns = [];

function gstr1InvoiceKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeGstr1Json(payload) {
  const root = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  const gstin = text(gstr3bField(root, "gstin", "gstin of taxpayer", "gstin/uin")).toUpperCase();
  const rawPeriod = text(gstr3bField(root, "fp", "ret_period", "retPeriod", "return period", "period"));
  const returnPeriod = /^(0[1-9]|1[0-2])\d{4}$/.test(rawPeriod) ? rawPeriod
    : /^\d{4}-(0[1-9]|1[0-2])$/.test(rawPeriod) ? `${rawPeriod.slice(5)}${rawPeriod.slice(0, 4)}` : "";
  if (!/^[0-9A-Z]{15}$/.test(gstin) || !returnPeriod) {
    throw new Error("The JSON must include a valid GSTIN and return period (MMYYYY).");
  }

  const invoices = [];
  const summaries = [];
  const hsnRows = [];
  const documentRows = [];
  const sections = [];
  const readAmounts = row => {
    const itemRows = Array.isArray(row?.itms) ? row.itms : Array.isArray(row?.items) ? row.items : [];
    const itemAmounts = itemRows.reduce((sum, item) => {
      const detail = item.itm_det || item.itemDetail || item;
      sum.taxable += num(gstr3bField(detail, "txval", "taxable value", "taxable amount"));
      sum.igst += num(gstr3bField(detail, "iamt", "igst", "integrated tax"));
      sum.cgst += num(gstr3bField(detail, "camt", "cgst", "central tax"));
      sum.sgst += num(gstr3bField(detail, "samt", "sgst", "state/ut tax", "state tax"));
      sum.cess += num(gstr3bField(detail, "csamt", "cess"));
      return sum;
    }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
    const value = (names, itemValue) => num(gstr3bField(row, ...names)) || itemValue;
    const amounts = {
      taxable: value(["txval", "taxable value", "taxable amount"], itemAmounts.taxable),
      igst: value(["iamt", "igst", "integrated tax"], itemAmounts.igst),
      cgst: value(["camt", "cgst", "central tax"], itemAmounts.cgst),
      sgst: value(["samt", "sgst", "state/ut tax", "state tax"], itemAmounts.sgst),
      cess: value(["csamt", "cess"], itemAmounts.cess)
    };
    const suppliedTotal = num(gstr3bField(row, "val", "invoice value", "invoice amount", "total value", "total"));
    amounts.total = suppliedTotal || amounts.taxable + amounts.igst + amounts.cgst + amounts.sgst + amounts.cess;
    return amounts;
  };
  const addInvoice = (row, context, section, documentType = "Invoice") => {
    const invoiceNo = text(gstr3bField(row, "inum", "nt_num", "ntnum", "invoice number", "invoice no", "document number") || context.invoiceNo);
    if (!invoiceNo) return;
    const amounts = readAmounts(row);
    const sign = documentType === "Credit note" ? -1 : 1;
    invoices.push({
      invoiceNo,
      documentType,
      section,
      customer: text(gstr3bField(row, "trdnm", "trade name", "customer name") || context.customer),
      gstin: text(gstr3bField(row, "ctin", "gstin of customer", "customer gstin", "gstin") || context.gstin).toUpperCase(),
      invoiceDate: gst2bDate(gstr3bField(row, "idt", "nt_dt", "ntdt", "invoice date", "note date", "date") || context.invoiceDate),
      taxable: amounts.taxable * sign,
      igst: amounts.igst * sign,
      cgst: amounts.cgst * sign,
      sgst: amounts.sgst * sign,
      cess: amounts.cess * sign,
      total: amounts.total * sign
    });
  };
  const addDocuments = (sectionName, documentKey, noteSection = false) => {
    const groups = root?.[sectionName];
    if (!Array.isArray(groups)) return;
    sections.push(sectionName);
    groups.forEach(group => {
      const inherited = {
        gstin: text(gstr3bField(group, "ctin", "gstin of customer", "customer gstin")).toUpperCase(),
        customer: text(gstr3bField(group, "trdnm", "trade name", "customer name"))
      };
      const documents = Array.isArray(group?.[documentKey]) ? group[documentKey] : [];
      documents.forEach(document => {
        const noteType = text(gstr3bField(document, "ntty", "note type")).toUpperCase();
        addInvoice(document, inherited, sectionName, noteSection && noteType === "C" ? "Credit note" : noteSection ? "Debit note" : "Invoice");
      });
    });
  };
  addDocuments("b2b", "inv");
  addDocuments("b2cl", "inv");
  addDocuments("exp", "inv");
  addDocuments("cdnr", "nt", true);
  addDocuments("cdnur", "nt", true);

  if (Array.isArray(root?.b2cs)) {
    sections.push("b2cs");
    root.b2cs.forEach(row => {
      const amounts = readAmounts(row);
      summaries.push({ section: "b2cs", placeOfSupply: text(row.pos), rate: num(row.rt), ...amounts });
    });
  }
  ["hsn_b2b", "hsn_b2c"].forEach(section => {
    const rows = root?.hsn?.[section];
    if (!Array.isArray(rows)) return;
    sections.push("hsn");
    rows.forEach(row => {
      const amounts = readAmounts(row);
      hsnRows.push({
        section,
        hsn: text(row.hsn_sc),
        description: text(row.desc),
        unit: text(row.uqc),
        quantity: num(row.qty),
        rate: num(row.rt),
        ...amounts
      });
    });
  });
  const issuedDocuments = Array.isArray(root?.doc_issue?.doc_det) ? root.doc_issue.doc_det : [];
  if (issuedDocuments.length) sections.push("doc_issue");
  issuedDocuments.forEach(group => {
    (Array.isArray(group.docs) ? group.docs : []).forEach(row => {
      documentRows.push({
        documentTypeCode: text(group.doc_num),
        from: text(row.from),
        to: text(row.to),
        issued: num(row.totnum),
        cancelled: num(row.cancel),
        netIssued: num(row.net_issue)
      });
    });
  });
  const uniqueInvoices = new Map();
  invoices.forEach(invoice => {
    const key = [invoice.gstin, gstr1InvoiceKey(invoice.invoiceNo), invoice.invoiceDate, invoice.documentType].join("|");
    if (!uniqueInvoices.has(key)) uniqueInvoices.set(key, invoice);
  });
  if (!uniqueInvoices.size && !summaries.length) {
    throw new Error("No supported GSTR-1 outward-supply sections were found (B2B, B2CL, CDNR, CDNUR, EXP, or B2CS).");
  }
  const totals = [...uniqueInvoices.values(), ...summaries].reduce((sum, row) => {
    ["taxable", "igst", "cgst", "sgst", "cess", "total"].forEach(key => { sum[key] += num(row[key]); });
    return sum;
  }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 });
  return {
    gstin,
    returnPeriod,
    filingType: text(gstr3bField(root, "filing_typ", "filing type")),
    invoices: [...uniqueInvoices.values()],
    summaries,
    hsnRows,
    documentRows,
    sections: [...new Set(sections)],
    totals
  };
}

function gstr3bKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function gstr3bField(object, ...names) {
  if (!object || typeof object !== "object") return undefined;
  const keys = new Set(names.map(gstr3bKey));
  const entry = Object.entries(object).find(([key, value]) => keys.has(gstr3bKey(key)) && value !== undefined && value !== null && value !== "");
  return entry?.[1];
}

function gstr3bAmounts(object = {}) {
  return {
    taxable: num(gstr3bField(object, "txval", "taxable value", "taxable amount")),
    igst: num(gstr3bField(object, "iamt", "igst", "integrated tax")),
    cgst: num(gstr3bField(object, "camt", "cgst", "central tax")),
    sgst: num(gstr3bField(object, "samt", "sgst", "state tax", "state/ut tax")),
    cess: num(gstr3bField(object, "csamt", "cess"))
  };
}

function normalizeGstr3bPeriod(value) {
  const raw = text(value);
  if (/^(0[1-9]|1[0-2])\d{4}$/.test(raw)) return raw;
  const isoMonth = raw.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) return `${isoMonth[2]}${isoMonth[1]}`;
  return "";
}

function normalizeGstr3bJson(payload) {
  const root = payload?.data || payload;
  const outwardSection = root?.sup_details || root?.supDetails || root?.supplies;
  const outward = outwardSection?.osup_det || outwardSection?.osupDet || outwardSection?.outward_taxable || {};
  const zeroRated = outwardSection?.osup_zero || outwardSection?.osupZero || {};
  const nilRated = outwardSection?.osup_nil_expt || outwardSection?.osupNilExpt || {};
  const reverseCharge = outwardSection?.isup_rev || outwardSection?.isupRev || {};
  const nonGst = outwardSection?.osup_nongst || outwardSection?.osupNongst || {};
  const itcSection = root?.itc_elg || root?.itcElg || root?.itc;
  const availableRows = Array.isArray(itcSection?.itc_avl) ? itcSection.itc_avl
    : Array.isArray(itcSection?.itcAvl) ? itcSection.itcAvl : [];
  const reversedRows = Array.isArray(itcSection?.itc_rev) ? itcSection.itc_rev
    : Array.isArray(itcSection?.itcRev) ? itcSection.itcRev : [];
  const available = availableRows.reduce((sum, row) => {
    const amount = gstr3bAmounts(row);
    return { igst: sum.igst + amount.igst, cgst: sum.cgst + amount.cgst, sgst: sum.sgst + amount.sgst, cess: sum.cess + amount.cess };
  }, { igst: 0, cgst: 0, sgst: 0, cess: 0 });
  const reversed = reversedRows.reduce((sum, row) => {
    const amount = gstr3bAmounts(row);
    return { igst: sum.igst + amount.igst, cgst: sum.cgst + amount.cgst, sgst: sum.sgst + amount.sgst, cess: sum.cess + amount.cess };
  }, { igst: 0, cgst: 0, sgst: 0, cess: 0 });
  const netItc = gstr3bAmounts(itcSection?.itc_net || itcSection?.itcNet || {});
  const hasNetItc = Boolean(itcSection?.itc_net || itcSection?.itcNet);
  const sectionsAvailable = [];
  if (outwardSection) sectionsAvailable.push("outward");
  if (itcSection) sectionsAvailable.push("itc");
  const availableNet = available.igst + available.cgst + available.sgst + available.cess;
  const reversedNet = reversed.igst + reversed.cgst + reversed.sgst + reversed.cess;
  const returnPeriod = normalizeGstr3bPeriod(
    gstr3bField(root, "ret_period", "retPeriod", "rtnprd", "return period", "period")
    || gstr3bField(payload, "ret_period", "retPeriod", "rtnprd", "return period", "period")
  );
  const gstin = text(gstr3bField(root, "gstin", "gstin of taxpayer", "gstin/uin")
    || gstr3bField(payload, "gstin", "gstin of taxpayer", "gstin/uin")).toUpperCase();
  if (!returnPeriod || !gstin || !sectionsAvailable.length) {
    throw new Error("The JSON must include GSTIN, return period (MMYYYY), and recognized GSTR-3B sections.");
  }
  const outwardAmounts = gstr3bAmounts(outward);
  const zeroAmounts = gstr3bAmounts(zeroRated);
  const nilAmounts = gstr3bAmounts(nilRated);
  const reverseAmounts = gstr3bAmounts(reverseCharge);
  const nonGstAmounts = gstr3bAmounts(nonGst);
  return {
    gstin,
    returnPeriod,
    sectionsAvailable,
    values: {
      outward: outwardAmounts,
      zeroRatedAmounts: zeroAmounts,
      nilRatedAmounts: nilAmounts,
      reverseChargeAmounts: reverseAmounts,
      nonGstAmounts,
      itcAvailable: available,
      itcAvailableTotal: availableNet,
      itcReversed: reversed,
      itcReversedTotal: reversedNet,
      itcNet: hasNetItc ? netItc : null,
      itcNetTotal: hasNetItc ? netItc.igst + netItc.cgst + netItc.sgst + netItc.cess : availableNet - reversedNet,
    }
  };
}

async function importGstr3bReturn() {
  const input = $("#gstr3bFile");
  const file = input?.files?.[0];
  if (!file) throw new Error("Choose a GSTR-3B return file first.");
  if (!apiAvailable) throw new Error("Database connection is required to store filed GSTR-3B returns.");
  const extension = file.name.split(".").pop().toLowerCase();
  if (extension !== "json") throw new Error("Upload the GST portal GSTR-3B JSON file. Spreadsheet and PDF exports are not supported yet.");
  const parsed = normalizeGstr3bJson(JSON.parse(await file.text()));
  const result = await apiRequest("/api/gst-returns/gstr3b/import", {
    method: "POST",
    body: JSON.stringify({ ...parsed, fileName: file.name })
  });
  await loadGstr3bReturnsFromDb();
  const status = $("#gstr3bImportStatus");
  if (status) status.textContent = `${result.replaced ? "Replaced" : "Imported"} GSTR-3B for ${parsed.returnPeriod} (${parsed.gstin}). Available sections: ${parsed.sectionsAvailable.join(", ")}.`;
  renderGstReturns();
  toast(`GSTR-3B ${parsed.returnPeriod} ${result.replaced ? "updated" : "imported"}.`);
}

async function importGstr1Return() {
  const input = $("#gstr1File");
  const file = input?.files?.[0];
  if (!file) throw new Error("Choose a GSTR-1 return file first.");
  if (!apiAvailable) throw new Error("Database connection is required to store GSTR-1 returns.");
  if (file.name.split(".").pop().toLowerCase() !== "json") {
    throw new Error("Upload the GST portal GSTR-1 JSON file. Spreadsheet and PDF exports are not supported yet.");
  }
  const parsed = normalizeGstr1Json(JSON.parse(await file.text()));
  const result = await apiRequest("/api/gst-returns/gstr1/import", {
    method: "POST",
    body: JSON.stringify({ ...parsed, fileName: file.name })
  });
  await loadGstr1ReturnsFromDb();
  const importedMonth = parsed.returnPeriod.slice(0, 2);
  const importedYear = parsed.returnPeriod.slice(2);
  const periodControl = $("#gstReturnsPeriod");
  const monthControl = $("#gstReturnsMonth");
  const tableRangeMode = $("#gstReturnsTableRangeMode");
  const tableRangeMonth = $("#gstReturnsTableMonth");
  if (periodControl) periodControl.value = parsed.filingType.toUpperCase() === "Q" ? "quarter" : "month";
  if (monthControl) monthControl.value = `${importedYear}-${importedMonth}`;
  if (tableRangeMode) tableRangeMode.value = "month";
  if (tableRangeMonth) tableRangeMonth.value = `${importedYear}-${importedMonth}`;
  syncGstReturnsPeriodControls();
  activateGstReportTab("gstr1-imported");
  const status = $("#gstr1ImportStatus");
  if (status) status.textContent = `${result.replaced ? "Replaced" : "Imported"} GSTR-1 ${parsed.returnPeriod} (${parsed.gstin}): ${parsed.invoices.length} invoice rows and ${parsed.summaries.length} aggregate rows from ${parsed.sections.join(", ")}.`;
  renderGstReturns();
  renderTallyGstCompare();
  toast(`GSTR-1 ${parsed.returnPeriod} ${result.replaced ? "updated" : "imported"}.`);
}

async function loadGstr1ReturnsFromDb() {
  if (!apiAvailable) return;
  try {
    gstr1Returns = await apiRequest("/api/gst-returns/gstr1");
    const status = $("#gstr1ImportStatus");
    if (status && gstr1Returns.length) status.textContent = `${gstr1Returns.length} saved GSTR-1 returns loaded. Re-import a GSTIN/period to replace it.`;
  } catch (error) {
    console.warn("Could not load saved GSTR-1 returns:", error);
  }
}

async function loadGstr3bReturnsFromDb() {
  if (!apiAvailable) return;
  try {
    gstr3bReturns = await apiRequest("/api/gst-returns/gstr3b");
    renderGstReturns();
  } catch (error) {
    console.warn("Could not load saved GSTR-3B returns:", error);
  }
}

function gstReportDates() {
  const period = text($("#gstReturnsPeriod")?.value) || "month";
  const month = text($("#gstReturnsMonth")?.value) || todayIso().slice(0, 7);
  const year = Number($("#gstReturnsYear")?.value) || Number(todayIso().slice(0, 4));
  if (period === "custom") {
    return { from: text($("#gstReturnsFrom")?.value), to: text($("#gstReturnsTo")?.value) };
  }
  if (period === "fy") return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
  if (period === "calendar-year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (period === "quarter") {
    const monthNumber = Number(month.slice(5, 7));
    const quarterStart = Math.floor((monthNumber - 1) / 3) * 3 + 1;
    const from = `${month.slice(0, 4)}-${String(quarterStart).padStart(2, "0")}-01`;
    const end = new Date(Number(month.slice(0, 4)), quarterStart + 2, 0);
    return { from, to: end.toISOString().slice(0, 10) };
  }
  const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
  return { from: `${month}-01`, to: end.toISOString().slice(0, 10) };
}

function syncGstReturnsPeriodControls() {
  const period = text($("#gstReturnsPeriod")?.value) || "month";
  const controls = [
    ["gstReturnsMonth", ["month", "quarter"].includes(period)],
    ["gstReturnsYear", ["fy", "calendar-year"].includes(period)],
    ["gstReturnsFrom", period === "custom"],
    ["gstReturnsTo", period === "custom"]
  ];
  controls.forEach(([id, visible]) => {
    const label = $(`#${id}`)?.closest("label");
    if (label) label.hidden = !visible;
  });
  const rangeLabel = $("#gstReturnsRangeLabel");
  const yearLabel = $("#gstReturnsYearLabel");
  if (yearLabel) yearLabel.firstChild.textContent = period === "calendar-year" ? "Calendar year" : "Financial year starts";
  const customRange = period === "custom";
  const fromLabel = $("#gstReturnsFrom")?.closest("label");
  const toLabel = $("#gstReturnsTo")?.closest("label");
  if (fromLabel) fromLabel.hidden = !customRange;
  if (toLabel) toLabel.hidden = !customRange;
  if (rangeLabel) {
    const dates = gstReportDates();
    rangeLabel.hidden = !customRange;
    rangeLabel.textContent = dates.from || dates.to
      ? `Selected range: ${dates.from || "start"} – ${dates.to || "end"}`
      : "Choose a start and end date";
  }
}

function gstReturnsTableDates() {
  const mode = text($("#gstReturnsTableRangeMode")?.value) || "all";
  const anchor = text($("#gstReturnsTableMonth")?.value) || todayIso().slice(0, 7);
  if (mode === "custom") return { from: text($("#gstReturnsTableFrom")?.value), to: text($("#gstReturnsTableTo")?.value) };
  if (mode === "all") return { from: "", to: "" };
  const [year, month] = anchor.split("-").map(Number);
  if (mode === "fy") return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
  if (mode === "calendar-year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (mode === "quarter") {
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const lastMonth = firstMonth + 2;
    const lastDay = new Date(year, lastMonth, 0).getDate();
    return { from: `${year}-${String(firstMonth).padStart(2, "0")}-01`, to: `${year}-${String(lastMonth).padStart(2, "0")}-${lastDay}` };
  }
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${anchor}-01`, to: `${anchor}-${String(lastDay).padStart(2, "0")}` };
}

function syncGstReturnsTableRangeControls() {
  const mode = text($("#gstReturnsTableRangeMode")?.value) || "all";
  $("#gstReturnsTableMonthLabel").hidden = !["month", "quarter"].includes(mode);
  $("#gstReturnsTableYearLabel").hidden = !["fy", "calendar-year"].includes(mode);
  const yearLabel = $("#gstReturnsTableYearLabel");
  if (yearLabel) yearLabel.firstChild.textContent = mode === "calendar-year" ? "Calendar year" : "Financial year starts";
  const custom = mode === "custom";
  $("#gstReturnsTableFromLabel").hidden = !custom;
  $("#gstReturnsTableToLabel").hidden = !custom;
  const label = $("#gstReturnsTableRangeLabel");
  if (!label) return;
  label.hidden = false;
  const { from, to } = gstReturnsTableDates();
  label.textContent = mode === "all" ? "All dates" : from || to ? `Table range: ${from || "start"} – ${to || "end"}` : "Choose a start and end date";
}

function filterGstRowsByTableRange(rows, dateGetter) {
  const { from, to } = gstReturnsTableDates();
  if (!from && !to) return rows;
  return rows.filter(row => {
    const date = parseDate(dateGetter(row));
    return date && (!from || date >= from) && (!to || date <= to);
  });
}

function gstInvoiceRows() {
  return data.transactions()
    .filter(row => row.billData && Array.isArray(row.billData.items))
    .map(row => {
      const bill = row.billData;
      const customer = bill.customer || {};
      const totals = bill.goodsTotals || {};
      return {
        date: parseDate(row.date || bill.tx?.date),
        invoiceNo: text(row.memo || bill.tx?.memo),
        customer: text(customer.label || customer.name || row.party),
        gstin: text(customer.gstin),
        taxable: num(totals.taxable),
        igst: num(totals.igst),
        cgst: num(totals.cgst),
        sgst: num(totals.sgst),
        totalTax: num(totals.igst) + num(totals.cgst) + num(totals.sgst),
        total: num(totals.total || bill.calc?.gross),
        items: bill.items
      };
    });
}

function importedGstr1ReturnsInRange(dates) {
  return gstr1Returns.filter(row => {
    const period = text(row.returnPeriod);
    if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) return false;
    const month = Number(period.slice(0, 2));
    const year = Number(period.slice(2));
    const quarter = text(row.filingType).toUpperCase() === "Q";
    const startMonth = quarter ? month - 2 : month;
    if (startMonth < 1) return false;
    const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const to = new Date(year, month, 0).toISOString().slice(0, 10);
    return (!dates.from || to >= dates.from) && (!dates.to || from <= dates.to);
  });
}

function gstReturnPeriodBounds(row) {
  const period = text(row.returnPeriod);
  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) return null;
  const month = Number(period.slice(0, 2));
  const year = Number(period.slice(2));
  const isQuarter = text(row.filingType).toUpperCase() === "Q";
  const startMonth = isQuarter ? month - 2 : month;
  if (startMonth < 1) return null;
  return {
    from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    to: new Date(year, month, 0).toISOString().slice(0, 10)
  };
}

function reconcileImportedGstr1Sales(bookSales, importedInvoices) {
  const usedBooks = new Set();
  const matches = importedInvoices.map(statement => {
    const key = gstr1InvoiceKey(statement.invoiceNo);
    const candidates = bookSales.map((book, index) => ({ book, index })).filter(({ book, index }) =>
      !usedBooks.has(index) && key && gstr1InvoiceKey(book.invoiceNo) === key
    );
    const gstinMatches = candidates.filter(({ book }) => book.gstin && statement.gstin && book.gstin === statement.gstin);
    const candidate = gstinMatches.length === 1 ? gstinMatches[0] : !gstinMatches.length && candidates.length === 1 ? candidates[0] : null;
    if (!candidate) {
      return {
        ...statement,
        bookTotal: 0,
        variance: num(statement.total),
        status: candidates.length ? "GSTIN mismatch or ambiguous invoice" : "Missing in books"
      };
    }
    usedBooks.add(candidate.index);
    const book = candidate.book;
    const bookTotal = num(book.total);
    const variance = bookTotal - num(statement.total);
    const checks = {
      taxable: num(book.taxable) - num(statement.taxable),
      igst: num(book.igst) - num(statement.igst),
      cgst: num(book.cgst) - num(statement.cgst),
      sgst: num(book.sgst) - num(statement.sgst),
      cess: num(book.cess) - num(statement.cess),
      total: variance
    };
    const gstinMismatch = book.gstin && statement.gstin && book.gstin !== statement.gstin;
    const differences = Object.entries(checks).filter(([, value]) => Math.abs(value) > 1).map(([key]) => key.toUpperCase());
    const status = gstinMismatch ? "GSTIN mismatch" : differences.length ? `${differences.join(" / ")} mismatch` : "Matched";
    return { ...statement, customer: statement.customer || book.customer, bookDate: book.date, bookTotal, variance, checks, status };
  });
  bookSales.forEach((book, index) => {
    if (usedBooks.has(index) || !book.gstin) return;
    matches.push({
      invoiceNo: book.invoiceNo,
      documentType: "Book sale",
      section: "Books",
      customer: book.customer,
      gstin: book.gstin,
      invoiceDate: book.date,
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      total: 0,
      bookTotal: num(book.total),
      variance: num(book.total),
      status: "Missing in GSTR-1"
    });
  });
  return matches;
}

  function gst2bField(row, ...names) {
    const keys = new Set(names.map(name => name.toLowerCase().replace(/[^a-z0-9]/g, "")));
    const entry = Object.entries(row || {}).find(([key, value]) => keys.has(key.toLowerCase().replace(/[^a-z0-9]/g, "")) && value !== undefined && value !== null && value !== "");
    return entry ? entry[1] : "";
  }

  function gst2bDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === "number" && value > 20000 && value < 100000) return new Date(Date.UTC(1899, 11, 30 + Math.floor(value))).toISOString().slice(0, 10);
    const raw = text(value);
    const indianDate = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (indianDate) return `${indianDate[3]}-${indianDate[2].padStart(2, "0")}-${indianDate[1].padStart(2, "0")}`;
    return parseDate(raw);
  }

  function normalizeGst2bInvoice(row, inherited = {}) {
    const invoiceNo = text(gst2bField(row, "inum", "invoice number", "invoice no", "invoice no.", "invoiceNumber", "document number", "docnum") || inherited.invoiceNo);
    if (!invoiceNo) return null;
    const items = Array.isArray(row.itms) ? row.itms : Array.isArray(row.items) ? row.items : [];
    const itemTax = items.reduce((sum, item) => {
      const detail = item.itm_det || item.itemDetail || item;
      sum.taxable += num(gst2bField(detail, "txval", "taxable value", "taxable amount"));
      sum.igst += num(gst2bField(detail, "iamt", "igst", "integrated tax"));
      sum.cgst += num(gst2bField(detail, "camt", "cgst", "central tax"));
      sum.sgst += num(gst2bField(detail, "samt", "sgst", "state/ut tax", "state tax"));
      sum.cess += num(gst2bField(detail, "csamt", "cess"));
      return sum;
    }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 });
    const taxable = num(gst2bField(row, "txval", "taxable value", "taxable amount")) || itemTax.taxable;
    const igst = num(gst2bField(row, "iamt", "igst", "integrated tax")) || itemTax.igst;
    const cgst = num(gst2bField(row, "camt", "cgst", "central tax")) || itemTax.cgst;
    const sgst = num(gst2bField(row, "samt", "sgst", "state/ut tax", "state tax")) || itemTax.sgst;
    const cess = num(gst2bField(row, "csamt", "cess")) || itemTax.cess;
    const total = num(gst2bField(row, "val", "invoice value", "invoice amount", "total value", "total")) || taxable + igst + cgst + sgst + cess;
    const itcAvailableValue = text(gst2bField(row, "itcavl", "itc available", "eligible itc")).toUpperCase();
    const itcAvailable = /^(Y|YES|TRUE|AVAILABLE)$/.test(itcAvailableValue) ? "Y"
      : /^(N|NO|FALSE|NOT AVAILABLE)$/.test(itcAvailableValue) ? "N" : "";
    return {
      invoiceNo,
      supplier: text(gst2bField(row, "trdnm", "trade/legal name", "trade name", "supplier name", "supplier") || inherited.supplier),
      gstin: text(gst2bField(row, "ctin", "gstin of supplier", "supplier gstin", "gstin", "gstin/uin") || inherited.gstin).toUpperCase(),
      invoiceDate: gst2bDate(gst2bField(row, "dt", "invoice date", "date of supply", "supply date", "date")),
      supplierFilingDate: gst2bDate(
        gst2bField(row, "supfildt", "supplier filing date", "supplier filed date")
        || inherited.supplierFilingDate
      ),
      taxable,
      igst,
      cgst,
      sgst,
      cess,
      total,
      itcAvailable
    };
  }

  function parseGst2bJson(payload) {
    const invoices = [];
    const visit = (value, inherited = {}) => {
      if (Array.isArray(value)) {
        value.forEach(item => visit(item, inherited));
        return;
      }
      if (!value || typeof value !== "object") return;
      const context = {
        gstin: text(gst2bField(value, "ctin", "gstin of supplier", "supplier gstin", "gstin", "gstin/uin") || inherited.gstin),
        supplier: text(gst2bField(value, "trdnm", "trade/legal name", "trade name", "supplier name", "supplier") || inherited.supplier),
        supplierFilingDate: gst2bField(value, "supfildt", "supplier filing date", "supplier filed date") || inherited.supplierFilingDate
      };
      const invoice = normalizeGst2bInvoice(value, context);
      if (invoice) invoices.push(invoice);
      Object.values(value).forEach(child => {
        if (child && typeof child === "object") visit(child, context);
      });
    };
    visit(payload);
    return invoices;
  }

  function gst2bInvoiceKey(value) {
    return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

function uniqueGst2bInvoices(invoices) {
    const unique = new Map();
    invoices.forEach(invoice => {
      const key = [invoice.gstin, gst2bInvoiceKey(invoice.invoiceNo), invoice.invoiceDate, invoice.total].join("|");
      if (!unique.has(key)) unique.set(key, invoice);
    });
    return [...unique.values()];
  }

  function gst2bSupplierSummary(invoices = gst2bStatement?.invoices || []) {
    const suppliers = new Map();
    invoices.forEach(invoice => {
      const supplier = text(invoice.supplier) || "Unknown supplier";
      const gstin = text(invoice.gstin || invoice.supplierGstin).toUpperCase();
      const key = gstin || supplier.toLowerCase();
      const summary = suppliers.get(key) || {
        supplier,
        gstin,
        groupKey: key,
        invoiceCount: 0,
        taxable: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
        totalTax: 0,
        total: 0,
        invoices: []
      };
      summary.invoiceCount += 1;
      summary.taxable += num(invoice.taxable);
      summary.igst += num(invoice.igst);
      summary.cgst += num(invoice.cgst);
      summary.sgst += num(invoice.sgst);
      summary.cess += num(invoice.cess);
      summary.totalTax += num(invoice.igst) + num(invoice.cgst) + num(invoice.sgst) + num(invoice.cess);
      summary.total += num(invoice.total);
      summary.invoices.push(invoice);
      suppliers.set(key, summary);
    });
    return [...suppliers.values()].sort((left, right) => left.supplier.localeCompare(right.supplier));
  }

  function reconcileGst2b(statementRows = gst2bStatement?.invoices || [], purchaseRows = data.purchases()) {
    if (!statementRows.length && !gst2bStatement) return [];
    const supplierGstins = new Map(data.suppliers().map(row => [text(row.name).toLowerCase(), text(row.gstin).toUpperCase()]));
    const usedPurchases = new Set();
    const matches = statementRows.map(statement => {
      const invoiceKey = gst2bInvoiceKey(statement.invoiceNo);
      const candidates = purchaseRows.map((purchase, index) => ({ purchase, index })).filter(({ purchase, index }) => !usedPurchases.has(index) && gst2bInvoiceKey(purchase.billNo) === invoiceKey);
      const gstinMatches = candidates.filter(({ purchase }) => {
        const bookGstin = supplierGstins.get(text(purchase.supplier).toLowerCase()) || "";
        return bookGstin && statement.gstin && bookGstin === statement.gstin;
      });
      const candidate = gstinMatches.length === 1 ? gstinMatches[0] : !gstinMatches.length && candidates.length === 1 ? candidates[0] : null;
      if (!candidate) {
        const gstinConflict = candidates.some(({ purchase }) => {
          const bookGstin = supplierGstins.get(text(purchase.supplier).toLowerCase()) || "";
          return bookGstin && statement.gstin && bookGstin !== statement.gstin;
        });
        return {
          gst2bInvoiceId: statement._id,
          invoiceNo: statement.invoiceNo, supplier: statement.supplier, gstin: statement.gstin,
          invoiceDate: statement.invoiceDate, supplierFilingDate: statement.supplierFilingDate,
          statementTotal: statement.total, bookTotal: 0, variance: statement.total,
          checks: {
            taxable: -num(statement.taxable), igst: -num(statement.igst), cgst: -num(statement.cgst),
            sgst: -num(statement.sgst), cess: -num(statement.cess), total: num(statement.total)
          },
          status: gstinConflict || candidates.length ? "GSTIN mismatch or ambiguous invoice" : "Missing in books"
        };
      }
      usedPurchases.add(candidate.index);
      const purchase = candidate.purchase;
      const bookTotal = num(purchase.amount);
      const variance = bookTotal - statement.total;
      const bookTax = num(purchase.igst) + num(purchase.cgst) + num(purchase.sgst);
      const statementTax = statement.igst + statement.cgst + statement.sgst;
      const checks = {
        taxable: num(purchase.taxable || purchase.amount) - num(statement.taxable),
        igst: num(purchase.igst) - num(statement.igst),
        cgst: num(purchase.cgst) - num(statement.cgst),
        sgst: num(purchase.sgst) - num(statement.sgst),
        cess: num(purchase.cess) - num(statement.cess),
        total: variance
      };
      const differences = Object.entries(checks).filter(([, value]) => Math.abs(value) > 1).map(([key]) => key.toUpperCase());
      const status = differences.length ? `${differences.join(" / ")} mismatch` : "Matched";
      return {
        gst2bInvoiceId: statement._id,
        invoiceNo: statement.invoiceNo, supplier: statement.supplier || text(purchase.supplier), gstin: statement.gstin,
        invoiceDate: statement.invoiceDate || parseDate(purchase.date), supplierFilingDate: statement.supplierFilingDate,
        statementTotal: statement.total, bookTotal, variance, checks, status
      };
    });
    purchaseRows.forEach((purchase, index) => {
      if (usedPurchases.has(index)) return;
      matches.push({
        invoiceNo: text(purchase.billNo), supplier: text(purchase.supplier), gstin: supplierGstins.get(text(purchase.supplier).toLowerCase()) || "",
        invoiceDate: parseDate(purchase.date), supplierFilingDate: "",
        statementTotal: 0, bookTotal: num(purchase.amount), variance: num(purchase.amount),
        checks: {
          taxable: num(purchase.taxable || purchase.amount), igst: num(purchase.igst), cgst: num(purchase.cgst),
          sgst: num(purchase.sgst), cess: num(purchase.cess), total: num(purchase.amount)
        },
        status: "Missing in GSTR-2B"
      });
    });
    return matches;
  }

  async function importGst2bStatement() {
    const input = $("#gst2bFile");
    const file = input?.files?.[0];
    if (!file) {
      toast("Choose a GSTR-2B statement file first.");
      return;
    }
    if (!apiAvailable) {
      toast("Database connection is required to store GSTR-2B imports.");
      return;
    }
    const status = $("#gst2bImportStatus");
    try {
      const extension = file.name.split(".").pop().toLowerCase();
      let invoices = [];
      if (extension === "json") {
        invoices = parseGst2bJson(JSON.parse(await file.text()));
      } else {
        await ensureXlsxLoaded();
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        invoices = workbook.SheetNames.flatMap(name => XLSX.utils.sheet_to_json(workbook.Sheets[name], { defval: "" }))
          .map(row => normalizeGst2bInvoice(row)).filter(Boolean);
      }
      invoices = uniqueGst2bInvoices(invoices);
      if (!invoices.length) throw new Error("No invoice rows found. Select a GSTR-2B JSON, Excel, or CSV statement.");
      const result = await apiRequest("/api/gst-returns/gstr2b/import", {
        method: "POST",
        body: JSON.stringify({ fileName: file.name, invoices })
      });
      const supplierSync = await syncGst2bSuppliers(invoices);
      gst2bStatement = { fileName: file.name, importedAt: new Date().toISOString(), invoices: (result.rows || []).map(row => ({ ...row, gstin: row.supplierGstin })) };
      if (status) status.textContent = `${result.imported} invoice records processed: ${result.inserted} new, ${result.existing} already stored, ${result.duplicateRows} repeated rows skipped. Supplier list: ${supplierSync.added} added, ${supplierSync.updated} updated.`;
      renderAll();
      renderGstReturns();
      toast(`Stored ${result.imported} GSTR-2B invoice records in database.`);
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not read the GSTR-2B statement.");
    } finally {
      input.value = "";
    }
  }

function buildGstReport() {
  const dates = gstReportDates();
  const tableDates = gstReturnsTableDates();
  const inRange = date => (!tableDates.from || date >= tableDates.from) && (!tableDates.to || date <= tableDates.to);
  const invoices = gstInvoiceRows().filter(row => inRange(row.date) && (!dates.from || row.date >= dates.from) && (!dates.to || row.date <= dates.to));
  const gstr1Imports = importedGstr1ReturnsInRange(tableDates);
  const rangeFilteredImports = gstr1Imports.filter(row => {
    const bounds = gstReturnPeriodBounds(row);
    return bounds && (!tableDates.from || bounds.to >= tableDates.from) && (!tableDates.to || bounds.from <= tableDates.to);
  });
  const importedInvoices = rangeFilteredImports.flatMap(row => (row.invoices || []).map(invoice => ({
    ...invoice, returnPeriod: row.returnPeriod, filingType: row.filingType, sourceFile: row.sourceFile
  })));
  const importedSummaries = rangeFilteredImports.flatMap(row => (row.summaries || []).map(summary => ({
    ...summary, returnPeriod: row.returnPeriod, filingType: row.filingType, sourceFile: row.sourceFile
  })));
  const importedHsnRows = rangeFilteredImports.flatMap(row => (row.hsnRows || []).map(hsn => ({ ...hsn, returnPeriod: row.returnPeriod })));
  const importedDocumentRows = rangeFilteredImports.flatMap(row => (row.documentRows || []).map(document => ({ ...document, returnPeriod: row.returnPeriod })));
  const importedTotals = rangeFilteredImports.reduce((sum, row) => {
    ["taxable", "igst", "cgst", "sgst", "cess", "total"].forEach(key => { sum[key] += num(row.totals?.[key]); });
    return sum;
  }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 });
  const datedImportedInvoices = importedInvoices.filter(row => !row.invoiceDate || inRange(parseDate(row.invoiceDate)));
  const importedBookInvoices = gstInvoiceRows().filter(row => inRange(row.date));
  const importedMatches = reconcileImportedGstr1Sales(importedBookInvoices, datedImportedInvoices);
  const outward = invoices.reduce((total, row) => ({
    taxable: total.taxable + row.taxable,
    igst: total.igst + row.igst,
    cgst: total.cgst + row.cgst,
    sgst: total.sgst + row.sgst,
    totalTax: total.totalTax + row.totalTax,
    total: total.total + row.total
  }), { taxable: 0, igst: 0, cgst: 0, sgst: 0, totalTax: 0, total: 0 });
  const hsn = new Map();
  invoices.forEach(invoice => (invoice.items || []).forEach(item => {
    const key = `${text(item.hsn) || "-"}|${num(item.gst)}`;
    const row = hsn.get(key) || { hsn: text(item.hsn) || "-", rate: num(item.gst), qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, total: 0 };
    row.qty += num(item.qty);
    row.taxable += num(item.taxable);
    row.igst += num(item.igst);
    row.cgst += num(item.cgst);
    row.sgst += num(item.sgst);
    row.total += num(item.total);
    hsn.set(key, row);
  }));
  const purchases = data.purchases().filter(row => inRange(parseDate(row.date)) && (!dates.from || parseDate(row.date) >= dates.from) && (!dates.to || parseDate(row.date) <= dates.to));
  const gstr2bInvoices = (gst2bStatement?.invoices || []).filter(row => inRange(parseDate(row.invoiceDate || row.date)));
  const filteredGstr2bStatement = gst2bStatement ? { ...gst2bStatement, invoices: gstr2bInvoices } : null;
  const bookPurchasesInRange = purchases;
  const reconciliation = reconcileGst2b(gstr2bInvoices, bookPurchasesInRange);
  const supplierSummary = gst2bSupplierSummary(gstr2bInvoices);
  const itc = purchases.reduce((total, row) => {
    const tax = num(row.igst) + num(row.cgst) + num(row.sgst) || num(row.tax) || num(row.itc);
    return { taxable: total.taxable + num(row.taxable || row.amount), igst: total.igst + num(row.igst), cgst: total.cgst + num(row.cgst), sgst: total.sgst + num(row.sgst), eligible: total.eligible + tax };
  }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, eligible: 0 });
  return {
    dates, tableDates, invoices, outward, hsn: [...hsn.values()], purchases, itc,
    gstr2bStatement: filteredGstr2bStatement,
    gstr1Imports, importedInvoices, importedSummaries, importedHsnRows, importedDocumentRows, importedTotals, importedMatches,
    reconciliation, supplierSummary
  };
}

async function loadGst2bInvoicesFromDb() {
  if (!apiAvailable) return;
  try {
    const rows = await apiRequest("/api/gst-returns/gstr2b");
    const invoices = rows.map(row => ({ ...row, gstin: row.supplierGstin }));
    gst2bStatement = invoices.length ? { invoices } : null;
    const status = $("#gst2bImportStatus");
    if (status && invoices.length) status.textContent = `${invoices.length} GSTR-2B invoice records loaded from database.`;
  } catch (error) {
    console.warn("Could not load saved GSTR-2B records:", error);
  }
}

async function deleteGst2bData() {
  if (!apiAvailable) {
    toast("Database connection is required to delete stored GSTR-2B data.");
    return;
  }
  if (!confirm("Delete all imported GSTR-2B invoice data from the database? This cannot be undone. Cashbook purchases and other records will not be deleted.")) return;
  const status = $("#deleteGst2bDataStatus");
  try {
    const result = await apiRequest("/api/gst-returns/gstr2b", { method: "DELETE" });
    gst2bStatement = null;
    gst2bExpandedSuppliers.clear();
    if (status) status.textContent = `${result.deletedCount} imported GSTR-2B invoice records deleted.`;
    const importStatus = $("#gst2bImportStatus");
    if (importStatus) importStatus.textContent = "GSTR-2B data deleted. Import a statement from the GST portal to begin again.";
    renderGstReturns();
    toast(`${result.deletedCount} GSTR-2B invoice records deleted.`);
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not delete GSTR-2B data.");
  }
}

async function deleteGst2bInvoice(invoiceId) {
  if (!apiAvailable) {
    toast("Database connection is required to delete a stored GSTR-2B invoice.");
    return;
  }
  const invoice = gst2bStatement?.invoices.find(row => String(row._id) === String(invoiceId));
  if (!invoice) return;
  if (!confirm(`Delete GSTR-2B invoice ${invoice.invoiceNo} from ${invoice.supplier || invoice.supplierGstin}?`)) return;
  try {
    await apiRequest(`/api/gst-returns/gstr2b/${encodeURIComponent(invoiceId)}`, { method: "DELETE" });
    gst2bStatement.invoices = gst2bStatement.invoices.filter(row => String(row._id) !== String(invoiceId));
    if (!gst2bStatement.invoices.length) gst2bStatement = null;
    renderGstReturns();
    toast(`Deleted GSTR-2B invoice ${invoice.invoiceNo}.`);
  } catch (error) {
    console.error(error);
    toast(error.message || "Could not delete the GSTR-2B invoice.");
  }
}

function renderGstReturnsKpis(report) {
  const node = $("#gstReturnsKpis");
  if (!node) return;
  if (gstReportTab === "gstr3b-filed") {
    const returns = gstr3bReturnsInRange((gstReportData || buildGstReport()).tableDates);
    const filed = gstr3bAggregate(returns);
    const cards = [
      ["Filed returns", returns.length],
      ["Filed taxable outward", filed?.outward ? money2(filed.outward.taxable) : "Not provided"],
      ["Filed net ITC", filed?.sectionsAvailable.has("itc") ? money2(filed.itcNetTotal) : "Not provided"],
      ["Periods in view", returns.map(row => row.returnPeriod).join(", ") || "None"]
    ];
    node.innerHTML = cards.map(([label, value]) => `<div class="total-card"><small>${html(label)}</small><strong>${html(value)}</strong></div>`).join("");
    return;
  }
  if (gstReportTab === "gstr1-imported") {
    const importedTax = report.importedTotals.igst + report.importedTotals.cgst + report.importedTotals.sgst + report.importedTotals.cess;
    const bookTax = report.outward.igst + report.outward.cgst + report.outward.sgst;
    const exceptions = report.importedMatches.filter(row => row.status !== "Matched").length;
    const cards = [
    ["Imported returns", report.gstr1Imports.length],
      ["Invoice / note rows", report.importedInvoices.length],
      ["Aggregate rows", report.importedSummaries.length],
      ["HSN rows", report.importedHsnRows.length],
      ["Document issue rows", report.importedDocumentRows.length],
      ["Imported taxable", report.gstr1Imports.length ? money2(report.importedTotals.taxable) : "No return"],
      ["Cashbook taxable", money2(report.outward.taxable)],
      ["Taxable difference", report.gstr1Imports.length ? money2(report.importedTotals.taxable - report.outward.taxable) : "Not comparable"],
      ["Invoice exceptions", exceptions]
    ];
    if (report.gstr1Imports.length) cards.push(["Output tax difference", money2(importedTax - bookTax)]);
    node.innerHTML = cards.map(([label, value]) => `<div class="total-card"><small>${html(label)}</small><strong>${html(value)}</strong></div>`).join("");
    return;
  }
  if (gstReportTab === "reconciliation") {
    const matched = report.reconciliation.filter(row => row.status === "Matched");
    const exceptions = report.reconciliation.length - matched.length;
    const statementTotal = report.reconciliation.reduce((sum, row) => sum + num(row.statementTotal), 0);
    const bookTotal = report.reconciliation.reduce((sum, row) => sum + num(row.bookTotal), 0);
    const cards = [
      ["GSTR-2B invoices", report.gstr2bStatement?.invoices?.length || 0],
      ["Matched", matched.length],
      ["Exceptions", exceptions],
      ["Statement total", money2(statementTotal)],
      ["Book total", money2(bookTotal)],
      ["Net difference", money2(bookTotal - statementTotal)]
    ];
    node.innerHTML = cards.map(([label, value]) => `<div class="total-card"><small>${html(label)}</small><strong>${html(value)}</strong></div>`).join("");
    return;
  }
  const cards = [
    ["Invoices", report.invoices.length],
    ["Taxable outward", money2(report.outward.taxable)],
    ["Output tax", money2(report.outward.totalTax)],
    ["Eligible ITC", money2(report.itc.eligible)],
    ["Net tax payable", money2(Math.max(report.outward.totalTax - report.itc.eligible, 0))]
  ];
  if (report.gstr2bStatement?.invoices?.length) {
    const matched = report.reconciliation.filter(row => row.status === "Matched").length;
    const exceptions = report.reconciliation.length - matched;
    cards.push(["2B matched", matched], ["2B exceptions", exceptions]);
  }
  node.innerHTML = cards.map(([label, value]) => `<div class="total-card"><small>${label}</small><strong>${value}</strong></div>`).join("");
}

function gstr3bReturnsInRange(dates) {
  return gstr3bReturns.filter(row => {
    const period = text(row.returnPeriod);
    if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) return false;
    const month = Number(period.slice(0, 2));
    const year = Number(period.slice(2));
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const to = new Date(year, month, 0).toISOString().slice(0, 10);
    return (!dates.from || to >= dates.from) && (!dates.to || from <= dates.to);
  });
}

function importedGstr1Groups(invoices, summaries) {
  const groups = new Map();
  const addRow = (row, isAggregate = false) => {
    const gstin = text(row.gstin).toUpperCase();
    const customer = text(row.customer) || (isAggregate ? "B2CS aggregate" : "Unknown customer");
    const key = gstin || `NO-GSTIN|${customer.toLowerCase()}`;
    const group = groups.get(key) || {
      key,
      gstin,
      customer,
      invoices: 0,
      aggregates: 0,
      taxable: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      total: 0,
      rows: []
    };
    if (isAggregate) group.aggregates += 1;
    else group.invoices += 1;
    ["taxable", "igst", "cgst", "sgst", "cess", "total"].forEach(field => { group[field] += num(row[field]); });
    group.rows.push({ ...row, documentType: isAggregate ? "Aggregate" : row.documentType || "Invoice" });
    groups.set(key, group);
  };
  invoices.forEach(row => addRow(row));
  summaries.forEach(row => addRow({
    ...row,
    invoiceNo: `${text(row.section).toUpperCase()} ${decimal2(row.rate)}%${row.placeOfSupply ? ` / POS ${row.placeOfSupply}` : ""}`,
    invoiceDate: row.returnPeriod,
    customer: "B2CS aggregate",
    bookTotal: null,
    variance: null,
    status: "Aggregate only"
  }, true));
  return [...groups.values()].sort((left, right) => left.gstin.localeCompare(right.gstin) || left.customer.localeCompare(right.customer));
}

async function syncGst2bSuppliers(invoices) {
  const incoming = new Map();
  invoices.forEach(invoice => {
    const name = text(invoice.supplier);
    const gstin = text(invoice.gstin || invoice.supplierGstin).toUpperCase();
    if (!name && !gstin) return;
    const key = gstin ? `gstin:${gstin}` : `name:${name.toLowerCase()}`;
    const existing = incoming.get(key) || { name, gstin };
    if (!existing.name && name) existing.name = name;
    if (!existing.gstin && gstin) existing.gstin = gstin;
    incoming.set(key, existing);
  });
  let added = 0;
  let updated = 0;
  for (const candidate of incoming.values()) {
    const existing = data.suppliers().find(row => candidate.gstin
      ? text(row.gstin).toUpperCase() === candidate.gstin
      : text(row.name).toLowerCase() === text(candidate.name).toLowerCase());
    if (existing) {
      const updates = {};
      if (!text(existing.gstin) && candidate.gstin) updates.gstin = candidate.gstin;
      if (!text(existing.name) && candidate.name) updates.name = candidate.name;
      if (!Object.keys(updates).length) continue;
      if (apiAvailable && existing._id) {
        const saved = await apiPatch("suppliers", existing._id, updates);
        const index = seed.suppliers.findIndex(row => text(row._id) === text(existing._id));
        if (index >= 0) seed.suppliers[index] = saved;
      } else {
        const index = (user.suppliers || []).findIndex(row => text(row._id) === text(existing._id)
          || text(row.name).toLowerCase() === text(existing.name).toLowerCase());
        if (index >= 0) user.suppliers[index] = { ...user.suppliers[index], ...updates };
        else if (!apiAvailable) continue;
      }
      updated += 1;
      continue;
    }
    const supplier = {
      name: candidate.name || candidate.gstin,
      mobile: "", address: "", gstin: candidate.gstin,
      bankName: "", accountNumber: "", ifsc: "", remark: "Added from GSTR-2B"
    };
    if (apiAvailable) {
      const saved = await apiCreate("suppliers", supplier);
      if (saved) seed.suppliers.push(saved);
    } else {
      user.suppliers = user.suppliers || [];
      user.suppliers.push(supplier);
      saveUser();
    }
    added += 1;
  }
  return { added, updated };
}

function gstr3bAggregate(returns) {
  if (!returns.length) return null;
  const fields = ["outward", "zeroRatedAmounts", "nilRatedAmounts", "reverseChargeAmounts", "nonGstAmounts", "itcAvailable", "itcReversed"];
  const aggregate = { sectionsAvailable: new Set(returns[0].sectionsAvailable || []), itcNet: null };
  fields.forEach(field => { aggregate[field] = { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 }; });
  aggregate.itcNetTotal = 0;
  returns.forEach(row => {
    const values = row.values || {};
    const rowSections = new Set(row.sectionsAvailable || []);
    [...aggregate.sectionsAvailable].forEach(section => {
      if (!rowSections.has(section)) aggregate.sectionsAvailable.delete(section);
    });
    fields.forEach(field => {
      if (!values[field]) return;
      Object.keys(aggregate[field]).forEach(key => { aggregate[field][key] += num(values[field][key]); });
    });
    if (values.itcNet) aggregate.itcNet = aggregate.itcNet || { igst: 0, cgst: 0, sgst: 0, cess: 0 };
    if (values.itcNet) ["igst", "cgst", "sgst", "cess"].forEach(key => { aggregate.itcNet[key] += num(values.itcNet[key]); });
    aggregate.itcNetTotal += num(values.itcNetTotal);
  });
  return aggregate;
}

function gstr3bFiledComparisonRows(report) {
  const returns = gstr3bReturnsInRange(report.tableDates);
  const filed = gstr3bAggregate(returns);
  if (!filed) return [];
  const filedOutputTax = filed.outward.igst + filed.outward.cgst + filed.outward.sgst + filed.outward.cess;
  const workingOutputTax = report.outward.igst + report.outward.cgst + report.outward.sgst;
  const workingNet = Math.max(workingOutputTax - report.itc.eligible, 0);
  const filedNet = Math.max(filedOutputTax - filed.itcNetTotal, 0);
  const rows = [
    { field: "3.1(a) Taxable outward supplies", working: report.outward.taxable, filed: filed.outward.taxable, section: "outward" },
    { field: "3.1(a) IGST", working: report.outward.igst, filed: filed.outward.igst, section: "outward" },
    { field: "3.1(a) CGST", working: report.outward.cgst, filed: filed.outward.cgst, section: "outward" },
    { field: "3.1(a) SGST/UTGST", working: report.outward.sgst, filed: filed.outward.sgst, section: "outward" },
    { field: "3.1(a) Cess", working: null, filed: filed.outward.cess, section: "outward" },
    { field: "4(A) ITC available", working: report.itc.eligible, filed: filed.itcAvailableTotal, section: "itc" },
    { field: "4(B) ITC reversed", working: null, filed: filed.itcReversedTotal, section: "itc" },
    { field: "4(C) Net ITC", working: report.itc.eligible, filed: filed.itcNetTotal, section: "itc" },
    { field: "Estimated net tax liability", working: workingNet, filed: filedNet, section: "outward" },
    { field: "3.1(b) Zero-rated taxable value", working: null, filed: filed.zeroRatedAmounts.taxable, section: "outward" },
    { field: "3.1(c) Nil/exempt value", working: null, filed: filed.nilRatedAmounts.taxable, section: "outward" },
    { field: "3.1(d) Reverse-charge inward taxable value", working: null, filed: filed.reverseChargeAmounts.taxable, section: "outward" },
    { field: "3.1(e) Non-GST outward value", working: null, filed: filed.nonGstAmounts.taxable, section: "outward" }
  ];
  return rows.map(row => ({
    ...row,
    filed: filed.sectionsAvailable.has(row.section) ? row.filed : null,
    variance: filed.sectionsAvailable.has(row.section) && row.working != null && row.filed != null ? row.filed - row.working : null
  }));
}

function renderGstReturnsTable(report) {
  const node = $("#gstReturnsTable");
  if (!node) return;
  const importedView = $("#gstr1ImportedView");
  if (importedView) importedView.hidden = gstReportTab !== "gstr1-imported";
  const importedControls = $("#gstr1ImportedControls");
  if (importedControls) importedControls.hidden = gstReportTab !== "gstr1-imported";
  const mainTableWrap = node.closest(".table-wrap");
  if (mainTableWrap) mainTableWrap.hidden = gstReportTab === "gstr1-imported";
  const supplierControls = $("#gst2bSupplierControls");
  if (supplierControls) supplierControls.hidden = gstReportTab !== "supplier-summary" || !report.gstr2bStatement?.invoices?.length;
  const matchControls = $("#gst2bMatchControls");
  if (matchControls) matchControls.hidden = gstReportTab !== "reconciliation" || !report.gstr2bStatement?.invoices?.length;
  const tableControls = $("#gstReturnsTableControls");
  const tableSearch = $("#gstReturnsTableSearch");
  if (tableControls) tableControls.hidden = ["reconciliation", "supplier-summary"].includes(gstReportTab);
  const query = text(tableSearch?.value).trim().toLowerCase();
  const filterRows = rows => {
    const filtered = !query ? rows : rows.filter(row => Object.values(row || {}).some(value =>
      (value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value)).toLowerCase().includes(query)));
    const countNode = $("#gstReturnsTableCount");
    if (countNode) countNode.textContent = query ? `${filtered.length} of ${rows.length} rows` : `${rows.length} rows`;
    return filtered;
  };
  if (gstReportTab === "gstr3b-filed") {
    const returns = gstr3bReturnsInRange(report.tableDates);
    if (!returns.length) {
      node.innerHTML = "<tbody><tr><td>No imported filed GSTR-3B return falls within this report period. Import a GST portal GSTR-3B JSON above.</td></tr></tbody>";
      return;
    }
    const rows = gstr3bFiledComparisonRows(report);
    table(node, [
      { label: "GSTR-3B field", key: "field" },
      { label: "Cashbook working", key: "working", render: row => row.working == null ? "Not available" : money2(row.working) },
      { label: "Filed return", key: "filed", render: row => row.filed == null ? "Section not in import" : money2(row.filed) },
      { label: "Filed - working", key: "variance", render: row => row.variance == null ? "Not comparable" : money2(row.variance) }
    ], filterRows(rows));
    const caption = node.createCaption();
    caption.textContent = `Imported returns: ${returns.map(row => `${row.returnPeriod} / ${row.gstin} / ${row.sourceFile || "Imported return"}`).join("; ")}`;
    return;
  }
  if (gstReportTab === "gstr1") {
    table(node, [
      { label: "Date", key: "date" }, { label: "Invoice", key: "invoiceNo" }, { label: "Customer", key: "customer" }, { label: "GSTIN", key: "gstin" },
      { label: "Taxable", key: "taxable", render: row => money2(row.taxable) }, { label: "IGST", key: "igst", render: row => money2(row.igst) },
      { label: "CGST", key: "cgst", render: row => money2(row.cgst) }, { label: "SGST", key: "sgst", render: row => money2(row.sgst) }, { label: "Invoice total", key: "total", render: row => money2(row.total) }
    ], filterRows(report.invoices));
    return;
  }
  if (gstReportTab === "gstr1-imported") {
    const hasImport = report.gstr1Imports.length > 0;
    const importedTax = report.importedTotals.igst + report.importedTotals.cgst + report.importedTotals.sgst;
    const bookTax = report.outward.igst + report.outward.cgst + report.outward.sgst;
    const comparisonRows = [
      { measure: "Taxable value", books: report.outward.taxable, imported: hasImport ? report.importedTotals.taxable : null },
      { measure: "IGST", books: report.outward.igst, imported: hasImport ? report.importedTotals.igst : null },
      { measure: "CGST", books: report.outward.cgst, imported: hasImport ? report.importedTotals.cgst : null },
      { measure: "SGST", books: report.outward.sgst, imported: hasImport ? report.importedTotals.sgst : null },
      { measure: "Output tax (IGST + CGST + SGST)", books: bookTax, imported: hasImport ? importedTax : null },
      { measure: "Sales total", books: report.outward.total, imported: hasImport ? report.importedTotals.total : null }
    ].map(row => ({
      ...row,
      difference: row.imported == null ? null : row.imported - row.books
    }));
    table($("#gstr1ImportedCompareTable"), [
      { label: "Measure", key: "measure" },
      { label: "Cashbook sales", key: "books", render: row => money2(row.books) },
      { label: "Imported GSTR-1", key: "imported", render: row => row.imported == null ? "No return" : money2(row.imported) },
      { label: "Imported - books", key: "difference", render: row => row.difference == null ? "Not comparable" : money2(row.difference) }
    ], comparisonRows);
    if (hasImport) {
      const caption = $("#gstr1ImportedCompareTable").createCaption();
      caption.textContent = report.gstr1Imports.map(row => `${row.returnPeriod} / ${row.gstin} / ${row.sourceFile || "Imported return"}`).join("; ");
    }

    const aggregateRows = report.importedSummaries.map(row => ({
      ...row,
      documentType: "Aggregate",
      invoiceNo: `${row.section.toUpperCase()} ${decimal2(row.rate)}%${row.placeOfSupply ? ` / POS ${row.placeOfSupply}` : ""}`,
      customer: "",
      gstin: "",
      invoiceDate: row.returnPeriod,
      bookTotal: null,
      variance: null,
      status: "Aggregate only"
    }));
    const allRows = [...report.importedMatches, ...aggregateRows];
    const query = text($("#gstr1ImportedSearch")?.value).toLowerCase();
    const visibleRows = allRows.filter(row => !query
      || `${row.invoiceNo} ${row.documentType} ${row.customer} ${row.gstin} ${row.status} ${row.section}`.toLowerCase().includes(query));
    const countNode = $("#gstr1ImportedCount");
    if (countNode) countNode.textContent = `${visibleRows.length} of ${allRows.length} imported or comparable rows`;
    const detailsTable = $("#gstr1ImportedRowsTable");
    const groupsNode = $("#gstr1ImportedGroups");
    const rowsWrap = $("#gstr1ImportedRowsWrap");
    document.querySelectorAll("[data-gstr1-imported-view]").forEach(button => {
      const selected = button.dataset.gstr1ImportedView === gstr1ImportedView;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    });
    if (groupsNode) groupsNode.hidden = gstr1ImportedView !== "groups";
    if (rowsWrap) rowsWrap.hidden = gstr1ImportedView === "groups";
    if (groupsNode) {
      const groups = importedGstr1Groups(
        report.importedInvoices.filter(row => !row.invoiceDate || filterGstRowsByTableRange([row], item => item.invoiceDate).length),
        report.importedSummaries
      ).map((group, index) => ({ ...group, id: `gstr1ImportedGroup${index}` }));
      groupsNode.innerHTML = groups.map(group => {
        const groupRows = group.rows.map(row => `
          <tr>
            <td>${html(row.documentType)}</td><td>${html(row.section)}</td><td>${html(row.invoiceNo)}</td>
            <td>${html(row.invoiceDate)}</td><td>${html(row.gstin || group.gstin)}</td>
            <td class="num">${money2(row.taxable)}</td><td class="num">${money2(row.igst)}</td>
            <td class="num">${money2(row.cgst)}</td><td class="num">${money2(row.sgst)}</td>
            <td class="num">${money2(row.total)}</td><td>${html(row.status || "—")}</td>
          </tr>`).join("");
        const rowCount = group.invoices + group.aggregates;
        return `<details class="gst-imported-group"><summary><span class="gst-imported-group-title">${html(group.gstin || "No GSTIN")}</span><span class="gst-imported-group-meta">${group.invoices} invoices · ${group.aggregates} aggregates · Taxable ${money2(group.taxable)} · Tax ${money2(group.igst + group.cgst + group.sgst + group.cess)}</span></summary><div class="gst-imported-group-content"><table><thead><tr><th>Type</th><th>Section</th><th>Invoice / aggregate</th><th>Date / period</th><th>GSTIN</th><th>Taxable</th><th>IGST</th><th>CGST</th><th>SGST</th><th>Total</th><th>Status</th></tr></thead><tbody>${groupRows || `<tr><td colspan="11">No details available</td></tr>`}</tbody><tfoot><tr><th colspan="5">Group total (${rowCount} rows)</th><th class="num">${money2(group.taxable)}</th><th class="num">${money2(group.igst)}</th><th class="num">${money2(group.cgst)}</th><th class="num">${money2(group.sgst)}</th><th class="num">${money2(group.total)}</th><th></th></tr></tfoot></table></div></details>`;
      }).join("") || `<p class="panel-subtitle">No imported GSTR-1 groups fall within the selected date range.</p>`;
    }
    const hsnSection = $("#gstr1ImportedHsnSection");
    const documentSection = $("#gstr1ImportedDocumentSection");
    if (hsnSection) hsnSection.hidden = !report.importedHsnRows.length;
    if (documentSection) documentSection.hidden = !report.importedDocumentRows.length;
    if (!hasImport) {
      detailsTable.innerHTML = `<tbody><tr><td>${gstr1Returns.length ? "No imported GSTR-1 return covers the selected table date range." : "Import a GSTR-1 JSON above to view its rows and compare sales."}</td></tr></tbody>`;
      return;
    }
    table(detailsTable, [
      { label: "Type", key: "documentType" },
      { label: "Section", key: "section" },
      { label: "Invoice / aggregate", key: "invoiceNo" },
      { label: "Date / period", key: "invoiceDate" },
      { label: "Customer", key: "customer" },
      { label: "GSTIN", key: "gstin" },
      { label: "Taxable", key: "taxable", render: row => money2(row.taxable) },
      { label: "IGST", key: "igst", render: row => money2(row.igst) },
      { label: "CGST", key: "cgst", render: row => money2(row.cgst) },
      { label: "SGST", key: "sgst", render: row => money2(row.sgst) },
      { label: "GSTR-1 total", key: "total", render: row => money2(row.total) },
      { label: "Book total", key: "bookTotal", render: row => row.bookTotal == null ? "Aggregate" : money2(row.bookTotal) },
      { label: "Difference", key: "variance", render: row => row.variance == null ? "Not comparable" : money2(row.variance) },
      { label: "Result", key: "status" }
    ], visibleRows);
    if (report.importedHsnRows.length) {
      table($("#gstr1ImportedHsnTable"), [
        { label: "Period", key: "returnPeriod" },
        { label: "Section", key: "section" },
        { label: "HSN/SAC", key: "hsn" },
        { label: "Description", key: "description" },
        { label: "Unit", key: "unit" },
        { label: "Quantity", key: "quantity", num: true },
        { label: "Rate", key: "rate", render: row => `${decimal2(row.rate)}%` },
        { label: "Taxable", key: "taxable", render: row => money2(row.taxable) },
        { label: "IGST", key: "igst", render: row => money2(row.igst) },
        { label: "CGST", key: "cgst", render: row => money2(row.cgst) },
        { label: "SGST", key: "sgst", render: row => money2(row.sgst) },
        { label: "Cess", key: "cess", render: row => money2(row.cess) },
        { label: "Total", key: "total", render: row => money2(row.total) }
      ], report.importedHsnRows);
    }
    if (report.importedDocumentRows.length) {
      table($("#gstr1ImportedDocumentTable"), [
        { label: "Period", key: "returnPeriod" },
        { label: "Document type code", key: "documentTypeCode" },
        { label: "From", key: "from" },
        { label: "To", key: "to" },
        { label: "Issued", key: "issued", num: true },
        { label: "Cancelled", key: "cancelled", num: true },
        { label: "Net issued", key: "netIssued", num: true }
      ], report.importedDocumentRows);
    }
    return;
  }
  if (gstReportTab === "gstr3b") {
    table(node, [
      { label: "GSTR-3B field", key: "field" }, { label: "Value", key: "value", render: row => money2(row.value) }, { label: "Notes", key: "notes" }
    ], filterRows([
      { field: "3.1(a) Taxable outward supplies", value: report.outward.taxable, notes: "From saved GST invoices" },
      { field: "3.1(a) IGST", value: report.outward.igst, notes: "Output tax" },
      { field: "3.1(a) CGST", value: report.outward.cgst, notes: "Output tax" },
      { field: "3.1(a) SGST/UTGST", value: report.outward.sgst, notes: "Output tax" },
      { field: "4(A) Eligible ITC", value: report.itc.eligible, notes: "From purchase records with tax/ITC fields" },
      { field: "Estimated net tax payable", value: Math.max(report.outward.totalTax - report.itc.eligible, 0), notes: "Output tax less eligible ITC" }
    ]));
    return;
  }
  if (gstReportTab === "reconciliation") {
    if (!report.gstr2bStatement?.invoices?.length) {
      node.innerHTML = `<tbody><tr><td>${gst2bStatement ? "No GSTR-2B invoices fall within the selected table date range." : "Import a GSTR-2B statement to view invoice reconciliation."}</td></tr></tbody>`;
      return;
    }
    const query = text($("#gst2bMatchSearch")?.value).toLowerCase();
    const visibleMatches = report.reconciliation.filter(row => !query
      || `${row.invoiceNo} ${row.supplier} ${row.gstin} ${row.status}`.toLowerCase().includes(query));
    const countNode = $("#gst2bMatchCount");
    const matchedCount = visibleMatches.filter(row => row.status === "Matched").length;
    const exceptionCount = visibleMatches.length - matchedCount;
    if (countNode) countNode.textContent = `${visibleMatches.length} rows · ${matchedCount} matched · ${exceptionCount} exceptions`;
    const columns = [
      { label: "Invoice", key: "invoiceNo" }, { label: "Supplier", key: "supplier" }, { label: "GSTIN", key: "gstin" },
      { label: "Invoice / Supply Date", key: "invoiceDate" }, { label: "Supplier Filed Date", key: "supplierFilingDate" },
      { label: "Taxable Δ", key: "checks", render: row => row.checks?.taxable == null ? "—" : money2(row.checks.taxable) },
      { label: "IGST Δ", key: "checks", render: row => row.checks?.igst == null ? "—" : money2(row.checks.igst) },
      { label: "CGST Δ", key: "checks", render: row => row.checks?.cgst == null ? "—" : money2(row.checks.cgst) },
      { label: "SGST Δ", key: "checks", render: row => row.checks?.sgst == null ? "—" : money2(row.checks.sgst) },
      { label: "GSTR-2B total", key: "statementTotal", render: row => money2(row.statementTotal) },
      { label: "Book total", key: "bookTotal", render: row => money2(row.bookTotal) },
      { label: "Difference", key: "variance", render: row => money2(row.variance) }, { label: "Status", key: "status" }
    ];
    const allowInvoiceDelete = getSettingValue("gst2bRowDeleteEnabled") === true;
    if (allowInvoiceDelete) {
      columns.push({
        label: "Action",
        key: "gst2bInvoiceId",
        render: row => row.gst2bInvoiceId
          ? `<button type="button" class="delete-symbol gst2b-match-delete" data-gst2b-invoice-id="${html(row.gst2bInvoiceId)}" title="Delete this GSTR-2B invoice" aria-label="Delete GSTR-2B invoice ${html(row.invoiceNo)}">&#128465;</button>`
          : ""
      });
    }
    table(node, columns, visibleMatches, {
      onRender: tableNode => $$(".gst2b-match-delete", tableNode).forEach(button => button.addEventListener("click", withBusyClick(
        () => deleteGst2bInvoice(button.dataset.gst2bInvoiceId),
        "Deleting..."
      )))
    });
    if (visibleMatches.length) {
      const totals = visibleMatches.reduce((sum, row) => ({
        statementTotal: sum.statementTotal + num(row.statementTotal),
        bookTotal: sum.bookTotal + num(row.bookTotal),
        variance: sum.variance + num(row.variance)
      }), { statementTotal: 0, bookTotal: 0, variance: 0 });
      const actionCell = allowInvoiceDelete ? "<th></th>" : "";
      node.insertAdjacentHTML("beforeend", `<tfoot><tr><th colspan="9">Visible rows (${visibleMatches.length})</th><th class="num">${money2(totals.statementTotal)}</th><th class="num">${money2(totals.bookTotal)}</th><th class="num">${money2(totals.variance)}</th><th></th>${actionCell}</tr></tfoot>`);
    }
    return;
  }
  if (gstReportTab === "supplier-summary") {
    if (!report.gstr2bStatement?.invoices?.length) {
      node.innerHTML = `<tbody><tr><td>${gst2bStatement ? "No GSTR-2B invoices fall within the selected table date range." : "Import a GSTR-2B statement to view supplier totals."}</td></tr></tbody>`;
      return;
    }
    const query = text($("#gst2bSupplierSearch")?.value).toLowerCase();
    const visibleSuppliers = report.supplierSummary.filter(supplier => !query
      || `${supplier.supplier} ${supplier.gstin} ${supplier.invoices.map(invoice => invoice.invoiceNo).join(" ")}`.toLowerCase().includes(query));
    const countNode = $("#gst2bSupplierCount");
    if (countNode) countNode.textContent = `${visibleSuppliers.length} of ${report.supplierSummary.length} suppliers`;
    const allowInvoiceDelete = getSettingValue("gst2bRowDeleteEnabled") === true;
    const invoiceHeaders = ["Invoice", "Invoice / Supply Date", "Supplier Filed Date", "Taxable", "IGST", "CGST", "SGST", "Cess", "Invoice Total"];
    if (allowInvoiceDelete) invoiceHeaders.push("Action");
    const allSupplierTotals = visibleSuppliers.reduce((totals, supplier) => {
      totals.invoiceCount += supplier.invoiceCount;
      totals.taxable += supplier.taxable;
      totals.igst += supplier.igst;
      totals.cgst += supplier.cgst;
      totals.sgst += supplier.sgst;
      totals.cess += supplier.cess;
      totals.totalTax += supplier.totalTax;
      totals.total += supplier.total;
      return totals;
    }, { invoiceCount: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, totalTax: 0, total: 0 });
    const supplierRows = visibleSuppliers.map((supplier, index) => {
      const detailId = `gst2bSupplierBills${index}`;
      const expanded = gst2bExpandedSuppliers.has(supplier.groupKey);
      const bills = supplier.invoices.map(invoice => `
        <tr>
          <td>${html(invoice.invoiceNo)}</td><td>${html(invoice.invoiceDate)}</td><td>${html(invoice.supplierFilingDate)}</td>
          <td class="num">${money2(invoice.taxable)}</td><td class="num">${money2(invoice.igst)}</td>
          <td class="num">${money2(invoice.cgst)}</td><td class="num">${money2(invoice.sgst)}</td>
          <td class="num">${money2(invoice.cess)}</td><td class="num">${money2(invoice.total)}</td>
          ${allowInvoiceDelete ? `<td><button type="button" class="delete-symbol gst2b-invoice-delete" data-gst2b-invoice-id="${html(invoice._id || "")}" title="Delete this GSTR-2B invoice" aria-label="Delete GSTR-2B invoice ${html(invoice.invoiceNo)}"${invoice._id ? "" : " disabled"}>&#128465;</button></td>` : ""}
        </tr>`).join("");
      const supplierTaxable = supplier.invoices.reduce((sum, invoice) => sum + num(invoice.taxable), 0);
      const supplierIgst = supplier.invoices.reduce((sum, invoice) => sum + num(invoice.igst), 0);
      const supplierCgst = supplier.invoices.reduce((sum, invoice) => sum + num(invoice.cgst), 0);
      const supplierSgst = supplier.invoices.reduce((sum, invoice) => sum + num(invoice.sgst), 0);
      const supplierCess = supplier.invoices.reduce((sum, invoice) => sum + num(invoice.cess), 0);
      const supplierTotal = supplier.invoices.reduce((sum, invoice) => sum + num(invoice.total), 0);
      return `
        <tr>
          <td><button type="button" class="gst2b-supplier-toggle" data-supplier-key="${html(supplier.groupKey)}" aria-expanded="${expanded}" aria-controls="${detailId}"><span class="gst2b-supplier-arrow" aria-hidden="true">${expanded ? "&#9662;" : "&#9656;"}</span>${html(supplier.supplier)}</button></td>
          <td>${html(supplier.gstin)}</td><td class="num">${supplier.invoiceCount}</td>
          <td class="num">${money2(supplier.taxable)}</td><td class="num">${money2(supplier.igst)}</td>
          <td class="num">${money2(supplier.cgst)}</td><td class="num">${money2(supplier.sgst)}</td>
          <td class="num">${money2(supplier.cess)}</td><td class="num">${money2(supplier.totalTax)}</td>
          <td class="num">${money2(supplier.total)}</td>
        </tr>
        <tr id="${detailId}" class="gst2b-bills-row"${expanded ? "" : " hidden"}><td colspan="10">
          <div class="gst2b-bills-wrap"><table class="gst2b-bills-table">
            <thead><tr>${invoiceHeaders.map(label => `<th>${label}</th>`).join("")}</tr></thead>
            <tbody>${bills}<tr><th colspan="3">Supplier Total (${supplier.invoiceCount} invoices)</th><th class="num">${money2(supplierTaxable)}</th><th class="num">${money2(supplierIgst)}</th><th class="num">${money2(supplierCgst)}</th><th class="num">${money2(supplierSgst)}</th><th class="num">${money2(supplierCess)}</th><th class="num">${money2(supplierTotal)}</th>${allowInvoiceDelete ? "<th></th>" : ""}</tr></tbody>
          </table></div>
        </td></tr>`;
    }).join("");
    const grandTotal = `<tfoot><tr><th colspan="2">Grand Total</th><th class="num">${allSupplierTotals.invoiceCount}</th><th class="num">${money2(allSupplierTotals.taxable)}</th><th class="num">${money2(allSupplierTotals.igst)}</th><th class="num">${money2(allSupplierTotals.cgst)}</th><th class="num">${money2(allSupplierTotals.sgst)}</th><th class="num">${money2(allSupplierTotals.cess)}</th><th class="num">${money2(allSupplierTotals.totalTax)}</th><th class="num">${money2(allSupplierTotals.total)}</th></tr></tfoot>`;
    node.innerHTML = `<thead><tr><th>Supplier</th><th>GSTIN</th><th class="num">Invoices</th><th class="num">Taxable Value</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Cess</th><th class="num">Total Tax</th><th class="num">Invoice Total</th></tr></thead><tbody>${supplierRows || `<tr><td colspan="10">No suppliers match this search.</td></tr>`}</tbody>${visibleSuppliers.length ? grandTotal : ""}`;
    $$(".gst2b-supplier-toggle", node).forEach(button => button.addEventListener("click", () => {
      const detail = document.getElementById(button.getAttribute("aria-controls"));
      if (!detail) return;
      const expanded = button.getAttribute("aria-expanded") === "true";
      detail.hidden = expanded;
      button.setAttribute("aria-expanded", String(!expanded));
      $(".gst2b-supplier-arrow", button).innerHTML = expanded ? "&#9656;" : "&#9662;";
      if (expanded) gst2bExpandedSuppliers.delete(button.dataset.supplierKey);
      else gst2bExpandedSuppliers.add(button.dataset.supplierKey);
    }));
    $$(".gst2b-invoice-delete", node).forEach(button => button.addEventListener("click", withBusyClick(
      () => deleteGst2bInvoice(button.dataset.gst2bInvoiceId),
      "Deleting..."
    )));
    return;
  }
  if (gstReportTab === "hsn") {
    table(node, [
      { label: "HSN/SAC", key: "hsn" }, { label: "GST Rate", key: "rate", render: row => `${decimal2(row.rate)}%` }, { label: "Qty", key: "qty" },
      { label: "Taxable", key: "taxable", render: row => money2(row.taxable) }, { label: "IGST", key: "igst", render: row => money2(row.igst) },
      { label: "CGST", key: "cgst", render: row => money2(row.cgst) }, { label: "SGST", key: "sgst", render: row => money2(row.sgst) }, { label: "Total", key: "total", render: row => money2(row.total) }
    ], filterRows(report.hsn));
    return;
  }
  table(node, [
    { label: "ITC source", key: "supplier" }, { label: "Date", key: "date" }, { label: "Reference", key: "billNo" },
    { label: "Taxable / amount", key: "taxable", render: row => money2(row.taxable) }, { label: "IGST", key: "igst", render: row => money2(row.igst) },
    { label: "CGST", key: "cgst", render: row => money2(row.cgst) }, { label: "SGST", key: "sgst", render: row => money2(row.sgst) }, { label: "Eligible ITC", key: "eligible", render: row => money2(row.eligible) }
  ], filterRows(report.purchases.map(row => ({ ...row, eligible: num(row.igst) + num(row.cgst) + num(row.sgst) || num(row.tax) || num(row.itc) }))));
}

function renderGstReturns() {
  syncGstReturnsTableRangeControls();
  syncGstReturnsPeriodControls();
  gstReportData = buildGstReport();
  const context = $("#gstReturnsReportContext");
  if (context) {
    const { from, to } = gstReportData.tableDates;
    const returnScope = gstReportData.dates.from || gstReportData.dates.to
      ? `${gstReportData.dates.from || "start"} to ${gstReportData.dates.to || "end"}`
      : "all available periods";
    const tableScope = from || to ? `${from || "start"} to ${to || "end"}` : "all dates";
    context.textContent = `Return period: ${returnScope} · Table date range: ${tableScope} · Variance = books minus GST statement; tolerance ₹1.`;
  }
  renderGstReturnsKpis(gstReportData);
  renderGstReturnsTable(gstReportData);
}

function gstReturnsExportRows() {
  const report = gstReportData || buildGstReport();
  if (gstReportTab === "gstr3b-filed") return gstr3bFiledComparisonRows(report);
  if (gstReportTab === "gstr1-imported") return [
    ...report.importedMatches.map(row => ({ ...row, rowType: "Invoice / note" })),
    ...report.importedSummaries.map(row => ({
      ...row,
      rowType: "Aggregate",
      invoiceNo: `${row.section.toUpperCase()} ${decimal2(row.rate)}%${row.placeOfSupply ? ` / POS ${row.placeOfSupply}` : ""}`,
      status: "Aggregate only"
    })),
    ...report.importedHsnRows.map(row => ({ ...row, rowType: "HSN summary" })),
    ...report.importedDocumentRows.map(row => ({ ...row, rowType: "Document issue" }))
  ];
  if (gstReportTab === "hsn") return report.hsn;
  if (gstReportTab === "gstr3b") return [
    { field: "Taxable outward supplies", value: report.outward.taxable }, { field: "IGST", value: report.outward.igst },
    { field: "CGST", value: report.outward.cgst }, { field: "SGST", value: report.outward.sgst }, { field: "Eligible ITC", value: report.itc.eligible }
  ];
  if (gstReportTab === "reconciliation") return report.reconciliation;
  if (gstReportTab === "supplier-summary") return report.supplierSummary;
  if (gstReportTab === "itc") return report.purchases;
  return report.invoices;
}

function activateGstReportTab(tabKey) {
  gstReportTab = tabKey;
  $$('[data-gst-report-tab]').forEach(tab => {
    const isActive = tab.dataset.gstReportTab === tabKey;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-pressed", String(isActive));
  });
}

function gstUploadedPeriodLabel(row) {
  const period = text(row.returnPeriod);
  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) return period || "Unknown period";
  const month = Number(period.slice(0, 2));
  const year = Number(period.slice(2));
  const quarter = text(row.filingType).toUpperCase() === "Q";
  const startMonth = quarter ? month - 2 : month;
  if (quarter && startMonth >= 1) {
    const start = new Date(year, startMonth - 1, 1).toLocaleString("en-IN", { month: "short" });
    const end = new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "short" });
    return `Q${Math.floor((startMonth - 1) / 3) + 1} · ${start}–${end} ${year}`;
  }
  return new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

function gstinFromSourceFile(fileName) {
  const candidates = text(fileName).toUpperCase().match(/[0-9A-Z]{15}/g) || [];
  return candidates.find(value => /^[0-9]{2}[0-9A-Z]{13}$/.test(value)) || "";
}

function applyUploadedPeriod(row) {
  const period = text(row.returnPeriod);
  if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) return;
  closeModal("gstUploadedPeriodsModal");
  showView("gstReturns");
  const month = Number(period.slice(0, 2));
  const year = Number(period.slice(2));
  const quarter = text(row.filingType).toUpperCase() === "Q";
  const mode = row.form === "GSTR-2B" ? "month" : quarter ? "quarter" : "month";
  const tableRangeMode = $("#gstReturnsTableRangeMode");
  if (tableRangeMode) tableRangeMode.value = mode;
  const tableMonth = $("#gstReturnsTableMonth");
  if (tableMonth) {
    const anchorMonth = quarter ? month - 2 : month;
    tableMonth.value = `${year}-${String(anchorMonth).padStart(2, "0")}`;
  }
  syncGstReturnsTableRangeControls();
  if (row.form === "GSTR-1") activateGstReportTab("gstr1-imported");
  else if (row.form === "GSTR-3B") activateGstReportTab("gstr3b-filed");
  else if (row.form === "GSTR-2B") activateGstReportTab("reconciliation");
  renderGstReturns();
}

async function showGstUploadedPeriods() {
  if (apiAvailable) {
    await Promise.all([loadGstr1ReturnsFromDb(), loadGstr3bReturnsFromDb(), loadGst2bInvoicesFromDb()]);
  }
  const gstr2bGroups = new Map();
  (gst2bStatement?.invoices || []).forEach(invoice => {
    const date = parseDate(invoice.invoiceDate || invoice.date);
    const monthKey = date ? date.slice(0, 7) : "Undated";
    const key = `${monthKey}|${text(invoice.sourceFile)}`;
    const group = gstr2bGroups.get(key) || {
      form: "GSTR-2B",
      periodLabel: monthKey === "Undated" ? "Undated invoices" : new Date(`${monthKey}-01T00:00:00`).toLocaleString("en-IN", { month: "long", year: "numeric" }),
      returnPeriod: monthKey === "Undated" ? "000000" : monthKey.replace("-", ""),
      sourceFile: text(invoice.sourceFile) || "Saved GSTR-2B invoices",
      gstin: gstinFromSourceFile(invoice.sourceFile),
      invoiceCount: 0,
      suppliers: new Set(),
      importedAt: invoice.importedAt || ""
    };
    group.invoiceCount += 1;
    const supplier = text(invoice.supplier || invoice.supplierGstin || invoice.gstin);
    if (supplier) group.suppliers.add(supplier);
    if (text(invoice.importedAt) > text(group.importedAt)) group.importedAt = invoice.importedAt;
    if (!group.gstin) group.gstin = gstinFromSourceFile(invoice.sourceFile);
    gstr2bGroups.set(key, group);
  });
  const rows = [
    ...gstr1Returns.map(row => ({
      form: "GSTR-1",
      periodLabel: gstUploadedPeriodLabel(row),
      returnPeriod: row.returnPeriod,
      filingType: row.filingType,
      gstin: row.gstin,
      detail: `${(row.invoices || []).length} invoice/note · ${(row.summaries || []).length} summary`,
      sourceFile: row.sourceFile,
      importedAt: row.importedAt
    })),
    ...gstr3bReturns.map(row => ({
      form: "GSTR-3B",
      periodLabel: gstUploadedPeriodLabel(row),
      returnPeriod: row.returnPeriod,
      filingType: "M",
      gstin: row.gstin,
      detail: (row.sectionsAvailable || []).join(", ") || "Filed return",
      sourceFile: row.sourceFile,
      importedAt: row.importedAt
    })),
    ...[...gstr2bGroups.values()].map(group => ({
      ...group,
      detail: `${group.invoiceCount} invoices · ${group.suppliers.size} suppliers`
    }))
  ].sort((a, b) => text(b.returnPeriod).localeCompare(text(a.returnPeriod)) || a.form.localeCompare(b.form));
  const monthCount = rows.filter(row => !/^Q\d/.test(row.periodLabel)).length;
  const quarterCount = rows.length - monthCount;
  const summary = $("#gstUploadedPeriodsSummary");
  if (summary) summary.innerHTML = [
    ["Uploaded returns", rows.length], ["Monthly periods", monthCount], ["Quarterly periods", quarterCount]
  ].map(([label, value]) => `<div class="total-card"><small>${html(label)}</small><strong>${html(value)}</strong></div>`).join("");
  const node = $("#gstUploadedPeriodsTable");
  if (node) {
    if (!rows.length) node.innerHTML = "<tbody><tr><td>No GSTR-1 or GSTR-3B returns have been uploaded yet.</td></tr></tbody>";
    else table(node, [
      { label: "Return", key: "form" },
      { label: "Period", key: "periodLabel", render: row => `<button type="button" class="gst-uploaded-period-link" data-gst-period="${html(row.returnPeriod)}" data-gst-period-form="${html(row.form)}" data-gst-filing-type="${html(row.filingType || "M")}">${html(row.periodLabel)}</button>` },
      { label: "GSTIN", key: "gstin" },
      { label: "Included data", key: "detail" },
      { label: "Uploaded", key: "importedAt", render: row => row.importedAt ? new Date(row.importedAt).toLocaleString("en-IN") : "—" }
    ], rows, { onRender: tableNode => $$("[data-gst-period]", tableNode).forEach(button => button.addEventListener("click", () => applyUploadedPeriod({
      returnPeriod: button.dataset.gstPeriod,
      form: button.dataset.gstPeriodForm,
      filingType: button.dataset.gstFilingType
    }))) });
  }
  openModal("gstUploadedPeriodsModal");
}

function bindGstReturns() {
  const month = $("#gstReturnsMonth");
  const year = $("#gstReturnsYear");
  const tableMonth = $("#gstReturnsTableMonth");
  const tableYear = $("#gstReturnsTableYear");
  if (month && !month.value) month.value = todayIso().slice(0, 7);
  if (year && !year.value) year.value = todayIso().slice(0, 4);
  if (tableMonth && !tableMonth.value) tableMonth.value = todayIso().slice(0, 7);
  if (tableYear && !tableYear.value) tableYear.value = todayIso().slice(0, 4);
  syncGstReturnsPeriodControls();
  if (tableMonth && !tableMonth.value) tableMonth.value = todayIso().slice(0, 7);
  if (tableYear && !tableYear.value) tableYear.value = todayIso().slice(0, 4);
  syncGstReturnsTableRangeControls();
  $("#gstUploadedPeriodsBtn")?.addEventListener("click", withBusyClick(showGstUploadedPeriods, "Loading..."));
  $("#fetchGstReturnsBtn")?.addEventListener("click", withBusyClick(() => { renderGstReturns(); toast("GST report fetched."); }, "Fetching..."));
  $("#importGst2bBtn")?.addEventListener("click", withBusyClick(importGst2bStatement, "Importing..."));
  $("#importGstr1Btn")?.addEventListener("click", withBusyClick(async () => {
    const status = $("#gstr1ImportStatus");
    try {
      await importGstr1Return();
    } catch (error) {
      console.error(error);
      if (status) status.textContent = error.message || "Could not import the GSTR-1 return.";
      toast(error.message || "Could not import the GSTR-1 return.");
    } finally {
      const input = $("#gstr1File");
      if (input) input.value = "";
    }
  }, "Importing..."));
  $("#importGstr3bBtn")?.addEventListener("click", withBusyClick(async () => {
    const status = $("#gstr3bImportStatus");
    try {
      await importGstr3bReturn();
    } catch (error) {
      console.error(error);
      if (status) status.textContent = error.message || "Could not import the GSTR-3B return.";
      toast(error.message || "Could not import the GSTR-3B return.");
    } finally {
      const input = $("#gstr3bFile");
      if (input) input.value = "";
    }
  }, "Importing..."));
  $("#deleteGst2bDataBtn")?.addEventListener("click", withBusyClick(deleteGst2bData, "Deleting..."));
  $("#gst2bSupplierSearch")?.addEventListener("input", () => {
    if (gstReportTab === "supplier-summary") renderGstReturnsTable(gstReportData || buildGstReport());
  });
  $("#gstReturnsTableSearch")?.addEventListener("input", () => renderGstReturnsTable(gstReportData || buildGstReport()));
  $("#gst2bMatchSearch")?.addEventListener("input", () => {
    if (gstReportTab === "reconciliation") renderGstReturnsTable(gstReportData || buildGstReport());
  });
  $("#gstr1ImportedSearch")?.addEventListener("input", () => {
    if (gstReportTab === "gstr1-imported") renderGstReturnsTable(gstReportData || buildGstReport());
  });
  $("#gst2bExpandAllBtn")?.addEventListener("click", () => {
    (gstReportData || buildGstReport()).supplierSummary.forEach(supplier => gst2bExpandedSuppliers.add(supplier.groupKey));
    renderGstReturnsTable(gstReportData || buildGstReport());
  });
  $("#gst2bCollapseAllBtn")?.addEventListener("click", () => {
    gst2bExpandedSuppliers.clear();
    renderGstReturnsTable(gstReportData || buildGstReport());
  });
  $("#gstReturnsPeriod")?.addEventListener("change", () => {
    syncGstReturnsPeriodControls();
    renderGstReturns();
  });
  document.querySelectorAll("[data-gstr1-imported-view]").forEach(button => {
    button.addEventListener("click", () => {
      gstr1ImportedView = button.dataset.gstr1ImportedView || "all";
      renderGstReturnsTable(gstReportData || buildGstReport());
    });
  });
  $("#gstReturnsTableRangeMode")?.addEventListener("change", () => {
    syncGstReturnsTableRangeControls();
    renderGstReturns();
  });
  ["gstReturnsTableMonth", "gstReturnsTableFrom", "gstReturnsTableTo"].forEach(id => $(`#${id}`)?.addEventListener("input", () => {
    syncGstReturnsTableRangeControls();
    renderGstReturns();
  }));
  ["gstReturnsMonth", "gstReturnsYear", "gstReturnsFrom", "gstReturnsTo", "gstReturnsTableMonth", "gstReturnsTableYear", "gstReturnsTableFrom", "gstReturnsTableTo"].forEach(id => $(`#${id}`)?.addEventListener("change", renderGstReturns));
  ["gstReturnsTableYear", "gstReturnsTableMonth", "gstReturnsTableFrom", "gstReturnsTableTo"].forEach(id => $(`#${id}`)?.addEventListener("input", renderGstReturns));
  ["gstReturnsMonth", "gstReturnsYear", "gstReturnsFrom", "gstReturnsTo"].forEach(id => $(`#${id}`)?.addEventListener("input", () => {
    syncGstReturnsPeriodControls();
    renderGstReturns();
  }));
  $$('[data-gst-report-tab]').forEach(button => button.addEventListener("click", () => {
    activateGstReportTab(button.dataset.gstReportTab);
    renderGstReturns();
  }));
  $("#exportGstReturnsBtn")?.addEventListener("click", withBusyClick(() => csvDownload(`gst-${gstReportTab}.csv`, gstReturnsExportRows()), "Exporting..."));
}

bindGstReturns();
