const API_BASE = `${window.location.origin}/api/label-print`;
const BLUETOOTH_RFCOMM_SERVICE_ID = '00001101-0000-1000-8000-00805f9b34fb';
const DIAGNOSTIC_SESSION_KEY = 'label-print-diagnostic-session-id';

const searchInputEl = document.getElementById('search-input');
const clearSearchButtonEl = document.getElementById('clear-search-button');
const searchSummaryEl = document.getElementById('search-summary');
const categoryFilterEl = document.getElementById('category-filter');
const printerSelectEl = document.getElementById('printer-select');
const printerBaudInputEl = document.getElementById('printer-baud-input');
const printerDefaultCutEl = document.getElementById('printer-default-cut');
const printerSetupButtonEl = document.getElementById('printer-setup-button');
const savePrinterButtonEl = document.getElementById('save-printer-button');
const discoverButtonEl = document.getElementById('discover-button');
const connectButtonEl = document.getElementById('connect-button');
const refreshButtonEl = document.getElementById('refresh-button');
const discoverListEl = document.getElementById('discover-list');
const discoverEmptyEl = document.getElementById('discover-empty');
const cardGroupsEl = document.getElementById('card-groups');
const cardsEmptyEl = document.getElementById('cards-empty');
const bridgeStatusEl = document.getElementById('bridge-status');
const bridgeMetaEl = document.getElementById('bridge-meta');
const printerStatusEl = document.getElementById('printer-status');
const printerMetaEl = document.getElementById('printer-meta');
const templateStatusEl = document.getElementById('template-status');
const actionStatusEl = document.getElementById('action-status');
const actionMetaEl = document.getElementById('action-meta');
const testPrintButtonEl = document.getElementById('test-print-button');
const refreshDiagnosticsButtonEl = document.getElementById('refresh-diagnostics-button');
const downloadDiagnosticsButtonEl = document.getElementById('download-diagnostics-button');
const uploadDiagnosticsButtonEl = document.getElementById('upload-diagnostics-button');
const openSiteSettingsButtonEl = document.getElementById('open-site-settings-button');
const forgetPortsButtonEl = document.getElementById('forget-ports-button');
const modalEl = document.getElementById('options-modal');
const printerModalEl = document.getElementById('printer-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalDescriptionEl = document.getElementById('modal-description');
const modalQuantityEl = document.getElementById('modal-quantity');
const modalCutModeEl = document.getElementById('modal-cut-mode');
const modalTemplateEl = document.getElementById('modal-template');
const modalTemplateNumberEl = document.getElementById('modal-template-number');
const modalDimensionsEl = document.getElementById('modal-dimensions');
const previewNameEl = document.getElementById('preview-name');
const previewSubtitleEl = document.getElementById('preview-subtitle');
const previewQuantityEl = document.getElementById('preview-quantity');
const modalPrintButtonEl = document.getElementById('modal-print-button');
const modalCloseButtonEl = document.getElementById('modal-close-button');
const printerModalCloseButtonEl = document.getElementById('printer-modal-close-button');
const reconnectBannerEl = document.getElementById('reconnect-bar');
const reconnectBannerTextEl = document.getElementById('reconnect-bar-text');
const reconnectBannerButtonEl = document.getElementById('reconnect-bar-button');
const toastEl = document.getElementById('toast');
const runtimeLogEl = document.getElementById('runtime-log');
const clearRuntimeLogButtonEl = document.getElementById('clear-runtime-log-button');
const diagSecureContextEl = document.getElementById('diag-secure-context');
const diagOriginEl = document.getElementById('diag-origin');
const diagDisplayModeEl = document.getElementById('diag-display-mode');
const diagDisplayModeMetaEl = document.getElementById('diag-display-mode-meta');
const diagWebSerialEl = document.getElementById('diag-web-serial');
const diagWebSerialMetaEl = document.getElementById('diag-web-serial-meta');
const diagAuthorizedPortsEl = document.getElementById('diag-authorized-ports');
const diagAuthorizedPortsMetaEl = document.getElementById('diag-authorized-ports-meta');
const diagPageStateEl = document.getElementById('diag-page-state');
const diagPageStateMetaEl = document.getElementById('diag-page-state-meta');
const diagLastErrorEl = document.getElementById('diag-last-error');
const diagLastErrorMetaEl = document.getElementById('diag-last-error-meta');
const diagPairingResultEl = document.getElementById('diag-pairing-result');
const diagPairingResultMetaEl = document.getElementById('diag-pairing-result-meta');
const diagBrowserNameEl = document.getElementById('diag-browser-name');
const diagBrowserMetaEl = document.getElementById('diag-browser-meta');

const state = {
  items: [],
  templates: [],
  printers: [],
  authorizedPorts: [],
  quantities: {},
  selectedPrinterId: '',
  activeItem: null,
  pendingPrint: null,
  runtimeLog: [],
  serial: {
    supported: Boolean(navigator.serial),
    port: null,
    info: null,
    connected: false,
    reconnectPromise: null,
    lastError: '',
    lastErrorAt: null,
    lastPairingResult: '',
    lastPairingMeta: '',
    lastPairingAt: null
  }
};

searchInputEl.addEventListener('input', renderItems);
clearSearchButtonEl.addEventListener('click', () => {
  searchInputEl.value = '';
  renderItems();
  searchInputEl.focus();
});
categoryFilterEl.addEventListener('change', renderItems);
printerSelectEl.addEventListener('change', () => {
  state.selectedPrinterId = printerSelectEl.value;
  updatePrinterStatus();
  syncPrinterInputs();
});
printerSetupButtonEl.addEventListener('click', openPrinterModal);
savePrinterButtonEl.addEventListener('click', savePrinterSettings);
discoverButtonEl.addEventListener('click', pairBluetoothPrinter);
connectButtonEl.addEventListener('click', reconnectBluetoothPrinter);
refreshButtonEl.addEventListener('click', loadAll);
testPrintButtonEl.addEventListener('click', requestTestPrint);
refreshDiagnosticsButtonEl.addEventListener('click', refreshDiagnostics);
downloadDiagnosticsButtonEl.addEventListener('click', downloadDiagnosticsSnapshot);
uploadDiagnosticsButtonEl.addEventListener('click', uploadDiagnosticsSnapshot);
openSiteSettingsButtonEl.addEventListener('click', openSiteSettings);
forgetPortsButtonEl.addEventListener('click', forgetAuthorizedPorts);
clearRuntimeLogButtonEl.addEventListener('click', clearRuntimeLog);
reconnectBannerButtonEl.addEventListener('click', async () => {
  appendRuntimeLog('Reconnect banner button clicked', runtimeStateSnapshot());
  reconnectBannerButtonEl.disabled = true;
  reconnectBannerButtonEl.textContent = 'Connecting… / 连接中…';
  reconnectBannerTextEl.textContent = 'Trying saved connection… / 正在尝试已保存的连接…';
  showToast('Connecting to printer… / 正在连接打印机…', { sticky: true });

  // Step 1: silently try the saved authorized port (no picker, no interaction)
  const savedPort = await resolvePreferredPort().catch(() => null);
  if (savedPort) {
    try {
      await connectToPort(savedPort);
      clearSerialError();
      hideReconnectBanner();
      renderAuthorizedPorts();
      updatePrinterStatus();
      updateDiagnostics();
      showToast('Printer connected. / 打印机已连接。');
      retryPendingPrint();
      return;
    } catch (_) {
      // RFCOMM channel is dead after page reload — fall straight through to picker
      await resetSerialStateAfterFailure().catch(() => {});
    }
  }

  // Step 2: open the Bluetooth picker — this is one more tap in Android Chrome's
  // native dialog. No extra steps inside the app needed.
  reconnectBannerTextEl.textContent = 'Select your printer from the list that opens… / 请从打开的列表中选择打印机…';
  reconnectBannerButtonEl.textContent = 'Waiting for selection… / 等待选择…';
  showToast('Looking for printer… choose it from the list. / 正在查找打印机… 请从列表中选择。', { sticky: true });
  try {
    const freshPort = await requestFreshPort();
    await connectToPort(freshPort);
    clearSerialError();
    hideReconnectBanner();
    renderAuthorizedPorts();
    updatePrinterStatus();
    updateDiagnostics();
    showToast('Printer connected. / 打印机已连接。');
    retryPendingPrint();
  } catch (error) {
    console.error('[ReconnectBar]', error);
    setSerialError(error);
    const cancelled = error && (error.name === 'NotFoundError' || /cancel/i.test(error.message));
    showReconnectBanner(cancelled ? 'Cancelled — tap to try again / 已取消，点击重试' : 'Failed — tap to retry / 失败，点击重试');
  }
});
modalCloseButtonEl.addEventListener('click', closeOptionsModal);
printerModalCloseButtonEl.addEventListener('click', closePrinterModal);
modalPrintButtonEl.addEventListener('click', () => {
  if (!state.activeItem) return;
  const quantity = clampQuantity(modalQuantityEl.value);
  state.quantities[state.activeItem._id] = quantity;
  renderItems();
  runPrint(state.activeItem, {
    quantity,
    cutMode: modalCutModeEl.value,
    source: 'options'
  }).finally(closeOptionsModal);
});
modalQuantityEl.addEventListener('input', syncPreviewQuantity);
document.querySelectorAll('[data-close-modal="true"]').forEach((el) => el.addEventListener('click', closeOptionsModal));
document.querySelectorAll('[data-close-printer-modal="true"]').forEach((el) => el.addEventListener('click', closePrinterModal));

initSerialEvents();
document.addEventListener('visibilitychange', updateDiagnostics);
window.addEventListener('focus', updateDiagnostics);
window.addEventListener('pageshow', updateDiagnostics);
appendRuntimeLog('Module boot', runtimeStateSnapshot());
loadAll();

async function loadAll() {
  appendRuntimeLog('loadAll() start', { origin: window.location.origin });
  setAction('Loading / 加载中', 'Refreshing label items, templates, and printer setup. / 正在刷新标签项目、模板和打印机设置。');
  try {
    const [items, templates, printers] = await Promise.all([
      fetchJson(`${API_BASE}/items`),
      fetchJson(`${API_BASE}/templates`),
      fetchJson(`${API_BASE}/printers`)
    ]);
    state.items = Array.isArray(items) ? items : [];
    state.templates = Array.isArray(templates) ? templates : [];
    state.printers = Array.isArray(printers) ? printers : [];
    state.selectedPrinterId = state.selectedPrinterId || (state.printers[0] && state.printers[0]._id) || '';

    state.items.forEach((item) => {
      if (!state.quantities[item._id]) {
        state.quantities[item._id] = clampQuantity(item.defaultQuantity || 1);
      }
    });

    renderPrinterOptions();
    renderCategoryOptions();
    renderItems();
    templateStatusEl.textContent = `${state.templates.length} loaded / 已加载 ${state.templates.length} 个`;
    await refreshBridgeStatus();
    const reconnectResult = await attemptAutoReconnect();
    appendRuntimeLog('loadAll() auto reconnect result', { reconnectResult, serialConnected: state.serial.connected });
    updateDiagnostics();
    renderAuthorizedPorts();
    updatePrinterStatus();
    if (!state.serial.connected) {
      if (reconnectResult === 'failed') {
        showReconnectBanner('Auto-reconnect failed — tap Connect Printer / 自动重连失败，请点击连接打印机');
      } else {
        showReconnectBanner();
      }
    }
    setAction('Ready / 就绪', 'Launcher is ready for Bluetooth printing from this tablet. / 此平板已准备好进行蓝牙打印。');
    appendRuntimeLog('loadAll() complete', runtimeStateSnapshot());
  } catch (error) {
    console.error(error);
    appendRuntimeLog('loadAll() failed', { error: error && (error.message || error.name || String(error)) });
    setAction('Load failed / 加载失败', error.message || 'Could not load label printing data. / 无法加载标签打印数据。');
    showToast(error.message || 'Could not load label printing data. / 无法加载标签打印数据。');
  }
}

function initSerialEvents() {
  if (!navigator.serial) return;
  navigator.serial.addEventListener('connect', async () => {
    appendRuntimeLog('navigator.serial connect event', runtimeStateSnapshot());
    await refreshBridgeStatus();
    updateDiagnostics();
    renderAuthorizedPorts();
    updatePrinterStatus();
  });
  navigator.serial.addEventListener('disconnect', async (event) => {
    appendRuntimeLog('navigator.serial disconnect event', {
      targetMatchesCurrent: state.serial.port === event.target,
      currentPortInfo: safePortInfo(state.serial.port)
    });
    if (state.serial.port === event.target) {
      state.serial.port = null;
      state.serial.info = null;
      state.serial.connected = false;
    }
    await refreshBridgeStatus();
    updateDiagnostics();
    renderAuthorizedPorts();
    updatePrinterStatus();
    showReconnectBanner();
  });
}

function showReconnectBanner(message) {
  reconnectBannerTextEl.textContent = message || 'Not connected — tap to pair / 未连接，点击配对';
  reconnectBannerButtonEl.disabled = false;
  reconnectBannerButtonEl.textContent = '\uD83D\uDDA8\uFE0F Connect Printer / 连接打印机';
  reconnectBannerEl.classList.remove('hidden');
  document.body.classList.add('reconnect-bar-visible');
}

function hideReconnectBanner() {
  reconnectBannerEl.classList.add('hidden');
  document.body.classList.remove('reconnect-bar-visible');
}

function renderPrinterOptions() {
  if (!state.printers.length) {
    printerSelectEl.innerHTML = '<option value="">No printers available / 没有可用打印机</option>';
    return;
  }
  printerSelectEl.innerHTML = state.printers.map((printer) => `
    <option value="${escapeHtml(printer._id)}" ${printer._id === state.selectedPrinterId ? 'selected' : ''}>
      ${escapeHtml(printer.name)} (${escapeHtml(printer.model || 'QL-820NWB')})
    </option>
  `).join('');
  syncPrinterInputs();
}

function renderCategoryOptions() {
  const categories = Array.from(new Set(state.items.map((item) => item.category || 'Uncategorized / 未分类')));
  categoryFilterEl.innerHTML = ['<option value="">All categories / 全部分类</option>']
    .concat(categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`))
    .join('');
}

function renderItems() {
  const q = searchInputEl.value.trim().toLowerCase();
  const category = categoryFilterEl.value.trim();
  const visibleItems = state.items.filter((item) => {
    if (category && item.category !== category) return false;
    if (!q) return true;
    return [item.name, item.description, item.sku, item.barcode].join(' ').toLowerCase().includes(q);
  });

  clearSearchButtonEl.classList.toggle('hidden', !q);
  if (q) {
    searchSummaryEl.textContent = `"${searchInputEl.value.trim()}" ${visibleItems.length} matching item${visibleItems.length === 1 ? '' : 's'} / 共找到 ${visibleItems.length} 个匹配项目`;
    searchSummaryEl.classList.remove('hidden');
  } else {
    searchSummaryEl.classList.add('hidden');
    searchSummaryEl.textContent = '';
  }

  cardsEmptyEl.classList.toggle('hidden', visibleItems.length > 0);
  const groups = visibleItems.reduce((acc, item) => {
    const key = item.category || 'Uncategorized / 未分类';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  cardGroupsEl.innerHTML = Object.keys(groups).sort().map((categoryName) => `
    <section class="group-block">
      <div class="group-title">
        <h3>${escapeHtml(categoryName)}</h3>
        <small>${groups[categoryName].length} item${groups[categoryName].length === 1 ? '' : 's'} / ${groups[categoryName].length} 个项目</small>
      </div>
      <div class="card-grid">
        ${groups[categoryName].map(renderItemCard).join('')}
      </div>
    </section>
  `).join('');

  bindCardEvents();
}

function renderAuthorizedPorts() {
  appendRuntimeLog('renderAuthorizedPorts()', {
    count: state.authorizedPorts.length,
    connected: state.serial.connected
  });
  discoverEmptyEl.classList.toggle('hidden', state.authorizedPorts.length > 0);
  discoverListEl.innerHTML = state.authorizedPorts.map((entry, index) => `
    <article class="job-card">
      <div class="job-row">
        <strong>${escapeHtml(entry.label)}</strong>
        <span class="job-status ${entry.connected ? 'success' : 'queued'}">${entry.connected ? 'Connected / 已连接' : 'Saved access / 已保存授权'}</span>
      </div>
      <div class="job-row">
        <span>${escapeHtml(entry.meta)}</span>
        <button class="btn-secondary connect-port-button" type="button" data-port-index="${index}">${entry.connected ? 'Ready / 就绪' : 'Connect / 连接'}</button>
      </div>
    </article>
  `).join('');

  discoverListEl.querySelectorAll('.connect-port-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const portIndex = Number(button.dataset.portIndex);
      const entry = state.authorizedPorts[portIndex];
      if (!entry || !entry.port) return;
      appendRuntimeLog('Saved port connect button clicked', {
        portIndex,
        label: entry.label,
        info: entry.info || {}
      });
      try {
        await connectToPort(entry.port);
        clearSerialError();
        renderAuthorizedPorts();
        updatePrinterStatus();
        updateDiagnostics();
        showToast('Bluetooth printer connected. / 蓝牙打印机已连接。');
      } catch (error) {
        console.error(error);
        setSerialError(error);
        updateDiagnostics();
        showToast(error.message || 'Could not connect to the Bluetooth printer. / 无法连接蓝牙打印机。');
      }
    });
  });
}

function renderItemCard(item) {
  const template = findTemplate(item.templateKey);
  const cutMode = getDefaultCutMode();
  const printable = Boolean(template);
  const chineseName = item.nameChinese || '';
  const englishName = item.nameEnglish || item.name || '';
  const quantity = getItemQuantity(item._id);
  return `
    <article class="item-card" data-cut-mode="${escapeHtml(cutMode)}" data-printable="${printable ? 'yes' : 'no'}">
      <button class="option-icon-button" type="button" data-action="options" data-item-id="${escapeHtml(item._id)}" aria-label="Options for ${escapeHtml(englishName)} / ${escapeHtml(chineseName || englishName)}">
        <span class="action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 .4 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.27.3.48.65.6 1a1.7 1.7 0 0 0 1 .4H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1 .4 1.7 1.7 0 0 0-.5.6z"/></svg></span>
      </button>
      <div class="item-body" data-item-id="${escapeHtml(item._id)}" title="${printable ? 'Quick print using saved defaults / 使用已保存默认值快速打印' : 'No template is mapped for this item / 此项目未映射模板'}">
        ${chineseName ? `<p class="item-chinese-name">${escapeHtml(chineseName)}</p>` : ''}
        <h3 class="item-english-name">${escapeHtml(englishName)}</h3>
      </div>
      <div class="qty-row">
        <span class="qty-label">Qty / 数量</span>
        <div class="qty-controls">
          <button class="qty-button" type="button" data-action="decrement" data-item-id="${escapeHtml(item._id)}" aria-label="Decrease quantity for ${escapeHtml(englishName)}">-</button>
          <span class="qty-value" aria-live="polite">${quantity}</span>
          <button class="qty-button" type="button" data-action="increment" data-item-id="${escapeHtml(item._id)}" aria-label="Increase quantity for ${escapeHtml(englishName)}">+</button>
        </div>
      </div>
      <button class="print-button" type="button" data-action="print" data-item-id="${escapeHtml(item._id)}" ${printable ? '' : 'disabled'}>${printable ? 'Print / 打印' : 'Unavailable / 不可用'}</button>
    </article>
  `;
}

function bindCardEvents() {
  cardGroupsEl.querySelectorAll('[data-action="decrement"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      changeQuantity(button.dataset.itemId, -1);
    });
  });
  cardGroupsEl.querySelectorAll('[data-action="increment"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      changeQuantity(button.dataset.itemId, 1);
    });
  });
  cardGroupsEl.querySelectorAll('[data-action="print"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = findItem(button.dataset.itemId);
      appendRuntimeLog('Print button clicked', {
        itemId: button.dataset.itemId,
        itemName: item && item.name,
        selectedPrinterId: state.selectedPrinterId,
        serialConnected: state.serial.connected
      });
      if (item) {
        runPrint(item, {
          quantity: getItemQuantity(item._id),
          cutMode: getDefaultCutMode(),
          source: 'card-button'
        });
      }
    });
  });
  cardGroupsEl.querySelectorAll('[data-action="options"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = findItem(button.dataset.itemId);
      if (item) openOptionsModal(item);
    });
  });
  cardGroupsEl.querySelectorAll('.item-body').forEach((body) => {
    body.addEventListener('click', () => {
      const item = findItem(body.dataset.itemId);
      appendRuntimeLog('Item body clicked', {
        itemId: body.dataset.itemId,
        itemName: item && item.name,
        hasTemplate: Boolean(item && findTemplate(item.templateKey))
      });
      if (item && findTemplate(item.templateKey)) {
        runPrint(item, {
          quantity: getItemQuantity(item._id),
          cutMode: getDefaultCutMode(),
          source: 'card-body'
        });
      }
    });
  });
}

function openOptionsModal(item) {
  state.activeItem = item;
  const template = findTemplate(item.templateKey);
  modalTitleEl.textContent = item.name;
  modalDescriptionEl.textContent = 'This tablet sends the stored printer template directly over Bluetooth. The printer applies all label content and rules from its own P-touch template. / 此平板通过蓝牙直接发送已存储的打印机模板，打印机会使用自身的 P-touch 模板应用所有标签内容和规则。';
  modalQuantityEl.value = getItemQuantity(item._id);
  modalCutModeEl.value = item.defaultCutMode || getDefaultCutMode();
  modalTemplateEl.value = template ? template.name : item.templateKey;
  modalTemplateNumberEl.value = template ? String(template.printerTemplateNumber) : '-';
  modalDimensionsEl.textContent = template ? `58 x ${template.heightMm} mm` : '58 x 62 mm';
  previewNameEl.textContent = template ? template.name : item.name;
  previewSubtitleEl.textContent = `Stored printer template #${template ? template.printerTemplateNumber : '-'} / 已存储模板编号 ${template ? template.printerTemplateNumber : '-'}`;
  syncPreviewQuantity();
  modalEl.classList.remove('hidden');
  modalEl.setAttribute('aria-hidden', 'false');
}

function closeOptionsModal() {
  modalEl.classList.add('hidden');
  modalEl.setAttribute('aria-hidden', 'true');
  state.activeItem = null;
}

function openPrinterModal() {
  syncPrinterInputs();
  renderAuthorizedPorts();
  printerModalEl.classList.remove('hidden');
  printerModalEl.setAttribute('aria-hidden', 'false');
  appendRuntimeLog('Printer setup opened', { diagnosticsUploadAvailable: true });
  updateDiagnostics();
}

function closePrinterModal() {
  appendRuntimeLog('Printer setup closed', { diagnosticsUploadAvailable: true });
  printerModalEl.classList.add('hidden');
  printerModalEl.setAttribute('aria-hidden', 'true');
}

function syncPreviewQuantity() {
  previewQuantityEl.textContent = `Qty / 数量 ${clampQuantity(modalQuantityEl.value)}`;
}

function changeQuantity(itemId, delta) {
  const current = getItemQuantity(itemId);
  state.quantities[itemId] = clampQuantity(current + delta);
  renderItems();
}

function getItemQuantity(itemId) {
  return clampQuantity(state.quantities[itemId] || 1);
}

function clampQuantity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(999, Math.round(parsed)));
}

