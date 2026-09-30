function financialYearFor(date = todayIso()) {
  const value = dateOnly(date) || todayIso();
  const year = Number(value.slice(0, 4));
  return Number(value.slice(5, 7)) >= 4 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}

function financialYearEnd(fy) {
  const start = Number(text(fy).slice(0, 4));
  return `${start + 1}-03-31`;
}

function availableFinancialYears() {
  const years = new Set([financialYearFor()]);
  [...data.purchases(), ...data.dues(), ...data.outgoingCheques()].forEach(row => {
    const date = row.date || row.chequeDate;
    if (date) years.add(financialYearFor(date));
  });
  data.manualCreditors().forEach(row => row.fy && years.add(row.fy));
  data.manualChartAccounts().forEach(row => row.fy && years.add(row.fy));
  return [...years].sort().reverse();
}

function creditorBalancesAt(fy) {
  const end = financialYearEnd(fy);
  const balances = new Map();
  const add = (party, amount) => {
    const name = text(party) || "Unknown supplier";
    const current = balances.get(name.toLowerCase()) || { party: name, balance: 0 };
    current.balance += num(amount);
    balances.set(name.toLowerCase(), current);
  };
  // Start with the supplier master so suppliers with no activity (or a settled
  // balance) are still visible in the Creditor List.
  data.suppliers().forEach(row => add(row.name, 0));
  data.purchases().filter(row => row.date && row.date <= end).forEach(row => add(row.supplier, num(row.amount) - num(row.paid)));
  data.supplierOpeningBalances().filter(row => row.openingDate && row.openingDate <= end).forEach(row => add(row.supplier, row.amount));
  data.outgoingCheques().filter(row => row.chequeDate && row.chequeDate <= end && text(row.status).toLowerCase() !== "cancelled").forEach(row => add(row.supplier, -num(row.amount)));
  data.manualCreditors().filter(row => row.fy === fy).forEach(row => add(row.party, row.balance));
  return [...balances.values()].sort((a, b) => b.balance - a.balance || a.party.localeCompare(b.party));
}

function debtorBalancesAt(fy) {
  const end = financialYearEnd(fy);
  const balances = new Map();
  data.dues().filter(row => row.date && row.date <= end).forEach(row => {
    const party = text(row.name) || "Unknown customer";
    const current = balances.get(party.toLowerCase()) || { party, balance: 0 };
    current.balance += num(row.due) - num(row.paid);
    balances.set(party.toLowerCase(), current);
  });
  return [...balances.values()].filter(row => row.balance > 0.004).sort((a, b) => b.balance - a.balance || a.party.localeCompare(b.party));
}

function appendAccountsTableTotal(tableNode, label, amount, labelColspan = 2, amountColspan = 1) {
  tableNode.insertAdjacentHTML("beforeend", `
    <tfoot>
      <tr class="ledger-total-row">
        <td colspan="${labelColspan}">${html(label)}</td>
        <td class="num" colspan="${amountColspan}">${money(amount)}</td>
      </tr>
    </tfoot>
  `);
}

