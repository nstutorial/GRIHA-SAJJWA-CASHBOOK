function renderPurchases() {
  const q = text($("#purchaseSearch").value).toLowerCase();
  const rows = data.purchases()
    .map((row, index) => ({ ...row, purchaseIndex: index }))
    .filter(p => `${p.date} ${p.supplier} ${p.item} ${p.billNo} ${p.remark}`.toLowerCase().includes(q))
    .slice(-1000)
    .reverse();
  table($("#purchaseTable"), [
    { label: "Date", key: "date" },
    { label: "Supplier", key: "supplier" },
    { label: "Item", key: "item" },
    { label: "Qty Purchased", key: "qty", num: true },
    { label: "Bill No.", key: "billNo" },
    { label: "Bill Amount", key: "amount", num: true, render: r => money(r.amount) },
    { label: "Paid", key: "paid", num: true, render: r => money(r.paid) },
    { label: "Remark", key: "remark" },
    { label: "Action", key: "action", render: r => `
      <div class="ledger-actions">
        ${rowUnlockButton("purchase", r.purchaseIndex)}
        <button type="button" class="symbol-btn edit-symbol" data-edit-purchase="${r.purchaseIndex}" title="Edit purchase" aria-label="Edit purchase"${actionControlAttrs("purchase", r.purchaseIndex, "Edit purchase")}>&#9998;</button>
        <button type="button" class="symbol-btn delete-symbol" data-delete-purchase="${r.purchaseIndex}" title="Delete purchase" aria-label="Delete purchase"${actionControlAttrs("purchase", r.purchaseIndex, "Delete purchase")}>&#128465;</button>
      </div>
    ` }
  ], rows);
}

function sameSupplierName(left, right) {
  return text(left).toLowerCase() === text(right).toLowerCase();
}

function supplierHasPurchases(supplierName) {
  return data.purchases().some(row => sameSupplierName(row.supplier, supplierName));
}

function supplierHasRelatedTransactions(supplierName) {
  return supplierHasPurchases(supplierName)
    || data.transactions().some(row => sameSupplierName(row.party, supplierName))
    || data.outgoingCheques().some(row => sameSupplierName(row.supplier, supplierName))
    || data.supplierOpeningBalances().some(row => sameSupplierName(row.supplier, supplierName));
}

function supplierSummary() {
  const map = new Map();
  const ensureSupplierRecord = supplier => {
    const name = text(supplier) || "Unknown Supplier";
    const key = name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        supplier: name,
        supplierId: "",
        mobile: "",
        gstin: "",
        totalPurchase: 0,
        openingBalance: 0,
        purchasePayment: 0,
        chequePayment: 0,
        totalPayment: 0,
        balance: 0,
        bills: 0,
        lastBillNo: "",
        lastDate: "",
        lastPayment: "",
        remark: ""
      });
    }
    return map.get(key);
  };
  const updateSupplierBalance = record => {
    record.totalPayment = num(record.purchasePayment) + num(record.chequePayment);
    record.balance = num(record.openingBalance) + num(record.totalPurchase) - num(record.totalPayment);
  };
  data.suppliers().forEach(row => {
    const supplier = text(row.name);
    if (!supplier) return;
    const record = ensureSupplierRecord(supplier);
    record.mobile = text(row.mobile);
    record.gstin = text(row.gstin);
    record.remark = text(row.remark);
    record.supplierId = text(row._id);
    record.openingBalance += num(row.openingBalance);
  });
  data.purchases().forEach(row => {
    const record = ensureSupplierRecord(row.supplier);
    record.totalPurchase += num(row.amount);
    record.purchasePayment += num(row.paid);
    updateSupplierBalance(record);
    record.bills += 1;
    if (row.date >= record.lastDate) {
      record.lastDate = row.date;
      record.lastBillNo = row.billNo;
    }
  });
  data.supplierOpeningBalances().forEach(row => {
    const record = ensureSupplierRecord(row.supplier);
    record.openingBalance += num(row.amount);
    updateSupplierBalance(record);
  });
  data.outgoingCheques().forEach(row => {
    if (text(row.status).toLowerCase() === "cancelled") return;
    const record = ensureSupplierRecord(row.supplier);
    record.chequePayment += num(row.amount);
    updateSupplierBalance(record);
    if (row.chequeDate >= text(record.lastPayment)) {
      record.lastPayment = row.chequeDate;
    }
  });
  return [...map.values()]
    .map(record => {
      updateSupplierBalance(record);
      return record;
    })
    .sort((a, b) => b.balance - a.balance || a.supplier.localeCompare(b.supplier));
}

