const API_BASE = `${window.location.origin}/api/order-manager/extractions`;

const form = document.getElementById("extract-form");
const dateInput = document.getElementById("report-date");
const runButton = document.getElementById("run-button");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const workspaceEl = document.getElementById("workspace");
const chefListEl = document.getElementById("chef-list");
const chefSearchEl = document.getElementById("chef-search");
const dishSearchEl = document.getElementById("dish-search");
const reportTitleEl = document.getElementById("report-title");
const reportMetaEl = document.getElementById("report-meta");
const reportTableWrapEl = document.getElementById("report-table-wrap");
const downloadLinkEl = document.getElementById("download-link");

let latestResult = null;
let selectedChef = "";
const requestedDate = readRequestedDate();

dateInput.value = requestedDate || formatBrowserDate(new Date());

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runExtract(dateInput.value);
});

chefSearchEl.addEventListener("input", renderChefList);
dishSearchEl.addEventListener("input", renderSelectedChef);

loadLatest();

async function loadLatest() {
  const response = await fetch(`${API_BASE}/latest`);
  const payload = await response.json();
  if (payload.latestResult) {
    latestResult = payload.latestResult;
    selectedChef = latestResult.chefs[0] || "";
    renderAll();
    setStatus(`Loaded latest extraction from ${formatDateTime(latestResult.extractedAt)}.`);
  }
}

async function runExtract(date) {
  setStatus(`Running extraction for ${date}...`);
  runButton.disabled = true;

  try {
    const response = await fetch(`${API_BASE}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Extraction failed.");
    }

    latestResult = payload;
    selectedChef = payload.chefs[0] || "";
    renderAll();
    setStatus(`Extraction completed for ${date}.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    runButton.disabled = false;
  }
}

function renderAll() {
  if (!latestResult) {
    workspaceEl.classList.add("hidden");
    summaryEl.classList.add("hidden");
    downloadLinkEl.classList.add("hidden");
    return;
  }

  workspaceEl.classList.remove("hidden");
  summaryEl.classList.remove("hidden");
  downloadLinkEl.classList.remove("hidden");
  downloadLinkEl.href = `${API_BASE}/latest.csv`;
  renderSummary();
  renderChefList();
  renderSelectedChef();
}

function renderSummary() {
  const cards = [
    summaryCard("Run Type", formatRunType(latestResult.runType)),
    summaryCard("Chef Sections", latestResult.sectionCount),
    summaryCard("Rows", latestResult.rowCount),
    summaryCard("Filled Cells", latestResult.entryCount),
    summaryCard("Extracted", formatDateTime(latestResult.extractedAt))
  ];

  if (latestResult.mergeSummary) {
    cards.splice(3, 0,
      summaryCard("Matched Orders", latestResult.mergeSummary.matchedRowCount),
      summaryCard("Unmatched Dish Rows", latestResult.mergeSummary.unmatchedDishRowCount),
      summaryCard("Unmatched Chef Cells", latestResult.mergeSummary.unmatchedChefEntryCount)
    );
  }

  summaryEl.innerHTML = cards.join("");
}

function renderChefList() {
  if (!latestResult) return;

  const filter = chefSearchEl.value.trim().toLowerCase();
  const visibleSections = latestResult.sections.filter((section) =>
    section.chef.toLowerCase().includes(filter)
  );

  chefListEl.innerHTML = visibleSections
    .map((section) => {
      const isActive = section.chef === selectedChef;
      return `
        <button class="chef-button ${isActive ? "active" : ""}" data-chef="${escapeHtml(section.chef)}">
          ${escapeHtml(section.chef)}
          <small>${section.rows.length} rows, ${section.entries.length} filled cells</small>
        </button>
      `;
    })
    .join("");

  chefListEl.querySelectorAll(".chef-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedChef = button.dataset.chef;
      renderChefList();
      renderSelectedChef();
    });
  });
}

function renderSelectedChef() {
  if (!latestResult) return;

  const section = latestResult.sections.find((item) => item.chef === selectedChef) || latestResult.sections[0];
  if (!section) {
    reportTitleEl.textContent = "Report";
    reportMetaEl.textContent = "";
    reportTableWrapEl.innerHTML = `<div class="empty-state">No section available.</div>`;
    return;
  }

  selectedChef = section.chef;
  reportTitleEl.textContent = section.chef;
  reportMetaEl.textContent = `${section.rows.length} rows, ${section.entries.length} filled cells`;

  const dishFilter = dishSearchEl.value.trim().toLowerCase();
  const rows = section.rows.filter((row) => row.dish.toLowerCase().includes(dishFilter));
  const columns = ["dish", ...section.times, "total"];

  if (!rows.length) {
    reportTableWrapEl.innerHTML = `<div class="empty-state">No rows match the current filter.</div>`;
    return;
  }

  const tableHtml = `
    <table>
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(prettyColumn(column))}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            ${columns.map((column) => `<td>${escapeHtml(row[column] || "")}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  reportTableWrapEl.innerHTML = tableHtml;
}

function summaryCard(label, value) {
  return `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function prettyColumn(column) {
  if (column === "dish") return "Dish";
  if (column === "total") return "Total";
  return column;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9b1d20" : "";
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatRunType(value) {
  if (value === "current_day_morning") return "4:00 AM Current Day";
  if (value === "daily_initial") return "2:00 PM Auto";
  if (value === "daily_refresh") return "8:00 PM Refresh";
  return "Manual";
}

function readRequestedDate() {
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function formatBrowserDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
