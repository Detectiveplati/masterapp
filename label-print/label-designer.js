// ── Constants ─────────────────────────────────────────────────────────────────
const LABEL_W = 696;
const LABEL_H = 271;
const ZOOM = 2;
const API_BASE = `${window.location.origin}/api/label-print`;
const HALAL_LOGO_STORAGE_KEY = 'label-print-halal-logo-data-url';
const BLUETOOTH_RFCOMM_SERVICE_ID = '00001101-0000-1000-8000-00805f9b34fb';
const DEFAULT_BAUD = 115200;
const PRINT_FONT = "'Noto Sans SC', 'Arial Unicode MS', sans-serif";
const BROTHER_STATUS_LENGTH = 32;

// ── Field definitions ─────────────────────────────────────────────────────────
// Default style + position presets for each dynamic field
const FIELD_DEFS = {
  entity:         { label: 'Company Name',      placeholder: 'Chilli Api Catering Pte Ltd', fontSize: 28, bold: true,  align: 'center', x: 71,  y: 2,   w: 619 },
  address:        { label: 'Address',            placeholder: '3015 Bedok North Street 5',   fontSize: 13, bold: false, align: 'center', x: 71,  y: 35,  w: 619 },
  nameChinese:    { label: 'Chinese Name',       placeholder: '参巴虾米炒饭',                   fontSize: 60, bold: true,  align: 'center', x: 6,   y: 82,  w: 684 },
  nameEnglish:    { label: 'English Name',       placeholder: 'Chilli Prawn Fried Rice',     fontSize: 22, bold: true,  align: 'center', x: 6,   y: 55,  w: 684 },
  dateProduction: { label: 'Production Date',    placeholder: '14/05/2026',                   fontSize: 36, bold: true,  align: 'right',  x: 6,   y: 140, w: 684 },
  dateExpiry:     { label: 'Expiry Date',        placeholder: '17/05/2026',                   fontSize: 36, bold: true,  align: 'right',  x: 6,   y: 195, w: 684 },
  departmentName: { label: 'Department',         placeholder: 'HOT KITCHEN',                  fontSize: 12, bold: false, align: 'right',  x: 6,   y: 255, w: 684 },
  shelfLifeDays:  { label: 'Shelf Life (Days)',  placeholder: '+3Days',                        fontSize: 12, bold: false, align: 'left',   x: 6,   y: 255, w: 200 },
  halalCert:      { label: 'Halal Cert No.',     placeholder: 'C1086',                        fontSize: 11, bold: false, align: 'center', x: 5,   y: 60,  w: 60  },
};

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  canvas: null,
  templates: [],
  selectedTemplateId: null,
  serial: { port: null, connected: false },
  suppressPropUpdate: false,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const templateSelectEl   = document.getElementById('template-select');
const saveBtn            = document.getElementById('save-btn');
const clearBtn           = document.getElementById('clear-btn');
const deleteBtn          = document.getElementById('delete-btn');
const connectBtn         = document.getElementById('connect-btn');
const printBtn           = document.getElementById('print-btn');
const loadDefaultBtn     = document.getElementById('load-default-btn');
const btDot              = document.getElementById('bt-dot');
const btLabel            = document.getElementById('bt-label');
const toastEl            = document.getElementById('toast');
const templateKeyDisplay  = document.getElementById('template-key-display');
const templateKeyCopy     = document.getElementById('template-key-copy');
const newTemplateBtn      = document.getElementById('new-template-btn');
const newTemplateModal    = document.getElementById('new-template-modal');
const ntName              = document.getElementById('nt-name');
const ntKey               = document.getElementById('nt-key');
const ntError             = document.getElementById('nt-error');
const ntCancel            = document.getElementById('nt-cancel');
const ntSave              = document.getElementById('nt-save');
// Props
const noSelMsg           = document.getElementById('no-selection-msg');
const commonProps        = document.getElementById('common-props');
const textProps          = document.getElementById('text-props');
const lineProps          = document.getElementById('line-props');
const imageProps         = document.getElementById('image-props');
const propX              = document.getElementById('prop-x');
const propY              = document.getElementById('prop-y');
const propW              = document.getElementById('prop-w');
const propH              = document.getElementById('prop-h');
const propField          = document.getElementById('prop-field');
const propText           = document.getElementById('prop-text');
const propFontSize       = document.getElementById('prop-fontsize');
const propAlign          = document.getElementById('prop-align');
const propBold           = document.getElementById('prop-bold');
const propItalic         = document.getElementById('prop-italic');
const propMaxW           = document.getElementById('prop-maxw');
const propStroke         = document.getElementById('prop-stroke');

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initFabric();
  bindUI();
  loadData();
});

