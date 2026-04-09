// ============================================================
// UI STATE & ELEMENTS
// ============================================================
let cooks = [];
let globalTimerId = null;
let currentStaff = null;  // 'Alice', 'Bob', 'Charlie' or null
let wakeLock = null;
let nextCookId = Date.now();
const kitchenStation = window.ORDER_MANAGER_KITCHEN_STATION || {
  key: 'combioven',
  title: 'Equipment Temp Monitor',
  pageTitle: '设备温度监控 Equipment Temp Monitor',
  selectorTitle: 'Combi Oven Cooking Log',
  boardTitle: '烤炉订单 Combi Oven Orders',
  sourceLabel: 'combi oven'
};

// BT thermometer target: which cook card receives the next reading
window.btTargetCookId = null;

function createCookId() {
  nextCookId = Math.max(nextCookId + 1, Date.now());
  return nextCookId;
}

// ============================================================
// LOCAL STORAGE PERSISTENCE
// ============================================================
const STORAGE_KEY = `templog_cooks_order_manager_kitchen_${kitchenStation.key}`;
const STAFF_KEY   = `templog_staff_order_manager_kitchen_${kitchenStation.key}`;
const RUNTIME_LOG_KEY = `order_manager_kitchen_runtime_log_${kitchenStation.key}`;
const ENABLE_RUNTIME_LOG = new URLSearchParams(window.location.search).has('debugRuntime');
const LEGACY_COOK_KEYS = [
  'templog_cooks__order_manager_kitchen_combioven_html',
  'templog_cooks__order_manager_kitchen_kitchentemplog_html'
];
const LEGACY_STAFF_KEYS = [
  'templog_staff__order_manager_kitchen_combioven_html',
  'templog_staff__order_manager_kitchen_kitchentemplog_html'
];
const MAX_RUNTIME_LOG_ENTRIES = 200;
const STORAGE_SAVE_DEBOUNCE_MS = 150;
let storageSaveTimer = null;
let runtimeLogRenderTimer = null;
let lastPublishedCookStateSignature = '';

function persistCooksToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cooks));
    if (currentStaff) localStorage.setItem(STAFF_KEY, currentStaff);
  } catch (e) { console.warn('localStorage save failed:', e); }
}

function saveCooksToStorage(options = {}) {
  if (options.immediate) {
    if (storageSaveTimer) {
      clearTimeout(storageSaveTimer);
      storageSaveTimer = null;
    }
    persistCooksToStorage();
    return;
  }
  if (storageSaveTimer) {
    clearTimeout(storageSaveTimer);
  }
  storageSaveTimer = setTimeout(() => {
    storageSaveTimer = null;
    persistCooksToStorage();
  }, STORAGE_SAVE_DEBOUNCE_MS);
}

function readFirstStorageValue(keys) {
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }
  return '';
}

function loadStaffFromStorage() {
  try {
    const savedStaff = localStorage.getItem(STAFF_KEY) || readFirstStorageValue(LEGACY_STAFF_KEYS);
    if (savedStaff) {
      // app.js is loaded mid-page so staff buttons are already in the DOM — call directly
      try { setGlobalStaff(savedStaff); } catch(e) { currentStaff = savedStaff; }
    }
  } catch(e) { console.warn('staff restore failed:', e); }
}

function loadCooksFromStorage() {
  try {
    // Restore staff first so cards render with the correct name
    const savedStaff = localStorage.getItem(STAFF_KEY) || readFirstStorageValue(LEGACY_STAFF_KEYS);
    if (savedStaff && !currentStaff) {
      try { setGlobalStaff(savedStaff); } catch(e) { currentStaff = savedStaff; }
    }

    const raw = localStorage.getItem(STORAGE_KEY) || readFirstStorageValue(LEGACY_COOK_KEYS);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return;
    cooks = saved.map(upgradeCookRecord);
    cooks.forEach(cook => {
      if (cook.startTime && !cook.endTime) {
        cook.timerRunning = true;
      }
    });
    renderActiveCooks();
    if (cooks.some(c => c.startTime && !c.endTime)) startGlobalTimer();
  } catch (e) { console.warn('localStorage load failed:', e); }
}

function readRuntimeLogEntries() {
  if (!ENABLE_RUNTIME_LOG) {
    return [];
  }
  try {
    const raw = localStorage.getItem(RUNTIME_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('runtime log load failed:', error);
    return [];
  }
}

function saveRuntimeLogEntries(entries) {
  if (!ENABLE_RUNTIME_LOG) {
    return;
  }
  try {
    localStorage.setItem(RUNTIME_LOG_KEY, JSON.stringify(entries.slice(-MAX_RUNTIME_LOG_ENTRIES)));
  } catch (error) {
    console.warn('runtime log save failed:', error);
  }
}

function escapeRuntimeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderRuntimeLog() {
  const body = document.getElementById('runtime-log-body');
  const count = document.getElementById('runtime-log-count');
  if (!body || !count) return;

  if (!ENABLE_RUNTIME_LOG) {
    count.textContent = '0';
    body.innerHTML = '<div class="runtime-log-empty">Runtime log disabled.</div>';
    return;
  }

  const entries = readRuntimeLogEntries().slice().reverse();
  count.textContent = `${entries.length}`;

  if (!entries.length) {
    body.innerHTML = '<div class="runtime-log-empty">No runtime events yet.</div>';
    return;
  }

  body.innerHTML = entries.map((entry) => `
    <div class="runtime-log-entry">
      <div class="runtime-log-head">
        <strong>${escapeRuntimeHtml(entry.source)}</strong>
        <span>${escapeRuntimeHtml(entry.event)}</span>
        <time>${escapeRuntimeHtml(entry.time)}</time>
      </div>
      <pre>${escapeRuntimeHtml(JSON.stringify(entry.details || {}, null, 2))}</pre>
    </div>
  `).join('');
}

function scheduleRuntimeLogRender() {
  if (!ENABLE_RUNTIME_LOG) {
    return;
  }
  if (runtimeLogRenderTimer) {
    return;
  }
  runtimeLogRenderTimer = setTimeout(() => {
    runtimeLogRenderTimer = null;
    renderRuntimeLog();
  }, 0);
}

function logRuntime(source, event, details) {
  if (!ENABLE_RUNTIME_LOG) {
    return;
  }
  const now = new Date();
  const entry = {
    source,
    event,
    time: now.toLocaleTimeString('en-SG', { hour12: false }),
    details: details || {}
  };
  const entries = readRuntimeLogEntries();
  entries.push(entry);
  saveRuntimeLogEntries(entries);
  scheduleRuntimeLogRender();
  console.log(`[order-manager][${source}] ${event}`, details || {});
}

window.orderManagerRuntimeLog = logRuntime;
window.clearOrderManagerRuntimeLog = function clearOrderManagerRuntimeLog() {
  if (!ENABLE_RUNTIME_LOG) {
    return;
  }
  saveRuntimeLogEntries([]);
  renderRuntimeLog();
};

// Restore staff from storage separately so it works even when cooks array is empty

// ============================================================
// SCREEN WAKE LOCK - Keep screen on
// ============================================================
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen wake lock activated');
      
      wakeLock.addEventListener('release', () => {
        console.log('Screen wake lock released');
      });
    } else {
      console.log('Wake Lock API not supported');
    }
  } catch (err) {
    console.error('Wake lock request failed:', err);
  }
}

