function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2600);
}

function setBusyControl(control, busy, label = "Please wait...") {
  if (!control) return;
  if (busy) {
    if (control.dataset.busy === "true") return;
    control.dataset.busy = "true";
    control.dataset.busyOriginalHtml = control.innerHTML;
    if ("value" in control) control.dataset.busyOriginalValue = control.value;
    control.disabled = true;
    if (label) {
      control.dataset.busyLabel = label;
      if ("value" in control && control.tagName === "INPUT") control.value = label;
      else if (control.textContent.trim()) control.textContent = label;
    }
    control.setAttribute("aria-busy", "true");
    return;
  }
  control.dataset.busy = "";
  control.disabled = false;
  if (control.dataset.busyOriginalHtml && (!control.dataset.busyLabel || control.textContent === control.dataset.busyLabel)) {
    control.innerHTML = control.dataset.busyOriginalHtml;
  }
  if ("value" in control && control.dataset.busyOriginalValue && (!control.dataset.busyLabel || control.value === control.dataset.busyLabel)) {
    control.value = control.dataset.busyOriginalValue;
  }
  control.removeAttribute("aria-busy");
  delete control.dataset.busyOriginalHtml;
  delete control.dataset.busyOriginalValue;
  delete control.dataset.busyLabel;
}

async function withBusyControl(control, callback, label = "Please wait...") {
  if (control?.dataset.busy === "true" || control?.disabled) return;
  setBusyControl(control, true, label);
  try {
    return await callback();
  } finally {
    setBusyControl(control, false);
  }
}

function formSubmitButton(form, submitter = null) {
  if (submitter?.matches?.("button, input[type='submit']")) return submitter;
  return form?.querySelector("button[type='submit'], input[type='submit']");
}

function withBusySubmit(handler, label = "Saving...") {
  return async event => {
    const form = event.currentTarget;
    if (form?.dataset.busy === "true") {
      event.preventDefault();
      return;
    }
    if (form) form.dataset.busy = "true";
    const button = formSubmitButton(form, event.submitter);
    setBusyControl(button, true, label);
    try {
      return await handler(event);
    } finally {
      if (form) form.dataset.busy = "";
      setBusyControl(button, false);
    }
  };
}

function withBusyClick(handler, label = "Please wait...") {
  return event => withBusyControl(event.currentTarget, () => handler(event), label);
}

