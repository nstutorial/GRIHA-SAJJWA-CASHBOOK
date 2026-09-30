function addReceiptItem(item = {}) {
  receiptItems.push({
    description: item.description || "",
    hsn: item.hsn || "",
    qty: item.qty || 1,
    rate: item.rate || 0,
    total: item.total || 0,
    gst: item.gst ?? 18
  });
  renderItems();
}

function itemMath(item) {
  const qty = Math.max(num(item.qty), 1);
  const rate = num(item.rate) || (num(item.total) / qty);
  const total = num(item.total) || (rate * qty);
  const gstRate = num(item.gst) / 100;
  const taxable = gstRate ? total / (1 + gstRate) : total;
  const tax = total - taxable;
  const { igst, cgst, sgst } = splitGstAmount(tax);
  return { taxable, igst, cgst, sgst, tax, total, rate };
}

function receiptMath() {
  const gross = receiptItems.reduce((sum, item) => sum + itemMath(item).total, 0);
  const discount = num($("#receiptForm").discount.value);
  const net = Math.max(gross - discount, 0);
  const received = num($("#receiptForm").cash.value) + num($("#receiptForm").bank.value) + num($("#receiptForm").bajaj.value);
  return { gross, discount, net, received, due: net - received };
}

function goodsTableTotals() {
  return receiptItems.reduce((totals, item) => {
    const calc = itemMath(item);
    totals.taxable += calc.taxable;
    totals.igst += calc.igst;
    totals.cgst += calc.cgst;
    totals.sgst += calc.sgst;
    totals.tax += calc.tax;
    totals.total += calc.total;
    return totals;
  }, { taxable: 0, igst: 0, cgst: 0, sgst: 0, tax: 0, total: 0 });
}

function renderGoodsTableTotals() {
  const totals = goodsTableTotals();
  const taxableNode = $("[data-goods-total='taxable']");
  const igstNode = $("[data-goods-total='igst']");
  const cgstNode = $("[data-goods-total='cgst']");
  const sgstNode = $("[data-goods-total='sgst']");
  const taxNode = $("[data-goods-total='tax']");
  const totalNode = $("[data-goods-total='total']");
  if (taxableNode) taxableNode.textContent = money2(totals.taxable);
  if (igstNode) igstNode.textContent = money2(totals.igst);
  if (cgstNode) cgstNode.textContent = money2(totals.cgst);
  if (sgstNode) sgstNode.textContent = money2(totals.sgst);
  if (taxNode) taxNode.textContent = money2(totals.tax);
  if (totalNode) totalNode.textContent = money2(totals.total);
}

function renderItems() {
  const node = $("#itemTable");
  const totals = goodsTableTotals();
  node.innerHTML = `
    <thead><tr><th>Description</th><th>HSN</th><th>Qty</th><th>Rate<br>Incl. Tax</th><th>GST %</th><th>Taxable</th><th>IGST</th><th>CGST</th><th>SGST</th><th>Tax Amount</th><th>Total</th><th></th></tr></thead>
    <tbody>
      ${receiptItems.map((item, i) => {
        const calc = itemMath(item);
        return `<tr>
          <td><input class="item-name" list="itemList" data-item="${i}" data-field="description" value="${item.description}"></td>
          <td><input data-item="${i}" data-field="hsn" value="${item.hsn}"></td>
          <td><input type="number" min="1" data-item="${i}" data-field="qty" value="${item.qty}"></td>
          <td><input type="number" min="0" step="0.01" data-item="${i}" data-field="rate" value="${decimal2(item.rate || calc.rate)}"></td>
          <td><input type="number" min="0" data-item="${i}" data-field="gst" value="${item.gst}"></td>
          <td class="num" data-item-calc="${i}" data-calc-field="taxable">${money2(calc.taxable)}</td>
          <td class="num" data-item-calc="${i}" data-calc-field="igst">${money2(calc.igst)}</td>
          <td class="num" data-item-calc="${i}" data-calc-field="cgst">${money2(calc.cgst)}</td>
          <td class="num" data-item-calc="${i}" data-calc-field="sgst">${money2(calc.sgst)}</td>
          <td class="num" data-item-calc="${i}" data-calc-field="tax">${money2(calc.tax)}</td>
          <td><input type="number" min="0" step="0.01" data-item="${i}" data-field="total" value="${decimal2(calc.total)}"></td>
          <td>${rowUnlockButton("receiptItem", i)}<button type="button" class="icon-btn" data-remove-item="${i}" title="Remove item"${actionControlAttrs("receiptItem", i, "Remove item")}>x</button></td>
        </tr>`;
      }).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="5" class="goods-total-label">Grand Total</td>
        <td class="num" data-goods-total="taxable">${money2(totals.taxable)}</td>
        <td class="num" data-goods-total="igst">${money2(totals.igst)}</td>
        <td class="num" data-goods-total="cgst">${money2(totals.cgst)}</td>
        <td class="num" data-goods-total="sgst">${money2(totals.sgst)}</td>
        <td class="num" data-goods-total="tax">${money2(totals.tax)}</td>
        <td class="num" data-goods-total="total">${money2(totals.total)}</td>
        <td></td>
      </tr>
    </tfoot>`;
  $$("[data-item]", node).forEach(input => {
    const updateReceiptItemInput = () => {
      const i = Number(input.dataset.item);
      receiptItems[i][input.dataset.field] = input.value;
      if (input.dataset.field === "description") {
        const details = itemDetailsForReceipt(input.value);
        if (details) {
          receiptItems[i].hsn = details.hsn || receiptItems[i].hsn;
          receiptItems[i].rate = details.rate || receiptItems[i].rate;
          receiptItems[i].gst = details.gst || receiptItems[i].gst || 18;
          receiptItems[i].qty = num(receiptItems[i].qty) || 1;
          receiptItems[i].total = receiptItems[i].qty * receiptItems[i].rate;
          const hsnInput = node.querySelector(`[data-item="${i}"][data-field="hsn"]`);
          const rateInput = node.querySelector(`[data-item="${i}"][data-field="rate"]`);
          const gstInput = node.querySelector(`[data-item="${i}"][data-field="gst"]`);
          const totalInput = node.querySelector(`[data-item="${i}"][data-field="total"]`);
          if (hsnInput) hsnInput.value = receiptItems[i].hsn;
          if (rateInput) rateInput.value = decimal2(receiptItems[i].rate);
          if (gstInput) gstInput.value = receiptItems[i].gst;
          if (totalInput) totalInput.value = decimal2(receiptItems[i].total);
        }
      }
      if (["qty", "rate"].includes(input.dataset.field)) {
        const rateInput = node.querySelector(`[data-item="${i}"][data-field="rate"]`);
        receiptItems[i].rate = num(rateInput?.value);
        receiptItems[i].total = num(receiptItems[i].qty) * receiptItems[i].rate;
        const totalInput = node.querySelector(`[data-item="${i}"][data-field="total"]`);
        if (totalInput) totalInput.value = decimal2(receiptItems[i].total);
      }
      const calc = itemMath(receiptItems[i]);
      const taxableNode = node.querySelector(`[data-item-calc="${i}"][data-calc-field="taxable"]`);
      const igstNode = node.querySelector(`[data-item-calc="${i}"][data-calc-field="igst"]`);
      const cgstNode = node.querySelector(`[data-item-calc="${i}"][data-calc-field="cgst"]`);
      const sgstNode = node.querySelector(`[data-item-calc="${i}"][data-calc-field="sgst"]`);
      const taxNode = node.querySelector(`[data-item-calc="${i}"][data-calc-field="tax"]`);
      if (taxableNode) taxableNode.textContent = money2(calc.taxable);
      if (igstNode) igstNode.textContent = money2(calc.igst);
      if (cgstNode) cgstNode.textContent = money2(calc.cgst);
      if (sgstNode) sgstNode.textContent = money2(calc.sgst);
      if (taxNode) taxNode.textContent = money2(calc.tax);
      renderGoodsTableTotals();
      renderReceiptTotals();
    };
    input.addEventListener("input", updateReceiptItemInput);
    if (input.dataset.field === "description") input.addEventListener("change", updateReceiptItemInput);
  });
  $$("[data-remove-item]", node).forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled || !ensureActionRowUnlocked("receiptItem", btn.dataset.removeItem)) return;
      receiptItems.splice(Number(btn.dataset.removeItem), 1);
      if (!receiptItems.length) addReceiptItem();
      renderItems();
    });
  });
  renderReceiptTotals();
}

function renderReceiptTotals() {
  const calc = receiptMath();
  const customerDue = selectedReceiptCustomerDueBalance();
  $("#receiptTotals").innerHTML = [
    ["Gross", calc.gross],
    ["Discount", calc.discount],
    ["Net total", calc.net],
    ["Received", calc.received],
    ["Previous due", customerDue],
    ["Current due", customerDue + calc.due]
  ].map(([label, value]) => `<div class="total-card"><small>${label}</small><strong>${money(value)}</strong></div>`).join("");
}