// Re-request wake lock when page becomes visible again
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && wakeLock === null) {
    await requestWakeLock();
  }
});

// Request wake lock on page load
requestWakeLock();

const activeGrid = document.getElementById('active-grid');
const statusEl = document.getElementById('status');
const recentBody = document.getElementById('recent-body');

initializeKitchenStationUi();

function initializeKitchenStationUi() {
  document.title = `${kitchenStation.title} - Multi Cook`;
  const pageTitleEl = document.querySelector('.page-header h1');
  if (pageTitleEl) {
    pageTitleEl.textContent = kitchenStation.pageTitle;
  }
  const recentTitleEl = document.querySelector('#log h3');
  if (recentTitleEl) {
    recentTitleEl.textContent = `最近记录（最后8条） Recent ${kitchenStation.title} Entries (last 8)`;
  }
  initializeKitchenBoardSelector();
}

function initializeKitchenBoardSelector() {
  const selectorWrap = document.getElementById('kitchen-board-selector-wrap');
  const selector = document.getElementById('kitchen-board-selector');
  const stationMap = window.ORDER_MANAGER_KITCHEN_STATIONS || {};
  const stations = Object.values(stationMap);

  if (!selectorWrap || !selector) {
    return;
  }

  if (stations.length < 2) {
    selectorWrap.hidden = true;
    return;
  }

  selectorWrap.hidden = false;
  selector.innerHTML = '';

  stations.forEach((station) => {
    const option = document.createElement('option');
    option.value = station.key;
    option.textContent = station.selectorTitle || station.pageTitle || station.title || station.key;
    option.selected = station.key === kitchenStation.key;
    selector.appendChild(option);
  });

  selector.addEventListener('change', (event) => {
    const nextStation = String(event.target.value || '').trim().toLowerCase();
    const params = new URLSearchParams(window.location.search);
    params.set('station', nextStation);
    const query = params.toString();
    window.location.href = `./kitchentemplog.html${query ? `?${query}` : ''}${window.location.hash || ''}`;
  });
}

function setGlobalStaff(staff) {
  currentStaff = staff;
  document.querySelectorAll('.staff-btn').forEach(btn => {
    btn.classList.remove('staff-selected');
  });
  document.getElementById(`staff-${staff.replace(/\s+/g, '')}`).classList.add('staff-selected');
  statusEl.textContent = `当前厨师：${staff} Current staff: ${staff}`;
  // Only persist the staff selection, not the cooks array
  try { localStorage.setItem(STAFF_KEY, staff); } catch(e) {}
}

// Auto-select the first staff member on page load — only if no staff was restored from storage
function autoSelectFirstStaff() {
  if (currentStaff) return;  // already restored from localStorage — don't overwrite
  const firstStaffBtn = document.querySelector('.staff-btn');
  if (firstStaffBtn) {
    const staffName = firstStaffBtn.textContent.trim();
    // Extract the chef name from the button
    const staffValue = firstStaffBtn.getAttribute('onclick').match(/'([^']+)'/)[1];
    setGlobalStaff(staffValue);
  }
}

// ============================================================
// COOK MANAGEMENT (no data layer calls here - UI only)
// ============================================================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(400px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

window.orderManagerKitchenToast = showToast;
window.getOrderManagerCurrentStaff = function getOrderManagerCurrentStaff() {
  return currentStaff || '';
};

function addNewCook(food) {
  if (!currentStaff) {
    showToast("请先选择厨师！ Please select a staff member first!", "error");
    alert("请先选择厨师。 Please select a staff member first.");
    return;
  }

  const payload = normalizeCookPayload(food);
  addCookPayloadToBoard(payload, {
    allowAlert: true,
    allowToast: true,
    allowRender: true
  });
}

