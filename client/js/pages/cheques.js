function renderCheques() {
  const q = text($("#chequeSearch").value).toLowerCase();
  const rows = data.cheques()
    .filter(row => {
      const hay = `${row.customer} ${row.mobile} ${row.chequeNo} ${row.chequeDate} ${row.amount} ${row.bank} ${row.response}`.toLowerCase();
      return !q || hay.includes(q);
    })
    .slice()
    .reverse();
  const pageInfo = paginateRows(rows, chequePage);
  chequePage = pageInfo.currentPage;
  table($("#chequeTable"), [
    { label: "Customer", key: "customer" },
    { label: "Mobile", key: "mobile" },
    { label: "Cheque No.", key: "chequeNo" },
    { label: "Cheque Date", key: "chequeDate" },
    { label: "Amount", key: "amount", num: true, render: r => money(r.amount) },
    { label: "Bank", key: "bank" },
    { label: "Response", key: "response", render: r => chequeStatusSelectMarkup(r) }
  ], pageInfo.rows, {
    onRender: bindChequeStatusSelectors
  });
  renderPagination($("#chequePagination"), pageInfo, page => {
    chequePage = page;
    renderCheques();
  });
}

function chequeStatusSelectMarkup(row) {
  return `<select data-cheque="${html(row.chequeNo)}" data-id="${row._id || ""}"><option ${row.response === "Pending" ? "selected" : ""}>Pending</option><option ${row.response === "Clear" ? "selected" : ""}>Clear</option><option ${row.response === "Return" ? "selected" : ""}>Return</option></select>`;
}

function bindChequeStatusSelectors(node) {
  $$("[data-cheque]", node).forEach(select => {
    select.addEventListener("change", async () => {
      if (select.disabled) return;
      select.disabled = true;
      try {
        if (apiAvailable && select.dataset.id) {
          await apiPatch("cheques", select.dataset.id, { response: select.value });
          const cheque = seed.cheques.find(row => row._id === select.dataset.id);
          if (cheque) cheque.response = select.value;
        } else {
          const before = { chequeNo: select.dataset.cheque, response: user.chequeOverrides[select.dataset.cheque] || "Pending" };
          user.chequeOverrides[select.dataset.cheque] = select.value;
          recordLocalAudit({
            action: "edit",
            collection: "cheques",
            before,
            after: { ...before, response: select.value },
            recordId: select.dataset.cheque
          });
          saveUser();
        }
        toast("Cheque status updated.");
        renderDashboard();
        renderChequeManagement();
      } finally {
        select.disabled = false;
      }
    });
  });
}

function outgoingChequeStatusSelectMarkup(row) {
  return `<select data-outgoing-cheque-status="${html(row._id || row.chequeNo)}"><option ${row.status === "Issued" ? "selected" : ""}>Issued</option><option ${row.status === "Presented" ? "selected" : ""}>Presented</option><option ${row.status === "Cleared" ? "selected" : ""}>Cleared</option><option ${row.status === "Cancelled" ? "selected" : ""}>Cancelled</option></select>`;
}

function findOutgoingChequeLocation(token) {
  const key = text(token);
  const userIndex = (user.outgoingCheques || []).findIndex(row => text(row._id || row.chequeNo) === key);
  if (userIndex >= 0) return { source: "user", index: userIndex };
  const seedIndex = (seed?.outgoingCheques || []).findIndex(row => text(row._id || row.chequeNo) === key);
  if (seedIndex >= 0) return { source: "seed", index: seedIndex };
  return null;
}

function bindOutgoingChequeTableActions(node) {
  $$("[data-outgoing-cheque-status]", node).forEach(select => {
    select.addEventListener("change", async () => {
      if (select.disabled) return;
      select.disabled = true;
      try {
        await updateOutgoingChequeStatus(select.dataset.outgoingChequeStatus, select.value);
      } finally {
        select.disabled = false;
      }
    });
  });
  $$("[data-print-outgoing-cheque]", node).forEach(button => {
    button.addEventListener("click", () => printOutgoingCheque(button.dataset.printOutgoingCheque));
  });
  $$("[data-delete-outgoing-cheque]", node).forEach(button => {
    button.addEventListener("click", () => {
      if (button.disabled || !ensureActionRowUnlocked("outgoingCheque", button.dataset.deleteOutgoingCheque)) return;
      withBusyControl(button, () => deleteOutgoingCheque(button.dataset.deleteOutgoingCheque), "Deleting...");
    });
  });
}

