const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const fmt2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const text = value => String(value ?? "").trim();
const num = value => Number(value || 0) || 0;
const money = value => fmt.format(num(value));
const money2 = value => fmt2.format(num(value));
const objectOrEmpty = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const arrayOrEmpty = value => Array.isArray(value) ? value : [];
const html = value => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

// Customer labels are stored as "Customer Name - Customer ID" for selection.
// Bills can display the name alone without changing that stored label.
const customerNameOnly = value => text(value).replace(/\s+-\s+\d+\s*$/, "");

const SMALL_NUMBERS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(value) {
  const n = Math.floor(num(value));
  if (n < 20) return SMALL_NUMBERS[n];
  return [TENS[Math.floor(n / 10)], SMALL_NUMBERS[n % 10]].filter(Boolean).join(" ");
}

function threeDigitWords(value) {
  const n = Math.floor(num(value));
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  return [
    hundred ? `${SMALL_NUMBERS[hundred]} Hundred` : "",
    rest ? twoDigitWords(rest) : ""
  ].filter(Boolean).join(" ");
}

function integerToIndianWords(value) {
  let n = Math.floor(Math.abs(num(value)));
  if (!n) return "Zero";
  const parts = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigitWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitWords(thousand)} Thousand`);
  if (n) parts.push(threeDigitWords(n));
  return parts.join(" ");
}

function amountInWords(value) {
  const rounded = Math.round(num(value) * 100) / 100;
  const rupees = Math.floor(Math.abs(rounded));
  const paise = Math.round((Math.abs(rounded) - rupees) * 100);
  const prefix = rounded < 0 ? "Minus " : "";
  return `${prefix}${integerToIndianWords(rupees)} Rupees${paise ? ` and ${twoDigitWords(paise)} Paise` : ""} Only`;
}

let currentBillId = "";

function loadBill() {
  currentBillId = new URLSearchParams(window.location.search).get("id") || "";
  const id = currentBillId;
  if (!id) return null;
  try {
    return JSON.parse(localStorage.getItem(`gstBill:${id}`) || "null");
  } catch {
    return null;
  }
}

function accountMarkup(account = {}) {
  account = objectOrEmpty(account);
  const rows = [
    ["Bank", account.bankName],
    ["Account No.", account.accountNumber],
    ["IFSC", account.ifsc],
    ["Branch", account.branch],
    ["UPI / Note", account.upi]
  ].filter(([, value]) => text(value));

  if (!rows.length) return "";
  return `
    <div class="account-box">
      <h3>Account Details</h3>
      ${rows.map(([label, value]) => `<strong>${html(label)}:</strong> ${html(value)}<br>`).join("")}
    </div>
  `;
}

function upiIdFromAccount(account = {}) {
  account = objectOrEmpty(account);
  const match = text(account.upi).match(/[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9._-]{2,}/);
  return match ? match[0] : "";
}

function paymentQrPayload({ account = {}, amount = 0, profile = {}, tx = {} } = {}) {
  account = objectOrEmpty(account);
  profile = objectOrEmpty(profile);
  tx = objectOrEmpty(tx);
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
  account = objectOrEmpty(account);
  profile = objectOrEmpty(profile);
  tx = objectOrEmpty(tx);
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

function notesMarkup(bill = {}) {
  bill = objectOrEmpty(bill);
  const note = text(bill.tx?.remark);
  const goodsNames = arrayOrEmpty(bill.items).map(item => text(item.description)).filter(Boolean).join(", ");
  if (!note || note.toLowerCase() === goodsNames.toLowerCase()) return "";
  return `Notes: ${html(note)}<br>`;
}

function renderError(message = "GST bill data could not be rendered.") {
  document.querySelector("#billRoot").innerHTML = `
    <section class="missing">
      <h1>GST bill data could not be rendered</h1>
      <p class="muted">${html(message)}</p>
      <p class="muted">Please open this bill again from the Cashbook ledger or save the receipt again.</p>
    </section>
  `;
}

function renderBill(bill) {
  bill = objectOrEmpty(bill);
  if (bill.billTemplate === "modern" && typeof renderModernTaxInvoice === "function") {
    renderModernTaxInvoice(bill);
    return;
  }
  const rows = arrayOrEmpty(bill.items).map(item => {
    item = objectOrEmpty(item);
    return `
    <tr>
      <td>${html(item.sl)}</td>
      <td>${html(item.description)}</td>
      <td>${html(item.hsn)}</td>
      <td class="num">${html(item.qty)}</td>
      <td class="num">${money2(item.rate)}</td>
      <td class="num">${html(item.gst)}%</td>
      <td class="num">${money2(item.taxable)}</td>
      <td class="num">${money2(item.igst)}</td>
      <td class="num">${money2(item.cgst)}</td>
      <td class="num">${money2(item.sgst)}</td>
      <td class="num">${money2(item.total)}</td>
    </tr>
  `;
  }).join("");

  const profile = objectOrEmpty(bill.profile);
  const customer = objectOrEmpty(bill.customer);
  const tx = objectOrEmpty(bill.tx);
  const calc = objectOrEmpty(bill.calc);
  const totals = objectOrEmpty(bill.goodsTotals);
  const account = objectOrEmpty(bill.account);
  const totalBalanceToPay = num(bill.totalDue ?? (num(bill.previousDue) + num(calc.due)));

  document.title = `GST Bill ${text(tx.memo)}`;
  document.querySelector("#billRoot").innerHTML = `
    <section class="bill">
      <h2 class="bill-title">Tax Invoice / GST Bill</h2>
      <section class="bill-top">
        <div>
          <h1>${html(profile.name)}</h1>
          <p class="muted">${html(profile.address)}<br>State Code: ${html(profile.stateCode)} | GSTIN: ${html(profile.gstin)}</p>
        </div>
        <div class="invoice-meta">
          <strong>Invoice No:</strong> ${html(tx.memo)}<br>
          <strong>Date:</strong> ${html(tx.date)}${num(tx.bank) > 0 ? `<br><strong>Payment Mode:</strong> ${html(tx.type)}` : ""}
        </div>
      </section>
      <section class="parties">
        <div class="party">
          <h3>Bill To</h3>
          <strong data-customer-label="${html(customer.label || customer.name)}">${html(customer.label || customer.name)}</strong>
          <p class="muted">${html([customer.address, customer.city, customer.state, customer.pin].filter(Boolean).join(", "))}<br>
          Mobile: ${html(customer.mobile)}<br>
          State Code: ${html(customer.stateCode)} | GSTIN: ${html(customer.gstin)}</p>
        </div>
        <div class="party">
          <div class="ship-head">
            <h3>Ship To</h3>
            <label class="ship-edit-toggle"><input type="checkbox" id="editShipToToggle"> Edit Ship To</label>
          </div>
          <div id="shipToView">
            <strong data-customer-label="${html(customer.label || customer.name)}">${html(customer.label || customer.name)}</strong>
            <p class="muted">${html([customer.address, customer.city, customer.state, customer.pin].filter(Boolean).join(", "))}<br>
            Mobile: ${html(customer.mobile)}<br>
            State Code: ${html(customer.stateCode)} | GSTIN: ${html(customer.gstin)}</p>
          </div>
          <form id="shipToEditForm" class="ship-edit-form" hidden>
            <input name="label" value="${html(customer.label || customer.name)}" placeholder="Name">
            <input name="address" value="${html(customer.address)}" placeholder="Address">
            <input name="city" value="${html(customer.city)}" placeholder="City">
            <input name="state" value="${html(customer.state)}" placeholder="State">
            <input name="pin" value="${html(customer.pin)}" placeholder="PIN">
            <input name="mobile" value="${html(customer.mobile)}" placeholder="Mobile">
            <input name="stateCode" value="${html(customer.stateCode)}" placeholder="State Code" maxlength="2">
            <input name="gstin" value="${html(customer.gstin)}" placeholder="GSTIN">
          </form>
        </div>
      </section>
      <section class="transport-panel">
        <div class="transport-head">
          <h3>Others Details</h3>
          <label class="ship-edit-toggle"><input type="checkbox" id="editTransportToggle"> Edit Transportation</label>
        </div>
        <div id="transportView" class="transport-view">
          <span><strong>Sales Manager:</strong> ${html(tx.salesManager)}</span>
          <span><strong>Vehicle No.:</strong> ${html(tx.vehicleNo)}</span>
          <span><strong>Mode of Transportation:</strong> ${html(tx.transportMode)||"Road"}</span>
        </div>
        <form id="transportEditForm" class="transport-edit-form" hidden>
          <input name="salesManager" value="${html(tx.salesManager)}" placeholder="Sales Manager">
          <input name="vehicleNo" value="${html(tx.vehicleNo)}" placeholder="Vehicle No.">
          <input name="transportMode" value="${html(tx.transportMode)}" placeholder="Mode of Transportation">
        </form>
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
            <td class="num">${money2(totals.taxable)}</td>
            <td class="num">${money2(totals.igst)}</td>
            <td class="num">${money2(totals.cgst)}</td>
            <td class="num">${money2(totals.sgst)}</td>
            <td class="num">${money2(totals.total)}</td>
          </tr>
        </tfoot>
      </table>
      <section class="summary">
        <div class="notes">
          <div class="due-details">
            <strong>Previous Due:</strong> ${money(bill.previousDue)}<br>
            <strong>Current Bill Due:</strong> ${money(calc.due)}<br>
            <strong>Total Dues:</strong> ${money(totalBalanceToPay)}
          </div>
          ${paymentQrMarkup({ account, amount: totalBalanceToPay, profile, tx })}
          ${accountMarkup(account)}
          ${notesMarkup(bill) ? `<div class="amount-words">${notesMarkup(bill).replace(/<br>$/, "")}</div>` : ""}
          <div class="amount-words"><strong>Net Total in words:</strong> ${html(amountInWords(calc.net))}</div>
          <div class="declaration"><strong>Declaration:</strong> Certified that the particulars given above are true and correct.</div>
        </div>
        <div class="totals">
          <div class="total-row"><span>Gross</span><strong>${money(calc.gross)}</strong></div>
          <div class="total-row"><span>Discount</span><strong>${money(calc.discount)}</strong></div>
          <div class="total-row"><span>Net Total</span><strong>${money(calc.net)}</strong></div>
          <div class="total-row received-row"><span>Received</span><strong>${money(calc.received)}</strong></div>
          <div class="total-row grand">
  <span>Total Balance to be Paid</span>
  <strong>${money(totalBalanceToPay)}</strong>
