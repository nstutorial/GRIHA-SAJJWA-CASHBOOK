function creditDebitNoteTax(row) {
  return num(row.igst) + num(row.cgst) + num(row.sgst) + num(row.cess);
}

function creditDebitNoteFormRecord(form) {
  const taxable = num(form.elements.namedItem("taxable").value);
  const igst = num(form.elements.namedItem("igst").value);
  const cgst = num(form.elements.namedItem("cgst").value);
  const sgst = num(form.elements.namedItem("sgst").value);
  const cess = num(form.elements.namedItem("cess").value);
  return {
    entryId: text(form.elements.namedItem("entryId").value) || `gst-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: parseDate(form.elements.namedItem("date").value),
    category: form.elements.namedItem("category").value,
    noteType: form.elements.namedItem("noteType").value,
    noteNo: text(form.elements.namedItem("noteNo").value),
    party: text(form.elements.namedItem("party").value),
    gstin: text(form.elements.namedItem("gstin").value).toUpperCase(),
    originalInvoice: text(form.elements.namedItem("originalInvoice").value),
    reason: text(form.elements.namedItem("reason").value),
    taxable,
    igst,
    cgst,
    sgst,
    cess,
    total: taxable + igst + cgst + sgst + cess,
    remark: text(form.elements.namedItem("remark").value),
    source: "web"
  };
}

function updateCreditDebitNoteTotal() {
  const form = $("#creditDebitNoteForm");
  if (!form) return;
  const row = creditDebitNoteFormRecord(form);
  const total = $("#creditDebitNoteTotal");
  if (total) total.textContent = `Total: ${money2(row.total)}`;
}

function updateCreditDebitPartyOptions() {
  const form = $("#creditDebitNoteForm");
  const list = $("#creditDebitPartyList");
  if (!form || !list) return;
  const category = form.elements.namedItem("category").value;
  const names = category === "purchase"
    ? data.suppliers().map(row => row.name)
    : data.customers().map(row => row.name);
  list.innerHTML = [...new Set(names.map(text).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    .map(name => `<option value="${html(name)}"></option>`).join("");
}

function fillCreditDebitPartyGstin() {
  const form = $("#creditDebitNoteForm");
  if (!form) return;
  const category = form.elements.namedItem("category").value;
  const party = text(form.elements.namedItem("party").value).toLowerCase();
  const partyRecord = category === "purchase"
    ? data.suppliers().find(row => text(row.name).toLowerCase() === party)
    : data.customers().find(row => text(row.name).toLowerCase() === party);
  if (partyRecord?.gstin) form.elements.namedItem("gstin").value = partyRecord.gstin;
}

function renderCreditDebitNotes() {
  const form = $("#creditDebitNoteForm");
  if (form && !form.elements.namedItem("date").value) form.elements.namedItem("date").value = todayIso();
  updateCreditDebitPartyOptions();
  updateCreditDebitNoteTotal();
  const notes = data.creditDebitNotes();
  const totals = notes.reduce((sum, row) => {
    const key = `${row.category}_${row.noteType}`;
    sum[key] = num(sum[key]) + num(row.total);
    return sum;
  }, { sales_credit: 0, sales_debit: 0, purchase_credit: 0, purchase_debit: 0 });
  const cards = [
    ["Sales credit notes", totals.sales_credit],
    ["Sales debit notes", totals.sales_debit],
    ["Purchase credit notes", totals.purchase_credit],
    ["Purchase debit notes", totals.purchase_debit]
  ];
  const summary = $("#creditDebitNoteSummary");
  if (summary) summary.innerHTML = cards.map(([label, amount]) => `<div class="total-card"><small>${html(label)}</small><strong>${money2(amount)}</strong></div>`).join("");
  const query = text($("#creditDebitNoteSearch")?.value).trim().toLowerCase();
  const rows = notes.map((row, index) => ({ ...row, index })).filter(row =>
    !query || `${row.date} ${row.noteNo} ${row.party} ${row.gstin} ${row.originalInvoice} ${row.reason} ${row.category} ${row.noteType}`.toLowerCase().includes(query)
  ).sort((a, b) => text(b.date).localeCompare(text(a.date)) || b.index - a.index);
  table($("#creditDebitNoteTable"), [
    { label: "Date", key: "date" },
    { label: "Side", key: "category", render: row => row.category === "purchase" ? "Purchase" : "Sales" },
    { label: "Type", key: "noteType", render: row => row.noteType === "debit" ? "Debit note" : "Credit note" },
    { label: "Note no.", key: "noteNo" },
    { label: "Party", key: "party" },
    { label: "GSTIN", key: "gstin" },
    { label: "Original invoice", key: "originalInvoice" },
    { label: "Taxable", key: "taxable", num: true, render: row => money2(row.taxable) },
    { label: "Tax", key: "tax", num: true, render: row => money2(creditDebitNoteTax(row)) },
    { label: "Total", key: "total", num: true, render: row => money2(row.total) },
    { label: "Reason", key: "reason" },
    { label: "Actions", key: "actions", render: row => `<div class="ledger-actions"><button type="button" class="symbol-btn edit-symbol" data-edit-credit-debit-note="${row.index}" title="Edit note" aria-label="Edit note">&#9998;</button><button type="button" class="symbol-btn delete-symbol" data-delete-credit-debit-note="${row.index}" title="Delete note" aria-label="Delete note">&#128465;</button></div>` }
  ], rows, { onRender: node => {
    $$('[data-edit-credit-debit-note]', node).forEach(button => button.addEventListener("click", () => editCreditDebitNote(Number(button.dataset.editCreditDebitNote))));
    $$('[data-delete-credit-debit-note]', node).forEach(button => button.addEventListener("click", () => deleteCreditDebitNote(Number(button.dataset.deleteCreditDebitNote))));
  }});
}

