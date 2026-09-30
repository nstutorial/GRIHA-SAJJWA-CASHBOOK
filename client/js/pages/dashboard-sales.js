function totalsFor(dateFilter = null) {
  const rows = data.transactions().filter(row => !dateFilter || row.date === dateFilter);
  const dueRows = data.dues().filter(row => !dateFilter || row.date === dateFilter);
  const outgoingChequeRows = data.outgoingCheques()
    .filter(row => text(row.status).toLowerCase() !== "cancelled")
    .filter(row => !dateFilter || row.chequeDate === dateFilter);
  return {
    billed: rows.reduce((sum, row) => sum + row.billed, 0),
    cash: rows.reduce((sum, row) => sum + row.cash, 0),
    bank: rows.reduce((sum, row) => sum + row.bank, 0),
    expense: rows.reduce((sum, row) => sum + row.expense, 0),
    issuedCheque: outgoingChequeRows.reduce((sum, row) => sum + num(row.amount), 0),
    bajaj: rows.reduce((sum, row) => sum + row.bajaj, 0),
    profit: rows.reduce((sum, row) => sum + row.profit, 0),
    due: dueRows.reduce((sum, row) => sum + row.due, 0),
    duePaid: dueRows.reduce((sum, row) => sum + row.paid, 0)
  };
}

function outgoingChequeBankOutflow() {
  return data.outgoingCheques()
    .filter(row => text(row.status).toLowerCase() !== "cancelled")
    .reduce((sum, row) => sum + num(row.amount), 0);
}

function currentBalances() {
  const balances = data.transactions().reduce((balances, row) => {
    const hasExpense = num(row.expense) > 0;
    balances.cash += num(row.cash) - cashExpenseAmount(row);
    balances.bank += (hasExpense ? 0 : num(row.bank)) - bankExpenseAmount(row);
    balances.finance += num(row.bajaj);
    return balances;
  }, { cash: 0, bank: 0, finance: 0 });
  balances.bank -= outgoingChequeBankOutflow();
  return balances;
}

function renderDashboard() {
  updateDashboardRefreshStatus();
  const all = totalsFor();
  const today = totalsFor(todayIso());
  const balances = currentBalances();
  const openDue = all.due - all.duePaid;
  const cheques = data.cheques();
  const pendingCheques = cheques.filter(c => !/^clear$/i.test(c.response)).reduce((s, c) => s + c.amount, 0);
  const kpis = [
    ["Cash in hand", balances.cash, "Cash received minus cash expenses"],
    ["Bank balance", balances.bank, "Bank received minus bank payments and issued cheques"],
    ["Finance balance", balances.finance, "Bajaj finance pending transfer to bank"],
    ["Billed sales", all.billed, "Total billed amount"],
    ["Open dues", openDue, "Due amount minus due paid"],
    ["Pending cheques", pendingCheques, "Not cleared in dropbox"]
  ];
  $("#kpiGrid").innerHTML = kpis.map(([label, value, hint]) => `
    <article class="kpi"><small>${label}</small><strong>${money(value)}</strong><span>${hint}</span></article>
  `).join("");
  $("#todayBreakdown").innerHTML = [
    ["Cash received", today.cash],
    ["Bank received", today.bank],
    ["Expenses", today.expense],
    ["Issued cheques", today.issuedCheque],
    ["Due created", today.due],
    ["Due paid", today.duePaid]
  ].map(([label, value]) => `<div class="summary-row"><span>${label}</span><strong>${money(value)}</strong></div>`).join("");
  renderNotesEditor();
  renderNotesTable();
  const recentQuery = text($("#recentSearch")?.value).toLowerCase();
  const recent = data.transactions()
    .filter(row => !recentQuery || transactionSearchText(row).includes(recentQuery))
    .slice(-12)
    .reverse();
  table($("#recentTransactions"), recentTransactionColumns(), recent);
}

function currentMonthValue() {
  return todayIso().slice(0, 7);
}

