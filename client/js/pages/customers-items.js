function customerRowsForTable() {
  const q = text($("#customerSearch").value).toLowerCase();
  return data.customers().map((customer, index) => ({ ...customer, customerIndex: index }))
    .filter(c => `${c.id} ${c.name} ${c.mobile} ${c.address} ${c.city} ${c.stateCode} ${c.gstin}`.toLowerCase().includes(q))
    .slice(0, 1000);
}

function renderCustomerList() {
  const values = data.customers()
    .slice()
    .reverse()
    .filter(customer => text(customer.id))
    .map(customerOptionLabel)
    .map(text)
    .filter(Boolean);
  $("#customerList").innerHTML = [...new Set(values)]
    .slice(0, DATALIST_OPTION_LIMIT)
    .map(value => `<option value="${html(value)}"></option>`)
    .join("");
}

function renderCustomers() {
  const rows = customerRowsForTable();
  const pageInfo = paginateRows(rows, customerPage);
  customerPage = pageInfo.currentPage;
  renderCustomerList();
  table($("#customerTable"), [
    { label: "ID", key: "id" },
    { label: "Name", key: "name" },
    { label: "Mobile", key: "mobile" },
    { label: "Address", key: "address" },
    { label: "City", key: "city" },
    { label: "State Code", key: "stateCode" },
    { label: "GSTIN", key: "gstin" },
    { label: "Action", key: "action", render: r => customerActionMarkup(r.customerIndex) }
  ], pageInfo.rows);
  renderPagination($("#customerPagination"), pageInfo, page => {
    customerPage = page;
    renderCustomers();
  });
}

function renderSupplierList() {
  const names = [
    ...data.suppliers().map(row => row.name),
    ...data.purchases().map(row => row.supplier),
    ...data.outgoingCheques().map(row => row.supplier)
  ].map(text).filter(Boolean);
  const options = [...new Set(names)]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 1000)
    .map(name => `<option value="${html(name)}"></option>`)
    .join("");
  $("#supplierList").innerHTML = options;
}

function itemLabel(value) {
  return text(value).toLowerCase();
}

function renderItemList() {
  const names = [
    ...data.items().map(row => row.name),
    ...data.purchases().map(row => row.item),
    ...data.transactions().flatMap(row => row.billData?.items?.map(item => item.description) || [])
  ].map(text).filter(Boolean);
  $("#itemList").innerHTML = [...new Set(names)]
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 1000)
    .map(name => `<option value="${html(name)}"></option>`)
    .join("");
}

function itemDetailsForReceipt(name) {
  const key = itemLabel(name);
  if (!key) return null;
  const master = data.items().find(row => itemLabel(row.name) === key);
  if (master) {
    return {
      hsn: text(master.hsn),
      rate: num(master.rate),
      gst: 18
    };
  }
  const salesItem = data.transactions()
    .flatMap(row => row.billData?.items || [])
    .reverse()
    .find(item => itemLabel(item.description) === key);
  if (salesItem) {
    return {
      hsn: text(salesItem.hsn),
      rate: num(salesItem.rate) || (num(salesItem.total) / (num(salesItem.qty) || 1)),
      gst: num(salesItem.gst) || 18
    };
  }
  const purchase = data.purchases().slice().reverse().find(row => itemLabel(row.item) === key);
  if (purchase && num(purchase.qty)) {
    return {
      hsn: "",
      rate: num(purchase.amount) / num(purchase.qty),
      gst: 18
    };
  }
  return null;
}

function itemStockSummary() {
  const map = new Map();
  const ensureItem = name => {
    const itemName = text(name) || "Unknown Item";
    const key = itemLabel(itemName);
    if (!map.has(key)) {
      map.set(key, {
        item: itemName,
        group: "Uncategorized",
        hsn: "",
        unit: "",
        rate: 0,
        totalPurchased: 0,
        totalSold: 0,
        stockBalance: 0,
        purchaseBills: 0,
        salesBills: 0
      });
    }
    return map.get(key);
  };
  data.items().forEach(row => {
    if (!text(row.name)) return;
    const record = ensureItem(row.name);
    record.group = text(row.group) || "Uncategorized";
    record.hsn = text(row.hsn);
    record.unit = text(row.unit);
    record.rate = num(row.rate);
  });
  data.purchases().forEach(row => {
    if (!text(row.item)) return;
    const record = ensureItem(row.item);
    record.totalPurchased += num(row.qty);
    record.purchaseBills += 1;
    record.stockBalance = record.totalPurchased - record.totalSold;
  });
  data.transactions().forEach(row => {
    (row.billData?.items || []).forEach(item => {
      if (!text(item.description)) return;
      const record = ensureItem(item.description);
      record.hsn ||= text(item.hsn);
      record.totalSold += num(item.qty);
      record.salesBills += 1;
      record.stockBalance = record.totalPurchased - record.totalSold;
    });
  });
  return [...map.values()].sort((a, b) => a.item.localeCompare(b.item));
}

