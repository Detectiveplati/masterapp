(function () {
  const station = window.ORDER_MANAGER_KITCHEN_STATION || {
    key: "combioven",
    boardTitle: "烤炉订单 Combi Oven Orders",
    sourceLabel: "combi oven"
  };
  const API_URL = `/api/order-manager/kitchen/stations/${encodeURIComponent(station.key)}/latest`;
  const COOKS_STATUS_API_URL = `/api/order-manager/kitchen/cooks/status?limit=500&station=${encodeURIComponent(station.key)}`;
  const SAMPLE_API_URL = `/api/order-manager/retention-samples`;
  let currentSortMode = "dish";
  let latestOrdersPayload = null;
  let latestCookedEntries = [];

  function logRuntime(event, details) {
    if (typeof window.orderManagerRuntimeLog === "function") {
      window.orderManagerRuntimeLog("board", event, details);
    }
  }

  async function initAutoOrders() {
    const menu = document.getElementById("menu");
    if (!menu) return;

    const manualNodes = Array.from(menu.childNodes);
    const shell = document.createElement("div");
    shell.className = "auto-order-shell";
    shell.innerHTML = `
        <div class="food-category auto-order-panel">
        <h2>${escapeHtml(station.boardTitle)}</h2>
        <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:14px">
          <label style="display:flex;flex-direction:column;gap:6px;font-weight:700;color:#444">
            <span>日期 Date</span>
            <select id="auto-order-date" style="min-width:180px;padding:10px 12px;border-radius:10px;border:1px solid rgba(0,0,0,0.14);font:inherit"></select>
          </label>
          <button id="manual-order-toggle" class="export-btn auto-order-manual-toggle" type="button" aria-expanded="false">手动输入 Manual Key-In</button>
        </div>
        <div id="manual-order-panel" class="food-category manual-order-panel" hidden></div>
        <div class="auto-order-sortbar">
          <span class="auto-order-sort-label">排序 Sort</span>
          <button id="auto-order-sort-dish" class="auto-order-sort-btn is-active" type="button">按菜名 Group Dish</button>
          <button id="auto-order-sort-time" class="auto-order-sort-btn" type="button">按时间 Time</button>
        </div>
        <div id="auto-order-summary" style="margin-bottom:12px;color:#666;font-size:0.92rem"></div>
        <div id="auto-order-board"></div>
      </div>
    `;
    const manualPanel = shell.querySelector("#manual-order-panel");
    manualNodes.forEach((node) => manualPanel.appendChild(node));
    menu.replaceChildren(shell);

    const dateSelect = document.getElementById("auto-order-date");
    const manualToggleButton = document.getElementById("manual-order-toggle");
    const timeSortButton = document.getElementById("auto-order-sort-time");
    const dishSortButton = document.getElementById("auto-order-sort-dish");
    const board = document.getElementById("auto-order-board");
    dateSelect.addEventListener("change", () => loadOrders({ date: dateSelect.value }));
    manualPanel.insertAdjacentHTML(
      "afterbegin",
      `
        <div class="manual-order-panel-header">
          <strong class="manual-order-panel-title">手动输入模块 Manual Key-In Module</strong>
          <p class="manual-order-panel-note">仅在订单列表没有该项目时使用 Use only when the item is not in the order list.</p>
        </div>
      `
    );
    manualToggleButton.addEventListener("click", () => {
      const isHidden = manualPanel.hidden;
      manualPanel.hidden = !isHidden;
      manualToggleButton.setAttribute("aria-expanded", String(isHidden));
      manualToggleButton.textContent = isHidden
        ? "隐藏手动输入 Hide Manual Key-In"
        : "手动输入 Manual Key-In";
      if (isHidden) {
        manualPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    timeSortButton.addEventListener("click", () => updateSortMode("time"));
    dishSortButton.addEventListener("click", () => updateSortMode("dish"));
    board.addEventListener("click", async (event) => {
      const undoButton = event.target.closest("[data-undo-session]");
      if (undoButton) {
        event.preventDefault();
        event.stopPropagation();
        await undoCookSession(undoButton.dataset.undoSession);
        return;
      }

      const batchButton = event.target.closest("[data-batch-start]");
      if (batchButton) {
        event.preventDefault();
        event.stopPropagation();
        const group = (window.__combiOrderGroups || {})[batchButton.dataset.batchStart];
        if (group && Array.isArray(group.items) && typeof window.addNewCookBatchFromOrders === "function") {
          window.addNewCookBatchFromOrders(group.items);
        }
        return;
      }

      const sampleActionButton = event.target.closest("[data-sample-action]");
      if (sampleActionButton) {
        event.preventDefault();
        event.stopPropagation();
        await runSampleTaskAction(sampleActionButton);
        return;
      }

      const card = event.target.closest("[data-order-id]");
      if (!card) {
        return;
      }

      const item = (window.__combiOrderItems || {})[card.dataset.orderId];
      if (item && !item.isCooked && typeof window.addNewCookFromOrder === "function") {
        window.addNewCookFromOrder(item);
      }
    });
    window.addEventListener("order-manager:cook-saved", (event) => {
      applySavedCookToCache(event.detail || {});
      refreshBoardFromCache();
    });
    window.addEventListener("order-manager:cooks-changed", () => {
      refreshBoardFromCache();
    });

    await loadOrders({});

    function updateSortMode(mode) {
      currentSortMode = mode;
      timeSortButton.classList.toggle("is-active", mode === "time");
      dishSortButton.classList.toggle("is-active", mode === "dish");
      refreshBoardFromCache({ forceFullRender: true });
    }
  }

  async function loadOrders(options = {}) {
    const summary = document.getElementById("auto-order-summary");
    const board = document.getElementById("auto-order-board");
    const params = new URLSearchParams();

    if (options.date) {
      params.set("date", options.date);
    }

    summary.textContent = `读取${station.sourceLabel}订单中… Loading ${station.sourceLabel} orders…`;
    board.innerHTML = "";

    try {
      const query = params.toString();
      const url = query ? `${API_URL}?${query}` : API_URL;
      const [ordersResponse, cooksResponse] = await Promise.all([
        fetch(url),
        fetch(COOKS_STATUS_API_URL)
      ]);
      const payload = await ordersResponse.json();
      latestCookedEntries = cooksResponse.ok ? await cooksResponse.json() : [];
      if (!ordersResponse.ok) {
        throw new Error(payload.error || `Could not load ${station.sourceLabel} orders.`);
      }

      latestOrdersPayload = payload;
      renderDateOptions(payload.reportDates, payload.selectedDate);
      const boardState = buildBoardState(payload, latestCookedEntries);
      renderSummary(payload, boardState.cookedItemCount);
      renderBoard(boardState.annotatedPrepSlots);
      logRuntime("load-orders", {
        selectedDate: payload.selectedDate,
        extractedAt: payload.extractedAt || "",
        sortMode: currentSortMode,
        itemCount: payload.itemCount,
        cookedItemCount: boardState.cookedItemCount,
        pendingItemCount: boardState.pendingItemCount
      });
    } catch (error) {
      summary.textContent = error.message;
      board.innerHTML = `<div style="padding:16px;border:1px dashed #d99;background:#fff7f7;border-radius:12px;color:#9b1d20">${escapeHtml(error.message)}</div>`;
    }
  }

  function renderDateOptions(reportDates, selectedDate) {
    const dateSelect = document.getElementById("auto-order-date");
    if (!dateSelect) {
      return;
    }

    dateSelect.innerHTML = reportDates
      .map((itemDate) => `<option value="${escapeHtml(itemDate)}">${escapeHtml(formatDate(itemDate))}</option>`)
      .join("");
    if (selectedDate) {
      dateSelect.value = selectedDate;
    }
  }

  function renderSummary(payload, cookedItemCount) {
    const summary = document.getElementById("auto-order-summary");
    if (!summary) {
      return;
    }

    const totalQty = Number(payload.totalQty) || 0;
    const updateCount = Number(payload.updatedItemCount) || 0;
    const sampleCount = Number(payload.sampleTaskCount) || 0;
    const openSampleCount = Number(payload.openSampleTaskCount) || 0;
    summary.textContent = `${formatDate(payload.selectedDate)} • ${payload.itemCount} dishes • ${totalQty} total qty${cookedItemCount ? ` • ${cookedItemCount} cooked` : ""}${sampleCount ? ` • ${openSampleCount}/${sampleCount} sample tasks open` : ""}${updateCount ? ` • ! ${updateCount} updates` : ""} • source ${payload.sourceFilename}`;
  }

  function renderBoard(prepSlots) {
    const board = document.getElementById("auto-order-board");
    if (!board) {
      return;
    }

    window.__combiOrderItems = {};
    window.__combiOrderGroups = {};

    if (!prepSlots.length) {
      board.innerHTML = `<div style="padding:16px;border:1px dashed rgba(0,0,0,0.15);border-radius:12px;background:#fff;color:#666">没有${escapeHtml(station.sourceLabel)}订单 No ${escapeHtml(station.sourceLabel)} orders for this date.</div>`;
      return;
    }

    board.innerHTML = prepSlots.map((slot) => `
      <div class="food-category" data-prep-slot="${escapeHtml(slot.prepSlot)}">
        <h3 class="category-header">⏰ ${escapeHtml(slot.prepSlot)} • ${slot.itemCount} dishes • ${slot.totalQty} qty</h3>
        ${renderPrepSlotContent(slot)}
      </div>
    `).join("");
  }

  function renderPrepSlotContent(slot) {
    const specialTasks = Array.isArray(slot.specialTasks) ? slot.specialTasks : [];
    const activeItems = (slot.items || []).filter((item) => !item.isCooked);
    const doneItems = (slot.items || []).filter((item) => item.isCooked);

    return `
      ${renderSpecialTaskSection(specialTasks)}
      ${renderPrepSlotItems(activeItems)}
      ${renderDoneSection(doneItems)}
    `;
  }

  function renderSpecialTaskSection(tasks) {
    if (!tasks.length) {
      return "";
    }

    return `
      <section class="retention-task-section">
        <div class="retention-task-header">
          <strong>Retention Samples (${tasks.length})</strong>
          <span>Food-safety task cards linked to live orders.</span>
        </div>
        <div class="food-grid retention-task-grid">
          ${tasks.map((task) => renderRetentionSampleCard(task)).join("")}
        </div>
      </section>
    `;
  }

  function renderPrepSlotItems(items) {
    if (!items.length) {
      return `
        <div class="auto-order-empty-state">
          当前备餐时段没有待处理订单 No active orders in this prep slot.
        </div>
      `;
    }

    if (currentSortMode !== "dish") {
      return `
        <div class="food-grid">
          ${items.map((item) => renderOrderCard(item)).join("")}
        </div>
      `;
    }

    const dishGroups = buildDishGroups(items);
    return `
      <div class="auto-order-grouped-grid">
        ${dishGroups.map((group) => renderSoftDishGroup(group)).join("")}
      </div>
    `;
  }

  function renderDoneSection(items) {
    if (!items.length) {
      return "";
    }

    const sessionSeen = new Set();
    return `
      <section class="auto-order-done-section">
        <div class="auto-order-done-header">
          <strong>已完成 Done (${items.length})</strong>
          <span>完成项目移到底部，需更正时可撤销 Completed items are moved below. Use undo if needed.</span>
        </div>
        <div class="food-grid auto-order-done-grid">
          ${items.map((item) => {
            const sessionId = String(item.doneSessionId || "").trim();
            const showUndo = sessionId && !sessionSeen.has(sessionId);
            if (sessionId) {
              sessionSeen.add(sessionId);
            }
            return renderOrderCardWithOptions(item, {
              done: true,
              showUndo,
              undoSessionId: sessionId,
              undoBatchCount: Number(item.doneBatchCount) || 0
            });
          }).join("")}
        </div>
      </section>
    `;
  }

  function refreshBoardFromCache(options = {}) {
    if (!latestOrdersPayload) {
      return;
    }

    const boardState = buildBoardState(latestOrdersPayload, latestCookedEntries);
    renderSummary(latestOrdersPayload, boardState.cookedItemCount);

    if (options.forceFullRender || !patchBoardState(boardState.annotatedPrepSlots)) {
      renderBoard(boardState.annotatedPrepSlots);
    }

  }

  function buildBoardState(payload, cookedEntries) {
    const cookedLookup = buildCookedLookup(cookedEntries, payload.selectedDate);
    const pendingLookup = buildPendingLookup(window.__orderManagerActiveCooks || [], payload.selectedDate);
    const annotatedPrepSlots = sortPrepSlots(
      annotatePrepSlots(payload.prepSlots || [], cookedLookup, pendingLookup),
      currentSortMode
    );

    return {
      annotatedPrepSlots,
      cookedItemCount: countCookedItems(annotatedPrepSlots),
      pendingItemCount: countPendingItems(annotatedPrepSlots)
    };
  }

  function patchBoardState(prepSlots) {
    if (latestOrdersPayload && Number(latestOrdersPayload.sampleTaskCount || 0) > 0) {
      return false;
    }
    const board = document.getElementById("auto-order-board");
    if (!board) {
      return false;
    }

    const sections = Array.from(board.querySelectorAll(".food-category[data-prep-slot]"));
    if (sections.length !== prepSlots.length) {
      return false;
    }

    const itemMap = new Map();
    prepSlots.forEach((slot) => {
      (slot.items || []).forEach((item) => {
        itemMap.set(String(item.id), item);
      });
    });

    const cards = Array.from(board.querySelectorAll("[data-order-id]"));
    if (!cards.length && itemMap.size) {
      return false;
    }
    if (cards.length !== itemMap.size) {
      return false;
    }

    const currentOrder = cards.map((card) => card.dataset.orderId);
    const nextOrder = prepSlots.flatMap((slot) => (slot.items || []).map((item) => String(item.id)));
    if (currentOrder.length !== nextOrder.length) {
      return false;
    }
    for (let index = 0; index < nextOrder.length; index += 1) {
      if (currentOrder[index] !== nextOrder[index]) {
        return false;
      }
    }

    for (let sectionIndex = 0; sectionIndex < prepSlots.length; sectionIndex += 1) {
      const sectionEl = sections[sectionIndex];
      const slot = prepSlots[sectionIndex];
      if (!sectionEl || sectionEl.dataset.prepSlot !== String(slot.prepSlot)) {
        return false;
      }
    }

    for (const card of cards) {
      const item = itemMap.get(card.dataset.orderId);
      if (!item) {
        return false;
      }
      if (card.classList.contains("cooked") !== Boolean(item.isCooked)) {
        return false;
      }
      if (card.classList.contains("pending") !== Boolean(item.isPending && !item.isCooked)) {
        return false;
      }
      applyCardState(card, item);
    }

    return true;
  }

  function applyCardState(card, item) {
    window.__combiOrderItems = window.__combiOrderItems || {};
    window.__combiOrderItems[item.id] = item;

    card.classList.toggle("cooked", Boolean(item.isCooked));
    card.classList.toggle("pending", Boolean(item.isPending) && !item.isCooked);

    const body = card.querySelector(".auto-order-card-body");
    if (!body) {
      return;
    }

    syncStateBadge(body, "auto-order-cooked-badge", Boolean(item.isCooked), "Cooked", "✓");
    syncStateBadge(body, "auto-order-pending-badge", Boolean(item.isPending) && !item.isCooked, "Pending cook", "◔");
  }

  function syncStateBadge(container, className, shouldShow, ariaLabel, text) {
    const selector = `.${className}`;
    const existing = container.querySelector(selector);
    if (!shouldShow) {
      if (existing) {
        existing.remove();
      }
      return;
    }

    if (existing) {
      return;
    }

    const badge = document.createElement("div");
    badge.className = className;
    badge.setAttribute("aria-label", ariaLabel);
    badge.textContent = text;
    container.insertBefore(badge, container.firstChild);
  }

  function applySavedCookToCache(detail) {
    const reportDates = Array.isArray(detail.reportDates)
      ? detail.reportDates.map((value) => String(value || "").trim()).filter(Boolean)
      : [];
    const startDate = String(detail.reportDate || "").trim();
    if (startDate && !reportDates.includes(startDate)) {
      reportDates.push(startDate);
    }

    if (!reportDates.length) {
      return;
    }

    latestCookedEntries = [
      ...latestCookedEntries,
      {
        sessionId: String(detail.sessionId || "").trim(),
        food: String(detail.food || "").trim(),
        startDate,
        batchCount: Number(detail.batchCount) || 0,
        sourceIds: Array.isArray(detail.sourceIds) ? detail.sourceIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
        matchKeys: Array.isArray(detail.matchKeys) ? detail.matchKeys.map((value) => String(value || "").trim()).filter(Boolean) : [],
        reportDates
      }
    ];
  }

  function renderOrderCard(item) {
    return renderOrderCardWithOptions(item, {});
  }

  function renderOrderCardWithOptions(item, options = {}) {
    window.__combiOrderItems = window.__combiOrderItems || {};
    window.__combiOrderItems[item.id] = item;
    const chineseName = item.dishChinese || item.dish || "";
    const englishName = item.dishEnglish && item.dishEnglish !== chineseName ? item.dishEnglish : "";
    const englishClassName = englishName ? "english auto-order-title-en" : "english auto-order-title-en auto-order-title-en-empty";
    const compact = Boolean(options.compact);
    const done = Boolean(options.done);
    const cardClassName = compact
      ? "food-card auto-order-card auto-order-subcard"
      : `food-card auto-order-card${done ? " auto-order-done-card" : ""}`;
    const bodyClassName = compact
      ? "auto-order-card-body auto-order-card-body-compact"
      : "auto-order-card-body";
    const indexBadge = compact && options.groupIndex
      ? `<div class="auto-order-group-index" aria-label="批次项目 Batch item ${options.groupIndex}">${options.groupIndex}</div>`
      : "";
    const undoButton = done && options.showUndo && options.undoSessionId
      ? `<button class="auto-order-undo-btn" type="button" data-undo-session="${escapeHtml(options.undoSessionId)}">${options.undoBatchCount > 1 ? "撤销整批 Undo Batch" : "撤销 Undo"}</button>`
      : "";
    const doneHint = done && !options.showUndo && options.undoBatchCount > 1
      ? `<div class="auto-order-done-note">同批已完成 In saved batch</div>`
      : "";

    return `
      <div class="${cardClassName}${item.isCooked ? " cooked" : ""}${item.isPending && !item.isCooked ? " pending" : ""}" data-order-id="${escapeHtml(item.id)}">
        <span class="${bodyClassName}">
          ${indexBadge}
          ${item.isCooked ? `<div class="auto-order-cooked-badge" aria-label="已完成 Cooked">✓</div>` : ""}
          ${item.isPending && !item.isCooked ? `<div class="auto-order-pending-badge" aria-label="待烹饪 Pending cook">◔</div>` : ""}
          ${compact ? "" : `<div class="chinese auto-order-title-cn">${escapeHtml(chineseName)}</div>`}
          ${compact ? "" : `<div class="${englishClassName}">${escapeHtml(englishName || "\u00A0")}</div>`}
          ${item.hasAlert ? `<div class="auto-order-alert">${escapeHtml(item.changeAlertLabel || "改单！")}</div>` : ""}
          ${undoButton}
          ${doneHint}
          <div class="auto-order-meta">
            <div class="auto-order-row auto-order-row-prep">
              <span class="auto-order-label">备餐时间 Prep Time</span>
              <strong class="auto-order-value auto-order-prep-value">${escapeHtml(item.prepTime)}</strong>
            </div>
            <div class="auto-order-row">
              <span class="auto-order-label">数量 Qty</span>
              <strong class="auto-order-value auto-order-qty-value">${escapeHtml(String(item.qty))}</strong>
            </div>
            <div class="auto-order-function"><strong>出餐 Function:</strong> ${escapeHtml(item.functionTime)}</div>
            <div class="auto-order-function"><strong>订单 Order:</strong> ${escapeHtml(item.orderNumber)}</div>
          </div>
        </span>
      </div>
    `;
  }

  function renderRetentionSampleCard(task) {
    const statusLabel = getSampleStatusLabel(task.status);
    const actionButtons = buildSampleActionButtons(task);
    const orders = Array.isArray(task.orderNumbers) && task.orderNumbers.length
      ? task.orderNumbers.join(", ")
      : "Linked source order";
    const locationLine = task.storageLocation
      ? `<div class="retention-task-line"><strong>Stored:</strong> ${escapeHtml(task.storageLocation)}</div>`
      : task.storageLocationHint
        ? `<div class="retention-task-line"><strong>Location:</strong> ${escapeHtml(task.storageLocationHint)}</div>`
        : "";

    return `
      <article class="food-card retention-task-card retention-task-status-${escapeHtml(task.status)}" data-sample-id="${escapeHtml(task.id)}">
        <div class="retention-task-badge">Retention Sample</div>
        <div class="chinese auto-order-title-cn">${escapeHtml(task.dishChinese || task.dish || task.displayFood || "")}</div>
        <div class="english auto-order-title-en">${escapeHtml(task.dishEnglish || "\u00A0")}</div>
        <div class="retention-task-meta">
          <div class="retention-task-line"><strong>Status:</strong> ${escapeHtml(statusLabel)}</div>
          <div class="retention-task-line"><strong>Dept:</strong> ${escapeHtml(task.department || "-")}</div>
          <div class="retention-task-line"><strong>Qty ref:</strong> ${escapeHtml(task.qtyReference || "-")}</div>
          <div class="retention-task-line"><strong>Order:</strong> ${escapeHtml(orders)}</div>
          <div class="retention-task-line"><strong>Rule:</strong> ${escapeHtml(task.storageRuleLabel || "")}</div>
          ${locationLine}
          ${task.selectionReason ? `<div class="retention-task-note">${escapeHtml(task.selectionReason)}</div>` : ""}
        </div>
        ${actionButtons ? `<div class="retention-task-actions">${actionButtons}</div>` : ""}
      </article>
    `;
  }

  function buildSampleActionButtons(task) {
    if (task.status === "required") {
      return [
        renderSampleActionButton("collect", "Collect"),
        renderSampleActionButton("store", "Store"),
        renderSampleActionButton("miss", "Mark Missed")
      ].join("");
    }
    if (task.status === "collected") {
      return [
        renderSampleActionButton("store", "Store"),
        renderSampleActionButton("dispose", "Dispose"),
        renderSampleActionButton("miss", "Mark Missed")
      ].join("");
    }
    if (task.status === "stored") {
      return renderSampleActionButton("dispose", "Dispose");
    }
    return "";
  }

  function renderSampleActionButton(action, label) {
    return `<button class="retention-task-btn" type="button" data-sample-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
  }

  async function runSampleTaskAction(button) {
    const card = button.closest("[data-sample-id]");
    if (!card) {
      return;
    }

    const sampleId = card.dataset.sampleId;
    const action = button.dataset.sampleAction;
    const actor = typeof window.getOrderManagerCurrentStaff === "function"
      ? String(window.getOrderManagerCurrentStaff() || "").trim()
      : "";
    const payload = { actor };

    if (action === "store") {
      const locationHint = findSampleTaskHint(sampleId) || "Retention sample chiller";
      const location = window.prompt("Storage location for this retention sample:", locationHint);
      if (location === null) {
        return;
      }
      payload.storageLocation = String(location || "").trim();
    } else if (action === "miss") {
      const reason = window.prompt("Reason for missed retention sample:", "Sample not collected before dispatch");
      if (reason === null) {
        return;
      }
      payload.reason = String(reason || "").trim();
    }

    button.disabled = true;
    try {
      const response = await fetch(`${SAMPLE_API_URL}/${encodeURIComponent(sampleId)}/${encodeURIComponent(action)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Could not ${action} retention sample task.`);
      }
      if (typeof window.orderManagerKitchenToast === "function") {
        window.orderManagerKitchenToast(`Retention sample ${getSampleStatusLabel(result.status)}.`, "success");
      }
      await loadOrders({ date: latestOrdersPayload && latestOrdersPayload.selectedDate ? latestOrdersPayload.selectedDate : "" });
    } catch (error) {
      if (typeof window.orderManagerKitchenToast === "function") {
        window.orderManagerKitchenToast(error.message || "Retention sample update failed.", "error");
      }
    } finally {
      button.disabled = false;
    }
  }

  function findSampleTaskHint(sampleId) {
    const payload = latestOrdersPayload || {};
    const tasks = Array.isArray(payload.retentionSampleTasks) ? payload.retentionSampleTasks : [];
    const task = tasks.find((item) => String(item.id) === String(sampleId));
    return task ? String(task.storageLocationHint || task.storageLocation || "").trim() : "";
  }

  function getSampleStatusLabel(status) {
    if (status === "required") return "Required";
    if (status === "collected") return "Collected";
    if (status === "stored") return "Stored";
    if (status === "disposed") return "Disposed";
    if (status === "missed") return "Missed";
    if (status === "cancelled") return "Cancelled";
    return String(status || "Unknown");
  }

  function buildDishGroups(items) {
    const groups = [];
    let currentGroup = null;

    (items || []).forEach((item) => {
      const groupKey = getDishGroupKey(item);
      if (!currentGroup || currentGroup.key !== groupKey) {
        currentGroup = {
          id: [
            String(item.reportDate || "").trim(),
            String(item.prepSlot || item.prepTime || "").trim(),
            groupKey
          ].join("||"),
          key: groupKey,
          dishChinese: item.dishChinese || item.dish || "",
          dishEnglish: item.dishEnglish || "",
          items: [],
          totalQty: 0,
          earliestPrepLabel: item.prepTime || item.prepSlot || "",
          earliestPrepSortKey: item.prepSortKey
        };
        groups.push(currentGroup);
      }

      currentGroup.items.push(item);
      currentGroup.totalQty += Number(item.qtyNumber) || 0;
      if (
        compareNumbers(item.prepSortKey, currentGroup.earliestPrepSortKey) < 0 &&
        String(item.prepTime || item.prepSlot || "").trim()
      ) {
        currentGroup.earliestPrepSortKey = item.prepSortKey;
        currentGroup.earliestPrepLabel = item.prepTime || item.prepSlot || currentGroup.earliestPrepLabel;
      }
    });

    return groups;
  }

  function renderDishGroup(group) {
    return renderDishGroupWithOptions(group, {});
  }

  function renderHybridDishGroup(group) {
    if (!group || !Array.isArray(group.items) || !group.items.length) {
      return "";
    }
    if (group.items.length === 1) {
      return renderOrderCard(group.items[0]);
    }
    return renderDishGroupWithOptions(group, { hybrid: true });
  }

  function renderSoftDishGroup(group) {
    if (!group || !Array.isArray(group.items) || !group.items.length) {
      return "";
    }

    if (group.items.length === 1) {
      return renderOrderCard(group.items[0]);
    }

    window.__combiOrderGroups = window.__combiOrderGroups || {};
    window.__combiOrderGroups[group.id] = group;

    const englishName = group.dishEnglish && group.dishEnglish !== group.dishChinese ? group.dishEnglish : "";
    const clusterColumns = Math.min(Math.max(group.items.length, 2), 4);

    return `
      <section
        class="auto-order-cluster"
        data-dish-group="${escapeHtml(group.key)}"
        style="--cluster-columns:${clusterColumns};--cluster-span:${clusterColumns};"
      >
        <div class="auto-order-cluster-head">
          <div class="auto-order-cluster-copy">
            <div class="auto-order-cluster-title">${escapeHtml(group.dishChinese)}</div>
            <div class="auto-order-cluster-subtitle">${escapeHtml(englishName || "\u00A0")}</div>
            <div class="auto-order-cluster-meta">${group.items.length}单 · ${group.totalQty}数量</div>
          </div>
          <div class="auto-order-cluster-tools">
            <button class="export-btn auto-order-batch-start auto-order-batch-start-cluster" type="button" data-batch-start="${escapeHtml(group.id)}" aria-label="整批加入到现煮列表 Add whole batch to active cooks" title="整批加入 Add whole batch">
              <span class="auto-order-batch-start-cn">批+</span>
              <span class="auto-order-batch-start-en">All</span>
            </button>
          </div>
        </div>
        <div class="auto-order-cluster-grid">
          ${group.items.map((item, index) => renderClusterMemberCard(item, index + 1, group.items.length)).join("")}
        </div>
      </section>
    `;
  }

  function renderClusterMemberCard(item, groupIndex, groupSize) {
    window.__combiOrderItems = window.__combiOrderItems || {};
    window.__combiOrderItems[item.id] = item;

    const badgeLabel = `${groupIndex}/${groupSize}`;

    return `
      <div class="food-card auto-order-card auto-order-cluster-item${item.isCooked ? " cooked" : ""}${item.isPending && !item.isCooked ? " pending" : ""}" data-order-id="${escapeHtml(item.id)}">
        <span class="auto-order-card-body auto-order-card-body-cluster">
          <div class="auto-order-cluster-item-top">
            <div class="auto-order-group-index" aria-label="批次项目 Batch item ${groupIndex} of ${groupSize}">${escapeHtml(badgeLabel)}</div>
          </div>
          ${item.isCooked ? `<div class="auto-order-cooked-badge" aria-label="已完成 Cooked">✓</div>` : ""}
          ${item.isPending && !item.isCooked ? `<div class="auto-order-pending-badge" aria-label="待烹饪 Pending cook">◔</div>` : ""}
          ${item.hasAlert ? `<div class="auto-order-alert">${escapeHtml(item.changeAlertLabel || "改单！")}</div>` : ""}
          <div class="auto-order-meta auto-order-meta-cluster">
            <div class="auto-order-row auto-order-row-prep">
              <span class="auto-order-label">备餐时间 Prep Time</span>
              <strong class="auto-order-value auto-order-prep-value">${escapeHtml(item.prepTime)}</strong>
            </div>
            <div class="auto-order-row">
              <span class="auto-order-label">数量 Qty</span>
              <strong class="auto-order-value auto-order-qty-value">${escapeHtml(String(item.qty))}</strong>
            </div>
            <div class="auto-order-function"><strong>出餐 Function:</strong> ${escapeHtml(item.functionTime)}</div>
            <div class="auto-order-function"><strong>订单 Order:</strong> ${escapeHtml(item.orderNumber)}</div>
          </div>
        </span>
      </div>
    `;
  }

  function renderDishGroupWithOptions(group, options = {}) {
    window.__combiOrderGroups = window.__combiOrderGroups || {};
    window.__combiOrderGroups[group.id] = group;
    const englishName = group.dishEnglish && group.dishEnglish !== group.dishChinese ? group.dishEnglish : "";
    const groupClassName = options.hybrid
      ? "auto-order-dish-group auto-order-dish-group-hybrid"
      : "auto-order-dish-group";
    const batchColumns = Math.min(Math.max(group.items.length, 2), 4);
    const hybridSpanStyle = options.hybrid
      ? ` style="--batch-columns:${batchColumns};--batch-width:calc(${batchColumns} * 180px + ${(batchColumns - 1) * 20}px)"`
      : "";
    return `
      <section class="${groupClassName}" data-dish-group="${escapeHtml(group.key)}"${hybridSpanStyle}>
        <div class="auto-order-dish-group-head">
          <div class="auto-order-dish-group-copy">
            <div class="auto-order-dish-group-title">${escapeHtml(group.dishChinese)}</div>
            <div class="auto-order-dish-group-subtitle">${escapeHtml(englishName || "\u00A0")}</div>
            <div class="auto-order-dish-group-note">同批备餐 Same Batch</div>
          </div>
          <div class="auto-order-dish-group-aside">
            <div class="auto-order-dish-group-stats">
              <div class="auto-order-dish-group-stat">${group.items.length}单 Orders</div>
              <div class="auto-order-dish-group-stat">${group.totalQty}数量 Qty</div>
              <button class="export-btn auto-order-batch-start" type="button" data-batch-start="${escapeHtml(group.id)}" aria-label="加入同批 Add Batch" title="加入同批 Add Batch">加入同批</button>
            </div>
          </div>
        </div>
        <div class="auto-order-dish-group-grid">
          ${group.items.map((item, index) => renderOrderCardWithOptions(item, { compact: true, groupIndex: index + 1 })).join("")}
        </div>
      </section>
    `;
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

  function buildCookedLookup(entries, selectedDate) {
    const cookedSourceIds = new Set();
    const cookedExactKeys = new Set();
    const cookedSourceMeta = new Map();
    const cookedExactMeta = new Map();

    (Array.isArray(entries) ? entries : []).forEach((entry) => {
      const reportDates = Array.isArray(entry.reportDates) ? entry.reportDates : [];
      const sourceIds = Array.isArray(entry.sourceIds) ? entry.sourceIds : [];
      const matchKeys = Array.isArray(entry.matchKeys) ? entry.matchKeys : [];
      const batchCount = Number(entry.batchCount) || Math.max(sourceIds.length, matchKeys.length, 1);
      const matchesDate = reportDates.some((value) => String(value || "").trim() === selectedDate)
        || String(entry.startDate || "").trim() === selectedDate;

      if (!matchesDate) {
        return;
      }

      const matchMeta = {
        sessionId: String(entry.sessionId || "").trim(),
        batchCount
      };

      sourceIds.forEach((value) => {
        const sourceId = String(value || "").trim();
        if (sourceId) {
          cookedSourceIds.add(sourceId);
          if (!cookedSourceMeta.has(sourceId)) {
            cookedSourceMeta.set(sourceId, matchMeta);
          }
        }
      });

      matchKeys.forEach((value) => {
        const exactKey = String(value || "").trim();
        if (exactKey) {
          cookedExactKeys.add(exactKey);
          if (!cookedExactMeta.has(exactKey)) {
            cookedExactMeta.set(exactKey, matchMeta);
          }
        }
      });
    });

    return { cookedSourceIds, cookedExactKeys, cookedSourceMeta, cookedExactMeta };
  }

  function annotatePrepSlots(prepSlots, cookedLookup, pendingLookup) {
    return prepSlots.map((slot) => ({
      ...slot,
      items: (slot.items || []).map((item) => ({
        ...item,
        ...resolveBoardItemState(item, cookedLookup, pendingLookup)
      }))
    }));
  }

  function countCookedItems(prepSlots) {
    return prepSlots.reduce((sum, slot) => (
      sum + (slot.items || []).filter((item) => item.isCooked).length
    ), 0);
  }

  function countPendingItems(prepSlots) {
    return prepSlots.reduce((sum, slot) => (
      sum + (slot.items || []).filter((item) => item.isPending && !item.isCooked).length
    ), 0);
  }

  function buildPendingLookup(cooks, selectedDate) {
    const pendingSourceIds = new Set();
    const pendingExactKeys = new Set();

    (Array.isArray(cooks) ? cooks : []).forEach((cook) => {
      const reportDates = Array.isArray(cook.reportDates) ? cook.reportDates : [];
      const sourceIds = Array.isArray(cook.sourceIds) ? cook.sourceIds : [];
      const matchKeys = Array.isArray(cook.matchKeys) ? cook.matchKeys : [];
      const matchesDate = reportDates.some((value) => String(value || "").trim() === selectedDate)
        || String(cook.reportDate || "").trim() === selectedDate;

      if (!matchesDate) {
        return;
      }

      sourceIds.forEach((value) => {
        const sourceId = String(value || "").trim();
        if (sourceId) pendingSourceIds.add(sourceId);
      });

      matchKeys.forEach((value) => {
        const exactKey = String(value || "").trim();
        if (exactKey) pendingExactKeys.add(exactKey);
      });
    });

    return { pendingSourceIds, pendingExactKeys };
  }

  function sortPrepSlots(prepSlots, mode) {
    return prepSlots.map((slot) => {
      const items = [...(slot.items || [])];
      if (mode !== "dish") {
        return {
          ...slot,
          items: items.sort(compareByTime)
        };
      }

      const earliestPrepByDish = new Map();
      items.forEach((item) => {
        const dishKey = getDishGroupKey(item);
        const nextPrep = Number.isFinite(item.prepSortKey) ? item.prepSortKey : Number.MAX_SAFE_INTEGER;
        const currentPrep = earliestPrepByDish.has(dishKey)
          ? earliestPrepByDish.get(dishKey)
          : Number.MAX_SAFE_INTEGER;
        if (nextPrep < currentPrep) {
          earliestPrepByDish.set(dishKey, nextPrep);
        }
      });

      return {
        ...slot,
        items: items.sort((left, right) => compareByDishThenTime(left, right, earliestPrepByDish))
      };
    });
  }

  function compareByTime(left, right) {
    return (
      compareNumbers(left.prepSortKey, right.prepSortKey) ||
      compareNumbers(left.functionSortKey, right.functionSortKey) ||
      compareText(left.dish, right.dish) ||
      Number(right.hasAlert) - Number(left.hasAlert) ||
      compareText(left.orderNumber, right.orderNumber)
    );
  }

  function compareByDishThenTime(left, right, earliestPrepByDish = new Map()) {
    const leftDishKey = getDishGroupKey(left);
    const rightDishKey = getDishGroupKey(right);
    const leftEarliestPrep = earliestPrepByDish.has(leftDishKey)
      ? earliestPrepByDish.get(leftDishKey)
      : left.prepSortKey;
    const rightEarliestPrep = earliestPrepByDish.has(rightDishKey)
      ? earliestPrepByDish.get(rightDishKey)
      : right.prepSortKey;

    return (
      compareNumbers(leftEarliestPrep, rightEarliestPrep) ||
      compareText(leftDishKey, rightDishKey) ||
      compareNumbers(left.prepSortKey, right.prepSortKey) ||
      compareNumbers(left.functionSortKey, right.functionSortKey) ||
      compareText(left.dishEnglish, right.dishEnglish) ||
      Number(right.hasAlert) - Number(left.hasAlert) ||
      compareText(left.orderNumber, right.orderNumber)
    );
  }

  function compareNumbers(left, right) {
    return (Number.isFinite(left) ? left : Number.MAX_SAFE_INTEGER) - (Number.isFinite(right) ? right : Number.MAX_SAFE_INTEGER);
  }

  function parseTimeValue(value) {
    const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(AM|PM)?$/i);
    if (!match) {
      return Number.MAX_SAFE_INTEGER;
    }
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const period = String(match[3] || "").toUpperCase();
    if (period === "AM" && hour === 12) hour = 0;
    if (period === "PM" && hour !== 12) hour += 12;
    return hour * 60 + minute;
  }

  function compareText(left, right) {
    return String(left || "").localeCompare(String(right || ""));
  }

  function getDishGroupKey(item) {
    return String(item.dishChinese || item.dish || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function resolveBoardItemState(item, cookedLookup, pendingLookup) {
    const cookedMatch = findMatch(
      item,
      cookedLookup.cookedSourceIds,
      cookedLookup.cookedExactKeys,
      cookedLookup.cookedSourceMeta,
      cookedLookup.cookedExactMeta
    );
    const pendingMatch = cookedMatch.matched
      ? { matched: false, reason: "" }
      : findMatch(item, pendingLookup.pendingSourceIds, pendingLookup.pendingExactKeys);

    return {
      isCooked: cookedMatch.matched,
      isPending: pendingMatch.matched,
      doneSessionId: cookedMatch.sessionId || "",
      doneBatchCount: cookedMatch.batchCount || 0,
      cookedMatchReason: cookedMatch.reason,
      pendingMatchReason: pendingMatch.reason
    };
  }

  function findMatch(item, sourceIds, exactKeys, sourceMeta = null, exactMeta = null) {
    const sourceId = String(item.id || "").trim();
    if (sourceId && sourceIds.has(sourceId)) {
      const meta = sourceMeta && sourceMeta.get(sourceId);
      return {
        matched: true,
        reason: "sourceId",
        sessionId: meta && meta.sessionId || "",
        batchCount: meta && meta.batchCount || 0
      };
    }

    const exactKey = buildExactItemKey({
      reportDate: item.reportDate,
      orderNumber: item.orderNumber,
      prepTime: item.prepTime,
      functionTime: item.functionTime,
      qty: item.qty,
      food: item.displayFood || item.dish
    });
    if (exactKey && exactKeys.has(exactKey)) {
      const meta = exactMeta && exactMeta.get(exactKey);
      return {
        matched: true,
        reason: "exactKey",
        sessionId: meta && meta.sessionId || "",
        batchCount: meta && meta.batchCount || 0
      };
    }

    return { matched: false, reason: "", sessionId: "", batchCount: 0 };
  }

  async function undoCookSession(sessionId) {
    const nextSessionId = String(sessionId || "").trim();
    if (!nextSessionId || typeof deleteCookData !== "function") {
      return;
    }

    const matchingEntry = (latestCookedEntries || []).find((entry) => String(entry.sessionId || "").trim() === nextSessionId);
    const batchCount = Number(matchingEntry && matchingEntry.batchCount) || 0;
    const foodLabel = String(matchingEntry && matchingEntry.food || "").trim();
    const message = batchCount > 1
      ? `确定要撤销这整批已完成订单吗？\n\n${foodLabel ? `${foodLabel}\n` : ""}${batchCount} items will be moved out of Done.\n\nAre you sure you want to undo this completed batch?`
      : `确定要撤销这条已完成订单吗？\n\n${foodLabel ? `${foodLabel}\n` : ""}This item will be moved out of Done.\n\nAre you sure you want to undo this completed order?`;
    if (typeof window.confirm === "function" && !window.confirm(message)) {
      return;
    }

    try {
      await deleteCookData(nextSessionId);
      latestCookedEntries = (latestCookedEntries || []).filter((entry) => String(entry.sessionId || "").trim() !== nextSessionId);
      refreshBoardFromCache({ forceFullRender: true });
      if (typeof loadRecent === "function") {
        await loadRecent();
      }
      if (typeof showToast === "function") {
        showToast("↩ 已撤销完成 Undo done entry");
      }
    } catch (error) {
      if (typeof showToast === "function") {
        showToast(error.message || "Could not undo done entry.", "error");
      } else {
        console.error(error);
      }
    }
  }

  function buildFoodKey(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function buildExactItemKey(item) {
    const reportDate = String(item.reportDate || "").trim();
    const orderNumber = String(item.orderNumber || "").trim();
    const prepTime = String(item.prepTime || "").trim();
    const functionTime = String(item.functionTime || "").trim();
    const qty = String(item.qty || "").trim();
    const foodKey = buildFoodKey(item.food || "");

    if (!reportDate || !prepTime || !foodKey) {
      return "";
    }

    return [reportDate, orderNumber, prepTime, functionTime, qty, foodKey].join("||");
  }

  window.addEventListener("load", initAutoOrders);
})();
