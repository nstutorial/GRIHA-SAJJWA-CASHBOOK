const CASHBOOK_BANK_ACCOUNTS_KEY = "cashbookBankAccounts";
const CASHBOOK_OPENINGS_KEY = "cashbookOpeningBalances";
let cashbookRangeInitialized = false;
let cashbookStatementRows = [];

function cashbookBankAccounts() {
  const saved = getSettingValue(CASHBOOK_BANK_ACCOUNTS_KEY);
  if (Array.isArray(saved) && saved.length) {
    const accounts = saved.map((account, index) => ({ ...account, id: text(account.id) || `bank-${index + 1}`, name: text(account.name) || text(account.bankName) || `Bank account ${index + 1}` }));
    const defaultId = text(getSettingValue("cashbookDefaultBankAccountId"));
    return [accounts.find(account => account.id === defaultId) || accounts[0]];
  }
  const paymentAccount = getSettingValue("accountDetails") || {};
  const id = text(getSettingValue("cashbookDefaultBankAccountId")) || "main-bank";
  return [{ ...paymentAccount, id, name: text(paymentAccount.name) || text(paymentAccount.bankName) || "Main Bank" }];
}

function cashbookDefaultBankAccountId() {
  const accounts = cashbookBankAccounts();
  const savedId = text(getSettingValue("cashbookDefaultBankAccountId"));
  return accounts.some(account => account.id === savedId) ? savedId : text(accounts[0]?.id);
}

function cashbookAccountById(id) {
  const key = text(id);
  const active = cashbookBankAccounts().find(account => account.id === key);
  if (active) return active;
  const saved = getSettingValue(CASHBOOK_BANK_ACCOUNTS_KEY);
  if (Array.isArray(saved)) return saved.find(account => text(account.id) === key) || null;
  return null;
}

function renderCashbookBankAccountSelects(preferredAccountId = "") {
  const accounts = cashbookBankAccounts();
  document.querySelectorAll('select[name="bankAccountId"]').forEach(select => {
    const currentSelection = select.value;
    const selected = select.dataset.preserveSelection === "true" ? currentSelection : "";
    const isEdit = select.closest("#transactionEditForm");
    const options = accounts.map(account => `<option value="${html(account.id)}">${html(account.name)}</option>`).join("");
    const isReceiptAccount = select.closest("#receiptForm") || select.closest("#paymentForm");
    select.innerHTML = `${isEdit ? `<option value="">Unassigned / legacy online</option>` : isReceiptAccount ? `<option value="">Select receiving account</option>` : ""}${options}`;
    if (preferredAccountId && accounts.some(account => account.id === preferredAccountId) && isReceiptAccount) select.value = preferredAccountId;
    else if (selected && accounts.some(account => account.id === selected)) select.value = selected;
    else if (isEdit) select.value = "";
    else if (isReceiptAccount) select.value = cashbookDefaultBankAccountId();
    else if (accounts.length) select.value = cashbookDefaultBankAccountId();
    select.dataset.preserveSelection = "true";
  });
  const reconcileSelect = $("#cashbookReconcileAccount");
  if (reconcileSelect) {
    const selectedId = reconcileSelect.value || cashbookDefaultBankAccountId();
    reconcileSelect.innerHTML = cashbookBankAccounts().map(account => `<option value="${html(account.id)}">${html(account.name)}</option>`).join("");
    reconcileSelect.value = cashbookBankAccounts().some(account => account.id === selectedId) ? selectedId : cashbookDefaultBankAccountId();
    if (!cashbookStatementRows.length) loadReconciliationStatement(reconcileSelect.value);
  }
}

