function dueSummary(rows = data.dues()) {
  const map = new Map();
  rows.forEach(row => {
    const key = row.name || "Unknown";
    if (!map.has(key)) map.set(key, { name: key, due: 0, paid: 0, balance: 0, lastMemo: "", lastDate: "" });
    const rec = map.get(key);
    rec.due += num(row.due);
    rec.paid += num(row.paid);
    rec.balance = rec.due - rec.paid;
    if (row.date >= rec.lastDate) {
      rec.lastDate = row.date;
      rec.lastMemo = row.memo;
    }
  });
  return [...map.values()].sort((a, b) => b.balance - a.balance);
}

function dueTotals(rows) {
  return rows.reduce((totals, row) => {
    totals.due += num(row.due);
    totals.paid += num(row.paid);
    totals.balance += num(row.balance);
    return totals;
  }, { due: 0, paid: 0, balance: 0 });
}

function appendDueTotalRow(tableNode, rows, options = {}) {
  const totals = dueTotals(rows);
  const labelColspan = options.labelColspan || 2;
  const trailingCells = options.trailingCells ?? 4;
  tableNode.insertAdjacentHTML("beforeend", `
    <tfoot>
      <tr class="table-total-row due-total-row">
        <td colspan="${labelColspan}"><strong>Total (${rows.length} records)</strong></td>
        <td class="num"><strong>${money(totals.due)}</strong></td>
        <td class="num"><strong>${money(totals.paid)}</strong></td>
        <td class="num"><strong>${money(totals.balance)}</strong></td>
        ${Array.from({ length: trailingCells }, () => "<td></td>").join("")}
      </tr>
    </tfoot>
  `);
}

function dueFilterState() {
  return {
    q: text($("#dueSearch").value).toLowerCase(),
    status: $("#dueStatus").value
  };
}

function dueCustomerBalances() {
  return data.dues().reduce((map, row) => {
    const key = text(row.name).toLowerCase() || "unknown";
    map.set(key, (map.get(key) || 0) + num(row.due) - num(row.paid));
    return map;
  }, new Map());
}

function filteredDueRows() {
  const { q, status } = dueFilterState();
  const customerBalances = dueCustomerBalances();
  return data.dues().map((row, index) => ({ ...row, head: dueHead(row), dueIndex: index, balance: num(row.due) - num(row.paid) }))
    .filter(row => {
      const customerBalance = customerBalances.get(text(row.name).toLowerCase() || "unknown") || 0;
      const statusOk = status === "all" || (status === "open" ? customerBalance > 0 : customerBalance <= 0);
      const hay = `${row.name} ${row.head} ${row.memo} ${row.remark}`.toLowerCase();
      return statusOk && (!q || hay.includes(q));
    })
    .slice()
    .reverse();
}

function filteredDueSummaryRows() {
  const { q, status } = dueFilterState();
  return dueSummary(data.dues())
    .filter(row => {
      const statusOk = status === "all" || (status === "open" ? row.balance > 0 : row.balance <= 0);
      const hay = `${row.name} ${row.lastMemo} ${row.lastDate}`.toLowerCase();
      return statusOk && (!q || hay.includes(q));
    });
}

function renderDueTabs() {
  $$("[data-due-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.dueTab === dueActiveTab);
  });
  $$("[data-due-panel]").forEach(panel => {
    panel.hidden = panel.dataset.duePanel !== dueActiveTab;
  });
}

function renderDues() {
  renderDueTabs();
  const rows = filteredDueRows();
  const summaryRows = filteredDueSummaryRows();
  renderDueRegisterTable(rows);
  renderDueSummaryTable(summaryRows);
}

function renderDueRegisterTable(rows) {
  const pageInfo = paginateRows(rows, duePage);
  duePage = pageInfo.currentPage;
  const dueTable = $("#dueTable");
  table(dueTable, [
    { label: "Customer", key: "name" },
    { label: "Head", key: "head" },
    { label: "Due", key: "due", num: true, render: r => money(r.due) },
    { label: "Paid", key: "paid", num: true, render: r => money(r.paid) },
    { label: "Balance", key: "balance", num: true, render: r => money(r.balance) },
    { label: "Memo", key: "memo" },
    { label: "Date", key: "date" },
    { label: "Remark", key: "remark" },
    { label: "Action", key: "action", render: r => dueActionMarkup(r.dueIndex) }
  ], pageInfo.rows);
  appendDueTotalRow(dueTable, rows);
  renderPagination($("#duePagination"), pageInfo, page => {
    duePage = page;
    renderDues();
  });
}

function renderDueSummaryTable(rows) {
  const pageInfo = paginateRows(rows, dueSummaryPage);
  dueSummaryPage = pageInfo.currentPage;
  const summaryTable = $("#dueSummaryTable");
  table(summaryTable, [
    { label: "Customer", key: "name" },
    { label: "Due", key: "due", num: true, render: r => money(r.due) },
    { label: "Paid", key: "paid", num: true, render: r => money(r.paid) },
    { label: "Balance", key: "balance", num: true, render: r => money(r.balance) },
    { label: "Last Memo", key: "lastMemo" },
    { label: "Last Date", key: "lastDate" }
  ], pageInfo.rows);
  appendDueTotalRow(summaryTable, rows, { labelColspan: 1, trailingCells: 2 });
  renderPagination($("#dueSummaryPagination"), pageInfo, page => {
    dueSummaryPage = page;
    renderDues();
  });
}

