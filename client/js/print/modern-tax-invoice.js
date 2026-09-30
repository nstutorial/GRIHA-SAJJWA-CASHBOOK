function renderModernTaxInvoice(bill) {
  const profile = objectOrEmpty(bill.profile);
  const customer = objectOrEmpty(bill.customer);
  const tx = objectOrEmpty(bill.tx);
  const calc = objectOrEmpty(bill.calc);
  const totals = objectOrEmpty(bill.goodsTotals);
  const account = objectOrEmpty(bill.account);
  const totalDue = num(bill.totalDue ?? num(bill.previousDue) + num(calc.due));
  const rows = arrayOrEmpty(bill.items).map(item => {
    item = objectOrEmpty(item);
    return `
      <tr>
        <td>${html(item.sl)}</td>
        <td><strong>${html(item.description)}</strong></td>
        <td>${html(item.hsn)}</td>
        <td class="num">${html(item.qty)}</td>
        <td class="num">${money2(item.rate)}</td>
        <td class="num">${money2(item.taxable)}</td>
        <td class="num">${html(item.gst)}%</td>
        <td class="num">${money2(item.igst)}</td>
        <td class="num">${money2(item.cgst)}</td>
        <td class="num">${money2(item.sgst)}</td>
        <td class="num">${money2(item.total)}</td>
      </tr>
    `;
  }).join("");

  document.title = `Tax Invoice ${text(tx.memo)}`;
  document.querySelector("#billRoot").innerHTML = `
    <section class="modern-tax-invoice">
      <header class="modern-header">
        <div class="modern-label">TAX INVOICE</div>
        <div class="modern-profile">
          <h1>${html(profile.name)}</h1>
          <p>${html(profile.address)}</p>
          <p>GSTIN: ${html(profile.gstin)} | State Code: ${html(profile.stateCode)}</p>
          <p>Phone: ${html(profile.mobile || "")}</p>
        </div>
      </header>
      <section class="modern-meta">
        <div><span>Invoice No.</span><strong>${html(tx.memo)}</strong></div>
        <div><span>Date</span><strong>${html(tx.date)}</strong></div>
        <div class="modern-bill-to"><span>Bill To</span><strong>${html(customer.label || customer.name)}</strong><small>${html([customer.address, customer.city, customer.state, customer.pin].filter(Boolean).join(", "))}</small><small>GSTIN: ${html(customer.gstin)} | State Code: ${html(customer.stateCode)}</small></div>
      </section>
      <table class="modern-items">
        <thead><tr><th>#</th><th>Item name</th><th>HSN / SAC</th><th>Qty</th><th>Price / Unit</th><th>Taxable</th><th>GST Rate</th><th>IGST</th><th>CGST</th><th>SGST</th><th>Amount</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><th colspan="5">Total</th><th class="num">${money2(totals.taxable)}</th><th></th><th class="num">${money2(totals.igst)}</th><th class="num">${money2(totals.cgst)}</th><th class="num">${money2(totals.sgst)}</th><th class="num">${money2(totals.total)}</th></tr></tfoot>
      </table>
      <section class="modern-summary">
        <div class="modern-notes">
          <h3>Invoice Amount In Words</h3>
          <p>${html(amountInWords(calc.net))}</p>
          <h3>Terms And Conditions</h3>
          <p>Goods once sold will not be taken back unless agreed in writing.</p>
          ${notesMarkup(bill) ? `<p>${notesMarkup(bill)}</p>` : ""}
          ${accountMarkup(account)}
          <div class="modern-signature">For: ${html(profile.name)}<br><br><strong>Authorised Signatory</strong></div>
        </div>
        <div class="modern-totals">
          <div><span>Taxable Amount</span><strong>${money2(totals.taxable)}</strong></div>
          <div><span>IGST</span><strong>${money2(totals.igst)}</strong></div>
          <div><span>CGST</span><strong>${money2(totals.cgst)}</strong></div>
          <div><span>SGST</span><strong>${money2(totals.sgst)}</strong></div>
          <div><span>Discount</span><strong>${money(calc.discount)}</strong></div>
          <div><span>Round off</span><strong>${money2(num(calc.net) - Math.round(num(calc.net)))}</strong></div>
          <div class="modern-grand"><span>Total</span><strong>${money(calc.net)}</strong></div>
          <div><span>Received</span><strong>${money(calc.received)}</strong></div>
          <div><span>Balance</span><strong>${money(totalDue)}</strong></div>
        </div>
      </section>
    </section>
  `;
  bindPrintOptions();
}
