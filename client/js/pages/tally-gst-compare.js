let tallyRegisterImports = { sales: null, purchases: null };

function tallyColumnKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tallyColumn(row, ...aliases) {
  const keys = new Set(aliases.map(tallyColumnKey));
  const entry = Object.entries(row || {}).find(([key, value]) => keys.has(tallyColumnKey(key)) && value !== undefined && value !== null && value !== "");
  return entry?.[1] ?? "";
}

function tallyNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = text(value).replace(/[₹\s,]/g, "");
  const isNegative = /^\(.*\)$/.test(raw);
  if (isNegative) raw = raw.slice(1, -1);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? (isNegative ? -parsed : parsed) : 0;
}

function tallyDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const raw = text(value);
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  return dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : parseDate(raw);
}

function normalizeTallyRegisterRow(row, kind) {
  const taxable = tallyNumber(tallyColumn(row, "taxable", "taxable value", "taxable amount", "assessable value", "net taxable"));
  const igst = tallyNumber(tallyColumn(row, "igst", "integrated tax", "integrated tax amount"));
  const cgst = tallyNumber(tallyColumn(row, "cgst", "central tax", "central tax amount"));
  const sgst = tallyNumber(tallyColumn(row, "sgst", "state tax", "state/ut tax", "state tax amount"));
  const cess = tallyNumber(tallyColumn(row, "cess", "cess amount"));
  const tax = tallyNumber(tallyColumn(row, "total tax", "tax amount", "gst amount", "total gst"));
  const total = tallyNumber(tallyColumn(row, "total", "invoice total", "voucher total", "gross total", "amount")) || taxable + igst + cgst + sgst + cess;
  const normalized = {
    date: tallyDate(tallyColumn(row, "date", "voucher date", "invoice date", "bill date")),
    invoiceNo: text(tallyColumn(row, "invoice no", "invoice number", "voucher no", "voucher number", "reference no", "bill no", "reference")),
    party: text(tallyColumn(row, "party", "party ledger", "ledger name", "party name", "customer", "supplier", "particulars")),
    gstin: text(tallyColumn(row, "gstin", "gstin/uin", "gst registration no", "gst number")).toUpperCase(),
    taxable,
    igst,
    cgst,
    sgst,
    cess,
    tax,
    total
  };
  return normalized.date || normalized.invoiceNo || normalized.party || taxable || total ? normalized : null;
}

function tallyRowsFromSheet(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const headerIndex = matrix.findIndex(row => row.filter(value => [
    "date", "voucher date", "invoice date", "invoice no", "voucher no", "party ledger", "gstin", "taxable value"
  ].includes(tallyColumnKey(value))).length >= 2);
  if (headerIndex < 0) return [];
  const headers = matrix[headerIndex].map(text);
  return matrix.slice(headerIndex + 1).filter(row => row.some(value => text(value))).map(row =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
  );
}

async function ensureTallyXlsxLoaded() {
  if (window.XLSX) return;
  if (ensureTallyXlsxLoaded.promise) return ensureTallyXlsxLoaded.promise;
  ensureTallyXlsxLoaded.promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load the Excel file reader."));
    document.head.appendChild(script);
  });
  return ensureTallyXlsxLoaded.promise;
}

async function parseTallyRegisterFile(file, kind) {
  const extension = file.name.split(".").pop().toLowerCase();
  let sourceRows;
  if (extension === "csv") {
    await ensureTallyXlsxLoaded();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
    sourceRows = tallyRowsFromSheet(workbook.Sheets[workbook.SheetNames[0]]);
  } else if (["xlsx", "xls"].includes(extension)) {
    await ensureTallyXlsxLoaded();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    sourceRows = workbook.SheetNames.flatMap(name => tallyRowsFromSheet(workbook.Sheets[name]));
  } else if (extension === "json") {
    const payload = JSON.parse(await file.text());
    sourceRows = Array.isArray(payload) ? payload : payload.rows || payload.data || [];
  } else {
    throw new Error("Choose a Tally register CSV, Excel, or JSON export.");
  }
  if (!Array.isArray(sourceRows)) throw new Error("The selected file does not contain a tabular register.");
  const rows = sourceRows.map(row => normalizeTallyRegisterRow(row, kind)).filter(Boolean);
  if (!rows.length) throw new Error("No register rows found. Check that the file has a header row with date, voucher, party, or taxable-value columns.");
  return rows;
}

async function readTallyJsonFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const utf16Le = bytes[0] === 0xff && bytes[1] === 0xfe
    || bytes[1] === 0 && bytes[3] === 0;
  const payloadText = utf16Le
    ? new TextDecoder("utf-16le").decode(bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.slice(2) : bytes)
    : new TextDecoder("utf-8").decode(bytes);
  return JSON.parse(payloadText.replace(/^\uFEFF/, ""));
}

