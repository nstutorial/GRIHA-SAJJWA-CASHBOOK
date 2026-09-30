const fmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

const text = value => String(value ?? "").trim();
const num = value => Number(value || 0) || 0;
const money = value => fmt.format(num(value));
const html = value => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

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

function loadVoucher() {
  const id = new URLSearchParams(window.location.search).get("id") || "";
  if (!id) return null;
  try {
    return JSON.parse(localStorage.getItem(`paymentVoucher:${id}`) || "null");
  } catch {
    return null;
  }
}

function renderVoucher(voucher) {
  const profile = voucher.profile || {};
  const tx = voucher.tx || {};
  const paidBy = num(tx.bank) ? "Bank" : "Cash";
  const isDuePaid = text(tx.head).toLowerCase() === "due paid" || text(tx.type).toLowerCase() === "due paid";
  const voucherTitle = isDuePaid ? "Due Paid Voucher" : "Payment Voucher";
  const partyLabel = isDuePaid ? "Received From" : "Paid To";
  const amountLabel = isDuePaid ? "Amount Received" : "Amount Paid";
  const modeLabel = isDuePaid ? "Received By" : "Payment By";
  const remainingDue = voucher.due?.remaining;
  const remainingDueRow = isDuePaid && remainingDue !== undefined
    ? `<tr><th>Remaining Dues after payment</th><td>${money(remainingDue)}</td></tr>`
    : "";
  const declaration = isDuePaid
    ? "Due payment received as per the particulars stated above."
    : "Payment recorded as per the particulars stated above.";

  document.title = `${voucherTitle} ${text(tx.memo)}`;
  document.querySelector("#voucherRoot").innerHTML = `
    <section class="voucher">
      <h2 class="voucher-title">${html(voucherTitle)}</h2>
      <section class="voucher-top">
        <div>
          <h1>${html(profile.name)}</h1>
          <p class="muted">${html(profile.address)}<br>State Code: ${html(profile.stateCode)} | GSTIN: ${html(profile.gstin)}</p>
        </div>
        <div class="voucher-meta">
          <strong>Voucher No:</strong> ${html(tx.memo)}<br>
          <strong>Date:</strong> ${html(tx.date)}<br>
          <strong>${html(modeLabel)}:</strong> ${html(paidBy)}
        </div>
      </section>
      <section class="paid-block">
        <div class="paid-to">
          <span class="label">${html(partyLabel)}</span>
          <strong>${html(tx.party)}</strong>
          <p class="muted">${html(tx.head)}</p>
        </div>
        <div class="amount-box">
          <span class="label">${html(amountLabel)}</span>
          <strong>${money(tx.amount)}</strong>
        </div>
      </section>
      <table class="details">
        <tbody>
          <tr><th>Head of Account</th><td>${html(tx.head)}</td></tr>
          <tr><th>Cash Amount</th><td>${money(tx.cash)}</td></tr>
          <tr><th>Bank Amount</th><td>${money(tx.bank)}</td></tr>
          ${remainingDueRow}
          <tr><th>Transaction Type</th><td>${html(tx.type)}</td></tr>
          <tr><th>Remarks</th><td>${html(tx.remark)}</td></tr>
        </tbody>
      </table>
      <div class="amount-words"><strong>Amount in words:</strong> ${html(amountInWords(tx.amount))}</div>
      <div class="declaration"><strong>Declaration:</strong> ${html(declaration)}</div>
      <section class="sign">
        <span>Receiver Signature</span>
        <span>Authorised Signatory</span>
      </section>
    </section>
  `;
}

const voucher = loadVoucher();
if (voucher) {
  renderVoucher(voucher);
} else {
  document.querySelector("#voucherRoot").innerHTML = `
    <section class="missing">
      <h1>Payment voucher data not found</h1>
      <p class="muted">Please save the payment voucher again from the Cashbook app.</p>
    </section>
  `;
}