function selectedReceiptCustomerDueBalance() {
  const form = $("#receiptForm");
  if (!form) return 0;
  const selectedCustomer = findCustomerFromReceiptInput(form.customer.value);
  const customerKeys = [
    selectedCustomer?.name,
    selectedCustomer ? customerOptionLabel(selectedCustomer) : form.customer.value
  ].map(value => text(value).toLowerCase()).filter(Boolean);
  if (!customerKeys.length) return 0;
  return data.dues()
    .filter(row => customerKeys.includes(text(row.name).toLowerCase()))
    .filter(row => !editingReceiptTransaction || text(row.memo) !== text(editingReceiptTransaction.memo))
    .reduce((balance, row) => balance + num(row.due) - num(row.paid), 0);
}

function paymentPartyDueBalance() {
  const form = $("#paymentForm");
  if (!form) return { matched: false, balance: 0, name: "" };
  const raw = text(form.party.value).toLowerCase();
  if (!raw) return { matched: false, balance: 0, name: "" };
  const matchedCustomer = data.customers().find(customer => {
    const keys = [customer.name, customer.id, customerOptionLabel(customer)]
      .map(value => text(value).toLowerCase())
      .filter(Boolean);
    return keys.includes(raw);
  });
  const keys = [
    raw,
    matchedCustomer?.name,
    matchedCustomer ? customerOptionLabel(matchedCustomer) : ""
  ].map(value => text(value).toLowerCase()).filter(Boolean);
  const rows = data.dues().filter(row => keys.includes(text(row.name).toLowerCase()));
  return {
    matched: Boolean(rows.length || matchedCustomer),
    balance: rows.reduce((balance, row) => balance + num(row.due) - num(row.paid), 0),
    name: text(matchedCustomer?.name || form.party.value)
  };
}

function renderPaymentDueAmount() {
  const node = $("#paymentDueAmount");
  if (!node) return;
  const due = paymentPartyDueBalance();
  const form = $("#paymentForm");
  const isDuePaid = Boolean(form?.duePaid?.checked) || text(form?.head?.value).toLowerCase() === "due paid";
  const enteredPayment = isDuePaid ? num(form?.amount?.value) + num(form?.bank?.value) : 0;
  const editingPaidAmount = editingPaymentTransaction
    && (text(editingPaymentTransaction.head).toLowerCase() === "due paid" || text(editingPaymentTransaction.type).toLowerCase() === "due paid")
    ? num(editingPaymentTransaction.cash) + num(editingPaymentTransaction.bank)
    : 0;
  const displayedBalance = due.balance + editingPaidAmount - enteredPayment;
  node.hidden = !due.matched;
  if (!due.matched) {
    node.innerHTML = "";
    return;
  }
  node.innerHTML = `<span>Due Amount</span><strong>${money(displayedBalance)}</strong><small>${html(due.name)}</small>`;
}

function renderPaymentBalances() {
  const node = $("#paymentBalanceRow");
  if (!node) return;
  const balances = currentBalances();
  node.innerHTML = [
    ["Current Balance", balances.cash + balances.bank + balances.finance],
    ["Cash Balance", balances.cash],
    ["Bank Balance", balances.bank],
    ["Finance Balance", balances.finance]
  ].map(([label, value]) => `
    <div class="payment-balance-card">
      <span>${label}</span>
      <strong>${money(value)}</strong>
    </div>
  `).join("");
}

function setReceiptSubmitText() {
  const button = $("#receiptForm")?.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = false;
  button.textContent = editingReceiptTransaction ? "Update receipt" : "Save receipt";
}

function setReceiptSaving(isSaving) {
  const button = $("#receiptForm")?.querySelector("button[type='submit']");
  if (!button) return;
  button.disabled = isSaving;
  button.textContent = isSaving ? "Saving....." : (editingReceiptTransaction ? "Update receipt" : "Save receipt");
}

function setPaymentSubmitText() {
  const button = $("#paymentForm")?.querySelector("button[type='submit']");
  const isFundReceived = Boolean($("#paymentForm")?.fundReceived?.checked);
  if (button) button.textContent = isFundReceived ? "Save fund received" : editingPaymentTransaction ? "Update payment" : "Save payment";
}

function normalizedPaymentMethod(value) {
  const method = text(value).toLowerCase();
  if (method === "cheque" || method === "check") return "cheque";
  if (method === "bank") return "bank";
  return "cash";
}

function syncPaymentMethodAmounts() {
  const form = $("#paymentForm");
  if (!form) return;
  if (form.fundReceived?.checked) return;
  const method = normalizedPaymentMethod(form.paymentMethod?.value);
  if (method === "bank" || method === "cheque") {
    form.bank.value = decimal2(num(form.amount.value));
  }
  renderPaymentDueAmount();
}

async function saveReceipt(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const isEditing = Boolean(editingReceiptTransaction);
  const memoSettings = receiptMemoSettings();
  if (memoSettings.auto && !isEditing) {
    form.memo.value = formatReceiptMemo(memoSettings.nextNo, memoSettings);
  }
  const selectedCustomer = findCustomerFromReceiptInput(form.customer.value);
  if (!selectedCustomer) {
    validateReceiptCustomer(true);
    form.customer.focus();
    form.customer.setCustomValidity("Select an exact customer from Address Book or add a new customer first.");
    form.customer.reportValidity();
    toast("Customer name must match Address Book exactly.");
    return;
  }
  form.customer.setCustomValidity("");
  setReceiptSaving(true);
  try {
    const calc = receiptMath();
    const previousDue = selectedReceiptCustomerDueBalance();
    const remark = text(form.remark.value);
    const tx = {
      memo: text(form.memo.value),
      date: form.date.value,
      head: text(form.head.value),
      party: selectedCustomer ? customerOptionLabel(selectedCustomer) : text(form.customer.value),
      customerId: text(selectedCustomer?.id),
      billed: calc.net,
      cash: num(form.cash.value),
      bank: num(form.bank.value),
      expense: 0,
      type: text(form.mode.value),
      remark,
      mobile: text(form.mobile.value),
      cost: 0,
      profit: num(form.profit.value),
      bajaj: num(form.bajaj.value),
      salesManager: text(form.salesManager.value),
      vehicleNo: text(form.vehicleNo.value),
      transportMode: text(form.transportMode.value)
    };
    const billDetails = {
      calc,
      customer: selectedCustomer,
      goodsTotals: goodsTableTotals(),
      items: receiptItems.map(item => ({ ...item })),
      previousDue,
      tx
    };
    tx.billId = text(tx.memo);
    tx.billData = gstBillPayload(billDetails);
    if (!isEditing) openGstBillWindow(null, billDetails);
    if (isEditing) {
      await saveTransactionRecord(editingReceiptTransaction, tx);
    } else if (apiAvailable) {
      seed.transactions.push(await apiCreate("transactions", tx));
    } else {
      user.transactions.push(tx);
    }

    const due = calc.due > 0
      ? { date: tx.date, name: tx.party, head: "Due", memo: tx.memo, due: calc.due, paid: 0, remark: "Receipt due" }
      : null;
    if (isEditing) {
      await replaceTransactionDueRecord(editingReceiptTransaction, due);
    } else if (due) {
      if (apiAvailable) {
        seed.dues.push(await apiCreate("dues", due));
      } else {
        user.dues.push(due);
      }
    }
    await upsertCustomer({
      name: selectedCustomer.name,
      mobile: tx.mobile,
      address: text(form.address.value),
      city: "",
      state: seed.business.state,
      pin: "",
      stateCode: normalizeStateCode(form.stateCode.value) || stateCodeFromGstin(form.gstin.value) || businessStateCode(),
      gstin: text(form.gstin.value)
    });
    if (!apiAvailable) saveUser();
    if (!isEditing) await advanceReceiptMemoNumber();
    toast(isEditing ? "Receipt updated." : "Receipt saved.");
    editingReceiptTransaction = null;
    form.reset();
    setDefaults();
    applyReceiptMemoMode();
    receiptItems = [];
    addReceiptItem();
    setReceiptSubmitText();
    renderAll();
  } catch (error) {
    setReceiptSaving(false);
    toast(error.message || "Receipt save failed.");
  }
}