function parseBankCsv(source) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"' && quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); if (row.some(value => value !== "")) rows.push(row); }
  if (rows.length < 2) return [];
  const headers = rows.shift().map(value => value.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const find = names => headers.findIndex(header => names.includes(header));
  const dateIndex = find(["date", "transactiondate", "valuedate"]);
  const descIndex = find(["description", "particulars", "narration", "details", "remark"]);
  const amountIndex = find(["amount", "transactionamount"]);
  const debitIndex = find(["debit", "withdrawal", "withdrawals"]);
  const creditIndex = find(["credit", "deposit", "deposits"]);
  if (dateIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) return [];
  const parseAmount = value => Number(String(value || "").replace(/[₹,\s]/g, "")) || 0;
  const parseDate = value => {
    const raw = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (!match) return "";
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
  };
  return rows.map((cells, index) => {
    const debit = debitIndex >= 0 ? parseAmount(cells[debitIndex]) : 0;
    const credit = creditIndex >= 0 ? parseAmount(cells[creditIndex]) : 0;
    const rawAmount = amountIndex >= 0 ? parseAmount(cells[amountIndex]) : 0;
    return { id: `statement-${index}`, date: parseDate(cells[dateIndex]), description: descIndex >= 0 ? cells[descIndex] || "" : "", amount: credit || debit || Math.abs(rawAmount), direction: credit || (!debit && rawAmount >= 0) ? "credit" : "debit" };
  }).filter(row => row.date && row.amount > 0);
}