function printOutgoingCheque(token) {
  const location = findOutgoingChequeLocation(token);
  if (!location) return toast("Issued cheque not found.");
  const row = location.source === "seed" ? seed.outgoingCheques[location.index] : user.outgoingCheques[location.index];
  openOutgoingChequeVoucherWindow(null, row);
}

function outgoingChequeReceiptLink(row) {
  const token = html(row._id || row.chequeNo);
  const label = html(row.chequeNo);
  return `<button type="button" class="memo-bill-link" data-print-outgoing-cheque="${token}" title="Open cheque receipt">${label}</button>`;
}

async function updateOutgoingChequeStatus(token, status) {
  const location = findOutgoingChequeLocation(token);
  if (!location) return toast("Issued cheque not found.");
  const updates = { status, clearingDate: status === "Cleared" ? todayIso() : "" };
  if (location.source === "seed") {
    const row = seed.outgoingCheques[location.index];
    if (apiAvailable && row._id) {
      seed.outgoingCheques[location.index] = await apiPatch("outgoingCheques", row._id, updates);
    } else {
      const before = { ...row };
      seed.outgoingCheques[location.index] = { ...row, ...updates };
      recordLocalAudit({ action: "edit", collection: "outgoingCheques", before, after: seed.outgoingCheques[location.index] });
      saveUser();
    }
  } else {
    const before = { ...user.outgoingCheques[location.index] };
    user.outgoingCheques[location.index] = { ...user.outgoingCheques[location.index], ...updates };
    recordLocalAudit({ action: "edit", collection: "outgoingCheques", before, after: user.outgoingCheques[location.index] });
    saveUser();
  }
  toast("Issued cheque status updated.");
  renderDashboard();
  renderPaymentBalances();
  renderChequeManagement();
  renderSuppliers();
}

async function deleteOutgoingCheque(token) {
  const location = findOutgoingChequeLocation(token);
  if (!location) return toast("Issued cheque not found.");
  const row = location.source === "seed" ? seed.outgoingCheques[location.index] : user.outgoingCheques[location.index];
  if (!confirm(`Delete issued cheque ${row.chequeNo}?`)) return;
  if (location.source === "seed") {
    if (apiAvailable && row._id) await apiDelete("outgoingCheques", row._id);
    if (!apiAvailable) recordLocalAudit({ action: "delete", collection: "outgoingCheques", before: row });
    seed.outgoingCheques.splice(location.index, 1);
    if (!apiAvailable) saveUser();
  } else {
    recordLocalAudit({ action: "delete", collection: "outgoingCheques", before: row });
    user.outgoingCheques.splice(location.index, 1);
    saveUser();
  }
  toast("Issued cheque deleted.");
  renderDashboard();
  renderPaymentBalances();
  renderChequeManagement();
  renderSuppliers();
}

function chequeManagementBaseRows({ includeStatusFilter = true } = {}) {
  const q = text($("#chequeManagementSearch").value).toLowerCase();
  const status = text($("#chequeManagementStatus").value).toLowerCase();
  const bank = text($("#chequeManagementBank").value).toLowerCase();
  const { from, to } = tableDateRange("chequeManagementDateRangeMode", "chequeManagementFrom", "chequeManagementTo", "chequeManagementRangeMonth");
  return data.outgoingCheques().filter(row => {
    const hay = `${row.supplier} ${row.chequeNo} ${row.chequeDate} ${row.clearingDate} ${row.amount} ${row.bank} ${row.status} ${row.purpose}`.toLowerCase();
    return (!q || hay.includes(q))
      && (!includeStatusFilter || !status || text(row.status).toLowerCase() === status)
      && (!bank || text(row.bank).toLowerCase() === bank)
      && (!from || row.chequeDate >= from)
      && (!to || row.chequeDate <= to);
  }).slice().reverse();
}

function filteredChequeManagementRows() {
  const rows = chequeManagementBaseRows({ includeStatusFilter: chequeManagementActiveTab !== "issued" });
  return rows.filter(row => {
    const status = text(row.status).toLowerCase();
    return chequeManagementActiveTab === "issued" ? status === "issued" : status !== "issued";
  });
}