function printReceipt(doPrint = true) {
  const form = $("#receiptForm");
  const calc = receiptMath();
  const goodsTotals = goodsTableTotals();
  const profile = businessProfile();
  const account = accountDetails();
  const previousDue = selectedReceiptCustomerDueBalance();
  const totalBalanceToPay = previousDue + calc.due;
  const tx = {
    memo: text(form.memo.value),
    date: form.date.value
  };
  $("#printArea").innerHTML = `
    <section class="print-invoice">
      <h2>${profile.name}</h2>
      <p>${profile.address} | State Code: ${profile.stateCode} | GSTIN: ${profile.gstin}</p>
      <h3>Receipt Voucher / Tax Invoice</h3>
      <p>Memo: ${text(form.memo.value)} | Date: ${form.date.value} | Customer: ${text(form.customer.value)}</p>
      <p>Sales Manager: ${text(form.salesManager.value)} | Vehicle No.: ${text(form.vehicleNo.value)} | Mode of Transportation: ${text(form.transportMode.value)}</p>
      <table>
        <thead><tr><th>Description</th><th>HSN</th><th>Qty</th><th>Rate Incl. Tax</th><th>GST %</th><th>Taxable</th><th>IGST</th><th>CGST</th><th>SGST</th><th>Tax Amount</th><th>Total</th></tr></thead>
        <tbody>${receiptItems.map(i => {
          const calc = itemMath(i);
          return `<tr><td>${text(i.description)}</td><td>${text(i.hsn)}</td><td>${i.qty}</td><td>${money2(calc.rate)}</td><td>${i.gst}</td><td>${money2(calc.taxable)}</td><td>${money2(calc.igst)}</td><td>${money2(calc.cgst)}</td><td>${money2(calc.sgst)}</td><td>${money2(calc.tax)}</td><td>${money2(calc.total)}</td></tr>`;
        }).join("")}</tbody>
        <tfoot><tr><td colspan="5"><strong>Goods table total</strong></td><td><strong>${money2(goodsTotals.taxable)}</strong></td><td><strong>${money2(goodsTotals.igst)}</strong></td><td><strong>${money2(goodsTotals.cgst)}</strong></td><td><strong>${money2(goodsTotals.sgst)}</strong></td><td><strong>${money2(goodsTotals.tax)}</strong></td><td><strong>${money2(goodsTotals.total)}</strong></td></tr></tfoot>
      </table>
      <p>Gross: ${money(calc.gross)} | Discount: ${money(calc.discount)} | Net: ${money(calc.net)} | Current Due: ${money(calc.due)}</p>
      <p><strong>Total Balance to be Paid: ${money(totalBalanceToPay)}</strong></p>
      ${paymentQrMarkup({ account, amount: totalBalanceToPay, profile, tx })}
      <p>Thanks visit again.</p>
    </section>`;
  if (doPrint) window.print();
}

