const mongoose = require("mongoose");

const baseOptions = {
  timestamps: true,
  strict: false,
  minimize: false
};

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema);
}

const transactionSchema = new mongoose.Schema({
  memo: String,
  date: String,
  head: String,
  party: String,
  customerId: String,
  billed: Number,
  cash: Number,
  bank: Number,
  expense: Number,
  type: String,
  remark: String,
  mobile: String,
  cost: Number,
  profit: Number,
  bajaj: Number,
  billId: String,
  billData: mongoose.Schema.Types.Mixed,
  voucherId: String,
  voucherData: mongoose.Schema.Types.Mixed,
  salesManager: String,
  vehicleNo: String,
  transportMode: String,
  source: String
}, baseOptions);
transactionSchema.index({ date: -1, createdAt: -1 });
transactionSchema.index({ memo: 1, date: 1, party: 1 });
transactionSchema.index({ head: 1, date: -1 });

const dueSchema = new mongoose.Schema({
  date: String,
  name: String,
  memo: String,
  due: Number,
  paid: Number,
  remark: String,
  source: String
}, baseOptions);
dueSchema.index({ name: 1, date: -1 });
dueSchema.index({ memo: 1, name: 1, date: 1 });

const customerSchema = new mongoose.Schema({
  id: String,
  name: String,
  mobile: String,
  address: String,
  nearby: String,
  city: String,
  state: String,
  pin: String,
  stateCode: String,
  gstin: String,
  source: String
}, baseOptions);
customerSchema.index({ name: 1, mobile: 1 });
customerSchema.index({ id: 1 });

const chequeSchema = new mongoose.Schema({
  customer: String,
  mobile: String,
  chequeNo: String,
  chequeDate: String,
  amount: Number,
  remark: String,
  bankingDate: String,
  bank: String,
  response: String,
  source: String
}, baseOptions);
chequeSchema.index({ chequeNo: 1, bank: 1, amount: 1 });
chequeSchema.index({ bankingDate: -1, chequeDate: -1 });

const outgoingChequeSchema = new mongoose.Schema({
  supplier: String,
  chequeNo: String,
  chequeDate: String,
  amount: Number,
  bank: String,
  purpose: String,
  status: String,
  clearingDate: String,
  source: String
}, baseOptions);
outgoingChequeSchema.index({ supplier: 1, chequeDate: -1 });

const supplierSchema = new mongoose.Schema({
  name: String,
  openingBalance: Number,
  mobile: String,
  address: String,
  gstin: String,
  bankName: String,
  accountNumber: String,
  ifsc: String,
  remark: String,
  source: String
}, baseOptions);
supplierSchema.index({ name: 1 });

const supplierOpeningBalanceSchema = new mongoose.Schema({
  supplier: String,
  openingDate: String,
  amount: Number,
  remark: String,
  source: String
}, baseOptions);
supplierOpeningBalanceSchema.index({ supplier: 1, openingDate: -1 });

const itemSchema = new mongoose.Schema({
  name: String,
  group: String,
  hsn: String,
  unit: String,
  rate: Number,
  rateHistory: [mongoose.Schema.Types.Mixed],
  remark: String,
  source: String
}, baseOptions);
itemSchema.index({ name: 1 });

const purchaseSchema = new mongoose.Schema({
  date: String,
  supplier: String,
  item: String,
  qty: Number,
  billNo: String,
  amount: Number,
  paid: Number,
  remark: String,
  source: String
}, baseOptions);
purchaseSchema.index({ supplier: 1, date: -1 });
purchaseSchema.index({ billNo: 1, supplier: 1, item: 1 });

const gst2bInvoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true },
  invoiceKey: { type: String, required: true },
  supplier: String,
  supplierGstin: { type: String, default: "" },
  invoiceDate: String,
  supplierFilingDate: String,
  taxable: Number,
  igst: Number,
  cgst: Number,
  sgst: Number,
  cess: Number,
  total: Number,
  itcAvailable: String,
  sourceFile: String,
  importedAt: String
}, baseOptions);
gst2bInvoiceSchema.index({ supplierGstin: 1, invoiceKey: 1 }, { unique: true });
gst2bInvoiceSchema.index({ invoiceDate: -1 });

const gstr1ReturnSchema = new mongoose.Schema({
  gstin: { type: String, required: true },
  returnPeriod: { type: String, required: true },
  returnKey: { type: String, required: true },
  filingType: String,
  invoices: { type: [mongoose.Schema.Types.Mixed], default: [] },
  summaries: { type: [mongoose.Schema.Types.Mixed], default: [] },
  hsnRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  documentRows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  sections: [String],
  totals: { type: mongoose.Schema.Types.Mixed, default: {} },
  sourceFile: String,
  importedAt: String
}, baseOptions);
gstr1ReturnSchema.index({ returnKey: 1 }, { unique: true });
gstr1ReturnSchema.index({ returnPeriod: -1 });