function addCookPayloadToBoard(payload, options = {}) {
  logRuntime('kitchen', 'select-order', {
    sourceId: payload.sourceId,
    food: payload.food,
    reportDate: payload.reportDate,
    orderNumber: payload.orderNumber,
    prepTime: payload.prepTime,
    functionTime: payload.functionTime,
    qty: payload.qty
  });
  const existingCook = findMergeableCook(payload);
  if (existingCook) {
    if (!mergePayloadIntoCook(existingCook, payload)) {
      logRuntime('kitchen', 'skip-duplicate-batch-item', {
        cookId: existingCook.id,
        sourceId: payload.sourceId,
        orderNumber: payload.orderNumber
      });
      if (options.allowToast !== false) {
        showToast(`已在批次中 Already in batch: ${payload.food}`, "error");
      }
      return {
        cook: existingCook,
        added: false,
        duplicate: true
      };
    }
    logRuntime('kitchen', 'merge-into-existing-cook', {
      cookId: existingCook.id,
      sourceId: payload.sourceId,
      batchCount: getCookBatchCount(existingCook),
      orderSummary: buildCookOrderSummary(existingCook)
    });
    if (options.allowRender !== false) {
      renderActiveCooks();
    }
    if (options.allowToast !== false) {
      showToast(`✓ 已合并到批次 Added to batch: ${payload.food}`);
    }
    statusEl.textContent = buildCookCoverageLabel(existingCook)
      ? `已合并批次 Combined batch for ${payload.food} — ${buildCookCoverageLabel(existingCook)}.`
      : `已添加 Added ${payload.food} by ${currentStaff}.`;
    return {
      cook: existingCook,
      added: true,
      duplicate: false
    };
  }

  const id = createCookId();
  const cook = {
    id,
    food: payload.food,
    dishChinese: payload.dishChinese,
    dishEnglish: payload.dishEnglish,
    reportDate: payload.reportDate,
    orderNumber: payload.orderNumber,
    prepTime: payload.prepTime,
    functionTime: payload.functionTime,
    qty: payload.qty,
    eventType: payload.eventType,
    notes: payload.notes,
    batchKey: buildBatchKey(payload),
    batchItems: [normalizeBatchItem(payload)],
    startTime: null,
    endTime: null,
    duration: null,
    temp: '',
    tempLocked: false,
    timerRunning: false
  };
  syncCookBatchSummary(cook);
  cooks.push(cook);
  logRuntime('kitchen', 'create-cook', {
    cookId: cook.id,
    sourceId: payload.sourceId,
    food: cook.food,
    reportDate: cook.reportDate,
    orderNumber: cook.orderNumber,
    qty: cook.qty
  });
  if (options.allowRender !== false) {
    renderActiveCooks();
  }
  if (options.allowToast !== false) {
    showToast(`✓ 已添加 Added: ${payload.food}`);
  }
  statusEl.textContent = `已添加 Added ${payload.food} by ${currentStaff}.`;
  return {
    cook,
    added: true,
    duplicate: false
  };
}

function normalizeCookPayload(food) {
  if (typeof food === 'object' && food) {
    return {
      sourceId: String(food.id || food.sourceId || '').trim(),
      food: String(food.displayFood || food.food || '').trim(),
      dishChinese: String(food.dishChinese || '').trim(),
      dishEnglish: String(food.dishEnglish || '').trim(),
      reportDate: String(food.reportDate || '').trim(),
      orderNumber: String(food.orderNumber || '').trim(),
      prepTime: String(food.prepTime || '').trim(),
      functionTime: String(food.functionTime || '').trim(),
      qty: String(food.qty || '').trim(),
      eventType: String(food.eventType || '').trim(),
      notes: String(food.notes || '').trim()
    };
  }

  return {
    sourceId: '',
    food: String(food || '').trim(),
    dishChinese: '',
    dishEnglish: '',
    reportDate: '',
    orderNumber: '',
    prepTime: '',
    functionTime: '',
    qty: '',
    eventType: '',
    notes: ''
  };
}

function upgradeCookRecord(cook) {
  const upgraded = {
    ...cook,
    batchItems: Array.isArray(cook.batchItems) && cook.batchItems.length
      ? cook.batchItems.map(ensureBatchItem)
      : [normalizeBatchItem({
          sourceId: '',
          food: cook.food || '',
          dishChinese: cook.dishChinese || '',
          dishEnglish: cook.dishEnglish || '',
          reportDate: cook.reportDate || '',
          orderNumber: cook.orderNumber || '',
          prepTime: cook.prepTime || '',
          functionTime: cook.functionTime || '',
          qty: cook.qty || '',
          eventType: cook.eventType || '',
          notes: cook.notes || ''
        })],
    tempLocked: Boolean(cook.tempLocked)
  };
  syncCookBatchSummary(upgraded);
  return upgraded;
}

function normalizeBatchItem(payload) {
  return {
    sourceId: String(payload.sourceId || '').trim(),
    food: String(payload.food || '').trim(),
    orderNumber: String(payload.orderNumber || '').trim(),
    prepTime: String(payload.prepTime || '').trim(),
    functionTime: String(payload.functionTime || '').trim(),
    qty: String(payload.qty || '').trim(),
    qtyNumber: parseInteger(payload.qty),
    eventType: String(payload.eventType || '').trim(),
    notes: String(payload.notes || '').trim(),
    reportDate: String(payload.reportDate || '').trim()
  };
}

function ensureBatchItem(item) {
  return {
    sourceId: String(item.sourceId || '').trim(),
    food: String(item.food || '').trim(),
    orderNumber: String(item.orderNumber || '').trim(),
    prepTime: String(item.prepTime || '').trim(),
    functionTime: String(item.functionTime || '').trim(),
    qty: String(item.qty || '').trim(),
    qtyNumber: Number.isFinite(Number(item.qtyNumber)) ? Number(item.qtyNumber) : parseInteger(item.qty),
    eventType: String(item.eventType || '').trim(),
    notes: String(item.notes || '').trim(),
    reportDate: String(item.reportDate || '').trim()
  };
}

function buildBatchKey(payload) {
  return [
    String(payload.reportDate || '').trim(),
    String(payload.food || '').trim().toLowerCase()
  ].join('||');
}

function findMergeableCook(payload) {
  const batchKey = buildBatchKey(payload);
  return cooks.find((cook) => !cook.endTime && cook.batchKey === batchKey);
}