function resetCreditDebitNoteForm() {
  const form = $("#creditDebitNoteForm");
  if (!form) return;
  form.reset();
  form.elements.namedItem("entryId").value = "";
  form.elements.namedItem("date").value = todayIso();
  $("#creditDebitNoteFormTitle").textContent = "New note";
  $("#saveCreditDebitNoteBtn").textContent = "Save note";
  $("#cancelCreditDebitNoteEditBtn").hidden = true;
  updateCreditDebitPartyOptions();
  updateCreditDebitNoteTotal();
}

function editCreditDebitNote(index) {
  const row = data.creditDebitNotes()[index];
  if (!row) return toast("Note entry not found.");
  const form = $("#creditDebitNoteForm");
  ["entryId", "date", "category", "noteType", "noteNo", "party", "gstin", "originalInvoice", "reason", "taxable", "igst", "cgst", "sgst", "cess", "remark"]
    .forEach(key => { form.elements.namedItem(key).value = row[key] ?? ""; });
  updateCreditDebitPartyOptions();
  $("#creditDebitNoteFormTitle").textContent = `Edit ${row.noteType} note ${row.noteNo}`;
  $("#saveCreditDebitNoteBtn").textContent = "Update note";
  $("#cancelCreditDebitNoteEditBtn").hidden = false;
  updateCreditDebitNoteTotal();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function saveCreditDebitNote(form) {
  const record = creditDebitNoteFormRecord(form);
  const amountFields = [record.taxable, record.igst, record.cgst, record.sgst, record.cess];
  if (amountFields.some(value => value < 0)) throw new Error("Taxable value and tax amounts cannot be negative.");
  if (!record.total) throw new Error("Enter a taxable value or tax amount greater than zero.");
  const existingRows = data.creditDebitNotes();
  const duplicate = existingRows.some(row => row.entryId !== record.entryId
    && text(row.noteNo).toLowerCase() === record.noteNo.toLowerCase()
    && row.category === record.category && row.noteType === record.noteType
    && text(row.party).toLowerCase() === record.party.toLowerCase());
  if (duplicate) throw new Error(`This ${record.noteType} note number already exists for ${record.party}.`);

  if (apiAvailable) {
    if (form.elements.namedItem("entryId").value) {
      const current = existingRows.find(row => row.entryId === record.entryId);
      if (!current?._id) throw new Error("Could not identify this saved note for editing. Refresh and try again.");
      const saved = await apiPatch("creditDebitNotes", current._id, record);
      seed.creditDebitNotes = (seed.creditDebitNotes || []).map(row => text(row._id) === text(current._id) ? saved : row);
    } else {
      const saved = await apiCreate("creditDebitNotes", record);
      seed.creditDebitNotes = seed.creditDebitNotes || [];
      seed.creditDebitNotes.push(saved);
    }
  } else {
    user.creditDebitNotes = user.creditDebitNotes || [];
    if (form.elements.namedItem("entryId").value) {
      const index = user.creditDebitNotes.findIndex(row => row.entryId === record.entryId);
      if (index < 0) throw new Error("Could not find this note in browser storage. Refresh and try again.");
      user.creditDebitNotes[index] = record;
    } else {
      user.creditDebitNotes.push(record);
    }
    saveUser();
  }
  invalidateDataCache();
  resetCreditDebitNoteForm();
  renderCreditDebitNotes();
  toast("Credit/debit note saved.");
}

async function deleteCreditDebitNote(index) {
  const row = data.creditDebitNotes()[index];
  if (!row || !confirm(`Delete ${row.noteType} note ${row.noteNo} for ${row.party}?`)) return;
  if (apiAvailable && row._id) {
    await apiDelete("creditDebitNotes", row._id);
    seed.creditDebitNotes = (seed.creditDebitNotes || []).filter(item => text(item._id) !== text(row._id));
  } else {
    user.creditDebitNotes = (user.creditDebitNotes || []).filter(item => item.entryId !== row.entryId);
    saveUser();
  }
  invalidateDataCache();
  renderCreditDebitNotes();
  toast("Note deleted.");
}

function exportCreditDebitNotes() {
  csvDownload("credit-debit-notes.csv", data.creditDebitNotes().map(row => ({
    Date: row.date,
    Side: row.category,
    Type: row.noteType,
    "Note number": row.noteNo,
    Party: row.party,
    GSTIN: row.gstin,
    "Original invoice": row.originalInvoice,
    Reason: row.reason,
    Taxable: row.taxable,
    IGST: row.igst,
    CGST: row.cgst,
    SGST: row.sgst,
    Cess: row.cess,
    Total: row.total,
    Remark: row.remark
  })));
}

function bindCreditDebitNotes() {
  const form = $("#creditDebitNoteForm");
  form?.addEventListener("submit", withBusySubmit(async event => {
    event.preventDefault();
    try {
      await saveCreditDebitNote(form);
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not save the note.");
    }
  }, "Saving..."));
  $("#creditDebitNoteSearch")?.addEventListener("input", renderCreditDebitNotes);
  $("#creditDebitNoteForm")?.addEventListener("input", updateCreditDebitNoteTotal);
  $("#creditDebitNoteForm [name='category']")?.addEventListener("change", () => {
    updateCreditDebitPartyOptions();
    fillCreditDebitPartyGstin();
  });
  $("#creditDebitNoteForm [name='party']")?.addEventListener("change", fillCreditDebitPartyGstin);
  $("#cancelCreditDebitNoteEditBtn")?.addEventListener("click", resetCreditDebitNoteForm);
  $("#exportCreditDebitNotesBtn")?.addEventListener("click", withBusyClick(exportCreditDebitNotes, "Exporting..."));
}