function buildSupportText(item) {
  const parts = [];
  if (item.sku) parts.push(item.sku);
  if (item.barcode) parts.push(item.barcode);
  return parts.join(' · ');
}

async function runPrint(item, options = {}) {
  appendRuntimeLog('runPrint() start', {
    itemId: item && item._id,
    itemName: item && item.name,
    options,
    serialConnected: state.serial.connected,
    selectedPrinterId: state.selectedPrinterId
  });
  const printer = selectedPrinter();
  const template = findTemplate(item.templateKey);
  if (!printer) {
    appendRuntimeLog('runPrint() blocked: no printer selected', runtimeStateSnapshot());
    showToast('Select a printer before printing. / 打印前请先选择打印机。');
    return;
  }
  if (!template) {
    appendRuntimeLog('runPrint() blocked: no template', { itemName: item.name, templateKey: item.templateKey });
    showToast(`Template not found for ${item.name}. / 未找到 ${item.name} 的模板。`);
    return;
  }

  const quantity = clampQuantity(options.quantity || getItemQuantity(item._id));
  const cutMode = options.cutMode === 'no-cut' ? 'no-cut' : 'auto-cut';
  const payload = buildPrintPayload(item, template, quantity, cutMode, printer);

  // If the printer is not connected, queue this job and prompt reconnect.
  // Try one silent reconnect using a saved authorized port before prompting.
  if (!state.serial.connected) {
    state.pendingPrint = { item, options };
    appendRuntimeLog('runPrint() attempting saved-port reconnect', {
      itemName: item.name,
      pendingPrint: true
    });
    const reconnectResult = await attemptSavedPortReconnect({
      actionStatus: 'Reconnecting / 重新连接中',
      actionMeta: `Trying saved printer before printing ${item.name}. / 打印 ${item.name} 前尝试连接已保存的打印机。`,
      toastMessage: `Connecting to printer for ${item.name}… / 正在为 ${item.name} 连接打印机…`
    });
    if (reconnectResult !== 'connected') {
      appendRuntimeLog('runPrint() reconnect did not complete', { reconnectResult, itemName: item.name });
      const message = reconnectResult === 'no-port'
        ? `No saved printer found — tap to connect & print "${item.name}" / 未找到已保存的打印机，点击连接并打印 "${item.name}"`
        : `Reconnect required — tap to connect & print "${item.name}" / 需要重新连接，点击连接并打印 "${item.name}"`;
      showReconnectBanner(message);
      return;
    }
  }

  setAction('Printing / 打印中', `${item.name} · qty ${quantity} · ${cutMode} / ${item.name} · 数量 ${quantity} · ${cutMode === 'no-cut' ? '不切刀' : '自动切刀'}`);

  // Store for auto-retry if the write fails mid-session
  state.pendingPrint = { item, options };

  let writeError = null;
  try {
    appendRuntimeLog('runPrint() sending template', { itemName: item.name, payload });
    await sendTemplateToBluetooth(payload);
  } catch (error) {
    writeError = error;
    console.error(error);
    appendRuntimeLog('runPrint() send failed', { error: error && (error.message || error.name || String(error)) });
    setSerialError(error);
    await resetSerialStateAfterFailure();
    updateDiagnostics();
    setAction('Print failed / 打印失败', error.message || 'Could not print label. / 无法打印标签。');
    showToast(error.message || 'Could not print label. / 无法打印标签。');
    showReconnectBanner('Print failed — tap to reconnect & retry / 打印失败，请点击重新连接并重试');
    await createClientPrintJob({
      item,
      printer,
      template,
      quantity,
      cutMode,
      payload,
      status: 'failed',
      error: error.message || 'Could not print label.',
      bridgeResult: buildBridgeResult(error)
    }).catch(() => {});
  }
  if (writeError) return;
  state.pendingPrint = null;
  clearSerialError();
  try {
    const job = await createClientPrintJob({
      item,
      printer,
      template,
      quantity,
      cutMode,
      payload,
      status: 'success',
      bridgeResult: buildBridgeResult()
    });
    appendRuntimeLog('runPrint() success', { itemName: item.name, jobStatus: job.status });
    setAction('Print complete / 打印完成', `${item.name} · ${job.status}`);
    showToast(`${item.name} printed successfully. / ${item.name} 打印成功。`);
    await loadPrintersOnly();
  } catch (error) {
    console.error(error);
    appendRuntimeLog('runPrint() log request failed after print', { error: error && (error.message || error.name || String(error)) });
    setAction('Print complete / 打印完成', `${item.name} · logged offline / 已离线记录`);
    showToast(`${item.name} printed. Log failed: ${error.message || 'server error'} / ${item.name} 已打印，但记录失败：${error.message || '服务器错误'}`);
  }
}

