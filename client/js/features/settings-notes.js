function receiptMemoSettings() {
  const saved = getSettingValue("receiptMemo") || {};
  const nextNo = Math.max(1, num(saved.nextNo) || num(saved.startNo) || RECEIPT_MEMO_DEFAULTS.nextNo);
  const legacyPrefix = text(saved.format).split("{")[0];
  return {
    ...RECEIPT_MEMO_DEFAULTS,
    ...saved,
    auto: Boolean(saved.auto),
    nextNo,
    prefix: text(saved.prefix) || legacyPrefix || RECEIPT_MEMO_DEFAULTS.prefix
  };
}

function formatReceiptMemo(number, settings = receiptMemoSettings()) {
  return `${text(settings.prefix)}${Math.max(1, num(number) || 1)}`;
}

function paymentMemoSettings() {
  const saved = getSettingValue("paymentMemo") || {};
  const nextNo = Math.max(1, num(saved.nextNo) || num(saved.startNo) || PAYMENT_MEMO_DEFAULTS.nextNo);
  const legacyPrefix = text(saved.format).split("{")[0];
  return {
    ...PAYMENT_MEMO_DEFAULTS,
    ...saved,
    auto: Boolean(saved.auto),
    nextNo,
    prefix: text(saved.prefix) || legacyPrefix || PAYMENT_MEMO_DEFAULTS.prefix
  };
}

function formatPaymentMemo(number, settings = paymentMemoSettings()) {
  return `${text(settings.prefix)}${Math.max(1, num(number) || 1)}`;
}

function businessProfile() {
  const saved = getSettingValue("businessProfile") || {};
  const fallback = seed?.business || {};
  const gstin = text(saved.gstin) || text(fallback.gstin);
  const stateCode = normalizeStateCode(saved.stateCode)
    || stateCodeFromGstin(gstin)
    || normalizeStateCode(fallback.stateCode)
    || stateCodeFromGstin(fallback.gstin)
    || stateCodeFromStateName(fallback.state)
    || "19";
  return {
    name: text(saved.name) || text(fallback.name) || "G.S. STEEL FURNITURE",
    address: text(saved.address) || text(fallback.address) || text(fallback.place) || "",
    stateCode,
    gstin
  };
}

function businessStateCode() {
  return businessProfile().stateCode;
}

function accountDetails() {
  const saved = getSettingValue("accountDetails") || {};
  return {
    bankName: text(saved.bankName),
    accountNumber: text(saved.accountNumber),
    ifsc: text(saved.ifsc),
    branch: text(saved.branch),
    upi: text(saved.upi)
  };
}

function upiIdFromAccount(account = {}) {
  const match = text(account.upi).match(/[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9._-]{2,}/);
  return match ? match[0] : "";
}

function paymentQrPayload({ account = {}, amount = 0, profile = {}, tx = {} } = {}) {
  const upiId = upiIdFromAccount(account);
  if (upiId && num(amount) > 0) {
    const params = new URLSearchParams({
      pa: upiId,
      pn: text(profile.name) || "G.S. STEEL FURNITURE",
      am: num(amount).toFixed(2),
      cu: "INR",
      tn: `Receipt ${text(tx.memo)}`
    });
    return `upi://pay?${params.toString()}`;
  }
  return [
    `Receipt: ${text(tx.memo)}`,
    `Date: ${text(tx.date)}`,
    `Business: ${text(profile.name)}`,
    `Total Balance to be Paid: ${money(amount)}`
  ].join("\n");
}