function renderAccountsManager() {
  const select = $("#accountsFy");
  const selected = select.value || financialYearFor();
  const years = availableFinancialYears();
  select.innerHTML = years.map(fy => `<option value="${fy}" ${fy === selected ? "selected" : ""}>FY ${fy}</option>`).join("");
  const fy = select.value || years[0];
  const creditors = creditorBalancesAt(fy);
  const debtors = debtorBalancesAt(fy);
  table($("#creditorTable"), [
    { label: "Sl No.", key: "sl", num: true },
    { label: "Party name (Creditor)", key: "party" },
    { label: `Balance available as 31st March ${financialYearEnd(fy).slice(0, 4)}`, key: "balance", num: true, render: row => row.balance > 0 ? `<button type="button" class="accounts-balance-link" data-creditor-ledger="${html(encodeURIComponent(row.party))}">${money(row.balance)}</button>` : "—" },
    { label: "Negative Balance", key: "negativeBalance", num: true, render: row => row.balance < 0 ? `<button type="button" class="accounts-balance-link" data-creditor-ledger="${html(encodeURIComponent(row.party))}">${money(Math.abs(row.balance))}</button>` : "—" }
  ], creditors.map((row, index) => ({ ...row, sl: index + 1 })), { onRender: bindCreditorLedgerLinks });
  const positiveCreditorTotal = creditors.reduce((sum, row) => sum + Math.max(row.balance, 0), 0);
  const negativeCreditorTotal = creditors.reduce((sum, row) => sum + Math.abs(Math.min(row.balance, 0)), 0);
  $("#creditorTable").insertAdjacentHTML("beforeend", `<tfoot><tr class="ledger-total-row"><td colspan="2">Total creditors</td><td class="num">${money(positiveCreditorTotal)}</td><td class="num">${money(negativeCreditorTotal)}</td></tr></tfoot>`);
  table($("#debtorTable"), [
    { label: "Sl No.", key: "sl", num: true }, { label: "Party name (Debtor)", key: "party" }, { label: "Balance receivable", key: "balance", num: true, render: row => money(row.balance) }
  ], debtors.map((row, index) => ({ ...row, sl: index + 1 })));
  appendAccountsTableTotal($("#debtorTable"), "Total debtors", debtors.reduce((sum, row) => sum + row.balance, 0));
  const creditorTotal = creditors.reduce((sum, row) => sum + row.balance, 0);
  const debtorTotal = debtors.reduce((sum, row) => sum + row.balance, 0);
  $("#balanceSheetSummary").innerHTML = `<div><span>Total debtors (assets)</span><strong>${money(debtorTotal)}</strong></div><div><span>Total creditors (liabilities)</span><strong>${money(creditorTotal)}</strong></div><div><span>Net working balance</span><strong>${money(debtorTotal - creditorTotal)}</strong></div><div><span>Closing date</span><strong>31 March ${financialYearEnd(fy).slice(0, 4)}</strong></div>`;
  const manualRows = data.manualCreditors().filter(row => row.fy === fy);
  table($("#manualCreditorTable"), [{ label: "Party", key: "party" }, { label: "Balance", key: "balance", num: true, render: row => money(row.balance) }, { label: "Action", key: "action", render: row => `<button type="button" class="secondary" data-delete-manual-creditor="${html(row.id)}">Remove</button>` }], manualRows, { onRender: bindManualCreditorActions });
  appendAccountsTableTotal($("#manualCreditorTable"), "Total manual creditors", manualRows.reduce((sum, row) => sum + row.balance, 0), 1, 2);
}

function bindCreditorLedgerLinks(node) {
  $$('[data-creditor-ledger]', node).forEach(button => button.addEventListener("click", () => openSupplierLedger(decodeURIComponent(button.dataset.creditorLedger))));
}

function bindManualCreditorActions(node) {
  $$('[data-delete-manual-creditor]', node).forEach(button => button.addEventListener("click", () => {
    deleteAccountsRecord("manualCreditors", button.dataset.deleteManualCreditor).then(() => {
      renderAccountsManager(); toast("Manual creditor removed.");
    });
  }));
}

function bindAccountsManager() {
  $("#accountsFy")?.addEventListener("change", renderAccountsManager);
  $$('[data-accounts-print]').forEach(button => button.addEventListener("click", () => printAccountsCard(button.dataset.accountsPrint)));
  $("#manualCreditorForm")?.addEventListener("submit", withBusySubmit(async event => {
    event.preventDefault();
    const form = event.currentTarget;
    await saveAccountsRecord("manualCreditors", { entryId: `manual-creditor-${Date.now()}`, party: text(form.party.value), balance: num(form.balance.value), fy: $("#accountsFy").value || financialYearFor() });
    form.reset(); renderAccountsManager(); toast("Manual creditor balance added.");
  }, "Adding..."));
  $("#chartAccountsFy")?.addEventListener("change", renderChartAccounts);
  $("#printChartAccountsBtn")?.addEventListener("click", withBusyClick(printChartAccounts, "Preparing..."));
  $("#manualCreditForm")?.addEventListener("submit", withBusySubmit(event => saveManualChartAccount(event, "credit"), "Adding..."));
  $("#manualDebitForm")?.addEventListener("submit", withBusySubmit(event => saveManualChartAccount(event, "debit"), "Adding..."));
}