function mergePayloadIntoCook(cook, payload) {
  const nextItem = normalizeBatchItem(payload);
  const duplicate = (cook.batchItems || []).some((item) => {
    if (nextItem.sourceId) {
      return item.sourceId && item.sourceId === nextItem.sourceId;
    }
    if (!nextItem.orderNumber && !nextItem.prepTime && !nextItem.functionTime && !nextItem.qty) {
      return false;
    }
    return [
      item.orderNumber,
      item.prepTime,
      item.functionTime,
      item.qty
    ].join('||') === [
      nextItem.orderNumber,
      nextItem.prepTime,
      nextItem.functionTime,
      nextItem.qty
    ].join('||');
  });
  if (duplicate) {
    return false;
  }

  cook.batchItems = Array.isArray(cook.batchItems) ? cook.batchItems : [];
  cook.batchItems.push(nextItem);
  syncCookBatchSummary(cook);
  return true;
}

function syncCookBatchSummary(cook) {
  cook.batchItems = Array.isArray(cook.batchItems) ? cook.batchItems.map(ensureBatchItem) : [];
  if (!cook.batchItems.length) {
    cook.batchItems.push(normalizeBatchItem(cook));
  }
  cook.reportDate = cook.reportDate || cook.batchItems[0].reportDate || '';
  cook.batchKey = buildBatchKey(cook);
  cook.orderNumber = getCookOrderNumbers(cook).join(', ');
  cook.qty = formatQtyValue(getCookTotalQty(cook));
  cook.batchCount = getCookBatchCount(cook);
  cook.orderCount = getCookOrderCount(cook);
  cook.sourceIds = getCookSourceIds(cook);
  cook.matchKeys = getCookMatchKeys(cook);
  cook.reportDates = getCookReportDates(cook);
}

function getCookOrderNumbers(cook) {
  return Array.from(new Set((cook.batchItems || [])
    .map((item) => String(item.orderNumber || '').trim())
    .filter(Boolean)));
}

function getCookOrderCount(cook) {
  const orders = getCookOrderNumbers(cook);
  return orders.length || 0;
}

function getCookBatchCount(cook) {
  return Array.isArray(cook.batchItems) && cook.batchItems.length ? cook.batchItems.length : 1;
}

function getCookTotalQty(cook) {
  const total = (cook.batchItems || []).reduce((sum, item) => sum + parseInteger(item.qtyNumber || item.qty), 0);
  if (total > 0) {
    return total;
  }
  return parseInteger(cook.qty);
}

function getCookQtyParts(cook) {
  return (cook.batchItems || [])
    .map((item) => parseInteger(item.qtyNumber || item.qty))
    .filter((value) => value > 0);
}

function getCookSourceIds(cook) {
  const sourceIds = [];
  const seen = new Set();
  for (const item of Array.isArray(cook.batchItems) ? cook.batchItems : []) {
    const sourceId = String(item.sourceId || '').trim();
    if (!sourceId || seen.has(sourceId)) {
      continue;
    }
    seen.add(sourceId);
    sourceIds.push(sourceId);
  }
  return sourceIds;
}

function getCookReportDates(cook) {
  const reportDates = [];
  const seen = new Set();
  for (const item of Array.isArray(cook.batchItems) ? cook.batchItems : []) {
    const reportDate = String(item.reportDate || '').trim();
    if (!reportDate || seen.has(reportDate)) {
      continue;
    }
    seen.add(reportDate);
    reportDates.push(reportDate);
  }
  if (cook.reportDate && !seen.has(cook.reportDate)) {
    reportDates.push(String(cook.reportDate).trim());
  }
  return reportDates;
}

