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

function loadChequeVoucher() {
  const id = new URLSearchParams(window.location.search).get("id") || "";
  if (!id) return null;
  try {
    return JSON.parse(localStorage.getItem(`outgoingChequeVoucher:${id}`) || "null");
  } catch {
    return null;
  }
}

function renderChequeVoucher(voucher) {
  const profile = voucher.profile || {};
  const cheque = voucher.cheque || {};
  const supplier = voucher.supplier || {};
  const payee = text(cheque.supplier) || "Supplier / Mahajan";
  const amountWords = amountInWords(cheque.amount);

  document.title = `Issued Cheque ${text(cheque.chequeNo)}`;
  document.querySelector("#chequeRoot").innerHTML = `
    <section class="cheque-page">
      <section class="cheque-leaf">
        <div class="corner-lines" aria-hidden="true"></div>
        <header class="cheque-head">
          <div>
            <p class="bank-label">Bank</p>
            <h1>${html(cheque.bank || "Bank Name")}</h1>
          </div>
          <div class="cheque-meta">
            <span>Cheque No.</span>
            <strong>${html(cheque.chequeNo)}</strong>
          </div>
        </header>
        <div class="date-row">
          <span>Date</span>
          <strong>${html(cheque.chequeDate)}</strong>
        </div>
        <div class="pay-row">
          <span>Pay</span>
          <strong>${html(payee)}</strong>
        </div>
        <div class="words-row">
          <span>Rupees</span>
          <strong>${html(amountWords)}</strong>
        </div>
        <div class="amount-row">
          <span>₹</span>
          <strong>${money(cheque.amount)}</strong>
        </div>
        <div class="memo-row">
          <span>Purpose</span>
          <strong>${html(cheque.purpose || "Supplier payment")}</strong>
        </div>
        <footer class="cheque-foot">
          <div>
            <p>${html(profile.name)}</p>
            <small>${html(profile.address)}</small>
          </div>
          <div class="signature">Authorised Signatory</div>
        </footer>
        <div class="micr-line">${html(cheque.chequeNo || "000000")}  ${html(cheque.bank || "BANK")}  ${money(cheque.amount)}</div>
      </section>

      <section class="receipt-stub">
        <h2>Issued Cheque Receipt</h2>
        <table>
          <tbody>
            <tr><th>Issued To</th><td>${html(payee)}</td></tr>
            <tr><th>Mobile</th><td>${html(supplier.mobile)}</td></tr>
            <tr><th>GSTIN</th><td>${html(supplier.gstin)}</td></tr>
            <tr><th>Cheque No.</th><td>${html(cheque.chequeNo)}</td></tr>
            <tr><th>Cheque Date</th><td>${html(cheque.chequeDate)}</td></tr>
            <tr><th>Bank</th><td>${html(cheque.bank)}</td></tr>
            <tr><th>Amount</th><td>${money(cheque.amount)}</td></tr>
            <tr><th>Status</th><td>${html(cheque.status || "Issued")}</td></tr>
            <tr><th>Purpose</th><td>${html(cheque.purpose)}</td></tr>
          </tbody>
        </table>
        <div class="stub-sign">
          <span>Supplier Signature</span>
          <span>Prepared By</span>
        </div>
      </section>
    </section>
  `;
}

const voucher = loadChequeVoucher();
if (voucher) {
  renderChequeVoucher(voucher);
} else {
  document.querySelector("#chequeRoot").innerHTML = `
    <section class="missing">
      <h1>Issued cheque data not found</h1>
      <p>Please save or reprint the issued cheque again from Cheque Management.</p>
    </section>
  `;
}