function qrCodeUrl(payload, size = 148) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(payload)}`;
}

function paymentQrMarkup({ account = {}, amount = 0, profile = {}, tx = {} } = {}) {
  if (num(amount) <= 0) return "";
  const payload = paymentQrPayload({ account, amount, profile, tx });
  const upiId = upiIdFromAccount(account);
  return `
    <div class="payment-qr">
      <img src="${html(qrCodeUrl(payload))}" alt="QR code for total balance payment">
      <div>
        <strong>Scan to Pay</strong>
        <span>Total Balance to be Paid</span>
        <b>${money(amount)}</b>
        ${upiId ? `<small>UPI: ${html(upiId)}</small>` : "<small>Receipt summary QR</small>"}
      </div>
    </div>
  `;
}

function businessInitials(name) {
  const words = text(name).split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map(word => word[0]) : text(name).slice(0, 2)).join("").toUpperCase() || "GS";
}

function renderBusinessBrand() {
  if (!seed) return;
  const profile = businessProfile();
  $("#brandName").textContent = profile.name;
  $("#brandMark").textContent = businessInitials(profile.name);
  $("#brandSubtitle").textContent = profile.gstin ? `GSTIN ${profile.gstin}` : "Cashbook and billing";
  document.title = `${profile.name} Cashbook`;
}

function customerOptionLabel(customer) {
  return [text(customer.name), text(customer.id)].filter(Boolean).join(" - ");
}

function receiptHeads() {
  const custom = getSettingValue("receiptHeads") || [];
  return [...new Set([...DEFAULT_RECEIPT_HEADS, ...custom.map(text).filter(Boolean)])]
    .filter(head => head.toLowerCase() !== "due");
}

function paymentHeads() {
  const custom = getSettingValue("paymentHeads") || [];
  return [...new Set([...DEFAULT_PAYMENT_HEADS, ...custom.map(text).filter(Boolean)])];
}

function renderReceiptHeads(selected = $("#receiptForm")?.head?.value) {
  const select = $("#receiptForm")?.head;
  if (!select) return;
  const heads = [...new Set([...receiptHeads(), text(selected)].filter(Boolean))];
  select.innerHTML = heads.map(head => `<option ${head === selected ? "selected" : ""}>${head}</option>`).join("");
}

function renderPaymentHeads(selected = $("#paymentForm")?.head?.value) {
  const select = $("#paymentForm")?.head;
  if (!select) return;
  const heads = [...new Set([...paymentHeads(), text(selected)].filter(Boolean))];
  select.innerHTML = heads.map(head => `<option ${head === selected ? "selected" : ""}>${head}</option>`).join("");
}

function resetPaymentFormForMode(modeName) {
  const form = $("#paymentForm");
  if (!form) return;
  form.reset();
  setDefaults();
  editingPaymentTransaction = null;
  renderPaymentHeads(modeName);
  applyPaymentMemoMode();
  form.fundReceived.checked = modeName === "Fund Received";
  form.staffDue.checked = false;
  form.duePaid.checked = false;
}

function applyPaymentDueMode(changed = "") {
  const form = $("#paymentForm");
  if (!form) return;
  if (changed === "fund" && form.fundReceived?.checked) resetPaymentFormForMode("Fund Received");
  if (changed === "staff" && form.staffDue?.checked) form.fundReceived.checked = false;
  if (changed === "paid" && form.duePaid?.checked) form.fundReceived.checked = false;
  if (changed === "staff" && form.staffDue?.checked) form.duePaid.checked = false;
  if (changed === "paid" && form.duePaid?.checked) form.staffDue.checked = false;
  const staffDue = Boolean(form.staffDue?.checked);
  const duePaid = Boolean(form.duePaid?.checked);
  const fundReceived = Boolean(form.fundReceived?.checked);
  if (staffDue) form.head.value = "Due";
  if (duePaid) form.head.value = "Due Paid";
  if (fundReceived) form.head.value = "Fund Received";
  const locked = staffDue || duePaid || fundReceived;
  form.head.disabled = locked;
  form.head.classList.toggle("locked", locked);
  if (form.amount) form.amount.required = !fundReceived;
  if (form.paymentMethod) form.paymentMethod.disabled = fundReceived;
  const title = $("#paymentVoucherTitle");
  const partyLabel = $("#paymentPartyLabel");
  const amountLabel = $("#paymentAmountLabel");
  const bankLabel = $("#paymentBankLabel");
  const financeLabel = $("#paymentFinanceLabel");
  const financeField = $("#paymentFinanceField");
  const methodLabel = $("#paymentMethodLabel");
  if (title) title.textContent = fundReceived ? "Fund Received" : duePaid ? "Due Paid Voucher" : "Payment Voucher";
  if (partyLabel) partyLabel.textContent = fundReceived || duePaid ? "Received From" : "Paid To";
  if (amountLabel) amountLabel.textContent = fundReceived ? "Cash Amount" : duePaid ? "Received Amount in Cash" : staffDue ? "Cash Expense Amount" : "Expense Amount";
  if (bankLabel) bankLabel.textContent = fundReceived ? "Bank Amount" : duePaid ? "Received Amount in Bank" : staffDue ? "Bank Expense Amount" : "Bank Amount";
  if (financeLabel) financeLabel.textContent = fundReceived ? "Finance Amount" : "Finance Amount";
  if (financeField) financeField.hidden = !fundReceived;
  if (methodLabel) methodLabel.hidden = fundReceived;
}

function applyStaffDueMode() {
  applyPaymentDueMode();
}

function applyPaymentHeadModeFromSelect() {
  const form = $("#paymentForm");
  if (!form) return;
  const head = text(form.head.value).toLowerCase();
  form.staffDue.checked = head === "due";
  form.duePaid.checked = head === "due paid";
  form.fundReceived.checked = head === "fund received";
  applyPaymentDueMode(head === "due" ? "staff" : head === "due paid" ? "paid" : head === "fund received" ? "fund" : "");
}

function renderPaymentPartyList() {
  const list = $("#paymentPartyList");
  if (!list) return;
  const values = [
    ...data.customers().slice().reverse().filter(customer => text(customer.id)).map(customerOptionLabel),
    ...data.dues().map(row => row.name)
  ].map(text).filter(Boolean);
  const unique = [...new Set(values)].slice(0, DATALIST_OPTION_LIMIT);
  list.innerHTML = unique.map(value => `<option value="${html(value)}"></option>`).join("");
}

function renderHeadManagers() {
  renderHeadManagerList("settingsReceiptHeads", receiptHeads(), DEFAULT_RECEIPT_HEADS, "receipt");
  renderHeadManagerList("settingsPaymentHeads", paymentHeads(), DEFAULT_PAYMENT_HEADS, "payment");
}

function renderHeadManagerList(nodeId, heads, defaults, type) {
  const node = $(`#${nodeId}`);
  if (!node) return;
  node.innerHTML = heads.map(head => {
    const isDefault = defaults.some(value => value.toLowerCase() === head.toLowerCase());
    const deleteButton = isDefault
      ? `<span class="head-chip-lock">Default</span>`
      : `${rowUnlockButton("head", head)}<button type="button" data-delete-head-type="${type}" data-delete-head="${html(head)}" aria-label="Delete ${html(head)}"${actionControlAttrs("head", head, "Delete head")}>x</button>`;
    return `<span class="head-chip"><strong>${html(head)}</strong>${deleteButton}</span>`;
  }).join("");
}

async function addHeadFromSettings(type) {
  const isReceipt = type === "receipt";
  const input = $(isReceipt ? "#settingsReceiptHeadInput" : "#settingsPaymentHeadInput");
  const head = text(input?.value);
  if (!head) return;
  const key = isReceipt ? "receiptHeads" : "paymentHeads";
  const allHeads = isReceipt ? receiptHeads() : paymentHeads();
  if (allHeads.some(value => value.toLowerCase() === head.toLowerCase())) {
    toast("Head already exists.");
    input.value = "";
    return;
  }
  await saveSettingValue(key, [...(getSettingValue(key) || []), head]);
  input.value = "";
  renderReceiptHeads();
  renderPaymentHeads();
  renderHeadManagers();
  toast("Head added.");
}

async function deleteHeadFromSettings(type, head) {
  const isReceipt = type === "receipt";
  const defaults = isReceipt ? DEFAULT_RECEIPT_HEADS : DEFAULT_PAYMENT_HEADS;
  if (defaults.some(value => value.toLowerCase() === text(head).toLowerCase())) {
    toast("Default head cannot be deleted.");
    return;
  }
  const key = isReceipt ? "receiptHeads" : "paymentHeads";
  const nextHeads = (getSettingValue(key) || []).filter(value => value.toLowerCase() !== text(head).toLowerCase());
  await saveSettingValue(key, nextHeads);
  renderReceiptHeads();
  renderPaymentHeads();
  renderHeadManagers();
  toast("Head deleted.");
}

function findCustomerFromReceiptInput(value) {
  const raw = text(value).toLowerCase();
  return data.customers().find(customer => {
    if (!text(customer.id)) return false;
    const id = text(customer.id).toLowerCase();
    const name = text(customer.name).toLowerCase();
    const label = customerOptionLabel(customer).toLowerCase();
    return raw === id || raw === name || raw === label;
  });
}

