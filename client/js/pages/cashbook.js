const CASHBOOK_BANK_ACCOUNTS_KEY = "cashbookBankAccounts";
const CASHBOOK_OPENINGS_KEY = "cashbookOpeningBalances";
let cashbookRangeInitialized = false;

function cashbookBankAccounts() {
  const saved = getSettingValue(CASHBOOK_BANK_ACCOUNTS_KEY);
  if (Array.isArray(saved) && saved.length) {
    return saved.map((account, index) => ({ ...account, id: text(account.id) || `bank-${index + 1}`, name: text(account.name) || text(account.bankName) || `Bank account ${index + 1}` }));
  }
  const paymentAccount = getSettingValue("accountDetails") || {};
  return [{ id: "main-bank", name: text(paymentAccount.name) || text(paymentAccount.bankName) || "Main Bank", ...paymentAccount }];
}

function cashbookDefaultBankAccountId() {
  const accounts = cashbookBankAccounts();
  const savedId = text(getSettingValue("cashbookDefaultBankAccountId"));
  return accounts.some(account => account.id === savedId) ? savedId : text(accounts[0]?.id);
}

function cashbookAccountById(id) {
  return cashbookBankAccounts().find(account => account.id === text(id)) || null;
}

function renderCashbookBankAccountSelects() {
  const accounts = cashbookBankAccounts();
  document.querySelectorAll('select[name="bankAccountId"]').forEach(select => {
    const selected = select.dataset.preserveSelection === "true" ? select.value : "";
    const isEdit = select.closest("#transactionEditForm");
    const options = accounts.map(account => `<option value="${html(account.id)}">${html(account.name)}</option>`).join("");
    select.innerHTML = `${isEdit ? `<option value="">Unassigned / legacy online</option>` : ""}${options}`;
    if (selected && accounts.some(account => account.id === selected)) select.value = selected;
    else if (isEdit) select.value = "";
    else if (accounts.length) select.value = cashbookDefaultBankAccountId();
    select.dataset.preserveSelection = "true";
  });
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
}
