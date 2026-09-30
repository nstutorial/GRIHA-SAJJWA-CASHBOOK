let gstOverviewInitialized = false;

function gstOverviewRange() {
  const period = text($("#gstOverviewPeriod")?.value) || "all";
  if (period === "all") return { from: "", to: "" };

  const financialYear = Number($("#gstOverviewFinancialYear")?.value) || Number(todayIso().slice(0, 4));
  if (period === "fy") return { from: `${financialYear}-04-01`, to: `${financialYear + 1}-03-31` };

  if (period === "quarter") {
    const quarter = Math.min(4, Math.max(1, Number($("#gstOverviewQuarter")?.value) || 1));
    const startMonth = 4 + (quarter - 1) * 3;
    const year = financialYear + (startMonth > 12 ? 1 : 0);
    const month = ((startMonth - 1) % 12) + 1;
    const lastDay = new Date(year, month + 2, 0);
    return {
      from: `${year}-${String(month).padStart(2, "0")}-01`,
      to: `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`
    };
  }

  const month = text($("#gstOverviewMonth")?.value);
  if (!/^\d{4}-\d{2}$/.test(month)) return { from: "", to: "" };
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function gstOverviewDateMatches(value, range) {
  const date = parseDate(value);
  if (!range.from && !range.to) return true;
  return Boolean(date) && (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

function initializeGstOverviewFilters() {
  const today = todayIso();
  const monthInput = $("#gstOverviewMonth");
  if (monthInput && !monthInput.value) monthInput.value = today.slice(0, 7);

  const fySelect = $("#gstOverviewFinancialYear");
  if (!fySelect) return;
  const selectedYear = fySelect.value;
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const currentFy = currentYear - (currentMonth < 4 ? 1 : 0);
  const years = new Set(Array.from({ length: 10 }, (_, index) => currentFy - index));
  [...gstInvoiceRows(), ...data.purchases(), ...(gst2bStatement?.invoices || [])].forEach(row => {
    const date = parseDate(row.date || row.invoiceDate);
    if (!date) return;
    const year = Number(date.slice(0, 4));
    years.add(year - (Number(date.slice(5, 7)) < 4 ? 1 : 0));
  });
  fySelect.innerHTML = [...years].sort((left, right) => right - left)
    .map(year => `<option value="${year}">FY ${year}-${String(year + 1).slice(-2)}</option>`).join("");
  fySelect.value = years.has(Number(selectedYear)) ? selectedYear : String(currentFy);
  const quarterSelect = $("#gstOverviewQuarter");
  if (quarterSelect && !quarterSelect.value) {
    const quarter = Math.floor(((currentMonth + 8) % 12) / 3) + 1;
    quarterSelect.value = String(quarter);
  }
}

function buildGstOverview() {
  const range = gstOverviewRange();
  const salesInvoices = gstInvoiceRows().filter(row => gstOverviewDateMatches(row.date, range));
  const purchases = data.purchases().filter(row => gstOverviewDateMatches(row.date, range));
  const gst2bInvoices = (gst2bStatement?.invoices || []).filter(row => gstOverviewDateMatches(row.invoiceDate, range));
  const sales = salesInvoices.reduce((total, row) => ({
    taxable: total.taxable + num(row.taxable), tax: total.tax + num(row.totalTax), total: total.total + num(row.total)
  }), { taxable: 0, tax: 0, total: 0 });
  const bookPurchases = purchases.reduce((total, row) => {
    const tax = num(row.igst) + num(row.cgst) + num(row.sgst) || num(row.tax) || num(row.itc);
    return {
      taxable: total.taxable + num(row.taxable || row.amount),
      tax: total.tax + tax,
      itc: total.itc + tax,
      total: total.total + num(row.amount)
    };
  }, { taxable: 0, tax: 0, itc: 0, total: 0 });
  const statement = gst2bInvoices.reduce((total, row) => ({
    taxable: total.taxable + num(row.taxable),
    igst: total.igst + num(row.igst),
    cgst: total.cgst + num(row.cgst),
    sgst: total.sgst + num(row.sgst),
    cess: total.cess + num(row.cess),
    tax: total.tax + num(row.igst) + num(row.cgst) + num(row.sgst) + num(row.cess),
    eligibleItc: total.eligibleItc + (row.itcAvailable === "Y"
      ? num(row.igst) + num(row.cgst) + num(row.sgst) + num(row.cess)
      : 0),
    itcFlagsKnown: total.itcFlagsKnown + (row.itcAvailable === "Y" || row.itcAvailable === "N" ? 1 : 0),
    total: total.total + num(row.total)
  }), { taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, tax: 0, eligibleItc: 0, itcFlagsKnown: 0, total: 0 });
  const stock = (typeof itemStockSummary === "function" ? itemStockSummary() : []).reduce((total, row) => ({
    items: total.items + (num(row.stockBalance) > 0 ? 1 : 0),
    quantity: total.quantity + num(row.stockBalance),
    value: total.value + num(row.stockBalance) * num(row.rate)
  }), { items: 0, quantity: 0, value: 0 });
  const reconciliation = reconcileGst2b().filter(row => gstOverviewDateMatches(row.invoiceDate, range));
  const buckets = new Map();
  reconciliation.forEach(row => {
    const status = text(row.status) || "Unknown";
    const bucket = buckets.get(status) || { status, invoices: 0, difference: 0 };
    bucket.invoices += 1;
    bucket.difference += num(row.variance);
    buckets.set(status, bucket);
  });
  const rangeLabel = range.from ? `${range.from} to ${range.to}` : "All available dates";
  return {
    range,
    rangeLabel,
    salesInvoices,
    purchases,
    gst2bInvoices,
    sales,
    bookPurchases,
    statement,
    stock,
    itcFlagsComplete: gst2bInvoices.length > 0 && statement.itcFlagsKnown === gst2bInvoices.length,
    reconciliation,
    buckets: [...buckets.values()].sort((left, right) => right.invoices - left.invoices)
  };
}

function renderGstOverview() {
  const cardsNode = $("#gstOverviewKpis");
  if (!cardsNode) return;
  initializeGstOverviewFilters();
  const period = text($("#gstOverviewPeriod")?.value) || "all";
  $("#gstOverviewFinancialYearLabel").hidden = period === "all";
  $("#gstOverviewQuarterLabel").hidden = period !== "quarter";
  $("#gstOverviewMonthLabel").hidden = period !== "month";
  const overview = buildGstOverview();
  const itcVariance = overview.statement.eligibleItc - overview.bookPurchases.itc;
  const fetchedItcValue = overview.itcFlagsComplete ? money2(overview.statement.eligibleItc)
    : overview.gst2bInvoices.length ? "Re-import statement" : "No statement";
  const cards = [
    ["Sales invoices", overview.salesInvoices.length],
    ["Taxable sales", money2(overview.sales.taxable)],
    ["Output GST", money2(overview.sales.tax)],
    ["Purchase entries", overview.purchases.length],
    ["Book ITC recorded", money2(overview.bookPurchases.itc)],
    ["GSTR-2B invoices", overview.gst2bInvoices.length],
    ["GSTR-2B available ITC", fetchedItcValue],
    ["Available ITC vs book difference", overview.itcFlagsComplete ? money2(itcVariance) : "Unavailable"],
    ["Current stock value", money2(overview.stock.value)]
  ];
  cardsNode.innerHTML = cards.map(([label, value]) => `<div class="total-card"><small>${label}</small><strong>${value}</strong></div>`).join("");
  const periodNode = $("#gstOverviewRangeLabel");
  if (periodNode) periodNode.textContent = overview.rangeLabel;

  table($("#gstOverviewSourceTable"), [
    { label: "Source", key: "source" }, { label: "Documents", key: "documents", num: true },
    { label: "Taxable", key: "taxable", render: row => money2(row.taxable) },
    { label: "Total GST", key: "tax", render: row => money2(row.tax) },
    { label: "Gross total", key: "total", render: row => money2(row.total) }
  ], [
    { source: "Sales invoices (cashbook)", documents: overview.salesInvoices.length, taxable: overview.sales.taxable, tax: overview.sales.tax, total: overview.sales.total },
    { source: "Purchases (cashbook)", documents: overview.purchases.length, taxable: overview.bookPurchases.taxable, tax: overview.bookPurchases.itc, total: overview.bookPurchases.total },
    { source: "Supplier invoices (GSTR-2B)", documents: overview.gst2bInvoices.length, taxable: overview.statement.taxable, tax: overview.statement.tax, total: overview.statement.total }
  ]);
  table($("#gstOverviewItcStockTable"), [
    { label: "Measure", key: "measure" },
    { label: "Cashbook", key: "books" },
    { label: "GSTR-2B available ITC", key: "portal" },
    { label: "Difference", key: "difference" }
  ], [
    {
      measure: "Eligible ITC",
      books: money2(overview.bookPurchases.itc),
      portal: fetchedItcValue,
      difference: overview.itcFlagsComplete ? money2(itcVariance) : "Unavailable"
    },
    {
      measure: `Current stock value (${overview.stock.items} in-stock items)`,
      books: money2(overview.stock.value),
      portal: "Not reported in GSTR-2B",
      difference: "Not comparable"
    }
  ]);
  const hasGstr2b = Boolean(gst2bStatement?.invoices?.length);
  table($("#gstOverviewExceptionsTable"), [
    { label: "Reconciliation status", key: "status" }, { label: "Invoices", key: "invoices", num: true },
    { label: "Net difference", key: "difference", render: row => money2(row.difference) },
    { label: "Review", key: "review", render: row => `<button type="button" class="secondary gst-overview-review" data-review-status="${html(row.status)}">Review</button>` }
  ], overview.buckets, { onRender: tableNode => {
    if (!overview.buckets.length) {
      const emptyCell = $("tbody td", tableNode);
      if (emptyCell) emptyCell.textContent = hasGstr2b
        ? "No reconciliation rows for this period."
        : "Import a GSTR-2B statement to see reconciliation statuses.";
    }
    $$(".gst-overview-review", tableNode).forEach(button => {
      button.addEventListener("click", () => openGstOverviewReport("reconciliation", button.dataset.reviewStatus));
    });
  }});
}

function openGstOverviewReport(reportTab, matchSearch = "") {
  gstReportTab = reportTab;
  if (reportTab === "reconciliation" && $("#gst2bMatchSearch")) {
    $("#gst2bMatchSearch").value = matchSearch;
  }
  showView("gstReturns");
  $$('[data-gst-report-tab]').forEach(button => {
    const active = button.dataset.gstReportTab === reportTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderGstReturns();
}

function bindGstOverview() {
  ["gstOverviewPeriod", "gstOverviewFinancialYear", "gstOverviewQuarter", "gstOverviewMonth"]
    .forEach(id => $(`#${id}`)?.addEventListener("change", renderGstOverview));
  $("#gstOverviewPeriod")?.addEventListener("change", () => {
    const period = $("#gstOverviewPeriod").value;
    $("#gstOverviewFinancialYearLabel").hidden = period === "all";
    $("#gstOverviewQuarterLabel").hidden = period !== "quarter";
    $("#gstOverviewMonthLabel").hidden = period !== "month";
    renderGstOverview();
  });
  $$('[data-gst-overview-report]').forEach(button => button.addEventListener("click", () => openGstOverviewReport(button.dataset.gstOverviewReport)));
}

bindGstOverview();