function validateReceiptCustomer(showAlert = true) {
  const form = $("#receiptForm");
  const alert = $("#receiptCustomerAlert");
  if (!form || !alert) return true;
  const hasValue = Boolean(text(form.customer.value));
  const matched = Boolean(findCustomerFromReceiptInput(form.customer.value));
  alert.hidden = !showAlert || !hasValue || matched;
  return !hasValue || matched;
}

function nextCustomerId() {
  const savedNext = num(getSettingValue("customerNextId"));
  if (savedNext >= 1000) return savedNext;
  const usedIds = data.customers()
    .map(customer => text(customer.id))
    .filter(id => /^\d+$/.test(id))
    .map(Number)
    .filter(id => id >= 1000 && id < 10000);
  return Math.max(999, ...usedIds) + 1;
}

async function advanceCustomerId(currentId) {
  await saveSettingValue("customerNextId", Math.max(1000, num(currentId) + 1));
}

function applyCustomerToReceipt(customer) {
  if (!customer) return;
  const form = $("#receiptForm");
  form.customer.value = customerOptionLabel(customer);
  form.mobile.value = customer.mobile;
  form.address.value = [customer.address, customer.city, customer.state, customer.pin].filter(Boolean).join(", ");
  form.stateCode.value = customer.stateCode || stateCodeFromGstin(customer.gstin) || businessStateCode();
  form.gstin.value = customer.gstin;
  renderItems();
}

function applyCustomerToCheque(customer) {
  if (!customer) return;
  const form = $("#chequeForm");
  form.customer.value = customerOptionLabel(customer);
  form.mobile.value = customer.mobile;
}

async function migrateGeneratedCustomerIds() {
  const needsNumber = customer => /^WEB-/i.test(text(customer.id ?? customer["Cust-ID"]));
  let nextId = nextCustomerId();
  let changed = false;

  for (const customer of seed?.customers || []) {
    if (!needsNumber(customer)) continue;
    const id = String(nextId++);
    customer.id = id;
    customer["Cust-ID"] = id;
    changed = true;
    if (apiAvailable && customer._id) await apiPatch("customers", customer._id, { id });
  }

  for (const customer of user.customers || []) {
    if (!needsNumber(customer)) continue;
    customer.id = String(nextId++);
    changed = true;
  }

  if (changed) {
    if (!apiAvailable) saveUser();
    await saveSettingValue("customerNextId", nextId);
  }
}

async function migrateDuePaidTransactionsToDueRegister() {
  const existing = data.dues();
  const needsDuePaidRow = tx => {
    const head = text(tx.head).toLowerCase();
    const type = text(tx.type).toLowerCase();
    return head.replace(/\s+/g, " ") === "due paid" || type.replace(/\s+/g, " ") === "due paid";
  };
  const hasDuePaidRow = tx => {
    const paid = num(tx.cash) + num(tx.bank) || num(tx.expense);
    return existing.some(row =>
      text(row.memo) === text(tx.memo)
      && text(row.name).toLowerCase() === text(tx.party).toLowerCase()
      && num(row.paid) === paid
    );
  };

  const rows = data.transactions()
    .filter(tx => needsDuePaidRow(tx) && text(tx.party) && (num(tx.cash) + num(tx.bank) || num(tx.expense)) > 0 && !hasDuePaidRow(tx))
    .map(tx => ({
      date: text(tx.date) || todayIso(),
      name: text(tx.party),
      head: "Due Paid",
      memo: text(tx.memo),
      due: 0,
      paid: num(tx.cash) + num(tx.bank) || num(tx.expense),
      remark: text(tx.remark) || "Due paid"
    }));

  if (!rows.length) return;

  if (apiAvailable) {
    for (const row of rows) seed.dues.push(await apiCreate("dues", row));
  } else {
    user.dues.push(...rows);
    saveUser();
  }
  toast(`Backfilled ${rows.length} due paid record${rows.length > 1 ? "s" : ""}.`);
}

function fillReceiptMemoSettings() {
  const form = $("#settingsForm");
  if (!form) return;
  const settings = receiptMemoSettings();
  form.receiptMemoAuto.checked = settings.auto;
  form.receiptMemoPrefix.value = settings.prefix;
  form.receiptMemoNext.value = settings.nextNo;
  updateReceiptMemoPreview();
}

function fillPaymentMemoSettings() {
  const form = $("#settingsForm");
  if (!form) return;
  const settings = paymentMemoSettings();
  form.paymentMemoAuto.checked = settings.auto;
  form.paymentMemoPrefix.value = settings.prefix;
  form.paymentMemoNext.value = settings.nextNo;
  updatePaymentMemoPreview();
}

function fillBusinessProfileSettings() {
  const form = $("#settingsForm");
  if (!form) return;
  const profile = businessProfile();
  form.businessName.value = profile.name;
  form.businessAddress.value = profile.address;
  form.businessStateCode.value = profile.stateCode;
  form.businessGstin.value = profile.gstin;
  form.billTemplate.value = text(getSettingValue("billTemplate")) === "modern" ? "modern" : "classic";
}