async function requestTestPrint() {
  appendRuntimeLog('requestTestPrint() start', runtimeStateSnapshot());
  const printer = selectedPrinter();
  const template = findTemplate('template-1') || state.templates[0] || null;
  if (!printer) {
    showToast('Select a printer before running a test print. / 测试打印前请先选择打印机。');
    return;
  }
  if (!template) {
    showToast('No template is available for a test print. / 没有可用于测试打印的模板。');
    return;
  }

  const payload = {
    printerId: printer._id,
    templateKey: template.key,
    printerTemplateNumber: template.printerTemplateNumber,
    copies: 1,
    cutMode: 'auto-cut',
    serialBaudRate: getSerialBaudRate()
  };

  let writeError = null;
  try {
    await sendTemplateToBluetooth(payload);
  } catch (error) {
    writeError = error;
    console.error(error);
    setSerialError(error);
    await resetSerialStateAfterFailure();
    updateDiagnostics();
    setAction('Test print failed / 测试打印失败', error.message || 'Could not run test print. / 无法执行测试打印。');
    showToast(error.message || 'Could not run test print. / 无法执行测试打印。');
    showReconnectBanner('Print failed — tap to reconnect / 打印失败，请点击重新连接');
    await createClientPrintJob({
      printer,
      template,
      quantity: 1,
      cutMode: 'auto-cut',
      payload,
      status: 'failed',
      error: error.message || 'Could not run test print.',
      itemSnapshot: { name: 'Test Print', description: 'Bluetooth printer validation' },
      bridgeResult: { ...buildBridgeResult(error), testPrint: true }
    }).catch(() => {});
  }
  if (writeError) return;
  clearSerialError();
  try {
    await createClientPrintJob({
      printer,
      template,
      quantity: 1,
      cutMode: 'auto-cut',
      payload,
      status: 'success',
      itemSnapshot: { name: 'Test Print', description: 'Bluetooth printer validation' },
      bridgeResult: { ...buildBridgeResult(), testPrint: true }
    });
    setAction('Test print complete / 测试打印完成', 'Bluetooth printer responded from this tablet. / 蓝牙打印机已从此平板响应。');
    showToast('Test print sent successfully. / 测试打印发送成功。');
    await loadPrintersOnly();
  } catch (error) {
    console.error(error);
    setAction('Test print complete / 测试打印完成', 'Printer responded · log failed / 打印机已响应，但记录失败');
    showToast('Test print sent. Log failed: ' + (error.message || 'server error') + ' / 测试打印已发送，但记录失败。');
  }
}

