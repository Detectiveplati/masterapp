const API_BASE = `${window.location.origin}/api/label-print`;

const searchInputEl = document.getElementById('search-input');
const clearSearchButtonEl = document.getElementById('clear-search-button');
const searchSummaryEl = document.getElementById('search-summary');
const categoryFilterEl = document.getElementById('category-filter');
const printerSelectEl = document.getElementById('printer-select');
const printerBaudInputEl = document.getElementById('printer-baud-input');
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
const toastEl = document.getElementById('toast');
const diagSecureContextEl = document.getElementById('diag-secure-context');
const diagOriginEl = document.getElementById('diag-origin');
const diagWebSerialEl = document.getElementById('diag-web-serial');
const diagWebSerialMetaEl = document.getElementById('diag-web-serial-meta');
const diagAuthorizedPortsEl = document.getElementById('diag-authorized-ports');
const diagAuthorizedPortsMetaEl = document.getElementById('diag-authorized-ports-meta');
const diagLastErrorEl = document.getElementById('diag-last-error');
const diagLastErrorMetaEl = document.getElementById('diag-last-error-meta');

const state = {
  items: [],
  templates: [],
  printers: [],
  authorizedPorts: [],
  quantities: {},
  selectedPrinterId: '',
  activeItem: null,
  serial: {
    supported: Boolean(navigator.serial),
    port: null,
    info: null,
    connected: false,
    lastError: '',
    lastErrorAt: null
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
forgetPortsButtonEl.addEventListener('click', forgetAuthorizedPorts);
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
loadAll();

async function loadAll() {
  setAction('Loading', 'Refreshing label items, templates, and printer setup.');
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
    templateStatusEl.textContent = `${state.templates.length} loaded`;
    await refreshBridgeStatus();
    updateDiagnostics();
    renderAuthorizedPorts();
    updatePrinterStatus();
    setAction('Ready', 'Launcher is ready for Bluetooth printing from this tablet.');
  } catch (error) {
    console.error(error);
    setAction('Load failed', error.message || 'Could not load label printing data.');
    showToast(error.message || 'Could not load label printing data.');
  }
}

function initSerialEvents() {
  if (!navigator.serial) return;
  navigator.serial.addEventListener('connect', async () => {
    await refreshBridgeStatus();
    updateDiagnostics();
    renderAuthorizedPorts();
    updatePrinterStatus();
  });
  navigator.serial.addEventListener('disconnect', async (event) => {
    if (state.serial.port === event.target) {
      state.serial.port = null;
      state.serial.info = null;
      state.serial.connected = false;
    }
    await refreshBridgeStatus();
    updateDiagnostics();
    renderAuthorizedPorts();
    updatePrinterStatus();
  });
}

function renderPrinterOptions() {
  if (!state.printers.length) {
    printerSelectEl.innerHTML = '<option value="">No printers available</option>';
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
  const categories = Array.from(new Set(state.items.map((item) => item.category || 'Uncategorized')));
  categoryFilterEl.innerHTML = ['<option value="">All categories</option>']
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
    searchSummaryEl.textContent = `${visibleItems.length} matching item${visibleItems.length === 1 ? '' : 's'} for "${searchInputEl.value.trim()}"`;
    searchSummaryEl.classList.remove('hidden');
  } else {
    searchSummaryEl.classList.add('hidden');
    searchSummaryEl.textContent = '';
  }

  cardsEmptyEl.classList.toggle('hidden', visibleItems.length > 0);
  const groups = visibleItems.reduce((acc, item) => {
    const key = item.category || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  cardGroupsEl.innerHTML = Object.keys(groups).sort().map((categoryName) => `
    <section class="group-block">
      <div class="group-title">
        <h3>${escapeHtml(categoryName)}</h3>
        <small>${groups[categoryName].length} item${groups[categoryName].length === 1 ? '' : 's'}</small>
      </div>
      <div class="card-grid">
        ${groups[categoryName].map(renderItemCard).join('')}
      </div>
    </section>
  `).join('');

  bindCardEvents();
}

function renderAuthorizedPorts() {
  discoverEmptyEl.classList.toggle('hidden', state.authorizedPorts.length > 0);
  discoverListEl.innerHTML = state.authorizedPorts.map((entry, index) => `
    <article class="job-card">
      <div class="job-row">
        <strong>${escapeHtml(entry.label)}</strong>
        <span class="job-status ${entry.connected ? 'success' : 'queued'}">${entry.connected ? 'Connected' : 'Saved access'}</span>
      </div>
      <div class="job-row">
        <span>${escapeHtml(entry.meta)}</span>
        <button class="btn-secondary connect-port-button" type="button" data-port-index="${index}">${entry.connected ? 'Ready' : 'Connect'}</button>
      </div>
    </article>
  `).join('');

  discoverListEl.querySelectorAll('.connect-port-button').forEach((button) => {
    button.addEventListener('click', async () => {
      const portIndex = Number(button.dataset.portIndex);
      const entry = state.authorizedPorts[portIndex];
      if (!entry || !entry.port) return;
      try {
        await connectToPort(entry.port);
        clearSerialError();
        renderAuthorizedPorts();
        updatePrinterStatus();
        updateDiagnostics();
        showToast('Bluetooth printer connected.');
      } catch (error) {
        console.error(error);
        setSerialError(error);
        updateDiagnostics();
        showToast(error.message || 'Could not connect to the Bluetooth printer.');
      }
    });
  });
}

function renderItemCard(item) {
  const template = findTemplate(item.templateKey);
  const quantity = getItemQuantity(item._id);
  const cutMode = item.defaultCutMode || 'auto-cut';
  const supportText = buildSupportText(item);
  const printable = Boolean(template);
  return `
    <article class="item-card" data-cut-mode="${escapeHtml(cutMode)}" data-printable="${printable ? 'yes' : 'no'}">
      <div class="item-body" data-item-id="${escapeHtml(item._id)}" title="${printable ? 'Quick print using saved defaults' : 'No template is mapped for this item'}">
        <div class="item-meta">
          <span class="pill">${printable ? (cutMode === 'no-cut' ? 'No cut' : 'Auto cut') : 'No template'}</span>
        </div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description || '')}</p>
        ${supportText ? `<small class="item-support">${escapeHtml(supportText)}</small>` : ''}
      </div>
      <div class="qty-row">
        <div class="qty-controls">
          <button class="qty-button" type="button" data-action="decrement" data-item-id="${escapeHtml(item._id)}">-</button>
          <input class="qty-input" type="number" min="1" max="999" step="1" inputmode="numeric" value="${quantity}" data-item-id="${escapeHtml(item._id)}">
          <button class="qty-button" type="button" data-action="increment" data-item-id="${escapeHtml(item._id)}">+</button>
        </div>
        <span class="cut-label">${escapeHtml(cutMode === 'no-cut' ? 'No cut' : 'Auto cut')}</span>
      </div>
      <div class="item-actions">
        <button class="option-button" type="button" data-action="options" data-item-id="${escapeHtml(item._id)}">Options</button>
        <button class="print-button" type="button" data-action="print" data-item-id="${escapeHtml(item._id)}" ${printable ? '' : 'disabled'}>${printable ? 'Print' : 'Unavailable'}</button>
      </div>
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
  cardGroupsEl.querySelectorAll('.qty-input').forEach((input) => {
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('input', () => {
      state.quantities[input.dataset.itemId] = clampQuantity(input.value);
      input.value = state.quantities[input.dataset.itemId];
    });
  });
  cardGroupsEl.querySelectorAll('[data-action="print"]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = findItem(button.dataset.itemId);
      if (item) {
        runPrint(item, {
          quantity: getItemQuantity(item._id),
          cutMode: item.defaultCutMode || 'auto-cut',
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
      if (item && findTemplate(item.templateKey)) {
        runPrint(item, {
          quantity: getItemQuantity(item._id),
          cutMode: item.defaultCutMode || 'auto-cut',
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
  modalDescriptionEl.textContent = 'This tablet sends the stored printer template directly over Bluetooth. The printer applies all label content and rules from its own P-touch template.';
  modalQuantityEl.value = getItemQuantity(item._id);
  modalCutModeEl.value = item.defaultCutMode || 'auto-cut';
  modalTemplateEl.value = template ? template.name : item.templateKey;
  modalTemplateNumberEl.value = template ? String(template.printerTemplateNumber) : '-';
  modalDimensionsEl.textContent = template ? `58 x ${template.heightMm} mm` : '58 x 62 mm';
  previewNameEl.textContent = template ? template.name : item.name;
  previewSubtitleEl.textContent = `Stored printer template #${template ? template.printerTemplateNumber : '-'}`;
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
}

function closePrinterModal() {
  printerModalEl.classList.add('hidden');
  printerModalEl.setAttribute('aria-hidden', 'true');
}

function syncPreviewQuantity() {
  previewQuantityEl.textContent = `Qty ${clampQuantity(modalQuantityEl.value)}`;
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
  const printer = selectedPrinter();
  const template = findTemplate(item.templateKey);
  if (!printer) {
    showToast('Select a printer before printing.');
    return;
  }
  if (!template) {
    showToast(`Template not found for ${item.name}.`);
    return;
  }

  const quantity = clampQuantity(options.quantity || getItemQuantity(item._id));
  const cutMode = options.cutMode === 'no-cut' ? 'no-cut' : 'auto-cut';
  const payload = buildPrintPayload(item, template, quantity, cutMode, printer);
  setAction('Printing', `${item.name} · qty ${quantity} · ${cutMode}`);

  try {
    await ensureBluetoothConnection();
    await sendTemplateToBluetooth(payload);
    clearSerialError();
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
    setAction('Print complete', `${item.name} · ${job.status}`);
    showToast(`${item.name} printed successfully.`);
    await loadPrintersOnly();
  } catch (error) {
    console.error(error);
    setSerialError(error);
    updateDiagnostics();
    setAction('Print failed', error.message || 'Could not print label.');
    showToast(error.message || 'Could not print label.');
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
}

async function requestTestPrint() {
  const printer = selectedPrinter();
  const template = findTemplate('template-1') || state.templates[0] || null;
  if (!printer) {
    showToast('Select a printer before running a test print.');
    return;
  }
  if (!template) {
    showToast('No template is available for a test print.');
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

  try {
    await ensureBluetoothConnection();
    await sendTemplateToBluetooth(payload);
    clearSerialError();
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
    setAction('Test print complete', 'Bluetooth printer responded from this tablet.');
    showToast('Test print sent successfully.');
    await loadPrintersOnly();
  } catch (error) {
    console.error(error);
    setSerialError(error);
    updateDiagnostics();
    setAction('Test print failed', error.message || 'Could not run test print.');
    showToast(error.message || 'Could not run test print.');
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
}

async function pairBluetoothPrinter() {
  if (!navigator.serial) {
    showToast('This browser does not support Web Serial. Use Chrome on Android.');
    return;
  }
  try {
    const port = await navigator.serial.requestPort({});
    await connectToPort(port);
    setAction('Printer paired', 'Bluetooth printer access has been granted on this tablet.');
    clearSerialError();
    renderAuthorizedPorts();
    updatePrinterStatus();
    updateDiagnostics();
    showToast('Bluetooth printer paired.');
  } catch (error) {
    if (error && error.name === 'NotFoundError') return;
    console.error(error);
    setSerialError(error);
    updateDiagnostics();
    showToast(error.message || 'Could not pair the Bluetooth printer.');
  }
}

async function reconnectBluetoothPrinter() {
  try {
    const ports = await getAuthorizedPorts();
    const port = state.serial.port || ports[0];
    if (!port) {
      showToast('No paired printer found. Tap Pair Printer first.');
      return;
    }
    await connectToPort(port);
    setAction('Printer connected', 'Bluetooth printer is ready on this tablet.');
    clearSerialError();
    renderAuthorizedPorts();
    updatePrinterStatus();
    updateDiagnostics();
    showToast('Bluetooth printer connected.');
  } catch (error) {
    console.error(error);
    await resetSerialStateAfterFailure();
    setSerialError(error);
    updateDiagnostics();
    showToast(buildReconnectErrorMessage(error));
  }
}

async function refreshBridgeStatus() {
  if (!navigator.serial) {
    state.serial.supported = false;
    bridgeStatusEl.textContent = 'Browser not supported';
    bridgeMetaEl.textContent = 'Use Android Chrome with Web Serial support.';
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
    bridgeStatusEl.textContent = 'Bluetooth ready';
    bridgeMetaEl.textContent = `${formatSerialLabel(state.serial.info)} · ${getSerialBaudRate()} baud`;
    updateDiagnostics();
    return;
  }

  bridgeStatusEl.textContent = ports.length ? 'Permission saved' : 'No printer paired';
  bridgeMetaEl.textContent = ports.length
    ? 'Tap Reconnect to open the paired Brother printer.'
    : 'Tap Pair Printer on this tablet to grant Bluetooth serial access.';
  updateDiagnostics();
}

function updatePrinterStatus() {
  const printer = selectedPrinter();
  if (!printer) {
    printerStatusEl.textContent = 'No printer selected';
    printerMetaEl.textContent = 'Select a printer from the setup widget.';
    return;
  }

  printerStatusEl.textContent = state.serial.connected
    ? formatSerialLabel(state.serial.info)
    : printer.name;
  printerMetaEl.textContent = state.serial.connected
    ? `${printer.model || 'QL-820NWB'} · Bluetooth serial · ${getSerialBaudRate()} baud`
    : `${printer.model || 'QL-820NWB'} · Bluetooth serial · pair and reconnect on this tablet`;
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
    showToast('Select a printer first.');
    return;
  }
  try {
    const updated = await fetchJson(`${API_BASE}/printers/${encodeURIComponent(printer._id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connectionType: 'web-serial-bluetooth',
        serialBaudRate: getSerialBaudRate(),
        bridgeAvailable: state.serial.connected
      })
    });
    const index = state.printers.findIndex((entry) => entry._id === updated._id);
    if (index >= 0) state.printers[index] = updated;
    syncPrinterInputs();
    updatePrinterStatus();
    await refreshBridgeStatus();
    showToast('Bluetooth printer setup saved.');
    closePrinterModal();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not save printer settings.');
  }
}

function syncPrinterInputs() {
  const printer = selectedPrinter();
  printerBaudInputEl.value = String((printer && printer.serialBaudRate) || 9600);
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

function getSerialBaudRate() {
  const parsed = Number(printerBaudInputEl.value);
  if (!Number.isFinite(parsed)) return 9600;
  return Math.max(1, Math.min(921600, Math.round(parsed)));
}

function selectedPrinter() {
  return state.printers.find((printer) => printer._id === state.selectedPrinterId) || null;
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

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => toastEl.classList.add('hidden'), 3200);
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

async function ensureBluetoothConnection() {
  if (!navigator.serial) {
    throw new Error('This browser does not support Web Serial. Use Chrome on Android.');
  }
  if (state.serial.port && state.serial.connected) {
    return state.serial.port;
  }
  const ports = await getAuthorizedPorts();
  const port = ports[0];
  if (!port) {
    throw new Error('No paired printer found. Tap Pair Printer first.');
  }
  try {
    await connectToPort(port);
    return port;
  } catch (error) {
    await resetSerialStateAfterFailure();
    throw new Error(buildReconnectErrorMessage(error));
  }
}

async function connectToPort(port) {
  if (!port) throw new Error('No Bluetooth serial port was selected.');
  if (state.serial.port && state.serial.port !== port) {
    await closeCurrentPort().catch(() => {});
  }

  const needsOpen = !port.readable || !port.writable;
  if (needsOpen) {
    try {
      await port.open({
        baudRate: getSerialBaudRate(),
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });
    } catch (error) {
      throw decorateSerialOpenError(error);
    }
  }

  state.serial.port = port;
  state.serial.info = port.getInfo ? port.getInfo() : {};
  state.serial.connected = true;
  await refreshBridgeStatus();
  updateDiagnostics();
}

async function resetSerialStateAfterFailure() {
  await closeCurrentPort().catch(() => {});
  state.authorizedPorts = [];
  await refreshBridgeStatus().catch(() => {});
  renderAuthorizedPorts();
  updatePrinterStatus();
}

async function closeCurrentPort() {
  if (!state.serial.port) return;
  try {
    if (state.serial.port.writable && state.serial.port.writable.locked) {
      return;
    }
    await state.serial.port.close();
  } finally {
    state.serial.port = null;
    state.serial.info = null;
    state.serial.connected = false;
    updateDiagnostics();
  }
}

async function sendTemplateToBluetooth(payload) {
  const port = await ensureBluetoothConnection();
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
  chunks.push(asciiBytes(`^TS0${String(Math.floor(payload.printerTemplateNumber / 10) % 10)}${String(payload.printerTemplateNumber % 10)}`));
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
  if (!info) return 'Brother Bluetooth Serial';
  if (info.bluetoothServiceClassId) return `Brother RFCOMM ${info.bluetoothServiceClassId}`;
  if (info.usbVendorId || info.usbProductId) return `Port ${info.usbVendorId || ''}:${info.usbProductId || ''}`;
  return 'Brother Bluetooth Serial';
}

function formatSerialMeta(info) {
  if (!info) return 'Authorized in browser';
  const parts = [];
  if (info.bluetoothServiceClassId) parts.push(`service ${info.bluetoothServiceClassId}`);
  if (info.usbVendorId) parts.push(`vendor ${info.usbVendorId}`);
  if (info.usbProductId) parts.push(`product ${info.usbProductId}`);
  return parts.join(' · ') || 'Authorized in browser';
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
    showToast('Diagnostics refreshed.');
  } catch (error) {
    console.error(error);
    setSerialError(error);
    updateDiagnostics();
    showToast(error.message || 'Could not refresh diagnostics.');
  }
}

async function forgetAuthorizedPorts() {
  if (!navigator.serial) {
    showToast('Web Serial is not available in this browser.');
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
      showToast(`Forgot ${forgotten} saved port${forgotten === 1 ? '' : 's'}. Pair Printer again.`);
    } else {
      showToast('No saved ports could be forgotten here. Remove the device from Chrome or Android Bluetooth settings, then pair again.');
    }
  } catch (error) {
    console.error(error);
    setSerialError(error);
    updateDiagnostics();
    showToast(error.message || 'Could not forget the saved ports.');
  }
}

function updateDiagnostics() {
  diagSecureContextEl.textContent = window.isSecureContext ? 'Yes' : 'No';
  diagOriginEl.textContent = window.location.origin;

  diagWebSerialEl.textContent = navigator.serial ? 'Available' : 'Unavailable';
  diagWebSerialMetaEl.textContent = navigator.serial
    ? `User agent: ${navigator.userAgent.slice(0, 72)}${navigator.userAgent.length > 72 ? '…' : ''}`
    : 'This browser does not expose navigator.serial';

  diagAuthorizedPortsEl.textContent = String(state.authorizedPorts.length);
  diagAuthorizedPortsMetaEl.textContent = state.authorizedPorts.length
    ? state.authorizedPorts.map((entry) => entry.label).join(' | ')
    : 'No authorized serial ports returned by the browser';

  diagLastErrorEl.textContent = state.serial.lastError ? 'Captured' : 'None';
  diagLastErrorMetaEl.textContent = state.serial.lastError
    ? `${state.serial.lastErrorAt || ''} ${state.serial.lastError}`.trim()
    : 'No serial errors captured';
}

function setSerialError(error) {
  state.serial.lastError = String((error && (error.message || error.name)) || error || 'Unknown serial error');
  state.serial.lastErrorAt = new Date().toLocaleString();
}

function clearSerialError() {
  state.serial.lastError = '';
  state.serial.lastErrorAt = null;
}

function decorateSerialOpenError(error) {
  const message = String(error && (error.message || error.name) || 'Could not open serial port.');
  if (/failed to open serial port/i.test(message)) {
    return new Error('Failed to open serial port. Bluetooth may have reset. Tap Pair Printer again.');
  }
  if (/networkerror/i.test(message)) {
    return new Error('Bluetooth connection was interrupted. Turn Bluetooth back on, then tap Pair Printer again.');
  }
  return error instanceof Error ? error : new Error(message);
}

function buildReconnectErrorMessage(error) {
  const message = String(error && (error.message || error.name) || 'Could not reconnect the Bluetooth printer.');
  if (/pair printer again/i.test(message)) return message;
  if (/failed to open serial port/i.test(message)) {
    return 'Failed to reopen the Bluetooth printer after the connection changed. Tap Pair Printer again.';
  }
  return message;
}
