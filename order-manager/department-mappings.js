const API_BASE = `${window.location.origin}/api/order-manager/departments`;

const statusEl = document.getElementById("mapping-status");
const summaryEl = document.getElementById("mapping-summary");
const latestAuditEl = document.getElementById("latest-audit");
const reloadButtonEl = document.getElementById("reload-dashboard");
const dishFilterEl = document.getElementById("dish-filter");
const statusFilterEl = document.getElementById("status-filter");
const departmentFilterEl = document.getElementById("department-filter");
const departmentFormEl = document.getElementById("department-form");
const departmentNameEl = document.getElementById("department-name");
const departmentCombiEl = document.getElementById("department-combioven");
const departmentListEl = document.getElementById("department-list");
const dishCatalogEl = document.getElementById("dish-catalog");

let dashboardState = {
  departments: [],
  dishes: [],
  latestAudit: null,
  stats: null
};

reloadButtonEl.addEventListener("click", () => loadDashboard());
dishFilterEl.addEventListener("input", debounce(loadDashboard, 250));
statusFilterEl.addEventListener("change", loadDashboard);
departmentFilterEl.addEventListener("change", loadDashboard);
departmentFormEl.addEventListener("submit", handleCreateDepartment);

loadDashboard();

async function loadDashboard() {
  setStatus("Loading department rules…");

  try {
    const params = new URLSearchParams();
    if (dishFilterEl.value.trim()) params.set("q", dishFilterEl.value.trim());
    if (statusFilterEl.value) params.set("status", statusFilterEl.value);
    if (departmentFilterEl.value) params.set("departmentCode", departmentFilterEl.value);
    const response = await fetch(`${API_BASE}/dashboard?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load department rules.");
    }

    dashboardState = payload;
    renderSummary(payload.stats || {}, payload.latestAudit);
    renderDepartmentFilter(payload.departments || []);
    renderDepartmentList(payload.departments || []);
    renderDishCatalog(payload.dishes || [], payload.departments || []);
    setStatus(`Loaded ${payload.dishes.length} dishes across ${payload.departments.length} departments.`);
  } catch (error) {
    summaryEl.innerHTML = "";
    latestAuditEl.innerHTML = "";
    latestAuditEl.classList.add("hidden");
    departmentListEl.innerHTML = "";
    dishCatalogEl.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    setStatus(error.message, true);
  }
}

function renderSummary(stats, latestAudit) {
  summaryEl.innerHTML = [
    summaryCard("Departments", stats.departmentCount || 0),
    summaryCard("Catalog Dishes", stats.dishCount || 0),
    summaryCard("Mapped", stats.mappedDishCount || 0),
    summaryCard("Needs Review", stats.needsReviewCount || 0)
  ].join("");

  if (!latestAudit) {
    latestAuditEl.innerHTML = "";
    latestAuditEl.classList.add("hidden");
    return;
  }

  latestAuditEl.classList.remove("hidden");
  latestAuditEl.innerHTML = [
    summaryCard("Latest Run", latestAudit.reportDate || "-"),
    summaryCard("Rows in Run", latestAudit.rowCount || 0),
    summaryCard("Source Only", latestAudit.sourceOnlyRowCount || 0),
    summaryCard("Unresolved Dishes", latestAudit.unresolvedDishCount || 0)
  ].join("");
}

function renderDepartmentFilter(departments) {
  const currentValue = departmentFilterEl.value;
  departmentFilterEl.innerHTML = [
    `<option value="">All departments</option>`,
    ...departments.map((department) => `<option value="${escapeHtml(department.code)}">${escapeHtml(department.name)}</option>`)
  ].join("");
  if (currentValue && departments.some((department) => department.code === currentValue)) {
    departmentFilterEl.value = currentValue;
  }
}

function renderDepartmentList(departments) {
  if (!departments.length) {
    departmentListEl.innerHTML = `<div class="empty-state">No departments saved yet.</div>`;
    return;
  }

  departmentListEl.innerHTML = departments
    .map((department) => `
      <article class="department-card" data-code="${escapeHtml(department.code)}">
        <div class="department-card-head">
          <strong>${escapeHtml(department.name)}</strong>
          <span>${escapeHtml(department.assignedDishCount || 0)} mapped dishes</span>
        </div>
        <label class="field">
          <span>Name</span>
          <input class="department-name-input" type="text" value="${escapeHtml(department.name)}">
        </label>
        <div class="department-card-flags">
          <label class="toggle-field">
            <input class="department-active-input" type="checkbox"${department.active ? " checked" : ""}>
            <span>Active</span>
          </label>
          <label class="toggle-field">
            <input class="department-combi-input" type="checkbox"${department.feedsCombiOven ? " checked" : ""}>
            <span>Combi oven pilot</span>
          </label>
        </div>
        <div class="department-card-actions">
          <button class="btn-outline department-save-button" type="button">Save</button>
        </div>
      </article>
    `)
    .join("");

  departmentListEl.querySelectorAll(".department-save-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest(".department-card");
      const code = card.dataset.code;
      const body = {
        name: card.querySelector(".department-name-input").value.trim(),
        active: card.querySelector(".department-active-input").checked,
        feedsCombiOven: card.querySelector(".department-combi-input").checked
      };
      await saveDepartment(code, body);
    });
  });
}

function renderDishCatalog(dishes, departments) {
  if (!dishes.length) {
    dishCatalogEl.innerHTML = `<div class="empty-state">No dishes match the current filter.</div>`;
    return;
  }

  const departmentOptions = [
    `<option value="">Use source department</option>`,
    ...departments
      .filter((department) => department.active)
      .map((department) => `<option value="${escapeHtml(department.code)}">${escapeHtml(department.name)}</option>`)
  ].join("");

  dishCatalogEl.innerHTML = `
    <table class="mapping-table">
      <thead>
        <tr>
          <th>Dish</th>
          <th>Source Department</th>
          <th>Resolved Department</th>
          <th>Status</th>
          <th>Last Seen</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${dishes.map((dish) => `
          <tr data-dish-key="${escapeHtml(dish.normalizedDishKey)}">
            <td>
              <div class="mapping-dish-title">${escapeHtml(dish.dishChinese || dish.dish)}</div>
              <div class="mapping-dish-subtitle">${escapeHtml(dish.dishEnglish || dish.dish)}</div>
            </td>
            <td>
              <div>${escapeHtml(dish.sourceDepartment || "No source department")}</div>
              ${dish.sourceDepartmentsSeen.length > 1 ? `<small>${escapeHtml(dish.sourceDepartmentsSeen.join(", "))}</small>` : ""}
            </td>
            <td>
              <select class="mapping-department-select">
                ${departmentOptions}
              </select>
            </td>
            <td><span class="mapping-status-pill ${dish.needsReview ? "review" : "mapped"}">${dish.needsReview ? "Needs review" : "Mapped"}</span></td>
            <td>${escapeHtml(formatDateTime(dish.lastSeenAt) || "-")}</td>
            <td><button class="btn-outline mapping-save-button" type="button">Save</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  dishCatalogEl.querySelectorAll("tbody tr").forEach((row, index) => {
    const dish = dishes[index];
    row.querySelector(".mapping-department-select").value = dish.resolvedDepartmentCode || "";
  });

  dishCatalogEl.querySelectorAll(".mapping-save-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const dishKey = row.dataset.dishKey;
      const resolvedDepartmentCode = row.querySelector(".mapping-department-select").value;
      await saveDishAssignment(dishKey, { resolvedDepartmentCode });
    });
  });
}

async function handleCreateDepartment(event) {
  event.preventDefault();
  const name = departmentNameEl.value.trim();
  if (!name) {
    setStatus("Department name is required.", true);
    return;
  }

  try {
    setStatus(`Saving department ${name}…`);
    const response = await fetch(`${API_BASE}/departments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        feedsCombiOven: departmentCombiEl.checked
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not save department.");
    }
    departmentNameEl.value = "";
    departmentCombiEl.checked = false;
    setStatus(`Saved department ${payload.department.name}. Rebuilt ${payload.rebuild.updatedRunCount} runs.`);
    await loadDashboard();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function saveDepartment(code, body) {
  try {
    setStatus(`Updating department ${body.name || code}…`);
    const response = await fetch(`${API_BASE}/departments/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not update department.");
    }
    setStatus(`Updated ${payload.department.name}. Rebuilt ${payload.rebuild.updatedRunCount} runs.`);
    await loadDashboard();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function saveDishAssignment(dishKey, body) {
  try {
    setStatus("Saving dish assignment…");
    const response = await fetch(`${API_BASE}/dishes/${encodeURIComponent(dishKey)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not save dish assignment.");
    }
    const dishName = payload.dish.dishChinese || payload.dish.dish || dishKey;
    setStatus(`Saved ${dishName}. Rebuilt ${payload.rebuild.updatedRunCount} runs.`);
    await loadDashboard();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function summaryCard(label, value) {
  return `<div class="summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#9b1d20" : "";
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function debounce(fn, delay) {
  let timeoutId = 0;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}