function monthBounds(monthValue) {
  const [year, month] = text(monthValue || currentMonthValue()).split("-").map(Number);
  const monthText = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, "0")}`
  };
}

function salesDateRange() {
  const period = $("#salesPeriod")?.value || "month";
  if (period === "today") return { from: todayIso(), to: todayIso(), label: "Today" };
  if (period === "year") return { from: `${todayIso().slice(0, 4)}-01-01`, to: `${todayIso().slice(0, 4)}-12-31`, label: "This year" };
  if (period === "range") return { from: $("#salesFrom")?.value || "", to: $("#salesTo")?.value || "", label: "Custom range" };
  if (period === "all") return { from: "", to: "", label: "All sales" };
  return { ...monthBounds($("#salesMonth")?.value), label: $("#salesMonth")?.value || currentMonthValue() };
}

function salesPaymentMatches(tx, paymentType) {
  if (!paymentType) return true;
  const due = num(tx.billData?.calc?.due) || Math.max(0, num(tx.billed) - num(tx.cash) - num(tx.bank) - num(tx.bajaj));
  return paymentType === "cash" ? num(tx.cash) > 0
    : paymentType === "bank" ? num(tx.bank) > 0
    : paymentType === "bajaj" ? num(tx.bajaj) > 0
    : paymentType === "due" ? due > 0
    : true;
}

function filteredSalesTransactions() {
  const { from, to } = salesDateRange();
  const itemQuery = itemLabel($("#salesItemFilter")?.value);
  const customerQuery = text($("#salesCustomerFilter")?.value).toLowerCase();
  const paymentType = $("#salesPaymentFilter")?.value || "";
  return data.transactions().filter(tx => {
    if (!tx.billData?.items?.length) return false;
    const date = parseDate(tx.date || tx.billData?.tx?.date);
    const itemOk = !itemQuery || tx.billData.items.some(item => itemLabel(item.description).includes(itemQuery));
    const customerText = [
      tx.party,
      tx.customerId,
      tx.mobile,
      tx.billData?.customer?.name,
      tx.billData?.customer?.label
    ].map(text).join(" ").toLowerCase();
    return (!from || date >= from)
      && (!to || date <= to)
      && itemOk
      && (!customerQuery || customerText.includes(customerQuery))
      && salesPaymentMatches(tx, paymentType);
  });
}

function salesLineRows() {
  const itemQuery = itemLabel($("#salesItemFilter")?.value);
  return filteredSalesTransactions().flatMap(tx => {
    const date = parseDate(tx.date || tx.billData?.tx?.date);
    return (tx.billData?.items || [])
      .filter(item => !itemQuery || itemLabel(item.description).includes(itemQuery))
      .map(item => {
        const qty = num(item.qty) || 1;
        const total = num(item.total) || num(item.rate) * qty;
        const taxable = num(item.taxable);
        const tax = num(item.igst) + num(item.cgst) + num(item.sgst) || Math.max(0, total - taxable);
        return {
          date,
          memo: text(tx.memo),
          customer: text(tx.billData?.customer?.label || tx.party),
          item: text(item.description) || "Unknown Item",
          hsn: text(item.hsn),
          qty,
          rate: num(item.rate) || total / qty,
          taxable,
          tax,
          total,
          cash: num(tx.cash),
          bank: num(tx.bank),
          bajaj: num(tx.bajaj),
          due: num(tx.billData?.calc?.due) || Math.max(0, num(tx.billed) - num(tx.cash) - num(tx.bank) - num(tx.bajaj)),
          paymentMode: text(tx.type)
        };
      });
  });
}

function salesSummary() {
  const bills = filteredSalesTransactions();
  const lines = salesLineRows();
  const totals = bills.reduce((sum, tx) => {
    const due = num(tx.billData?.calc?.due) || Math.max(0, num(tx.billed) - num(tx.cash) - num(tx.bank) - num(tx.bajaj));
    sum.billed += num(tx.billed);
    sum.cash += num(tx.cash);
    sum.bank += num(tx.bank);
    sum.bajaj += num(tx.bajaj);
    sum.due += due;
    return sum;
  }, { billed: 0, cash: 0, bank: 0, bajaj: 0, due: 0 });
  totals.received = totals.cash + totals.bank + totals.bajaj;
  totals.itemGross = lines.reduce((sum, row) => sum + row.total, 0);
  totals.tax = lines.reduce((sum, row) => sum + row.tax, 0);
  totals.qty = lines.reduce((sum, row) => sum + row.qty, 0);
  totals.bills = bills.length;
  totals.items = new Set(lines.map(row => itemLabel(row.item))).size;
  return { bills, lines, totals };
}

function groupRows(rows, keyFn, seedFn, updateFn) {
  const map = new Map();
  rows.forEach(row => {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, seedFn(row));
    updateFn(map.get(key), row);
  });
  return [...map.values()];
}

function salesItemRows() {
  return groupRows(
    salesLineRows(),
    row => itemLabel(row.item),
    row => ({ item: row.item, hsn: row.hsn, qty: 0, total: 0, taxable: 0, tax: 0, bills: new Set(), avgRate: 0, lastDate: "" }),
    (record, row) => {
      record.qty += row.qty;
      record.total += row.total;
      record.taxable += row.taxable;
      record.tax += row.tax;
      record.bills.add(row.memo);
      record.lastDate = row.date >= record.lastDate ? row.date : record.lastDate;
      record.avgRate = record.qty ? record.total / record.qty : 0;
    }
  ).map(row => ({ ...row, bills: row.bills.size })).sort((a, b) => b.total - a.total);
}

function salesDateRows() {
  return groupRows(
    salesLineRows(),
    row => row.date || "No date",
    row => ({ date: row.date || "No date", qty: 0, total: 0, tax: 0, bills: new Set(), items: new Set() }),
    (record, row) => {
      record.qty += row.qty;
      record.total += row.total;
      record.tax += row.tax;
      record.bills.add(row.memo);
      record.items.add(itemLabel(row.item));
    }
  ).map(row => ({ ...row, bills: row.bills.size, items: row.items.size })).sort((a, b) => text(b.date).localeCompare(text(a.date)));
}

function salesCustomerRows() {
  return groupRows(
    salesLineRows(),
    row => text(row.customer).toLowerCase() || "unknown",
    row => ({ customer: row.customer || "Unknown Customer", qty: 0, total: 0, tax: 0, bills: new Set(), items: new Set(), lastDate: "" }),
    (record, row) => {
      record.qty += row.qty;
      record.total += row.total;
      record.tax += row.tax;
      record.bills.add(row.memo);
      record.items.add(itemLabel(row.item));
      record.lastDate = row.date >= record.lastDate ? row.date : record.lastDate;
    }
  ).map(row => ({ ...row, bills: row.bills.size, items: row.items.size })).sort((a, b) => b.total - a.total);
}

function salesBillRows() {
  return filteredSalesTransactions().map(tx => {
    const lines = (tx.billData?.items || []).filter(item => {
      const itemQuery = itemLabel($("#salesItemFilter")?.value);
      return !itemQuery || itemLabel(item.description).includes(itemQuery);
    });
    return {
      date: parseDate(tx.date || tx.billData?.tx?.date),
      memo: text(tx.memo),
      customer: text(tx.billData?.customer?.label || tx.party),
      items: lines.length,
      qty: lines.reduce((sum, item) => sum + (num(item.qty) || 1), 0),
      billed: num(tx.billed),
      cash: num(tx.cash),
      bank: num(tx.bank),
      bajaj: num(tx.bajaj),
      due: num(tx.billData?.calc?.due) || Math.max(0, num(tx.billed) - num(tx.cash) - num(tx.bank) - num(tx.bajaj)),
      paymentMode: text(tx.type)
    };
  }).sort((a, b) => text(b.date).localeCompare(text(a.date)));
}

function applySalesPeriodControls() {
  const period = $("#salesPeriod")?.value || "month";
  const monthInput = $("#salesMonth");
  const fromInput = $("#salesFrom");
  const toInput = $("#salesTo");
  if (monthInput && !monthInput.value) monthInput.value = currentMonthValue();
  if (monthInput) monthInput.disabled = period !== "month";
  if (fromInput) fromInput.closest("label").hidden = period !== "range";
  if (toInput) toInput.closest("label").hidden = period !== "range";
  if (fromInput) fromInput.disabled = period !== "range";
  if (toInput) toInput.disabled = period !== "range";
}

function renderSalesDashboard() {
  if (!$("#salesKpiGrid")) return;
  applySalesPeriodControls();
  const { totals } = salesSummary();
  $("#salesKpiGrid").innerHTML = [
    ["Bills", totals.bills, "Sales receipts"],
    ["Billed Sales", money(totals.billed), "After discount"],
    ["Items Sold", totals.qty, `${totals.items} item types`],
    ["Item Gross", money(totals.itemGross), "Before bill discount"],
    ["Received", money(totals.received), `Cash ${money(totals.cash)} / Bank ${money(totals.bank)}`],
    ["Due Sales", money(totals.due), `Bajaj ${money(totals.bajaj)}`],
    ["GST / Tax", money(totals.tax), "From sold items"]
  ].map(([label, value, hint]) => `
    <article class="kpi sales-kpi"><small>${label}</small><strong>${value}</strong><span>${hint}</span></article>
  `).join("");

  table($("#salesItemTable"), [
    { label: "Item", key: "item" },
    { label: "HSN", key: "hsn" },
    { label: "Qty Sold", key: "qty", num: true },
    { label: "Avg Rate", key: "avgRate", num: true, render: r => money2(r.avgRate) },
    { label: "Taxable", key: "taxable", num: true, render: r => money2(r.taxable) },
    { label: "GST / Tax", key: "tax", num: true, render: r => money2(r.tax) },
    { label: "Gross Sales", key: "total", num: true, render: r => money2(r.total) },
    { label: "Bills", key: "bills", num: true },
    { label: "Last Sold", key: "lastDate" }
  ], salesItemRows());

  table($("#salesDateTable"), [
    { label: "Date", key: "date" },
    { label: "Bills", key: "bills", num: true },
    { label: "Items", key: "items", num: true },
    { label: "Qty Sold", key: "qty", num: true },
    { label: "GST / Tax", key: "tax", num: true, render: r => money2(r.tax) },
    { label: "Gross Sales", key: "total", num: true, render: r => money2(r.total) }
  ], salesDateRows());

  table($("#salesCustomerTable"), [
    { label: "Customer", key: "customer" },
    { label: "Bills", key: "bills", num: true },
    { label: "Items", key: "items", num: true },
    { label: "Qty Sold", key: "qty", num: true },
    { label: "GST / Tax", key: "tax", num: true, render: r => money2(r.tax) },
    { label: "Gross Sales", key: "total", num: true, render: r => money2(r.total) },
    { label: "Last Sale", key: "lastDate" }
  ], salesCustomerRows());

  table($("#salesBillTable"), [
    { label: "Date", key: "date" },
    { label: "Memo", key: "memo", render: r => `<button type="button" class="memo-bill-link" data-bill-memo="${html(r.memo)}">${html(r.memo)}</button>` },
    { label: "Customer", key: "customer" },
    { label: "Items", key: "items", num: true },
    { label: "Qty", key: "qty", num: true },
    { label: "Billed", key: "billed", num: true, render: r => money2(r.billed) },
    { label: "Cash", key: "cash", num: true, render: r => money2(r.cash) },
    { label: "Bank", key: "bank", num: true, render: r => money2(r.bank) },
    { label: "Bajaj", key: "bajaj", num: true, render: r => money2(r.bajaj) },
    { label: "Due", key: "due", num: true, render: r => money2(r.due) },
    { label: "Mode", key: "paymentMode" }
  ], salesBillRows());
}

function salesDashboardExportRows() {
  return salesLineRows().map(row => ({
    date: row.date,
    memo: row.memo,
    customer: row.customer,
    item: row.item,
    hsn: row.hsn,
    qty: row.qty,
    rate: decimal2(row.rate),
    taxable: decimal2(row.taxable),
    tax: decimal2(row.tax),
    total: decimal2(row.total),
    cash: decimal2(row.cash),
    bank: decimal2(row.bank),
    bajaj: decimal2(row.bajaj),
    due: decimal2(row.due),
    paymentMode: row.paymentMode
  }));
}

function currentNoteCounts(type) {
  return Object.fromEntries(noteDenominations.map(note => {
    const input = document.querySelector(`[data-note-${type}="${note}"]`);
    return [note, num(input?.value)];
  }));
}

function noteRowTotal(note, inCount, outCount) {
  return num(note) * num(inCount) - num(note) * num(outCount);
}

function noteTotal(inCounts, outCounts, denominations = noteDenominations) {
  return denominations.reduce((sum, note) => {
    return sum + noteRowTotal(note, inCounts?.[note], outCounts?.[note]);
  }, 0);
}

function cleanDenominations(values) {
  return [...new Set((values || []).map(num).filter(value => value > 0))]
    .sort((a, b) => b - a);
}

function getSettingValue(key) {
  const seedValue = seedRows("settings").find(setting => setting.key === key)?.value;
  if (seedValue !== undefined) return seedValue;
  return (user.settings || []).find(setting => setting.key === key)?.value;
}

async function saveSettingValue(key, value) {
  if (apiAvailable) {
    const saved = await apiSaveSetting(key, value);
    const settings = seed.settings || [];
    const index = settings.findIndex(setting => setting.key === key);
    if (index >= 0) settings[index] = saved;
    else settings.push(saved);
    seed.settings = settings;
  } else {
    const settings = user.settings || [];
    const index = settings.findIndex(setting => setting.key === key);
    const record = { key, value };
    const before = index >= 0 ? { ...settings[index] } : null;
    if (index >= 0) settings[index] = record;
    else settings.push(record);
    user.settings = settings;
    recordLocalAudit({ action: "edit", collection: "settings", before, after: record, recordId: key });
    saveUser();
  }
}

async function syncLocalDataToServer() {
  if (!localPendingCounts()) {
    toast("No local records to sync.");
    updateStorageSettingsStatus();
    return;
  }

  const previousApiAvailable = apiAvailable;
  try {
    const total = localPendingCounts();
    const synced = await apiRequest("/api/sync", {
      method: "POST",
      body: JSON.stringify(user)
    });
    const business = seed?.business || { name: "G.S. STEEL FURNITURE", place: "Tufanganj, CoochBehar", state: "West Bengal", stateCode: "19", gstin: "19AATFG0007G1ZH" };
    seed = { business, ...(synced.bootstrap || {}) };
    user = emptyUserData();
    saveUser();
    apiConnected = true;
    apiAvailable = storageMode !== "local";
    fillSettingsForm();
    renderAll();
    toast(`Synced ${total} local record${total === 1 ? "" : "s"} to Cloud.`);
  } catch {
    apiAvailable = previousApiAvailable;
    toast("Sync failed. Run through the backend server with Cloud connected.");
    updateStorageSettingsStatus();
  }
}

async function refreshDashboardFromServer() {
  const button = $("#dashboardRefreshBtn");
  const status = $("#dashboardRefreshStatus");
  const setStatus = message => {
    if (status) status.textContent = message;
  };

  if (isOfflineToken()) {
    setStatus("Online login is required before refreshing from Cloud.");
    toast("Please login online before refreshing from server.");
    return;
  }

  const previousApiAvailable = apiAvailable;
  let localCleared = false;
  if (button) button.disabled = true;

  try {
    const pending = localPendingCounts();
    if (pending) {
      setStatus(`Uploading ${pending} local record${pending === 1 ? "" : "s"}...`);
      await apiRequest("/api/sync", {
        method: "POST",
        body: JSON.stringify(user)
      });
    } else {
      setStatus("No local records pending. Fetching Cloud data...");
    }

    setStatus("Clearing local browser data...");
    clearLocalCashbookData();
    user = emptyUserData();
    saveUser();
    localCleared = true;

    setStatus("Fetching latest Cloud data...");
    const business = seed?.business || { name: "G.S. STEEL FURNITURE", place: "Tufanganj, CoochBehar", state: "West Bengal", stateCode: "19", gstin: "19AATFG0007G1ZH" };
    const bootstrap = await apiRequest(BOOTSTRAP_PATH);
    seed = { business, ...bootstrap };
    apiConnected = true;
    saveStorageMode("auto");
    apiAvailable = true;
    fillSettingsForm();
    renderAll();
    setStatus(`Refresh complete. ${pending ? "Local data synced and " : ""}Cloud data loaded.`);
    toast("Dashboard refreshed from server.");
  } catch {
    apiAvailable = previousApiAvailable;
    setStatus(localCleared ? "Upload completed, but fetching Cloud data failed." : "Refresh failed. Local data was not cleared.");
    toast(localCleared ? "Upload completed, but refresh fetch failed." : "Refresh failed. Check server and Cloud connection.");
    updateStorageSettingsStatus();
  } finally {
    if (button) button.disabled = false;
  }
}

