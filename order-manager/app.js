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
const reportViewLabelEl = document.getElementById("report-view-label");
const reportMetaEl = document.getElementById("report-meta");
const timelineStripEl = document.getElementById("timeline-strip");
const reportTableWrapEl = document.getElementById("report-table-wrap");
const downloadLinkEl = document.getElementById("download-link");
const timelineViewButtonEl = document.getElementById("timeline-view-button");
const gridViewButtonEl = document.getElementById("grid-view-button");

let latestResult = null;
let selectedChef = "";
let currentViewMode = "timeline";
const requestedDate = readRequestedDate();

dateInput.value = requestedDate || formatBrowserDate(new Date());

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runExtract(dateInput.value);
});

chefSearchEl.addEventListener("input", renderChefList);
dishSearchEl.addEventListener("input", renderSelectedChef);
timelineViewButtonEl.addEventListener("click", () => setViewMode("timeline"));
gridViewButtonEl.addEventListener("click", () => setViewMode("grid"));

loadLatest();

async function loadLatest() {
  const response = await fetch(`${API_BASE}/latest`);
  const payload = await response.json();
  if (payload.latestResult) {
    latestResult = payload.latestResult;
    if (latestResult.reportDate) {
      dateInput.value = latestResult.reportDate;
    }
    selectedChef = latestResult.chefs[0] || "";
    renderAll();
    setStatus(`Loaded ${formatLongDate(latestResult.reportDate)} extracted at ${formatDateTime(latestResult.extractedAt)}.`);
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
    if (payload.reportDate) {
      dateInput.value = payload.reportDate;
    }
    selectedChef = payload.chefs[0] || "";
    renderAll();
    setStatus(`Extraction completed for ${formatLongDate(payload.reportDate || date)}.`);
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
    timelineStripEl.classList.add("hidden");
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
    summaryCard("Viewing Date", formatLongDate(latestResult.reportDate || dateInput.value || "-")),
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
    reportViewLabelEl.textContent = "";
    reportMetaEl.textContent = "";
    timelineStripEl.classList.add("hidden");
    reportTableWrapEl.innerHTML = `<div class="empty-state">No section available.</div>`;
    return;
  }

  selectedChef = section.chef;
  reportTitleEl.textContent = section.chef;
  reportViewLabelEl.textContent = `${formatLongDate(latestResult.reportDate || dateInput.value || "")} • ${formatRunType(latestResult.runType)} view`;

  const dishFilter = dishSearchEl.value.trim().toLowerCase();
  const rows = section.rows.filter((row) => row.dish.toLowerCase().includes(dishFilter));
  const timelineSlots = buildTimelineSlots(section.times || [], rows);
  const filledCellCount = timelineSlots.reduce((sum, slot) => sum + slot.items.length, 0);
  reportMetaEl.textContent = `Viewing report date ${formatLongDate(latestResult.reportDate || dateInput.value || "")} • Extracted ${formatDateTime(latestResult.extractedAt)} • ${rows.length} dishes • ${filledCellCount} timeline entries`;

  if (!rows.length) {
    timelineStripEl.classList.add("hidden");
    reportTableWrapEl.innerHTML = `<div class="empty-state">No rows match the current filter.</div>`;
    return;
  }

  renderTimelineStrip(timelineSlots);

  if (currentViewMode === "timeline") {
    reportTableWrapEl.innerHTML = renderTimelineView(timelineSlots);
    return;
  }

  const columns = ["dish", ...section.times, "total"];
  reportTableWrapEl.innerHTML = `
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
}

function summaryCard(label, value) {
  return `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function setViewMode(mode) {
  currentViewMode = mode === "grid" ? "grid" : "timeline";
  timelineViewButtonEl.classList.toggle("is-active", currentViewMode === "timeline");
  gridViewButtonEl.classList.toggle("is-active", currentViewMode === "grid");
  renderSelectedChef();
}

function buildTimelineSlots(times, rows) {
  return (Array.isArray(times) ? times : [])
    .map((timeLabel) => ({
      timeLabel,
      items: rows
        .map((row) => ({
          dish: row.dish || "",
          value: String(row[timeLabel] || "").trim(),
          total: String(row.total || "").trim()
        }))
        .filter((item) => item.value)
    }))
    .filter((slot) => slot.items.length);
}

function renderTimelineStrip(slots) {
  if (!slots.length) {
    timelineStripEl.classList.add("hidden");
    timelineStripEl.innerHTML = "";
    return;
  }

  timelineStripEl.classList.remove("hidden");
  timelineStripEl.innerHTML = slots.map((slot) => `
    <div class="timeline-strip-card">
      <span>${escapeHtml(slot.timeLabel)}</span>
      <strong>${escapeHtml(String(slot.items.length))} dishes</strong>
    </div>
  `).join("");
}

function renderTimelineView(slots) {
  if (!slots.length) {
    return `<div class="empty-state">No filled timeline cells for this chef on the current filter.</div>`;
  }

  return `
    <div class="timeline-board">
      ${slots.map((slot) => `
        <section class="timeline-slot-card">
          <div class="timeline-slot-head">
            <h3>${escapeHtml(slot.timeLabel)}</h3>
            <span>${escapeHtml(String(slot.items.length))} dishes</span>
          </div>
          <div class="timeline-slot-list">
            ${slot.items.map((item) => `
              <article class="timeline-entry">
                <div class="timeline-entry-main">
                  <strong>${escapeHtml(item.dish)}</strong>
                  <span>${item.total ? `Daily total ${escapeHtml(item.total)}` : "Chef timeline entry"}</span>
                </div>
                <div class="timeline-entry-value">${escapeHtml(item.value)}</div>
              </article>
            `).join("")}
          </div>
        </section>
      `).join("")}
    </div>
  `;
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

function formatLongDate(value) {
  if (!value || value === "-") {
    return value || "";
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
      });
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