function renderChequeManagementTabs(rows) {
  const issuedCount = rows.filter(row => text(row.status).toLowerCase() === "issued").length;
  const otherCount = rows.length - issuedCount;
  $$("[data-cheque-management-tab]").forEach(button => {
    const count = button.dataset.chequeManagementTab === "issued" ? issuedCount : otherCount;
    button.classList.toggle("active", button.dataset.chequeManagementTab === chequeManagementActiveTab);
    button.textContent = button.dataset.chequeManagementTab === "issued"
      ? `Issued Cheque (${count})`
      : `All Others (${count})`;
  });
  const statusSelect = $("#chequeManagementStatus");
  if (statusSelect) statusSelect.disabled = chequeManagementActiveTab === "issued";
}

function renderChequeManagement() {
  syncTableDateRangeControls("chequeManagementDateRangeMode", "chequeManagementFrom", "chequeManagementTo");
  const summaryRows = chequeManagementBaseRows({ includeStatusFilter: false });
  const rows = filteredChequeManagementRows();
  const banks = [...new Set(data.outgoingCheques().map(row => text(row.bank)).filter(Boolean))].sort();
  const bankSelect = $("#chequeManagementBank");
  const selectedBank = bankSelect.value;
  bankSelect.innerHTML = `<option value="">All banks</option>${banks.map(bank => `<option ${selectedBank === bank ? "selected" : ""}>${html(bank)}</option>`).join("")}`;
  renderChequeManagementTabs(summaryRows);
  const total = summaryRows.reduce((sum, row) => sum + num(row.amount), 0);
  const issuedRows = summaryRows.filter(row => text(row.status).toLowerCase() === "issued");
  const presentedRows = summaryRows.filter(row => text(row.status).toLowerCase() === "presented");
  const clearedRows = summaryRows.filter(row => text(row.status).toLowerCase() === "cleared");
  $("#chequeManagementSummary").innerHTML = [
    ["Total cheques", summaryRows.length, money(total)],
    ["To be cleared", issuedRows.length, money(issuedRows.reduce((sum, row) => sum + num(row.amount), 0))],
    ["Presented", presentedRows.length, money(presentedRows.reduce((sum, row) => sum + num(row.amount), 0))],
    ["Cleared", clearedRows.length, money(clearedRows.reduce((sum, row) => sum + num(row.amount), 0))]
  ].map(([label, count, amount]) => `
    <article class="cheque-summary-card">
      <span>${label}</span>
      <strong>${count}</strong>
      <small>${amount}</small>
    </article>
  `).join("");
  const pageInfo = paginateRows(rows, chequeManagementPage);
  chequeManagementPage = pageInfo.currentPage;
  table($("#chequeManagementTable"), [
    { label: "Supplier", key: "supplier" },
    { label: "Cheque No.", key: "chequeNo", render: r => outgoingChequeReceiptLink(r) },
    { label: "Cheque Date", key: "chequeDate" },
    { label: "Clearing Date", key: "clearingDate" },
    { label: "Amount", key: "amount", num: true, render: r => money(r.amount) },
    { label: "Bank", key: "bank" },
    { label: "Status", key: "status", render: r => outgoingChequeStatusSelectMarkup(r) },
    { label: "Purpose", key: "purpose" },
    { label: "Action", key: "action", render: r => `
      <div class="ledger-actions">
        <button type="button" class="symbol-btn edit-symbol" data-print-outgoing-cheque="${html(r._id || r.chequeNo)}" title="Print cheque receipt" aria-label="Print cheque receipt">&#128438;</button>
        ${rowUnlockButton("outgoingCheque", r._id || r.chequeNo)}
        <button type="button" class="symbol-btn delete-symbol" data-delete-outgoing-cheque="${html(r._id || r.chequeNo)}" title="Delete cheque" aria-label="Delete cheque"${actionControlAttrs("outgoingCheque", r._id || r.chequeNo, "Delete cheque")}>&#128465;</button>
      </div>
    ` }
  ], pageInfo.rows, {
    onRender: bindOutgoingChequeTableActions
  });
  renderPagination($("#chequeManagementPagination"), pageInfo, page => {
    chequeManagementPage = page;
    renderChequeManagement();
  });
}