function initFabric() {
  const fc = new fabric.Canvas('designer-canvas', {
    backgroundColor: 'white',
    selection: true,
    preserveObjectStacking: true,
  });
  fc.setZoom(ZOOM);
  fc.setWidth(LABEL_W * ZOOM);
  fc.setHeight(LABEL_H * ZOOM);

  fc.on('selection:created', onSelectionChange);
  fc.on('selection:updated', onSelectionChange);
  fc.on('selection:cleared', onSelectionChange);
  fc.on('object:modified', onObjectModified);

  state.canvas = fc;
}

// ── Data loading ──────────────────────────────────────────────────────────────
function updateTemplateKeyBadge(template) {
  templateKeyDisplay.textContent = (template && template.key) ? template.key : '—';
}

templateKeyCopy.addEventListener('click', () => {
  const t = state.templates.find((x) => x._id === state.selectedTemplateId);
  const key = (t && t.key) ? t.key : '';
  if (!key) return;
  navigator.clipboard.writeText(key).then(() => toast('Copied: ' + key)).catch(() => {
    prompt('Copy this templateKey value:', key);
  });
});

// ── New Template Modal ────────────────────────────────────────────────────────
function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

newTemplateBtn.addEventListener('click', () => {
  ntName.value = '';
  ntKey.value = '';
  ntError.textContent = '';
  newTemplateModal.classList.remove('hidden');
  ntName.focus();
});

ntName.addEventListener('input', () => {
  if (!ntKey.dataset.manuallyEdited) {
    ntKey.value = slugify(ntName.value);
  }
});

ntKey.addEventListener('input', () => {
  ntKey.dataset.manuallyEdited = ntKey.value ? '1' : '';
});

ntCancel.addEventListener('click', () => {
  newTemplateModal.classList.add('hidden');
});

newTemplateModal.addEventListener('click', (e) => {
  if (e.target === newTemplateModal) newTemplateModal.classList.add('hidden');
});

ntSave.addEventListener('click', async () => {
  const name = ntName.value.trim();
  const key  = slugify(ntKey.value);
  if (!key) { ntError.textContent = 'Template key is required.'; return; }
  ntError.textContent = '';
  ntSave.disabled = true;
  ntSave.textContent = 'Creating…';
  try {
    const created = await apiFetch('/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || key, key }),
    });
    state.templates.push(created);
    const opt = document.createElement('option');
    opt.value = created._id;
    opt.textContent = created.name || created.key;
    templateSelectEl.appendChild(opt);
    templateSelectEl.value = created._id;
    state.selectedTemplateId = created._id;
    loadTemplateDesign(created);
    updateTemplateKeyBadge(created);
    newTemplateModal.classList.add('hidden');
    toast('Template "' + (created.name || created.key) + '" created.');
  } catch (err) {
    ntError.textContent = err.message || 'Failed to create template.';
  } finally {
    ntSave.disabled = false;
    ntSave.textContent = 'Create Template';
  }
});