function parseTallyVoucherExport(payload) {
  const vouchers = Array.isArray(payload) ? payload : payload?.tallymessage;
  if (!Array.isArray(vouchers)) throw new Error("This JSON is not a Tally voucher export (expected a tallymessage list).");
  const sales = [];
  const purchases = [];
  let skipped = 0;
  const list = value => Array.isArray(value) ? value : value ? [value] : [];
  const abs = value => Math.abs(tallyNumber(value));
  for (const voucher of vouchers) {
    const type = text(voucher.vouchertypename || voucher.metadata?.vchtype).toLowerCase();
    const kind = type === "sales" || type === "credit note" ? "sales"
      : type === "purchase" || type === "debit note" ? "purchases" : "";
    if (!kind || voucher.isdeleted === true || voucher.iscancelled === true || voucher.isoptional === true) {
      skipped += 1;
      continue;
    }
    const sign = type === "credit note" || type === "debit note" ? -1 : 1;
    const dateRaw = text(voucher.date);
    const date = /^\d{8}$/.test(dateRaw)
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : tallyDate(dateRaw);
    const inventory = list(voucher.allinventoryentries);
    const ledgers = list(voucher.ledgerentries || voucher.allledgerentries);
    let taxable = inventory.reduce((sum, row) => sum + abs(row.amount), 0);
    let igst = 0, cgst = 0, sgst = 0, cess = 0;
    for (const row of ledgers) {
      const name = text(row.ledgername).toLowerCase();
      const amount = abs(row.amount);
      if (/\bigst\b|integrated tax/.test(name)) igst += amount;
      else if (/\bcgst\b|central tax/.test(name)) cgst += amount;
      else if (/\bsgst\b|\butgst\b|state tax|state\/ut/.test(name)) sgst += amount;
      else if (/\bcess\b/.test(name)) cess += amount;
    }
    const total = abs(ledgers.find(row => row.ispartyledger === true)?.amount)
      || taxable + igst + cgst + sgst + cess;
    if (!taxable && total) taxable = Math.max(0, total - igst - cgst - sgst - cess);
    const target = kind === "sales" ? sales : purchases;
    target.push({
      date,
      invoiceNo: text(voucher.vouchernumber),
      party: text(voucher.partyname || voucher.partyledgername),
      gstin: text(voucher.partygstin || voucher.consigneegstin).toUpperCase(),
      taxable: sign * taxable,
      igst: sign * igst,
      cgst: sign * cgst,
      sgst: sign * sgst,
      cess: sign * cess,
      tax: sign * (igst + cgst + sgst + cess),
      total: sign * total
    });
  }
  if (!sales.length && !purchases.length) throw new Error("No usable Sales, Purchase, Credit Note, or Debit Note vouchers were found.");
  return { sales, purchases, skipped, voucherCount: vouchers.length };
}

async function importCombinedTallyVoucherFile() {
  const input = $("#tallyVoucherFile");
  const status = $("#tallyVoucherStatus");
  const file = input?.files?.[0];
  if (!file) throw new Error("Choose the Tally Transactions.json file first.");
  if (!apiAvailable) throw new Error("Database connection is required to save Tally register imports.");
  const parsed = parseTallyVoucherExport(await readTallyJsonFile(file));
  const replacing = [parsed.sales.length && tallyRegisterImports.sales, parsed.purchases.length && tallyRegisterImports.purchases]
    .some(Boolean);
  if (replacing && !confirm(`This file contains ${parsed.sales.length} sales-side vouchers and ${parsed.purchases.length} purchase-side vouchers. Existing saved Tally registers for these types will be replaced. Continue?`)) return;
  if (status) status.textContent = `Saving ${parsed.sales.length} sales-side and ${parsed.purchases.length} purchase-side vouchers...`;
  const saved = [];
  for (const [kind, rows] of [["sales", parsed.sales], ["purchases", parsed.purchases]]) {
    if (!rows.length) continue;
    const result = await apiRequest("/api/gst-returns/tally-imports/import", {
      method: "POST",
      body: JSON.stringify({ kind, fileName: file.name, rows })
    });
    tallyRegisterImports[kind] = result.row;
    const registerStatus = $(`#tally${kind === "sales" ? "Sales" : "Purchases"}Status`);
    if (registerStatus) registerStatus.textContent = `${rows.length} saved ${kind} rows from ${file.name}.`;
    saved.push(`${rows.length} ${kind}`);
  }
  if (status) status.textContent = `Imported ${saved.join(" and ")} vouchers from ${file.name}; ${parsed.skipped} unsupported, deleted, cancelled, or optional vouchers skipped.`;
  renderTallyGstCompare();
  toast(`Imported ${parsed.sales.length} sales-side and ${parsed.purchases.length} purchase-side Tally vouchers.`);
}

async function importTallyRegister(kind) {
  const input = $(`#tally${kind === "sales" ? "Sales" : "Purchases"}File`);
  const status = $(`#tally${kind === "sales" ? "Sales" : "Purchases"}Status`);
  const file = input?.files?.[0];
  if (!file) throw new Error(`Choose a Tally ${kind} register file first.`);
  if (!apiAvailable) throw new Error("Database connection is required to save Tally register imports.");
  const rows = await parseTallyRegisterFile(file, kind);
  const result = await apiRequest("/api/gst-returns/tally-imports/import", {
    method: "POST",
    body: JSON.stringify({ kind, fileName: file.name, rows })
  });
  tallyRegisterImports[kind] = result.row;
  if (status) status.textContent = `${result.replaced ? "Replaced" : "Imported"} ${result.row.rowCount} ${kind} rows from ${file.name}.`;
  renderTallyGstCompare();
  toast(`Tally ${kind} register ${result.replaced ? "updated" : "imported"}.`);
}

