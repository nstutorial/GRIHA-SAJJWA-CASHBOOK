const STORE_KEY = "gsSteelUserDataV1";
const STORAGE_MODE_KEY = "gsSteelStorageModeV1";
const AUTH_TOKEN_KEY = "gsSteelAuthTokenV1";
const OFFLINE_AUTH_KEY = "gsSteelOfflineAuthV1";
const THEME_KEY = "gsSteelThemeV1";
const OFFLINE_TOKEN_PREFIX = "offline:";
const BACKUP_DATA_KEYS = ["transactions", "dues", "customers", "cheques", "outgoingCheques", "suppliers", "supplierOpeningBalances", "items", "purchases", "notes", "settings", "auditLogs", "manualCreditors", "manualChartAccounts"];
const DEV_API_BASE = "http://127.0.0.1:5000";
const API_BASE_URLS = window.location.protocol === "file:"
  ? [DEV_API_BASE]
  : ["5500", "5501", "8010"].includes(window.location.port)
    ? [DEV_API_BASE]
    : [""];
const BOOTSTRAP_PATH = "/api/bootstrap?exclude=auditLogs";
const VIEWS = {
  dashboard: ["Dashboard", "Daily cash, bank, sales, dues, and cheque status."],
  sales: ["Sales Dashboard", "Track sold items, customers, payment collections, tax, and due sales by month or date range."],
  gstOverview: ["GST Overview", "Compare sales books, purchase records, GSTR-2B and reconciliation exceptions by period."],
  tallyGstCompare: ["Tally vs GST", "Compare saved Tally/book sales and purchase entries with GSTR-2B and filed GSTR-3B data."],
  gstReturns: ["GST Returns", "Prepare GSTR-1, GSTR-3B, HSN summaries, and eligible ITC reports by period."],
  receipt: ["Receipt / Invoice", "Create GST-style sales receipts with cash, bank, Bajaj, due, and print output."],
  quotations: ["Business Quotations", "Create printable quotations for any business profile without posting a sale or payment."],
  payment: ["Payment Voucher", "Record cash or bank expenses into the transaction ledger."],
  transfers: ["Balance Transfer", "Move balance between cash, bank, and finance accounts."],
  ledger: ["Transaction Ledger", "Search and export the full transaction book imported from Excel."],
  accountsManager: ["Accounts Manager", "Review creditor, debtor, and balance sheet figures by financial year."],
  chartAccounts: ["Chart of Accounts", "Income credits and expense debits by financial year."],
  chartAccountDetails: ["Account Details", "Transactions and manual entries for the selected chart account."],
  dues: ["Due Register", "Track due amounts, due paid amounts, and open customer balances."],
  customers: ["Address Book", "Customer mobile numbers, address details, and GSTIN."],
  cheques: ["Cheque DropBox", "Upcoming cheques, bank dates, and clear/return status."],
  chequeManagement: ["Cheque Management", "Track cheques issued to suppliers and mahajans."],
  suppliers: ["Supplier Management", "Supplier-wise purchases, payments, and outstanding balance."],
  items: ["Items", "Item-wise purchase quantity, sold quantity, and stock balance."],
  purchases: ["Purchases", "Purchase bills and supplier payment register."],
  audit: ["Edit & Delete History", "Every edited or deleted record is listed here with before and after details."],
  settings: ["Settings", "Control receipt memo numbering and app preferences."]
};

