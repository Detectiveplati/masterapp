const SUMMARY_API = `${window.location.origin}/api/order-manager/order-summary/latest`;

const dateSelectEl = document.getElementById("summary-date");
const refreshButtonEl = document.getElementById("summary-refresh");
const statusEl = document.getElementById("summary-status");
const summaryTopEl = document.getElementById("summary-top");
const boardEl = document.getElementById("summary-board");
const requestedDate = readRequestedDate();

refreshButtonEl.addEventListener("click", () => loadSummary(dateSelectEl.value));
dateSelectEl.addEventListener("change", () => loadSummary(dateSelectEl.value));

loadSummary(requestedDate);

async function loadSummary(date) {
  setStatus("Loading order summary…");

  try {
    const url = date ? `${SUMMARY_API}?date=${encodeURIComponent(date)}` : SUMMARY_API;
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load the order summary.");
    }

    dateSelectEl.innerHTML = payload.reportDates
      .map((itemDate) => `<option value="${escapeHtml(itemDate)}">${escapeHtml(formatDate(itemDate))}</option>`)
      .join("");
    if (payload.selectedDate) {
      dateSelectEl.value = payload.selectedDate;
    }

    summaryTopEl.innerHTML = [
      summaryCard("Date", formatDate(payload.selectedDate || "-")),
      summaryCard("Departments", payload.departmentCount || payload.chefCount),
      summaryCard("Orders", payload.orderCount),
      summaryCard("Total qty", payload.totalQty)
    ].join("");

    renderBoard(payload.chefs || []);
    setStatus(`Loaded summary from ${payload.sourceFilename}.`);
  } catch (error) {
    summaryTopEl.innerHTML = "";
    boardEl.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    setStatus(error.message, true);
  }
}

function readRequestedDate() {
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function renderBoard(chefs) {
  if (!chefs.length) {
    boardEl.innerHTML = `<div class="empty-state">No order summary data is available for this date.</div>`;
    return;
  }

  boardEl.innerHTML = chefs
    .map((chef) => `
      <section class="section-card chef-summary-card">
        <div class="chef-summary-head">
          <div>
            <h2>${escapeHtml(chef.department || chef.chef)}</h2>
            <p>${chef.orderCount} orders • ${chef.dishCount} dishes</p>
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
                <th class="summary-col-orders">Orders</th>
                <th class="summary-col-qty">Total Qty</th>
              </tr>
            </thead>
            <tbody>
              ${chef.dishes.map((dish) => `
                <tr>
                  <td class="summary-cell-cn">${escapeHtml(dish.dishChinese)}</td>
                  <td class="summary-cell-en">${escapeHtml(dish.dishEnglish)}</td>
                  <td class="summary-cell-prep">${escapeHtml(dish.prepTimes.join(", "))}</td>
                  <td class="summary-cell-number">${escapeHtml(String(dish.orderCount))}</td>
                  <td class="summary-cell-number summary-cell-qty">${escapeHtml(String(dish.totalQty))}</td>
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

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9b1d20" : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
