const TRANSFER_TYPES = {
  cashToBank: {
    label: "Cash to Bank",
    apply(amount) {
      return { cash: -amount, bank: amount, bajaj: 0 };
    }
  },
  bankToCash: {
    label: "Bank to Cash",
    apply(amount) {
      return { cash: amount, bank: -amount, bajaj: 0 };
    }
  },
  financeToBank: {
    label: "Finance to Bank",
    apply(amount) {
      return { cash: 0, bank: amount, bajaj: -amount };
    }
  }
};

function transferLabel(type) {
  return TRANSFER_TYPES[type]?.label || "Balance Transfer";
}

function renderTransferBalances() {
  const node = $("#transferBalanceRow");
  if (!node) return;
  const balances = currentBalances();
  node.innerHTML = [
    ["Cash Balance", balances.cash],
    ["Bank Balance", balances.bank],
    ["Finance Balance", balances.finance],
    ["Total Balance", balances.cash + balances.bank + balances.finance]
  ].map(([label, value]) => `
    <div class="payment-balance-card">
      <span>${label}</span>
      <strong>${money(value)}</strong>
    </div>
  `).join("");
}

function transferRecordFromForm(form) {
  const type = form.type.value;
  const amount = num(form.amount.value);
  const config = TRANSFER_TYPES[type];
  if (!config || amount <= 0) return null;
  const values = config.apply(amount);
  const date = form.date.value || todayIso();
  const label = transferLabel(type);
  return {
    memo: `TR-${Date.now()}`,
    date,
    head: "Balance Transfer",
    party: label,
    customerId: "",
    billed: 0,
    cash: values.cash,
    bank: values.bank,
    bankAccountId: values.bank ? text(form.bankAccountId?.value) : "",
    expense: 0,
    type: label,
    remark: text(form.remark.value),
    mobile: "",
    cost: 0,
    profit: 0,
    bajaj: values.bajaj,
    source: "web"
  };
}

async function saveTransfer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const record = transferRecordFromForm(form);
  if (!record) {
    toast("Enter a valid transfer amount.");
    return;
  }
  if (apiAvailable) {
    seed.transactions.push(await apiCreate("transactions", record));
  } else {
    user.transactions.push(record);
    saveUser();
  }
  form.reset();
  setDefaults();
  renderTransferBalances();
  renderDashboard();
  renderPaymentBalances();
  toast(`${record.type} saved.`);
}
