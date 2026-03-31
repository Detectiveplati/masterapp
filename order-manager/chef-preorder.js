const API_URL = `${window.location.origin}/api/order-manager/chef-preorder/latest`;
const dateFilterEl = document.getElementById("date-filter");
const departmentFilterEl = document.getElementById("department-filter");
const refreshButtonEl = document.getElementById("refresh-button");
const printButtonEl = document.getElementById("print-button");
const exportSelectAllEl = document.getElementById("export-select-all");
const exportClearAllEl = document.getElementById("export-clear-all");
const exportDepartmentListEl = document.getElementById("export-department-list");
const exportStatusEl = document.getElementById("export-status");
const printPreviewEl = document.getElementById("print-preview");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const boardEl = document.getElementById("board");

let latestPayload = null;
let selectedExportDepartments = new Set();

refreshButtonEl.addEventListener("click", loadDataset);
dateFilterEl.addEventListener("change", loadDataset);
departmentFilterEl.addEventListener("change", renderCurrentView);
printButtonEl.addEventListener("click", printExportView);
exportSelectAllEl.addEventListener("click", () => setAllExportDepartments(true));
exportClearAllEl.addEventListener("click", () => setAllExportDepartments(false));

loadDataset();

async function loadDataset() {
  const selectedDate = dateFilterEl.value;
  setStatus("Loading chef ordering data…");

  try {
    const url = selectedDate ? `${API_URL}?date=${encodeURIComponent(selectedDate)}` : API_URL;
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load the chef ordering data.");
    }
    latestPayload = payload;

    dateFilterEl.innerHTML = payload.reportDates
      .map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(formatDate(date))}</option>`)
      .join("");
    if (payload.selectedDate) {
      dateFilterEl.value = payload.selectedDate;
    }

    renderDepartmentOptions(payload.chefs || []);
    syncExportDepartmentSelection(payload.chefs || []);
    setStatus(`Loaded the chef ordering list for ${formatDate(payload.selectedDate)}.`);
    renderCurrentView();
  } catch (error) {
    latestPayload = null;
    selectedExportDepartments = new Set();
    departmentFilterEl.innerHTML = `<option value="">All departments</option>`;
    exportDepartmentListEl.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    printPreviewEl.innerHTML = "";
    exportStatusEl.textContent = "";
    summaryEl.innerHTML = "";
    boardEl.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    setStatus(error.message, true);
  }
}

function renderDepartmentOptions(departments) {
  const currentValue = departmentFilterEl.value;
  departmentFilterEl.innerHTML = [
    `<option value="">All departments</option>`,
    ...departments.map((department) => `<option value="${escapeHtml(department.chef)}">${escapeHtml(department.chef)}</option>`)
  ].join("");
  if (currentValue && departments.some((department) => department.chef === currentValue)) {
    departmentFilterEl.value = currentValue;
  }
}

function syncExportDepartmentSelection(departments) {
  const validNames = new Set(departments.map((department) => department.chef));
  const nextSelection = new Set();

  if (!selectedExportDepartments.size) {
    departments.forEach((department) => nextSelection.add(department.chef));
  } else {
    selectedExportDepartments.forEach((departmentName) => {
      if (validNames.has(departmentName)) {
        nextSelection.add(departmentName);
      }
    });
    if (!nextSelection.size) {
      departments.forEach((department) => nextSelection.add(department.chef));
    }
  }

  selectedExportDepartments = nextSelection;
  renderExportDepartmentList(departments);
}

function renderExportDepartmentList(departments) {
  if (!departments.length) {
    exportDepartmentListEl.innerHTML = `<div class="empty-state">No departments are available for export.</div>`;
    return;
  }

  exportDepartmentListEl.innerHTML = departments
    .map((department) => `
      <label class="export-department-chip">
        <input type="checkbox" value="${escapeHtml(department.chef)}"${selectedExportDepartments.has(department.chef) ? " checked" : ""}>
        <span>${escapeHtml(department.chef)}</span>
      </label>
    `)
    .join("");

  exportDepartmentListEl.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedExportDepartments.add(checkbox.value);
      } else {
        selectedExportDepartments.delete(checkbox.value);
      }
      renderPrintPreview();
    });
  });
}

function setAllExportDepartments(checked) {
  if (!latestPayload) {
    return;
  }

  selectedExportDepartments = checked
    ? new Set((latestPayload.chefs || []).map((department) => department.chef))
    : new Set();
  renderExportDepartmentList(latestPayload.chefs || []);
  renderPrintPreview();
}

function renderCurrentView() {
  if (!latestPayload) {
    summaryEl.innerHTML = "";
    boardEl.innerHTML = `<div class="empty-state">No ordering list is loaded.</div>`;
    printPreviewEl.innerHTML = "";
    exportStatusEl.textContent = "";
    return;
  }

  const selectedDepartment = departmentFilterEl.value;
  const departments = selectedDepartment
    ? (latestPayload.chefs || []).filter((department) => department.chef === selectedDepartment)
    : (latestPayload.chefs || []);
  const dishCount = departments.reduce((sum, department) => sum + department.items.length, 0);
  const totalQty = departments.reduce((sum, department) => sum + department.totalQty, 0);

  summaryEl.innerHTML = [
    summaryCard("Date", formatDate(latestPayload.selectedDate || "-")),
    summaryCard("Departments", departments.length),
    summaryCard("Dishes", dishCount),
    summaryCard("Total Qty", totalQty)
  ].join("");

  renderBoard(departments);
  renderPrintPreview();
}

function renderBoard(departments) {
  if (!departments.length) {
    boardEl.innerHTML = `<div class="empty-state">No chef ordering data is available for this date.</div>`;
    return;
  }

  boardEl.innerHTML = departments
    .map((department) => `
      <section class="section-card chef-summary-card">
        <div class="chef-summary-head">
          <div>
            <h2>${escapeHtml(department.department || department.chef)}</h2>
            <p>${department.items.length} dishes • ${department.totalQty} qty</p>
          </div>
          <div class="chef-summary-total">${escapeHtml(String(department.totalQty))}</div>
        </div>
        <div class="chef-summary-table-wrap">
          <table>
            <thead>
              <tr>
                <th class="summary-col-cn">Chinese Dish</th>
                <th class="summary-col-en">English</th>
                <th class="summary-col-prep">Prep Times</th>
                <th class="summary-col-qty">Total Qty</th>
              </tr>
            </thead>
            <tbody>
              ${department.items.map((item) => `
                <tr>
                  <td class="summary-cell-cn">${escapeHtml(item.dishChinese)}</td>
                  <td class="summary-cell-en">${escapeHtml(item.dishEnglish)}</td>
                  <td class="summary-cell-prep">${escapeHtml(formatPrepSlots(item.prepSlots))}</td>
                  <td class="summary-cell-number summary-cell-qty">${escapeHtml(String(item.totalQty))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `)
    .join("");
}

