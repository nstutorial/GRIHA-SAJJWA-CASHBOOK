const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { connectDB, mongoUri } = require("../config/db");

const root = path.join(__dirname, "..");
const seedPath = path.join(root, "data", "seed-data.json");

const schemaOptions = {
  timestamps: true,
  strict: false,
  minimize: false
};

const models = {
  transactions: mongoose.model("Transaction", new mongoose.Schema({}, schemaOptions)),
  dues: mongoose.model("Due", new mongoose.Schema({}, schemaOptions)),
  customers: mongoose.model("Customer", new mongoose.Schema({}, schemaOptions)),
  cheques: mongoose.model("Cheque", new mongoose.Schema({}, schemaOptions)),
  purchases: mongoose.model("Purchase", new mongoose.Schema({}, schemaOptions)),
  notes: mongoose.model("Note", new mongoose.Schema({}, schemaOptions)),
  settings: mongoose.model("Setting", new mongoose.Schema({}, schemaOptions))
};

function text(value) {
  return String(value ?? "").trim();
}

function num(value) {
  return Number(value || 0) || 0;
}

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

function stateCodeFromGstin(value) {
  const gstin = text(value).toUpperCase();
  return /^\d{2}[A-Z0-9]{13}$/.test(gstin) ? gstin.slice(0, 2) : "";
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
    salesManager: text(row.salesManager),
    vehicleNo: text(row.vehicleNo),
    transportMode: text(row.transportMode),
    source: "excel"
  };
}

function normalizeDue(row) {
  return {
    date: parseDate(row.Date ?? row.date),
    name: text(row.Name ?? row.name),
    memo: text(row["Memo No"] ?? row.memo),
    due: num(row["Due Amount"] ?? row.due),
    paid: num(row["Due paid amount"] ?? row.paid),
    remark: text(row.Remark ?? row.remark),
    source: "excel"
  };
}

function normalizeCustomer(row) {
  const gstin = text(row.GSTIN ?? row.gstin);
  return {
    id: text(row["Cust-ID"] ?? row.id),
    name: text(row["Cust Name"] ?? row.name),
    mobile: text(row["Mobile No."] ?? row.mobile),
    address: text(row.Address ?? row.address),
    nearby: text(row["Near by Location"] ?? row.nearby),
    city: text(row.City ?? row.city),
    state: text(row.State ?? row.state),
    pin: text(row["PIN code"] ?? row.pin),
    stateCode: normalizeStateCode(row["State Code"] ?? row.stateCode ?? row.state_code) || stateCodeFromGstin(gstin),
    gstin,
    source: "excel"
  };
}

function normalizeCheque(row) {
  return {
    customer: text(row["Customer Name"] ?? row.customer),
    mobile: text(row["Mobile No."] ?? row.mobile),
    chequeNo: text(row["Cheque No."] ?? row.chequeNo),
    chequeDate: parseDate(row["Ch. Date"] ?? row.chequeDate),
    amount: num(row["Ch. Amount"] ?? row.amount),
    remark: text(row.Remarks ?? row.remark),
    bankingDate: parseDate(row["Banking Date"] ?? row.bankingDate),
    bank: text(row["Bank Name"] ?? row.bank),
    response: text(row["Bank Respose"] ?? row.response) || "Pending",
    source: "excel"
  };
}

function normalizePurchase(row) {
  const values = Object.values(row).map(text).filter(Boolean);
  const amount = Object.values(row).map(num).find(value => value > 0) || 0;
  return {
    date: parseDate(row.Date ?? row.date ?? row["Date of Purchase"] ?? row["Column 2"]),
    supplier: text(row["MAHAJAN'S NAME-"] ?? row.Supplier ?? row.supplier ?? row["Column 2"]) || values[0] || "",
    billNo: text(row["Bill No. as per Bill"] ?? row["Bill No"] ?? row.billNo ?? row["Column 4"]),
    amount: num(row.amount) || amount,
    paid: num(row.Paid ?? row.Payment ?? row.paid ?? row["Column 12"]),
    remark: text(row.remark) || values.slice(0, 4).join(" / "),
    source: "excel"
  };
}

function normalizeNote(row) {
  const legacyCounts = row.counts || {};
  const inCounts = row.inCounts || legacyCounts;
  const outCounts = row.outCounts || {};
  const denominations = Array.isArray(row.denominations) && row.denominations.length
    ? row.denominations
    : [2000, 500, 200, 100, 50, 20, 10, 5];
  const normalizedInCounts = Object.fromEntries(denominations.map(note => [note, num(inCounts[note])]));
  const normalizedOutCounts = Object.fromEntries(denominations.map(note => [note, num(outCounts[note])]));
  const total = Object.keys(normalizedInCounts).reduce((sum, note) => {
    return sum + num(note) * normalizedInCounts[note] - num(note) * normalizedOutCounts[note];
  }, 0);

  return {
    date: parseDate(row.date) || new Date().toISOString().slice(0, 10),
    title: text(row.title) || "Cash notes",
    denominations,
    inCounts: normalizedInCounts,
    outCounts: normalizedOutCounts,
    total,
    remark: text(row.remark),
    source: text(row.source) || "web"
  };
}

const normalizers = {
  transactions: normalizeTransaction,
  dues: normalizeDue,
  customers: normalizeCustomer,
  cheques: normalizeCheque,
  purchases: normalizePurchase,
  notes: normalizeNote,
  settings: row => row
};

async function main() {
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  await connectDB();
  console.log(`MongoDB: ${mongoUri}`);

  for (const [name, Model] of Object.entries(models)) {
    const existing = await Model.countDocuments();
    if (existing) {
      console.log(`${name}: skipped, already has ${existing} records`);
      continue;
    }

    const rows = (seed[name] || []).map(normalizers[name]);
    if (rows.length) await Model.insertMany(rows, { ordered: false });
    console.log(`${name}: inserted ${rows.length}`);
  }

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
