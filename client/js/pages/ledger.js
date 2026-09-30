function ledgerColumns() {
  return [
    { label: "Memo", key: "memo", render: r => billLinkMarkup(r) },
    { label: "Date", key: "date" },
    { label: "Head", key: "head" },
    { label: "Particulars", key: "party" },
    { label: "Billed", key: "billed", num: true, render: r => money(r.billed) },
    { label: "Cash", key: "cash", num: true, render: r => money(r.cash) },
    { label: "Bank", key: "bank", num: true, render: r => money(bankReceivedAmount(r)) },
    { label: "Finance", key: "bajaj", num: true, render: r => money(r.bajaj) },
    { label: "Cash Expense", key: "cashExpense", num: true, render: r => money(cashExpenseAmount(r)) },
    { label: "Bank Expense", key: "bankExpense", num: true, render: r => money(bankExpenseAmount(r)) },
    { label: "Profit", key: "profit", num: true, render: r => money(r.profit) },
    { label: "Details", key: "remark", render: r => html(transactionGoodsDetails(r)) },
    { label: "Mobile", key: "mobile" },
    { label: "Action", key: "action", render: r => ledgerActionMarkup(r.ledgerIndex, r) }
  ];
}

function ledgerTotals(rows) {
  return rows.reduce((totals, row) => {
    totals.billed += num(row.billed);
    totals.cash += num(row.cash);
    totals.bank += bankReceivedAmount(row);
    totals.bajaj += num(row.bajaj);
    totals.cashExpense += cashExpenseAmount(row);
    totals.bankExpense += bankExpenseAmount(row);
    totals.profit += num(row.profit);
    return totals;
  }, {
    billed: 0,
    cash: 0,
    bank: 0,
    bajaj: 0,
    cashExpense: 0,
    bankExpense: 0,
    profit: 0
  });
}

function appendLedgerTotalRow(tableNode, rows) {
  const totals = ledgerTotals(rows);
  tableNode.insertAdjacentHTML("beforeend", `
    <tfoot>
      <tr class="ledger-total-row">
        <td colspan="4"><strong>Total (${rows.length} records)</strong></td>
        <td class="num"><strong>${money(totals.billed)}</strong></td>
        <td class="num"><strong>${money(totals.cash)}</strong></td>
        <td class="num"><strong>${money(totals.bank)}</strong></td>
        <td class="num"><strong>${money(totals.bajaj)}</strong></td>
        <td class="num"><strong>${money(totals.cashExpense)}</strong></td>
        <td class="num"><strong>${money(totals.bankExpense)}</strong></td>
        <td class="num"><strong>${money(totals.profit)}</strong></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </tfoot>
  `);
}

function recentTransactionColumns() {
  return [
    ...ledgerColumns().slice(0, 8),
    { label: "Due", key: "due", num: true, render: r => money(transactionDueAmount(r)) }
  ];
}

function transactionDueAmount(row) {
  const savedDue = num(row.billData?.calc?.due);
  if (savedDue > 0) return savedDue;
  const head = text(row.head).toLowerCase();
  const type = text(row.type).toLowerCase();
  if (head === "due" || type === "staff due") return num(row.expense);
  return Math.max(0, num(row.billed) - num(row.cash) - num(row.bank) - num(row.bajaj));
}

function transactionGoodsDetails(row) {
  return text(row.remark || row.voucherData?.tx?.remark || row.billData?.tx?.remark);
}