function buildFoodKey(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildCookMatchKey(item) {
  const reportDate = String(item.reportDate || '').trim();
  const orderNumber = String(item.orderNumber || '').trim();
  const prepTime = String(item.prepTime || '').trim();
  const functionTime = String(item.functionTime || '').trim();
  const qty = String(item.qty || '').trim();
  const foodKey = buildFoodKey(item.food || '');

  if (!reportDate || !prepTime || !foodKey) {
    return '';
  }

  return [reportDate, orderNumber, prepTime, functionTime, qty, foodKey].join('||');
}

function getCookMatchKeys(cook) {
  const matchKeys = [];
  const seen = new Set();
  for (const item of Array.isArray(cook.batchItems) ? cook.batchItems : []) {
    const matchKey = buildCookMatchKey(item);
    if (!matchKey || seen.has(matchKey)) {
      continue;
    }
    seen.add(matchKey);
    matchKeys.push(matchKey);
  }
  return matchKeys;
}

function formatQtyValue(value) {
  return value > 0 ? String(value) : '';
}

function formatCookQtyDisplay(cook) {
  const qtyParts = getCookQtyParts(cook);
  if (!qtyParts.length) {
    return cook.qty || '-';
  }

  if (qtyParts.length === 1) {
    return String(qtyParts[0]);
  }

  const total = qtyParts.reduce((sum, value) => sum + value, 0);
  return `${qtyParts.join(' + ')} = ${total}`;
}

function buildCookCoverageLabel(cook) {
  const orderCount = getCookOrderCount(cook);
  const batchCount = getCookBatchCount(cook);
  if (orderCount > 1) {
    return `${orderCount} orders together`;
  }
  if (batchCount > 1) {
    return `${batchCount} batches together`;
  }
  return '';
}

function buildCookOrderSummary(cook) {
  const orderNumbers = getCookOrderNumbers(cook);
  if (orderNumbers.length) {
    return orderNumbers.join(', ');
  }
  return getCookBatchCount(cook) > 1 ? `${getCookBatchCount(cook)} manual batches` : 'Manual batch';
}

// Split "中文 English" food strings into two-line display
function formatFoodName(food) {
  const m = food.match(/^(.+?)\s+([A-Z].*)$/);
  if (m) return `<span class="food-cn">${m[1]}</span><span class="food-en">${m[2]}</span>`;
  return food;
}

function renderCookMeta(cook) {
  const lines = [];
  if (isManualCook(cook)) {
    lines.push(renderManualQtyEditor(cook));
  } else {
    lines.push(`<div class="info-row batch-summary"><strong>数量 Qty:</strong> ${formatCookQtyDisplay(cook)}</div>`);
  }
  if (buildCookCoverageLabel(cook)) {
    lines.push(`<div class="info-row batch-combined"><strong>合并批次 Combined:</strong> ${buildCookCoverageLabel(cook)}</div>`);
  }
  return lines.join('');
}

function isManualCook(cook) {
  const items = Array.isArray(cook.batchItems) ? cook.batchItems : [];
  if (!items.length) {
    return true;
  }
  return items.every((item) => !String(item.sourceId || '').trim());
}

function renderManualQtyEditor(cook) {
  return `
    <div class="manual-qty-row">
      <label class="manual-qty-label" for="manual-qty-${cook.id}">数量 Qty</label>
      <input
        id="manual-qty-${cook.id}"
        class="manual-qty-input"
        type="number"
        min="1"
        step="1"
        inputmode="numeric"
        placeholder="1"
        value="${escapeHtml(cook.qty || '')}"
        oninput="sanitizeNumberInput(this, false);updateManualQty(${cook.id}, this.value);"
      >
    </div>
  `;
}

function renderFinishedCookPanel(cook) {
  return `
    <div class="cook-finished-panel">
      <div class="cook-input-row">
        <label class="cook-input-label">温度 Temp</label>
        ${cook.tempLocked
          ? `<div class="temp-display temp-locked" id="temp-input-${cook.id}"><span class="temp-lock-icon">🔒</span><span class="temp-value">${cook.temp}</span><span class="temp-unit">°C</span></div>`
          : `<div class="temp-display${cook.temp ? ' temp-unlocked' : ''}" id="temp-input-${cook.id}">
              <input type="number" step="0.1" min="0" max="300" inputmode="decimal" placeholder="75.0" value="${cook.temp || ''}" oninput="sanitizeNumberInput(this, true);updateTemp(${cook.id}, this.value);" class="temp-manual-input">
              <span class="temp-unit-static">°C</span>
            </div>`
        }
      </div>
      <div class="cook-finished-qty">
        <span class="cook-finished-qty-label">数量 Qty</span>
        <strong class="cook-finished-qty-value">${formatCookQtyDisplay(cook)}</strong>
      </div>
    </div>
    <button class="save-btn" onclick="saveCook(${cook.id})">✅ 保存 SAVE</button>
  `;
}

function renderActiveCooks(options = {}) {
  activeGrid.innerHTML = '';
  cooks.forEach(cook => {
    const card = document.createElement('div');
    const isTarget = cook.endTime && window.btTargetCookId === cook.id;
    const notStarted = !cook.startTime && !cook.endTime;
    const inProgress = !!(cook.startTime && !cook.endTime);
    const finished = !!cook.endTime;
    const tappable = true;  // all states: tap to start / end / BT-target
    card.className = 'cook-card'
      + (isTarget    ? ' bt-targeted' : '')
      + (notStarted  ? ' not-started' : '')
      + (inProgress  ? ' cooking'     : '')
      + (finished    ? ' finished-card' : '');
    card.innerHTML = `
      ${cook.endTime ? `<button class="corner-btn corner-resume corner-tl" onclick="resumeCook(${cook.id})" title="Resume">&#9654;</button>` : ''}
      ${(notStarted || cook.endTime) ? `<button class="corner-btn corner-cancel corner-tr" onclick="confirmCancelCook(${cook.id})" title="Cancel">&#10005;</button>` : ''}
      <div class="card-tap-zone card-tap-active">
        <h3>${formatFoodName(cook.food)}</h3>
        <div class="timer-display ${cook.endTime ? 'finished' : ''}" id="timer-${cook.id}">
          ${cook.startTime ? formatElapsed(cook) : '未开始 Not started'}
        </div>
        <div class="info-row">
          <strong>厨师 Staff:</strong> ${currentStaff || '(not set)'}
        </div>
        ${renderCookMeta(cook)}
        ${notStarted
          ? '<div class="end-tap-hint" style="color:#27ae60;">🟢 点击开始烹饪 Tap to start cooking</div>'
          : inProgress
            ? '<div class="end-tap-hint">🔴 点击停止烹饪 Tap to end cooking</div>'
            : isTarget
            ? '<div class="bt-target-indicator">targeted · press probe</div>'
            : tappable
              ? cook.tempLocked
                ? '<div class="bt-target-hint">🔄 重新点击以重新锁定 Re-tap to re-lock</div>'
                : '<div class="bt-target-hint">🎯 点击选中 Tap to target</div>'
              : ''
        }
      </div>
      ${cook.endTime ? renderFinishedCookPanel(cook) : ''}      
    `;

    // Attach tap handler via addEventListener (reliable on mobile; inline onclick on divs is not)
    const tapZone = card.querySelector('.card-tap-zone');
    tapZone.addEventListener('click', (e) => {
      if (e.target.closest('button, input')) return;
      const c = cooks.find(x => x.id === cook.id);
      if (!c) return;
      // Not-started: tap starts the cook
      if (!c.startTime && !c.endTime) { startCook(cook.id); return; }
      // In-progress: tap ends the cook
      if (c.startTime && !c.endTime) { endCook(cook.id); return; }
      // Finished: tap to BT-target (unlock first if already locked)
      if (c.tempLocked) { c.tempLocked = false; c.temp = null; }
      setBtTarget(cook.id);
    });

    activeGrid.appendChild(card);
  });
  saveCooksToStorage();
  if (options.publishState !== false) {
    publishCookState();
  }
}

function formatElapsed(cook) {
  if (!cook.startTime) return '未开始 Not started';
  const totalSec = cook.endTime ? cook.duration : Math.floor((Date.now() - cook.startTime) / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2,'0');
  const s = String(totalSec % 60).padStart(2,'0');
  return `${m}:${s}`;
}

function startCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook || cook.startTime) return;
  cook.startTime = Date.now();
  cook.timerRunning = true;
  logRuntime('kitchen', 'start-cook', {
    cookId: cook.id,
    orderSummary: buildCookOrderSummary(cook),
    batchCount: getCookBatchCount(cook)
  });
  renderActiveCooks();
  startGlobalTimer();
  showToast(`🔥 开始烹饪 Started: ${cook.food}`);
  statusEl.textContent = buildCookCoverageLabel(cook)
    ? `开始烹饪 Started ${cook.food} — ${buildCookCoverageLabel(cook)}.`
    : `开始烹饪 Started ${cook.food}.`;
}

window.addNewCookBatchFromOrders = function addNewCookBatchFromOrders(items) {
  if (!currentStaff) {
    showToast("请先选择厨师！ Please select a staff member first!", "error");
    alert("请先选择厨师。 Please select a staff member first.");
    return;
  }

  const sourceItems = Array.isArray(items) ? items : [];
  let targetCook = null;
  let addedCount = 0;
  let duplicateCount = 0;

  sourceItems.forEach((item) => {
    const result = addCookPayloadToBoard(normalizeCookPayload(item), {
      allowToast: false,
      allowRender: false,
      allowAlert: false
    });
    if (!result || !result.cook) {
      return;
    }
    targetCook = result.cook;
    if (result.added) {
      addedCount += 1;
    } else if (result.duplicate) {
      duplicateCount += 1;
    }
  });

  if (!targetCook) {
    return;
  }

  logRuntime('kitchen', 'start-grouped-batch', {
    cookId: targetCook.id,
    food: targetCook.food,
    requestedCount: sourceItems.length,
    addedCount,
    duplicateCount
  });

  if (addedCount === 0 && duplicateCount > 0) {
    showToast(`已在批次中 Already in batch: ${targetCook.food}`);
    statusEl.textContent = buildCookCoverageLabel(targetCook)
      ? `批次已在活动列表中 Batch already active for ${targetCook.food} — ${buildCookCoverageLabel(targetCook)}.`
      : `批次已在活动列表中 Batch already active for ${targetCook.food}.`;
    return;
  }

  renderActiveCooks();
  showToast(`✓ 已加入活动批次 Added ${addedCount} to active batch`);
  if (targetCook.startTime && !targetCook.endTime) {
    statusEl.textContent = buildCookCoverageLabel(targetCook)
      ? `已更新进行中批次 Updated active batch for ${targetCook.food} — ${buildCookCoverageLabel(targetCook)}.`
      : `已更新进行中批次 Updated active batch for ${targetCook.food}.`;
    return;
  }

  statusEl.textContent = buildCookCoverageLabel(targetCook)
    ? `已加入待开始批次 Added queued batch for ${targetCook.food} — ${buildCookCoverageLabel(targetCook)}.`
    : `已加入待开始批次 Added queued batch for ${targetCook.food}.`;
};

function endCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook || !cook.startTime || cook.endTime) return;
  const now = Date.now();
  cook.endTime = now;
  cook.duration = Math.floor((now - cook.startTime) / 1000);
  cook.timerRunning = false;
  logRuntime('kitchen', 'end-cook', {
    cookId: cook.id,
    orderSummary: buildCookOrderSummary(cook),
    durationSeconds: cook.duration
  });
  // Auto-target this card for BT reading and trigger a measurement
  window.btTargetCookId = id;
  if (typeof window.requestBtReadForCook === 'function') window.requestBtReadForCook(id);
  renderActiveCooks();
  checkAllTimers();
}

function resumeCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook || !cook.endTime) return;
  
  // Calculate how long it was cooking before it was stopped
  const elapsedMs = cook.endTime - cook.startTime;
  
  // Reset the start time to now minus the elapsed time
  // This maintains the elapsed cooking time
  cook.startTime = Date.now() - elapsedMs;
  cook.endTime = null;
  cook.duration = null;
  cook.timerRunning = true;
  cook.temp = null;
  cook.tempLocked = false;
  
  renderActiveCooks();
  startGlobalTimer();
  showToast(`🔥 继续烹饪 Resumed: ${cook.food}`);
}

// ============================================================
// BULK ACTIONS - Start/End All Cooks
// ============================================================
function startAllCooks() {
  const unstarted = cooks.filter(c => !c.startTime);
  if (unstarted.length === 0) {
    showToast("没有待开始的烹饪 No cooks to start", "error");
    return;
  }
  
  unstarted.forEach(cook => {
    cook.startTime = Date.now();
    cook.timerRunning = true;
  });
  
  renderActiveCooks();
  startGlobalTimer();
  showToast(`🔥 已开始 ${unstarted.length} 个 Started ${unstarted.length} cook(s)`);
}

function endAllCooks() {
  const running = cooks.filter(c => c.startTime && !c.endTime);
  if (running.length === 0) {
    showToast("没有正在进行的烹饪 No running cooks to end", "error");
    return;
  }
  
  const now = Date.now();
  running.forEach(cook => {
    cook.endTime = now;
    cook.duration = Math.floor((now - cook.startTime) / 1000);
    cook.timerRunning = false;
  });
  
  renderActiveCooks();
  checkAllTimers();
  showToast(`⏹️ 已停止 ${running.length} 个 Ended ${running.length} cook(s)`);
}


function updateTemp(id, value) {
  const cook = cooks.find(c => c.id === id);
  if (cook) cook.temp = value.trim();
}

function updateManualQty(id, value) {
  const cook = cooks.find(c => c.id === id);
  if (!cook) return;

  const normalizedQty = String(value || '').trim();
  cook.qty = normalizedQty;

  if (Array.isArray(cook.batchItems) && cook.batchItems.length) {
    cook.batchItems = cook.batchItems.map((item, index) => {
      if (index !== 0) return item;
      return {
        ...item,
        qty: normalizedQty,
        qtyNumber: parseInteger(normalizedQty)
      };
    });
  }

  syncCookBatchSummary(cook);
  saveCooksToStorage();
}

// Set BT target cook card — re-renders so button states update
function setBtTarget(id) {
  window.btTargetCookId = (window.btTargetCookId === id) ? null : id;
  renderActiveCooks({ publishState: false });
  const label = document.getElementById('bt-target-label');
  if (label) {
    if (window.btTargetCookId !== null) {
      const cook = cooks.find(c => c.id === window.btTargetCookId);
      label.textContent = cook
        ? `🎯 ${cook.food.split(' ').slice(0,4).join(' ')}${buildCookCoverageLabel(cook) ? ` • ${buildCookCoverageLabel(cook)}` : ''}`
        : '🎯 烹饪已选中 Cook targeted';
    } else {
      label.textContent = '自动 — 目标为最后停止的烹饪 Auto — targets last ended cook';
    }
  }
}

// Fill temperature into the targeted cook card only (btTargetCookId, or most recently ended)
// Skips any card that has been locked by the physical button press.
function setLatestCookTemp(value) {
  if (!value) return null;
  const tempValue = String(value).trim();
  // Find target: explicit btTargetCookId (if not locked), otherwise most recently ended unlocked cook
  let cook = null;
  if (window.btTargetCookId !== null) {
    cook = cooks.find(c => c.id === window.btTargetCookId && c.endTime && !c.tempLocked);
  }
  if (!cook) {
    const finished = cooks.filter(c => c.endTime && !c.tempLocked).sort((a, b) => b.endTime - a.endTime);
    cook = finished[0] || null;
  }
  if (!cook) return null;
  cook.temp = tempValue;
  const el = document.getElementById(`temp-input-${cook.id}`);
  if (el) {
    const input = el.querySelector('input[type="number"]');
    if (input) {
      // Update the manual input value so user can see the BT reading
      input.value = tempValue;
      el.className = el.className.replace('temp-locked','').replace('temp-unlocked','').trim() + ' temp-unlocked';
    } else {
      el.className = el.className.replace('temp-locked','').replace('temp-unlocked','').trim() + ' temp-unlocked';
      el.title = '按温度计按键锁定 Press thermometer button to lock';
      el.innerHTML = `<span class="temp-lock-icon">🔓</span><span class="temp-value">${tempValue}</span><span class="temp-unit">°C</span><span class="temp-lock-hint">按按键锁定 Press button to lock</span>`;
    }
  }
  saveCooksToStorage();
  return cook.id;
}

// Lock a cook's temperature so BT reads can no longer overwrite it
function lockCookTemp(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook) return;
  cook.tempLocked = true;
  const el = document.getElementById(`temp-input-${cook.id}`);
  if (el && cook.temp) {
    el.className = el.className.replace('temp-unlocked','').trim() + ' temp-locked';
    el.classList.remove('temp-unlocked');
    el.title = '已锁定 Locked by thermometer button';
    el.innerHTML = `<span class="temp-lock-icon">🔒</span><span class="temp-value">${cook.temp}</span><span class="temp-unit">°C</span>`;
  }
  saveCooksToStorage();
}
window.lockCookTemp = lockCookTemp;

function sanitizeNumberInput(inputEl, allowDecimal) {
  let value = inputEl.value;
  if (allowDecimal) {
    value = value.replace(/[^0-9.]/g, '');
    const firstDot = value.indexOf('.');
    if (firstDot !== -1) {
      value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
    }
  } else {
    value = value.replace(/\D/g, '');
  }
  if (inputEl.value !== value) {
    inputEl.value = value;
  }
}

// saveCook is already global (top-level function declaration → window.saveCook).
// Do NOT re-assign window.saveCook with a wrapper — that creates infinite recursion
// because in the global scope the wrapper's `saveCook` reference resolves back to itself.
async function saveCook(id) {
  try {
    const cook = cooks.find(c => c.id === id);
    if (!cook || !cook.endTime) {
      alert("请先结束烹饪。 Please end cooking first.");
      return;
    }

    // Read directly from DOM for temp.
    const tempInputEl  = document.querySelector(`#temp-input-${id} input`);
    if (tempInputEl  && tempInputEl.value.trim())  cook.temp  = tempInputEl.value.trim();

    if (!cook.temp || isNaN(parseFloat(cook.temp))) {
      alert("请输入有效核心温度。 Enter a valid core temperature.");
      return;
    }
    if (isManualCook(cook) && parseInteger(cook.qty) < 1) {
      alert("请输入有效数量（≥1）。 Enter a valid quantity (≥ 1).");
      return;
    }
    if (!currentStaff) {
      alert("请先选择厨师。 No staff selected. Please choose a chef at the top.");
      return;
    }

    const start = new Date(cook.startTime);
    const end   = new Date(cook.endTime);

    // Use Singapore time for recorded timestamps
    const fmtDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Singapore',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const fmtTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const startDate = fmtDate.format(start);
    const startTime = fmtTime.format(start);
    const endTime   = fmtTime.format(end);

      const savedEntry = await saveCookData({
        food: cook.food,
        orderSummary: buildCookOrderSummary(cook),
        orderNumbers: getCookOrderNumbers(cook),
        batchCount: getCookBatchCount(cook),
        orderCount: getCookOrderCount(cook),
        totalQty: formatQtyValue(getCookTotalQty(cook)),
        batchItems: cook.batchItems || [],
        startDate,
        startTime,
        endTime,
        duration: (cook.duration / 60).toFixed(1),
        temp: cook.temp,
        staff: currentStaff
      });

      await loadRecent();
      logRuntime('kitchen', 'save-cook', {
        cookId: cook.id,
        orderSummary: buildCookOrderSummary(cook),
        batchCount: getCookBatchCount(cook),
        totalQty: formatQtyValue(getCookTotalQty(cook)),
        temp: cook.temp
      });
      window.dispatchEvent(new CustomEvent("order-manager:cook-saved", {
        detail: {
          sessionId: String(savedEntry && savedEntry.sessionId || "").trim(),
          food: cook.food,
          reportDate: startDate,
          batchCount: getCookBatchCount(cook),
          sourceIds: Array.isArray(savedEntry && savedEntry.sourceIds) ? savedEntry.sourceIds : cook.sourceIds,
          matchKeys: Array.isArray(savedEntry && savedEntry.matchKeys) ? savedEntry.matchKeys : cook.matchKeys,
          reportDates: Array.isArray(savedEntry && savedEntry.reportDates) ? savedEntry.reportDates : cook.reportDates
        }
      }));
      if (statusEl) statusEl.textContent = `${cook.food} (Qty ${formatCookQtyDisplay(cook)}) 保存 saved ✓`;

    removeCook(id);
  } catch (err) {
    console.error("saveCook error:", err);
    alert(`保存失败 Save failed:\n${err.message}\n\n请重试 Please try again.`);
  }
}

function confirmCancelCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook) return;
  
  const message = cook.startTime 
    ? `确定要取消 "${cook.food}" 吗？\n\nAre you sure you want to cancel "${cook.food}"?`
    : `确定要删除 "${cook.food}" 吗？\n\nAre you sure you want to remove "${cook.food}"?`;
  
  if (confirm(message)) {
    removeCook(id);
    showToast(`✓ 已删除 Removed: ${cook.food}`);
  }
}

function removeCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (cook) {
    logRuntime('kitchen', 'remove-cook', {
      cookId: cook.id,
      orderSummary: buildCookOrderSummary(cook),
      started: Boolean(cook.startTime),
      ended: Boolean(cook.endTime)
    });
  }
  cooks = cooks.filter(c => c.id !== id);
  renderActiveCooks();
  checkAllTimers();
  saveCooksToStorage();
}

function startGlobalTimer() {
  if (globalTimerId) return;
  globalTimerId = setInterval(() => {
    let anyRunning = false;
    cooks.forEach(cook => {
      if (cook.startTime && !cook.endTime) {
        anyRunning = true;
        const el = document.getElementById(`timer-${cook.id}`);
        if (el) el.textContent = formatElapsed(cook);
      }
    });
    if (!anyRunning) {
      clearInterval(globalTimerId);
      globalTimerId = null;
    }
  }, 1000);
}

function checkAllTimers() {
  const running = cooks.some(c => c.startTime && !c.endTime);
  if (!running && globalTimerId) {
    clearInterval(globalTimerId);
    globalTimerId = null;
  }
}

async function loadRecent() {
  try {
    const entries = await loadRecentCookData();
    const body = document.getElementById('recent-body');
    if (!body) {
      console.warn('Recent entries table not found.');
      return;
    }

      body.innerHTML = '';
      if (!Array.isArray(entries) || entries.length === 0) {
        body.innerHTML = '<tr><td colspan="9">No recent entries</td></tr>';
        return;
      }

      entries.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td class="food-col">${entry.food}</td>
          <td>${entry.orderSummary || 'Manual batch'}</td>
          <td>${entry.startDate}</td>
          <td>${entry.startTime}</td>
          <td>${entry.endTime}</td>
          <td class="small-col">${entry.duration}</td>
          <td class="small-col">${entry.temp}</td>
          <td class="small-col">${entry.staff}</td>
          <td class="small-col">${entry.totalQty || entry.trays || '-'}</td>
        `;
        body.appendChild(row);
      });
  } catch (err) {
    console.error("Error loading recent data:", err);
  }
}

async function exportFullCSV() {
  try {
    const blob = await exportFullCSVData();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order-manager-kitchen-temp-log.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Export error:", err);
    alert(err.message || "Failed to export CSV");
  }
}

// ============================================================
// INITIALIZATION
// ============================================================
// Load persisted cooks immediately (before inline scripts call autoSelectFirstStaff)
// so that autoSelectFirstStaff() cannot overwrite a restored cooks array.
loadStaffFromStorage();   // must run before loadCooks so cards render with correct staff
loadCooksFromStorage();

window.addEventListener('load', () => {
  renderRuntimeLog();
  logRuntime('kitchen', 'page-loaded', { activeCookCount: cooks.length });
  loadRecent();
});

window.addEventListener('beforeunload', () => {
  saveCooksToStorage({ immediate: true });
});

window.addNewCookFromOrder = function addNewCookFromOrder(item) {
  addNewCook(item);
};

function parseInteger(value) {
  const number = Number(String(value || '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function publishCookState() {
  const nextState = cooks.map((cook) => ({
    id: cook.id,
    reportDate: cook.reportDate,
    startTime: cook.startTime,
    endTime: cook.endTime,
    sourceIds: Array.isArray(cook.sourceIds) ? cook.sourceIds : getCookSourceIds(cook),
    matchKeys: Array.isArray(cook.matchKeys) ? cook.matchKeys : getCookMatchKeys(cook),
    reportDates: Array.isArray(cook.reportDates) ? cook.reportDates : getCookReportDates(cook)
  }));
  const nextSignature = JSON.stringify(nextState);
  if (nextSignature === lastPublishedCookStateSignature) {
    return;
  }
  lastPublishedCookStateSignature = nextSignature;
  window.__orderManagerActiveCooks = nextState;
  window.dispatchEvent(new CustomEvent('order-manager:cooks-changed'));
}