let seed = null;
let apiAvailable = false;
let apiConnected = false;
let storageMode = "auto";
let authToken = localStorage.getItem(AUTH_TOKEN_KEY) || "";
let authUser = null;
let user = {
  transactions: [],
  dues: [],
  customers: [],
  cheques: [],
  outgoingCheques: [],
  suppliers: [],
  supplierOpeningBalances: [],
  items: [],
  purchases: [],
  notes: [],
  settings: [],
  auditLogs: [],
  manualCreditors: [],
  manualChartAccounts: [],
  businesses: [],
  quotations: [],
  chequeOverrides: {},
  fullBackupImported: false
};
let receiptItems = [];
let editingNoteId = null;
let editingReceiptTransaction = null;
let editingPaymentTransaction = null;
let editingPurchase = null;
let editingSupplier = null;
const unlockedActionRows = new Set();
let actionLockHasDbPassword = false;
let noteDenominations = [2000, 500, 200, 100, 50, 20, 10, 5];
const PAGE_SIZE = 25;
const DATALIST_OPTION_LIMIT = 5000;
let ledgerPage = 1;
let duePage = 1;
let dueSummaryPage = 1;
let dueActiveTab = "register";
let customerPage = 1;
let chequePage = 1;
let chequeManagementPage = 1;
let chequeManagementActiveTab = "issued";
let itemPage = 1;
let purchaseSaving = false;
let outgoingChequeSaving = false;
let dataCache = {};
const RECEIPT_MEMO_DEFAULTS = {
  auto: false,
  nextNo: 1,
  prefix: "RV-"
};
const PAYMENT_MEMO_DEFAULTS = {
  auto: false,
  nextNo: 1,
  prefix: "PV-"
};
const DEFAULT_RECEIPT_HEADS = ["CASH SELLING", "DUE PAID", "BAJAJ FINANCE", "Opening Balance"];
const DEFAULT_PAYMENT_HEADS = ["GS EXPENSE", "Due", "Due Paid"];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});
const fmt2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const todayIso = () => new Date().toISOString().slice(0, 10);
const num = value => Number(value || 0) || 0;
const text = value => String(value ?? "").trim();
const money = value => fmt.format(num(value));
const money2 = value => fmt2.format(num(value));
const decimal2 = value => num(value).toFixed(2);
const dateOnly = value => text(value).slice(0, 10);
const html = value => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

function debounce(fn, delay = 180) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function invalidateDataCache() {
  dataCache = {};
}

function cachedData(key, factory) {
  if (!Object.prototype.hasOwnProperty.call(dataCache, key)) {
    dataCache[key] = factory();
  }
  return dataCache[key];
}

function applyTheme(theme = localStorage.getItem(THEME_KEY) || "light") {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = nextTheme;
  const button = $("#themeToggleBtn");
  if (!button) return;
  const isDark = nextTheme === "dark";
  button.querySelector("span").textContent = isDark ? "â˜€" : "â˜¾";
  button.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
  button.title = isDark ? "Switch to light theme" : "Switch to dark theme";
}

function toggleTheme() {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
}

const GST_STATE_CODES = {
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  "punjab": "03",
  "chandigarh": "04",
  "uttarakhand": "05",
  "haryana": "06",
  "delhi": "07",
  "rajasthan": "08",
  "uttar pradesh": "09",
  "bihar": "10",
  "sikkim": "11",
  "arunachal pradesh": "12",
  "nagaland": "13",
  "manipur": "14",
  "mizoram": "15",
  "tripura": "16",
  "meghalaya": "17",
  "assam": "18",
  "west bengal": "19",
  "jharkhand": "20",
  "odisha": "21",
  "chhattisgarh": "22",
  "madhya pradesh": "23",
  "gujarat": "24",
  "dadra and nagar haveli and daman and diu": "26",
  "maharashtra": "27",
  "andhra pradesh": "28",
  "karnataka": "29",
  "goa": "30",
  "lakshadweep": "31",
  "kerala": "32",
  "tamil nadu": "33",
  "puducherry": "34",
  "andaman and nicobar islands": "35",
  "telangana": "36",
  "ladakh": "38",
  "other territory": "97"
};