function gstBillHtml({ calc, customer, goodsTotals, items, previousDue, tx }) {
  const profile = businessProfile();
  const billTotalDue = previousDue + calc.due;
  const rows = items.map((item, index) => {
    const itemCalc = itemMath(item);
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${html(item.description)}</td>
        <td>${html(item.hsn)}</td>
        <td class="num">${html(item.qty)}</td>
        <td class="num">${money2(itemCalc.rate)}</td>
        <td class="num">${html(item.gst)}%</td>
        <td class="num">${money2(itemCalc.taxable)}</td>
        <td class="num">${money2(itemCalc.igst)}</td>
        <td class="num">${money2(itemCalc.cgst)}</td>
        <td class="num">${money2(itemCalc.sgst)}</td>
        <td class="num">${money2(itemCalc.total)}</td>
      </tr>
    `;
  }).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>GST Bill ${html(tx.memo)}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #111; background: #f3f4f6; }
    .bill { max-width: 1080px; margin: 0 auto; background: #fff; border: 2px solid #111; }
    .bill-top { display: flex; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 2px solid #111; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; letter-spacing: .5px; }
    h2 { font-size: 18px; text-align: center; padding: 10px; border-bottom: 2px solid #111; background: #f8fafc; }
    .muted { color: #4b5563; margin-top: 6px; font-size: 13px; line-height: 1.45; }
    .invoice-meta { text-align: right; font-size: 14px; line-height: 1.6; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 2px solid #111; }
    .party { padding: 14px 20px; min-height: 118px; }
    .party + .party { border-left: 2px solid #111; }
    .party h3 { font-size: 13px; text-transform: uppercase; margin-bottom: 8px; color: #374151; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #111; padding: 8px 7px; vertical-align: top; }
    th { background: #f3f4f6; text-transform: uppercase; font-size: 11px; }
    .num { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; background: #fafafa; }
    .summary { display: grid; grid-template-columns: 1.2fr 380px; gap: 0; border-top: 2px solid #111; }
    .notes { padding: 14px 20px; border-right: 2px solid #111; font-size: 13px; line-height: 1.7; }
    .totals { padding: 12px 18px; }
    .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 7px 0; border-bottom: 1px solid #d1d5db; }
    .total-row.grand { font-size: 18px; font-weight: 800; border-bottom: 0; padding-top: 12px; }
    .sign { display: flex; justify-content: space-between; padding: 34px 20px 18px; border-top: 2px solid #111; font-size: 13px; }
    .toolbar { max-width: 1080px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
    button { border: 0; border-radius: 6px; padding: 10px 14px; background: #165f4c; color: #fff; cursor: pointer; }
    @media print {
      body { padding: 0; background: #fff; }
      .toolbar { display: none; }
      .bill { border-width: 1px; max-width: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print GST Bill</button></div>
  <main class="bill">
    <h2>Tax Invoice / GST Bill</h2>
    <section class="bill-top">
      <div>
        <h1>${html(profile.name)}</h1>
        <p class="muted">${html(profile.address)}<br>State Code: ${html(profile.stateCode)} | GSTIN: ${html(profile.gstin)}</p>
      </div>
      <div class="invoice-meta">
        <strong>Invoice No:</strong> ${html(tx.memo)}<br>
        <strong>Date:</strong> ${html(tx.date)}<br>
        <strong>Payment Mode:</strong> ${html(tx.type)}
      </div>
    </section>
    <section class="parties">
      <div class="party">
        <h3>Bill To</h3>
        <strong>${html(customerOptionLabel(customer))}</strong>
        <p class="muted">${html([customer.address, customer.city, customer.state, customer.pin].filter(Boolean).join(", "))}<br>
        Mobile: ${html(customer.mobile)}<br>
        State Code: ${html(customer.stateCode || stateCodeFromGstin(customer.gstin) || "")} | GSTIN: ${html(customer.gstin)}</p>
      </div>
      <div class="party">
        <h3>Receipt Details</h3>
        <p class="muted">Head of Account: ${html(tx.head)}</p>
      </div>
    </section>
    <table>
      <thead>
        <tr>
          <th>Sl</th><th>Description</th><th>HSN</th><th>Qty</th><th>Rate Incl. Tax</th><th>GST</th>
          <th>Taxable</th><th>IGST</th><th>CGST</th><th>SGST</th><th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="6" class="num">Goods Total</td>
          <td class="num">${money2(goodsTotals.taxable)}</td>
          <td class="num">${money2(goodsTotals.igst)}</td>
          <td class="num">${money2(goodsTotals.cgst)}</td>
          <td class="num">${money2(goodsTotals.sgst)}</td>
          <td class="num">${money2(goodsTotals.total)}</td>
        </tr>
      </tfoot>
    </table>
    <section class="summary">
      <div class="notes">
        <strong>Declaration:</strong> Certified that the particulars given above are true and correct.<br>
        <strong>Previous Due:</strong> ${money(previousDue)}<br>
        <strong>Current Bill Due:</strong> ${money(calc.due)}
      </div>
      <div class="totals">
        <div class="total-row"><span>Gross</span><strong>${money(calc.gross)}</strong></div>
        <div class="total-row"><span>Discount</span><strong>${money(calc.discount)}</strong></div>
        <div class="total-row"><span>Net Total</span><strong>${money(calc.net)}</strong></div>
        <div class="total-row"><span>Received</span><strong>${money(calc.received)}</strong></div>
        <div class="total-row grand"><span>Total Due</span><strong>${money(billTotalDue)}</strong></div>
      </div>
    </section>
    <section class="sign">
      <span>Customer Signature</span>
      <span>Authorised Signatory</span>
    </section>
  </main>
</body>
</html>`;
}

function openGstBillWindow(billWindow, details) {
  const billId = text(details?.tx?.billId || details?.tx?.memo) || `GST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(`gstBill:${billId}`, JSON.stringify(gstBillPayload(details)));
  const billUrl = `bill.html?id=${encodeURIComponent(billId)}`;
  if (!billWindow) {
    window.open(billUrl, "_blank");
    return;
  }
  billWindow.location.href = billUrl;
  billWindow.focus();
}

function paymentVoucherPayload(tx) {
  const amount = num(tx.expense) || num(tx.cash) + num(tx.bank);
  const bankAmount = num(tx.bank);
  const cashAmount = num(tx.cash) || Math.max(amount - bankAmount, 0);
  const isDuePaid = text(tx.head).toLowerCase() === "due paid" || text(tx.type).toLowerCase() === "due paid";
  const dueBalance = paymentPartyDueBalance();
  const editingPaidAmount = editingPaymentTransaction
    && (text(editingPaymentTransaction.head).toLowerCase() === "due paid" || text(editingPaymentTransaction.type).toLowerCase() === "due paid")
    ? num(editingPaymentTransaction.cash) + num(editingPaymentTransaction.bank)
    : 0;
  const beforePayment = dueBalance.balance + editingPaidAmount;
  return {
    profile: businessProfile(),
    tx: {
      memo: text(tx.memo),
      date: text(tx.date),
      head: text(tx.head),
      party: text(tx.party),
      amount,
      cash: cashAmount,
      bank: bankAmount,
      type: text(tx.type),
      remark: text(tx.remark)
    },
    due: isDuePaid ? {
      beforePayment,
      paidAmount: amount,
      remaining: beforePayment - amount
    } : null
  };
}

function openPaymentVoucherWindow(voucherWindow, voucher) {
  const voucherId = text(voucher?.tx?.memo) || `PV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(`paymentVoucher:${voucherId}`, JSON.stringify(voucher));
  const voucherUrl = `payment-voucher.html?id=${encodeURIComponent(voucherId)}`;
  if (!voucherWindow) {
    window.open(voucherUrl, "_blank");
    return;
  }
  voucherWindow.location.href = voucherUrl;
  voucherWindow.focus();
}

function outgoingChequeVoucherPayload(cheque) {
  const supplier = data.suppliers().find(row => text(row.name).toLowerCase() === text(cheque.supplier).toLowerCase());
  return {
    profile: businessProfile(),
    cheque: normalizeOutgoingCheque(cheque),
    supplier: supplier || null,
    printedAt: todayIso()
  };
}

function openOutgoingChequeVoucherWindow(voucherWindow, cheque) {
  const voucherUrl = storeOutgoingChequeVoucher(cheque);
  if (!voucherWindow) {
    window.open(voucherUrl, "_blank");
    return;
  }
  voucherWindow.location.href = voucherUrl;
  voucherWindow.focus();
}

function storeOutgoingChequeVoucher(cheque) {
  const chequeId = text(cheque?._id) || `${text(cheque?.chequeNo) || "cheque"}-${text(cheque?.bank) || "bank"}-${Date.now()}`;
  localStorage.setItem(`outgoingChequeVoucher:${chequeId}`, JSON.stringify(outgoingChequeVoucherPayload(cheque)));
  return `cheque-voucher.html?id=${encodeURIComponent(chequeId)}`;
}

function gstBillPayload({ calc, customer, goodsTotals, items, previousDue, tx }) {
  const profile = businessProfile();
  const billTx = {
    memo: text(tx.memo),
    date: text(tx.date),
    head: text(tx.head),
    party: text(tx.party),
    customerId: text(tx.customerId),
    type: text(tx.type),
    remark: text(tx.remark),
    salesManager: text(tx.salesManager),
    vehicleNo: text(tx.vehicleNo),
    transportMode: text(tx.transportMode)
  };
  return {
    profile,
    billTemplate: text(getSettingValue("billTemplate")) === "modern" ? "modern" : "classic",
    account: accountDetails(),
    tx: billTx,
    customer: {
      id: text(customer.id),
      label: customerOptionLabel(customer),
      name: text(customer.name),
      mobile: text(customer.mobile),
      address: text(customer.address),
      city: text(customer.city),
      state: text(customer.state),
      pin: text(customer.pin),
      stateCode: text(customer.stateCode || stateCodeFromGstin(customer.gstin)),
      gstin: text(customer.gstin)
    },
    items: items.map((item, index) => {
      const itemCalc = itemMath(item);
      return {
        sl: index + 1,
        description: text(item.description),
        hsn: text(item.hsn),
        qty: text(item.qty),
        rate: itemCalc.rate,
        gst: text(item.gst),
        taxable: itemCalc.taxable,
        igst: itemCalc.igst,
        cgst: itemCalc.cgst,
        sgst: itemCalc.sgst,
        total: itemCalc.total
      };
    }),
    goodsTotals,
    calc,
    previousDue,
    totalDue: previousDue + calc.due
  };
}

async function upsertCustomer(customer) {
  const existing = data.customers().find(c => c.name.toLowerCase() === text(customer.name).toLowerCase());
  if (!existing) {
    const customerId = nextCustomerId();
    const record = {
      id: String(customerId),
      nearby: "",
      ...customer
    };
    if (apiAvailable) {
      seed.customers.push(await apiCreate("customers", record));
    } else {
      user.customers.push(record);
    }
    await advanceCustomerId(customerId);
  }
}

function bindForms() {
  document.addEventListener("click", event => {
    const billLink = event.target.closest("[data-bill-memo]");
    if (billLink) openBillFromTransactionMemo(billLink.dataset.billMemo);
    const printBillBtn = event.target.closest("[data-print-bill-memo]");
    if (printBillBtn) openBillFromTransactionMemo(printBillBtn.dataset.printBillMemo);
    const unlockBtn = event.target.closest("[data-unlock-row-type]");
    if (unlockBtn) withBusyControl(unlockBtn, () => unlockActionRow(unlockBtn.dataset.unlockRowType, unlockBtn.dataset.unlockRowToken), "Checking...");
    const editBtn = event.target.closest("[data-edit-transaction]");
    if (editBtn) {
      if (editBtn.disabled || !ensureActionRowUnlocked("transaction", editBtn.dataset.editTransaction)) return;
      openTransactionEditor(editBtn.dataset.editTransaction);
    }
    const deleteBtn = event.target.closest("[data-delete-transaction]");
    if (deleteBtn) {
      if (deleteBtn.disabled || !ensureActionRowUnlocked("transaction", deleteBtn.dataset.deleteTransaction)) return;
      withBusyControl(deleteBtn, () => deleteLedgerTransaction(deleteBtn.dataset.deleteTransaction, deleteBtn), "Deleting...");
    }
    const editDueBtn = event.target.closest("[data-edit-due]");
    if (editDueBtn) {
      if (editDueBtn.disabled || !ensureActionRowUnlocked("due", editDueBtn.dataset.editDue)) return;
      openDueEditor(editDueBtn.dataset.editDue);
    }
    const deleteDueBtn = event.target.closest("[data-delete-due]");
    if (deleteDueBtn) {
      if (deleteDueBtn.disabled || !ensureActionRowUnlocked("due", deleteDueBtn.dataset.deleteDue)) return;
      withBusyControl(deleteDueBtn, () => deleteDueRecord(deleteDueBtn.dataset.deleteDue), "Deleting...");
    }
    const editCustomerBtn = event.target.closest("[data-edit-customer]");
    if (editCustomerBtn) {
      if (editCustomerBtn.disabled || !ensureActionRowUnlocked("customer", editCustomerBtn.dataset.editCustomer)) return;
      openCustomerEditor(editCustomerBtn.dataset.editCustomer);
    }
    const deleteCustomerBtn = event.target.closest("[data-delete-customer]");
    if (deleteCustomerBtn) {
      if (deleteCustomerBtn.disabled || !ensureActionRowUnlocked("customer", deleteCustomerBtn.dataset.deleteCustomer)) return;
      withBusyControl(deleteCustomerBtn, () => deleteCustomerRecord(deleteCustomerBtn.dataset.deleteCustomer), "Deleting...");
    }
    const editPurchaseBtn = event.target.closest("[data-edit-purchase]");
    if (editPurchaseBtn) {
      if (editPurchaseBtn.disabled || !ensureActionRowUnlocked("purchase", editPurchaseBtn.dataset.editPurchase)) return;
      openPurchaseEditor(editPurchaseBtn.dataset.editPurchase);
    }
    const deletePurchaseBtn = event.target.closest("[data-delete-purchase]");
    if (deletePurchaseBtn) {
      if (deletePurchaseBtn.disabled || !ensureActionRowUnlocked("purchase", deletePurchaseBtn.dataset.deletePurchase)) return;
      withBusyControl(deletePurchaseBtn, () => deletePurchaseRecord(deletePurchaseBtn.dataset.deletePurchase), "Deleting...");
    }
    const deleteHeadBtn = event.target.closest("[data-delete-head]");
    if (deleteHeadBtn) {
      if (deleteHeadBtn.disabled || !ensureActionRowUnlocked("head", deleteHeadBtn.dataset.deleteHead)) return;
      withBusyControl(deleteHeadBtn, () => deleteHeadFromSettings(deleteHeadBtn.dataset.deleteHeadType, deleteHeadBtn.dataset.deleteHead), "Deleting...");
    }
    const editItemBtn = event.target.closest("[data-edit-item]");
    if (editItemBtn) {
      if (editItemBtn.disabled || !ensureActionRowUnlocked("item", editItemBtn.dataset.editItem)) return;
      openItemEditor(editItemBtn.dataset.editItem);
    }
    const rateHistoryBtn = event.target.closest("[data-rate-history]");
    if (rateHistoryBtn) openItemRateHistory(rateHistoryBtn.dataset.rateHistory);
    const resetUserPasswordBtn = event.target.closest("[data-reset-user-password]");
    if (resetUserPasswordBtn) {
      withBusyControl(resetUserPasswordBtn, () => resetUserPassword(resetUserPasswordBtn.dataset.resetUserPassword), "Saving...");
    }
    const toggleUserBlockBtn = event.target.closest("[data-toggle-user-block]");
    if (toggleUserBlockBtn) {
      if (toggleUserBlockBtn.disabled) return;
      withBusyControl(
        toggleUserBlockBtn,
        () => toggleUserBlocked(toggleUserBlockBtn.dataset.toggleUserBlock, toggleUserBlockBtn.dataset.nextBlocked === "true"),
        "Saving..."
      );
    }
  });
  $("#notesForm").addEventListener("submit", withBusySubmit(saveNotes, "Saving..."));
  $("#clearNotesBtn").addEventListener("click", clearNotesForm);
  $("#addDenominationBtn").addEventListener("click", withBusyClick(() => addDenomination(), "Saving..."));
  $("#newDenominationInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      withBusyControl($("#addDenominationBtn"), () => addDenomination(), "Saving...");
    }
  });
  $("#addItemBtn").addEventListener("click", () => addReceiptItem());
  $("#addHeadBtn").addEventListener("click", openHeadModal);
  $("#addPaymentHeadBtn").addEventListener("click", openPaymentHeadModal);
  $("#addCustomerBtn").addEventListener("click", openCustomerModal);
  $("#addSupplierBtn").addEventListener("click", openSupplierModal);
  $("#addSupplierOpeningBalanceBtn")?.addEventListener("click", openSupplierOpeningBalanceModal);
  $("#receiptForm").addEventListener("input", event => {
    if (["discount", "cash", "bank", "bajaj", "customer"].includes(event.target.name)) renderReceiptTotals();
    if (event.target.name === "customer") {
      event.target.setCustomValidity("");
      validateReceiptCustomer(true);
    }
    if (event.target.name === "date") applyReceiptMemoMode();
    if (event.target.name === "gstin") {
      const stateCode = stateCodeFromGstin(event.target.value);
      if (stateCode) $("#receiptForm").stateCode.value = stateCode;
      renderItems();
    }
    if (event.target.name === "stateCode") {
      cleanStateCodeInput(event.target);
      renderItems();
    }
  });
  $("#receiptForm").customer.addEventListener("change", event => {
    const customer = findCustomerFromReceiptInput(event.target.value);
    if (customer) applyCustomerToReceipt(customer);
    validateReceiptCustomer(true);
  });
  $("#receiptForm").addEventListener("submit", withBusySubmit(saveReceipt, "Saving..."));
  $("#printReceiptBtn").addEventListener("click", withBusyClick(() => printReceipt(true), "Printing..."));
  $$("[data-close-modal]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)));
  $("#headModalForm").addEventListener("submit", withBusySubmit(saveHeadFromModal, "Saving..."));
  $("#paymentHeadModalForm").addEventListener("submit", withBusySubmit(savePaymentHeadFromModal, "Saving..."));
  $("#modalCustomerSearch").addEventListener("input", renderModalCustomerResults);
  $("#modalCustomerResults").addEventListener("click", event => {
    const btn = event.target.closest("[data-modal-customer]");
    if (!btn) return;
    const customer = data.customers().find(c => text(c.id) === text(btn.dataset.modalCustomer));
    applyCustomerToReceipt(customer);
    $$(".customer-result", $("#modalCustomerResults")).forEach(node => node.classList.toggle("active", node === btn));
    renderModalCustomerHistory(customer);
  });
  $("#modalCustomerHistory").addEventListener("click", event => {
    if (event.target.closest("[data-customer-modal-ok]")) closeModal("customerModal");
  });
  $("#customerModalForm").addEventListener("submit", withBusySubmit(saveCustomerFromModal, "Saving..."));
  $("#supplierModalForm").addEventListener("submit", withBusySubmit(saveSupplierFromModal, "Saving..."));
  $("#supplierOpeningBalanceForm")?.addEventListener("submit", withBusySubmit(saveSupplierOpeningBalance, "Saving..."));
  $("#customerModalForm").gstin.addEventListener("input", event => {
    const stateCode = stateCodeFromGstin(event.target.value);
    if (stateCode) $("#customerModalForm").stateCode.value = stateCode;
  });
  $("#customerModalForm").stateCode.addEventListener("input", event => cleanStateCodeInput(event.target));
  $("#settingsForm").addEventListener("submit", withBusySubmit(saveSettings, "Saving..."));
  $("#gst2bRowDeleteEnabled")?.addEventListener("change", async event => {
    const checkbox = event.currentTarget;
    checkbox.disabled = true;
    try {
      await saveSettingValue("gst2bRowDeleteEnabled", checkbox.checked);
      renderGstReturns();
      toast(checkbox.checked ? "GSTR-2B invoice delete buttons enabled." : "GSTR-2B invoice delete buttons hidden.");
    } catch (error) {
      checkbox.checked = getSettingValue("gst2bRowDeleteEnabled") === true;
      toast(error.message || "Could not save GSTR-2B delete setting.");
    } finally {
      checkbox.disabled = false;
    }
  });
  $("#saveActionLockBtn")?.addEventListener("click", withBusyClick(() => saveActionLockPassword(), "Saving..."));
  $("#changeOwnPasswordBtn")?.addEventListener("click", withBusyClick(() => changeOwnPassword(), "Saving..."));
  $("#refreshUsersBtn")?.addEventListener("click", withBusyClick(() => renderUserManagement(), "Refreshing..."));
  $("#settingsAddReceiptHeadBtn").addEventListener("click", withBusyClick(() => addHeadFromSettings("receipt"), "Saving..."));
  $("#settingsAddPaymentHeadBtn").addEventListener("click", withBusyClick(() => addHeadFromSettings("payment"), "Saving..."));
  $("#settingsReceiptHeadInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      withBusyControl($("#settingsAddReceiptHeadBtn"), () => addHeadFromSettings("receipt"), "Saving...");
    }
  });
  $("#settingsPaymentHeadInput").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      withBusyControl($("#settingsAddPaymentHeadBtn"), () => addHeadFromSettings("payment"), "Saving...");
    }
  });
  $("#settingsForm").addEventListener("input", event => {
    if (event.target.name === "localStorageMode") {
      saveStorageMode(event.target.checked ? "local" : "auto");
      updateStorageSettingsStatus();
    }
    if (["receiptMemoAuto", "receiptMemoPrefix", "receiptMemoNext"].includes(event.target.name)) {
      updateReceiptMemoPreview();
    }
    if (["paymentMemoAuto", "paymentMemoPrefix", "paymentMemoNext"].includes(event.target.name)) {
      updatePaymentMemoPreview();
    }
    if (event.target.name === "businessStateCode") cleanStateCodeInput(event.target);
    if (event.target.name === "businessGstin") {
      const stateCode = stateCodeFromGstin(event.target.value);
      if (stateCode) $("#settingsForm").businessStateCode.value = stateCode;
    }
  });
  $("#syncStorageBtn")?.addEventListener("click", withBusyClick(() => syncLocalDataToServer(), "Syncing..."));
  $("#dashboardRefreshBtn")?.addEventListener("click", withBusyClick(() => refreshDashboardFromServer(), "Refreshing..."));
  $("#paymentForm").addEventListener("submit", withBusySubmit(savePayment, "Saving..."));
  $("#paymentForm").head.addEventListener("change", applyPaymentHeadModeFromSelect);
  $("#paymentForm").staffDue.addEventListener("change", () => applyPaymentDueMode("staff"));
  $("#paymentForm").duePaid.addEventListener("change", () => applyPaymentDueMode("paid"));
  $("#paymentForm").fundReceived.addEventListener("change", () => {
    applyPaymentDueMode("fund");
    setPaymentSubmitText();
  });
  $("#paymentForm").party.addEventListener("input", renderPaymentDueAmount);
  $("#paymentForm").party.addEventListener("change", renderPaymentDueAmount);
  $("#paymentForm").amount.addEventListener("input", () => {
    if ($("#paymentForm").fundReceived?.checked) return;
    const method = normalizedPaymentMethod($("#paymentForm").paymentMethod?.value);
    if (method === "bank" || method === "cheque") syncPaymentMethodAmounts();
    else renderPaymentDueAmount();
  });
  $("#paymentForm").bank.addEventListener("input", renderPaymentDueAmount);
  $("#paymentForm").paymentMethod.addEventListener("change", syncPaymentMethodAmounts);
  $("#dueEditForm").addEventListener("submit", withBusySubmit(saveDueEdit, "Saving..."));
  $("#transactionEditForm").addEventListener("submit", withBusySubmit(saveTransactionEdit, "Saving..."));
  $("#addressBookEditForm").addEventListener("submit", withBusySubmit(saveCustomerEdit, "Saving..."));
  $("#itemEditForm").addEventListener("submit", withBusySubmit(saveItemEdit, "Saving..."));
  $("#addressBookEditForm").gstin.addEventListener("input", event => {
    const stateCode = stateCodeFromGstin(event.target.value);
    if (stateCode) $("#addressBookEditForm").stateCode.value = stateCode;
  });
  $("#addressBookEditForm").stateCode.addEventListener("input", event => cleanStateCodeInput(event.target));
  $("#customerForm").addEventListener("submit", withBusySubmit(saveCustomer, "Saving..."));
  $("#customerForm").gstin.addEventListener("input", event => {
    const stateCode = stateCodeFromGstin(event.target.value);
    if (stateCode) $("#customerForm").stateCode.value = stateCode;
  });
  $("#customerForm").stateCode.addEventListener("input", event => cleanStateCodeInput(event.target));
  $("#importCustomersBtn").addEventListener("click", withBusyClick(() => $("#importCustomersExcel").click(), "Opening..."));
  $("#importCustomersExcel").addEventListener("change", importCustomersFromExcel);
  $("#chequeForm").addEventListener("submit", withBusySubmit(saveCheque, "Saving..."));
  $("#chequeForm").customer.addEventListener("change", event => {
    const customer = findCustomerFromReceiptInput(event.target.value);
    if (customer) applyCustomerToCheque(customer);
  });
  $("#outgoingChequeForm").addEventListener("submit", withBusySubmit(saveOutgoingCheque, "Saving..."));
  $("#itemForm").addEventListener("submit", withBusySubmit(saveItem, "Saving..."));
  $("#purchaseForm").addEventListener("submit", withBusySubmit(savePurchase, "Saving..."));
  $("#transferForm").addEventListener("submit", withBusySubmit(saveTransfer, "Saving..."));
}