async function pairBluetoothPrinter() {
  appendRuntimeLog('pairBluetoothPrinter() start', runtimeStateSnapshot());
  if (!navigator.serial) {
    setPairingResult(
      'Web Serial unavailable / Web Serial 不可用',
      'This browser does not expose navigator.serial. Use Android Chrome. / 此浏览器未提供 navigator.serial，请使用 Android Chrome。'
    );
    updateDiagnostics();
    showToast('This browser does not support Web Serial. Use Chrome on Android. / 此浏览器不支持 Web Serial，请使用 Android Chrome。');
    return;
  }
  try {
    setPairingResult(
      'Picker opened / 已打开选择器',
      'Waiting for Chrome to return a Bluetooth serial device. / 正在等待 Chrome 返回蓝牙串口设备。'
    );
    updateDiagnostics();
    showToast('Looking for printer… choose it from the list. / 正在查找打印机… 请从列表中选择。', { sticky: true });
    const port = await navigator.serial.requestPort({});
    setPairingResult(
      'Device selected / 已选择设备',
      `Chrome returned a port: ${formatSerialLabel(port && port.getInfo ? port.getInfo() : {})} / Chrome 已返回一个端口`
    );
    await connectToPort(port);
    setAction('Printer paired / 打印机已配对', 'Bluetooth printer access has been granted on this tablet. / 此平板已获得蓝牙打印机访问权限。');
    clearSerialError();
    setPairingResult(
      'Pairing succeeded / 配对成功',
      'Bluetooth serial permission was granted and the port opened successfully. / 蓝牙串口权限已授予，端口已成功打开。'
    );
    renderAuthorizedPorts();
    updatePrinterStatus();
    updateDiagnostics();
    showToast('Bluetooth printer paired. / 蓝牙打印机已配对。');
  } catch (error) {
    if (error && error.name === 'NotFoundError') {
      setPairingResult(
        'No compatible device / 未找到兼容设备',
        'Chrome did not return a serial-capable Bluetooth device. Check browser, permissions, Android pairing, and whether another tablet is already connected. / Chrome 未返回支持串口的蓝牙设备，请检查浏览器、权限、Android 配对，以及是否已有其他平板连接。'
      );
      updateDiagnostics();
      return;
    }
    console.error(error);
    setSerialError(error);
    setPairingResult(
      'Pairing failed / 配对失败',
      `${error && (error.name || 'Error')}: ${error && (error.message || 'Unknown error')} / 配对过程中出现错误`
    );
    updateDiagnostics();
    showToast(error.message || 'Could not pair the Bluetooth printer. / 无法配对蓝牙打印机。');
  }
}

async function reconnectBluetoothPrinter() {
  appendRuntimeLog('reconnectBluetoothPrinter() start', runtimeStateSnapshot());
  try {
    showToast('Connecting to printer… / 正在连接打印机…', { sticky: true });
    await ensureBluetoothConnection({ interactive: true });
    setAction('Printer connected / 打印机已连接', 'Bluetooth printer is ready on this tablet. / 蓝牙打印机已在此平板上就绪。');
    clearSerialError();
    renderAuthorizedPorts();
    updatePrinterStatus();
    updateDiagnostics();
    showToast('Bluetooth printer connected. / 蓝牙打印机已连接。');
  } catch (error) {
    console.error(error);
    await resetSerialStateAfterFailure();
    setSerialError(error);
    updateDiagnostics();
    showToast(buildReconnectErrorMessage(error));
  }
}

