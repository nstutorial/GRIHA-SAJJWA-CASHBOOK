function tableDateRange(modeId, fromId, toId, monthId) {
  const mode = $("#" + modeId)?.value || "all";
  if (mode === "custom") return { from: $("#" + fromId)?.value || "", to: $("#" + toId)?.value || "" };
  if (mode === "all") return { from: "", to: "" };
  const anchor = $("#" + monthId)?.value || todayIso().slice(0, 7);
  const year = Number(anchor.slice(0, 4));
  const month = Number(anchor.slice(5, 7));
  if (mode === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (mode === "quarter") {
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const lastMonth = firstMonth + 2;
    const lastDay = new Date(year, lastMonth + 1, 0).getDate();
    return { from: `${year}-${String(firstMonth).padStart(2, "0")}-01`, to: `${year}-${String(lastMonth).padStart(2, "0")}-${lastDay}` };
  }
  const lastDay = new Date(year, month, 0).getDate();
  const monthText = String(month).padStart(2, "0");
  return { from: `${year}-${monthText}-01`, to: `${year}-${monthText}-${lastDay}` };
}

function syncTableDateRangeControls(modeId, fromId, toId) {
  const mode = $("#" + modeId)?.value || "all";
  const custom = mode === "custom";
  const from = $("#" + fromId);
  const to = $("#" + toId);
  const month = $("#" + modeId.replace("DateRangeMode", "RangeMonth"));
  if (from) from.hidden = !custom;
  if (to) to.hidden = !custom;
  if (month) month.hidden = !["month", "quarter", "year"].includes(mode);
}
function activeViewId() {
  return $(".view.active")?.id || "dashboard";
}

function renderSharedUi() {
  if (!seed) return;
  const view = activeViewId();
  renderBusinessBrand();
  if (["receipt", "settings"].includes(view)) renderReceiptHeads();
  if (["payment", "settings"].includes(view)) renderPaymentHeads();
  if (["receipt", "payment", "cheques", "sales"].includes(view)) renderCustomerList();
  if (view === "payment") renderPaymentPartyList();
  renderCashbookBankAccountSelects();
  if (view === "settings") fillAccountDetailsSettings();
  if (view === "settings") renderHeadManagers();
  if (["chequeManagement", "purchases", "suppliers"].includes(view)) renderSupplierList();
  if (["receipt", "quotations", "purchases", "items", "sales"].includes(view)) renderItemList();
}

function renderCurrentView() {
  invalidateDataCache();
  switch (activeViewId()) {
    case "sales":
      renderSalesDashboard();
      break;
    case "gstReturns":
      renderGstReturns();
      break;
    case "gstOverview":
      renderGstOverview();
      break;
    case "tallyGstCompare":
      renderTallyGstCompare();
      break;
    case "receipt":
      renderReceiptTotals();
      applyReceiptMemoMode();
      setReceiptSubmitText();
      break;
    case "payment":
      renderPaymentDueAmount();
      renderPaymentBalances();
      applyPaymentDueMode();
      applyPaymentMemoMode();
      setPaymentSubmitText();
      break;
    case "quotations":
      renderQuotations();
      break;
    case "transfers":
      renderTransferBalances();
      break;
    case "ledger":
      renderLedger();
      break;
    case "cashbook":
      renderCashbook();
      break;
    case "accountsManager":
      renderAccountsManager();
      break;
    case "chartAccounts":
      renderChartAccounts();
      break;
    case "chartAccountDetails":
      renderChartAccountDetails();
      break;
    case "dues":
      renderDues();
      break;
    case "customers":
      renderCustomers();
      break;
    case "cheques":
      renderCheques();
      break;
    case "chequeManagement":
      renderChequeManagement();
      break;
    case "suppliers":
      renderSuppliers();
      break;
    case "items":
      renderItemMaster();
      break;
    case "purchases":
      renderPurchases();
      break;
    case "audit":
      renderAuditLog();
      break;
    case "settings":
      renderHeadManagers();
      renderUserManagement();
      break;
    case "dashboard":
    default:
      renderDashboard();
      break;
  }
}

function renderAll() {
  if (!seed) return;
  invalidateDataCache();
  renderSharedUi();
  renderCurrentView();
}

function bindFilters() {
  ["auditRangeMonth", "ledgerRangeMonth", "chequeManagementRangeMonth"].forEach(id => {
    const input = $("#" + id);
    if (input && !input.value) input.value = todayIso().slice(0, 7);
  });
  const scheduleDashboard = debounce(renderDashboard);
  const scheduleSalesDashboard = debounce(renderSalesDashboard);
  const scheduleLedger = debounce(() => {
    ledgerPage = 1;
    renderLedger();
  });
  const scheduleDues = debounce(() => {
    duePage = 1;
    dueSummaryPage = 1;
    renderDues();
  });
  const scheduleCustomers = debounce(() => {
    customerPage = 1;
    renderCustomers();
  });
  const scheduleCheques = debounce(() => {
    chequePage = 1;
    renderCheques();
  });
  const scheduleChequeManagement = debounce(() => {
    chequeManagementPage = 1;
    renderChequeManagement();
  });
  const scheduleSuppliers = debounce(renderSuppliers);
  const scheduleItems = debounce(() => {
    itemPage = 1;
    renderItemMaster();
  });
  const schedulePurchases = debounce(renderPurchases);
  const scheduleAudit = debounce(renderAuditLog);

  $("#recentSearch").addEventListener("input", scheduleDashboard);
  ["salesPeriod", "salesMonth", "salesFrom", "salesTo", "salesItemFilter", "salesCustomerFilter", "salesPaymentFilter"].forEach(id => {
    $(`#${id}`)?.addEventListener("input", scheduleSalesDashboard);
  });
  $("#fetchSalesDashboardBtn")?.addEventListener("click", withBusyClick(() => {
    renderSalesDashboard();
    toast("Sales dashboard fetched.");
  }, "Fetching..."));
  ["ledgerSearch", "ledgerFrom", "ledgerTo", "ledgerType"].forEach(id => $(`#${id}`).addEventListener("input", scheduleLedger));
  $("#ledgerDateRangeMode")?.addEventListener("change", scheduleLedger);
  $("#ledgerRangeMonth")?.addEventListener("input", scheduleLedger);
  ["dueSearch", "dueStatus"].forEach(id => $(`#${id}`).addEventListener("input", scheduleDues));
  $$("[data-due-tab]").forEach(button => {
    button.addEventListener("click", () => {
      dueActiveTab = button.dataset.dueTab;
      renderDues();
    });
  });
  $("#customerSearch").addEventListener("input", scheduleCustomers);
  $("#chequeSearch").addEventListener("input", scheduleCheques);
  ["chequeManagementSearch", "chequeManagementStatus", "chequeManagementBank", "chequeManagementFrom", "chequeManagementTo"].forEach(id => {
    $(`#${id}`).addEventListener("input", scheduleChequeManagement);
  });
  $("#chequeManagementDateRangeMode")?.addEventListener("change", scheduleChequeManagement);
  $("#chequeManagementRangeMonth")?.addEventListener("input", scheduleChequeManagement);
  $$("[data-cheque-management-tab]").forEach(button => {
    button.addEventListener("click", () => {
      chequeManagementActiveTab = button.dataset.chequeManagementTab;
      const statusSelect = $("#chequeManagementStatus");
      if (chequeManagementActiveTab === "others" && text(statusSelect?.value).toLowerCase() === "issued") {
        statusSelect.value = "";
      }
      chequeManagementPage = 1;
      renderChequeManagement();
    });
  });
  ["supplierSearch", "supplierBalanceStatus"].forEach(id => {
    $(`#${id}`).addEventListener("input", scheduleSuppliers);
  });
  ["itemSearch", "itemStockStatus"].forEach(id => {
    $(`#${id}`).addEventListener("input", scheduleItems);
  });
  $("#purchaseSearch").addEventListener("input", schedulePurchases);
  ["auditSearch", "auditAction", "auditCollection", "auditFrom", "auditTo"].forEach(id => {
    $(`#${id}`)?.addEventListener("input", scheduleAudit);
  });
  $("#auditDateRangeMode")?.addEventListener("change", scheduleAudit);
  $("#auditRangeMonth")?.addEventListener("input", scheduleAudit);
}

function bindExports() {
  $("#exportLedgerBtn").addEventListener("click", withBusyClick(() => csvDownload("transaction-ledger.csv", filteredLedger()), "Exporting..."));
  $("#exportSalesDashboardBtn").addEventListener("click", withBusyClick(() => csvDownload("sales-dashboard.csv", salesDashboardExportRows()), "Exporting..."));
  $("#exportDuesBtn").addEventListener("click", withBusyClick(() => {
    const isSummary = dueActiveTab === "summary";
    csvDownload(isSummary ? "due-summary.csv" : "due-register.csv", isSummary ? dueSummaryExportRows() : dueRegisterExportRows());
  }, "Exporting..."));
  $("#printDuesBtn").addEventListener("click", withBusyClick(() => printDues(), "Printing..."));
  $("#exportCustomersBtn").addEventListener("click", withBusyClick(() => csvDownload("address-book.csv", data.customers()), "Exporting..."));
  $("#exportChequeManagementBtn").addEventListener("click", withBusyClick(() => csvDownload("cheque-management.csv", filteredChequeManagementRows()), "Exporting..."));
  $("#printSuppliersBtn").addEventListener("click", withBusyClick(() => printSuppliers(), "Printing..."));
  $("#exportSuppliersBtn").addEventListener("click", withBusyClick(() => csvDownload("supplier-management.csv", filteredSuppliers()), "Exporting..."));
  $("#exportItemsBtn").addEventListener("click", withBusyClick(() => csvDownload("items-stock.csv", filteredItemStockRows()), "Exporting..."));
  $("#exportPurchasesBtn").addEventListener("click", withBusyClick(() => csvDownload("purchase-register.csv", data.purchases()), "Exporting..."));
  $("#exportAuditBtn")?.addEventListener("click", withBusyClick(() => csvDownload("edit-delete-history.csv", auditExportRows()), "Exporting..."));
  $("#exportNotesBtn").addEventListener("click", withBusyClick(() => csvDownload("cash-notes.csv", data.notes().map(note => ({
    date: note.date,
    title: note.title,
    total: note.total,
    remark: note.remark,
    ...Object.fromEntries((note.denominations || noteDenominations).flatMap(denomination => [
      [`note_${denomination}_in`, num(note.inCounts?.[denomination])],
      [`note_${denomination}_out`, num(note.outCounts?.[denomination])],
      [`note_${denomination}_total`, noteRowTotal(denomination, note.inCounts?.[denomination], note.outCounts?.[denomination])]
    ]))
  }))), "Exporting..."));
  $("#exportAllBtn").addEventListener("click", withBusyClick(() => {
    const blob = new Blob([JSON.stringify(fullBackupData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gs-steel-full-backup-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, "Exporting..."));
  $("#importBackup").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    event.target.disabled = true;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const backup = normalizeBackupPayload(JSON.parse(reader.result));
        if (!window.confirm("Import this backup? Existing browser-only data will be replaced. When connected to Cloud, records from the backup will be merged into the server; records missing from the backup will not be deleted.")) return;
        if (apiAvailable) {
          const synced = await apiRequest("/api/sync", { method: "POST", body: JSON.stringify(backup) });
          const business = seed?.business || { name: "G.S. STEEL FURNITURE", place: "Tufanganj, CoochBehar", state: "West Bengal", stateCode: "19", gstin: "19AATFG0007G1ZH" };
          seed = { business, ...(synced.bootstrap || {}) };
          user = emptyUserData();
          saveUser();
          apiAvailable = storageMode !== "local";
          apiConnected = true;
          for (const row of backup.gstr1Returns || []) await apiRequest("/api/gst-returns/gstr1/import", { method: "POST", body: JSON.stringify({ ...row, fileName: row.sourceFile }) });
          for (const row of backup.gstr3bReturns || []) await apiRequest("/api/gst-returns/gstr3b/import", { method: "POST", body: JSON.stringify({ ...row, fileName: row.sourceFile }) });
          if (backup.gst2bInvoices?.length) await apiRequest("/api/gst-returns/gstr2b/import", { method: "POST", body: JSON.stringify({ invoices: backup.gst2bInvoices, fileName: "Restored backup" }) });
          for (const kind of ["sales", "purchases"]) {
            const register = backup.tallyGstImports?.[kind];
            if (register?.rows?.length) await apiRequest("/api/gst-returns/tally-imports/import", { method: "POST", body: JSON.stringify({ kind, rows: register.rows, fileName: register.sourceFile }) });
          }
        } else {
          user = backup;
          saveUser();
        }
        gstr1Returns = backup.gstr1Returns || [];
        gstr3bReturns = backup.gstr3bReturns || [];
        gst2bStatement = backup.gst2bInvoices?.length ? { invoices: backup.gst2bInvoices } : null;
        tallyRegisterImports = backup.tallyGstImports || { sales: null, purchases: null };
        loadDenominationSettings();
        fillSettingsForm();
        renderBusinessBrand();
        renderAll();
        toast(apiAvailable ? "Backup merged into Cloud." : "Backup restored in this browser.");
      } catch {
        toast("Could not import backup. Please choose a valid JSON backup file.");
      } finally {
        event.target.value = "";
        event.target.disabled = false;
      }
    };
    reader.onerror = () => {
      event.target.value = "";
      event.target.disabled = false;
      toast("Could not read backup file.");
    };
    reader.readAsText(file);
  });
}

async function init() {
  applyTheme();
  loadUser();
  gstr1Returns = user.gstr1Returns || [];
  gstr3bReturns = user.gstr3bReturns || [];
  gst2bStatement = user.gst2bInvoices?.length ? { invoices: user.gst2bInvoices } : null;
  tallyRegisterImports = user.tallyGstImports || { sales: null, purchases: null };
  bindAuthForms();
  if (!authToken) {
    showAuthView("login");
    return;
  }
  hideAuthView();
  disableBrowserAutofill();
  disableNumberInputWheel();
  setDefaults();
  bindNavigation();
  bindThemeToggle();
  bindForms();
  bindQuotationForms();
  bindFilters();
  bindAccountsManager();
  bindCashbook();
  bindExports();
  addReceiptItem({ description: "SAMSUNG LED 24", hsn: "8517", qty: 1, gst: 18, total: 5800 });
  const business = { name: "G.S. STEEL FURNITURE", place: "Tufanganj, CoochBehar", state: "West Bengal", stateCode: "19", gstin: "19AATFG0007G1ZH" };

  try {
    if (isOfflineToken()) throw new Error("Offline login enabled.");
    if (storageMode === "local") throw new Error("Local storage mode enabled.");
    const bootstrap = await apiRequest(BOOTSTRAP_PATH);
    seed = { business, ...bootstrap };
    apiConnected = true;
    apiAvailable = true;
  } catch {
    if (!authToken) return;
    apiConnected = false;
    apiAvailable = false;
    try {
      if (window.SEED_DATA) {
        seed = window.SEED_DATA;
      } else {
        const response = await fetch("data/seed-data.json");
        seed = await response.json();
      }
      seed.business = seed.business || business;
      toast(storageMode === "local" ? "Local storage mode enabled." : "Cloud API is not connected, using browser storage.");
    } catch {
      seed = { business, transactions: [], dues: [], customers: [], cheques: [], outgoingCheques: [], suppliers: [], items: [], purchases: [], notes: [] };
      toast("Seed data could not load. Run through a local server for imported Excel data.");
    }
  }
  seed.settings = seed.settings || [];
  seed.outgoingCheques = seed.outgoingCheques || [];
  seed.suppliers = seed.suppliers || [];
  seed.supplierOpeningBalances = seed.supplierOpeningBalances || [];
  seed.items = seed.items || [];
  seed.manualCreditors = seed.manualCreditors || [];
  seed.manualChartAccounts = seed.manualChartAccounts || [];
  seed.businesses = seed.businesses || [];
  seed.quotations = seed.quotations || [];
  user.settings = user.settings || [];
  user.outgoingCheques = user.outgoingCheques || [];
  user.suppliers = user.suppliers || [];
  user.supplierOpeningBalances = user.supplierOpeningBalances || [];
  user.items = user.items || [];
  user.manualCreditors = user.manualCreditors || [];
  user.manualChartAccounts = user.manualChartAccounts || [];
  user.businesses = user.businesses || [];
  user.quotations = user.quotations || [];
  setDefaults();
  loadDenominationSettings();
  await migrateGeneratedCustomerIds();
  await migrateDuePaidTransactionsToDueRegister();
  await refreshActionLockStatusFromServer();
  await loadGstr1ReturnsFromDb();
  await loadGst2bInvoicesFromDb();
  await loadGstr3bReturnsFromDb();
  await loadTallyRegisterImports();
  fillSettingsForm();
  applyReceiptMemoMode();
  renderAll();
}

init();