async function savePayment(event) {
  event.preventDefault();
  const f = event.currentTarget;
  const isEditing = Boolean(editingPaymentTransaction);
  const isFundReceived = Boolean(f.fundReceived?.checked);
  const voucherWindow = isEditing || isFundReceived ? null : window.open("", "_blank");
  const memoSettings = paymentMemoSettings();
  if (memoSettings.auto && !isEditing) f.memo.value = formatPaymentMemo(memoSettings.nextNo, memoSettings);
  applyPaymentDueMode();
  if (isFundReceived) {
    const cashReceived = num(f.amount.value);
    const bankReceived = num(f.bank.value);
    const financeReceived = num(f.bajaj.value);
    if (cashReceived + bankReceived + financeReceived <= 0) {
      toast("Enter cash, bank, or finance amount received.");
      f.amount.focus();
      return;
    }
    const transaction = {
      memo: text(f.memo.value),
      date: f.date.value,
      head: "Fund Received",
      party: text(f.party.value),
      billed: 0,
      cash: cashReceived,
      bank: bankReceived,
      expense: 0,
      type: "Fund Received",
      remark: text(f.remark.value),
      mobile: "",
      cost: 0,
      profit: 0,
      bajaj: financeReceived
    };
    if (apiAvailable) {
      seed.transactions.push(await apiCreate("transactions", transaction));
    } else {
      user.transactions.push(transaction);
      saveUser();
    }
    await advancePaymentMemoNumber();
    resetPaymentFormForMode("Fund Received");
    renderPaymentBalances();
    renderDashboard();
    renderAll();
    setPaymentSubmitText();
    toast("Fund received saved.");
    return;
  }
  const selectedHead = text(f.head.value).toLowerCase();
  const isStaffDue = Boolean(f.staffDue?.checked) || selectedHead === "due";
  const isDuePaid = Boolean(f.duePaid?.checked) || selectedHead === "due paid";
  const paymentMethod = normalizedPaymentMethod(f.paymentMethod?.value);
  const amountInput = num(f.amount.value);
  const enteredBankAmount = num(f.bank.value);
  const isBankMethod = ["bank", "cheque"].includes(paymentMethod);
  const bankReceived = isBankMethod ? (enteredBankAmount || amountInput) : enteredBankAmount;
  const cashReceived = isDuePaid && !isBankMethod ? amountInput : 0;
  const cashExpenseInput = isDuePaid || isBankMethod ? 0 : amountInput;
  const expenseAmount = isDuePaid ? 0 : cashExpenseInput + bankReceived;
  const duePaidAmount = cashReceived + bankReceived;
  const paymentType = isStaffDue ? "Staff due"
    : isDuePaid ? "Due paid"
    : paymentMethod === "cheque" ? "Cheque"
    : bankReceived ? "Bank"
    : "Cash";
  const transaction = {
    memo: text(f.memo.value),
    date: f.date.value,
    head: isStaffDue ? "Due" : isDuePaid ? "Due Paid" : text(f.head.value),
    party: text(f.party.value),
    billed: 0,
    cash: cashReceived,
    bank: bankReceived,
    expense: expenseAmount,
    type: paymentType,
    remark: text(f.remark.value),
    mobile: "",
    cost: 0,
    profit: 0,
    bajaj: 0
  };
  transaction.voucherId = text(transaction.memo);
  transaction.voucherData = paymentVoucherPayload(transaction);
  if (isEditing) {
    await saveTransactionRecord(editingPaymentTransaction, transaction);
  } else if (apiAvailable) {
    seed.transactions.push(await apiCreate("transactions", transaction));
  } else {
    user.transactions.push(transaction);
  }
  let due = null;
  if (isStaffDue && transaction.expense > 0) {
    due = {
      date: transaction.date,
      name: transaction.party,
      head: "Due",
      memo: transaction.memo,
      due: transaction.expense,
      paid: 0,
      remark: transaction.remark || "Staff due"
    };
  }
  if (isDuePaid && duePaidAmount > 0) {
    due = {
      date: transaction.date,
      name: transaction.party,
      head: "Due Paid",
      memo: transaction.memo,
      due: 0,
      paid: duePaidAmount,
      remark: transaction.remark || "Due paid"
    };
  }
  if (isEditing) {
    await replaceTransactionDueRecord(editingPaymentTransaction, due);
  } else if (due) {
    if (apiAvailable) {
      seed.dues.push(await apiCreate("dues", due));
    } else {
      user.dues.push(due);
    }
  }
  if (!apiAvailable) saveUser();
  if (!isEditing) await advancePaymentMemoNumber();
  f.reset();
  setDefaults();
  editingPaymentTransaction = null;
  applyPaymentMemoMode();
  applyPaymentDueMode();
  renderPaymentDueAmount();
  setPaymentSubmitText();
  toast(isEditing ? "Payment updated." : "Payment saved.");
  if (!isEditing) openPaymentVoucherWindow(voucherWindow, transaction.voucherData);
  renderAll();
}