async function refreshBridgeStatus() {
  appendRuntimeLog('refreshBridgeStatus() start', runtimeStateSnapshot());

  if (!navigator.serial) {
    state.serial.supported = false;
    bridgeStatusEl.textContent = 'Browser not supported / 浏览器不受支持';
    bridgeMetaEl.textContent = 'Use Android Chrome with Web Serial support. / 请使用支持 Web Serial 的 Android Chrome。';
    state.authorizedPorts = [];
    updateDiagnostics();
    return;
  }

  state.serial.supported = true;
  const ports = await getAuthorizedPorts();
  state.authorizedPorts = ports.map((port) => {
    const info = port.getInfo ? port.getInfo() : {};
    return {
      port,
      info,
      label: formatSerialLabel(info),
      meta: formatSerialMeta(info),
      connected: port === state.serial.port && state.serial.connected
    };
  });

  if (state.serial.connected && state.serial.port) {
    bridgeStatusEl.textContent = 'Bluetooth ready / 蓝牙已就绪';
    bridgeMetaEl.textContent = `${formatSerialLabel(state.serial.info)} · ${getSerialBaudRate()} baud / 波特率 ${getSerialBaudRate()}`;
    updateDiagnostics();
    return;
  }

  bridgeStatusEl.textContent = ports.length ? 'Permission saved / 权限已保存' : 'No printer paired / 未配对打印机';
  bridgeMetaEl.textContent = ports.length
    ? 'Tap Reconnect to open the paired Brother printer. / 点击重新连接以打开已配对的 Brother 打印机。'
    : 'Tap Pair Printer on this tablet to grant Bluetooth serial access. / 在此平板上点击配对打印机以授予蓝牙串口访问权限。';
  updateDiagnostics();
}

function updatePrinterStatus() {
  const printer = selectedPrinter();
  if (!printer) {
    printerStatusEl.textContent = 'No printer selected / 未选择打印机';
    printerMetaEl.textContent = 'Select a printer from the setup widget. / 请在设置窗口中选择打印机。';
    return;
  }

  printerStatusEl.textContent = state.serial.connected
    ? formatSerialLabel(state.serial.info)
    : printer.name;
  printerMetaEl.textContent = state.serial.connected
    ? `${printer.model || 'QL-820NWB'} · Bluetooth serial / 蓝牙串口 · ${getSerialBaudRate()} baud / 波特率 ${getSerialBaudRate()}`
    : `${printer.model || 'QL-820NWB'} · Bluetooth serial / 蓝牙串口 · pair and reconnect on this tablet / 请在此平板上配对并重新连接`;
}

function buildPrintPayload(_item, template, quantity, cutMode, printer) {
  return {
    printerId: printer._id,
    templateKey: template.key,
    printerTemplateNumber: template.printerTemplateNumber,
    copies: quantity,
    cutMode,
    serialBaudRate: getSerialBaudRate()
  };
}

async function savePrinterSettings() {
  const printer = selectedPrinter();
  if (!printer) {
    showToast('Select a printer first. / 请先选择打印机。');
    return;
  }
  try {
    await persistSelectedPrinterSettings();
    syncPrinterInputs();
    updatePrinterStatus();
    await refreshBridgeStatus();
    // Save default cut mode to localStorage so it persists across page loads
    localStorage.setItem('label-print-default-cut', printerDefaultCutEl.value);
    showToast('Bluetooth printer setup saved. / 蓝牙打印机设置已保存。');
    closePrinterModal();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not save printer settings. / 无法保存打印机设置。');
  }
}

function syncPrinterInputs() {
  const printer = selectedPrinter();
  printerBaudInputEl.value = String((printer && printer.serialBaudRate) || 9600);
  printerDefaultCutEl.value = getDefaultCutMode();
}

async function loadPrintersOnly() {
  state.printers = await fetchJson(`${API_BASE}/printers`);
  if (!state.printers.find((printer) => printer._id === state.selectedPrinterId)) {
    state.selectedPrinterId = (state.printers[0] && state.printers[0]._id) || '';
  }
  renderPrinterOptions();
  await refreshBridgeStatus();
  renderAuthorizedPorts();
  updatePrinterStatus();
}

function getDefaultCutMode() {
  const saved = localStorage.getItem('label-print-default-cut');
  return (saved === 'auto-cut' || saved === 'no-cut') ? saved : 'no-cut';
}

function getSerialBaudRate() {
  const parsed = Number(printerBaudInputEl.value);
  if (!Number.isFinite(parsed)) return 9600;
  return Math.max(1, Math.min(921600, Math.round(parsed)));
}

function selectedPrinter() {
  return state.printers.find((printer) => printer._id === state.selectedPrinterId) || null;
}

async function persistSelectedPrinterSettings() {
  const printer = selectedPrinter();
  if (!printer) {
    throw new Error('Select a printer first. / 请先选择打印机。');
  }

  const updated = await fetchJson(`${API_BASE}/printers/${encodeURIComponent(printer._id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serialBaudRate: getSerialBaudRate(),
      bridgeAvailable: state.serial.connected
    })
  });

  const index = state.printers.findIndex((entry) => entry._id === updated._id);
  if (index >= 0) state.printers[index] = updated;
  return updated;
}

function findTemplate(key) {
  return state.templates.find((template) => template.key === key) || null;
}

function findItem(itemId) {
  return state.items.find((item) => item._id === itemId) || null;
}

function setAction(title, message) {
  actionStatusEl.textContent = title;
  actionMetaEl.textContent = message;
}

function showToast(message, options = {}) {
  const sticky = Boolean(options.sticky);
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = null;
  if (!sticky) {
    showToast.timeoutId = setTimeout(() => toastEl.classList.add('hidden'), 3200);
  }
}

function appendRuntimeLog(message, details = null) {
  const timestamp = new Date().toISOString();
  const line = details == null
    ? `[${timestamp}] ${message}`
    : `[${timestamp}] ${message} ${safeStringify(details)}`;
  state.runtimeLog.push(line);
  if (state.runtimeLog.length > 250) {
    state.runtimeLog = state.runtimeLog.slice(-250);
  }
  if (runtimeLogEl) {
    runtimeLogEl.textContent = state.runtimeLog.join('\n');
    runtimeLogEl.scrollTop = runtimeLogEl.scrollHeight;
  }
}

function clearRuntimeLog() {
  state.runtimeLog = [];
  appendRuntimeLog('Runtime log cleared', runtimeStateSnapshot());
}

function runtimeStateSnapshot() {
  return {
    selectedPrinterId: state.selectedPrinterId,
    serialConnected: state.serial.connected,
    pendingPrintItem: state.pendingPrint && state.pendingPrint.item ? state.pendingPrint.item.name : null,
    authorizedPortCount: state.authorizedPorts.length,
    currentPortInfo: safePortInfo(state.serial.port),
    lastError: state.serial.lastError || null
  };
}

function getDiagnosticSessionId() {
  try {
    const existing = localStorage.getItem(DIAGNOSTIC_SESSION_KEY);
    if (existing) return existing;
    const created = `lpdiag-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(DIAGNOSTIC_SESSION_KEY, created);
    return created;
  } catch (_error) {
    return `lpdiag-memory-${Date.now()}`;
  }
}

function buildDiagnosticsPayload(options = {}) {
  const printer = selectedPrinter();
  const includeFullLog = Boolean(options.includeFullLog);
  return {
    source: 'client',
    level: state.serial.lastError ? 'error' : 'info',
    eventType: options.eventType || 'manual-diagnostics-upload',
    message: options.message || 'Manual diagnostics upload from label print setup',
    exportedAt: new Date().toISOString(),
    details: {
      lastPairingResult: state.serial.lastPairingResult || null,
      lastPairingMeta: state.serial.lastPairingMeta || null,
      lastError: state.serial.lastError || null,
      authorizedPorts: state.authorizedPorts.map((entry) => ({
        label: entry.label,
        meta: entry.meta,
        info: entry.info || {}
      })),
      runtimeLogTail: includeFullLog ? state.runtimeLog.slice() : state.runtimeLog.slice(-60),
      selectedPrinter: printer ? {
        id: printer._id,
        name: printer.name,
        model: printer.model,
        serialBaudRate: Number(printer.serialBaudRate) || 9600
      } : null
    },
    device: {
      sessionId: getDiagnosticSessionId(),
      userAgent: navigator.userAgent || '',
      origin: window.location.origin,
      href: window.location.href,
      displayMode: getDisplayMode().label
    },
    runtime: {
      ...runtimeStateSnapshot(),
      webSerialAvailable: Boolean(navigator.serial),
      webBluetoothAvailable: Boolean(navigator.bluetooth),
      secureSite: Boolean(window.isSecureContext)
    }
  };
}

