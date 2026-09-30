const {
  normalizeStateCode,
  num,
  parseDate,
  stateCodeFromGstin,
  text
} = require("../utils/data");

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
    source: text(row.source) || "excel"
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
    source: text(row.source) || "excel"
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
    stateCode: normalizeStateCode(row["State Code"] ?? row.StateCode ?? row.stateCode ?? row.state_code) || stateCodeFromGstin(gstin),
    gstin,
    source: text(row.source) || "excel"
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
    source: text(row.source) || "excel"
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
    source: text(row.source) || "web"
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
    source: text(row.source) || "web"
  };
}

function normalizeSupplierOpeningBalance(row) {
  return {
    supplier: text(row.supplier),
    openingDate: parseDate(row.openingDate),
    amount: num(row.amount),
    remark: text(row.remark),
    source: text(row.source) || "web"
  };
}

function normalizePurchase(row) {
  const values = Object.values(row).map(text).filter(Boolean);
  const amount = Object.values(row).map(num).find(value => value > 0) || 0;
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
    source: text(row.source) || "excel"
  };
}

function normalizeRateHistoryEntry(row = {}) {
  return {
    date: parseDate(row.date ?? row.changedAt ?? row.createdAt) || new Date().toISOString().slice(0, 10),
    fromRate: num(row.fromRate),
    toRate: num(row.toRate ?? row.rate),
    note: text(row.note),
    source: text(row.source) || "Item master"
  };
}

function normalizeItem(row) {
  return {
    name: text(row.name ?? row.Item ?? row["Item Name"] ?? row.Description ?? row.description),
    group: text(row.group ?? row.Group) || "Uncategorized",
    hsn: text(row.hsn ?? row.HSN),
    unit: text(row.unit ?? row.Unit) || "Pcs",
    rate: num(row.rate ?? row.Rate),
    rateHistory: Array.isArray(row.rateHistory) ? row.rateHistory.map(normalizeRateHistoryEntry) : [],
    remark: text(row.remark ?? row.Remark),
    source: text(row.source) || "web"
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

function normalizeBusiness(row) {
  const gstin = text(row.gstin).toUpperCase();
  return {
    name: text(row.name), address: text(row.address), city: text(row.city), state: text(row.state),
    stateCode: normalizeStateCode(row.stateCode) || stateCodeFromGstin(gstin), pin: text(row.pin), gstin,
    mobile: text(row.mobile), email: text(row.email), bankName: text(row.bankName), accountName: text(row.accountName),
    accountNumber: text(row.accountNumber), ifsc: text(row.ifsc).toUpperCase(), notes: text(row.notes), terms: text(row.terms), quotationTemplate: ["classic", "modern", "compact"].includes(text(row.quotationTemplate)) ? text(row.quotationTemplate) : "classic", active: row.active !== false,
    source: text(row.source) || "web"
  };
}

function normalizeQuotation(row) {
  const subtotal = num(row.subtotal);
  const discount = num(row.discount);
  const total = num(row.total);
  const roundOff = row.roundOff == null
    ? Math.round((total - (subtotal - discount)) * 100) / 100
    : num(row.roundOff);

  return {
    quotationNo: text(row.quotationNo), date: parseDate(row.date), validUntil: parseDate(row.validUntil),
    businessId: text(row.businessId), businessName: text(row.businessName), customer: row.customer || {},
    items: Array.isArray(row.items) ? row.items : [], subtotal, discount, roundOff,
    taxableAmount: num(row.taxableAmount), taxAmount: num(row.taxAmount), total,
    notes: text(row.notes), terms: text(row.terms), status: text(row.status) || "Draft", source: text(row.source) || "web"
  };
}

function normalizeManualCreditor(row) {
  return { entryId: text(row.entryId ?? row.id), party: text(row.party), fy: text(row.fy), balance: num(row.balance), source: text(row.source) || "web" };
}

function normalizeManualChartAccount(row) {
  return { entryId: text(row.entryId ?? row.id), particular: text(row.particular), side: text(row.side), fy: text(row.fy), amount: num(row.amount), source: text(row.source) || "web" };
}

module.exports = {
  transactions: normalizeTransaction,
  dues: normalizeDue,
  customers: normalizeCustomer,
  cheques: normalizeCheque,
  outgoingCheques: normalizeOutgoingCheque,
  suppliers: normalizeSupplier,
  supplierOpeningBalances: normalizeSupplierOpeningBalance,
  items: normalizeItem,
  purchases: normalizePurchase,
  notes: normalizeNote,
  businesses: normalizeBusiness,
  quotations: normalizeQuotation,
  manualCreditors: normalizeManualCreditor,
  manualChartAccounts: normalizeManualChartAccount,
  settings: row => ({
    key: text(row.key),
    value: row.value
  })
};