async function saveCustomer(event) {
  event.preventDefault();
  const f = event.currentTarget;
  const customerId = nextCustomerId();
  const customer = {
    id: String(customerId),
    name: text(f.name.value),
    mobile: text(f.mobile.value),
    address: text(f.address.value),
    nearby: "",
    city: text(f.city.value),
    state: seed.business.state,
    pin: "",
    stateCode: normalizeStateCode(f.stateCode.value) || stateCodeFromGstin(f.gstin.value) || businessStateCode(),
    gstin: text(f.gstin.value)
  };
  if (apiAvailable) {
    seed.customers.push(await apiCreate("customers", customer));
  } else {
    user.customers.push(customer);
    saveUser();
  }
  await advanceCustomerId(customerId);
  f.reset();
  toast("Customer added.");
  renderAll();
}

function findMatchingCustomer(imported) {
  const importedId = text(imported.id);
  const importedName = text(imported.name).toLowerCase();
  const importedMobile = text(imported.mobile);
  return data.customers().find(customer => {
    const sameId = importedId && text(customer.id) === importedId;
    const sameName = importedName && text(customer.name).toLowerCase() === importedName;
    const sameMobile = importedMobile && text(customer.mobile) === importedMobile;
    return sameId || (sameName && sameMobile) || (sameName && !importedMobile);
  });
}

async function saveImportedCustomer(imported) {
  const match = findMatchingCustomer(imported);
  const fallbackId = String(nextCustomerId());
  const id = text(imported.id) || text(match?.id) || fallbackId;
  const record = {
    id,
    name: text(imported.name),
    mobile: text(imported.mobile),
    address: text(imported.address),
    nearby: text(imported.nearby),
    city: text(imported.city),
    state: text(imported.state) || seed.business.state,
    pin: text(imported.pin),
    stateCode: normalizeStateCode(imported.stateCode) || stateCodeFromGstin(imported.gstin) || stateCodeFromStateName(imported.state) || businessStateCode(),
    gstin: text(imported.gstin)
  };

  if (!record.name) return "skipped";

  if (match) {
    if (apiAvailable && match._id) {
      const saved = await apiPatch("customers", match._id, record);
      const seedIndex = seed.customers.findIndex(item => item._id === match._id);
      if (seedIndex >= 0) seed.customers[seedIndex] = saved;
    } else {
      const seedIndex = (seed?.customers || []).findIndex(customer => {
        const normalized = normalizeCustomer(customer);
        return normalized._id && normalized._id === match._id || text(normalized.id) === text(match.id);
      });
      if (seedIndex >= 0 && seedIndex < (seed?.customers || []).length) {
        seed.customers[seedIndex] = { ...seed.customers[seedIndex], ...record };
      } else {
        const userIndex = user.customers.findIndex(customer => text(customer.id) === text(match.id));
        if (userIndex >= 0) user.customers[userIndex] = { ...user.customers[userIndex], ...record };
      }
    }
    return "updated";
  }

  if (apiAvailable) {
    seed.customers.push(await apiCreate("customers", record));
  } else {
    user.customers.push(record);
  }
  await advanceCustomerId(num(id) || num(fallbackId));
  return "created";
}