function parseDate(value) {
  const raw = text(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
}

function normalizeStateCode(value) {
  const digits = text(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(0, 2).padStart(2, "0");
}

function cleanStateCodeInput(input) {
  if (!input) return;
  input.value = text(input.value).replace(/\D/g, "").slice(0, 2);
}

function stateCodeFromGstin(value) {
  const gstin = text(value).toUpperCase();
  return /^\d{2}[A-Z0-9]{13}$/.test(gstin) ? gstin.slice(0, 2) : "";
}

function stateCodeFromStateName(value) {
  return GST_STATE_CODES[text(value).toLowerCase()] || "";
}

function receiptStateCode() {
  const form = $("#receiptForm");
  if (!form) return businessStateCode();
  return normalizeStateCode(form.stateCode?.value)
    || stateCodeFromGstin(form.gstin?.value)
    || businessStateCode();
}

function splitGstAmount(tax, customerStateCode = receiptStateCode()) {
  const sourceCode = businessStateCode();
  const destinationCode = normalizeStateCode(customerStateCode) || sourceCode;
  if (destinationCode && destinationCode !== sourceCode) {
    return { igst: tax, cgst: 0, sgst: 0 };
  }
  return { igst: 0, cgst: tax / 2, sgst: tax / 2 };
}

function normalizeTransaction(row) {
  return {
    memo: text(row["Memo No"] ?? row.memo),
    date: parseDate(row.Date ?? row.date),
    head: text(row["Head of Account"] ?? row.head),
    party: text(row.Particulars ?? row.party),
    customerId: text(row["Customer ID"] ?? row["Customer-ID"] ?? row.customerId ?? row.customer_id),
    billed: num(row["Billed Amount"] ?? row.billed),
    cash: num(row["Received by CASH"] ?? row.cash),
    bank: num(row["Received by BANK"] ?? row.bank),
    expense: num(row["Expense Amount"] ?? row.expense),
    type: text(row["Trnasaction Type"] ?? row["Transaction Type"] ?? row.type),
    remark: text(row["Goods Details"] ?? row.Remarks ?? row.remark ?? row.voucherData?.tx?.remark),
    mobile: text(row["Mobile No"] ?? row.mobile),
    cost: num(row.Cost ?? row.cost),
    profit: num(row.Profit ?? row.profit),
    bajaj: num(row["Bajaj Finance Amount"] ?? row.bajaj),
    billId: text(row.billId),
    billData: row.billData || null,
    voucherId: text(row.voucherId),
    voucherData: row.voucherData || null,
    _id: row._id
  };
}

function normalizeDue(row) {
  return {
    date: parseDate(row.Date ?? row.date),
    name: text(row.Name ?? row.name),
    head: text(row["Head of Account"] ?? row.Head ?? row.head),
    memo: text(row["Memo No"] ?? row.memo),
    due: num(row["Due Amount"] ?? row.due),
    paid: num(row["Due paid amount"] ?? row.paid),
    remark: text(row.Remark ?? row.remark),
    _id: row._id
  };
}

function normalizeCustomer(row) {
  const gstin = text(row.GSTIN ?? row.gstin);
  return {
    id: text(row["Cust-ID"] ?? row["Cust ID"] ?? row["Customer ID"] ?? row.customerId ?? row.customer_id ?? row.id),
    name: text(row["Cust Name"] ?? row["Customer Name"] ?? row.Customer ?? row.Name ?? row.name),
    mobile: text(row["Mobile No."] ?? row["Mobile No"] ?? row.Mobile ?? row.mobile),
    address: text(row.Address ?? row.address),
    nearby: text(row["Near by Location"] ?? row.nearby),
    city: text(row.City ?? row.city),
    state: text(row.State ?? row.state),
    pin: text(row["PIN code"] ?? row["PIN Code"] ?? row.Pin ?? row.PIN ?? row.pin),
    stateCode: normalizeStateCode(row["State Code"] ?? row.StateCode ?? row.stateCode ?? row.state_code) || stateCodeFromGstin(gstin) || stateCodeFromStateName(row.State ?? row.state),
    gstin,
    _id: row._id
  };
}

function normalizeCheque(row) {
  const chequeNo = text(row["Cheque No."] ?? row.chequeNo);
  return {
    customer: text(row["Customer Name"] ?? row.customer),
    mobile: text(row["Mobile No."] ?? row.mobile),
    chequeNo,
    chequeDate: parseDate(row["Ch. Date"] ?? row.chequeDate),
    amount: num(row["Ch. Amount"] ?? row.amount),
    remark: text(row.Remarks ?? row.remark),
    bankingDate: parseDate(row["Banking Date"] ?? row.bankingDate),
    bank: text(row["Bank Name"] ?? row.bank),
    response: user.chequeOverrides[chequeNo] || text(row["Bank Respose"] ?? row.response) || "Pending",
    _id: row._id
  };
}

function normalizeOutgoingCheque(row) {
  return {
    supplier: text(row.supplier),
    chequeNo: text(row.chequeNo),
    chequeDate: parseDate(row.chequeDate),
    amount: num(row.amount),
    bank: text(row.bank),
    purpose: text(row.purpose),
    status: text(row.status) || "Issued",
    clearingDate: parseDate(row.clearingDate),
    _id: row._id
  };
}

function normalizeSupplier(row) {
  return {
    name: text(row.name ?? row.Supplier ?? row["Supplier Name"] ?? row["MAHAJAN'S NAME-"]),
    mobile: text(row.mobile ?? row.Mobile ?? row["Mobile No."]),
    address: text(row.address ?? row.Address),
    gstin: text(row.gstin ?? row.GSTIN),
    bankName: text(row.bankName ?? row["Bank Name"]),
    accountNumber: text(row.accountNumber ?? row["Account No."] ?? row.accountNo),
    ifsc: text(row.ifsc ?? row.IFSC),
    remark: text(row.remark ?? row.Remark),
    _id: row._id
  };
}

function normalizeSupplierOpeningBalance(row) {
  return { supplier: text(row.supplier), openingDate: parseDate(row.openingDate), amount: num(row.amount), remark: text(row.remark), _id: row._id };
}

function normalizeItem(row) {
  return {
    name: text(row.name ?? row.item ?? row.Item ?? row["Item Name"] ?? row.Description ?? row.description),
    group: text(row.group ?? row.Group) || "Uncategorized",
    hsn: text(row.hsn ?? row.HSN),
    unit: text(row.unit ?? row.Unit) || "Pcs",
    rate: num(row.rate ?? row.Rate),
    rateHistory: Array.isArray(row.rateHistory) ? row.rateHistory.map(normalizeRateHistoryEntry) : [],
    remark: text(row.remark ?? row.Remark),
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    _id: row._id
  };
}

function normalizeRateHistoryEntry(row = {}) {
  return {
    date: parseDate(row.date ?? row.changedAt ?? row.createdAt) || todayIso(),
    fromRate: num(row.fromRate),
    toRate: num(row.toRate ?? row.rate),
    note: text(row.note),
    source: text(row.source) || "Item master"
  };
}

function normalizePurchase(row) {
  const values = Object.values(row).map(text).filter(Boolean);
  const amount = Object.values(row).map(num).find(v => v > 0) || 0;
  return {
    date: parseDate(row.Date ?? row.date ?? row["Date of Purchase"] ?? row["Column 2"]),
    supplier: text(row["MAHAJAN'S NAME-"] ?? row.Supplier ?? row.supplier ?? row["Column 2"]) || values[0] || "",
    item: text(row.Item ?? row["Item Name"] ?? row.Description ?? row.description ?? row.item),
    qty: num(row.Qty ?? row.Quantity ?? row.qty ?? row.quantity),
    billNo: text(row["Bill No. as per Bill"] ?? row["Bill No"] ?? row.billNo ?? row["Column 4"]),
    amount: num(row.amount) || amount,
    paid: num(row.Paid ?? row.Payment ?? row.paid ?? row["Column 12"]),
    taxable: num(row.taxable ?? row["Taxable Amount"]),
    igst: num(row.igst ?? row.IGST),
    cgst: num(row.cgst ?? row.CGST),
    sgst: num(row.sgst ?? row.SGST),
    tax: num(row.tax ?? row["Tax Amount"]),
    itc: num(row.itc ?? row["Eligible ITC"]),
    remark: text(row.remark) || values.slice(0, 4).join(" / "),
    _id: row._id
  };
}

function normalizeNote(row) {
  const legacyCounts = row.counts || {};
  const inCounts = row.inCounts || legacyCounts;
  const outCounts = row.outCounts || {};
  const denominations = cleanDenominations(row.denominations?.length ? row.denominations : noteDenominations);
  const normalizedInCounts = Object.fromEntries(denominations.map(note => [note, num(inCounts[note])]));
  const normalizedOutCounts = Object.fromEntries(denominations.map(note => [note, num(outCounts[note])]));
  const total = noteTotal(normalizedInCounts, normalizedOutCounts, denominations);

  return {
    _id: row._id,
    date: parseDate(row.date) || todayIso(),
    title: text(row.title) || "Cash notes",
    denominations,
    inCounts: normalizedInCounts,
    outCounts: normalizedOutCounts,
    total: num(row.total) || total,
    remark: text(row.remark)
  };
}

const data = {
  transactions: () => cachedData("transactions", () => [...seedRows("transactions").map(normalizeTransaction), ...user.transactions]),
  dues: () => cachedData("dues", () => [...seedRows("dues").map(normalizeDue), ...user.dues]),
  customers: () => cachedData("customers", () => [...seedRows("customers").map(normalizeCustomer), ...user.customers]),
  cheques: () => cachedData("cheques", () => [...seedRows("cheques").map(normalizeCheque), ...user.cheques.map(c => ({ ...c, response: user.chequeOverrides[c.chequeNo] || c.response }))]),
  outgoingCheques: () => cachedData("outgoingCheques", () => [...seedRows("outgoingCheques").map(normalizeOutgoingCheque), ...(user.outgoingCheques || []).map(normalizeOutgoingCheque)]),
  suppliers: () => cachedData("suppliers", () => [...seedRows("suppliers").map(normalizeSupplier), ...(user.suppliers || []).map(normalizeSupplier)]),
  supplierOpeningBalances: () => cachedData("supplierOpeningBalances", () => [...seedRows("supplierOpeningBalances").map(normalizeSupplierOpeningBalance), ...(user.supplierOpeningBalances || []).map(normalizeSupplierOpeningBalance)]),
  items: () => cachedData("items", () => [...seedRows("items").map(normalizeItem), ...(user.items || []).map(normalizeItem)]),
  purchases: () => cachedData("purchases", () => [...seedRows("purchases").map(normalizePurchase), ...(user.purchases || []).map(normalizePurchase)]),
  notes: () => cachedData("notes", () => [...seedRows("notes").map(normalizeNote), ...user.notes.map(normalizeNote)]),
  auditLogs: () => cachedData("auditLogs", () => [...seedRows("auditLogs"), ...(user.auditLogs || [])]),
  manualCreditors: () => cachedData("manualCreditors", () => [...seedRows("manualCreditors"), ...(user.manualCreditors || [])].map(row => ({ _id: text(row._id), id: text(row.entryId ?? row.id ?? row._id), party: text(row.party), fy: text(row.fy), balance: num(row.balance) }))),
  manualChartAccounts: () => cachedData("manualChartAccounts", () => [...seedRows("manualChartAccounts"), ...(user.manualChartAccounts || [])].map(row => ({ _id: text(row._id), id: text(row.entryId ?? row.id ?? row._id), particular: text(row.particular), side: text(row.side), fy: text(row.fy), amount: num(row.amount) }))),
  businesses: () => cachedData("businesses", () => [...seedRows("businesses"), ...(user.businesses || [])]),
  quotations: () => cachedData("quotations", () => [...seedRows("quotations"), ...(user.quotations || [])])
};

function seedRows(key) {
  if (user.fullBackupImported) return [];
  return seed?.[key] || [];
}

function loadUser() {
  try {
    user = { ...user, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
    storageMode = localStorage.getItem(STORAGE_MODE_KEY) || "auto";
  } catch {
    toast("Could not read saved browser data. Starting clean.");
  }
}

function saveUser() {
  invalidateDataCache();
  localStorage.setItem(STORE_KEY, JSON.stringify(user));
}

function fullBackupData() {
  return {
    transactions: data.transactions(),
    dues: data.dues(),
    customers: data.customers(),
    cheques: data.cheques(),
    outgoingCheques: data.outgoingCheques(),
    suppliers: data.suppliers(),
    supplierOpeningBalances: data.supplierOpeningBalances(),
    items: backupItems(),
    purchases: data.purchases(),
    notes: data.notes(),
    settings: mergedSettings(),
    auditLogs: data.auditLogs(),
    manualCreditors: data.manualCreditors(),
    manualChartAccounts: data.manualChartAccounts(),
    businesses: data.businesses(),
    quotations: data.quotations(),
    chequeOverrides: { ...(user.chequeOverrides || {}) },
    fullBackupImported: true,
    backupMeta: {
      app: "G.S. Steel Cashbook",
      type: "full-export",
      exportedAt: new Date().toISOString()
    }
  };
}

function backupItems() {
  const byName = new Map();
  data.items().forEach(row => {
    const item = normalizeItem(row);
    if (item.name) byName.set(itemLabel(item.name), item);
  });
  itemStockSummary().forEach(row => {
    if (!text(row.item)) return;
    const key = itemLabel(row.item);
    if (!byName.has(key)) {
      byName.set(key, normalizeItem({
        name: row.item,
        hsn: row.hsn,
        unit: row.unit,
        rate: row.rate
      }));
    }
  });
  return [...byName.values()];
}

function mergedSettings() {
  const byKey = new Map();
  [...seedRows("settings"), ...(user.settings || [])].forEach(setting => {
    const key = text(setting?.key);
    if (key) byKey.set(key, setting);
  });
  return [...byKey.values()];
}

function normalizeSettings(rows) {
  const byKey = new Map();
  (rows || []).forEach(setting => {
    const key = text(setting?.key);
    if (key) byKey.set(key, setting);
  });
  return [...byKey.values()];
}

function normalizeBackupPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    ...emptyUserData(),
    transactions: (source.transactions || []).map(normalizeTransaction),
    dues: (source.dues || []).map(normalizeDue),
    customers: (source.customers || source.addressBook || []).map(normalizeCustomer),
    cheques: (source.cheques || []).map(normalizeCheque),
    outgoingCheques: (source.outgoingCheques || []).map(normalizeOutgoingCheque),
    suppliers: (source.suppliers || []).map(normalizeSupplier),
    supplierOpeningBalances: (source.supplierOpeningBalances || []).map(normalizeSupplierOpeningBalance),
    items: (source.items || []).map(normalizeItem),
    purchases: (source.purchases || []).map(normalizePurchase),
    notes: (source.notes || []).map(normalizeNote),
    settings: normalizeSettings(source.settings),
    auditLogs: source.auditLogs || [],
    manualCreditors: (source.manualCreditors || []).map(row => ({ _id: text(row._id), entryId: text(row.entryId ?? row.id), party: text(row.party), fy: text(row.fy), balance: num(row.balance) })),
    manualChartAccounts: (source.manualChartAccounts || []).map(row => ({ _id: text(row._id), entryId: text(row.entryId ?? row.id), particular: text(row.particular), side: text(row.side), fy: text(row.fy), amount: num(row.amount) })),
    businesses: source.businesses || [],
    quotations: source.quotations || [],
    chequeOverrides: source.chequeOverrides || {},
    fullBackupImported: source.fullBackupImported === true || source.backupMeta?.type === "full-export"
  };
}

function saveStorageMode(mode) {
  storageMode = mode === "local" ? "local" : "auto";
  localStorage.setItem(STORAGE_MODE_KEY, storageMode);
  apiAvailable = apiConnected && storageMode !== "local";
}

function emptyUserData() {
  return {
    transactions: [],
    dues: [],
    customers: [],
    cheques: [],
    outgoingCheques: [],
    suppliers: [],
    supplierOpeningBalances: [],
    items: [],
    purchases: [],
    notes: [],
    settings: [],
    auditLogs: [],
    manualCreditors: [],
    manualChartAccounts: [],
    businesses: [],
    quotations: [],
    chequeOverrides: {},
    fullBackupImported: false
  };
}