function reconcileBankStatement(rows) {
  const accountId = text($("#cashbookReconcileAccount")?.value);
  const { labels } = cashbookAccountMap();
  const legs = data.transactions().filter(row => text(row.bankAccountId) === accountId).flatMap(row => cashbookMovementLegs(row, labels)).filter(row => row.channel === "Online");
  const used = new Set();
  const result = rows.map(row => {
    const targetDirection = row.direction;
    const candidates = legs.map((leg, index) => ({ leg, index })).filter(({ leg, index }) => !used.has(index) && leg.direction === targetDirection && Math.abs(leg.amount - row.amount) < 0.01 && leg.date === row.date);
    if (candidates.length === 1) { used.add(candidates[0].index); return { ...row, status: "Matched", cashbook: candidates[0].leg.memo || candidates[0].leg.party }; }
    return { ...row, status: candidates.length > 1 ? "Multiple matches" : "Unmatched", cashbook: candidates.length > 1 ? `${candidates.length} candidates` : "—" };
  });
  const matched = result.filter(row => row.status === "Matched").length;
  const totalCredit = result.filter(row => row.direction === "credit").reduce((sum, row) => sum + num(row.amount), 0);
  const totalDebit = result.filter(row => row.direction === "debit").reduce((sum, row) => sum + num(row.amount), 0);
  const statusFilter = text($("#cashbookStatementStatusFilter")?.value) || "all";
  const directionFilter = text($("#cashbookStatementDirectionFilter")?.value) || "all";
  const search = text($("#cashbookStatementSearch")?.value).toLowerCase();
  const filtered = result.filter(row => (statusFilter === "all" || row.status === statusFilter)
    && (directionFilter === "all" || row.direction === directionFilter)
    && (!search || `${row.description} ${row.cashbook} ${row.status} ${row.date} ${row.amount}`.toLowerCase().includes(search)));
  $("#cashbookReconcileSummary").textContent = `${matched} matched · ${result.length - matched} need review · ${result.length} statement rows · Total credit ${money2(totalCredit)} · Total debit ${money2(totalDebit)}${filtered.length !== result.length ? ` · showing ${filtered.length}` : ""}`;
  table($("#cashbookReconcileTable"), [
    { label: "Date", key: "date" }, { label: "Description", key: "description" },
    { label: "Credit", key: "credit", num: true, render: row => row.direction === "credit" ? money2(row.amount) : "—" },
    { label: "Debit", key: "debit", num: true, render: row => row.direction === "debit" ? money2(row.amount) : "—" },
    { label: "Cashbook match", key: "cashbook" }, { label: "Status", key: "status", render: row => `<strong class="cashbook-match-${row.status === "Matched" ? "yes" : "no"}">${html(row.status)}</strong>` }
  ], filtered);
  const tableNode = $("#cashbookReconcileTable");
  const visibleCredit = filtered.filter(row => row.direction === "credit").reduce((sum, row) => sum + num(row.amount), 0);
  const visibleDebit = filtered.filter(row => row.direction === "debit").reduce((sum, row) => sum + num(row.amount), 0);
  tableNode.insertAdjacentHTML("beforeend", `<tfoot><tr><th colspan="2">Visible total (${filtered.length} rows)</th><th class="num">${money2(visibleCredit)}</th><th class="num">${money2(visibleDebit)}</th><th colspan="2"></th></tr></tfoot>`);

  const dailyGroups = new Map();
  filtered.forEach(row => {
    const day = dailyGroups.get(row.date) || { date: row.date, credits: 0, debits: 0, rows: 0 };
    if (row.direction === "credit") day.credits += num(row.amount);
    else day.debits += num(row.amount);
    day.rows += 1;
    dailyGroups.set(row.date, day);
  });
  const dailyRows = [...dailyGroups.values()].sort((a, b) => b.date.localeCompare(a.date));
  const dailyTable = $("#cashbookStatementDailyTable");
  const dateDetails = dailyRows.map((day, index) => {
    const dayId = `cashbook-statement-day-${index}`;
    const transactions = filtered.filter(row => row.date === day.date).map(row => `<tr><td>${html(row.date)}</td><td>${html(row.description)}</td><td class="num">${row.direction === "credit" ? money2(row.amount) : "—"}</td><td class="num">${row.direction === "debit" ? money2(row.amount) : "—"}</td><td>${html(row.cashbook)}</td><td>${html(row.status)}</td></tr>`).join("");
    return `<tr class="cashbook-day-summary-row"><td><button type="button" class="cashbook-day-toggle" aria-expanded="false" aria-controls="${dayId}" data-cashbook-day-toggle><span class="cashbook-day-arrow" aria-hidden="true">▸</span><span class="cashbook-day-date">${html(day.date)}</span></button></td><td class="num">${money2(day.credits)}</td><td class="num">${money2(day.debits)}</td><td class="num">${money2(day.credits - day.debits)}</td><td class="num">${day.rows}</td></tr><tr id="${dayId}" class="cashbook-day-detail-row" hidden><td colspan="5"><div class="cashbook-day-detail-wrap"><table><thead><tr><th>Date</th><th>Description</th><th class="num">Credit</th><th class="num">Debit</th><th>Cashbook match</th><th>Status</th></tr></thead><tbody>${transactions}</tbody></table></div></td></tr>`;
  }).join("");
  dailyTable.innerHTML = `<thead><tr><th>Date · expand for transactions</th><th class="num">Credit</th><th class="num">Debit</th><th class="num">Net (Credit − Debit)</th><th class="num">Transactions</th></tr></thead><tbody>${dateDetails || `<tr><td colspan="5">No records found</td></tr>`}</tbody><tfoot><tr><th>Grand total (${filtered.length} rows · ${dailyRows.length} days)</th><th class="num">${money2(visibleCredit)}</th><th class="num">${money2(visibleDebit)}</th><th class="num">${money2(visibleCredit - visibleDebit)}</th><th class="num">${filtered.length}</th></tr></tfoot>`;
  dailyTable.querySelectorAll("[data-cashbook-day-toggle]").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const details = document.getElementById(toggle.getAttribute("aria-controls"));
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.querySelector("span").textContent = expanded ? "▸" : "▾";
      details.hidden = expanded;
    });
  });
}

async function saveReconciliationStatement(accountId, rows) {
  const saved = getSettingValue("cashbookReconciliationStatements") || {};
  saved[accountId] = { rows, importedAt: new Date().toISOString() };
  await saveSettingValue("cashbookReconciliationStatements", saved);
}