function table(node, columns, rows, opts = {}) {
  const head = columns.map(col => `<th class="${col.num ? "num" : ""}">${col.label}</th>`).join("");
  const body = rows.map((row, index) => {
    const cells = columns.map(col => {
      const raw = col.render ? col.render(row, index) : row[col.key];
      return `<td class="${col.num ? "num" : ""}">${raw ?? ""}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  node.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}">No records found</td></tr>`}</tbody>`;
  if (opts.onRender) opts.onRender(node);
}

function paginateRows(rows, page, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    currentPage,
    totalPages,
    totalRows: rows.length,
    start,
    end: Math.min(start + pageSize, rows.length),
    rows: rows.slice(start, start + pageSize)
  };
}

function renderPagination(node, pageInfo, onPageChange) {
  if (!node) return;
  if (pageInfo.totalRows <= PAGE_SIZE) {
    node.innerHTML = "";
    return;
  }
  node.innerHTML = `
    <div class="pagination-summary">
      Showing ${pageInfo.start + 1}-${pageInfo.end} of ${pageInfo.totalRows}
    </div>
    <div class="pagination-actions">
      <button type="button" class="secondary" data-page="first" ${pageInfo.currentPage === 1 ? "disabled" : ""}>First</button>
      <button type="button" class="secondary" data-page="prev" ${pageInfo.currentPage === 1 ? "disabled" : ""}>Prev</button>
      <span>Page ${pageInfo.currentPage} / ${pageInfo.totalPages}</span>
      <button type="button" class="secondary" data-page="next" ${pageInfo.currentPage === pageInfo.totalPages ? "disabled" : ""}>Next</button>
      <button type="button" class="secondary" data-page="last" ${pageInfo.currentPage === pageInfo.totalPages ? "disabled" : ""}>Last</button>
    </div>
  `;
  $$("[data-page]", node).forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.page;
      const nextPage = action === "first" ? 1
        : action === "prev" ? pageInfo.currentPage - 1
        : action === "next" ? pageInfo.currentPage + 1
        : pageInfo.totalPages;
      onPageChange(nextPage);
    });
  });
}

function csvDownload(filename, rows) {
  if (!rows.length) return toast("No records to export.");
  const headers = Object.keys(rows[0]);
  const csv = [headers, ...rows.map(row => headers.map(h => row[h]))]
    .map(line => line.map(cell => `"${text(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setDefaults() {
  $$("input[type='date']").forEach(input => {
    if (!input.value) input.value = todayIso();
  });
  if ($("#salesMonth") && !$("#salesMonth").value) $("#salesMonth").value = currentMonthValue();
  const receiptForm = $("#receiptForm");
  if (receiptForm?.stateCode && (!receiptForm.stateCode.value || !text(receiptForm.customer?.value))) {
    receiptForm.stateCode.value = businessStateCode();
  }
  $("#todayChip").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function disableBrowserAutofill() {
  $$("form").forEach(form => form.setAttribute("autocomplete", "off"));
  $$("input, textarea, select").forEach((field, index) => {
    field.setAttribute("autocomplete", "off");
    field.setAttribute("autocorrect", "off");
    field.setAttribute("autocapitalize", "off");
    field.setAttribute("spellcheck", "false");
    if (!field.name && field.id) field.setAttribute("name", field.id);
    if (field.tagName === "INPUT" && !["hidden", "file", "checkbox", "radio", "date", "number"].includes(field.type)) {
      field.setAttribute("data-lpignore", "true");
      field.setAttribute("data-form-type", "other");
      field.setAttribute("name", field.name ? `${field.name}` : `field_${index}`);
    }
  });
}

function disableNumberInputWheel() {
  $$("input[type='number']").forEach(input => {
    input.addEventListener("wheel", event => {
      if (document.activeElement === input) event.preventDefault();
    }, { passive: false });
    input.addEventListener("keydown", event => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") event.preventDefault();
    });
  });
}

function bindNavigation() {
  $$(".nav button, [data-view-jump]").forEach(btn => {
    btn.addEventListener("click", () => {
      showView(btn.dataset.view || btn.dataset.viewJump);
      closeSidebar();
    });
  });
  $("#openSidebarBtn")?.addEventListener("click", openSidebar);
  $("#closeSidebarBtn")?.addEventListener("click", closeSidebar);
  $("#sidebarBackdrop")?.addEventListener("click", closeSidebar);
  $("#pageRefreshBtn")?.addEventListener("click", withBusyClick(() => refreshCurrentPage(), "Refreshing..."));
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") closeSidebar();
  });
}

function bindThemeToggle() {
  applyTheme();
  $("#themeToggleBtn")?.addEventListener("click", toggleTheme);
}

function showView(id) {
  $$(".view").forEach(view => view.classList.toggle("active", view.id === id));
  $$(".nav button").forEach(btn => btn.classList.toggle("active", btn.dataset.view === id));
  $("#viewTitle").textContent = VIEWS[id][0];
  $("#viewSubtitle").textContent = VIEWS[id][1];
  if (id === "settings") {
    refreshActionLockStatusFromServer().finally(() => {
      fillSettingsForm();
      renderAll();
    });
    return;
  }
  if (id === "audit" && apiAvailable) {
    refreshAuditLogsFromServer().finally(renderAll);
  } else {
    renderAll();
  }
}

function openSidebar() {
  document.body.classList.add("sidebar-open");
  const backdrop = $("#sidebarBackdrop");
  if (backdrop) backdrop.hidden = false;
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  const backdrop = $("#sidebarBackdrop");
  if (backdrop) backdrop.hidden = true;
}