async function loadData() {
  try {
    const templates = await apiFetch('/templates');
    state.templates = templates;
    if (templates.length) {
      templateSelectEl.innerHTML = templates.map((t) =>
        `<option value="${t._id}">${t.name || t.key}</option>`
      ).join('');
      state.selectedTemplateId = templates[0]._id;
      loadTemplateDesign(templates[0]);
      updateTemplateKeyBadge(templates[0]);
    } else {
      templateSelectEl.innerHTML = '<option value="">— No templates — click + New</option>';
      updateTemplateKeyBadge(null);
    }
  } catch (err) {
    toast('Could not load templates: ' + err.message);
  }
}

templateSelectEl.addEventListener('change', () => {
  const t = state.templates.find((x) => x._id === templateSelectEl.value);
  if (t) { state.selectedTemplateId = t._id; loadTemplateDesign(t); updateTemplateKeyBadge(t); }
});

function loadTemplateDesign(template) {
  const fc = state.canvas;
  if (template.designLayout && template.designLayout.objects) {
    // Restore halal logo src before loading (stripped at save time to avoid 413)
    const json = JSON.parse(JSON.stringify(template.designLayout));
    const logoSrc = localStorage.getItem(HALAL_LOGO_STORAGE_KEY) || '/label-print/halal-logo.png';
    for (const obj of json.objects || []) {
      if (obj.type === 'image' && obj.fieldBinding === 'halalLogo' && !obj.src) {
        obj.src = logoSrc;
      }
    }
    fc.loadFromJSON(json, () => { fc.renderAll(); });
  } else {
    fc.clear();
    fc.backgroundColor = 'white';
    fc.renderAll();
  }
}

// ── Add elements ──────────────────────────────────────────────────────────────
function addTextElement(text = 'Text', opts = {}) {
  const obj = new fabric.IText(text, {
    left: opts.x !== undefined ? opts.x : 50,
    top:  opts.y !== undefined ? opts.y : 50,
    fontFamily: PRINT_FONT,
    fontSize: opts.fontSize || 20,
    fontWeight: opts.bold ? 'bold' : 'normal',
    fontStyle: 'normal',
    textAlign: opts.align || 'left',
    fill: '#000000',
    width: opts.w || LABEL_W - 12,
    originX: 'left',
    originY: 'top',
  });
  // custom property: field binding key
  obj.fieldBinding = opts.fieldBinding || '';
  state.canvas.add(obj);
  state.canvas.setActiveObject(obj);
  state.canvas.renderAll();
  return obj;
}

function addFieldElement(fieldKey) {
  const def = FIELD_DEFS[fieldKey];
  if (!def) return;
  const obj = addTextElement(def.placeholder, {
    x: def.x, y: def.y, w: def.w,
    fontSize: def.fontSize, bold: def.bold, align: def.align,
    fieldBinding: fieldKey,
  });
  obj.fieldBinding = fieldKey;
  return obj;
}

function addLineElement() {
  const obj = new fabric.Line([6, 75, LABEL_W - 6, 75], {
    stroke: '#000000',
    strokeWidth: 1,
    selectable: true,
    originX: 'left',
    originY: 'top',
  });
  state.canvas.add(obj);
  state.canvas.setActiveObject(obj);
  state.canvas.renderAll();
}

async function addLogoElement() {
  const dataUrl = localStorage.getItem(HALAL_LOGO_STORAGE_KEY) || '';
  const src = dataUrl || '/label-print/halal-logo.png';
  fabric.Image.fromURL(src, (img) => {
    if (!img || !img.width) { toast('Logo not found. Upload it in Setup first.'); return; }
    img.set({ left: 0, top: 2, originX: 'left', originY: 'top' });
    img.scaleToHeight(62);
    img.fieldBinding = 'halalLogo';
    state.canvas.add(img);
    state.canvas.setActiveObject(img);
    state.canvas.renderAll();
  }, { crossOrigin: 'anonymous' });
}