function filteredItemStockRows() {
  const q = text($("#itemSearch").value).toLowerCase();
  const status = $("#itemStockStatus").value;
  return itemStockSummary().filter(row => {
    const statusOk = status === "available" ? row.stockBalance > 0
      : status === "out" ? row.stockBalance <= 0
      : true;
    const hay = `${row.group} ${row.item} ${row.hsn} ${row.unit}`.toLowerCase();
    return statusOk && (!q || hay.includes(q));
  });
}

function renderItemMaster() {
  const rows = filteredItemStockRows();
  const groups = [...rows.reduce((map, row) => {
    const groupKey = itemLabel(row.group || "Uncategorized");
    if (!map.has(groupKey)) map.set(groupKey, { name: row.group || "Uncategorized", rows: [] });
    map.get(groupKey).rows.push(row);
    return map;
  }, new Map()).values()].sort((a, b) => a.name.localeCompare(b.name));
  const pageInfo = paginateRows(groups, itemPage);
  itemPage = pageInfo.currentPage;
  const columns = ["Item", "HSN", "Unit", "Rate", "Total Qty Purchased", "Total Qty Sell", "Stock Balance", "Purchase Bills", "Sales Bills", "Action"];
  const body = pageInfo.rows.map(group => {
    const itemRows = group.rows.map(row => `<tr>
      <td><button type="button" class="memo-bill-link item-history-link" data-rate-history="${html(row.item)}" title="View rate history">${html(row.item)}</button></td>
      <td>${html(row.hsn)}</td>
      <td>${html(row.unit)}</td>
      <td class="num">${money2(row.rate)}</td>
      <td class="num">${row.totalPurchased}</td>
      <td class="num">${row.totalSold}</td>
      <td class="num">${row.stockBalance}</td>
      <td class="num">${row.purchaseBills}</td>
      <td class="num">${row.salesBills}</td>
      <td><div class="ledger-actions">${rowUnlockButton("item", row.item)}<button type="button" class="symbol-btn edit-symbol" data-edit-item="${html(row.item)}" title="Edit item" aria-label="Edit item"${actionControlAttrs("item", row.item, "Edit item")}>&#9998;</button></div></td>
    </tr>`).join("");
    const totals = group.rows.reduce((summary, row) => ({
      purchased: summary.purchased + row.totalPurchased,
      sold: summary.sold + row.totalSold,
      stock: summary.stock + row.stockBalance,
      value: summary.value + (row.stockBalance * row.rate)
    }), { purchased: 0, sold: 0, stock: 0, value: 0 });
    return `<tr class="item-group-row"><td colspan="${columns.length}"><details>
      <summary><table class="item-group-summary-table"><thead><tr>
        <th>Item Group</th><th class="num">Total Purchase Qty</th><th class="num">Total Sale Qty</th><th class="num">Stock</th><th class="num">Total Value</th>
      </tr></thead><tbody><tr>
        <td><strong>${html(group.name)}</strong></td><td class="num">${totals.purchased}</td><td class="num">${totals.sold}</td><td class="num">${totals.stock}</td><td class="num"><strong>${money2(totals.value)}</strong></td>
      </tr></tbody></table></summary>
      <div class="item-group-table-wrap"><table><thead><tr>${columns.map((label, index) => `<th class="${index >= 3 && index <= 8 ? "num" : ""}">${label}</th>`).join("")}</tr></thead><tbody>${itemRows}</tbody></table></div>
    </details></td></tr>`;
  }).join("");
  $("#itemMasterTable").innerHTML = `<thead><tr><th>Item Groups</th></tr></thead><tbody>${body || `<tr><td>No records found</td></tr>`}</tbody>`;
  renderPagination($("#itemPagination"), pageInfo, page => {
    itemPage = page;
    renderItemMaster();
  });
}

function customerActionMarkup(index) {
  return `
    <div class="ledger-actions">
      ${rowUnlockButton("customer", index)}
      <button type="button" class="symbol-btn edit-symbol" data-edit-customer="${index}" title="Edit customer" aria-label="Edit customer"${actionControlAttrs("customer", index, "Edit customer")}>&#9998;</button>
      <button type="button" class="symbol-btn delete-symbol" data-delete-customer="${index}" title="Delete customer" aria-label="Delete customer"${actionControlAttrs("customer", index, "Delete customer")}>&#128465;</button>
    </div>
  `;
}