function renderPrintPreview() {
  if (!latestPayload) {
    printPreviewEl.innerHTML = "";
    exportStatusEl.textContent = "";
    return;
  }

  const exportDepartments = getExportDepartments();
  const exportDishCount = exportDepartments.reduce((sum, department) => sum + department.items.length, 0);

  exportStatusEl.textContent = exportDepartments.length
    ? `Prepared ${exportDepartments.length} department${exportDepartments.length === 1 ? "" : "s"} for print with ${exportDishCount} dishes on vertical A4.`
    : "Select at least one department to prepare the printable export.";

  if (!exportDepartments.length) {
    printPreviewEl.innerHTML = `<div class="empty-state">No departments are selected for export.</div>`;
    return;
  }

  printPreviewEl.innerHTML = `
    <div class="print-preview-toolbar">
      <strong>A4 preview</strong>
      <span>${escapeHtml(formatDate(latestPayload.selectedDate || "-"))} • ${escapeHtml(String(exportDepartments.length))} departments</span>
    </div>
    <div id="print-sheet" class="print-sheet">
      ${exportDepartments.map(renderPrintDepartmentSection).join("")}
    </div>
  `;
}

function renderPrintDepartmentSection(department) {
  return `
    <section class="print-department-section">
      <header class="print-department-head">
        <h3>${escapeHtml(department.department || department.chef)}</h3>
        <span>${escapeHtml(String(department.items.length))} dishes • ${escapeHtml(String(department.totalQty))} qty</span>
      </header>
      <table class="print-table">
        <thead>
          <tr>
            <th class="print-col-dish">Chinese Dish</th>
            <th class="print-col-prep">Prep Time</th>
            <th class="print-col-qty">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${department.items.map((item) => `
            <tr>
              <td class="print-cell-dish">${escapeHtml(item.dishChinese || item.dish)}</td>
              <td class="print-cell-prep">${escapeHtml(formatPrepSlots(item.prepSlots))}</td>
              <td class="print-cell-qty">${escapeHtml(String(item.totalQty))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </section>
  `;
}

function getExportDepartments() {
  const exportDepartmentNames = selectedExportDepartments;
  return (latestPayload && latestPayload.chefs ? latestPayload.chefs : []).filter((department) => exportDepartmentNames.has(department.chef));
}

function printExportView() {
  const exportDepartments = getExportDepartments();
  if (!exportDepartments.length) {
    exportStatusEl.textContent = "Select at least one department before printing.";
    exportStatusEl.style.color = "#9b1d20";
    return;
  }

  exportStatusEl.style.color = "";
  renderPrintPreview();
  window.print();
}

function formatPrepSlots(prepSlots) {
  return Array.isArray(prepSlots) && prepSlots.length ? prepSlots.join(", ") : "No prep slot";
}

function summaryCard(label, value) {
  return `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9b1d20" : "";
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
