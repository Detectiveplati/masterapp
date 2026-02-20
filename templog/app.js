// ============================================================
// UI STATE & ELEMENTS
// ============================================================
let cooks = [];
let globalTimerId = null;
let currentStaff = null;  // 'Alice', 'Bob', 'Charlie' or null
let wakeLock = null;

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
  statusEl.textContent = `Current staff set to: ${staff}`;
}

// Auto-select the first staff member on page load
function autoSelectFirstStaff() {
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
    showToast("Please select a staff member first!", "error");
    alert("Please select a staff member (Alice, Bob, or Charlie) first.");
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
    trays: '',
    timerRunning: false
  });
  renderActiveCooks();
  showToast(`✓ Added ${food}`);
  statusEl.textContent = `已添加 Added ${food} by ${currentStaff} — 按开始做好准备 press Start when ready.`;
}

function renderActiveCooks() {
  activeGrid.innerHTML = '';
  cooks.forEach(cook => {
    const card = document.createElement('div');
    card.className = 'cook-card';
    card.innerHTML = `
      <h3>${cook.food}</h3>
      <div class="timer-display ${cook.endTime ? 'finished' : ''}" id="timer-${cook.id}">
        ${cook.startTime ? formatElapsed(cook) : '未开始 Not started'}
      </div>
      <div class="info-row">
        <strong>厨师 Staff:</strong> ${currentStaff || '(not set)'}
      </div>
      ${!cook.startTime ? `<button class="start-btn" onclick="startCook(${cook.id})">开始烹饪 START COOKING</button>` : ''}
      ${cook.startTime && !cook.endTime ? `<button class="end-btn" onclick="endCook(${cook.id})">停止烹饪 END COOKING</button>` : ''}
      ${cook.endTime ? `
        <div class="info-row">
          <input type="number" step="0.1" min="0" max="150" inputmode="decimal" placeholder="核心温度 °C" value="${cook.temp}" oninput="sanitizeNumberInput(this, true)" onchange="updateTemp(${cook.id}, this.value)">
          <input type="number" min="1" step="1" inputmode="numeric" placeholder="盘子" value="${cook.trays}" oninput="sanitizeNumberInput(this, false)" onchange="updateTrays(${cook.id}, this.value)">
          <button class="save-btn" onclick="saveCook(${cook.id})">保存 SAVE</button>
          <button class="start-btn" onclick="resumeCook(${cook.id})">继续烹饪 RESUME</button>
        </div>
      ` : ''}
      ${!cook.startTime || cook.endTime ? `<button class="back-btn" onclick="confirmCancelCook(${cook.id})">取消/删除 Cancel / Remove</button>` : ''}
    `;
    activeGrid.appendChild(card);
  });
}

function formatElapsed(cook) {
  if (!cook.startTime) return '未开始 Not started';
  if (cook.endTime) return `${cook.duration} 分钟 min`;
  const sec = Math.floor((Date.now() - cook.startTime) / 1000);
  const m = String(Math.floor(sec / 60)).padStart(2,'0');
  const s = String(sec % 60).padStart(2,'0');
  return `${m}:${s}`;
}

function startCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook || cook.startTime) return;
  cook.startTime = Date.now();
  cook.timerRunning = true;
  renderActiveCooks();
  startGlobalTimer();
  showToast(`🔥 Started cooking: ${cook.food}`);
}

function endCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook || !cook.startTime || cook.endTime) return;
  const now = Date.now();
  cook.endTime = now;
  const sec = (now - cook.startTime) / 1000;
  cook.duration = (sec / 60).toFixed(1);
  cook.timerRunning = false;
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
  
  renderActiveCooks();
  startGlobalTimer();
  showToast(`🔥 Resumed cooking: ${cook.food}`);
}

// ============================================================
// BULK ACTIONS - Start/End All Cooks
// ============================================================
function startAllCooks() {
  const unstarted = cooks.filter(c => !c.startTime);
  if (unstarted.length === 0) {
    showToast("No cooks to start", "error");
    return;
  }
  
  unstarted.forEach(cook => {
    cook.startTime = Date.now();
    cook.timerRunning = true;
  });
  
  renderActiveCooks();
  startGlobalTimer();
  showToast(`🔥 Started ${unstarted.length} cook(s)`);
}

function endAllCooks() {
  const running = cooks.filter(c => c.startTime && !c.endTime);
  if (running.length === 0) {
    showToast("No running cooks to end", "error");
    return;
  }
  
  const now = Date.now();
  running.forEach(cook => {
    cook.endTime = now;
    const sec = (now - cook.startTime) / 1000;
    cook.duration = (sec / 60).toFixed(1);
    cook.timerRunning = false;
  });
  
  renderActiveCooks();
  checkAllTimers();
  showToast(`⏹️ Ended ${running.length} cook(s)`);
}


function updateTemp(id, value) {
  const cook = cooks.find(c => c.id === id);
  if (cook) cook.temp = value.trim();
}

// Set temperature for the most recently finished cook card
function setLatestCookTemp(value) {
  if (!value) return false;
  const tempValue = String(value).trim();
  const lastFinished = [...cooks].reverse().find(c => c.endTime);
  if (!lastFinished) return false;
  lastFinished.temp = tempValue;
  renderActiveCooks();
  return true;
}

function updateTrays(id, value) {
  const cook = cooks.find(c => c.id === id);
  if (cook) cook.trays = value.trim();
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

async function saveCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook || !cook.endTime || !cook.temp || isNaN(parseFloat(cook.temp))) {
    alert("End cooking first and enter valid core temperature.");
    return;
  }
  if (!cook.trays || isNaN(parseInt(cook.trays)) || parseInt(cook.trays) < 1) {
    alert("Please enter a valid number of trays (≥ 1).");
    return;
  }
  if (!currentStaff) {
    alert("No staff selected. Please choose Alice, Bob, or Charlie at the top.");
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

  // Call the data layer instead of directly writing CSV
  try {
    await saveCookData({
      food: cook.food,
      startDate,
      startTime,
      endTime,
      duration: cook.duration,
      temp: cook.temp,
      staff: currentStaff,
      trays: cook.trays
    });

    await loadRecent();
    statusEl.textContent = `${cook.food} (${cook.trays} 盘子 trays) 保存 saved ✓`;
  } catch (err) {
    console.error("Error saving cook data:", err);
    alert("保存失败 Failed to save cook data. 请重试 Please try again.");
    return;
  }

  removeCook(id);
}

function confirmCancelCook(id) {
  const cook = cooks.find(c => c.id === id);
  if (!cook) return;
  
  const message = cook.startTime 
    ? `确定要取消 "${cook.food}" 吗？\n\nAre you sure you want to cancel "${cook.food}"?`
    : `确定要删除 "${cook.food}" 吗？\n\nAre you sure you want to remove "${cook.food}"?`;
  
  if (confirm(message)) {
    removeCook(id);
    showToast(`✓ Removed ${cook.food}`);
  }
}

function removeCook(id) {
  cooks = cooks.filter(c => c.id !== id);
  renderActiveCooks();
  checkAllTimers();
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
// initializeData() is called from HTML with the appropriate CSV filename

window.addEventListener('load', () => {
  loadRecent();
});