function filteredSuppliers() {
  const q = text($("#supplierSearch").value).toLowerCase();
  const status = $("#supplierBalanceStatus").value;
  return supplierSummary().filter(row => {
    const hay = `${row.supplier} ${row.mobile} ${row.gstin} ${row.lastBillNo} ${row.lastDate} ${row.lastPayment} ${row.remark}`.toLowerCase();
    const statusOk = status === "outstanding" ? row.balance > 0
      : status === "paid" ? row.balance <= 0
      : true;
    return statusOk && (!q || hay.includes(q));
  });
}

function renderSuppliers() {
  const rows = filteredSuppliers();
  const totals = rows.reduce((sum, row) => {
    sum.purchase += row.totalPurchase;
    sum.payment += row.totalPayment;
    sum.balance += row.balance;
    return sum;
  }, { purchase: 0, payment: 0, balance: 0 });
  $("#supplierSummaryCards").innerHTML = [
    ["Suppliers", rows.length, "Total records"],
    ["Opening Balance", money(rows.reduce((sum, row) => sum + row.openingBalance, 0)), "Balances as on 1 April"],
    ["Total Purchase", money(totals.purchase), "Bills from suppliers"],
    ["Total Payment", money(totals.payment), "Paid to suppliers"],
    ["Outstanding", money(totals.balance), "Balance payable"]
  ].map(([label, value, hint]) => `
    <article class="cheque-summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `).join("");
  table($("#supplierTable"), [
    { label: "Supplier", key: "supplier" },
    { label: "Opening Balance", key: "openingBalance", num: true, render: r => money(r.openingBalance) },
    { label: "Total Purchase", key: "totalPurchase", num: true, render: r => money(r.totalPurchase) },
    { label: "Total Payment", key: "totalPayment", num: true, render: r => money(r.totalPayment) },
    { label: "Cheque Payment", key: "chequePayment", num: true, render: r => money(r.chequePayment) },
    { label: "Balance Outstanding", key: "balance", num: true, render: r => money(r.balance) },
    { label: "Bills", key: "bills", num: true },
    { label: "Mobile", key: "mobile" },
    { label: "GSTIN", key: "gstin" },
    { label: "Last Bill", key: "lastBillNo" },
    { label: "Last Date", key: "lastDate" },
    { label: "Last Payment", key: "lastPayment" },
    { label: "Action", key: "action", render: r => `<div class="ledger-actions"><button type="button" class="secondary" data-edit-supplier="${html(encodeURIComponent(r.supplier))}">Edit</button><button type="button" class="secondary" data-supplier-ledger="${html(encodeURIComponent(r.supplier))}">Ledger</button>${supplierHasRelatedTransactions(r.supplier) ? "" : `<button type="button" class="delete-symbol" data-delete-supplier="${html(encodeURIComponent(r.supplier))}" title="Delete supplier" aria-label="Delete supplier">&#128465;</button>`}</div>` }
  ], rows, {
    onRender: bindSupplierActions
  });
}

function supplierManagementPrintHtml() {
  const profile = businessProfile();
  const rows = filteredSuppliers();
  const totals = rows.reduce((sum, row) => {
    sum.purchase += num(row.totalPurchase);
    sum.payment += num(row.totalPayment);
    sum.chequePayment += num(row.chequePayment);
    sum.balance += num(row.balance);
    sum.bills += num(row.bills);
    return sum;
  }, { purchase: 0, payment: 0, chequePayment: 0, balance: 0, bills: 0 });
  const statusLabel = $("#supplierBalanceStatus")?.selectedOptions?.[0]?.textContent || "All suppliers";
  const search = text($("#supplierSearch")?.value);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Supplier Management</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f3f4f6; }
    .toolbar { max-width: 1180px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; background: #165f4c; color: #fff; cursor: pointer; }
    main { max-width: 1180px; margin: 0 auto; border: 1.5px solid #6b7280; background: #fff; }
    header { padding: 18px 20px; border-bottom: 1.5px solid #6b7280; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 24px; }
    h2 { margin-top: 10px; font-size: 18px; }
    p { margin-top: 6px; color: #4b5563; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 7px 6px; border: 1px solid #cbd5e1; vertical-align: top; }
    th, tfoot td { background: #f8fafc; font-weight: 700; }
    .num { text-align: right; white-space: nowrap; }
    @media print {
      body { padding: 0; background: #fff; }
      .toolbar { display: none; }
      main { max-width: none; border-width: 1px; }
      @page { size: landscape; margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">Print Supplier Management</button></div>
  <main>
    <header>
      <h1>${html(profile.name)}</h1>
      <p>${html(profile.address)} | GSTIN: ${html(profile.gstin)}</p>
      <h2>Supplier Management</h2>
      <p>Status: ${html(statusLabel)}${search ? ` | Search: ${html(search)}` : ""} | Generated on ${new Date().toLocaleDateString("en-IN")}</p>
    </header>
    <table>
      <thead>
        <tr>
          <th>Supplier</th><th>Total Purchase</th><th>Total Payment</th><th>Cheque Payment</th><th>Balance Outstanding</th>
          <th>Bills</th><th>Mobile</th><th>GSTIN</th><th>Last Bill</th><th>Last Date</th><th>Last Payment</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${html(row.supplier)}</td>
            <td class="num">${money(row.totalPurchase)}</td>
            <td class="num">${money(row.totalPayment)}</td>
            <td class="num">${money(row.chequePayment)}</td>
            <td class="num">${money(row.balance)}</td>
            <td class="num">${html(row.bills)}</td>
            <td>${html(row.mobile)}</td>
            <td>${html(row.gstin)}</td>
            <td>${html(row.lastBillNo)}</td>
            <td>${html(row.lastDate)}</td>
            <td>${html(row.lastPayment)}</td>
          </tr>
        `).join("") || `<tr><td colspan="11">No supplier records found.</td></tr>`}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td class="num">${money(totals.purchase)}</td>
          <td class="num">${money(totals.payment)}</td>
          <td class="num">${money(totals.chequePayment)}</td>
          <td class="num">${money(totals.balance)}</td>
          <td class="num">${html(totals.bills)}</td>
          <td colspan="5"></td>
        </tr>
      </tfoot>
    </table>
  </main>
</body>
</html>`;
}

function printSuppliers() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return toast("Allow popups to print supplier management.");
  printWindow.document.write(supplierManagementPrintHtml());
  printWindow.document.close();
  printWindow.focus();
}

function supplierLedgerRows(supplierName) {
  const key = text(supplierName).toLowerCase();
  const rows = [];
  data.purchases()
    .filter(row => text(row.supplier).toLowerCase() === key)
    .forEach(row => {
      rows.push({
        date: row.date,
        type: "Purchase",
        ref: row.billNo,
        details: [row.item, row.remark].map(text).filter(Boolean).join(" - "),
        debit: num(row.amount),
        credit: num(row.paid)
      });
    });
  data.outgoingCheques()
    .filter(row => text(row.supplier).toLowerCase() === key && text(row.status).toLowerCase() !== "cancelled")
    .forEach(row => {
      rows.push({
        date: row.chequeDate,
        type: "Cheque Payment",
        ref: row.chequeNo,
        details: [row.bank, row.status, row.purpose].map(text).filter(Boolean).join(" - "),
        debit: 0,
        credit: num(row.amount)
      });
    });
  let balance = 0;
  return rows
    .sort((a, b) => text(a.date).localeCompare(text(b.date)) || text(a.type).localeCompare(text(b.type)))
    .map(row => {
      balance += num(row.debit) - num(row.credit);
      return { ...row, balance };
    });
}

function supplierLedgerHtml(supplierName) {
  const profile = businessProfile();
  const rows = supplierLedgerRows(supplierName);
  const totals = rows.reduce((sum, row) => {
    sum.debit += num(row.debit);
    sum.credit += num(row.credit);
    sum.balance = num(row.balance);
    return sum;
  }, { debit: 0, credit: 0, balance: 0 });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Supplier Ledger - ${html(supplierName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f3f4f6; }
    .toolbar { max-width: 1080px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; background: #165f4c; color: #fff; cursor: pointer; }
    main { max-width: 1080px; margin: 0 auto; border: 1.5px solid #6b7280; background: #fff; }
    header { padding: 18px 20px; border-bottom: 1.5px solid #6b7280; }
    h1, h2, p { margin: 0; }
    h1 { font-size: 24px; }
    h2 { margin-top: 10px; font-size: 18px; }
    p { margin-top: 6px; color: #4b5563; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px 7px; border: 1px solid #cbd5e1; vertical-align: top; }
    th, tfoot td { background: #f8fafc; font-weight: 700; }
    .num { text-align: right; white-space: nowrap; }
    @media print {
      body { padding: 0; background: #fff; }
      .toolbar { display: none; }
      main { max-width: none; border-width: 1px; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button type="button" onclick="window.print()">Print Supplier Ledger</button></div>
  <main>
    <header>
      <h1>${html(profile.name)}</h1>
      <p>${html(profile.address)} | GSTIN: ${html(profile.gstin)}</p>
      <h2>Supplier Ledger: ${html(supplierName)}</h2>
      <p>Generated on ${new Date().toLocaleDateString("en-IN")}</p>
    </header>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Reference</th><th>Details</th><th>Purchase</th><th>Payment</th><th>Balance</th></tr></thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td>${html(row.date)}</td>
            <td>${html(row.type)}</td>
            <td>${html(row.ref)}</td>
            <td>${html(row.details)}</td>
            <td class="num">${money(row.debit)}</td>
            <td class="num">${money(row.credit)}</td>
            <td class="num">${money(row.balance)}</td>
          </tr>
        `).join("") || `<tr><td colspan="7">No ledger entries found.</td></tr>`}
      </tbody>
      <tfoot><tr><td colspan="4">Total</td><td class="num">${money(totals.debit)}</td><td class="num">${money(totals.credit)}</td><td class="num">${money(totals.balance)}</td></tr></tfoot>
    </table>
  </main>
</body>
</html>`;
}

function openSupplierLedger(supplierName) {
  const ledgerWindow = window.open("", "_blank");
  if (!ledgerWindow) return toast("Please allow popups to open supplier ledger.");
  ledgerWindow.document.open();
  ledgerWindow.document.write(supplierLedgerHtml(supplierName));
  ledgerWindow.document.close();
  ledgerWindow.focus();
}

function bindSupplierActions(node) {
  $$("[data-supplier-ledger]", node).forEach(button => {
    button.addEventListener("click", () => openSupplierLedger(decodeURIComponent(button.dataset.supplierLedger)));
  });
  $$("[data-edit-supplier]", node).forEach(button => {
    button.addEventListener("click", () => openSupplierEditor(decodeURIComponent(button.dataset.editSupplier)));
  });
  $$("[data-delete-supplier]", node).forEach(button => {
    button.addEventListener("click", () => deleteSupplier(decodeURIComponent(button.dataset.deleteSupplier)));
  });
}

async function deleteSupplier(supplierName) {
  const supplier = data.suppliers().find(row => sameSupplierName(row.name, supplierName));
  if (!supplier) return toast("Supplier not found.");
  if (supplierHasRelatedTransactions(supplierName)) {
    renderAll();
    return toast("This supplier has transactions and cannot be deleted.");
  }
  if (!confirm(`Delete supplier ${supplier.name}?`)) return;
  if (apiAvailable && supplier._id) {
    await apiDelete("suppliers", supplier._id);
    seed.suppliers = seed.suppliers.filter(row => text(row._id) !== text(supplier._id));
  } else {
    user.suppliers = (user.suppliers || []).filter(row => !sameSupplierName(row.name, supplierName));
    saveUser();
  }
  renderAll();
  toast("Supplier deleted.");
}

