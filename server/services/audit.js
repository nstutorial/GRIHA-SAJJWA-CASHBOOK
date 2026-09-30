const models = require("../models");
const { text } = require("../utils/data");

function recordLabel(collection, row = {}) {
  if (collection === "transactions") return [row.memo, row.party].map(text).filter(Boolean).join(" - ");
  if (collection === "dues") return [row.memo, row.name].map(text).filter(Boolean).join(" - ");
  if (collection === "customers") return [row.id, row.name].map(text).filter(Boolean).join(" - ");
  if (collection === "cheques") return [row.chequeNo, row.customer].map(text).filter(Boolean).join(" - ");
  if (collection === "outgoingCheques") return [row.chequeNo, row.supplier].map(text).filter(Boolean).join(" - ");
  if (collection === "suppliers") return text(row.name);
  if (collection === "items") return text(row.name);
  if (collection === "purchases") return [row.billNo, row.supplier, row.item].map(text).filter(Boolean).join(" - ");
  if (collection === "notes") return [row.date, row.title].map(text).filter(Boolean).join(" - ");
  if (collection === "settings") return text(row.key);
  return text(row._id);
}

async function logAudit(req, { action, collection, recordId, before = null, after = null, meta = {} }) {
  if (collection === "auditLogs") return null;
  return models.auditLogs.create({
    action,
    targetCollection: collection,
    recordId: text(recordId),
    label: recordLabel(collection, after || before || {}),
    userId: text(req.user?.id),
    username: text(req.user?.username || req.user?.name),
    before,
    after,
    meta
  });
}

module.exports = {
  logAudit,
  recordLabel
};