async function importCustomersFromExcel(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  const button = $("#importCustomersBtn");
  setBusyControl(button, true, "Importing...");
  input.disabled = true;

  try {
    await ensureXlsxLoaded();
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }).map(normalizeCustomer);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const result = await saveImportedCustomer(row);
      if (result === "created") created += 1;
      if (result === "updated") updated += 1;
      if (result === "skipped") skipped += 1;
    }

    if (!apiAvailable) saveUser();
    renderAll();
    toast(`Imported customers: ${created} new, ${updated} updated, ${skipped} skipped.`);
  } catch (error) {
    console.error(error);
    toast("Could not import Excel file. Check the sheet format.");
  } finally {
    input.value = "";
    input.disabled = false;
    setBusyControl(button, false);
  }
}

function ensureXlsxLoaded() {
  if (window.XLSX) return Promise.resolve();
  if (ensureXlsxLoaded.promise) return ensureXlsxLoaded.promise;
  toast("Loading Excel importer...");
  ensureXlsxLoaded.promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Excel importer could not load."));
    document.head.appendChild(script);
  });
  return ensureXlsxLoaded.promise;
}

async function saveHeadFromModal(event) {
  event.preventDefault();
  const head = text(event.currentTarget.head.value);
  if (!head) return;
  const heads = receiptHeads();
  if (!heads.some(value => value.toLowerCase() === head.toLowerCase())) {
    await saveSettingValue("receiptHeads", [...(getSettingValue("receiptHeads") || []), head]);
  }
  renderReceiptHeads(head);
  closeModal("headModal");
  toast("Head of account added.");
}

async function savePaymentHeadFromModal(event) {
  event.preventDefault();
  const head = text(event.currentTarget.head.value);
  if (!head) return;
  const heads = paymentHeads();
  if (!heads.some(value => value.toLowerCase() === head.toLowerCase())) {
    await saveSettingValue("paymentHeads", [...(getSettingValue("paymentHeads") || []), head]);
  }
  renderPaymentHeads(head);
  closeModal("paymentHeadModal");
  toast("Payment head added.");
}

async function saveCustomerFromModal(event) {
  event.preventDefault();
  const f = event.currentTarget;
  const customerId = num(f.id.value) || nextCustomerId();
  const customer = {
    id: String(customerId),
    name: text(f.name.value),
    mobile: text(f.mobile.value),
    address: text(f.address.value),
    nearby: text(f.nearby.value),
    city: text(f.city.value),
    state: text(f.state.value) || seed.business.state,
    pin: text(f.pin.value),
    stateCode: normalizeStateCode(f.stateCode.value) || stateCodeFromGstin(f.gstin.value) || businessStateCode(),
    gstin: text(f.gstin.value)
  };
  if (apiAvailable) {
    seed.customers.push(await apiCreate("customers", customer));
  } else {
    user.customers.push(customer);
    saveUser();
  }
  await advanceCustomerId(customerId);
  applyCustomerToReceipt(customer);
  closeModal("customerModal");
  toast("Customer added.");
  renderAll();
}

async function saveSupplierFromModal(event) {
  event.preventDefault();
  const f = event.currentTarget;
  const openingBalanceRecords = data.supplierOpeningBalances()
    .filter(row => text(row.supplier).toLowerCase() === text(editingSupplier?.name || f.name.value).toLowerCase())
    .reduce((total, row) => total + num(row.amount), 0);
  const supplier = {
    name: text(f.name.value),
    mobile: text(f.mobile.value),
    address: text(f.address.value),
    gstin: text(f.gstin.value).toUpperCase(),
    bankName: text(f.bankName.value),
    accountNumber: text(f.accountNumber.value),
    ifsc: text(f.ifsc.value).toUpperCase(),
    remark: text(f.remark.value),
    // Existing opening-balance entries remain intact; this value is the adjustment
    // needed for the entered total opening balance.
    openingBalance: num(f.openingBalance.value) - openingBalanceRecords
  };
  if (!supplier.name) {
    f.name.focus();
    return;
  }
  const duplicate = data.suppliers().find(row => text(row.name).toLowerCase() === supplier.name.toLowerCase());
  if (!editingSupplier && duplicate) {
    toast("Supplier already exists.");
    f.name.focus();
    return;
  }
  if (editingSupplier?._id) {
    if (apiAvailable) {
      const saved = await apiPatch("suppliers", editingSupplier._id, supplier);
      const index = seed.suppliers.findIndex(row => text(row._id) === text(editingSupplier._id));
      if (index >= 0) seed.suppliers[index] = saved;
    } else {
      const index = user.suppliers.findIndex(row => text(row._id) === text(editingSupplier._id) || text(row.name).toLowerCase() === text(editingSupplier.name).toLowerCase());
      if (index >= 0) user.suppliers[index] = { ...user.suppliers[index], ...supplier };
      saveUser();
    }
  } else if (apiAvailable) {
    seed.suppliers.push(await apiCreate("suppliers", supplier));
  } else {
    user.suppliers.push(supplier);
    saveUser();
  }
  closeModal("supplierModal");
  toast(editingSupplier ? "Supplier details updated." : "Supplier added.");
  editingSupplier = null;
  renderAll();
}

function currentFinancialYearStart() {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  return `${Number(today.slice(5, 7)) >= 4 ? year : year - 1}-04-01`;
}

function openSupplierOpeningBalanceModal() {
  const form = $("#supplierOpeningBalanceForm");
  const supplierNames = [
    ...data.suppliers().map(row => row.name),
    ...data.purchases().map(row => row.supplier),
    ...data.outgoingCheques().map(row => row.supplier)
  ].map(text).filter(Boolean);
  const suppliers = [...new Set(supplierNames.map(name => name.toLowerCase()))]
    .map(key => supplierNames.find(name => name.toLowerCase() === key))
    .sort((a, b) => a.localeCompare(b));
  if (!suppliers.length) return toast("Add a supplier before entering an opening balance.");
  form.reset();
  $("#supplierOpeningBalanceSupplier").innerHTML = `<option value="">Select supplier</option>${suppliers.map(name => `<option value="${html(name)}">${html(name)}</option>`).join("")}`;
  form.openingDate.value = currentFinancialYearStart();
  openModal("supplierOpeningBalanceModal");
  form.supplier.focus();
}

async function saveSupplierOpeningBalance(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const record = {
    supplier: text(form.supplier.value),
    openingDate: form.openingDate.value,
    amount: num(form.amount.value),
    remark: text(form.remark.value)
  };
  if (!record.supplier || !record.openingDate) return;
  try {
    if (apiAvailable) {
      const saved = await apiCreate("supplierOpeningBalances", record);
      seed.supplierOpeningBalances = seed.supplierOpeningBalances || [];
      seed.supplierOpeningBalances.push(saved);
    } else {
      user.supplierOpeningBalances = user.supplierOpeningBalances || [];
      user.supplierOpeningBalances.push(record);
      saveUser();
    }
  } catch (error) {
    toast(error?.details?.error || error?.message || "Could not save opening balance. Please try again.");
    return;
  }
  closeModal("supplierOpeningBalanceModal");
  toast("Supplier opening balance saved.");
  renderAll();
}

async function saveCheque(event) {
  event.preventDefault();
  const f = event.currentTarget;
  const cheque = {
    customer: text(f.customer.value),
    mobile: text(f.mobile.value),
    chequeNo: text(f.chequeNo.value),
    chequeDate: f.chequeDate.value,
    amount: num(f.amount.value),
    remark: "Send to Bank",
    bankingDate: todayIso(),
    bank: text(f.bank.value),
    response: text(f.response.value)
  };
  if (isDuplicateCheque(cheque)) {
    toast("Duplicate cheque already exists in Cheque DropBox.");
    f.chequeNo.focus();
    return;
  }
  if (apiAvailable) {
    seed.cheques.push(await apiCreate("cheques", cheque));
  } else {
    user.cheques.push(cheque);
    saveUser();
  }
  f.reset();
  setDefaults();
  toast("Cheque added.");
  renderAll();
}

function isDuplicateCheque(cheque) {
  const chequeNo = text(cheque.chequeNo).toLowerCase();
  const bank = text(cheque.bank).toLowerCase();
  return data.cheques().some(row =>
    text(row.chequeNo).toLowerCase() === chequeNo
    && text(row.bank).toLowerCase() === bank
    && num(row.amount) === num(cheque.amount)
  );
}

