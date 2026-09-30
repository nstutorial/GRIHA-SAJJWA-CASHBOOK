const mongoose = require("mongoose");
const models = require("../models");
const normalizers = require("./normalizers");
const { escapeRegExp, num, parseDate, text } = require("../utils/data");

const PRIVATE_COLLECTIONS = new Set(["users", "actionLocks", "gst2bInvoices", "gstr1Returns"]);

function collectionNames() {
  return Object.keys(models).filter(name => !PRIVATE_COLLECTIONS.has(name));
}

function modelName(name) {
  if (!models[name] || PRIVATE_COLLECTIONS.has(name)) {
    const error = new Error(`Unknown collection: ${name}`);
    error.status = 404;
    throw error;
  }
  return models[name];
}

function naturalFilter(collection, row) {
  const id = text(row._id);
  if (id && mongoose.Types.ObjectId.isValid(id)) return { _id: id };
  if (collection === "transactions" && text(row.memo)) {
    return { memo: text(row.memo), date: parseDate(row.date), party: text(row.party) };
  }
  if (collection === "dues" && text(row.memo)) {
    return { memo: text(row.memo), name: text(row.name), date: parseDate(row.date) };
  }
  if (collection === "customers") {
    if (text(row.id)) return { id: text(row.id) };
    if (text(row.name) && text(row.mobile)) return { name: text(row.name), mobile: text(row.mobile) };
  }
  if (collection === "cheques" && text(row.chequeNo)) {
    return { chequeNo: text(row.chequeNo), bank: text(row.bank), amount: num(row.amount) };
  }
  if (collection === "outgoingCheques" && text(row.chequeNo)) {
    return { chequeNo: text(row.chequeNo), bank: text(row.bank), amount: num(row.amount) };
  }
  if (collection === "suppliers" && text(row.name)) return { name: text(row.name) };
  if (collection === "supplierOpeningBalances") return { supplier: text(row.supplier), openingDate: parseDate(row.openingDate) };
  if (collection === "items" && text(row.name)) return { name: text(row.name) };
  if (collection === "businesses" && text(row.name)) return { name: text(row.name) };
  if (collection === "quotations" && text(row.quotationNo) && text(row.businessId)) return { quotationNo: text(row.quotationNo), businessId: text(row.businessId) };
  if (collection === "purchases") {
    if (text(row.billNo)) return { billNo: text(row.billNo), supplier: text(row.supplier), item: text(row.item) };
    return { date: parseDate(row.date), supplier: text(row.supplier), item: text(row.item), amount: num(row.amount) };
  }
  if (collection === "notes") return { date: parseDate(row.date), title: text(row.title), total: num(row.total) };
  if (["manualCreditors", "manualChartAccounts"].includes(collection) && text(row.entryId)) return { entryId: text(row.entryId) };
  if (collection === "settings" && text(row.key)) return { key: text(row.key) };
  return null;
}

async function saveRecord(collection, row, source = "web") {
  const Model = modelName(collection);
  const normalize = normalizers[collection];
  const normalized = { ...normalize(row), source };
  if (collection === "settings") delete normalized.source;
  const filter = naturalFilter(collection, normalized);
  if (filter) {
    return Model.findOneAndUpdate(filter, normalized, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  }
  return Model.create(normalized);
}

function requestedCollections(query = {}) {
  const all = collectionNames();
  const only = text(query.collections || query.only)
    .split(",")
    .map(value => text(value))
    .filter(Boolean);
  const exclude = new Set(text(query.exclude)
    .split(",")
    .map(value => text(value))
    .filter(Boolean));
  return (only.length ? only : all).filter(name => all.includes(name) && !exclude.has(name));
}

async function bootstrapData(options = {}) {
  const result = {};
  const collections = requestedCollections(options);
  await Promise.all(collections.map(async name => {
    result[name] = await models[name].find({}).lean();
  }));
  return result;
}

function collectionSearchFields(collection) {
  return {
    transactions: ["memo", "date", "head", "party", "customerId", "remark", "mobile", "type"],
    dues: ["name", "memo", "remark", "date"],
    customers: ["id", "name", "mobile", "address", "city", "state", "gstin"],
    cheques: ["customer", "mobile", "chequeNo", "bank", "response"],
    outgoingCheques: ["supplier", "chequeNo", "bank", "purpose", "status"],
    suppliers: ["name", "mobile", "address", "gstin", "bankName"],
    supplierOpeningBalances: ["supplier", "openingDate", "remark"],
    items: ["name", "group", "hsn", "unit", "remark"],
    businesses: ["name", "address", "city", "state", "gstin", "mobile", "email"],
    quotations: ["quotationNo", "businessName", "date", "status", "notes"],
    purchases: ["supplier", "item", "billNo", "remark", "date"],
    notes: ["title", "remark", "date"],
    manualCreditors: ["party", "fy"],
    manualChartAccounts: ["particular", "side", "fy"],
    auditLogs: ["action", "targetCollection", "recordId", "label", "username"]
  }[collection] || [];
}

function queryFilter(collection, query = {}) {
  const filter = {};
  const q = text(query.q || query.search);
  if (q) {
    const regex = new RegExp(escapeRegExp(q), "i");
    filter.$or = collectionSearchFields(collection).map(field => ({ [field]: regex }));
  }
  if (query.from || query.to) {
    const dateField = collection === "auditLogs" ? "createdAt" : "date";
    filter[dateField] = {};
    if (query.from) filter[dateField].$gte = text(query.from);
    if (query.to) filter[dateField].$lte = text(query.to);
  }
  if (collection === "transactions" && text(query.head)) filter.head = text(query.head);
  if (collection === "cheques" && text(query.response)) filter.response = text(query.response);
  if (collection === "outgoingCheques" && text(query.status)) filter.status = text(query.status);
  return filter;
}

module.exports = {
  bootstrapData,
  collectionNames,
  modelName,
  normalizers,
  queryFilter,
  saveRecord
};
