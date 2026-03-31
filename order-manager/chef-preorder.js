const API_URL = `${window.location.origin}/api/order-manager/chef-preorder/latest`;
const dateFilterEl = document.getElementById("date-filter");
const departmentFilterEl = document.getElementById("department-filter");
const refreshButtonEl = document.getElementById("refresh-button");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const boardEl = document.getElementById("board");
let latestPayload = null;

refreshButtonEl.addEventListener("click", loadDataset);
dateFilterEl.addEventListener("change", loadDataset);
departmentFilterEl.addEventListener("change", renderCurrentView);

loadDataset();

async function loadDataset() {
  const selectedDate = dateFilterEl.value;
  setStatus("Loading the department prep list…");

  try {
    const url = selectedDate ? `${API_URL}?date=${encodeURIComponent(selectedDate)}` : API_URL;
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load the chef pre-order data.");
    }
    latestPayload = payload;

    dateFilterEl.innerHTML = payload.reportDates
      .map((date) => `<option value="${escapeHtml(date)}">${escapeHtml(formatDate(date))}</option>`)
      .join("");
    if (payload.selectedDate) {
      dateFilterEl.value = payload.selectedDate;
    }
    setStatus(`Loaded the prep list for ${formatDate(payload.selectedDate)}.`);
    renderDepartmentOptions(payload.chefs || []);
    renderCurrentView();
  } catch (error) {
    latestPayload = null;
    departmentFilterEl.innerHTML = `<option value="">All departments</option>`;
    summaryEl.innerHTML = "";
    boardEl.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    setStatus(error.message, true);
  }
}

function renderDepartmentOptions(chefs) {
  const currentValue = departmentFilterEl.value;
  departmentFilterEl.innerHTML = [
    `<option value="">All departments</option>`,
    ...chefs.map((chef) => `<option value="${escapeHtml(chef.chef)}">${escapeHtml(chef.chef)}</option>`)
  ].join("");
  if (currentValue && chefs.some((chef) => chef.chef === currentValue)) {
    departmentFilterEl.value = currentValue;
  }
}

function renderCurrentView() {
  if (!latestPayload) {
    summaryEl.innerHTML = "";
    boardEl.innerHTML = `<div class="empty-state">No prep list is loaded.</div>`;
    return;
  }

  const selectedDepartment = departmentFilterEl.value;
  const departments = selectedDepartment
    ? (latestPayload.chefs || []).filter((chef) => chef.chef === selectedDepartment)
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
}

function renderBoard(chefs) {
  if (!chefs.length) {
    boardEl.innerHTML = `<div class="empty-state">No department prep data is available for this date.</div>`;
    return;
  }

  boardEl.innerHTML = chefs
    .map((chef) => `
      <section class="section-card chef-summary-card">
        <div class="chef-summary-head">
          <div>
            <h2>${escapeHtml(chef.department || chef.chef)}</h2>
            <p>${chef.items.length} dishes • ${chef.totalQty} qty</p>
          </div>
          <div class="chef-summary-total">${escapeHtml(String(chef.totalQty))}</div>
        </div>
        <div class="chef-summary-table-wrap">
          <table>
            <thead>
              <tr>
                <th class="summary-col-cn">中文 Dish</th>
                <th class="summary-col-en">English</th>
                <th class="summary-col-prep">Prep Times</th>
                <th class="summary-col-qty">Total Qty</th>
              </tr>
            </thead>
            <tbody>
              ${chef.items.map((item) => `
                <tr>
                  <td class="summary-cell-cn">${escapeHtml(item.dishChinese)}</td>
                  <td class="summary-cell-en">${escapeHtml(item.dishEnglish)}</td>
                  <td class="summary-cell-prep">${escapeHtml(item.prepSlots.join(", ") || "No prep slot")}</td>
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