async function loadTallyRegisterImports() {
  if (!apiAvailable) return;
  try {
    const rows = await apiRequest("/api/gst-returns/tally-imports");
    tallyRegisterImports = { sales: null, purchases: null };
    rows.forEach(row => { tallyRegisterImports[row.kind] = row; });
    ["sales", "purchases"].forEach(kind => {
      const status = $(`#tally${kind === "sales" ? "Sales" : "Purchases"}Status`);
      const record = tallyRegisterImports[kind];
      if (status && record) status.textContent = `${record.rowCount} saved ${kind} rows: ${record.sourceFile || "Tally register"} (${text(record.importedAt).slice(0, 10) || "imported"}).`;
    });
    renderTallyGstCompare();
  } catch (error) {
    console.warn("Could not load Tally register imports:", error);
  }
}

function tallyGstInvoiceKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function matchImportedTallyPurchases(purchases, gst2bInvoices) {
  const usedBooks = new Set();
  const matches = gst2bInvoices.map(statement => {
    const statementKey = tallyGstInvoiceKey(statement.invoiceNo);
    const candidates = purchases.map((purchase, index) => ({ purchase, index })).filter(({ purchase, index }) =>
      !usedBooks.has(index) && statementKey && tallyGstInvoiceKey(purchase.invoiceNo || purchase.billNo) === statementKey
    );
    const exactGstin = candidates.find(({ purchase }) => purchase.gstin && statement.gstin && purchase.gstin === statement.gstin);
    const candidate = exactGstin || (candidates.length === 1 ? candidates[0] : null);
    if (!candidate) {
      return {
        invoiceNo: statement.invoiceNo,
        supplier: statement.supplier,
        gstin: statement.gstin,
        invoiceDate: statement.invoiceDate,
        bookTotal: 0,
        statementTotal: num(statement.total),
        variance: num(statement.total),
        status: candidates.length > 1 ? "Ambiguous invoice" : "Missing in Tally"
      };
    }
    usedBooks.add(candidate.index);
    const book = candidate.purchase;
    const bookTotal = num(book.total || book.amount);
    const variance = bookTotal - num(statement.total);
    const bookTax = num(book.igst) + num(book.cgst) + num(book.sgst) + num(book.cess);
    const statementTax = num(statement.igst) + num(statement.cgst) + num(statement.sgst) + num(statement.cess);
    const gstinMismatch = book.gstin && statement.gstin && book.gstin !== statement.gstin;
    const status = gstinMismatch ? "GSTIN mismatch"
      : Math.abs(variance) > 1 ? "Amount mismatch"
      : bookTax > 0 && Math.abs(bookTax - statementTax) > 1 ? "Tax mismatch"
      : "Matched";
    return {
      invoiceNo: statement.invoiceNo,
      supplier: statement.supplier || book.party || book.supplier,
      gstin: statement.gstin || book.gstin,
      invoiceDate: statement.invoiceDate || book.date,
      bookTotal,
      statementTotal: num(statement.total),
      variance,
      status
    };
  });
  purchases.forEach((purchase, index) => {
    if (usedBooks.has(index)) return;
    matches.push({
      invoiceNo: text(purchase.invoiceNo || purchase.billNo),
      supplier: text(purchase.party || purchase.supplier),
      gstin: text(purchase.gstin),
      invoiceDate: purchase.date,
      bookTotal: num(purchase.total || purchase.amount),
      statementTotal: 0,
      variance: num(purchase.total || purchase.amount),
      status: "Missing in GSTR-2B"
    });
  });
  return matches;
}

function visibleTallyPurchaseMatches(matches) {
  const search = text($("#tallyGstMatchSearch")?.value).trim().toLowerCase();
  const filter = $("#tallyGstMatchFilter")?.value || "all";
  const direction = $("#tallyGstMatchDateSort")?.value === "oldest" ? 1 : -1;
  return matches.filter(row => {
    const matchesSearch = !search || `${row.invoiceNo} ${row.supplier} ${row.gstin} ${row.status}`.toLowerCase().includes(search);
    const isMissing = text(row.status).startsWith("Missing");
    const matchesFilter = filter === "missing" ? isMissing
      : filter === "matched" ? row.status === "Matched"
      : filter === "issues" ? row.status !== "Matched" && !isMissing
      : true;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    const dateA = text(a.invoiceDate);
    const dateB = text(b.invoiceDate);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.localeCompare(dateB) * direction;
  });
}

function visibleTallySalesMatches(matches) {
  const search = text($("#tallyGstr1MatchSearch")?.value).trim().toLowerCase();
  const filter = $("#tallyGstr1MatchFilter")?.value || "all";
  const direction = $("#tallyGstr1MatchDateSort")?.value === "oldest" ? 1 : -1;
  return matches.filter(row => {
    const matchesSearch = !search || `${row.invoiceNo} ${row.customer} ${row.gstin} ${row.status} ${row.documentType}`.toLowerCase().includes(search);
    const isMissing = text(row.status).startsWith("Missing");
    const matchesFilter = filter === "missing" ? isMissing
      : filter === "matched" ? row.status === "Matched"
      : filter === "issues" ? row.status !== "Matched" && !isMissing
      : true;
    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    const dateA = text(a.invoiceDate);
    const dateB = text(b.invoiceDate);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.localeCompare(dateB) * direction;
  });
}