function fillAccountDetailsSettings() {
  const form = $("#settingsForm");
  if (!form) return;
  const accounts = cashbookBankAccounts();
  const defaultId = cashbookDefaultBankAccountId();
  const defaultSelect = $("#settingsDefaultBankAccount");
  if (defaultSelect) {
    defaultSelect.innerHTML = accounts.map(account => `<option value="${html(account.id)}">${html(account.name)}${account.bankName ? ` · ${html(account.bankName)}` : ""}</option>`).join("");
    defaultSelect.value = defaultId;
  }
  const list = $("#settingsBankAccounts");
  if (list) list.innerHTML = accounts.map(account => `
    <article class="settings-bank-account">
      <div><strong>${html(account.name)}</strong>${account.id === defaultId ? `<span class="head-chip-lock">Default for invoices</span>` : ""}<small>${html([account.bankName, account.accountNumber && `A/C ${account.accountNumber}`, account.ifsc && `IFSC ${account.ifsc}`, account.branch, account.upi].filter(Boolean).join(" · ") || "No bank details added")}</small></div>
      <div class="settings-bank-account-actions"><button type="button" class="secondary" data-edit-bank-account="${html(account.id)}">Edit</button><button type="button" class="secondary" data-delete-bank-account="${html(account.id)}"${accounts.length <= 1 ? " disabled title=\"Keep at least one account\"" : ""}>Remove</button></div>
    </article>`).join("") || `<p class="panel-subtitle">No bank accounts yet. Add an account to show it on invoices and receipt forms.</p>`;
  $$('[data-edit-bank-account]', list || document).forEach(button => button.addEventListener("click", () => {
    const account = cashbookAccountById(button.dataset.editBankAccount);
    const editor = $("#settingsBankAccountForm");
    if (!account || !editor) return;
    ["id", "name", "bankName", "accountNumber", "ifsc", "branch", "upi"].forEach(key => { if (editor.elements.namedItem(key)) editor.elements.namedItem(key).value = account[key] || ""; });
    editor.closest("details")?.setAttribute("open", "");
    editor.name.focus();
  }));
  $$('[data-delete-bank-account]', list || document).forEach(button => button.addEventListener("click", () => withBusyControl(button, async () => {
    const deletedId = button.dataset.deleteBankAccount;
    const accounts = cashbookBankAccounts().filter(account => account.id !== deletedId);
    if (!accounts.length) return toast("Keep at least one bank account.");
    await saveSettingValue(CASHBOOK_BANK_ACCOUNTS_KEY, accounts);
    if (text(getSettingValue("cashbookDefaultBankAccountId")) === deletedId) {
      await saveSettingValue("cashbookDefaultBankAccountId", accounts[0].id);
      await saveSettingValue("accountDetails", accounts[0]);
    }
    fillAccountDetailsSettings();
    renderCashbookBankAccountSelects();
    toast("Bank account removed.");
  }, "Removing...")));
}

async function saveSettingsBankAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const accounts = cashbookBankAccounts();
  const id = text(form.id.value) || `bank-${Date.now().toString(36)}`;
  const account = { id, name: text(form.name.value), bankName: text(form.bankName.value), accountNumber: text(form.accountNumber.value), ifsc: text(form.ifsc.value), branch: text(form.branch.value), upi: text(form.upi.value) };
  if (accounts.some(item => item.id !== id && item.name.toLowerCase() === account.name.toLowerCase())) return toast("An account with that name already exists.");
  const index = accounts.findIndex(item => item.id === id);
  if (index >= 0) accounts[index] = account;
  else accounts.push(account);
  await saveSettingValue(CASHBOOK_BANK_ACCOUNTS_KEY, accounts);
  if (text(getSettingValue("cashbookDefaultBankAccountId")) === id) await saveSettingValue("accountDetails", account);
  if (!text(getSettingValue("cashbookDefaultBankAccountId"))) {
    await saveSettingValue("cashbookDefaultBankAccountId", id);
    await saveSettingValue("accountDetails", account);
  }
  form.reset();
  form.closest("details")?.removeAttribute("open");
  fillAccountDetailsSettings();
  renderCashbookBankAccountSelects();
  toast("Bank account saved.");
}

function localPendingCounts() {
  const rowCount = BACKUP_DATA_KEYS
    .reduce((total, key) => total + ((user[key] || []).length), 0);
  return rowCount + Object.keys(user.chequeOverrides || {}).length;
}

function updateStorageSettingsStatus() {
  const form = $("#settingsForm");
  if (form?.localStorageMode) form.localStorageMode.checked = storageMode === "local";
  const status = $("#storageModeStatus");
  if (!status) return;
  const modeLabel = storageMode === "local"
    ? "Local storage mode"
    : apiConnected ? "Auto mode: Cloud connected" : "Auto mode: using local storage";
  const writeLabel = apiAvailable ? "New entries save to Cloud." : "New entries save in this browser.";
  status.innerHTML = `
    <strong>${modeLabel}</strong>
    <span>${writeLabel}</span>
    <small>${localPendingCounts()} local record${localPendingCounts() === 1 ? "" : "s"} pending sync.</small>
  `;
}

function updateDashboardRefreshStatus() {
  const status = $("#dashboardRefreshStatus");
  if (!status) return;
  const pending = localPendingCounts();
  status.textContent = pending
    ? `${pending} local record${pending === 1 ? "" : "s"} pending upload before refresh.`
    : "Ready to fetch latest Cloud records.";
}

function fillStorageSettings() {
  updateStorageSettingsStatus();
}

function openModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal(id) {
  const modal = $(`#${id}`);
  if (!modal) return;
  modal.hidden = true;
  if (!$$(".modal-backdrop").some(node => !node.hidden)) document.body.classList.remove("modal-open");
}

function openHeadModal() {
  $("#headModalForm").reset();
  openModal("headModal");
  $("#headModalForm").head.focus();
}

function openPaymentHeadModal() {
  $("#paymentHeadModalForm").reset();
  openModal("paymentHeadModal");
  $("#paymentHeadModalForm").head.focus();
}

function openSupplierModal() {
  const form = $("#supplierModalForm");
  editingSupplier = null;
  form.reset();
  form.name.readOnly = false;
  form.name.removeAttribute("title");
  $("#supplierModalTitle").textContent = "Add Supplier / Mahajan";
  form.querySelector("button[type='submit']").textContent = "Save Supplier";
  openModal("supplierModal");
  form.name.focus();
}

function openSupplierEditor(supplierName) {
  const form = $("#supplierModalForm");
  const existing = data.suppliers().find(row => text(row.name).toLowerCase() === text(supplierName).toLowerCase());
  const summary = supplierSummary().find(row => text(row.supplier).toLowerCase() === text(supplierName).toLowerCase()) || {};
  editingSupplier = existing || { name: supplierName };
  form.reset();
  form.name.value = text(existing?.name || summary.supplier || supplierName);
  const nameLocked = supplierHasPurchases(form.name.value);
  form.name.readOnly = nameLocked;
  if (nameLocked) form.name.title = "Supplier Name cannot be changed after purchases exist.";
  else form.name.removeAttribute("title");
  form.openingBalance.value = num(summary.openingBalance);
  form.mobile.value = text(existing?.mobile || summary.mobile);
  form.address.value = text(existing?.address);
  form.gstin.value = text(existing?.gstin || summary.gstin);
  form.bankName.value = text(existing?.bankName);
  form.accountNumber.value = text(existing?.accountNumber);
  form.ifsc.value = text(existing?.ifsc);
  form.remark.value = text(existing?.remark || summary.remark);
  $("#supplierModalTitle").textContent = "Edit Supplier Details";
  form.querySelector("button[type='submit']").textContent = "Update Supplier";
  openModal("supplierModal");
  form.name.focus();
}