function ledgerActionMarkup(index, row = {}) {
  const printable = row.billData || row.voucherData;
  return `
    <div class="ledger-actions">
      ${printable ? `<button type="button" class="symbol-btn" data-print-bill-memo="${html(row.memo)}" title="Open bill for printing" aria-label="Open bill for printing">&#128438;</button>` : ""}
      ${rowUnlockButton("transaction", index)}
      <button type="button" class="symbol-btn edit-symbol" data-edit-transaction="${index}" title="Edit transaction" aria-label="Edit transaction"${actionControlAttrs("transaction", index, "Edit transaction")}>&#9998;</button>
      <button type="button" class="symbol-btn delete-symbol" data-delete-transaction="${index}" title="Delete transaction" aria-label="Delete transaction"${actionControlAttrs("transaction", index, "Delete transaction")}>&#128465;</button>
    </div>
  `;
}

function billLinkMarkup(row) {
  const memo = text(row.memo);
  if (!memo || (!row.billData && !row.voucherData)) return html(memo);
  return `<button type="button" class="memo-bill-link" data-bill-memo="${html(memo)}"> ${html(memo)} </button>`;
}

function openBillFromTransactionMemo(memo) {
  const tx = data.transactions().find(row => text(row.memo) === text(memo) && (row.billData || row.voucherData));
  if (!tx) {
    toast("Printable voucher data not found for this memo.");
    return;
  }
  if (tx.voucherData) {
    const voucherId = text(tx.voucherId || tx.memo);
    localStorage.setItem(`paymentVoucher:${voucherId}`, JSON.stringify(tx.voucherData));
    openPrintablePage(`payment-voucher.html?id=${encodeURIComponent(voucherId)}`);
    return;
  }
  const billId = text(tx.billId || tx.memo);
  localStorage.setItem(`gstBill:${billId}`, JSON.stringify(tx.billData));
  openPrintablePage(`bill.html?id=${encodeURIComponent(billId)}`);
}

function openPrintablePage(url) {
  // Edge may block a new tab under strict pop-up settings. In that case, open
  // the bill in the current tab so the user can still use its Print button.
  if (!window.open(url, "_blank")) window.location.assign(url);
}

function bankExpenseAmount(row) {
  return num(row.expense) ? Math.min(num(row.expense), num(row.bank)) : 0;
}

function bankReceivedAmount(row) {
  return num(row.expense) ? 0 : num(row.bank);
}

function cashExpenseAmount(row) {
  return Math.max(num(row.expense) - bankExpenseAmount(row), 0);
}

function transactionMatches(candidate, target) {
  const row = normalizeTransaction(candidate);
  if (row._id && target._id) return row._id === target._id;
  return text(row.memo) === text(target.memo)
    && text(row.date) === text(target.date)
    && text(row.head) === text(target.head)
    && text(row.party) === text(target.party)
    && num(row.billed) === num(target.billed)
    && num(row.cash) === num(target.cash)
    && num(row.bank) === num(target.bank)
    && num(row.expense) === num(target.expense);
}

function findTransactionLocation(target) {
  const userIndex = user.transactions.findIndex(row => transactionMatches(row, target));
  if (userIndex >= 0) return { source: "user", index: userIndex };
  const seedIndex = (seed?.transactions || []).findIndex(row => transactionMatches(row, target));
  if (seedIndex >= 0) return { source: "seed", index: seedIndex };
  return null;
}

async function saveTransactionRecord(original, updates) {
  if (apiAvailable && original._id) {
    const saved = await apiPatch("transactions", original._id, updates);
    const index = seed.transactions.findIndex(row => row._id === original._id);
    if (index >= 0) seed.transactions[index] = saved;
    return saved;
  }
  const location = findTransactionLocation(original);
  if (!location) throw new Error("Transaction not found.");
  if (location.source === "user") {
    const before = { ...user.transactions[location.index] };
    user.transactions[location.index] = { ...user.transactions[location.index], ...updates };
    recordLocalAudit({ action: "edit", collection: "transactions", before, after: user.transactions[location.index] });
    saveUser();
    return user.transactions[location.index];
  }
  const before = { ...seed.transactions[location.index] };
  seed.transactions[location.index] = { ...seed.transactions[location.index], ...updates };
  recordLocalAudit({ action: "edit", collection: "transactions", before, after: seed.transactions[location.index] });
  saveUser();
  return seed.transactions[location.index];
}

function dueMatchesTransaction(row, transaction) {
  return text(row.memo) === text(transaction.memo)
    && text(row.name).toLowerCase() === text(transaction.party).toLowerCase();
}

async function replaceTransactionDueRecord(original, dueRecord) {
  await deleteDueRecordsForTransaction(original, true);
  if (dueRecord) {
    if (apiAvailable) seed.dues.push(await apiCreate("dues", dueRecord));
    else user.dues.push(dueRecord);
  }
  if (!apiAvailable) saveUser();
}

async function deleteDueRecordsForTransaction(transaction, matchParty = false) {
  const seedDues = seed?.dues || [];
  for (let i = seedDues.length - 1; i >= 0; i -= 1) {
    const row = normalizeDue(seedDues[i]);
    const matches = matchParty ? dueMatchesTransaction(row, transaction) : text(row.memo) === text(transaction.memo);
    if (!matches) continue;
    if (apiAvailable && row._id) await apiDelete("dues", row._id);
    if (!apiAvailable) recordLocalAudit({ action: "delete", collection: "dues", before: seedDues[i], recordId: row._id || row.memo });
    seedDues.splice(i, 1);
  }
  for (let i = user.dues.length - 1; i >= 0; i -= 1) {
    const row = normalizeDue(user.dues[i]);
    const matches = matchParty ? dueMatchesTransaction(row, transaction) : text(row.memo) === text(transaction.memo);
    if (!matches) continue;
    recordLocalAudit({ action: "delete", collection: "dues", before: user.dues[i], recordId: row._id || row.memo });
    user.dues.splice(i, 1);
  }
  if (!apiAvailable) saveUser();
}

function openTransactionEditor(index) {
  const row = filteredLedger()[Number(index)];
  if (!row) return toast("Transaction not found.");
  if (openVoucherForEditing(row)) return;
  const form = $("#transactionEditForm");
  form.ledgerIndex.value = index;
  form.memo.value = row.memo;
  form.date.value = row.date;
  form.head.value = row.head;
  form.party.value = row.party;
  form.customerId.value = row.customerId;
  form.billed.value = decimal2(row.billed);
  form.cash.value = decimal2(row.cash);
  form.bank.value = decimal2(row.bank);
  form.bajaj.value = decimal2(row.bajaj);
  form.expense.value = decimal2(row.expense);
  form.profit.value = decimal2(row.profit);
  form.remark.value = row.remark;
  form.mobile.value = row.mobile;
  openModal("transactionModal");
  form.memo.focus();
}

function openVoucherForEditing(row) {
  if (row.voucherData) {
    fillPaymentFormForEdit(row);
    return true;
  }
  if (row.billData) {
    fillReceiptFormForEdit(row);
    return true;
  }
  return false;
}

function fillPaymentFormForEdit(row) {
  editingPaymentTransaction = row;
  editingReceiptTransaction = null;
  showView("payment");
  const form = $("#paymentForm");
  renderPaymentHeads(row.head);
  form.memo.value = text(row.memo);
  form.date.value = dateOnly(row.date) || todayIso();
  form.head.value = text(row.head);
  form.party.value = text(row.party);
  form.staffDue.checked = text(row.head).toLowerCase() === "due" || text(row.type).toLowerCase() === "staff due";
  form.duePaid.checked = text(row.head).toLowerCase() === "due paid" || text(row.type).toLowerCase() === "due paid";
  applyPaymentDueMode();
  form.amount.value = decimal2(form.duePaid.checked ? num(row.cash) : cashExpenseAmount(row));
  form.bank.value = decimal2(num(row.bank));
  if (form.paymentMethod) {
    const type = text(row.type).toLowerCase();
    form.paymentMethod.value = type === "cheque" || type === "check" ? "Cheque" : num(row.bank) ? "Bank" : "Cash";
  }
  form.remark.value = text(row.remark);
  applyPaymentMemoMode();
  renderPaymentDueAmount();
  setPaymentSubmitText();
  form.party.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fillReceiptFormForEdit(row) {
  editingReceiptTransaction = row;
  editingPaymentTransaction = null;
  showView("receipt");
  const form = $("#receiptForm");
  const bill = row.billData || {};
  const customer = bill.customer || {};
  const tx = bill.tx || row;
  form.memo.value = text(row.memo);
  form.date.value = dateOnly(row.date) || todayIso();
  renderReceiptHeads(row.head);
  form.head.value = text(row.head);
  form.customer.value = text(customer.label) || text(row.party);
  form.mobile.value = text(customer.mobile || row.mobile);
  form.gstin.value = text(customer.gstin);
  form.stateCode.value = normalizeStateCode(customer.stateCode) || businessStateCode();
  form.address.value = [customer.address, customer.city, customer.state, customer.pin].map(text).filter(Boolean).join(", ");
  form.salesManager.value = text(tx.salesManager);
  form.vehicleNo.value = text(tx.vehicleNo);
  form.transportMode.value = text(tx.transportMode);
  form.cash.value = decimal2(row.cash);
  form.bank.value = decimal2(row.bank);
  form.bajaj.value = decimal2(row.bajaj);
  form.mode.value = text(row.type) || form.mode.value;
  form.remark.value = text(row.remark);
  form.profit.value = decimal2(row.profit);
  const gross = num(bill.calc?.gross) || num(bill.goodsTotals?.total) || num(row.billed);
  const discount = Math.max(0, gross - num(row.billed));
  form.discount.value = decimal2(discount);
  receiptItems = (bill.items || []).map(item => ({
    description: text(item.description),
    hsn: text(item.hsn),
    qty: num(item.qty) || 1,
    rate: num(item.rate),
    total: num(item.total),
    gst: num(item.gst)
  }));
  if (!receiptItems.length) addReceiptItem();
  else renderItems();
  applyReceiptMemoMode();
  renderReceiptTotals();
  setReceiptSubmitText();
  form.customer.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveTransactionEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const original = filteredLedger()[Number(form.ledgerIndex.value)];
  if (!original) return toast("Transaction not found.");
  const updates = {
    memo: text(form.memo.value),
    date: form.date.value,
    head: text(form.head.value),
    party: text(form.party.value),
    customerId: text(form.customerId.value),
    billed: num(form.billed.value),
    cash: num(form.cash.value),
    bank: num(form.bank.value),
    bajaj: num(form.bajaj.value),
    expense: num(form.expense.value),
    profit: num(form.profit.value),
    remark: text(form.remark.value),
    mobile: text(form.mobile.value)
  };

  await saveTransactionRecord(original, updates);
  closeModal("transactionModal");
  toast("Transaction updated.");
  renderAll();
}

function setLedgerDeleteLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("delete-loading");
    button.innerHTML = `<span class="mini-spinner" aria-hidden="true"></span><span>Deleting...</span>`;
    button.title = "Please wait, deleting";
    button.setAttribute("aria-label", "Please wait, deleting transaction");
    return;
  }
  button.disabled = false;
  button.classList.remove("delete-loading");
  button.innerHTML = button.dataset.originalHtml || "&#128465;";
  button.title = "Delete transaction";
  button.setAttribute("aria-label", "Delete transaction");
  delete button.dataset.originalHtml;
}

async function deleteLedgerTransaction(index, button = null) {
  const row = filteredLedger()[Number(index)];
  if (!row) return toast("Transaction not found.");
  if (!confirm(`Delete transaction memo ${row.memo}?`)) return;
  setLedgerDeleteLoading(button, true);
  try {
    await deleteDueRecordsForTransaction(row);
    if (apiAvailable && row._id) {
      await apiDelete("transactions", row._id);
      seed.transactions = seed.transactions.filter(tx => tx._id !== row._id);
    } else {
      const location = findTransactionLocation(row);
      if (!location) throw new Error("Transaction not found.");
      if (location.source === "user") {
        recordLocalAudit({ action: "delete", collection: "transactions", before: user.transactions[location.index] });
        user.transactions.splice(location.index, 1);
        saveUser();
      } else {
        recordLocalAudit({ action: "delete", collection: "transactions", before: seed.transactions[location.index] });
        seed.transactions.splice(location.index, 1);
        saveUser();
      }
    }
    toast("Transaction deleted.");
    renderAll();
  } catch (error) {
    setLedgerDeleteLoading(button, false);
    toast(error.message || "Transaction delete failed.");
  }
}

function openDueEditor(index) {
  const row = data.dues()[Number(index)];
  if (!row) return toast("Due record not found.");
  const form = $("#dueEditForm");
  form.dueIndex.value = index;
  form.date.value = dateOnly(row.date);
  form.name.value = row.name;
  form.head.value = dueHead(row);
  form.memo.value = row.memo;
  form.due.value = decimal2(row.due);
  form.paid.value = decimal2(row.paid);
  form.remark.value = row.remark;
  openModal("dueModal");
  form.name.focus();
}

async function saveDueEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const index = Number(form.dueIndex.value);
  const row = data.dues()[index];
  if (!row) return toast("Due record not found.");
  const updates = {
    date: form.date.value,
    name: text(form.name.value),
    head: text(form.head.value),
    memo: text(form.memo.value),
    due: num(form.due.value),
    paid: num(form.paid.value),
    remark: text(form.remark.value)
  };
  if (apiAvailable && row._id) {
    const saved = await apiPatch("dues", row._id, updates);
    const seedIndex = seed.dues.findIndex(item => item._id === row._id);
    if (seedIndex >= 0) seed.dues[seedIndex] = saved;
  } else if (index >= (seed?.dues || []).length) {
    const userIndex = index - (seed?.dues || []).length;
    const before = { ...user.dues[userIndex] };
    user.dues[userIndex] = { ...user.dues[userIndex], ...updates };
    recordLocalAudit({ action: "edit", collection: "dues", before, after: user.dues[userIndex] });
    saveUser();
  } else {
    const before = { ...seed.dues[index] };
    seed.dues[index] = { ...seed.dues[index], ...updates };
    recordLocalAudit({ action: "edit", collection: "dues", before, after: seed.dues[index] });
    saveUser();
  }
  closeModal("dueModal");
  toast("Due record updated.");
  renderAll();
}

async function deleteDueRecord(index) {
  const row = data.dues()[Number(index)];
  if (!row) return toast("Due record not found.");
  if (!confirm(`Delete due record for ${row.name}?`)) return;
  if (apiAvailable && row._id) {
    await apiDelete("dues", row._id);
    seed.dues = seed.dues.filter(item => item._id !== row._id);
  } else if (Number(index) >= (seed?.dues || []).length) {
    const userIndex = Number(index) - (seed?.dues || []).length;
    recordLocalAudit({ action: "delete", collection: "dues", before: user.dues[userIndex] });
    user.dues.splice(userIndex, 1);
    saveUser();
  } else {
    recordLocalAudit({ action: "delete", collection: "dues", before: seed.dues[Number(index)] });
    seed.dues.splice(Number(index), 1);
    saveUser();
  }
  toast("Due record deleted.");
  renderAll();
}

function openCustomerEditor(index) {
  const row = data.customers()[Number(index)];
  if (!row) return toast("Customer not found.");
  const form = $("#addressBookEditForm");
  form.customerIndex.value = index;
  form.id.value = row.id;
  form.name.value = row.name;
  form.mobile.value = row.mobile;
  form.address.value = row.address;
  form.nearby.value = row.nearby;
  form.city.value = row.city;
  form.state.value = row.state || seed.business.state;
  form.stateCode.value = row.stateCode || stateCodeFromGstin(row.gstin) || businessStateCode();
  form.pin.value = row.pin;
  form.gstin.value = row.gstin;
  openModal("addressBookModal");
  form.name.focus();
}

async function saveCustomerEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const index = Number(form.customerIndex.value);
  const row = data.customers()[index];
  if (!row) return toast("Customer not found.");
  const updates = {
    id: text(form.id.value),
    name: text(form.name.value),
    mobile: text(form.mobile.value),
    address: text(form.address.value),
    nearby: text(form.nearby.value),
    city: text(form.city.value),
    state: text(form.state.value),
    stateCode: normalizeStateCode(form.stateCode.value) || stateCodeFromGstin(form.gstin.value) || businessStateCode(),
    pin: text(form.pin.value),
    gstin: text(form.gstin.value)
  };
  if (apiAvailable && row._id) {
    const saved = await apiPatch("customers", row._id, updates);
    const seedIndex = seed.customers.findIndex(item => item._id === row._id);
    if (seedIndex >= 0) seed.customers[seedIndex] = saved;
  } else if (index >= (seed?.customers || []).length) {
    const userIndex = index - (seed?.customers || []).length;
    const before = { ...user.customers[userIndex] };
    user.customers[userIndex] = { ...user.customers[userIndex], ...updates };
    recordLocalAudit({ action: "edit", collection: "customers", before, after: user.customers[userIndex] });
    saveUser();
  } else {
    const before = { ...seed.customers[index] };
    seed.customers[index] = { ...seed.customers[index], ...updates };
    recordLocalAudit({ action: "edit", collection: "customers", before, after: seed.customers[index] });
    saveUser();
  }
  closeModal("addressBookModal");
  toast("Customer updated.");
  renderAll();
}

function findItemLocationByName(name) {
  const key = itemLabel(name);
  const userIndex = (user.items || []).findIndex(row => itemLabel(row.name) === key);
  if (userIndex >= 0) return { source: "user", index: userIndex };
  const seedIndex = (seed?.items || []).findIndex(row => itemLabel(row.name) === key);
  if (seedIndex >= 0) return { source: "seed", index: seedIndex };
  return null;
}

function rawItemByName(name) {
  const location = findItemLocationByName(name);
  if (!location) return null;
  return location.source === "seed" ? seed.items[location.index] : user.items[location.index];
}

function rateHistoryEntry(fromRate, toRate, note = "Manual item entry") {
  return {
    date: todayIso(),
    fromRate: num(fromRate),
    toRate: num(toRate),
    note,
    source: "Item master"
  };
}

function itemRateHistory(itemName) {
  const key = itemLabel(itemName);
  const rawItem = rawItemByName(itemName);
  const item = rawItem ? normalizeItem(rawItem) : null;
  const rows = [];

  (item?.rateHistory || []).forEach(entry => {
    rows.push({
      date: entry.date,
      type: entry.fromRate ? "Master rate changed" : "Master rate added",
      fromRate: entry.fromRate,
      toRate: entry.toRate,
      reference: entry.note || entry.source
    });
  });

  if (item?.rate && !rows.some(row => row.type.startsWith("Master"))) {
    rows.push({
      date: parseDate(item.createdAt || item.updatedAt) || "",
      type: "Current master rate",
      fromRate: 0,
      toRate: item.rate,
      reference: "Item master"
    });
  }

  data.transactions().forEach(tx => {
    (tx.billData?.items || []).forEach(itemRow => {
      if (itemLabel(itemRow.description) !== key) return;
      const qty = num(itemRow.qty) || 1;
      const rate = num(itemRow.rate) || (num(itemRow.total) / qty);
      rows.push({
        date: parseDate(tx.date || tx.billData?.tx?.date),
        type: "Used in sale",
        fromRate: 0,
        toRate: rate,
        reference: text(tx.memo) ? `Memo ${tx.memo}` : "Saved receipt",
        memo: text(tx.memo),
        billData: tx.billData
      });
    });
  });

  data.purchases().forEach(purchase => {
    if (itemLabel(purchase.item) !== key || !num(purchase.qty)) return;
    rows.push({
      date: parseDate(purchase.date),
      type: "Purchase average",
      fromRate: 0,
      toRate: num(purchase.amount) / num(purchase.qty),
      reference: text(purchase.billNo) ? `Bill ${purchase.billNo}` : text(purchase.supplier)
    });
  });

  return rows
    .filter(row => num(row.toRate) > 0)
    .sort((a, b) => text(b.date).localeCompare(text(a.date)));
}

function openItemRateHistory(itemName) {
  const name = text(itemName);
  const rows = itemRateHistory(name);
  $("#itemRateHistoryTitle").textContent = `${name} Rate History`;
  $("#itemRateHistorySummary").innerHTML = rows.length
    ? `<strong>${rows.length}</strong><span>rate records found</span>`
    : `<strong>0</strong><span>No rate history recorded yet.</span>`;
  table($("#itemRateHistoryTable"), [
    { label: "Date", key: "date" },
    { label: "Type", key: "type" },
    { label: "Old Rate", key: "fromRate", num: true, render: r => r.fromRate ? money2(r.fromRate) : "-" },
    { label: "Rate", key: "toRate", num: true, render: r => money2(r.toRate) },
    { label: "Reference", key: "reference", render: r => r.billData && r.memo ? billLinkMarkup(r) : html(r.reference) }
  ], rows);
  openModal("itemRateHistoryModal");
}

function openItemEditor(itemName) {
  const summaryRow = itemStockSummary().find(row => itemLabel(row.item) === itemLabel(itemName));
  const location = findItemLocationByName(itemName);
  const item = location
    ? normalizeItem(location.source === "seed" ? seed.items[location.index] : user.items[location.index])
    : normalizeItem({
      name: summaryRow?.item || itemName,
      hsn: summaryRow?.hsn,
      unit: summaryRow?.unit || "Pcs",
      rate: summaryRow?.rate
    });
  const form = $("#itemEditForm");
  form.itemKey.value = location ? `${location.source}:${location.index}` : "";
  form.originalName.value = item.name;
  form.name.value = item.name;
  form.group.value = item.group || "Uncategorized";
  form.hsn.value = item.hsn;
  form.unit.value = item.unit || "Pcs";
  form.rate.value = item.rate ? decimal2(item.rate) : "";
  openModal("itemModal");
  form.name.focus();
}

async function saveItemEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const originalName = text(form.originalName.value);
  const updates = {
    name: text(form.name.value),
    group: text(form.group.value) || "Uncategorized",
    hsn: text(form.hsn.value),
    unit: text(form.unit.value) || "Pcs",
    rate: num(form.rate.value),
    remark: "Manual item entry"
  };
  if (!updates.name) {
    form.name.focus();
    return;
  }
  const duplicate = data.items().some(row =>
    itemLabel(row.name) === itemLabel(updates.name)
    && itemLabel(row.name) !== itemLabel(originalName)
  );
  if (duplicate) {
    toast("Item already exists.");
    form.name.focus();
    return;
  }
  const location = findItemLocationByName(originalName);
  const previous = location
    ? normalizeItem(location.source === "seed" ? seed.items[location.index] : user.items[location.index])
    : null;
  const previousHistory = previous?.rateHistory || [];
  updates.rateHistory = num(previous?.rate) !== num(updates.rate)
    ? [...previousHistory, rateHistoryEntry(previous?.rate, updates.rate, "Item rate updated")]
    : previousHistory;
  if (location?.source === "seed") {
    const row = seed.items[location.index];
    if (apiAvailable && row._id) {
      seed.items[location.index] = await apiPatch("items", row._id, updates);
    } else {
      const before = { ...row };
      seed.items[location.index] = { ...row, ...updates };
      recordLocalAudit({ action: "edit", collection: "items", before, after: seed.items[location.index] });
      saveUser();
    }
  } else if (location?.source === "user") {
    const before = { ...user.items[location.index] };
    user.items[location.index] = { ...user.items[location.index], ...updates };
    recordLocalAudit({ action: "edit", collection: "items", before, after: user.items[location.index] });
    saveUser();
  } else if (apiAvailable) {
    seed.items.push(await apiCreate("items", updates));
  } else {
    user.items.push(updates);
    saveUser();
  }
  closeModal("itemModal");
  toast("Item updated.");
  renderAll();
}

async function deleteCustomerRecord(index) {
  const row = data.customers()[Number(index)];
  if (!row) return toast("Customer not found.");
  if (!confirm(`Delete customer ${row.name}?`)) return;
  if (apiAvailable && row._id) {
    await apiDelete("customers", row._id);
    seed.customers = seed.customers.filter(item => item._id !== row._id);
  } else if (Number(index) >= (seed?.customers || []).length) {
    const userIndex = Number(index) - (seed?.customers || []).length;
    recordLocalAudit({ action: "delete", collection: "customers", before: user.customers[userIndex] });
    user.customers.splice(userIndex, 1);
    saveUser();
  } else {
    recordLocalAudit({ action: "delete", collection: "customers", before: seed.customers[Number(index)] });
    seed.customers.splice(Number(index), 1);
    saveUser();
  }
  toast("Customer deleted.");
  renderAll();
}

function filteredLedger() {
  const q = text($("#ledgerSearch").value).toLowerCase();
  const { from, to } = tableDateRange("ledgerDateRangeMode", "ledgerFrom", "ledgerTo", "ledgerRangeMonth");
  const type = $("#ledgerType").value;
  return data.transactions().filter(row => {
    return (!q || transactionSearchText(row).includes(q)) && (!from || row.date >= from) && (!to || row.date <= to) && (!type || row.head === type);
  }).slice(-1000).reverse();
}

function transactionSearchText(row) {
  return [
    row.memo,
    row.date,
    row.head,
    row.party,
    row.customerId,
    row.remark,
    row.mobile,
    row.type
  ].map(text).join(" ").toLowerCase();
}

function renderLedger() {
  syncTableDateRangeControls("ledgerDateRangeMode", "ledgerFrom", "ledgerTo");
  const heads = [...new Set(data.transactions().map(t => t.head).filter(Boolean))].sort();
  $("#ledgerType").innerHTML = `<option value="">All heads</option>${heads.map(h => `<option ${$("#ledgerType").value === h ? "selected" : ""}>${h}</option>`).join("")}`;
  const rows = filteredLedger().map((row, index) => ({ ...row, ledgerIndex: index }));
  const pageInfo = paginateRows(rows, ledgerPage);
  ledgerPage = pageInfo.currentPage;
  const ledgerTable = $("#ledgerTable");
  table(ledgerTable, ledgerColumns(), pageInfo.rows);
  appendLedgerTotalRow(ledgerTable, rows);
  renderPagination($("#ledgerPagination"), pageInfo, page => {
    ledgerPage = page;
    renderLedger();
  });
}