function loadReconciliationStatement(accountId) {
  if (!accountId) return;
  const saved = getSettingValue("cashbookReconciliationStatements") || {};
  cashbookStatementRows = Array.isArray(saved[accountId]?.rows) ? saved[accountId].rows : [];
  reconcileBankStatement(cashbookStatementRows);
}

async function clearReconciliationStatement() {
  const accountId = text($("#cashbookReconcileAccount")?.value);
  if (!accountId) return;
  const saved = getSettingValue("cashbookReconciliationStatements") || {};
  delete saved[accountId];
  await saveSettingValue("cashbookReconciliationStatements", saved);
  cashbookStatementRows = [];
  $("#cashbookStatementFile").value = "";
  reconcileBankStatement([]);
  toast("Saved bank statement cleared.");
}

function cashbookOpeningSnapshots() {
  const value = getSettingValue(CASHBOOK_OPENINGS_KEY);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cashbookOpeningFor(date) {
  const saved = cashbookOpeningSnapshots()[date] || {};
  return { cash: num(saved.cash), banks: saved.banks && typeof saved.banks === "object" ? saved.banks : {} };
}

function cashbookPreviousDate(date) {
  const previous = new Date(`${date}T00:00:00`);
  previous.setDate(previous.getDate() - 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
}

function cashbookOpeningAt(date) {
  const snapshots = cashbookOpeningSnapshots();
  const baseDate = Object.keys(snapshots).filter(day => day <= date).sort().pop() || "";
  const base = baseDate ? cashbookOpeningFor(baseDate) : { cash: 0, banks: {} };
  const opening = { cash: base.cash, banks: { ...base.banks } };
  const { labels } = cashbookAccountMap();
  data.transactions()
    .filter(row => (!baseDate || row.date > baseDate) && row.date < date)
    .flatMap(row => cashbookMovementLegs(row, labels))
    .forEach(leg => {
      if (leg.accountId === "cash") opening.cash += leg.direction === "credit" ? leg.amount : -leg.amount;
      else opening.banks[leg.accountId] = num(opening.banks[leg.accountId]) + (leg.direction === "credit" ? leg.amount : -leg.amount);
    });
  return opening;
}

function cashbookDateRange() {
  return { from: $("#cashbookFrom")?.value || todayIso(), to: $("#cashbookTo")?.value || todayIso() };
}

function cashbookAccountMap(transactions = data.transactions()) {
  const accounts = cashbookBankAccounts();
  const labels = new Map(accounts.map(account => [account.id, account.name]));
  transactions.forEach(row => {
    if (row.bankAccountId && !labels.has(row.bankAccountId)) {
      const name = `Bank account (${row.bankAccountId})`;
      labels.set(row.bankAccountId, name);
      accounts.push({ id: row.bankAccountId, name });
    }
  });
  return { accounts, labels };
}

function renderCashbookOpeningInputs(reload = false) {
  const node = $("#cashbookOpeningBalances");
  if (!node) return;
  const { from } = cashbookDateRange();
  const { accounts } = cashbookAccountMap();
  const openingValues = cashbookOpeningAt(from);
  const hasUnassigned = num(openingValues.banks.unassigned) !== 0 || data.transactions().some(row => Math.abs(num(row.bank)) > 0 && !row.bankAccountId);
  const openingDate = cashbookPreviousDate(from);
  const label = $("#cashbookOpeningDateLabel");
  if (label) label.textContent = `Opening balances at close of ${openingDate} (before ${from})`;
  node.innerHTML = [
    `<div class="cashbook-opening-card"><span>Cash opening balance</span><strong>${money2(openingValues.cash)}</strong></div>`,
    ...accounts.map(account => `<div class="cashbook-opening-card"><span>${html(account.name)} opening balance</span><strong>${money2(num(openingValues.banks[account.id]))}</strong></div>`),
    ...(hasUnassigned ? [`<div class="cashbook-opening-card"><span>Unassigned online opening balance</span><strong>${money2(num(openingValues.banks.unassigned))}</strong><small>Older transactions without an account assignment</small></div>`] : [])
  ].join("");
}

function cashbookMovementLegs(row, accountLabels) {
  const head = text(row.head) || text(row.type) || "Unspecified head";
  const type = text(row.type).toLowerCase();
  if (head.toLowerCase() === "due" || type === "staff due") return [];
  const isTransfer = head.toLowerCase() === "balance transfer" || type.includes(" to bank") || type.includes("bank to cash");
  const expense = Math.max(num(row.expense), 0);
  const bank = Math.max(num(row.bank), 0);
  const cashDelta = isTransfer ? num(row.cash) : expense > 0 ? -Math.max(expense - Math.min(expense, bank), 0) : num(row.cash);
  const onlineDelta = isTransfer ? num(row.bank) : expense > 0 ? -Math.min(expense, bank) : num(row.bank);
  const bankId = text(row.bankAccountId) || "unassigned";
  const accountName = bankId === "unassigned" ? "Unassigned online" : accountLabels.get(bankId) || `Bank account (${bankId})`;
  const common = { date: text(row.date), head, memo: text(row.memo), party: text(row.party) || text(row.remark) || "—", remark: text(row.remark), transfer: isTransfer };
  return [
    ...(cashDelta ? [{ ...common, channel: "Cash", accountId: "cash", accountName: "Cash", amount: Math.abs(cashDelta), direction: cashDelta > 0 ? "credit" : "debit" }] : []),
    ...(onlineDelta ? [{ ...common, channel: "Online", accountId: bankId, accountName, amount: Math.abs(onlineDelta), direction: onlineDelta > 0 ? "credit" : "debit" }] : [])
  ];
}

function cashbookGroupedMarkup(rows, direction) {
  if (!rows.length) return `<div class="cashbook-empty">No ${direction === "credit" ? "credits" : "debits"} in this date range.</div>`;
  const groups = new Map();
  rows.forEach(row => {
    const group = groups.get(row.head) || { head: row.head, amount: 0, rows: [] };
    group.amount += row.amount;
    group.rows.push(row);
    groups.set(row.head, group);
  });
  return [...groups.values()].sort((a, b) => a.head.localeCompare(b.head)).map(group => {
    group.rows.sort((a, b) => a.date.localeCompare(b.date) || a.memo.localeCompare(b.memo));
    const details = group.rows.map(row => `<tr><td>${html(row.date)}</td><td>${html(row.memo)}</td><td>${html(row.party)}</td><td>${html(row.channel)}${row.channel === "Online" ? ` · ${html(row.accountName)}` : ""}</td><td class="num">${money2(row.amount)}</td><td>${html(row.remark)}</td></tr>`).join("");
    return `<details class="cashbook-head-group"><summary><span class="cashbook-group-title">${html(group.head)}</span><span class="cashbook-group-total">${group.rows.length} entries · ${money2(group.amount)}</span></summary><div class="cashbook-group-table"><table><thead><tr><th>Date</th><th>Voucher</th><th>Particulars</th><th>Account</th><th>Amount</th><th>Remarks</th></tr></thead><tbody>${details}</tbody><tfoot><tr><th colspan="4">Head total</th><th class="num">${money2(group.amount)}</th><th></th></tr></tfoot></table></div></details>`;
  }).join("");
}

function cashbookBalanceCard(label, value) {
  return `<div class="cashbook-balance-card"><span>${html(label)}</span><strong>${money2(value)}</strong></div>`;
}

function cashbookSummaryCard(label, value) {
  return `<div class="cashbook-summary-card"><span>${html(label)}</span><strong>${money2(value)}</strong></div>`;
}

function renderCashbook() {
  const fromInput = $("#cashbookFrom");
  const toInput = $("#cashbookTo");
  if (!fromInput || !toInput) return;
  const today = todayIso();
  if (!cashbookRangeInitialized) {
    fromInput.value = `${today.slice(0, 7)}-01`;
    toInput.value = today;
    cashbookRangeInitialized = true;
  } else {
    if (!fromInput.value) fromInput.value = `${today.slice(0, 7)}-01`;
    if (!toInput.value) toInput.value = today;
  }
  renderCashbookOpeningInputs(false);
  renderCashbookBankAccountSelects();
  const { from, to } = cashbookDateRange();
  const summary = $("#cashbookSummary");
  const creditNode = $("#cashbookCreditGroups");
  const debitNode = $("#cashbookDebitGroups");
  if (from > to) {
    if (summary) summary.innerHTML = `<div class="cashbook-empty">Choose a valid date range. The start date must be before the end date.</div>`;
    if (creditNode) creditNode.innerHTML = "";
    if (debitNode) debitNode.innerHTML = "";
    if ($("#cashbookClosingBalances")) $("#cashbookClosingBalances").innerHTML = "";
    if ($("#cashbookCreditTotal")) $("#cashbookCreditTotal").textContent = "";
    if ($("#cashbookDebitTotal")) $("#cashbookDebitTotal").textContent = "";
    return;
  }
  const transactions = data.transactions().filter(row => row.date >= from && row.date <= to);
  const { accounts, labels } = cashbookAccountMap();
  const legs = transactions.flatMap(row => cashbookMovementLegs(row, labels));
  const credits = legs.filter(row => row.direction === "credit");
  const debits = legs.filter(row => row.direction === "debit");
  const opening = cashbookOpeningAt(from);
  const sumLegs = (rows, accountId = null) => rows.filter(row => accountId === null || row.accountId === accountId).reduce((sum, row) => sum + row.amount, 0);
  const cashIn = sumLegs(credits, "cash");
  const cashOut = sumLegs(debits, "cash");
  const onlineIn = credits.filter(row => row.accountId !== "cash").reduce((sum, row) => sum + row.amount, 0);
  const onlineOut = debits.filter(row => row.accountId !== "cash").reduce((sum, row) => sum + row.amount, 0);
  const openingOnline = Object.values(opening.banks).reduce((sum, amount) => sum + num(amount), 0);
  if (summary) summary.innerHTML = [
    cashbookSummaryCard("Opening cash", opening.cash), cashbookSummaryCard("Cash received", cashIn), cashbookSummaryCard("Cash paid", cashOut),
    cashbookSummaryCard("Opening online", openingOnline), cashbookSummaryCard("Online received", onlineIn), cashbookSummaryCard("Online paid", onlineOut)
  ].join("");
  const creditTotal = $("#cashbookCreditTotal");
  const debitTotal = $("#cashbookDebitTotal");
  if (creditTotal) creditTotal.textContent = money2(credits.reduce((sum, row) => sum + row.amount, 0));
  if (debitTotal) debitTotal.textContent = money2(debits.reduce((sum, row) => sum + row.amount, 0));
  if (creditNode) creditNode.innerHTML = cashbookGroupedMarkup(credits, "credit");
  if (debitNode) debitNode.innerHTML = cashbookGroupedMarkup(debits, "debit");

  const cashClosing = opening.cash + cashIn - cashOut;
  const closingDateLabel = $("#cashbookClosingDateLabel");
  if (closingDateLabel) closingDateLabel.textContent = `Balances after activity through ${to}`;
  let onlineClosing = 0;
  const bankCards = accounts.map(account => {
    const incoming = sumLegs(credits, account.id);
    const outgoing = sumLegs(debits, account.id);
    const balance = num(opening.banks[account.id]) + incoming - outgoing;
    onlineClosing += balance;
    return cashbookBalanceCard(account.name, balance);
  });
  const unassignedOpening = num(opening.banks.unassigned);
  const unassignedIncoming = sumLegs(credits, "unassigned");
  const unassignedOutgoing = sumLegs(debits, "unassigned");
  if (unassignedOpening || unassignedIncoming || unassignedOutgoing) {
    onlineClosing += unassignedOpening + unassignedIncoming - unassignedOutgoing;
    bankCards.push(cashbookBalanceCard("Unassigned online", unassignedOpening + unassignedIncoming - unassignedOutgoing));
  }
  const closing = $("#cashbookClosingBalances");
  if (closing) closing.innerHTML = [cashbookBalanceCard("Cash balance", cashClosing), ...bankCards, cashbookBalanceCard("Total online balance", onlineClosing), cashbookBalanceCard("Cash + online", cashClosing + onlineClosing)].join("");
}

function cashbookExportRows() {
  const { from, to } = cashbookDateRange();
  if (!from || !to || from > to) return [];
  const { labels } = cashbookAccountMap();
  return data.transactions()
    .filter(row => row.date >= from && row.date <= to)
    .flatMap(row => cashbookMovementLegs(row, labels))
    .map(row => ({
      Date: row.date,
      Side: row.direction === "credit" ? "Credit" : "Debit",
      Head: row.head,
      Voucher: row.memo,
      Particulars: row.party,
      Account: row.accountName,
      Amount: row.amount,
      Remarks: row.remark
    }));
}

function bindCashbook() {
  document.querySelectorAll("[data-cashbook-statement-view]").forEach(button => {
    button.addEventListener("click", () => {
      const selectedView = button.dataset.cashbookStatementView;
      document.querySelectorAll("[data-cashbook-statement-view]").forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      $("#cashbookStatementTransactionsView").hidden = selectedView !== "transactions";
      $("#cashbookStatementDailyView").hidden = selectedView !== "daily";
    });
  });
  $("#cashbookStatementDailyPrint")?.addEventListener("click", () => {
    const filteredRows = cashbookStatementRows;
    const fromDate = text($("#cashbookStatementFrom")?.value);
    const toDate = text($("#cashbookStatementTo")?.value);
    const statusFilter = text($("#cashbookStatementStatusFilter")?.value) || "all";
    const directionFilter = text($("#cashbookStatementDirectionFilter")?.value) || "all";
    const search = text($("#cashbookStatementSearch")?.value).toLowerCase();
    const { labels } = cashbookAccountMap();
    const accountId = text($("#cashbookReconcileAccount")?.value);
    const legs = data.transactions().filter(row => text(row.bankAccountId) === accountId).flatMap(row => cashbookMovementLegs(row, labels)).filter(row => row.channel === "Online");
    const used = new Set();
    const reconciled = filteredRows.map(row => {
      const candidates = legs.map((leg, index) => ({ leg, index })).filter(({ leg, index }) => !used.has(index) && leg.direction === row.direction && Math.abs(leg.amount - row.amount) < 0.01 && leg.date === row.date);
      if (candidates.length === 1) { used.add(candidates[0].index); return { ...row, status: "Matched", cashbook: candidates[0].leg.memo || candidates[0].leg.party }; }
      return { ...row, status: candidates.length > 1 ? "Multiple matches" : "Unmatched", cashbook: candidates.length > 1 ? `${candidates.length} candidates` : "—" };
    }).filter(row => (statusFilter === "all" || row.status === statusFilter)
      && (directionFilter === "all" || row.direction === directionFilter)
      && (!fromDate || row.date >= fromDate)
      && (!toDate || row.date <= toDate)
      && (!search || `${row.description} ${row.cashbook} ${row.status} ${row.date} ${row.amount}`.toLowerCase().includes(search)));
    const daily = new Map();
    reconciled.forEach(row => {
      const day = daily.get(row.date) || { date: row.date, credits: 0, debits: 0, rows: 0 };
      if (row.direction === "credit") day.credits += num(row.amount); else day.debits += num(row.amount);
      day.rows += 1;
      daily.set(row.date, day);
    });
    const dailyRows = [...daily.values()].sort((a, b) => b.date.localeCompare(a.date));
    const totalCredit = dailyRows.reduce((sum, day) => sum + day.credits, 0);
    const totalDebit = dailyRows.reduce((sum, day) => sum + day.debits, 0);
    const tableHtml = `<table><thead><tr><th>Date</th><th>Credit</th><th>Debit</th><th>Net (Credit − Debit)</th><th>Transactions</th></tr></thead><tbody>${dailyRows.map(day => `<tr><td>${html(day.date)}</td><td class="num">${money2(day.credits)}</td><td class="num">${money2(day.debits)}</td><td class="num">${money2(day.credits - day.debits)}</td><td class="num">${day.rows}</td></tr>`).join("") || '<tr><td colspan="5">No records found</td></tr>'}</tbody><tfoot><tr><th>Grand total (${reconciled.length} rows · ${dailyRows.length} days)</th><th class="num">${money2(totalCredit)}</th><th class="num">${money2(totalDebit)}</th><th class="num">${money2(totalCredit - totalDebit)}</th><th class="num">${reconciled.length}</th></tr></tfoot></table>`;
    const printWindow = window.open("", "_blank", "width=1000,height=750");
    if (!printWindow) return toast("Allow pop-ups to print the day-wise summary.");
    printWindow.document.write(`<!doctype html><html><head><title>Bank Statement Day-wise Summary</title><style>body{font:14px Arial,sans-serif;color:#111;padding:20px}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #bbb;padding:7px;text-align:left}th.num,td.num{text-align:right}button{display:none}.cashbook-day-arrow{display:none!important}.cashbook-day-date{display:inline!important}.cashbook-day-detail-row[hidden]{display:none}@media print{body{padding:0}}</style></head><body><h1>Bank Statement Day-wise Summary</h1><p>Account: ${html(cashbookAccountById(text($("#cashbookReconcileAccount")?.value))?.name || "Bank")}</p>${tableHtml}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  });
  $("#cashbookDownloadStatementTemplate")?.addEventListener("click", () => {
    const csv = 'Date,Description,Debit,Credit\r\n';
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bank-reconciliation-statement-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  });
  $("#cashbookExportBtn")?.addEventListener("click", withBusyClick(() => {
    const { from, to } = cashbookDateRange();
    csvDownload(`cash-book-${from}-to-${to}.csv`, cashbookExportRows());
  }, "Exporting..."));
  $("#cashbookApplyBtn")?.addEventListener("click", withBusyClick(async () => {
    const { from, to } = cashbookDateRange();
    if (!from || !to || from > to) return toast("Choose a valid start and end date.");
    renderCashbook();
    toast("Cash book date range updated.");
  }, "Updating..."));
  $("#cashbookFrom")?.addEventListener("change", () => {
    renderCashbookOpeningInputs(true);
    renderCashbook();
  });
  $("#cashbookTo")?.addEventListener("change", renderCashbook);
  $("#cashbookReconcileAccount")?.addEventListener("change", () => {
    loadReconciliationStatement(text($("#cashbookReconcileAccount")?.value));
  });
  $("#cashbookStatementStatusFilter")?.addEventListener("change", () => reconcileBankStatement(cashbookStatementRows));
  $("#cashbookStatementDirectionFilter")?.addEventListener("change", () => reconcileBankStatement(cashbookStatementRows));
  $("#cashbookStatementSearch")?.addEventListener("input", () => reconcileBankStatement(cashbookStatementRows));
  $("#cashbookStatementFile")?.addEventListener("change", event => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseBankCsv(String(reader.result || ""));
      if (!rows.length) { toast("CSV needs a date column and amount, debit, or credit column."); return; }
      cashbookStatementRows = rows;
      const accountId = text($("#cashbookReconcileAccount")?.value);
      saveReconciliationStatement(accountId, rows).catch(error => toast(error.message || "Could not save statement."));
      reconcileBankStatement(rows);
    };
    reader.readAsText(file);
  });
  $("#cashbookClearStatement")?.addEventListener("click", withBusyClick(clearReconciliationStatement, "Clearing..."));
}