function renderModalCustomerResults() {
  const q = text($("#modalCustomerSearch").value).toLowerCase();
  const rows = data.customers()
    .filter(c => text(c.id))
    .filter(c => !q || `${c.id} ${c.name} ${c.mobile} ${c.address} ${c.city} ${c.gstin}`.toLowerCase().includes(q))
    .slice(0, 40);
  $("#modalCustomerResults").innerHTML = rows.map(customer => `
    <button type="button" class="customer-result" data-modal-customer="${customer.id}">
      <strong>${text(customer.name) || "Unnamed Customer"}</strong>
      <span>${[customer.id, customer.mobile, customer.city].filter(Boolean).join(" | ")}</span>
    </button>
  `).join("") || `<div class="modal-empty">No customers found</div>`;
}

function renderModalCustomerHistory(customer) {
  if (!customer) return;
  const customerKeys = [customer.name, customerOptionLabel(customer)].map(value => text(value).toLowerCase());
  const rows = data.transactions()
    .filter(row => customerKeys.includes(text(row.party).toLowerCase()))
    .slice(-25)
    .reverse();
  const summary = rows.reduce((totals, row) => {
    totals.billed += num(row.billed);
    totals.paid += num(row.cash) + num(row.bank) + num(row.bajaj);
    return totals;
  }, { billed: 0, paid: 0 });
  $("#modalCustomerHistory").innerHTML = `
    <div class="modal-history-head">
      <div>
        <strong>${text(customer.name) || "Unnamed Customer"}</strong>
        <span>${[customer.mobile, customer.address, customer.city].filter(Boolean).join(" | ")}</span>
      </div>
      <button type="button" data-customer-modal-ok>OK</button>
    </div>
    <div class="modal-history-summary">
      <span>Billed <strong>${money(summary.billed)}</strong></span>
      <span>Paid <strong>${money(summary.paid)}</strong></span>
      <span>Balance <strong>${money(summary.billed - summary.paid)}</strong></span>
    </div>
    <div class="modal-history-table">
      <table>
        <thead><tr><th>Date</th><th>Memo</th><th>Particulars</th><th>Billed</th><th>Paid</th></tr></thead>
        <tbody>
          ${rows.map(row => {
            const paid = num(row.cash) + num(row.bank) + num(row.bajaj);
            return `<tr><td>${dateOnly(row.date)}</td><td>${text(row.memo)}</td><td>${text(row.remark || row.head)}</td><td>${money(row.billed)}</td><td>${money(paid)}</td></tr>`;
          }).join("") || `<tr><td colspan="5">No transactions found for this customer</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function openCustomerModal() {
  const form = $("#customerModalForm");
  const profile = businessProfile();
  form.reset();
  form.id.value = nextCustomerId();
  form.city.value = "Tufanganj";
  form.state.value = seed.business.state || "West Bengal";
  form.stateCode.value = businessStateCode();
  $("#customerModalBusiness").textContent = profile.name;
  $("#modalCustomerSearch").value = text($("#receiptForm").customer.value);
  $("#modalCustomerHistory").textContent = "Select a customer to fill receipt details.";
  renderModalCustomerResults();
  openModal("customerModal");
  $("#modalCustomerSearch").focus();
}

let settingsUsersLoading = false;

function currentUserIsAdmin() {
  return text(authUser?.role).toLowerCase() === "admin";
}

function setUserManagementStatus(message) {
  const status = $("#ownPasswordStatus");
  if (status) status.textContent = message;
}

function userStatusMarkup(user = {}) {
  return user.blocked
    ? `<span class="status bad">Blocked</span>`
    : `<span class="status ok">Active</span>`;
}

async function renderUserManagement() {
  const tableNode = $("#settingsUsersTable");
  const ownStatus = $("#ownPasswordStatus");
  if (!tableNode) return;
  if (ownStatus) {
    ownStatus.textContent = authUser?.username
      ? `Signed in as ${text(authUser.username)}.`
      : "Signed in as admin.";
  }
  if (!apiAvailable) {
    tableNode.innerHTML = `
      <tbody>
        <tr><td>User management is available after connecting to MongoDB.</td></tr>
      </tbody>
    `;
    return;
  }
  if (!currentUserIsAdmin()) {
    tableNode.innerHTML = `
      <tbody>
        <tr><td>Only admin users can view the user list.</td></tr>
      </tbody>
    `;
    return;
  }
  if (settingsUsersLoading) return;
  settingsUsersLoading = true;
  tableNode.innerHTML = `
    <tbody>
      <tr><td>Loading users...</td></tr>
    </tbody>
  `;
  try {
    const users = await apiListUsers();
    const rows = users.map(user => {
      const isCurrent = text(user.id) === text(authUser?.id);
      return `
        <tr>
          <td>
            <strong>${html(user.name || user.username)}</strong>
            <small>${html(user.username)}${isCurrent ? " (you)" : ""}</small>
          </td>
          <td>${html(user.role || "admin")}</td>
          <td>${userStatusMarkup(user)}</td>
          <td>
            <div class="user-row-actions">
              <input type="password" data-user-password="${html(user.id)}" minlength="6" placeholder="New password">
              <button type="button" class="secondary" data-reset-user-password="${html(user.id)}">Change</button>
              <button type="button" class="${user.blocked ? "secondary" : "danger-btn"}" data-toggle-user-block="${html(user.id)}" data-next-blocked="${user.blocked ? "false" : "true"}"${isCurrent && !user.blocked ? " disabled title=\"You cannot block your own account\"" : ""}>${user.blocked ? "Unblock" : "Block"}</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
    tableNode.innerHTML = `
      <thead>
        <tr><th>User</th><th>Role</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4">No users found</td></tr>`}</tbody>
    `;
  } catch (error) {
    tableNode.innerHTML = `
      <tbody>
        <tr><td>${html(error.details?.error || error.message || "Could not load users.")}</td></tr>
      </tbody>
    `;
  } finally {
    settingsUsersLoading = false;
  }
}

async function changeOwnPassword() {
  const currentInput = $("#ownCurrentPassword");
  const nextInput = $("#ownNewPassword");
  const currentPassword = currentInput?.value || "";
  const newPassword = nextInput?.value || "";
  if (!apiAvailable) {
    toast("Connect to Cloud before changing user passwords.");
    return;
  }
  if (!currentPassword || newPassword.length < 6) {
    toast("Enter current password and a new 6 character password.");
    return;
  }
  const result = await apiChangeOwnPassword(currentPassword, newPassword);
  authUser = result?.user || authUser;
  if (authUser?.username) await rememberOfflineLogin(authUser.username, newPassword, authUser);
  if (currentInput) currentInput.value = "";
  if (nextInput) nextInput.value = "";
  setUserManagementStatus("Password changed.");
  toast("Your password changed.");
}

async function resetUserPassword(userId) {
  const input = document.querySelector(`[data-user-password="${CSS.escape(userId)}"]`);
  const password = input?.value || "";
  if (!password || password.length < 6) {
    toast("Enter a new 6 character password.");
    input?.focus();
    return;
  }
  await apiSetUserPassword(userId, password);
  input.value = "";
  toast("User password changed.");
}

async function toggleUserBlocked(userId, blocked) {
  await apiSetUserBlocked(userId, blocked);
  await renderUserManagement();
  toast(blocked ? "User blocked." : "User unblocked.");
}

function fillSettingsForm() {
  fillBusinessProfileSettings();
  fillAccountDetailsSettings();
  fillReceiptMemoSettings();
  fillPaymentMemoSettings();
  fillStorageSettings();
  fillActionLockSettings();
  const gst2bRowDeleteEnabled = $("#gst2bRowDeleteEnabled");
  if (gst2bRowDeleteEnabled) gst2bRowDeleteEnabled.checked = getSettingValue("gst2bRowDeleteEnabled") === true;
  renderHeadManagers();
  renderUserManagement();
}

function actionPassword() {
  return text(getSettingValue("actionLock")?.password) || "1234";
}

async function refreshActionLockStatusFromServer() {
  if (!apiAvailable) {
    actionLockHasDbPassword = Boolean(getSettingValue("actionLock")?.password);
    return;
  }
  try {
    const status = await apiActionLockStatus();
    actionLockHasDbPassword = status?.hasPassword === true;
  } catch {
    actionLockHasDbPassword = false;
  }
}

function actionRowKey(type, token) {
  return `${type}:${text(token)}`;
}

function actionRowUnlocked(type, token) {
  return unlockedActionRows.has(actionRowKey(type, token));
}

function actionControlAttrs(type, token, label) {
  if (actionRowUnlocked(type, token)) return "";
  return ` disabled title="Unlock row to ${html(label).toLowerCase()}" aria-disabled="true"`;
}

function rowUnlockButton(type, token) {
  const unlocked = actionRowUnlocked(type, token);
  return `<button type="button" class="symbol-btn lock-symbol ${unlocked ? "unlocked" : ""}" data-unlock-row-type="${html(type)}" data-unlock-row-token="${html(token)}" title="${unlocked ? "Row unlocked" : "Unlock row"}" aria-label="${unlocked ? "Row unlocked" : "Unlock row"}">${unlocked ? "U" : "L"}</button>`;
}

function ensureActionRowUnlocked(type, token) {
  if (actionRowUnlocked(type, token)) return true;
  toast("Unlock this row before editing or deleting.");
  return false;
}

async function unlockActionRow(type, token) {
  const key = actionRowKey(type, token);
  if (unlockedActionRows.has(key)) {
    unlockedActionRows.delete(key);
    toast("Row locked.");
    renderAll();
    return;
  }
  const password = prompt("Enter edit/delete password");
  if (password === null) return;
  let verified = false;
  if (apiAvailable) {
    try {
      verified = (await apiVerifyActionLockPassword(password))?.ok === true;
    } catch {
      verified = false;
    }
  } else {
    verified = text(password) === actionPassword();
  }
  if (!verified) {
    toast("Wrong password.");
    return;
  }
  unlockedActionRows.add(key);
  toast("Row unlocked.");
  renderAll();
}

function fillActionLockSettings() {
  const form = $("#settingsForm");
  if (!form?.actionLockPassword) return;
  form.actionLockPassword.value = "";
  updateActionLockStatus();
}

function updateActionLockStatus() {
  const node = $("#actionLockStatus");
  if (!node) return;
  node.textContent = (apiAvailable ? actionLockHasDbPassword : Boolean(getSettingValue("actionLock")?.password))
    ? "Password is saved. Rows must be unlocked before edit/delete."
    : "Default password is 1234. Set a new password for better safety.";
}

async function saveActionLockPassword() {
  const form = $("#settingsForm");
  const button = $("#saveActionLockBtn");
  if (!form?.actionLockPassword) return;
  const password = text(form.actionLockPassword.value);
  if (!password) {
    form.actionLockPassword.focus();
    toast("Enter a password.");
    return;
  }
  const originalText = button?.textContent || "Save password";
  if (button) {
    button.disabled = true;
    button.textContent = "Saving...";
  }
  try {
    if (apiAvailable) {
      await apiSaveActionLockPassword(password);
      actionLockHasDbPassword = true;
    } else {
      await saveSettingValue("actionLock", { password });
    }
    fillActionLockSettings();
    renderAll();
    toast("Edit/delete password saved.");
  } catch (error) {
    toast(error.message || "Could not save password.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function refreshCurrentPage() {
  if (activeViewId() === "settings") fillSettingsForm();
  if (activeViewId() === "audit" && apiAvailable) {
    refreshAuditLogsFromServer().finally(renderAll);
    toast("Page refreshed.");
    return;
  }
  renderAll();
  toast("Page refreshed.");
}

function updateReceiptMemoPreview() {
  const form = $("#settingsForm");
  const preview = $("#receiptMemoPreview");
  if (!form || !preview) return;
  const settings = {
    ...RECEIPT_MEMO_DEFAULTS,
    prefix: text(form.receiptMemoPrefix.value),
    nextNo: Math.max(1, num(form.receiptMemoNext.value) || 1)
  };
  preview.textContent = formatReceiptMemo(settings.nextNo, settings);
}

function updatePaymentMemoPreview() {
  const form = $("#settingsForm");
  const preview = $("#paymentMemoPreview");
  if (!form || !preview) return;
  const settings = {
    ...PAYMENT_MEMO_DEFAULTS,
    prefix: text(form.paymentMemoPrefix.value),
    nextNo: Math.max(1, num(form.paymentMemoNext.value) || 1)
  };
  preview.textContent = formatPaymentMemo(settings.nextNo, settings);
}

function applyReceiptMemoMode() {
  const form = $("#receiptForm");
  if (!form) return;
  const settings = receiptMemoSettings();
  const locked = settings.auto && !editingReceiptTransaction;
  form.memo.readOnly = locked;
  form.memo.classList.toggle("locked", locked);
  if (locked) form.memo.value = formatReceiptMemo(settings.nextNo, settings);
}

function applyPaymentMemoMode() {
  const form = $("#paymentForm");
  if (!form) return;
  const settings = paymentMemoSettings();
  const locked = settings.auto && !editingPaymentTransaction;
  form.memo.readOnly = locked;
  form.memo.classList.toggle("locked", locked);
  if (locked) form.memo.value = formatPaymentMemo(settings.nextNo, settings);
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const originalText = button?.textContent || "Save settings";
  if (button) {
    button.disabled = true;
    button.textContent = "Saving.....";
  }
  const nextNo = Math.max(1, num(form.receiptMemoNext.value) || 1);
  const paymentNextNo = Math.max(1, num(form.paymentMemoNext.value) || 1);
  const profile = {
    name: text(form.businessName.value),
    address: text(form.businessAddress.value),
    stateCode: normalizeStateCode(form.businessStateCode.value) || stateCodeFromGstin(form.businessGstin.value) || businessStateCode(),
    gstin: text(form.businessGstin.value)
  };
  const account = {
    ...(cashbookAccountById(form.defaultBankAccountId.value) || accountDetails())
  };
  const settings = {
    auto: form.receiptMemoAuto.checked,
    prefix: text(form.receiptMemoPrefix.value),
    nextNo
  };
  const paymentSettings = {
    auto: form.paymentMemoAuto.checked,
    prefix: text(form.paymentMemoPrefix.value),
    nextNo: paymentNextNo
  };
  try {
    saveStorageMode(form.localStorageMode?.checked ? "local" : "auto");
    await saveSettingValue("businessProfile", profile);
    await saveSettingValue("cashbookDefaultBankAccountId", text(form.defaultBankAccountId.value));
    await saveSettingValue("accountDetails", account);
    await saveSettingValue(CASHBOOK_BANK_ACCOUNTS_KEY, cashbookBankAccounts());
    await saveSettingValue("billTemplate", form.billTemplate.value === "modern" ? "modern" : "classic");
    await saveSettingValue("receiptMemo", settings);
    await saveSettingValue("paymentMemo", paymentSettings);
    fillSettingsForm();
    renderBusinessBrand();
    setDefaults();
    renderItems();
    applyReceiptMemoMode();
    applyPaymentMemoMode();
    toast("Settings saved.");
  } catch (error) {
    toast(error.message || "Settings save failed.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

async function advanceReceiptMemoNumber() {
  const settings = receiptMemoSettings();
  if (!settings.auto) return;
  await saveSettingValue("receiptMemo", {
    ...settings,
    nextNo: settings.nextNo + 1
  });
}

async function advancePaymentMemoNumber() {
  const settings = paymentMemoSettings();
  if (!settings.auto) return;
  await saveSettingValue("paymentMemo", {
    ...settings,
    nextNo: settings.nextNo + 1
  });
}

function loadDenominationSettings() {
  const saved = getSettingValue("denominations");
  noteDenominations = cleanDenominations(saved?.length ? saved : noteDenominations);
}

async function saveDenominationSettings() {
  noteDenominations = cleanDenominations(noteDenominations);
  await saveSettingValue("denominations", noteDenominations);
}

async function addDenomination() {
  const input = $("#newDenominationInput");
  const value = num(input.value);
  const currentIn = currentNoteCounts("in");
  const currentOut = currentNoteCounts("out");
  if (value <= 0) {
    toast("Enter a valid denomination.");
    return;
  }
  if (noteDenominations.includes(value)) {
    toast("This denomination already exists.");
    input.value = "";
    return;
  }
  noteDenominations = cleanDenominations([...noteDenominations, value]);
  await saveDenominationSettings();
  input.value = "";
  redrawNotesEditor(currentIn, currentOut);
  toast("Denomination added.");
}

async function deleteDenomination(value) {
  const currentIn = currentNoteCounts("in");
  const currentOut = currentNoteCounts("out");
  if (noteDenominations.length <= 1) {
    toast("At least one denomination is required.");
    return;
  }
  noteDenominations = noteDenominations.filter(note => note !== num(value));
  delete currentIn[value];
  delete currentOut[value];
  await saveDenominationSettings();
  redrawNotesEditor(currentIn, currentOut);
  toast("Denomination deleted.");
}

function redrawNotesEditor(inCounts = null, outCounts = null) {
  const node = $("#denominationSummary");
  node.dataset.ready = "";
  renderNotesEditor();
  if (inCounts || outCounts) {
    noteDenominations.forEach(denomination => {
      const inInput = document.querySelector(`[data-note-in="${denomination}"]`);
      const outInput = document.querySelector(`[data-note-out="${denomination}"]`);
      if (inInput) inInput.value = inCounts?.[denomination] || 0;
      if (outInput) outInput.value = outCounts?.[denomination] || 0;
    });
    updateNotesTotal();
  }
  renderNotesTable();
}

function renderNotesEditor() {
  const node = $("#denominationSummary");
  if (!node.dataset.ready) {
    node.innerHTML = `
      <thead>
        <tr>
          <th>DINOMINATION</th>
          <th class="center">X</th>
          <th class="num">IN</th>
          <th class="num">OUT</th>
          <th class="num">TOTAL</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${noteDenominations.map(note => `
          <tr>
            <td>${note}</td>
            <td class="center">X</td>
            <td><input type="number" min="0" step="1" value="0" data-note-in="${note}"></td>
            <td><input type="number" min="0" step="1" value="0" data-note-out="${note}"></td>
            <td class="num" data-note-total="${note}">${money(0)}</td>
            <td><button type="button" class="icon-btn" tabindex="-1" data-delete-denomination="${note}" title="Delete denomination">x</button></td>
          </tr>
        `).join("")}
      </tbody>
    `;
    $$("[data-note-in], [data-note-out]", node).forEach(input => {
      input.addEventListener("input", updateNotesTotal);
      input.addEventListener("keydown", moveNoteInputOnEnter);
    });
    $$("[data-delete-denomination]", node).forEach(btn => {
      btn.addEventListener("click", () => {
        withBusyControl(btn, () => deleteDenomination(btn.dataset.deleteDenomination), "Deleting...");
      });
    });
    node.dataset.ready = "true";
  }
  updateNotesTotal();
}

function moveNoteInputOnEnter(event) {
  if (event.key !== "Enter") return;

  event.preventDefault();
  const field = event.currentTarget.dataset.noteIn ? "in" : "out";
  const selector = field === "in" ? "[data-note-in]" : "[data-note-out]";
  const inputs = $$(selector, $("#denominationSummary"));
  const index = inputs.indexOf(event.currentTarget);
  const nextInput = inputs[index + 1] || inputs[0];
  nextInput.focus();
  nextInput.select();
}

function updateNotesTotal() {
  const inCounts = currentNoteCounts("in");
  const outCounts = currentNoteCounts("out");
  noteDenominations.forEach(note => {
    const valueNode = document.querySelector(`[data-note-total="${note}"]`);
    if (valueNode) valueNode.textContent = money(noteRowTotal(note, inCounts[note], outCounts[note]));
  });
  $("#notesTotal").textContent = money(noteTotal(inCounts, outCounts));
}

function fillNotesForm(note = null) {
  const form = $("#notesForm");
  editingNoteId = note?._id || null;
  form.date.value = note?.date || todayIso();
  form.title.value = note?.title || "Cash notes";
  if (form.remark) form.remark.value = note?.remark || "";
  noteDenominations.forEach(denomination => {
    const inInput = document.querySelector(`[data-note-in="${denomination}"]`);
    const outInput = document.querySelector(`[data-note-out="${denomination}"]`);
    if (inInput) inInput.value = note?.inCounts?.[denomination] || 0;
    if (outInput) outInput.value = note?.outCounts?.[denomination] || 0;
  });
  updateNotesTotal();
}

function clearNotesForm() {
  fillNotesForm(null);
  $("#notesForm").querySelector("button[type='submit']").textContent = "Save notes details";
}

async function saveNotes(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const record = {
    date: form.date.value,
    title: text(form.title.value),
    remark: text(form.remark?.value),
    denominations: [...noteDenominations],
    inCounts: currentNoteCounts("in"),
    outCounts: currentNoteCounts("out")
  };
  record.total = noteTotal(record.inCounts, record.outCounts, record.denominations);

  if (apiAvailable) {
    if (editingNoteId) {
      const updated = await apiPatch("notes", editingNoteId, record);
      const index = seed.notes.findIndex(note => note._id === editingNoteId);
      if (index >= 0) seed.notes[index] = updated;
    } else {
      seed.notes.push(await apiCreate("notes", record));
    }
  } else {
    if (editingNoteId) {
      const index = user.notes.findIndex(note => note._id === editingNoteId);
      if (index >= 0) {
        const before = { ...user.notes[index] };
        user.notes[index] = { ...record, _id: editingNoteId };
        recordLocalAudit({ action: "edit", collection: "notes", before, after: user.notes[index], recordId: editingNoteId });
      }
    } else {
      user.notes.push({ ...record, _id: `LOCAL-${Date.now()}` });
    }
    saveUser();
  }

  clearNotesForm();
  toast("Notes details saved.");
  renderAll();
}

function renderNotesTable() {
  const rows = data.notes().slice().sort((a, b) => `${b.date}${b._id || ""}`.localeCompare(`${a.date}${a._id || ""}`));
  const denominations = cleanDenominations([...noteDenominations, ...rows.flatMap(row => row.denominations || [])]);
  const tableNode = $("#notesTable");
  const emptyColspan = 5 + (denominations.length * 2);
  const headGroups = denominations
    .map(note => `<th class="note-denom-head num" colspan="2">${note}</th>`)
    .join("");
  const headCounts = denominations
    .map(() => `<th class="note-in-head num">IN</th><th class="note-out-head num">OUT</th>`)
    .join("");
  const body = rows.map(row => {
    const countCells = denominations.map(note => {
      const inCount = num(row.inCounts?.[note]);
      const outCount = num(row.outCounts?.[note]);
      return `<td class="num note-count note-count-in">${inCount || ""}</td><td class="num note-count note-count-out">${outCount || ""}</td>`;
    }).join("");
    return `
      <tr>
        <td>${text(row.date)}</td>
        <td>${text(row.title)}</td>
        <td class="num notes-total-col">${money(row.total)}</td>
        ${countCells}
        <td>${text(row.remark)}</td>
        <td class="notes-actions">${rowUnlockButton("note", row._id)}<button class="secondary icon-btn" data-edit-note="${row._id}" title="Edit note" aria-label="Edit note"${actionControlAttrs("note", row._id, "Edit note")}>&#9998;</button> <button class="icon-btn" data-delete-note="${row._id}" title="Delete note"${actionControlAttrs("note", row._id, "Delete note")}>x</button></td>
      </tr>
    `;
  }).join("");
  tableNode.innerHTML = `
    <thead>
      <tr>
        <th rowspan="2">Date</th>
        <th rowspan="2">Title</th>
        <th class="num notes-total-col" rowspan="2">Total</th>
        ${headGroups}
        <th rowspan="2">Remark</th>
        <th rowspan="2">Manage</th>
      </tr>
      <tr>${headCounts}</tr>
    </thead>
    <tbody>${body || `<tr><td colspan="${emptyColspan}">No records found</td></tr>`}</tbody>
  `;
  $$("[data-edit-note]", tableNode).forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.disabled || !ensureActionRowUnlocked("note", btn.dataset.editNote)) return;
      const note = data.notes().find(item => item._id === btn.dataset.editNote);
      if (!note) return;
      const merged = cleanDenominations([...noteDenominations, ...(note.denominations || [])]);
      if (merged.length !== noteDenominations.length) {
        noteDenominations = merged;
        redrawNotesEditor();
      }
      fillNotesForm(note);
      $("#notesForm").querySelector("button[type='submit']").textContent = "Update notes details";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  $$("[data-delete-note]", tableNode).forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.disabled || !ensureActionRowUnlocked("note", btn.dataset.deleteNote)) return;
      withBusyControl(btn, () => deleteNote(btn.dataset.deleteNote), "Deleting...");
    });
  });
}

async function deleteNote(id) {
  if (!id) return;
  if (apiAvailable) {
    await apiDelete("notes", id);
    seed.notes = seed.notes.filter(note => note._id !== id);
  } else {
    const before = user.notes.find(note => note._id === id);
    user.notes = user.notes.filter(note => note._id !== id);
    recordLocalAudit({ action: "delete", collection: "notes", before, recordId: id });
    saveUser();
  }
  if (editingNoteId === id) clearNotesForm();
  toast("Notes details deleted.");
  renderAll();
}

