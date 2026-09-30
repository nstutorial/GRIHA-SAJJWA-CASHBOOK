function auditCollectionLabel(value) {
  const labels = {
    transactions: "Transaction Ledger",
    backup: "Backup / Restore",
    gstr1Returns: "GSTR-1 Imports",
    gstr3bReturns: "GSTR-3B Imports",
    gst2bInvoices: "GSTR-2B Imports",
    tallyGstImports: "Tally GST Imports",
    dues: "Due Register",
    customers: "Address Book",
    cheques: "Cheque DropBox",
    outgoingCheques: "Cheque Management",
    suppliers: "Supplier Management",
    items: "Items",
    purchases: "Purchases",
    notes: "Cash Notes",
    settings: "Settings"
  };
  return labels[value] || text(value);
}

function auditSnapshotSummary(row) {
  return auditChangeRows(row)
    .map(change => row.action === "delete"
      ? `${change.field}: ${change.before}`
      : `${change.field}: ${change.before} -> ${change.after}`)
    .join("; ") || "-";
}

function auditDisplayValue(value) {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return text(value);
}

function auditChangeRows(row) {
  const before = row.before || {};
  const after = row.after || {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !["_id", "__v", "createdAt", "updatedAt", "source"].includes(key));
  return keys
    .filter(key => row.action === "delete" || JSON.stringify(before[key] ?? "") !== JSON.stringify(after[key] ?? ""))
    .map(key => ({
      field: key,
      before: auditDisplayValue(before[key]),
      after: row.action === "delete" ? "Deleted" : auditDisplayValue(after[key])
    }));
}

function auditChangesMarkup(row) {
  const changes = auditChangeRows(row);
  if (!changes.length) return `<span class="muted">No field details available.</span>`;
  const detailsId = `audit-details-${html(row._id || row.recordId || row.createdAt || Math.random().toString(16).slice(2))}`;
  return `
    <div class="audit-change-shell">
      <button type="button" class="secondary audit-toggle" aria-expanded="false" aria-controls="${detailsId}">
        View changes (${changes.length})
      </button>
      <div class="audit-change-list" id="${detailsId}" hidden>
        ${changes.map(change => `
          <div class="audit-change-row">
            <strong>${html(change.field)}</strong>
            <span class="audit-before">${html(change.before)}</span>
            <span class="audit-after">${html(change.after)}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function bindAuditToggles(node) {
  $$(".audit-toggle", node).forEach(button => {
    button.addEventListener("click", () => {
      const details = document.getElementById(button.getAttribute("aria-controls"));
      if (!details) return;
      const isOpening = details.hidden;
      details.hidden = !isOpening;
      button.setAttribute("aria-expanded", String(isOpening));
      button.textContent = button.textContent.replace(isOpening ? "View" : "Hide", isOpening ? "Hide" : "View");
    });
  });
}

function auditRows() {
  const q = text($("#auditSearch")?.value).toLowerCase();
  const action = text($("#auditAction")?.value).toLowerCase();
  const collection = text($("#auditCollection")?.value);
  const { from, to } = tableDateRange("auditDateRangeMode", "auditFrom", "auditTo", "auditRangeMonth");
  return data.auditLogs()
    .map(row => ({ ...row, changedAt: dateOnly(row.createdAt) }))
    .filter(row => {
      const collectionName = auditTargetCollection(row);
      const hay = [
        row.action,
        auditCollectionLabel(collectionName),
        collectionName,
        row.label,
        row.recordId,
        row.username,
        auditSnapshotSummary(row)
      ].map(text).join(" ").toLowerCase();
      return (!q || hay.includes(q))
        && (!action || text(row.action).toLowerCase() === action)
        && (!collection || collectionName === collection)
        && (!from || row.changedAt >= from)
        && (!to || row.changedAt <= to);
    })
    .sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)));
}

function auditExportRows() {
  return auditRows().map(row => ({
    date: row.changedAt,
    time: text(row.createdAt).slice(11, 19),
    action: row.action,
    page: auditCollectionLabel(auditTargetCollection(row)),
    record: row.label || row.recordId,
    user: row.username,
    details: auditSnapshotSummary(row)
  }));
}

function renderAuditLog() {
  syncTableDateRangeControls("auditDateRangeMode", "auditFrom", "auditTo");
  const collectionSelect = $("#auditCollection");
  if (!collectionSelect) return;
  const selected = collectionSelect.value;
  const collections = [...new Set(data.auditLogs().map(row => auditTargetCollection(row)).filter(Boolean))].sort();
  collectionSelect.innerHTML = `<option value="">All pages</option>${collections.map(collection => (
    `<option value="${html(collection)}" ${selected === collection ? "selected" : ""}>${html(auditCollectionLabel(collection))}</option>`
  )).join("")}`;
  table($("#auditTable"), [
    { label: "Date", key: "createdAt", render: row => `${html(dateOnly(row.createdAt))}<br><small>${html(text(row.createdAt).slice(11, 19))}</small>` },
    { label: "Action", key: "action", render: row => `<span class="audit-pill ${html(text(row.action).toLowerCase())}">${html(row.action)}</span>` },
    { label: "Page", key: "collection", render: row => html(auditCollectionLabel(auditTargetCollection(row))) },
    { label: "Record", key: "label", render: row => html(row.label || row.recordId) },
    { label: "User", key: "username", render: row => html(row.username || "User") },
    { label: "Changes", key: "changes", render: row => auditChangesMarkup(row) }
  ], auditRows(), { onRender: bindAuditToggles });
}

