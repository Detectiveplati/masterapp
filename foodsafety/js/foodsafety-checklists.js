'use strict';

(function () {
  const i18n = window.FoodSafetyI18n || null;
  const state = {
    meta: null,
    template: null,
    record: null,
    activeSectionId: null,
    activeFocusIndex: 0,
    dirty: false,
    saving: false,
    autosaveTimer: null
  };
  const qs = new URLSearchParams(window.location.search);

  const els = {
    msg: document.getElementById('msg'),
    monthInput: document.getElementById('monthInput'),
    unitValue: document.getElementById('unitValue'),
    reloadBtn: document.getElementById('reloadBtn'),
    viewPdfBtn: document.getElementById('viewPdfBtn'),
    downloadPdfBtn: document.getElementById('downloadPdfBtn'),
    saveBtn: document.getElementById('saveBtn'),
    saveBtnSticky: document.getElementById('saveBtnSticky'),
    finalizeBtn: document.getElementById('finalizeBtn'),
    finalizeBtnSticky: document.getElementById('finalizeBtnSticky'),
    viewPdfBtnSticky: document.getElementById('viewPdfBtnSticky'),
    reopenBtn: document.getElementById('reopenBtn'),
    monthStatus: document.getElementById('monthStatus'),
    summaryMeta: document.getElementById('summaryMeta'),
    instructionPills: document.getElementById('instructionPills'),
    templateMeta: document.getElementById('templateMeta'),
    sectionStrip: document.getElementById('sectionStrip'),
    sectionTitle: document.getElementById('sectionTitle'),
    sectionSub: document.getElementById('sectionSub'),
    gridWrap: document.getElementById('gridWrap'),
    scrollPrevBtn: document.getElementById('scrollPrevBtn'),
    scrollNextBtn: document.getElementById('scrollNextBtn'),
    dateNavLabel: document.getElementById('dateNavLabel'),
    checkGrid: document.getElementById('checkGrid'),
    sectionRemarks: document.getElementById('sectionRemarks'),
    sectionMeta: document.getElementById('sectionMeta'),
    saveState: document.getElementById('saveState'),
    finalizeModal: document.getElementById('finalizeModal'),
    signerNameInput: document.getElementById('signerNameInput'),
    signatureCanvas: document.getElementById('signatureCanvas'),
    clearSignatureBtn: document.getElementById('clearSignatureBtn'),
    finalizeConfirm: document.getElementById('finalizeConfirm'),
    cancelFinalizeBtn: document.getElementById('cancelFinalizeBtn'),
    confirmFinalizeBtn: document.getElementById('confirmFinalizeBtn')
  };
  const signaturePad = {
    drawing: false,
    hasInk: false,
    ctx: null
  };

  function tt(key, fallback) {
    return i18n && typeof i18n.t === 'function' ? i18n.t(key, fallback) : (fallback || key);
  }

  function lang() {
    return i18n && typeof i18n.getLang === 'function' ? i18n.getLang() : 'en';
  }

  function pickLabel(entity, base) {
    if (!entity) return '';
    return lang() === 'zh' && entity[base + 'Zh'] ? entity[base + 'Zh'] : entity[base];
  }

  function showMessage(type, text) {
    els.msg.className = 'msg ' + type;
    els.msg.textContent = text;
    els.msg.style.display = 'block';
    window.clearTimeout(showMessage._timer);
    showMessage._timer = window.setTimeout(() => {
      els.msg.style.display = 'none';
    }, 3200);
  }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMonthLabel(monthKey) {
    const [year, month] = String(monthKey).split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString(undefined, {
      month: 'long',
      year: 'numeric'
    });
  }

  function formatDateTime(value) {
    if (!value) return 'Not saved yet';
    const dt = new Date(value);
    return dt.toLocaleString();
  }

  function isLockedStatus(status) {
    return status === 'finalized' || status === 'verified';
  }

  function isLockedRecord() {
    return Boolean(state.record && isLockedStatus(state.record.status));
  }

  function getMonthReportUrl(pdf) {
    if (!state.record) return '#';
    const qs = `template=${encodeURIComponent(state.record.templateCode)}&month=${encodeURIComponent(state.record.monthKey)}&unit=${encodeURIComponent(state.record.unitCode)}&lang=en`;
    return pdf
      ? `/api/foodsafety-checklists/month/report.pdf?${qs}`
      : `/foodsafety-forms/checklists-report.html?${qs}`;
  }

  async function ensureArchivedPdf(refresh) {
    const url = getMonthReportUrl(true) + (refresh ? '&refresh=1' : '');
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to archive PDF');
    }
    await res.blob();
  }

  function syncReportActions() {
    const visible = isLockedRecord();
    const pdfUrl = getMonthReportUrl(true);
    [els.viewPdfBtn, els.downloadPdfBtn, els.viewPdfBtnSticky].forEach((el) => {
      if (!el) return;
      el.classList.toggle('hidden', !visible);
      el.href = pdfUrl;
    });
    if (els.viewPdfBtn) els.viewPdfBtn.target = '_blank';
    if (els.downloadPdfBtn) {
      els.downloadPdfBtn.target = '_blank';
      els.downloadPdfBtn.setAttribute('download', '');
    }
    if (els.viewPdfBtnSticky) els.viewPdfBtnSticky.target = '_blank';
  }

  function openFinalizeModal() {
    if (!state.record || isLockedRecord()) return;
    const authUser = window._authUser || {};
    const existingName = state.record.finalization && state.record.finalization.name;
    els.signerNameInput.value = existingName || (authUser && (authUser.displayName || authUser.username)) || '';
    els.finalizeConfirm.checked = false;
    els.finalizeModal.classList.add('open');
    clearSignaturePad();
    resizeSignatureCanvas();
    window.setTimeout(() => els.signerNameInput.focus(), 0);
  }

  function closeFinalizeModal() {
    els.finalizeModal.classList.remove('open');
  }

  function resizeSignatureCanvas() {
    if (!els.signatureCanvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = els.signatureCanvas.getBoundingClientRect();
    els.signatureCanvas.width = Math.max(1, Math.round(rect.width * ratio));
    els.signatureCanvas.height = Math.max(1, Math.round(rect.height * ratio));
    signaturePad.ctx = els.signatureCanvas.getContext('2d');
    signaturePad.ctx.scale(ratio, ratio);
    signaturePad.ctx.lineCap = 'round';
    signaturePad.ctx.lineJoin = 'round';
    signaturePad.ctx.lineWidth = 2.2;
    signaturePad.ctx.strokeStyle = '#111827';
    signaturePad.ctx.fillStyle = '#ffffff';
    signaturePad.ctx.fillRect(0, 0, rect.width, rect.height);
    signaturePad.hasInk = false;
  }

  function clearSignaturePad() {
    if (!signaturePad.ctx) return;
    const rect = els.signatureCanvas.getBoundingClientRect();
    signaturePad.ctx.fillStyle = '#ffffff';
    signaturePad.ctx.fillRect(0, 0, rect.width, rect.height);
    signaturePad.hasInk = false;
  }

  function signaturePoint(event) {
    const rect = els.signatureCanvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }

  function startSignature(event) {
    if (!signaturePad.ctx) return;
    signaturePad.drawing = true;
    const point = signaturePoint(event);
    signaturePad.ctx.beginPath();
    signaturePad.ctx.moveTo(point.x, point.y);
    signaturePad.hasInk = true;
    event.preventDefault();
  }

  function moveSignature(event) {
    if (!signaturePad.drawing || !signaturePad.ctx) return;
    const point = signaturePoint(event);
    signaturePad.ctx.lineTo(point.x, point.y);
    signaturePad.ctx.stroke();
    event.preventDefault();
  }

  function endSignature() {
    signaturePad.drawing = false;
  }

  function getSignatureDataUrl() {
    if (!signaturePad.hasInk || !els.signatureCanvas) return '';
    return els.signatureCanvas.toDataURL('image/png');
  }

  function currentSection() {
    if (!state.template) return null;
    return state.template.sections.find((section) => section.id === state.activeSectionId) || state.template.sections[0];
  }

  function getSectionState(sectionId) {
    return state.record && state.record.data && state.record.data[sectionId]
      ? state.record.data[sectionId]
      : { remarks: '', checks: {} };
  }

  function focusCountForSection(section) {
    return section.frequency === 'weekly' ? state.template.weekCount : state.template.dayCount;
  }

  function renderUnitValue() {
    let label = '';
    if (state.record) {
      label = state.record.unitLabel || state.record.unitCode || '';
    }
    if (!label && state.template) {
      const unitCode = (state.record && state.record.unitCode) || qs.get('unit') || '';
      const unit = (state.template.unitOptions || []).find((item) => item.code === unitCode);
      label = pickLabel(unit, 'label') || (unit && unit.label) || '';
    }
    if (!label) {
      label = qs.get('unit') || (state.meta && state.meta.defaults && state.meta.defaults.unitCode) || '';
    }
    if (els.unitValue) els.unitValue.textContent = label;
  }

  function updateDirty(nextDirty) {
    state.dirty = nextDirty;
    if (state.saving) {
      els.saveState.textContent = tt('checklist_saving', 'Saving…');
      return;
    }
    els.saveState.textContent = nextDirty ? tt('checklist_unsaved', 'Unsaved changes') : tt('checklist_saved', 'All changes saved');
  }

  function scheduleAutosave() {
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = window.setTimeout(() => {
      if (state.dirty && state.record && !isLockedRecord()) {
        saveMonth(false);
      }
    }, 3500);
  }

  function applyEditableState() {
    const locked = isLockedRecord();
    els.sectionRemarks.disabled = locked;
    els.finalizeBtn.style.display = locked ? 'none' : '';
    els.finalizeBtnSticky.style.display = locked ? 'none' : '';
    els.reopenBtn.style.display = locked ? '' : 'none';
    els.saveBtn.disabled = locked;
    els.saveBtnSticky.disabled = locked;
    if (state.record && state.record.status === 'verified') {
      els.monthStatus.textContent = tt('checklist_verified_status', 'Verified');
    } else {
      els.monthStatus.textContent = locked ? tt('checklist_finalized_status', 'Finalized') : tt('checklist_draft_status', 'Draft');
    }
    syncReportActions();
  }

  function renderHeader() {
    if (!state.template || !state.record) return;
    const title = pickLabel(state.template, 'title');
    els.templateMeta.innerHTML = `<strong>${esc(state.template.code)}</strong> Rev ${esc(state.template.revision)} · ${esc(title)} · ${state.template.sections.length} ${esc(tt('checklist_sections_word', 'sections'))}`;

    if (els.instructionPills) els.instructionPills.innerHTML = '';

    applyEditableState();
    els.summaryMeta.textContent = '';
    updateDirty(state.dirty);
  }

  function renderSectionStrip() {
    els.sectionStrip.innerHTML = state.template.sections.map((section) => {
      const active = section.id === state.activeSectionId ? ' active' : '';
      const sectionState = getSectionState(section.id);
      let checked = 0;
      let total = 0;
      Object.keys(sectionState.checks || {}).forEach((itemId) => {
        const values = sectionState.checks[itemId] || [];
        total += values.length;
        values.forEach((value) => { if (value) checked++; });
      });
      const done = total > 0 && checked === total;
      return `
        <button type="button" class="section-chip${active}" data-section-id="${esc(section.id)}">
          ${done ? '✓ ' : ''}${esc(pickLabel(section, 'title'))}
          <small></small>
        </button>
      `;
    }).join('');

    els.sectionStrip.querySelectorAll('[data-section-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeSectionId = button.getAttribute('data-section-id');
        state.activeFocusIndex = 0;
        renderActiveSection();
        renderSectionStrip();
      });
    });
  }

  function renderGrid(section) {
    const sectionState = getSectionState(section.id);
    const count = focusCountForSection(section);
    const headLabel = section.frequency === 'weekly' ? tt('checklist_week', 'Week') : tt('checklist_day', 'Day');
    let html = `<thead><tr><th class="item-col">${esc(tt('checklist_item_header', 'Checklist Item'))}</th>`;
    for (let i = 0; i < count; i++) {
      html += `<th>${headLabel} ${i + 1}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const item of section.items) {
      html += `<tr><td class="item-col">${esc(pickLabel(item, 'label'))}</td>`;
      const values = sectionState.checks[item.id] || [];
      for (let i = 0; i < count; i++) {
        const checked = Boolean(values[i]);
        html += `
          <td>
            <button
              type="button"
              class="cell-btn${checked ? ' checked' : ''}"
              data-item-id="${esc(item.id)}"
              data-col-index="${i}"
              aria-label="${esc(item.label)} ${headLabel} ${i + 1}"
            >${checked ? '✓' : '○'}</button>
          </td>
        `;
      }
      html += '</tr>';
    }

    html += '<tr class="bulk-row"><td class="bulk-label">' + esc(tt('checklist_bulk_row', 'Check All')) + '</td>';
    for (let i = 0; i < count; i++) {
      const allChecked = section.items.every((item) => Boolean((sectionState.checks[item.id] || [])[i]));
      html += `
        <td>
          <button
            type="button"
            class="bulk-btn"
            data-bulk-col-index="${i}"
            aria-label="${esc(tt('checklist_bulk_toggle', 'Check all for this day'))} ${headLabel} ${i + 1}"
          >${allChecked ? '✓' : '+'}</button>
        </td>
      `;
    }
    html += '</tr></tbody>';
    els.checkGrid.innerHTML = html;

    els.checkGrid.querySelectorAll('.cell-btn').forEach((button) => {
      button.addEventListener('click', () => {
        if (isLockedRecord()) return;
        toggleCell(section.id, button.getAttribute('data-item-id'), Number(button.getAttribute('data-col-index')));
      });
    });
    els.checkGrid.querySelectorAll('.bulk-btn').forEach((button) => {
      button.addEventListener('click', () => {
        if (isLockedRecord()) return;
        toggleColumn(section.id, Number(button.getAttribute('data-bulk-col-index')));
      });
    });
  }

  function getVisibleColumnCount(section) {
    const count = focusCountForSection(section);
    return Math.max(1, Math.min(section.frequency === 'weekly' ? 3 : 7, count));
  }

  function updateDateNav(section) {
    const count = focusCountForSection(section);
    const visibleCount = getVisibleColumnCount(section);
    const start = Math.min(state.activeFocusIndex + 1, count);
    const end = Math.min(state.activeFocusIndex + visibleCount, count);
    els.dateNavLabel.textContent = section.frequency === 'weekly'
      ? `${tt('checklist_weeks', 'Weeks')} ${start}-${end}`
      : `${tt('checklist_days', 'Days')} ${start}-${end}`;
    els.scrollPrevBtn.disabled = state.activeFocusIndex <= 0;
    els.scrollNextBtn.disabled = state.activeFocusIndex + visibleCount >= count;
  }

  function bindGridScroll(section) {
    const itemCol = els.checkGrid.querySelector('.item-col');
    const cellBtn = els.checkGrid.querySelector('.cell-btn');
    if (!itemCol || !cellBtn) {
      updateDateNav(section);
      return;
    }

    const cellWidth = cellBtn.offsetWidth || 46;
    const visibleCount = getVisibleColumnCount(section);
    const maxIndex = Math.max(0, focusCountForSection(section) - visibleCount);

    let ticking = false;
    els.gridWrap.onscroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const rawIndex = Math.round(Math.max(0, els.gridWrap.scrollLeft) / cellWidth);
        state.activeFocusIndex = Math.max(0, Math.min(maxIndex, rawIndex));
        updateDateNav(section);
        ticking = false;
      });
    };

    updateDateNav(section);
  }

  function scrollColumns(direction) {
    const section = currentSection();
    if (!section) return;
    const itemCol = els.checkGrid.querySelector('.item-col');
    const cellBtn = els.checkGrid.querySelector('.cell-btn');
    if (!itemCol || !cellBtn) return;

    const count = focusCountForSection(section);
    const step = getVisibleColumnCount(section);
    const maxIndex = Math.max(0, count - step);
    state.activeFocusIndex = Math.max(0, Math.min(maxIndex, state.activeFocusIndex + (direction * step)));

    const cellWidth = cellBtn.offsetWidth || 46;
    const targetLeft = cellWidth * state.activeFocusIndex;
    els.gridWrap.scrollTo({ left: targetLeft, behavior: 'smooth' });
    updateDateNav(section);
  }

  function renderActiveSection() {
    const section = currentSection();
    if (!section) return;
    const sectionState = getSectionState(section.id);

    els.sectionTitle.textContent = pickLabel(section, 'title');
    els.sectionSub.textContent = `${section.frequency === 'weekly' ? tt('checklist_weekly', 'Weekly') : tt('checklist_daily', 'Daily')} ${tt('checklist_sheet', 'checklist')}. ${tt('checklist_section_hint', 'Use the arrow buttons to move across the dates without relying on swipe scrolling.')}`;
    els.sectionRemarks.value = sectionState.remarks || '';
    els.sectionMeta.innerHTML = `
      <strong>${section.frequency === 'weekly' ? tt('checklist_weekly_section', 'Weekly section') : tt('checklist_daily_section', 'Daily section')}</strong><br>
      ${focusCountForSection(section)} ${section.frequency === 'weekly' ? tt('checklist_weekly_slots', 'weekly slots') : tt('checklist_day_columns', 'day columns')}<br>
      ${tt('checklist_last_edit', 'Last section edit')}: ${sectionState.lastEditedByName ? esc(sectionState.lastEditedByName) + ' ' + tt('checklist_on', 'on') + ' ' + esc(formatDateTime(sectionState.lastEditedAt)) : tt('checklist_not_saved_yet', 'Not saved yet')}
    `;

    renderGrid(section);
    applyEditableState();
    bindGridScroll(section);
  }

  function toggleCell(sectionId, itemId, colIndex, forceValue) {
    const sectionState = getSectionState(sectionId);
    if (!Array.isArray(sectionState.checks[itemId])) return;
    const current = Boolean(sectionState.checks[itemId][colIndex]);
    sectionState.checks[itemId][colIndex] = typeof forceValue === 'boolean' ? forceValue : !current;
    updateDirty(true);
    renderSectionStrip();
    renderHeader();
    renderActiveSection();
    scheduleAutosave();
  }

  function toggleColumn(sectionId, colIndex) {
    const section = state.template.sections.find((item) => item.id === sectionId);
    const sectionState = getSectionState(sectionId);
    if (!section) return;
    const shouldCheck = !section.items.every((item) => Boolean((sectionState.checks[item.id] || [])[colIndex]));
    for (const item of section.items) {
      if (Array.isArray(sectionState.checks[item.id])) {
        sectionState.checks[item.id][colIndex] = shouldCheck;
      }
    }
    updateDirty(true);
    renderSectionStrip();
    renderHeader();
    renderActiveSection();
    scheduleAutosave();
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function loadMeta() {
    const data = await fetchJson('/api/foodsafety-checklists/meta');
    state.meta = data;
    state.template = data.template;
    els.monthInput.value = qs.get('month') || data.defaults.monthKey;
    renderUnitValue();
  }

  async function loadMonth() {
    const monthKey = els.monthInput.value;
    const unitCode = qs.get('unit') || (state.meta && state.meta.defaults && state.meta.defaults.unitCode) || '';
    const templateCode = qs.get('template') || '';
    const data = await fetchJson(`/api/foodsafety-checklists/month?template=${encodeURIComponent(templateCode)}&month=${encodeURIComponent(monthKey)}&unit=${encodeURIComponent(unitCode)}`);
    state.template = data.template;
    state.record = data.record;
    qs.set('template', data.record.templateCode);
    qs.set('unit', data.record.unitCode);
    qs.set('month', data.record.monthKey);
    const nextUrl = `${window.location.pathname}?${qs.toString()}`;
    window.history.replaceState({}, '', nextUrl);
    state.activeSectionId = state.activeSectionId || data.template.sections[0].id;
    if (!data.template.sections.some((section) => section.id === state.activeSectionId)) {
      state.activeSectionId = data.template.sections[0].id;
    }
    renderUnitValue();
    state.activeFocusIndex = 0;
    updateDirty(false);
    renderHeader();
    renderSectionStrip();
    renderActiveSection();
  }

  async function saveMonth(showToast) {
    if (!state.record || state.saving) return;
    state.saving = true;
    updateDirty(state.dirty);
    try {
      const payload = {
        templateCode: state.record.templateCode,
        monthKey: state.record.monthKey,
        unitCode: state.record.unitCode,
        data: state.record.data
      };
      const data = await fetchJson('/api/foodsafety-checklists/month', {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      state.record = data.record;
      state.saving = false;
      updateDirty(false);
      renderHeader();
      renderSectionStrip();
      renderActiveSection();
      if (showToast) showMessage('success', tt('checklist_draft_saved', 'Draft saved'));
    } catch (err) {
      state.saving = false;
      updateDirty(true);
      showMessage('error', err.message);
    }
  }

  async function finalizeMonth() {
    if (!state.record) return;
    if (state.dirty) await saveMonth(false);
    try {
      const signerName = String(els.signerNameInput.value || '').trim();
      const typedSignature = signerName;
      const signatureDataUrl = getSignatureDataUrl();
      const confirmed = els.finalizeConfirm.checked === true;
      const authUser = window._authUser || {};
      const data = await fetchJson('/api/foodsafety-checklists/month/finalize', {
        method: 'POST',
        body: JSON.stringify({
          templateCode: state.record.templateCode,
          monthKey: state.record.monthKey,
          unitCode: state.record.unitCode,
          signerName,
          signerPosition: authUser && authUser.position ? authUser.position : '',
          typedSignature,
          signatureDataUrl,
          confirmed
        })
      });
      state.record = data.record;
      updateDirty(false);
      renderHeader();
      renderSectionStrip();
      renderActiveSection();
      await ensureArchivedPdf(false);
      closeFinalizeModal();
      showMessage('success', tt('checklist_month_finalized', 'Month finalized'));
    } catch (err) {
      showMessage('error', err.message);
    }
  }

  async function reopenMonth() {
    if (!state.record) return;
    try {
      const data = await fetchJson('/api/foodsafety-checklists/month/reopen', {
        method: 'POST',
        body: JSON.stringify({
          templateCode: state.record.templateCode,
          monthKey: state.record.monthKey,
          unitCode: state.record.unitCode
        })
      });
      state.record = data.record;
      updateDirty(false);
      renderHeader();
      renderSectionStrip();
      renderActiveSection();
      showMessage('success', tt('checklist_month_reopened', 'Month reopened'));
    } catch (err) {
      showMessage('error', err.message);
    }
  }

  els.sectionRemarks.addEventListener('input', () => {
    const section = currentSection();
    if (!section || isLockedRecord()) return;
    getSectionState(section.id).remarks = els.sectionRemarks.value;
    updateDirty(true);
    scheduleAutosave();
  });

  els.reloadBtn.addEventListener('click', loadMonth);
  els.saveBtn.addEventListener('click', () => saveMonth(true));
  els.saveBtnSticky.addEventListener('click', () => saveMonth(true));
  els.finalizeBtn.addEventListener('click', openFinalizeModal);
  els.finalizeBtnSticky.addEventListener('click', openFinalizeModal);
  els.reopenBtn.addEventListener('click', reopenMonth);
  els.scrollPrevBtn.addEventListener('click', () => scrollColumns(-1));
  els.scrollNextBtn.addEventListener('click', () => scrollColumns(1));
  els.clearSignatureBtn.addEventListener('click', clearSignaturePad);
  els.cancelFinalizeBtn.addEventListener('click', closeFinalizeModal);
  els.confirmFinalizeBtn.addEventListener('click', finalizeMonth);
  els.finalizeModal.addEventListener('click', (event) => {
    if (event.target === els.finalizeModal) closeFinalizeModal();
  });

  els.monthInput.addEventListener('change', loadMonth);
  els.signerNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      finalizeMonth();
    }
  });
  if (els.signatureCanvas) {
    els.signatureCanvas.addEventListener('pointerdown', startSignature);
    els.signatureCanvas.addEventListener('pointermove', moveSignature);
    els.signatureCanvas.addEventListener('pointerup', endSignature);
    els.signatureCanvas.addEventListener('pointerleave', endSignature);
  }
  window.addEventListener('resize', () => {
    if (els.finalizeModal.classList.contains('open')) resizeSignatureCanvas();
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  (async function init() {
    try {
      await loadMeta();
      await loadMonth();
      if (i18n && typeof i18n.onChange === 'function') {
        i18n.onChange(() => {
          if (state.template && state.record) {
            renderUnitValue();
            renderHeader();
            renderSectionStrip();
            renderActiveSection();
          }
        });
      }
    } catch (err) {
      showMessage('error', err.message);
    }
  }());
}());