function dueRegisterExportRows() {
  return filteredDueRows().map(row => ({
    customer: row.name,
    head: row.head,
    due: row.due,
    paid: row.paid,
    balance: row.balance,
    memo: row.memo,
    date: row.date,
    remark: row.remark
  }));
}

function dueSummaryExportRows() {
  return filteredDueSummaryRows().map(row => ({
    customer: row.name,
    due: row.due,
    paid: row.paid,
    balance: row.balance,
    lastMemo: row.lastMemo,
    lastDate: row.lastDate
  }));
}

function duePrintHtml() {
  const profile = businessProfile();
  const isSummary = dueActiveTab === "summary";
  const rows = isSummary ? dueSummaryExportRows() : dueRegisterExportRows();
  const totals = rows.reduce((sum, row) => {
    sum.due += num(row.due);
    sum.paid += num(row.paid);
    sum.balance += num(row.balance);
    return sum;
  }, { due: 0, paid: 0, balance: 0 });
  const statusLabel = $("#dueStatus")?.selectedOptions?.[0]?.textContent || "All customers";
  const search = text($("#dueSearch")?.value);
  const title = isSummary ? "Due Summary" : "Due Register";
  const headers = isSummary
    ? ["Customer", "Due", "Paid", "Balance", "Last Memo", "Last Date"]
    : ["Customer", "Head", "Due", "Paid", "Balance", "Memo", "Date", "Remark"];
  const body = rows.map(row => isSummary ? `
    <tr>
      <td>${html(row.customer)}</td>
      <td class="num">${money(row.due)}</td>
      <td class="num">${money(row.paid)}</td>
      <td class="num">${money(row.balance)}</td>
      <td>${html(row.lastMemo)}</td>
      <td>${html(row.lastDate)}</td>
    </tr>
  ` : `
    <tr>
      <td>${html(row.customer)}</td>
      <td>${html(row.head)}</td>
      <td class="num">${money(row.due)}</td>
      <td class="num">${money(row.paid)}</td>
      <td class="num">${money(row.balance)}</td>
      <td>${html(row.memo)}</td>
      <td>${html(row.date)}</td>
      <td>${html(row.remark)}</td>
    </tr>
  `).join("");
  const totalColspan = isSummary ? 1 : 2;
  const trailingCells = isSummary ? "<td></td><td></td>" : "<td></td><td></td><td></td>";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
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
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
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
  <div class="toolbar"><button type="button" onclick="window.print()">Print ${html(title)}</button></div>
  <main>
    <header>
      <h1>${html(profile.name)}</h1>
      <p>${html(profile.address)} | GSTIN: ${html(profile.gstin)}</p>
      <h2>${html(title)}</h2>
      <p>Status: ${html(statusLabel)}${search ? ` | Search: ${html(search)}` : ""} | Generated on ${new Date().toLocaleDateString("en-IN")}</p>
    </header>
    <table>
      <thead><tr>${headers.map(label => `<th>${html(label)}</th>`).join("")}</tr></thead>
      <tbody>${body || `<tr><td colspan="${headers.length}">No due records found.</td></tr>`}</tbody>
      <tfoot>
        <tr>
          <td colspan="${totalColspan}">Total</td>
          <td class="num">${money(totals.due)}</td>
          <td class="num">${money(totals.paid)}</td>
          <td class="num">${money(totals.balance)}</td>
          ${trailingCells}
        </tr>
      </tfoot>
    </table>
  </main>
</body>
</html>`;
}

function printDues() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return toast("Allow popups to print due register.");
  printWindow.document.write(duePrintHtml());
  printWindow.document.close();
  printWindow.focus();
}

function dueHead(row) {
  const storedHead = text(row.head);
  if (storedHead) return storedHead;
  const memo = text(row.memo);
  const name = text(row.name).toLowerCase();
  const matchingTransaction = data.transactions().find(tx => {
    if (memo && text(tx.memo) !== memo) return false;
    return !name || text(tx.party).toLowerCase() === name;
  });
  if (matchingTransaction?.head) return text(matchingTransaction.head);
  if (num(row.paid) > 0 && num(row.due) === 0) return "Due Paid";
  if (num(row.due) > 0) return "Due";
  return "";
}

function dueActionMarkup(index) {
  return `
    <div class="ledger-actions">
      ${rowUnlockButton("due", index)}
      <button type="button" class="symbol-btn edit-symbol" data-edit-due="${index}" title="Edit due" aria-label="Edit due"${actionControlAttrs("due", index, "Edit due")}>&#9998;</button>
      <button type="button" class="symbol-btn delete-symbol" data-delete-due="${index}" title="Delete due" aria-label="Delete due"${actionControlAttrs("due", index, "Delete due")}>&#128465;</button>
    </div>
  `;
}