const gstr3bReturnSchema = new mongoose.Schema({
  gstin: { type: String, required: true },
  returnPeriod: { type: String, required: true },
  returnKey: { type: String, required: true },
  values: { type: mongoose.Schema.Types.Mixed, required: true },
  sectionsAvailable: [String],
  sourceFile: String,
  importedAt: String
}, baseOptions);
gstr3bReturnSchema.index({ returnKey: 1 }, { unique: true });
gstr3bReturnSchema.index({ returnPeriod: -1 });

const tallyGstImportSchema = new mongoose.Schema({
  kind: { type: String, enum: ["sales", "purchases"], required: true },
  rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
  rowCount: Number,
  sourceFile: String,
  importedAt: String
}, baseOptions);
tallyGstImportSchema.index({ kind: 1 }, { unique: true });

const noteSchema = new mongoose.Schema({
  date: String,
  title: String,
  denominations: [Number],
  inCounts: mongoose.Schema.Types.Mixed,
  outCounts: mongoose.Schema.Types.Mixed,
  total: Number,
  remark: String,
  source: String
}, baseOptions);

const manualCreditorSchema = new mongoose.Schema({
  entryId: { type: String, required: true, unique: true, index: true },
  party: String,
  fy: String,
  balance: Number,
  source: String
}, baseOptions);

const manualChartAccountSchema = new mongoose.Schema({
  entryId: { type: String, required: true, unique: true, index: true },
  particular: String,
  side: String,
  fy: String,
  amount: Number,
  source: String
}, baseOptions);

const settingSchema = new mongoose.Schema({
  key: String,
  value: mongoose.Schema.Types.Mixed
}, baseOptions);

const businessSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  address: String,
  city: String,
  state: String,
  stateCode: String,
  pin: String,
  gstin: String,
  mobile: String,
  email: String,
  bankName: String,
  accountName: String,
  accountNumber: String,
  ifsc: String,
  notes: String,
  terms: String,
  active: { type: Boolean, default: true },
  source: String
}, baseOptions);
businessSchema.index({ name: 1 }, { unique: true });

const quotationSchema = new mongoose.Schema({
  quotationNo: { type: String, required: true, trim: true },
  date: String,
  validUntil: String,
  businessId: String,
  businessName: String,
  customer: mongoose.Schema.Types.Mixed,
  items: [mongoose.Schema.Types.Mixed],
  subtotal: Number,
  discount: Number,
  taxableAmount: Number,
  taxAmount: Number,
  total: Number,
  notes: String,
  terms: String,
  status: { type: String, default: "Draft" },
  source: String
}, baseOptions);
quotationSchema.index({ quotationNo: 1, businessId: 1 }, { unique: true });
quotationSchema.index({ businessId: 1, date: -1 });

const actionLockSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  passwordHash: String,
  passwordSalt: String,
  updatedBy: String
}, baseOptions);

const auditLogSchema = new mongoose.Schema({
  action: String,
  targetCollection: String,
  recordId: String,
  label: String,
  userId: String,
  username: String,
  before: mongoose.Schema.Types.Mixed,
  after: mongoose.Schema.Types.Mixed,
  meta: mongoose.Schema.Types.Mixed
}, baseOptions);
auditLogSchema.index({ createdAt: -1, targetCollection: 1, action: 1 });

const userSchema = new mongoose.Schema({
  name: String,
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: String,
  passwordSalt: String,
  role: { type: String, default: "admin" },
  blocked: { type: Boolean, default: false },
  lastLoginAt: String
}, baseOptions);

module.exports = {
  actionLocks: model("ActionLock", actionLockSchema),
  auditLogs: model("AuditLog", auditLogSchema),
  businesses: model("Business", businessSchema),
  cheques: model("Cheque", chequeSchema),
  customers: model("Customer", customerSchema),
  dues: model("Due", dueSchema),
  gst2bInvoices: model("Gst2bInvoice", gst2bInvoiceSchema),
  gstr1Returns: model("Gstr1Return", gstr1ReturnSchema),
  gstr3bReturns: model("Gstr3bReturn", gstr3bReturnSchema),
  tallyGstImports: model("TallyGstImport", tallyGstImportSchema),
  items: model("Item", itemSchema),
  notes: model("Note", noteSchema),
  manualCreditors: model("ManualCreditor", manualCreditorSchema),
  manualChartAccounts: model("ManualChartAccount", manualChartAccountSchema),
  outgoingCheques: model("OutgoingCheque", outgoingChequeSchema),
  purchases: model("Purchase", purchaseSchema),
  quotations: model("Quotation", quotationSchema),
  settings: model("Setting", settingSchema),
  suppliers: model("Supplier", supplierSchema),
  supplierOpeningBalances: model("SupplierOpeningBalance", supplierOpeningBalanceSchema),
  transactions: model("Transaction", transactionSchema),
  users: model("User", userSchema)
};