function downloadJsonFile(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function downloadDiagnosticsSnapshot() {
  const payload = buildDiagnosticsPayload({
    includeFullLog: true,
    eventType: 'manual-diagnostics-export',
    message: 'Local diagnostics export from label print setup'
  });
  downloadJsonFile(`label-print-diagnostics-${payload.device.sessionId}.json`, payload);
  appendRuntimeLog('Diagnostics downloaded locally', { sessionId: payload.device.sessionId });
  showToast('Diagnostics downloaded. / 诊断信息已下载。');
}

async function uploadDiagnosticsSnapshot() {
  try {
    uploadDiagnosticsButtonEl.disabled = true;
    uploadDiagnosticsButtonEl.textContent = 'Uploading… / 上传中…';
    updateDiagnostics();

    const payload = buildDiagnosticsPayload();

    await fetchJson(`${API_BASE}/diagnostic-logs`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    appendRuntimeLog('Manual diagnostics uploaded', {
      sessionId: payload.device.sessionId,
      level: payload.level
    });
    showToast('Diagnostics uploaded. / 诊断信息已上传。');
  } catch (error) {
    console.error(error);
    appendRuntimeLog('Manual diagnostics upload failed', { error: error && (error.message || error.name || String(error)) });
    showToast(error.message || 'Could not upload diagnostics. / 无法上传诊断信息。');
  } finally {
    uploadDiagnosticsButtonEl.disabled = false;
    uploadDiagnosticsButtonEl.textContent = 'Upload Diagnostics / 上传诊断';
  }
}

function safePortInfo(port) {
  if (!port) return null;
  try {
    return port.getInfo ? port.getInfo() : { hasGetInfo: false };
  } catch (error) {
    return { infoError: error && (error.message || error.name || String(error)) };
  }
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getAuthorizedPorts() {
  if (!navigator.serial) return [];
  return navigator.serial.getPorts();
}

async function ensureBluetoothConnection(options = {}) {
  appendRuntimeLog('ensureBluetoothConnection() start', {
    interactive: Boolean(options.interactive),
    serialConnected: state.serial.connected
  });
  const interactive = Boolean(options.interactive);
  if (!navigator.serial) {
    throw new Error('This browser does not support Web Serial. Use Chrome on Android. / 此浏览器不支持 Web Serial，请使用 Android Chrome。');
  }
  if (state.serial.port && state.serial.connected) {
    return state.serial.port;
  }

  const port = await resolvePreferredPort();
  appendRuntimeLog('ensureBluetoothConnection() resolved port', {
    portFound: Boolean(port),
    portInfo: safePortInfo(port)
  });
  if (!port) {
    throw new Error(interactive
      ? 'No paired printer found. Tap Pair Printer first. / 未找到已配对的打印机，请先点击配对打印机。'
      : 'No paired printer found. Tap Pair Printer first. / 未找到已配对的打印机，请先点击配对打印机。');
  }

  try {
    await connectToPort(port);
    return port;
  } catch (error) {
    if (interactive && canRetryWithFreshSelection(error)) {
      const refreshedPort = await requestFreshPort().catch((requestError) => {
        if (requestError && requestError.name === 'NotFoundError') return null;
        throw requestError;
      });
      if (refreshedPort) {
        await resetSerialStateAfterFailure();
        await connectToPort(refreshedPort);
        return refreshedPort;
      }
    }
    await resetSerialStateAfterFailure();
    throw new Error(buildReconnectErrorMessage(error));
  }
}

async function attemptSavedPortReconnect(options = {}) {
  appendRuntimeLog('attemptSavedPortReconnect() start', {
    serialConnected: state.serial.connected,
    hasReconnectPromise: Boolean(state.serial.reconnectPromise)
  });
  if (state.serial.connected) return 'connected';
  if (!navigator.serial) return 'unsupported';
  if (state.serial.reconnectPromise) return state.serial.reconnectPromise;

  const reconnectTask = (async () => {
    const { actionStatus = '', actionMeta = '', toastMessage = 'Connecting to printer… / 正在连接打印机…' } = options;
    if (actionStatus) setAction(actionStatus, actionMeta || 'Trying saved Bluetooth printer. / 正在尝试已保存的蓝牙打印机。');
    if (toastMessage) showToast(toastMessage, { sticky: true });

    const port = await resolvePreferredPort();
    appendRuntimeLog('attemptSavedPortReconnect() resolved port', {
      portFound: Boolean(port),
      portInfo: safePortInfo(port)
    });
    if (!port) return 'no-port';

    try {
      await connectToPort(port);
      clearSerialError();
      renderAuthorizedPorts();
      updatePrinterStatus();
      updateDiagnostics();
      return 'connected';
    } catch (error) {
      console.warn('[SavedPortReconnect] Failed:', error && error.name, error && error.message, error);
      appendRuntimeLog('attemptSavedPortReconnect() failed', { error: error && (error.message || error.name || String(error)) });
      setSerialError(error);
      await resetSerialStateAfterFailure();
      updateDiagnostics();
      return 'failed';
    }
  })();

  state.serial.reconnectPromise = reconnectTask;
  try {
    return await reconnectTask;
  } finally {
    state.serial.reconnectPromise = null;
  }
}

async function resolvePreferredPort() {
  const ports = await getAuthorizedPorts();
  const preferredPort = pickPreferredPort(ports);
  console.debug('[resolvePreferredPort] state.serial.port:', state.serial.port, '| getPorts() count:', ports.length, '| preferred:', preferredPort, ports);
  appendRuntimeLog('resolvePreferredPort()', {
    statePort: safePortInfo(state.serial.port),
    browserPortCount: ports.length,
    portInfos: ports.map((port) => safePortInfo(port)),
    chosenPort: safePortInfo(preferredPort)
  });
  return preferredPort;
}

function pickPreferredPort(ports) {
  if (state.serial.port) return state.serial.port;
  if (!Array.isArray(ports) || !ports.length) return null;

  const rfcommPort = ports.find((port) => {
    const info = safePortInfo(port);
    return normalizeBluetoothServiceId(info && info.bluetoothServiceClassId) === BLUETOOTH_RFCOMM_SERVICE_ID;
  });

  return rfcommPort || ports[0] || null;
}

function normalizeBluetoothServiceId(serviceId) {
  return String(serviceId || '').trim().toLowerCase();
}

// Before every print, verify the RFCOMM channel is truly alive by closing and
// re-opening the port.  writer.write() on a zombie Bluetooth port resolves
// silently (Chrome buffers bytes without knowing the link is dead).  The only
// reliable liveness check for a write-only protocol is port.open() —
// it throws NetworkError when the BT link does not exist.
async function verifyConnectionBeforePrint() {
  appendRuntimeLog('verifyConnectionBeforePrint() start', runtimeStateSnapshot());
  if (!navigator.serial) {
    throw new Error('This browser does not support Web Serial. Use Chrome on Android. / 此浏览器不支持 Web Serial，请使用 Android Chrome。');
  }

  if (state.serial.port && state.serial.connected) {
    const port = state.serial.port;
    console.debug('[verifyConnectionBeforePrint] Verifying RFCOMM channel via close+open...');

    // Close with a timeout — a dead channel may cause port.close() to hang
    try {
      await Promise.race([
        port.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 2000))
      ]);
    } catch (_) {
      // Ignore — port may already be gone
    }
    state.serial.port = null;
    state.serial.info = null;
    state.serial.connected = false;

    // Re-open — will throw if the BT radio link is actually dead
    try {
      await port.open({
        baudRate: getSerialBaudRate(),
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });
      state.serial.port = port;
      state.serial.info = port.getInfo ? port.getInfo() : {};
      state.serial.connected = true;
      console.debug('[verifyConnectionBeforePrint] Channel confirmed alive.');
      appendRuntimeLog('verifyConnectionBeforePrint() reopen succeeded', safePortInfo(port));
      return port;
    } catch (openErr) {
      console.warn('[verifyConnectionBeforePrint] Re-open failed — BT link is dead:', openErr.name, openErr.message);
      appendRuntimeLog('verifyConnectionBeforePrint() reopen failed', { error: openErr && (openErr.message || openErr.name || String(openErr)) });
      throw Object.assign(
        new Error('Bluetooth printer disconnected. Tap Connect Printer to reconnect. / 蓝牙打印机已断开，请点击连接打印机重新连接。'),
        { name: 'NetworkError' }
      );
    }
  }

  // Not connected — caller (runPrint) should have blocked before reaching here.
  // This path should not be hit in normal flow.
  throw new Error('Printer not connected. Tap Connect Printer to reconnect. / 打印机未连接，请点击连接打印机重新连接。');
}

function retryPendingPrint() {
  if (!state.pendingPrint) return;
  const { item, options } = state.pendingPrint;
  state.pendingPrint = null;
  appendRuntimeLog('retryPendingPrint()', { itemName: item && item.name, options });
  showToast('Reconnected — retrying print… / 已重新连接，正在重试打印…');
  runPrint(item, options);
}

// Verify that an open BT serial port is truly alive by writing a single null
// byte with a 4-second timeout.  The QL-820NWB silently ignores stray 0x00
// bytes in any mode.  If the RFCOMM channel is a zombie (looks open but the
// radio link died after a page refresh) the write promise will reject, exposing
// the dead connection before the user tries to print.
async function probeBluetoothConnection(port) {
  const target = port || state.serial.port;
  if (!target || !target.writable) return false;
  let writer;
  try {
    writer = target.writable.getWriter();
    await Promise.race([
      writer.write(new Uint8Array([0x00])),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Probe timeout')), 4000)
      )
    ]);
    console.debug('[probeBluetoothConnection] Channel is alive.');
    return true;
  } catch (err) {
    console.warn('[probeBluetoothConnection] Channel appears dead:', err.name, err.message);
    return false;
  } finally {
    try { if (writer) writer.releaseLock(); } catch (_) {}
  }
}