// ── UI bindings ───────────────────────────────────────────────────────────────
function bindUI() {
  document.getElementById('add-text-btn').addEventListener('click', () => addTextElement('Text'));
  document.getElementById('add-line-btn').addEventListener('click', addLineElement);
  document.getElementById('add-logo-btn').addEventListener('click', addLogoElement);
  document.querySelectorAll('[data-field]').forEach((btn) => {
    btn.addEventListener('click', () => addFieldElement(btn.dataset.field));
  });
  deleteBtn.addEventListener('click', deleteSelected);
  clearBtn.addEventListener('click', () => { if (confirm('Clear canvas?')) { state.canvas.clear(); state.canvas.backgroundColor = 'white'; state.canvas.renderAll(); } });
  saveBtn.addEventListener('click', saveLayout);
  connectBtn.addEventListener('click', toggleConnect);
  printBtn.addEventListener('click', printTest);
  loadDefaultBtn.addEventListener('click', loadDefaultLayout);

  // Props panel → update object
  propX.addEventListener('change', applyPositionFromPanel);
  propY.addEventListener('change', applyPositionFromPanel);
  propW.addEventListener('change', applyPositionFromPanel);
  propH.addEventListener('change', applyPositionFromPanel);
  propField.addEventListener('change', () => {
    const obj = getActiveText();
    if (!obj) return;
    obj.fieldBinding = propField.value;
    const def = FIELD_DEFS[propField.value];
    if (def && propField.value && obj.text === obj.fieldBinding || !obj.text) {
      obj.set('text', def.placeholder);
    }
    state.canvas.renderAll();
  });
  propText.addEventListener('input', () => {
    const obj = getActiveText();
    if (obj) { obj.set('text', propText.value); state.canvas.renderAll(); }
  });
  propFontSize.addEventListener('change', () => {
    const obj = getActiveText();
    if (obj) { obj.set('fontSize', Number(propFontSize.value) || 16); state.canvas.renderAll(); }
  });
  propAlign.addEventListener('change', () => {
    const obj = getActiveText();
    if (obj) { obj.set('textAlign', propAlign.value); state.canvas.renderAll(); }
  });
  propBold.addEventListener('change', () => {
    const obj = getActiveText();
    if (obj) { obj.set('fontWeight', propBold.checked ? 'bold' : 'normal'); state.canvas.renderAll(); }
  });
  propItalic.addEventListener('change', () => {
    const obj = getActiveText();
    if (obj) { obj.set('fontStyle', propItalic.checked ? 'italic' : 'normal'); state.canvas.renderAll(); }
  });
  propMaxW.addEventListener('change', () => {
    const obj = getActiveText();
    if (obj) { const v = Number(propMaxW.value); obj.set('width', v > 0 ? v : LABEL_W - 12); state.canvas.renderAll(); }
  });
  propStroke.addEventListener('change', () => {
    const obj = state.canvas.getActiveObject();
    if (obj && obj.type === 'line') { obj.set('strokeWidth', Number(propStroke.value) || 1); state.canvas.renderAll(); }
  });
}

function getActiveText() {
  const obj = state.canvas.getActiveObject();
  return (obj && (obj.type === 'i-text' || obj.type === 'text')) ? obj : null;
}

function deleteSelected() {
  const obj = state.canvas.getActiveObject();
  if (!obj) return;
  if (obj.type === 'activeSelection') {
    obj.forEachObject((o) => state.canvas.remove(o));
    state.canvas.discardActiveObject();
  } else {
    state.canvas.remove(obj);
  }
  state.canvas.renderAll();
}

// ── Properties panel ──────────────────────────────────────────────────────────
function onSelectionChange() {
  const obj = state.canvas.getActiveObject();
  populatePropsPanel(obj);
}

function onObjectModified() {
  const obj = state.canvas.getActiveObject();
  constrainObjectToLabel(obj);
  populatePropsPanel(obj);
}