function printAccountsCard(card) {
  const details = {
    creditors: { title: "Creditor List", content: $("#creditorTable")?.outerHTML },
    debtors: { title: "Debtor List", content: $("#debtorTable")?.outerHTML },
    balanceSheet: { title: "Balance Sheet", content: $("#balanceSheetSummary")?.outerHTML },
    manualCreditors: { title: "Manual Creditor List", content: $("#manualCreditorTable")?.outerHTML }
  }[card];
  if (!details?.content) return;
  const fy = $("#accountsFy")?.value || financialYearFor();
  const popup = window.open("", "_blank");
  if (!popup) return toast("Please allow popups to print this report.");
  popup.document.write(`<!doctype html><html><head><title>${html(details.title)} - FY ${html(fy)}</title><style>body{font-family:Arial;padding:24px;color:#111827}h1,p{margin:0}p{margin:6px 0 18px;color:#4b5563}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #cbd5e1;text-align:left;font-size:12px}.num{text-align:right}tfoot{font-weight:700;background:#f8fafc}.accounts-summary{max-width:620px}.accounts-summary div{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #cbd5e1}.accounts-summary strong{font-size:16px}button{display:none}@media print{body{padding:0}@page{margin:12mm}}</style></head><body><h1>${html(details.title)}</h1><p>Financial Year: FY ${html(fy)}</p>${details.content}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

function chartRowsForSide(fy, side) {
  const start = `${text(fy).slice(0, 4)}-04-01`;
  const end = financialYearEnd(fy);
  const records = new Map();
  const add = (particular, amount, source = "Cashbook") => {
    if (num(amount) <= 0) return;
    const label = text(particular) || "Uncategorised";
    const row = records.get(label.toLowerCase()) || { particular: label, amount: 0, source };
    row.amount += num(amount);
    if (row.source !== source) row.source = "Cashbook + Manual";
    records.set(label.toLowerCase(), row);
  };
  data.transactions().filter(row => row.date >= start && row.date <= end).forEach(row => {
    if (side === "debit") add(row.head, row.expense);
    else add(row.head, num(row.cash) + num(row.bank) + num(row.bajaj));
  });
  data.manualChartAccounts().filter(row => row.fy === fy && row.side === side).forEach(row => add(row.particular, row.amount, "Manual"));
  return [...records.values()].sort((a, b) => b.amount - a.amount || a.particular.localeCompare(b.particular));
}

function renderChartAccountTable(node, rows, side, fy) {
  table(node, [
    { label: "Particulars", key: "particular" },
    { label: side === "credit" ? "Credit" : "Debit", key: "amount", num: true, render: row => `<button type="button" class="accounts-balance-link" data-chart-account-detail="${html(encodeURIComponent(row.particular))}" data-chart-account-side="${side}" data-chart-account-fy="${html(fy)}">${money(row.amount)}</button>` },
    { label: "Source", key: "source", render: row => row.source || "Manual" }
  ], rows, { onRender: bindChartAccountDetailLinks });
  appendAccountsTableTotal(node, `Total ${side === "credit" ? "credits" : "debits"}`, rows.reduce((sum, row) => sum + row.amount, 0));
}

function renderChartAccounts() {
  const select = $("#chartAccountsFy");
  const selected = select.value || $("#accountsFy")?.value || financialYearFor();
  const years = availableFinancialYears();
  select.innerHTML = years.map(fy => `<option value="${fy}" ${fy === selected ? "selected" : ""}>FY ${fy}</option>`).join("");
  const fy = select.value || years[0];
  const credits = chartRowsForSide(fy, "credit");
  const debits = chartRowsForSide(fy, "debit");
  renderChartAccountTable($("#chartCreditTable"), credits, "credit", fy);
  renderChartAccountTable($("#chartDebitTable"), debits, "debit", fy);
  $("#chartCreditTotal").textContent = money(credits.reduce((sum, row) => sum + row.amount, 0));
  $("#chartDebitTotal").textContent = money(debits.reduce((sum, row) => sum + row.amount, 0));
}

let chartAccountDetail = null;

function bindChartAccountDetailLinks(node) {
  $$('[data-chart-account-detail]', node).forEach(button => button.addEventListener("click", () => {
    chartAccountDetail = {
      particular: decodeURIComponent(button.dataset.chartAccountDetail),
      side: button.dataset.chartAccountSide,
      fy: button.dataset.chartAccountFy
    };
    showView("chartAccountDetails");
  }));
}

function chartAccountDetailRows({ particular, side, fy }) {
  const start = `${text(fy).slice(0, 4)}-04-01`;
  const end = financialYearEnd(fy);
  const key = text(particular).toLowerCase();
  const transactionRows = data.transactions()
    .filter(row => row.date >= start && row.date <= end && text(row.head).toLowerCase() === key)
    .map(row => ({
      date: row.date,
      reference: row.memo || row.party || "Transaction",
      details: row.remark || row.type || "Cashbook entry",
      amount: side === "credit" ? num(row.cash) + num(row.bank) + num(row.bajaj) : num(row.expense),
      source: "Cashbook"
    }))
    .filter(row => row.amount > 0);
  const manualRows = data.manualChartAccounts()
    .filter(row => row.fy === fy && row.side === side && text(row.particular).toLowerCase() === key && num(row.amount) > 0)
    .map(row => ({ date: "", reference: "Manual entry", details: row.particular, amount: num(row.amount), source: "Manual" }));
  return [...transactionRows, ...manualRows].sort((a, b) => text(b.date).localeCompare(text(a.date)) || a.reference.localeCompare(b.reference));
}

function renderChartAccountDetails() {
  if (!chartAccountDetail) {
    showView("chartAccounts");
    return;
  }
  const { particular, side, fy } = chartAccountDetail;
  const rows = chartAccountDetailRows(chartAccountDetail);
  $("#chartAccountDetailTitle").textContent = `${particular} — ${side === "credit" ? "Credit" : "Debit"} Details`;
  $("#chartAccountDetailSubtitle").textContent = `FY ${fy}: entries included in the selected Chart of Accounts amount.`;
  table($("#chartAccountDetailTable"), [
    { label: "Date", key: "date" },
    { label: "Reference", key: "reference" },
    { label: "Details", key: "details" },
    { label: side === "credit" ? "Credit" : "Debit", key: "amount", num: true, render: row => money(row.amount) },
    { label: "Source", key: "source" }
  ], rows);
  appendAccountsTableTotal($("#chartAccountDetailTable"), `Total ${side === "credit" ? "credits" : "debits"}`, rows.reduce((sum, row) => sum + row.amount, 0), 4, 1);
}

async function saveManualChartAccount(event, side) {
  event.preventDefault();
  const form = event.currentTarget;
  await saveAccountsRecord("manualChartAccounts", {
    entryId: `manual-chart-${Date.now()}`,
    particular: text(form.particular.value),
    amount: num(form.amount.value),
    side,
    fy: $("#chartAccountsFy").value || financialYearFor()
  });
  form.reset();
  renderChartAccounts();
  toast(`Manual ${side} entry added.`);
}

function printChartAccounts() {
  const fy = $("#chartAccountsFy").value || financialYearFor();
  const credits = chartRowsForSide(fy, "credit");
  const debits = chartRowsForSide(fy, "debit");
  const makeTable = (rows, label) => `<table><thead><tr><th>Particulars</th><th class="num">${label}</th><th>Source</th></tr></thead><tbody>${rows.map(row => `<tr><td>${html(row.particular)}</td><td class="num">${money(row.amount)}</td><td>${html(row.source || "Manual")}</td></tr>`).join("") || `<tr><td colspan="3">No records found.</td></tr>`}</tbody><tfoot><tr><td colspan="2">Total ${label}s</td><td class="num">${money(rows.reduce((sum, row) => sum + row.amount, 0))}</td></tr></tfoot></table>`;
  const popup = window.open("", "_blank");
  if (!popup) return toast("Please allow popups to print the Chart of Accounts.");
  popup.document.write(`<!doctype html><html><head><title>Chart of Accounts FY ${html(fy)}</title><style>body{font-family:Arial;padding:24px;color:#111827}.bar{text-align:right;margin-bottom:14px}button{padding:8px 12px;background:#165f4c;color:#fff;border:0;border-radius:4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}h1,p,h2{margin:0}p{margin:6px 0 18px;color:#4b5563}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #cbd5e1;text-align:left;font-size:12px}.num{text-align:right}tfoot{font-weight:700;background:#f8fafc}@media print{body{padding:0}.bar{display:none}@page{size:landscape;margin:10mm}}</style></head><body><div class="bar"><button onclick="window.print()">Print</button></div><h1>Chart of Accounts</h1><p>Financial Year: FY ${html(fy)}</p><div class="grid"><section><h2>Income (Credits)</h2>${makeTable(credits, "Credit")}</section><section><h2>Expense (Debits)</h2>${makeTable(debits, "Debit")}</section></div></body></html>`);
  popup.document.close();
  popup.focus();
}

async function saveAccountsRecord(collection, record) {
  if (apiAvailable) {
    const saved = await apiCreate(collection, record);
    seed[collection] = seed[collection] || [];
    seed[collection].push(saved);
  } else {
    user[collection] = user[collection] || [];
    user[collection].push(record);
    saveUser();
  }
  invalidateDataCache();
}

async function deleteAccountsRecord(collection, entryId) {
  const row = data[collection]().find(item => item.id === entryId);
  if (apiAvailable && row?._id) {
    await apiDelete(collection, row._id);
    seed[collection] = (seed[collection] || []).filter(item => text(item._id) !== row._id);
  } else {
    user[collection] = (user[collection] || []).filter(item => text(item.entryId ?? item.id) !== entryId);
    saveUser();
  }
  invalidateDataCache();
}