async function requestFreshPort() {
  if (!navigator.serial) return null;
  return navigator.serial.requestPort({});
}

function canRetryWithFreshSelection(error) {
  const message = String(error && (error.message || error.name) || '');
  return /failed to open serial port|networkerror|device has been lost|must be handling a user gesture|bluetooth|rfcomm|connection (refused|reset|lost)|broken pipe|serial port (unavailable|in use)|invalidstate/i.test(message);
}

async function connectToPort(port) {
  appendRuntimeLog('connectToPort() start', { portInfo: safePortInfo(port) });
  if (!port) throw new Error('No Bluetooth serial port was selected. / 未选择蓝牙串口。');
  console.debug('[connectToPort] port info:', port.getInfo ? port.getInfo() : 'getInfo unavailable', '| readable:', !!port.readable, '| writable:', !!port.writable);
  if (state.serial.port && state.serial.port !== port) {
    console.debug('[connectToPort] Different port in state — closing existing port first.');
    await closeCurrentPort().catch(() => {});
  }

  // Always call port.open() — do not skip based on port.readable/port.writable.
  // In installed mode after a page refresh those streams can be non-null but the
  // underlying RFCOMM channel is dead.  open() is the only reliable liveness check.
  try {
    console.debug('[connectToPort] Calling port.open() with baudRate:', getSerialBaudRate());
    await port.open({
      baudRate: getSerialBaudRate(),
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none'
    });
  } catch (error) {
    if (error && error.name === 'InvalidStateError' && port.readable && port.writable) {
      appendRuntimeLog('connectToPort() invalid state, trying clean reopen', safePortInfo(port));
      // Port has zombie streams from a previous page session — Chrome kept the
      // ReadableStream/WritableStream objects alive across the refresh but the
      // RFCOMM link is gone.  Probing by writing a byte is useless because
      // writer.write() always resolves immediately (Chrome buffers the bytes).
      // The only reliable fix: force-cancel the streams, close the port, then
      // reopen — port.open() actually tests the BT stack and will throw if the
      // printer is unreachable.
      console.debug('[connectToPort] InvalidStateError — force-closing zombie streams before reopening...');
      try {
        if (!port.readable.locked) await port.readable.cancel().catch(() => {});
        if (!port.writable.locked) await port.writable.abort().catch(() => {});
        await port.close().catch(() => {});
      } catch (_) { /* ignore — streams may already be dead */ }
      // Reopen fresh — will throw if the BT radio link is actually dead
      console.debug('[connectToPort] Attempting clean reopen after zombie close...');
      await port.open({
        baudRate: getSerialBaudRate(),
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });
      console.debug('[connectToPort] Clean reopen succeeded — zombie resolved.');
      appendRuntimeLog('connectToPort() clean reopen succeeded', safePortInfo(port));
    } else {
      console.debug('[connectToPort] port.open() failed:', error.name, error.message);
      appendRuntimeLog('connectToPort() port.open failed', { error: error && (error.message || error.name || String(error)) });
      throw decorateSerialOpenError(error);
    }
  }

  console.debug('[connectToPort] port.open() succeeded. Marking connected.');
  state.serial.port = port;
  state.serial.info = port.getInfo ? port.getInfo() : {};
  state.serial.connected = true;
  appendRuntimeLog('connectToPort() success', runtimeStateSnapshot());
  hideReconnectBanner();
  await refreshBridgeStatus();
  updateDiagnostics();
}

async function resetSerialStateAfterFailure() {
  appendRuntimeLog('resetSerialStateAfterFailure()', runtimeStateSnapshot());
  await closeCurrentPort().catch(() => {});
  state.authorizedPorts = [];
  await refreshBridgeStatus().catch(() => {});
  renderAuthorizedPorts();
  updatePrinterStatus();
}

async function closeCurrentPort() {
  if (!state.serial.port) return;
  const port = state.serial.port;
  appendRuntimeLog('closeCurrentPort() start', safePortInfo(port));
  try {
    if (port.writable && port.writable.locked) {
      return;
    }
    await port.close();
  } finally {
    state.serial.port = null;
    state.serial.info = null;
    state.serial.connected = false;
    appendRuntimeLog('closeCurrentPort() complete', runtimeStateSnapshot());
    updateDiagnostics();
  }
}

async function attemptAutoReconnect() {
  appendRuntimeLog('attemptAutoReconnect() start', runtimeStateSnapshot());
  console.debug('[AutoReconnect] Starting. navigator.serial:', !!navigator.serial, '| already connected:', state.serial.connected);
  if (!navigator.serial || state.serial.connected) {
    console.debug('[AutoReconnect] Skipped early — serial unsupported or already connected.');
    return state.serial.connected ? 'connected' : 'unsupported';
  }
  const reconnectResult = await attemptSavedPortReconnect({
    actionStatus: 'Reconnecting / 重新连接中',
    actionMeta: 'Trying the saved Bluetooth printer automatically. / 正在自动连接已保存的蓝牙打印机。',
    toastMessage: ''
  });
  if (reconnectResult === 'connected') {
    console.debug('[AutoReconnect] Connected successfully.');
    setAction('Printer connected / 打印机已连接', 'Saved Bluetooth printer reconnected automatically. / 已自动重新连接已保存的蓝牙打印机。');
    return 'connected';
  }
  if (reconnectResult === 'no-port') {
    console.debug('[AutoReconnect] No port found — browser has no authorized Bluetooth ports.');
    return 'no-port';
  }
  console.warn('[AutoReconnect] Failed to reconnect saved Bluetooth printer.');
  return 'failed';
}

async function sendTemplateToBluetooth(payload) {
  const port = await verifyConnectionBeforePrint();
  const bytes = buildPtouchTemplateJob(payload);
  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
  }
}

function buildPtouchTemplateJob(payload) {
  const chunks = [];
  chunks.push(Uint8Array.from([0x1B, 0x69, 0x61, 0x03]));
  chunks.push(asciiBytes('^II'));
  chunks.push(asciiBytes(`^TS${formatTemplateNumber(payload.printerTemplateNumber)}`));
  chunks.push(asciiBytes(`^CN${String(Math.floor(payload.copies / 100) % 10)}${String(Math.floor(payload.copies / 10) % 10)}${String(payload.copies % 10)}`));
  chunks.push(asciiBytes(payload.cutMode === 'no-cut' ? '^CO0010' : '^CO1011'));
  chunks.push(asciiBytes('^FF'));
  return concatUint8Arrays(chunks);
}