function populatePropsPanel(obj) {
  state.suppressPropUpdate = true;
  try {
    if (!obj || obj.type === 'activeSelection') {
      showPanelState('none');
      return;
    }

    const isText  = obj.type === 'i-text' || obj.type === 'text';
    const isLine  = obj.type === 'line';
    const isImage = obj.type === 'image';

    // Common: position
    propX.value = Math.round(obj.left);
    propY.value = Math.round(obj.top);

    if (isLine) {
      const x1 = Math.round(obj.x1 + (obj.left || 0));
      const x2 = Math.round(obj.x2 + (obj.left || 0));
      propW.value = Math.abs(x2 - x1);
      propH.value = Math.round(obj.strokeWidth);
    } else {
      propW.value = Math.round(obj.getScaledWidth ? obj.getScaledWidth() : obj.width);
      propH.value = Math.round(obj.getScaledHeight ? obj.getScaledHeight() : obj.height);
    }

    if (isText) {
      propField.value    = obj.fieldBinding || '';
      propText.value     = obj.text || '';
      propFontSize.value = obj.fontSize || 16;
      propAlign.value    = obj.textAlign || 'left';
      propBold.checked   = obj.fontWeight === 'bold';
      propItalic.checked = obj.fontStyle === 'italic';
      propMaxW.value     = obj.width || 0;
      showPanelState('text');
    } else if (isLine) {
      propStroke.value = obj.strokeWidth || 1;
      showPanelState('line');
    } else if (isImage) {
      showPanelState('image');
    } else {
      showPanelState('common');
    }
  } finally {
    state.suppressPropUpdate = false;
  }
}

function showPanelState(mode) {
  noSelMsg.classList.toggle('hidden', mode !== 'none');
  commonProps.classList.toggle('hidden', mode === 'none');
  textProps.classList.toggle('hidden', mode !== 'text');
  lineProps.classList.toggle('hidden', mode !== 'line');
  imageProps.classList.toggle('hidden', mode !== 'image');
}

function applyPositionFromPanel() {
  if (state.suppressPropUpdate) return;
  const obj = state.canvas.getActiveObject();
  if (!obj) return;
  obj.set({ left: Number(propX.value), top: Number(propY.value) });
  constrainObjectToLabel(obj);
  state.canvas.renderAll();
  populatePropsPanel(obj);
}

function constrainObjectToLabel(obj) {
  if (!obj || obj.type === 'activeSelection') return;
  const bounds = getObjectBounds(obj);
  if (!bounds) return;
  let nextLeft = Number(obj.left) || 0;
  let nextTop = Number(obj.top) || 0;
  if (bounds.left < 0) nextLeft += -bounds.left;
  if (bounds.top < 0) nextTop += -bounds.top;
  if (bounds.right > LABEL_W) nextLeft -= bounds.right - LABEL_W;
  if (bounds.bottom > LABEL_H) nextTop -= bounds.bottom - LABEL_H;
  obj.set({
    left: Math.max(0, Math.round(nextLeft)),
    top: Math.max(0, Math.round(nextTop))
  });
  obj.setCoords();
}

function getObjectBounds(obj) {
  if (!obj) return null;
  if (obj.type === 'line') {
    const left = Number(obj.left) || 0;
    const top = Number(obj.top) || 0;
    const scaleX = Number(obj.scaleX) || 1;
    const scaleY = Number(obj.scaleY) || 1;
    const stroke = Math.max(1, Number(obj.strokeWidth) || 1) / 2;
    const x1 = left + (Number(obj.x1) || 0) * scaleX;
    const x2 = left + (Number(obj.x2) || 0) * scaleX;
    const y1 = top + (Number(obj.y1) || 0) * scaleY;
    const y2 = top + (Number(obj.y2) || 0) * scaleY;
    return {
      left: Math.min(x1, x2) - stroke,
      top: Math.min(y1, y2) - stroke,
      right: Math.max(x1, x2) + stroke,
      bottom: Math.max(y1, y2) + stroke
    };
  }
  const left = Number(obj.left) || 0;
  const top = Number(obj.top) || 0;
  const width = obj.getScaledWidth ? obj.getScaledWidth() : (Number(obj.width) || 0) * (Number(obj.scaleX) || 1);
  const height = obj.getScaledHeight ? obj.getScaledHeight() : (Number(obj.height) || 0) * (Number(obj.scaleY) || 1);
  return { left, top, right: left + width, bottom: top + height };
}