</div>
        </div>
      </section>
      <section class="sign">
        <span>Customer Signature</span>
        <span>Authorised Signatory</span>
      </section>
    </section>
  `;
  bindShipToEditor(bill);
  bindTransportEditor(bill);
  bindPrintOptions();
}

function bindShipToEditor(bill) {
  const toggle = document.querySelector("#editShipToToggle");
  const form = document.querySelector("#shipToEditForm");
  const view = document.querySelector("#shipToView");
  if (!toggle || !form || !view) return;
  const saveShipTo = () => {
    bill.customer = {
      ...bill.customer,
      label: text(form.label.value),
      name: text(form.label.value),
      address: text(form.address.value),
      city: text(form.city.value),
      state: text(form.state.value),
      pin: text(form.pin.value),
      mobile: text(form.mobile.value),
      stateCode: text(form.stateCode.value).replace(/\D/g, "").slice(0, 2),
      gstin: text(form.gstin.value)
    };
    if (currentBillId) localStorage.setItem(`gstBill:${currentBillId}`, JSON.stringify(bill));
  };
  toggle.addEventListener("change", () => {
    saveShipTo();
    form.hidden = !toggle.checked;
    view.hidden = toggle.checked;
    if (!toggle.checked) renderBill(bill);
  });
  form.stateCode.addEventListener("input", () => {
    form.stateCode.value = text(form.stateCode.value).replace(/\D/g, "").slice(0, 2);
  });
  form.addEventListener("input", saveShipTo);
  form.addEventListener("submit", event => event.preventDefault());
}

function bindTransportEditor(bill) {
  const toggle = document.querySelector("#editTransportToggle");
  const form = document.querySelector("#transportEditForm");
  const view = document.querySelector("#transportView");
  if (!toggle || !form || !view) return;
  const saveTransport = () => {
    bill.tx = {
      ...bill.tx,
      salesManager: text(form.salesManager.value),
      vehicleNo: text(form.vehicleNo.value),
      transportMode: text(form.transportMode.value)
    };
    if (currentBillId) localStorage.setItem(`gstBill:${currentBillId}`, JSON.stringify(bill));
  };
  toggle.addEventListener("change", () => {
    saveTransport();
    form.hidden = !toggle.checked;
    view.hidden = toggle.checked;
    if (!toggle.checked) renderBill(bill);
  });
  form.addEventListener("input", saveTransport);
  form.addEventListener("submit", event => event.preventDefault());
}

function bindPrintOptions() {
  const noPrintOthersToggle = document.querySelector("#noPrintOthersToggle");
  const noPrintDuesToggle = document.querySelector("#noPrintDuesToggle");
  const hideCustomerIdToggle = document.querySelector("#hideCustomerIdToggle");
  const hideReceivedToggle = document.querySelector("#hideReceivedToggle");
  if (noPrintOthersToggle) {
    document.body.classList.toggle("no-print-others", noPrintOthersToggle.checked);
    noPrintOthersToggle.addEventListener("change", () => {
      document.body.classList.toggle("no-print-others", noPrintOthersToggle.checked);
    });
  }
  if (noPrintDuesToggle) {
    document.body.classList.toggle("no-print-dues", noPrintDuesToggle.checked);
    noPrintDuesToggle.addEventListener("change", () => {
      document.body.classList.toggle("no-print-dues", noPrintDuesToggle.checked);
    });
  }
  if (hideCustomerIdToggle) {
    const updateCustomerNames = () => {
      document.querySelectorAll("[data-customer-label]").forEach(node => {
        const label = node.dataset.customerLabel || "";
        node.textContent = hideCustomerIdToggle.checked ? customerNameOnly(label) : label;
      });
    };
    updateCustomerNames();
    hideCustomerIdToggle.addEventListener("change", updateCustomerNames);
  }
  if (hideReceivedToggle) {
    document.body.classList.toggle("no-print-received", hideReceivedToggle.checked);
    hideReceivedToggle.addEventListener("change", () => {
      document.body.classList.toggle("no-print-received", hideReceivedToggle.checked);
    });
  }
}

const bill = loadBill();
if (bill) {
  try {
    renderBill(bill);
  } catch (error) {
    console.error("GST bill render failed", error);
    renderError(error.message);
  }
} else {
  document.querySelector("#billRoot").innerHTML = `
    <section class="missing">
      <h1>GST bill data not found</h1>
      <p class="muted">Please save the receipt again from the Cashbook app.</p>
    </section>
  `;
}