async function createClientPrintJob({ item, printer, template, quantity, cutMode, payload, status, error = '', bridgeResult = {}, itemSnapshot = null }) {
  return fetchJson(`${API_BASE}/print-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientHandled: true,
      itemId: item ? item._id : undefined,
      itemSnapshot: itemSnapshot || (item ? { name: item.name, description: item.description || '' } : {}),
      printerId: printer._id,
      templateKey: template.key,
      printerTemplateNumber: template.printerTemplateNumber,
      quantity,
      cutMode,
      payload,
      status,
      error,
      bridgeResult,
      completedAt: new Date().toISOString()
    })
  });
}

function buildBridgeResult(error = null) {
  return {
    transport: 'web-serial-bluetooth',
    serialBaudRate: getSerialBaudRate(),
    portInfo: state.serial.info || {},
    browser: navigator.userAgent,
    error: error ? String(error.message || error) : ''
  };
}

function formatSerialLabel(info) {
  if (!info) return 'Brother Bluetooth Serial / Brother 蓝牙串口';
  if (info.bluetoothServiceClassId) return `Brother RFCOMM ${info.bluetoothServiceClassId} / Brother RFCOMM ${info.bluetoothServiceClassId}`;
  if (info.usbVendorId || info.usbProductId) return `Port / 端口 ${info.usbVendorId || ''}:${info.usbProductId || ''}`;
  return 'Brother Bluetooth Serial / Brother 蓝牙串口';
}

function formatSerialMeta(info) {
  if (!info) return 'Authorized in browser / 已在浏览器中授权';
  const parts = [];
  if (info.bluetoothServiceClassId) parts.push(`service / 服务 ${info.bluetoothServiceClassId}`);
  if (info.usbVendorId) parts.push(`vendor / 厂商 ${info.usbVendorId}`);
  if (info.usbProductId) parts.push(`product / 产品 ${info.usbProductId}`);
  return parts.join(' · ') || 'Authorized in browser / 已在浏览器中授权';
}

function asciiBytes(value) {
  return new TextEncoder().encode(String(value));
}

function concatUint8Arrays(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

async function refreshDiagnostics() {
  try {
    await refreshBridgeStatus();
    renderAuthorizedPorts();
    updatePrinterStatus();
    updateDiagnostics();
    showToast('Diagnostics refreshed. / 诊断信息已刷新。');
  } catch (error) {
    console.error(error);
    setSerialError(error);
    updateDiagnostics();
    showToast(error.message || 'Could not refresh diagnostics. / 无法刷新诊断信息。');
  }
}

async function forgetAuthorizedPorts() {
  if (!navigator.serial) {
    showToast('Web Serial is not available in this browser. / 此浏览器中无法使用 Web Serial。');
    return;
  }

  try {
    const ports = await getAuthorizedPorts();
    await closeCurrentPort().catch(() => {});

    let forgotten = 0;
    for (const port of ports) {
      if (typeof port.forget === 'function') {
        await port.forget();
        forgotten += 1;
      }
    }

    state.authorizedPorts = [];
    clearSerialError();
    await refreshBridgeStatus();
    renderAuthorizedPorts();
    updatePrinterStatus();
    updateDiagnostics();

    if (forgotten > 0) {
      showToast(`Forgot ${forgotten} saved port${forgotten === 1 ? '' : 's'}. Pair Printer again. / 已忘记 ${forgotten} 个已保存端口，请重新配对打印机。`);
    } else {
      showToast('No saved ports could be forgotten here. Remove the device from Chrome or Android Bluetooth settings, then pair again. / 这里没有可忘记的已保存端口，请在 Chrome 或 Android 蓝牙设置中移除设备后重新配对。');
    }
  } catch (error) {
    console.error(error);
    setSerialError(error);
    updateDiagnostics();
    showToast(error.message || 'Could not forget the saved ports. / 无法忘记已保存的端口。');
  }
}

function updateDiagnostics() {
  diagSecureContextEl.textContent = window.isSecureContext ? 'Yes / 是' : 'No / 否';
  diagOriginEl.textContent = window.location.origin;

  const displayMode = getDisplayMode();
  diagDisplayModeEl.textContent = displayMode.label;
  diagDisplayModeMetaEl.textContent = displayMode.meta;

  diagWebSerialEl.textContent = navigator.serial ? 'Available / 可用' : 'Unavailable / 不可用';
  diagWebSerialMetaEl.textContent = navigator.serial
      ? `User agent / 浏览器标识: ${navigator.userAgent.slice(0, 72)}${navigator.userAgent.length > 72 ? '…' : ''}`
      : 'This browser does not expose navigator.serial / 此浏览器未提供 navigator.serial';

  diagAuthorizedPortsEl.textContent = String(state.authorizedPorts.length);
  diagAuthorizedPortsMetaEl.textContent = state.authorizedPorts.length
    ? state.authorizedPorts.map((entry) => entry.label).join(' | ')
    : 'No authorized serial ports returned by the browser / 浏览器未返回任何已授权串口';

  diagPageStateEl.textContent = document.visibilityState === 'visible' ? 'Visible / 可见' : document.visibilityState;
  diagPageStateMetaEl.textContent = `Focused / 已聚焦: ${document.hasFocus() ? 'Yes / 是' : 'No / 否'} · Referrer / 来源: ${document.referrer || 'Direct open / 直接打开'}`;

  diagLastErrorEl.textContent = state.serial.lastError ? 'Captured / 已捕获' : 'None / 无';
  diagLastErrorMetaEl.textContent = state.serial.lastError
    ? `${state.serial.lastErrorAt || ''} ${state.serial.lastError}`.trim()
    : 'No serial errors captured / 未捕获串口错误';

  diagPairingResultEl.textContent = state.serial.lastPairingResult || 'Not attempted / 未尝试';
  diagPairingResultMetaEl.textContent = state.serial.lastPairingMeta
    ? `${state.serial.lastPairingAt || ''} ${state.serial.lastPairingMeta}`.trim()
    : 'No pairing attempt recorded yet / 尚未记录配对尝试';

  const browserInfo = getBrowserDiagnostics();
  diagBrowserNameEl.textContent = browserInfo.title;
  diagBrowserMetaEl.textContent = browserInfo.meta;
}

function getDisplayMode() {
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const minimalUi = window.matchMedia && window.matchMedia('(display-mode: minimal-ui)').matches;
  const fullscreen = window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches;
  const browser = window.matchMedia && window.matchMedia('(display-mode: browser)').matches;
  const navigatorStandalone = typeof navigator.standalone === 'boolean' ? navigator.standalone : null;
  let label = 'Unknown / 未知';
  if (standalone) label = 'Standalone app / 独立应用';
  else if (minimalUi) label = 'Minimal UI / 精简界面';
  else if (fullscreen) label = 'Fullscreen / 全屏';
  else if (browser) label = 'Browser tab / 浏览器标签页';
  const metaParts = [
    `matchMedia: ${label}`,
    `navigator.standalone: ${navigatorStandalone === null ? 'n/a' : navigatorStandalone ? 'true' : 'false'}`
  ];
  return {
    label,
    meta: metaParts.join(' · ')
  };
}

function setSerialError(error) {
  state.serial.lastError = String((error && (error.message || error.name)) || error || 'Unknown serial error / 未知串口错误');
  state.serial.lastErrorAt = new Date().toLocaleString();
}

function clearSerialError() {
  state.serial.lastError = '';
  state.serial.lastErrorAt = null;
}

function setPairingResult(title, meta) {
  state.serial.lastPairingResult = title || '';
  state.serial.lastPairingMeta = meta || '';
  state.serial.lastPairingAt = new Date().toLocaleString();
  appendRuntimeLog('setPairingResult()', {
    title: state.serial.lastPairingResult,
    meta: state.serial.lastPairingMeta
  });
}

function getBrowserDiagnostics() {
  const ua = navigator.userAgent || 'Unknown user agent';
  let browser = 'Unknown browser / 未知浏览器';
  if (/Chrome\/\d+/i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome / Chrome';
  else if (/Edg\//i.test(ua)) browser = 'Edge / Edge';
  else if (/SamsungBrowser\//i.test(ua)) browser = 'Samsung Internet / 三星浏览器';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox / Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari / Safari';

  return {
    title: browser,
    meta: `navigator.serial: ${navigator.serial ? 'yes' : 'no'} · secure site: ${window.isSecureContext ? 'yes' : 'no'} · ua: ${ua.slice(0, 120)}${ua.length > 120 ? '…' : ''}`
  };
}

function openSiteSettings() {
  const target = `chrome://settings/content/siteDetails?site=${encodeURIComponent(window.location.origin)}`;
  const popup = window.open(target, '_blank', 'noopener');
  if (!popup) {
    showToast('Could not open Chrome site settings automatically. Open Chrome settings for this site manually. / 无法自动打开 Chrome 网站设置，请手动打开此站点的 Chrome 设置。');
  }
}

function decorateSerialOpenError(error) {
  const message = String(error && (error.message || error.name) || 'Could not open serial port. / 无法打开串口。');
  if (/failed to open serial port/i.test(message)) {
    return new Error('Failed to open serial port. Bluetooth may have reset. Tap Pair Printer again. / 打开串口失败，蓝牙可能已重置，请再次点击配对打印机。');
  }
  if (/networkerror/i.test(message)) {
    return new Error('Bluetooth connection was interrupted. Turn Bluetooth back on, then tap Pair Printer again. / 蓝牙连接已中断，请重新开启蓝牙后再次点击配对打印机。');
  }
  return error instanceof Error ? error : new Error(message);
}

function buildReconnectErrorMessage(error) {
  const message = String(error && (error.message || error.name) || 'Could not reconnect the Bluetooth printer. / 无法重新连接蓝牙打印机。');
  if (/pair printer again/i.test(message)) return message;
  if (/failed to open serial port/i.test(message)) {
    return 'Failed to reopen the Bluetooth printer after the connection changed. Tap Pair Printer again. / 连接变化后无法重新打开蓝牙打印机，请再次点击配对打印机。';
  }
  return message;
}

function formatTemplateNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '001';
  return String(Math.max(1, Math.min(255, Math.round(parsed)))).padStart(3, '0');
}