async function saveOutgoingCheque(event) {
  event.preventDefault();
  if (outgoingChequeSaving) return;
  const f = event.currentTarget;
  const submitButton = f.querySelector("button[type='submit']");
  const originalText = submitButton?.textContent || "Add issued cheque";
  const cheque = {
    supplier: text(f.supplier.value),
    chequeNo: text(f.chequeNo.value),
    chequeDate: f.chequeDate.value,
    amount: num(f.amount.value),
    bank: text(f.bank.value),
    purpose: text(f.purpose.value),
    status: text(f.status.value) || "Issued",
    clearingDate: text(f.status.value) === "Cleared" ? todayIso() : ""
  };
  if (isDuplicateOutgoingCheque(cheque)) {
    toast("This issued cheque already exists.");
    f.chequeNo.focus();
    return;
  }
  outgoingChequeSaving = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
  }
  const voucherWindow = window.open(storeOutgoingChequeVoucher(cheque), "_blank");
  try {
    let savedCheque = cheque;
    if (apiAvailable) {
      savedCheque = await apiCreate("outgoingCheques", cheque);
      seed.outgoingCheques.push(savedCheque);
      if (voucherWindow) voucherWindow.location.href = storeOutgoingChequeVoucher(savedCheque);
    } else {
      user.outgoingCheques.push(cheque);
      saveUser();
    }
    f.reset();
    setDefaults();
    toast("Issued cheque added.");
    if (!voucherWindow) openOutgoingChequeVoucherWindow(null, savedCheque);
    renderAll();
  } catch (error) {
    toast(error.message || "Could not save issued cheque.");
  } finally {
    outgoingChequeSaving = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  }
}

async function saveItem(event) {
  event.preventDefault();
  const f = event.currentTarget;
  const item = {
    name: text(f.name.value),
    group: text(f.group.value) || "Uncategorized",
    hsn: text(f.hsn.value),
    unit: text(f.unit.value),
    rate: num(f.rate.value),
    remark: "Manual item entry",
    rateHistory: num(f.rate.value) ? [rateHistoryEntry(0, f.rate.value, "Item created")] : []
  };
  if (!item.name) {
    f.name.focus();
    return;
  }
  if (data.items().some(row => itemLabel(row.name) === itemLabel(item.name))) {
    toast("Item already exists.");
    f.name.focus();
    return;
  }
  if (apiAvailable) {
    seed.items.push(await apiCreate("items", item));
  } else {
    user.items.push(item);
    saveUser();
  }
  f.reset();
  toast("Item added.");
  renderAll();
}

function isDuplicateOutgoingCheque(cheque) {
  const chequeNo = text(cheque.chequeNo).toLowerCase();
  const bank = text(cheque.bank).toLowerCase();
  if (!chequeNo || !bank) return false;
  return data.outgoingCheques().some(row =>
    text(row.chequeNo).toLowerCase() === chequeNo
    && text(row.bank).toLowerCase() === bank
  );
}

function purchaseMatches(candidate, target) {
  const row = normalizePurchase(candidate);
  if (row._id && target._id) return row._id === target._id;
  return text(row.date) === text(target.date)
    && text(row.supplier).toLowerCase() === text(target.supplier).toLowerCase()
    && text(row.item).toLowerCase() === text(target.item).toLowerCase()
    && text(row.billNo).toLowerCase() === text(target.billNo).toLowerCase()
    && num(row.amount) === num(target.amount);
}

function findPurchaseLocation(target) {
  const userIndex = (user.purchases || []).findIndex(row => purchaseMatches(row, target));
  if (userIndex >= 0) return { source: "user", index: userIndex };
  const seedIndex = (seed?.purchases || []).findIndex(row => purchaseMatches(row, target));
  if (seedIndex >= 0) return { source: "seed", index: seedIndex };
  return null;
}

function isDuplicatePurchase(purchase, original = null) {
  const supplier = text(purchase.supplier).toLowerCase();
  const billNo = text(purchase.billNo).toLowerCase();
  if (!supplier || !billNo) return false;
  return data.purchases().some(row =>
    (!original || !purchaseMatches(row, original))
    &&
    text(row.supplier).toLowerCase() === supplier
    && text(row.billNo).toLowerCase() === billNo
  );
}

async function savePurchase(event) {
  event.preventDefault();
  if (purchaseSaving) return;
  const f = event.currentTarget;
  const isEditing = Boolean(editingPurchase);
  const submitButton = f.querySelector("button[type='submit']");
  const originalText = submitButton?.textContent || (isEditing ? "Update purchase" : "Add purchase");
  purchaseSaving = true;
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Saving...";
  }
  try {
    const paid = num(f.paid.value);
    const purchase = {
      date: f.date.value,
      supplier: text(f.supplier.value),
      item: text(f.item.value),
      qty: num(f.qty.value),
      billNo: text(f.billNo.value),
      amount: num(f.amount.value),
      paid,
      remark: "Manual purchase entry"
    };
    if (isDuplicatePurchase(purchase, editingPurchase)) {
      toast("This supplier bill already exists.");
      f.billNo.focus();
      return;
    }
    const transaction = paid > 0 ? {
      memo: text(purchase.billNo) || `PUR-${Date.now()}`,
      date: purchase.date,
      head: "MAHAJAN PAYMENT",
      party: purchase.supplier,
      billed: 0,
      cash: 0,
      bank: 0,
      expense: paid,
      type: "Purchase payment",
      remark: [purchase.item, text(purchase.billNo) ? `Bill ${purchase.billNo}` : ""].filter(Boolean).join(" - "),
      mobile: "",
      cost: 0,
      profit: 0,
      bajaj: 0
    } : null;
    if (isEditing) {
      await updatePurchaseRecord(editingPurchase, purchase);
    } else if (apiAvailable) {
      seed.purchases.push(await apiCreate("purchases", purchase));
      if (transaction) seed.transactions.push(await apiCreate("transactions", transaction));
    } else {
      user.purchases.push(purchase);
      if (transaction) user.transactions.push(transaction);
      saveUser();
    }
    editingPurchase = null;
    f.reset();
    setDefaults();
    setPurchaseSubmitText();
    toast(isEditing ? "Purchase updated." : "Purchase added.");
    renderAll();
  } catch (error) {
    toast(error.message || "Could not save purchase.");
  } finally {
    purchaseSaving = false;
    if (submitButton) {
      submitButton.disabled = false;
      setPurchaseSubmitText();
    }
  }
}

async function updatePurchaseRecord(original, updates) {
  if (apiAvailable && original._id) {
    const saved = await apiPatch("purchases", original._id, updates);
    const index = seed.purchases.findIndex(row => row._id === original._id);
    if (index >= 0) seed.purchases[index] = saved;
    return saved;
  }
  const location = findPurchaseLocation(original);
  if (!location) throw new Error("Purchase not found.");
  if (location.source === "user") {
    const before = { ...user.purchases[location.index] };
    user.purchases[location.index] = { ...user.purchases[location.index], ...updates };
    recordLocalAudit({ action: "edit", collection: "purchases", before, after: user.purchases[location.index] });
    saveUser();
    return user.purchases[location.index];
  }
  const before = { ...seed.purchases[location.index] };
  seed.purchases[location.index] = { ...seed.purchases[location.index], ...updates };
  recordLocalAudit({ action: "edit", collection: "purchases", before, after: seed.purchases[location.index] });
  saveUser();
  return seed.purchases[location.index];
}

function setPurchaseSubmitText() {
  const button = $("#purchaseForm")?.querySelector("button[type='submit']");
  if (button) button.textContent = editingPurchase ? "Update purchase" : "Add purchase";
}

function openPurchaseEditor(index) {
  const row = data.purchases()[Number(index)];
  if (!row) return toast("Purchase not found.");
  editingPurchase = row;
  const form = $("#purchaseForm");
  form.date.value = dateOnly(row.date);
  form.supplier.value = text(row.supplier);
  form.item.value = text(row.item);
  form.qty.value = decimal2(row.qty);
  form.billNo.value = text(row.billNo);
  form.amount.value = decimal2(row.amount);
  form.paid.value = decimal2(row.paid);
  setPurchaseSubmitText();
  form.supplier.focus();
  window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
}

async function deletePurchaseRecord(index) {
  const row = data.purchases()[Number(index)];
  if (!row) return toast("Purchase not found.");
  if (!confirm(`Delete purchase bill ${row.billNo || row.supplier}?`)) return;
  if (apiAvailable && row._id) {
    await apiDelete("purchases", row._id);
    seed.purchases = seed.purchases.filter(item => item._id !== row._id);
  } else {
    const location = findPurchaseLocation(row);
    if (!location) return toast("Purchase not found.");
    if (location.source === "user") {
      recordLocalAudit({ action: "delete", collection: "purchases", before: user.purchases[location.index] });
      user.purchases.splice(location.index, 1);
      saveUser();
    } else {
      recordLocalAudit({ action: "delete", collection: "purchases", before: seed.purchases[location.index] });
      seed.purchases.splice(location.index, 1);
      saveUser();
    }
  }
  if (editingPurchase && purchaseMatches(row, editingPurchase)) {
    editingPurchase = null;
    $("#purchaseForm").reset();
    setDefaults();
    setPurchaseSubmitText();
  }
  toast("Purchase deleted.");
  renderAll();
}