function printTallyPurchaseMatches() {
  const rows = visibleTallyPurchaseMatches(buildTallyGstCompare().matches);
  const popup = window.open("", "_blank");
  if (!popup) {
    toast("Allow pop-ups to print the purchase matching table.");
    return;
  }
  const printableRows = rows.map(row => `<tr><td>${html(row.invoiceNo)}</td><td>${html(row.supplier)}</td><td>${html(row.gstin)}</td><td>${html(row.invoiceDate)}</td><td class="num">${html(money2(row.bookTotal))}</td><td class="num">${html(money2(row.statementTotal))}</td><td class="num">${html(money2(row.variance))}</td><td>${html(row.status)}</td></tr>`).join("");
  const period = text($("#tallyGstRangeLabel")?.textContent);
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Purchase Invoice Matching: Tally vs GSTR-2B</title><style>body{font:12px Arial,sans-serif;color:#17251f;padding:20px}h1{font-size:20px;margin:0 0 6px}p{color:#52645b;margin:0 0 16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #87958d;padding:7px;text-align:left}th{background:#e6eee9}.num{text-align:right;white-space:nowrap}@page{size:landscape;margin:12mm}</style></head><body><h1>Purchase Invoice Matching: Tally vs GSTR-2B</h1><p>${html(period)} · ${rows.length} invoices</p><table><thead><tr><th>Tally bill / GST invoice</th><th>Supplier</th><th>GSTIN</th><th>Invoice date</th><th>Tally total</th><th>GSTR-2B total</th><th>Difference</th><th>Result</th></tr></thead><tbody>${printableRows || "<tr><td colspan=\"8\">No invoices match the current search and filters.</td></tr>"}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}

function printTallySalesMatches() {
  const rows = visibleTallySalesMatches(buildTallyGstCompare().gstr1Matches);
  const popup = window.open("", "_blank");
  if (!popup) {
    toast("Allow pop-ups to print the sales matching table.");
    return;
  }
  const printableRows = rows.map(row => `<tr><td>${html(row.documentType)}</td><td>${html(row.invoiceNo)}</td><td>${html(row.customer)}</td><td>${html(row.gstin)}</td><td>${html(row.invoiceDate)}</td><td class="num">${html(money2(row.bookTotal))}</td><td class="num">${html(money2(row.returnTotal))}</td><td class="num">${html(money2(row.variance))}</td><td>${html(row.status)}</td></tr>`).join("");
  const period = text($("#tallyGstRangeLabel")?.textContent);
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Sales Invoice Matching: Books vs GSTR-1</title><style>body{font:12px Arial,sans-serif;color:#17251f;padding:20px}h1{font-size:20px;margin:0 0 6px}p{color:#52645b;margin:0 0 16px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #87958d;padding:7px;text-align:left}th{background:#e6eee9}.num{text-align:right;white-space:nowrap}@page{size:landscape;margin:12mm}</style></head><body><h1>Sales Invoice Matching: Books vs GSTR-1</h1><p>${html(period)} · ${rows.length} sales documents</p><table><thead><tr><th>Document type</th><th>Invoice / note</th><th>Customer</th><th>GSTIN</th><th>Date</th><th>Book total</th><th>GSTR-1 total</th><th>Difference</th><th>Result</th></tr></thead><tbody>${printableRows || "<tr><td colspan=\"9\">No sales documents match the current search and filters.</td></tr>"}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
}

function matchImportedGstr1Sales(sales, gstr1Invoices) {
  const usedBooks = new Set();
  const matches = gstr1Invoices.map(statement => {
    const statementKey = tallyGstInvoiceKey(statement.invoiceNo);
    const candidates = sales.map((sale, index) => ({ sale, index })).filter(({ sale, index }) =>
      !usedBooks.has(index) && statementKey && tallyGstInvoiceKey(sale.invoiceNo || sale.memo) === statementKey
    );
    const exactGstin = candidates.find(({ sale }) => sale.gstin && statement.gstin && sale.gstin === statement.gstin);
    const candidate = exactGstin || (candidates.length === 1 ? candidates[0] : null);
    if (!candidate) {
      const gstinMismatch = candidates.some(({ sale }) => sale.gstin && statement.gstin && sale.gstin !== statement.gstin);
      return {
        invoiceNo: statement.invoiceNo,
        documentType: statement.documentType,
        customer: statement.customer,
        gstin: statement.gstin,
        invoiceDate: statement.invoiceDate,
        bookTotal: 0,
        returnTotal: num(statement.total),
        variance: num(statement.total),
        status: gstinMismatch ? "GSTIN mismatch" : candidates.length > 1 ? "Ambiguous invoice" : "Missing in books"
      };
    }
    usedBooks.add(candidate.index);
    const book = candidate.sale;
    const bookTotal = num(book.total || book.amount);
    const variance = bookTotal - num(statement.total);
    const bookTax = num(book.igst) + num(book.cgst) + num(book.sgst) + num(book.cess);
    const returnTax = num(statement.igst) + num(statement.cgst) + num(statement.sgst) + num(statement.cess);
    const gstinMismatch = book.gstin && statement.gstin && book.gstin !== statement.gstin;
    const status = gstinMismatch ? "GSTIN mismatch"
      : Math.abs(variance) > 1 ? "Amount mismatch"
      : bookTax > 0 && Math.abs(bookTax - returnTax) > 1 ? "Tax mismatch"
      : "Matched";
    return {
      invoiceNo: statement.invoiceNo,
      documentType: statement.documentType,
      customer: statement.customer || book.customer || book.party,
      gstin: statement.gstin || book.gstin,
      invoiceDate: statement.invoiceDate || book.date,
      bookTotal,
      returnTotal: num(statement.total),
      variance,
      status
    };
  });
  sales.forEach((sale, index) => {
    if (usedBooks.has(index)) return;
    matches.push({
      invoiceNo: text(sale.invoiceNo || sale.memo),
      documentType: "Book sale",
      customer: text(sale.customer || sale.party),
      gstin: text(sale.gstin),
      invoiceDate: sale.date,
      bookTotal: num(sale.total || sale.amount),
      returnTotal: 0,
      variance: num(sale.total || sale.amount),
      status: "Missing in GSTR-1"
    });
  });
  return matches;
}

function gstr1ReturnsInRange(range) {
  return gstr1Returns.filter(row => {
    const period = text(row.returnPeriod);
    if (!/^(0[1-9]|1[0-2])\d{4}$/.test(period)) return false;
    const month = Number(period.slice(0, 2));
    const year = Number(period.slice(2));
    const quarterly = text(row.filingType).toUpperCase() === "Q";
    const startMonth = quarterly ? month - 2 : month;
    if (startMonth < 1) return false;
    const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const to = new Date(year, month, 0).toISOString().slice(0, 10);
    return (!range.from || from >= range.from) && (!range.to || to <= range.to);
  });
}

function tallyGstCompareRange() {
  const period = text($("#tallyGstPeriod")?.value) || "month";
  if (period === "all") return { from: "", to: "" };
  const month = text($("#tallyGstMonth")?.value) || todayIso().slice(0, 7);
  const [selectedYear, monthNumber] = month.split("-").map(Number);
  if (period === "month" || period === "quarter") {
    let startMonth = monthNumber;
    if (period === "quarter") {
      startMonth = monthNumber >= 4
        ? 4 + Math.floor((monthNumber - 4) / 3) * 3
        : 1 + Math.floor((monthNumber - 1) / 3) * 3;
    }
    const from = `${selectedYear}-${String(startMonth).padStart(2, "0")}-01`;
    const end = new Date(selectedYear, startMonth + (period === "quarter" ? 3 : 1) - 1, 0);
    return { from, to: end.toISOString().slice(0, 10) };
  }
  const year = Number($("#tallyGstFinancialYear")?.value) || Number(todayIso().slice(0, 4));
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

function tallyGstDateMatches(value, range) {
  const date = parseDate(value);
  return Boolean(date) && (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

function tallyGstMoneyTotals(rows, type) {
  return rows.reduce((sum, row) => {
    if (type === "sales") {
      return {
        documents: sum.documents + 1,
        taxable: sum.taxable + num(row.taxable),
        igst: sum.igst + num(row.igst),
        cgst: sum.cgst + num(row.cgst),
        sgst: sum.sgst + num(row.sgst),
        tax: sum.tax + (num(row.totalTax) || num(row.igst) + num(row.cgst) + num(row.sgst) + num(row.cess) || num(row.tax)),
        total: sum.total + num(row.total)
      };
    }
    const tax = num(row.igst) + num(row.cgst) + num(row.sgst) + num(row.cess)
      || num(row.tax) || num(row.itc);
    return {
      documents: sum.documents + 1,
      taxable: sum.taxable + num(row.taxable || row.amount),
      igst: sum.igst + num(row.igst),
      cgst: sum.cgst + num(row.cgst),
      sgst: sum.sgst + num(row.sgst),
      tax: sum.tax + tax,
      total: sum.total + num(row.amount || row.total)
    };
  }, { documents: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0, total: 0 });
}

function buildTallyGstCompare() {
  const range = tallyGstCompareRange();
  const importedSales = tallyRegisterImports.sales?.rows;
  const importedPurchases = tallyRegisterImports.purchases?.rows;
  const sales = (importedSales || gstInvoiceRows()).filter(row => tallyGstDateMatches(row.date, range));
  const purchases = (importedPurchases || data.purchases()).filter(row => tallyGstDateMatches(row.date, range));
  const gst2bInvoices = (gst2bStatement?.invoices || []).filter(row => tallyGstDateMatches(row.invoiceDate, range));
  const selectedGstr1Returns = gstr1ReturnsInRange(range);
  const gstr1Invoices = selectedGstr1Returns.flatMap(row => row.invoices || []).filter(row => !row.invoiceDate || tallyGstDateMatches(row.invoiceDate, range));
  const gstr1Totals = selectedGstr1Returns.reduce((sum, row) => {
    ["taxable", "igst", "cgst", "sgst", "cess", "total"].forEach(key => { sum[key] += num(row.totals?.[key]); });
    return sum;
  }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, total: 0 });
  const gstr3bRows = gstr3bReturnsInRange(range);
  const tallySales = tallyGstMoneyTotals(sales, "sales");
  const tallyPurchases = tallyGstMoneyTotals(purchases, "purchases");
  const gstr2b = tallyGstMoneyTotals(gst2bInvoices, "purchases");
  const gstr1Matches = matchImportedGstr1Sales(sales, gstr1Invoices);
  const availableItc = gst2bInvoices.reduce((sum, row) => sum + (row.itcAvailable === "Y"
    ? num(row.igst) + num(row.cgst) + num(row.sgst) + num(row.cess)
    : 0), 0);
  const gstr3b = gstr3bAggregate(gstr3bRows);
  const matches = matchImportedTallyPurchases(purchases, gst2bInvoices);
  return {
    range,
    salesSource: importedSales ? tallyRegisterImports.sales.sourceFile || "Imported Tally Sales Register" : "Cashbook sales records",
    purchaseSource: importedPurchases ? tallyRegisterImports.purchases.sourceFile || "Imported Tally Purchase Register" : "Cashbook purchase records",
    sales,
    purchases,
    gst2bInvoices,
    gstr1Returns: selectedGstr1Returns,
    gstr1Invoices,
    gstr1Totals,
    gstr1Matches,
    gstr3bRows,
    tallySales,
    tallyPurchases,
    gstr2b,
    availableItc,
    gstr3b,
    matches,
    itcFlagsComplete: gst2bInvoices.length > 0 && gst2bInvoices.every(row => row.itcAvailable === "Y" || row.itcAvailable === "N")
  };
}

function tallyGstDifference(filed, tally) {
  return filed == null ? "Not comparable" : money2(filed - tally);
}

function renderTallyGstCompare() {
  const period = text($("#tallyGstPeriod")?.value) || "month";
  $("#tallyGstMonthLabel").hidden = !["month", "quarter"].includes(period);
  $("#tallyGstFinancialYearLabel").hidden = period !== "fy";
  const report = buildTallyGstCompare();
  const rangeLabel = report.range.from ? `${report.range.from} to ${report.range.to}` : "All available dates";
  $("#tallyGstRangeLabel").textContent = rangeLabel;
  const filedSales = report.gstr3b?.sectionsAvailable.has("outward") ? report.gstr3b.outward : null;
  const filedNetItc = report.gstr3b?.sectionsAvailable.has("itc") ? report.gstr3b.itcNetTotal : null;
  const cards = [
    ["Tally sales bills", report.tallySales.documents],
    ["Tally taxable sales", money2(report.tallySales.taxable)],
    ["GSTR-3B filed returns", report.gstr3bRows.length],
    ["Tally purchase bills", report.tallyPurchases.documents],
    ["GSTR-2B invoices", report.gstr2b.documents],
    ["Purchase match exceptions", report.matches.filter(row => row.status !== "Matched").length],
    ["GSTR-1 returns", report.gstr1Returns.length],
    ["Sales match exceptions", report.gstr1Matches.filter(row => row.status !== "Matched").length],
    ["Tally purchase ITC", money2(report.tallyPurchases.tax)],
    ["GSTR-2B available ITC", report.itcFlagsComplete ? money2(report.availableItc) : report.gstr2b.documents ? "Re-import GSTR-2B" : "No GSTR-2B"]
  ];
  $("#tallyGstKpis").innerHTML = cards.map(([label, value]) => `<div class="total-card"><small>${html(label)}</small><strong>${html(value)}</strong></div>`).join("");

  table($("#tallyGstCompareSummary"), [
    { label: "Comparison", key: "comparison" },
    { label: "Tally source", key: "tallySource" },
    { label: "Tally records", key: "tallyDocuments", num: true },
    { label: "Tally taxable", key: "tallyTaxable", render: row => money2(row.tallyTaxable) },
    { label: "GST records", key: "gstDocuments", num: true },
    { label: "GST taxable", key: "gstTaxable", render: row => row.gstTaxable == null ? "No return" : money2(row.gstTaxable) },
    { label: "GST - Tally", key: "difference", render: row => row.difference }
  ], [
    {
      comparison: "Sales / outward supply",
      tallySource: report.salesSource,
      tallyDocuments: report.tallySales.documents,
      tallyTaxable: report.tallySales.taxable,
      gstDocuments: report.gstr3bRows.length,
      gstTaxable: filedSales?.taxable ?? null,
      difference: tallyGstDifference(filedSales?.taxable, report.tallySales.taxable)
    },
    {
      comparison: "Purchases / inward supply",
      tallySource: report.purchaseSource,
      tallyDocuments: report.tallyPurchases.documents,
      tallyTaxable: report.tallyPurchases.taxable,
      gstDocuments: report.gstr2b.documents,
      gstTaxable: report.gstr2b.documents ? report.gstr2b.taxable : null,
      difference: tallyGstDifference(report.gstr2b.documents ? report.gstr2b.taxable : null, report.tallyPurchases.taxable)
    }
  ]);

  const tallySourceSummary = $("#tallyGstSourceSummary");
  if (tallySourceSummary) {
    const sourceText = (kind, record, fallback, count) => {
      const name = record ? record.sourceFile || fallback : fallback;
      const rowCount = record ? `${record.rowCount} imported rows` : `${count} records currently available`;
      return `${kind}: ${name} (${rowCount})`;
    };
    tallySourceSummary.textContent = `${sourceText("Sales", tallyRegisterImports.sales, "Cashbook sales records", report.tallySales.documents)} · ${sourceText("Purchases", tallyRegisterImports.purchases, "Cashbook purchase records", report.tallyPurchases.documents)}`;
  }

  const gstr1Tax = report.gstr1Totals.igst + report.gstr1Totals.cgst + report.gstr1Totals.sgst + report.gstr1Totals.cess;
  const gstr1RowCount = report.gstr1Returns.reduce((count, row) => count + (row.invoices || []).length + (row.summaries || []).length, 0);
  table($("#tallyGstr1CompareTable"), [
    { label: "Measure", key: "measure" },
    { label: `Tally data (${tallyRegisterImports.sales ? "Imported" : "Cashbook"})`, key: "tally", render: row => row.tally == null ? "Not available" : money2(row.tally) },
    { label: "Books", key: "books", render: row => row.books == null ? "Not available" : money2(row.books) },
    { label: "GSTR-1", key: "gstr1", render: row => row.gstr1 == null ? "No return" : money2(row.gstr1) },
    { label: "GSTR-1 - Tally", key: "difference" }
  ], [
    { measure: "Taxable sales", tally: report.tallySales.taxable, books: report.tallySales.taxable, gstr1: report.gstr1Returns.length ? report.gstr1Totals.taxable : null, difference: tallyGstDifference(report.gstr1Returns.length ? report.gstr1Totals.taxable : null, report.tallySales.taxable) },
    { measure: "Output tax", tally: report.tallySales.tax, books: report.tallySales.tax, gstr1: report.gstr1Returns.length ? gstr1Tax : null, difference: tallyGstDifference(report.gstr1Returns.length ? gstr1Tax : null, report.tallySales.tax) },
    { measure: "Sales total", tally: report.tallySales.total, books: report.tallySales.total, gstr1: report.gstr1Returns.length ? report.gstr1Totals.total : null, difference: tallyGstDifference(report.gstr1Returns.length ? report.gstr1Totals.total : null, report.tallySales.total) },
    { measure: "GSTR-1 return rows (invoice + aggregate)", tally: null, books: null, gstr1: report.gstr1Returns.length ? gstr1RowCount : null, difference: "Not comparable" }
  ]);

  table($("#tallyGstTaxCompare"), [
    { label: "Tax measure", key: "measure" },
    { label: "Tally books", key: "tally", render: row => row.tally == null ? "Not available" : money2(row.tally) },
    { label: "GST data", key: "gst", render: row => row.gst == null ? "Not available" : money2(row.gst) },
    { label: "GST - Tally", key: "difference" }
  ], [
    { measure: "Sales output tax (IGST + CGST + SGST)", tally: report.tallySales.tax, gst: filedSales ? filedSales.igst + filedSales.cgst + filedSales.sgst : null, difference: tallyGstDifference(filedSales ? filedSales.igst + filedSales.cgst + filedSales.sgst : null, report.tallySales.tax) },
    { measure: "Filed output cess", tally: null, gst: filedSales?.cess ?? null, difference: "Not comparable" },
    { measure: "Purchase tax in Tally", tally: report.tallyPurchases.tax, gst: report.gstr2b.documents ? report.gstr2b.tax : null, difference: tallyGstDifference(report.gstr2b.documents ? report.gstr2b.tax : null, report.tallyPurchases.tax) },
    { measure: "GSTR-2B available ITC", tally: report.tallyPurchases.tax, gst: report.itcFlagsComplete ? report.availableItc : null, difference: tallyGstDifference(report.itcFlagsComplete ? report.availableItc : null, report.tallyPurchases.tax) },
    { measure: "GSTR-3B net ITC", tally: report.tallyPurchases.tax, gst: filedNetItc, difference: tallyGstDifference(filedNetItc, report.tallyPurchases.tax) }
  ]);

  const visibleMatches = visibleTallyPurchaseMatches(report.matches);
  const matchCount = $("#tallyGstMatchCount");
  if (matchCount) matchCount.textContent = `${visibleMatches.length} of ${report.matches.length} purchase invoices · Period: ${rangeLabel}`;
  const matchNode = $("#tallyGstMatchTable");
  if (!report.gst2bInvoices.length) {
    matchNode.innerHTML = "<tbody><tr><td>No GSTR-2B invoices for this period. Import the portal statement in GST Returns.</td></tr></tbody>";
  } else {
    table(matchNode, [
      { label: "Tally bill / GST invoice", key: "invoiceNo" },
      { label: "Supplier", key: "supplier" },
      { label: "GSTIN", key: "gstin" },
      { label: "Invoice date", key: "invoiceDate" },
      { label: "Tally total", key: "bookTotal", render: row => money2(row.bookTotal) },
      { label: "GSTR-2B total", key: "statementTotal", render: row => money2(row.statementTotal) },
      { label: "Difference", key: "variance", render: row => money2(row.variance) },
      { label: "Result", key: "status" }
    ], visibleMatches);
  }

  const visibleGstr1Matches = visibleTallySalesMatches(report.gstr1Matches);
  const gstr1MatchCount = $("#tallyGstr1MatchCount");
  if (gstr1MatchCount) gstr1MatchCount.textContent = `${visibleGstr1Matches.length} of ${report.gstr1Matches.length} sales documents · Period: ${rangeLabel}`;
  const gstr1MatchNode = $("#tallyGstr1MatchTable");
  if (!report.gstr1Returns.length) {
    gstr1MatchNode.innerHTML = "<tbody><tr><td>No GSTR-1 return for this period. Import a portal JSON in GST Returns.</td></tr></tbody>";
  } else if (!report.gstr1Invoices.length) {
    gstr1MatchNode.innerHTML = "<tbody><tr><td>This GSTR-1 contains aggregate-only outward supplies for the period. Compare the declared totals above; invoice matching is unavailable for these rows.</td></tr></tbody>";
  } else {
    table(gstr1MatchNode, [
      { label: "Document type", key: "documentType" },
      { label: "Invoice / note", key: "invoiceNo" },
      { label: "Customer", key: "customer" },
      { label: "GSTIN", key: "gstin" },
      { label: "Date", key: "invoiceDate" },
      { label: "Book total", key: "bookTotal", render: row => money2(row.bookTotal) },
      { label: "GSTR-1 total", key: "returnTotal", render: row => money2(row.returnTotal) },
      { label: "Difference", key: "variance", render: row => money2(row.variance) },
      { label: "Result", key: "status" }
    ], visibleGstr1Matches);
  }
}

function exportTallyGstCompare() {
  const report = buildTallyGstCompare();
  csvDownload("tally-gst-comparison.csv", [
    { group: "Sales", measure: "Tally taxable sales", tally: report.tallySales.taxable, gst: "", difference: "" },
    { group: "Sales", measure: "GSTR-3B taxable outward", tally: "", gst: report.gstr3b?.outward?.taxable ?? "", difference: "" },
    { group: "Sales", measure: "GSTR-1 taxable outward", tally: report.tallySales.taxable, gst: report.gstr1Returns.length ? report.gstr1Totals.taxable : "", difference: report.gstr1Returns.length ? report.gstr1Totals.taxable - report.tallySales.taxable : "" },
    { group: "Purchases", measure: "Tally taxable purchases", tally: report.tallyPurchases.taxable, gst: "", difference: "" },
    { group: "Purchases", measure: "GSTR-2B taxable purchases", tally: "", gst: report.gstr2b.documents ? report.gstr2b.taxable : "", difference: "" },
    ...report.matches.map(row => ({ group: "Purchase invoice", measure: row.status, invoice: row.invoiceNo, supplier: row.supplier, tally: row.bookTotal, gst: row.statementTotal, difference: row.variance })),
    ...report.gstr1Matches.map(row => ({ group: "Sales document", measure: row.status, invoice: row.invoiceNo, customer: row.customer, tally: row.bookTotal, gst: row.returnTotal, difference: row.variance }))
  ]);
}

function bindTallyGstCompare() {
  const month = $("#tallyGstMonth");
  if (month && !month.value) month.value = todayIso().slice(0, 7);
  const yearSelect = $("#tallyGstFinancialYear");
  if (yearSelect && !yearSelect.options.length) {
    const today = todayIso();
    const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0);
    yearSelect.innerHTML = Array.from({ length: 10 }, (_, index) => year - index)
      .map(value => `<option value="${value}">FY ${value}-${String(value + 1).slice(-2)}</option>`).join("");
  }
  ["tallyGstPeriod", "tallyGstMonth", "tallyGstFinancialYear"].forEach(id => $(`#${id}`)?.addEventListener("change", renderTallyGstCompare));
  $("#tallyGstMatchSearch")?.addEventListener("input", renderTallyGstCompare);
  $("#tallyGstMatchFilter")?.addEventListener("change", renderTallyGstCompare);
  $("#tallyGstMatchDateSort")?.addEventListener("change", renderTallyGstCompare);
  $("#tallyGstMatchPrint")?.addEventListener("click", printTallyPurchaseMatches);
  $("#tallyGstr1MatchSearch")?.addEventListener("input", renderTallyGstCompare);
  $("#tallyGstr1MatchFilter")?.addEventListener("change", renderTallyGstCompare);
  $("#tallyGstr1MatchDateSort")?.addEventListener("change", renderTallyGstCompare);
  $("#tallyGstr1MatchPrint")?.addEventListener("click", printTallySalesMatches);
  $("#tallyGstCompareExport")?.addEventListener("click", exportTallyGstCompare);
  $("#tallyGstOpenReturns")?.addEventListener("click", () => showView("gstReturns"));
  $("#importTallyVoucherBtn")?.addEventListener("click", withBusyClick(async () => {
    const status = $("#tallyVoucherStatus");
    const input = $("#tallyVoucherFile");
    try {
      await importCombinedTallyVoucherFile();
    } catch (error) {
      console.error(error);
      if (status) status.textContent = error.message || "Could not import the Tally voucher export.";
      toast(error.message || "Could not import the Tally voucher export.");
    } finally {
      if (input) input.value = "";
    }
  }, "Importing..."));
  [["sales", "tallySales"], ["purchases", "tallyPurchases"]].forEach(([kind, prefix]) => {
    $(`#import${prefix}Btn`)?.addEventListener("click", withBusyClick(async () => {
      const status = $(`#${prefix}Status`);
      try {
        await importTallyRegister(kind);
      } catch (error) {
        console.error(error);
        if (status) status.textContent = error.message || `Could not import the Tally ${kind} register.`;
        toast(error.message || `Could not import the Tally ${kind} register.`);
      } finally {
        const input = $(`#${prefix}File`);
        if (input) input.value = "";
      }
    }, "Importing..."));
  });
}

bindTallyGstCompare();
