// ============================================================
// UI STATE & ELEMENTS
// ============================================================
let cooks = [];
let globalTimerId = null;
let currentStaff = null;  // 'Alice', 'Bob', 'Charlie' or null
let wakeLock = null;

// BT thermometer target: which cook card receives the next reading
window.btTargetCookId = null;

// ============================================================
// LOCAL STORAGE PERSISTENCE
// ============================================================
const STORAGE_KEY = 'templog_cooks_' + window.location.pathname.replace(/[^a-z0-9]/gi, '_');
const STAFF_KEY   = 'templog_staff_'  + window.location.pathname.replace(/[^a-z0-9]/gi, '_');

function saveCooksToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cooks));
    if (currentStaff) localStorage.setItem(STAFF_KEY, currentStaff);
  } catch (e) { console.warn('localStorage save failed:', e); }
}

function loadStaffFromStorage() {
  try {
    const savedStaff = localStorage.getItem(STAFF_KEY);
    if (savedStaff) {
      setTimeout(() => {
        try { setGlobalStaff(savedStaff); } catch(e) {}
      }, 0);
    }
  } catch(e) { console.warn('staff restore failed:', e); }
}

function loadCooksFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return;
    cooks = saved;
    // Resume running timers: adjust startTime so elapsed time is preserved
    cooks.forEach(cook => {
      if (cook.startTime && !cook.endTime) {
        cook.timerRunning = true;
      }
    });
    renderActiveCooks();
    if (cooks.some(c => c.startTime && !c.endTime)) startGlobalTimer();
    const savedStaff = localStorage.getItem(STAFF_KEY);
    if (savedStaff) {
      // Defer until DOM is ready for staff buttons
      setTimeout(() => {
        try { setGlobalStaff(savedStaff); } catch(e) {}
      }, 0);
    }
  } catch (e) { console.warn('localStorage load failed:', e); }
}

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

function addNewCook(food) {
  if (!currentStaff) {
    showToast("请先选择厨师！ Please select a staff member first!", "error");
    alert("请先选择厨师。 Please select a staff member first.");
    return;
  }

  const id = Date.now();
  cooks.push({
    id,
    food,
    startTime: null,
    endTime: null,
    duration: null,
    temp: '',
    trays: '',    units: '',    timerRunning: false
  });
  renderActiveCooks();
  showToast(`✓ 已添加 Added: ${food}`);
  statusEl.textContent = `已添加 Added ${food} by ${currentStaff} — 点击卡片开始 tap card to start.`;
}