function getOutOfBoundsObjects() {
  return state.canvas.getObjects().filter((obj) => {
    const bounds = getObjectBounds(obj);
    return bounds && (bounds.left < 0 || bounds.top < 0 || bounds.right > LABEL_W || bounds.bottom > LABEL_H);
  });
}

function validateObjectsWithinLabel(actionLabel) {
  const outOfBounds = getOutOfBoundsObjects();
  if (!outOfBounds.length) return true;
  toast(`${outOfBounds.length} object(s) outside 62 x 29 mm label. Move them inside before ${actionLabel}.`);
  return false;
}

// ── Save / Load ───────────────────────────────────────────────────────────────
async function saveLayout() {
  if (!state.selectedTemplateId) { toast('Select a template first.'); return; }
  if (!validateObjectsWithinLabel('saving')) return;
  const designLayout = state.canvas.toJSON(['fieldBinding']);
  // Strip embedded base64 image data — images are restored from localStorage/static
  // at load time, so there's no need to store the full data URL in MongoDB.
  for (const obj of designLayout.objects || []) {
    if (obj.type === 'image' && typeof obj.src === 'string' && obj.src.startsWith('data:')) {
      delete obj.src;
    }
  }
  try {
    await apiFetch(`/templates/${state.selectedTemplateId}/layout`, {
      method: 'PUT',
      body: JSON.stringify({ designLayout }),
    });
    const t = state.templates.find((x) => x._id === state.selectedTemplateId);
    if (t) t.designLayout = designLayout;
    toast('Layout saved.');
  } catch (err) {
    toast('Save failed: ' + err.message);
  }
}

function loadDefaultLayout() {
  if (!confirm('Replace current canvas with the default layout?')) return;
  const fc = state.canvas;
  fc.clear();
  fc.backgroundColor = 'white';

  // Halal logo placeholder
  addLogoElement();

  // Divider line
  const divider = new fabric.Line([6, 73, LABEL_W - 6, 73], { stroke: '#000', strokeWidth: 1 });
  fc.add(divider);

  // Dynamic field elements in default positions
  ['entity', 'address', 'nameChinese', 'dateProduction', 'dateExpiry', 'departmentName', 'shelfLifeDays'].forEach(addFieldElement);

  // Production / expiry labels (static bilingual labels)
  const labelOpts = { fontSize: 17, bold: false, align: 'left' };
  addTextElement('Production date：', { ...labelOpts, x: 6, y: 140, w: 300, fieldBinding: '' });
  addTextElement('开始日期：',          { ...labelOpts, x: 6, y: 157, w: 300, fieldBinding: '' });
  addTextElement('Used By date：',   { ...labelOpts, x: 6, y: 195, w: 300, fieldBinding: '' });
  addTextElement('过期日期：',          { ...labelOpts, x: 6, y: 212, w: 300, fieldBinding: '' });

  fc.renderAll();
  toast('Default layout loaded. Click Save to persist.');
}

// ── Bluetooth connection ──────────────────────────────────────────────────────
async function toggleConnect() {
  if (state.serial.connected) {
    await disconnect();
  } else {
    await connect();
  }
}