function renderActiveCooks() {
  activeGrid.innerHTML = '';
  cooks.forEach(cook => {
    const card = document.createElement('div');
    const isTarget = cook.endTime && window.btTargetCookId === cook.id;
    const notStarted = !cook.startTime && !cook.endTime;
    const inProgress = !!(cook.startTime && !cook.endTime);
    const tappable = true;  // all states: tap to start / end / BT-target
    card.className = 'cook-card'
      + (isTarget    ? ' bt-targeted' : '')
      + (notStarted  ? ' not-started' : '')
      + (inProgress  ? ' cooking'     : '');
    card.innerHTML = `
      <div class="card-corner-btns">
        ${cook.endTime ? `<button class="corner-btn corner-resume" onclick="resumeCook(${cook.id})" title="Resume">&#9654;</button>` : ''}
        ${(notStarted || cook.endTime) ? `<button class="corner-btn corner-cancel" onclick="confirmCancelCook(${cook.id})" title="Cancel">&#10005;</button>` : ''}
      </div>
      <div class="card-tap-zone card-tap-active">
        <h3>${cook.food}</h3>
        <div class="timer-display ${cook.endTime ? 'finished' : ''}" id="timer-${cook.id}">
          ${cook.startTime ? formatElapsed(cook) : '未开始 Not started'}
        </div>
        <div class="info-row">
          <strong>厨师 Staff:</strong> ${currentStaff || '(not set)'}
        </div>
        ${notStarted
          ? '<div class="end-tap-hint" style="color:#27ae60;">🟢 点击开始烹饪 Tap to start cooking</div>'
          : inProgress
            ? '<div class="end-tap-hint">🔴 点击停止烹饪 Tap to end cooking</div>'
            : isTarget
            ? '<div class="bt-target-indicator">🎯 已选中 — 按探针按键 TARGETED — PRESS PROBE BUTTON</div>'
            : tappable
              ? cook.tempLocked
                ? '<div class="bt-target-hint">🔄 重新点击以重新锁定 Re-tap to re-lock</div>'
                : '<div class="bt-target-hint">🎯 点击选中 Tap to target</div>'
              : ''
        }
      </div>
      ${cook.endTime ? `
        <div class="cook-inputs">
          <div class="cook-inputs-col">
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
          </div>
          <div class="cook-inputs-col">
            <div class="cook-input-row">
              <label class="cook-input-label">盘数 Trays</label>
              <div class="trays-picker" id="trays-input-${cook.id}">
                ${[1,2,3,4,5,6,7,8,9,10].map(n =>
                  `<button class="tray-btn${cook.trays == n ? ' tray-selected' : ''}" onclick="updateTrays(${cook.id},${n});document.querySelectorAll('#trays-input-${cook.id} .tray-btn').forEach(b=>b.classList.remove('tray-selected'));this.classList.add('tray-selected');">${n}</button>`
                ).join('')}
              </div>
            </div>
            <div class="cook-input-row" style="margin-top:4px">
              <label class="cook-input-label">单位 Units</label>
              <div class="units-picker" id="units-input-${cook.id}">
                <button class="unit-btn${cook.units === 'Full GN' ? ' unit-selected' : ''}" onclick="updateUnits(${cook.id},'Full GN');document.querySelectorAll('#units-input-${cook.id} .unit-btn').forEach(b=>b.classList.remove('unit-selected'));this.classList.add('unit-selected');">Full GN</button>
                <button class="unit-btn${cook.units === 'Half GN' ? ' unit-selected' : ''}" onclick="updateUnits(${cook.id},'Half GN');document.querySelectorAll('#units-input-${cook.id} .unit-btn').forEach(b=>b.classList.remove('unit-selected'));this.classList.add('unit-selected');">Half GN</button>
              </div>
            </div>
          </div>
        </div>

        <button class="save-btn" onclick="saveCook(${cook.id})">✅ 保存 SAVE</button>
      ` : ''}      
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
  renderActiveCooks();
  startGlobalTimer();
  showToast(`🔥 开始烹饪 Started: ${cook.food}`);
}

function endCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook || !cook.startTime || cook.endTime) return;
  const now = Date.now();
  cook.endTime = now;
  cook.duration = Math.floor((now - cook.startTime) / 1000);
  cook.timerRunning = false;
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

// Set BT target cook card — re-renders so button states update
function setBtTarget(id) {
  window.btTargetCookId = (window.btTargetCookId === id) ? null : id;
  renderActiveCooks();
  const label = document.getElementById('bt-target-label');
  if (label) {
    if (window.btTargetCookId !== null) {
      const cook = cooks.find(c => c.id === window.btTargetCookId);
      label.textContent = cook ? `🎯 ${cook.food.split(' ').slice(0,4).join(' ')}` : '🎯 烹饪已选中 Cook targeted';
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

function updateTrays(id, value) {
  const cook = cooks.find(c => c.id === id);
  if (cook) cook.trays = String(value).trim();
}

function updateUnits(id, value) {
  const cook = cooks.find(c => c.id === id);
  if (cook) cook.units = value;
}

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

    // Read directly from DOM for temp; trays already stored via updateTrays button taps
    const tempInputEl  = document.querySelector(`#temp-input-${id} input`);
    if (tempInputEl  && tempInputEl.value.trim())  cook.temp  = tempInputEl.value.trim();

    if (!cook.temp || isNaN(parseFloat(cook.temp))) {
      alert("请输入有效核心温度。 Enter a valid core temperature.");
      return;
    }
    if (!cook.trays || isNaN(parseInt(cook.trays)) || parseInt(cook.trays) < 1) {
      alert("请输入有效的盘数（≥1）。 Please enter a valid number of trays (≥ 1).");
      return;
    }
    if (!cook.units) {
      alert("请选择盘型单位。 Please select a tray unit (Full GN / Half GN).");
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

    await saveCookData({
      food: cook.food,
      startDate,
      startTime,
      endTime,
      duration: (cook.duration / 60).toFixed(1),
      temp: cook.temp,
      staff: currentStaff,
      trays: cook.trays,
      units: cook.units || ''
    });

    await loadRecent();
    if (statusEl) statusEl.textContent = `${cook.food} (${cook.trays} × ${cook.units || '盘'}) 保存 saved ✓`;

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
        <td>${entry.startDate}</td>
        <td>${entry.startTime}</td>
        <td>${entry.endTime}</td>
        <td class="small-col">${entry.duration}</td>
        <td class="small-col">${entry.temp}</td>
        <td class="small-col">${entry.staff}</td>
        <td class="small-col">${entry.trays}</td>
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
    a.download = 'deep_fry_cooking_log.csv';
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
loadCooksFromStorage();
loadStaffFromStorage();

window.addEventListener('load', () => {
  loadRecent();
});