async function connect() {
  if (!navigator.serial) { toast('Web Serial not available. Use Chrome on Android.'); return; }
  try {
    const port = await navigator.serial.requestPort({ filters: [] });
    await port.open({ baudRate: DEFAULT_BAUD, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    state.serial.port = port;
    state.serial.connected = true;
    setConnectStatus(true);
    printBtn.disabled = false;
    toast('Printer connected.');
  } catch (err) {
    toast('Connect failed: ' + (err.message || err.name));
  }
}

async function disconnect() {
  try {
    if (state.serial.port) await state.serial.port.close().catch(() => {});
  } finally {
    state.serial.port = null;
    state.serial.connected = false;
    setConnectStatus(false);
    printBtn.disabled = true;
  }
}

function setConnectStatus(connected) {
  btDot.className = 'status-dot' + (connected ? ' connected' : '');
  btLabel.textContent = connected ? 'Connected' : 'Not connected';
  connectBtn.textContent = connected ? 'Disconnect' : 'Connect Printer';
}

// ── Print test ────────────────────────────────────────────────────────────────
async function printTest() {
  if (!state.serial.connected || !state.serial.port) { toast('Connect printer first.'); return; }
  if (!validateObjectsWithinLabel('printing')) return;
  printBtn.disabled = true;
  try {
    // Preflight status check
    const status = await requestPrinterStatus(state.serial.port).catch(() => null);
    if (status && (status.mediaTypeCode !== 0x0B || status.mediaWidth !== 62)) {
      throw new Error(`Wrong media loaded (${status.mediaWidth}mm). Expecting 62mm DK-11209.`);
    }

    // Render the current design to 696×271 pixels using a temporary canvas
    const rasterLines = await renderDesignToRasterLines();
    const bytes = buildRasterJob(rasterLines, { cutMode: 'auto-cut', mediaWidthMm: 62, labelLengthMm: 29 });

    const writer = state.serial.port.writable.getWriter();
    try { await writer.write(bytes); } finally { writer.releaseLock(); }
    toast('Label sent to printer.');
  } catch (err) {
    toast('Print failed: ' + (err.message || String(err)));
  } finally {
    printBtn.disabled = false;
  }
}

async function renderDesignToRasterLines() {
  // Build substituted JSON from the current canvas
  const rawJson = state.canvas.toJSON(['fieldBinding']);
  const itemData = sampleItemData();
  const substituted = substituteFields(rawJson, itemData);

  // Render to a temporary off-screen fabric canvas at 1× (print resolution)
  return new Promise((resolve, reject) => {
    const printEl = document.createElement('canvas');
    printEl.width  = LABEL_W;
    printEl.height = LABEL_H;
    const fc = new fabric.StaticCanvas(printEl, { backgroundColor: 'white' });
    fc.loadFromJSON(substituted, () => {
      fc.renderAll();
      const ctx = printEl.getContext('2d');
      const imageData = ctx.getImageData(0, 0, LABEL_W, LABEL_H);
      fc.dispose();
      resolve(imageDataToRasterLines(imageData));
    });
  });
}

// Return sample item data used when printing a test label from the designer
function sampleItemData() {
  const today = new Date();
  const expiry = new Date(today.getTime() + 3 * 86400000);
  const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  return {
    entity:         'Chilli Api Catering Pte Ltd',
    address:        '3015 Bedok North Street 5 #05-27 Singapore 486350',
    nameChinese:    '参巴虾米炒饭',
    nameEnglish:    'Chilli Prawn Fried Rice',
    dateProduction: fmt(today),
    dateExpiry:     fmt(expiry),
    departmentName: 'HOT KITCHEN',
    shelfLifeDays:  '+3 Days',
    halalCert:      'C1086',
  };
}

function substituteFields(fabricJson, itemData) {
  const json = JSON.parse(JSON.stringify(fabricJson));
  for (const obj of json.objects || []) {
    if (obj.fieldBinding && itemData[obj.fieldBinding] !== undefined) {
      if (obj.type === 'i-text' || obj.type === 'text') {
        obj.text = String(itemData[obj.fieldBinding]);
      }
    }
  }
  return json;
}

// ── Raster conversion (same as app.js) ───────────────────────────────────────
function imageDataToRasterLines(imageData) {
  const lines = [];
  for (let row = 0; row < LABEL_H; row++) {
    const lineBytes = new Uint8Array(90);
    for (let col = 0; col < LABEL_W; col++) {
      const i = (row * LABEL_W + col) * 4;
      const bright = imageData.data[i] * 0.299 + imageData.data[i+1] * 0.587 + imageData.data[i+2] * 0.114;
      if (bright < 128) {
        const rpos = 707 - col;
        lineBytes[rpos >> 3] |= (0x80 >> (rpos & 7));
      }
    }
    lines.push(lineBytes);
  }
  return lines;
}

function buildRasterJob(rasterLines, { cutMode, mediaWidthMm = 62, labelLengthMm = 29 }) {
  const chunks = [];
  chunks.push(new Uint8Array(400));                                         // invalidate
  chunks.push(Uint8Array.from([0x1B, 0x40]));                              // init
  chunks.push(Uint8Array.from([0x1B, 0x69, 0x61, 0x01]));                 // raster mode
  const n = rasterLines.length;
  const mediaType = labelLengthMm > 0 ? 0x0B : 0x0A;
  const piFlags   = labelLengthMm > 0 ? 0xCE : 0xCA;
  chunks.push(Uint8Array.from([0x1B,0x69,0x7A, piFlags, mediaType,
    mediaWidthMm & 0xFF, labelLengthMm & 0xFF,
    n & 0xFF, (n>>8)&0xFF, (n>>16)&0xFF, (n>>24)&0xFF, 0x00, 0x00]));    // print info
  chunks.push(Uint8Array.from([0x1B,0x69,0x4D, cutMode === 'no-cut' ? 0x00 : 0x40])); // auto-cut
  if (cutMode !== 'no-cut') chunks.push(Uint8Array.from([0x1B,0x69,0x41,0x01]));       // cut every 1
  chunks.push(Uint8Array.from([0x1B,0x69,0x4B, cutMode === 'no-cut' ? 0x00 : 0x08])); // expanded
  chunks.push(Uint8Array.from([0x1B,0x69,0x64,0x00,0x00]));               // margin=0
  for (const line of rasterLines) {
    const cmd = new Uint8Array(93);
    cmd[0] = 0x67; cmd[1] = 0x00; cmd[2] = 0x5A;
    cmd.set(line, 3);
    chunks.push(cmd);
  }
  chunks.push(Uint8Array.from([0x1A]));                                    // print+feed
  return concatArrays(chunks);
}

function concatArrays(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ── Brother status (same as app.js) ──────────────────────────────────────────
async function requestPrinterStatus(port) {
  if (!port || !port.writable) return null;
  const writer = port.writable.getWriter();
  try {
    await writer.write(Uint8Array.from([0x1B, 0x69, 0x53]));
  } finally {
    writer.releaseLock();
  }
  const response = await readBrotherStatus(port, 1500);
  return parseBrotherStatus(response);
}

function parseBrotherStatus(bytes) {
  if (!bytes || bytes.length < BROTHER_STATUS_LENGTH) return null;
  if (bytes[0] !== 0x80 || bytes[1] !== 0x20 || bytes[2] !== 0x42) return null;
  return { mediaWidth: bytes[10], mediaTypeCode: bytes[11], mediaLength: bytes[17] };
}

async function readBrotherStatus(port, timeoutMs) {
  if (!port || !port.readable) return null;
  const reader = port.readable.getReader();
  const chunks = [];
  try {
    while (true) {
      let timeoutId;
      const result = await Promise.race([
        reader.read(),
        new Promise((_, rej) => { timeoutId = setTimeout(() => rej(new Error('timeout')), timeoutMs); })
      ]);
      clearTimeout(timeoutId);
      if (result.done) break;
      chunks.push(result.value);
      const total = chunks.reduce((s, c) => s + c.length, 0);
      if (total >= BROTHER_STATUS_LENGTH) break;
    }
  } catch (_) { /* timeout is normal */ }
  finally { try { reader.releaseLock(); } catch (_) {} }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { merged.set(c, off); off += c.length; }
  return merged;
}

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}
