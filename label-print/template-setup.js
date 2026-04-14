const API_BASE = `${window.location.origin}/api/label-print`;

const templateSearchInputEl = document.getElementById('template-search-input');
const templateStatusFilterEl = document.getElementById('template-status-filter');
const refreshTemplatesButtonEl = document.getElementById('refresh-templates-button');
const newTemplateButtonEl = document.getElementById('new-template-button');
const templateSetupListEl = document.getElementById('template-setup-list');
const templateSetupEmptyEl = document.getElementById('template-setup-empty');
const templateEditorModalEl = document.getElementById('template-editor-modal');
const templateEditorTitleEl = document.getElementById('template-editor-title');
const templateEditorCloseButtonEl = document.getElementById('template-editor-close-button');
const templateNameChineseInputEl = document.getElementById('template-name-chinese-input');
const templateNameEnglishInputEl = document.getElementById('template-name-english-input');
const templateNumberInputEl = document.getElementById('template-number-input');
const templateHeightInputEl = document.getElementById('template-height-input');
const templateDescriptionInputEl = document.getElementById('template-description-input');
const templateActiveInputEl = document.getElementById('template-active-input');
const templateUsageCountEl = document.getElementById('template-usage-count');
const templateEditorKeyEl = document.getElementById('template-editor-key');
const templateEditorSaveButtonEl = document.getElementById('template-editor-save-button');
const templateSetupToastEl = document.getElementById('template-setup-toast');

const state = {
  templates: [],
  activeTemplateId: '',
  saving: false
};

templateSearchInputEl.addEventListener('input', renderTemplates);
templateStatusFilterEl.addEventListener('change', loadTemplates);
refreshTemplatesButtonEl.addEventListener('click', loadTemplates);
newTemplateButtonEl.addEventListener('click', () => openTemplateEditor(null));
templateEditorCloseButtonEl.addEventListener('click', closeTemplateEditor);
templateEditorSaveButtonEl.addEventListener('click', saveTemplate);
document.querySelectorAll('[data-close-template-modal="true"]').forEach((el) => el.addEventListener('click', closeTemplateEditor));

loadTemplates();

async function loadTemplates() {
  try {
    const activeFilter = templateStatusFilterEl.value === 'all' ? 'false' : 'true';
    const templates = await fetchJson(`${API_BASE}/templates?active=${encodeURIComponent(activeFilter)}`);
    state.templates = Array.isArray(templates) ? templates : [];
    renderTemplates();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not load templates. / 无法加载模板。');
  }
}

function renderTemplates() {
  const query = templateSearchInputEl.value.trim().toLowerCase();
  const filtered = state.templates.filter((template) => {
    if (!query) return true;
    return [
      template.nameEnglish || template.name || '',
      template.nameChinese || '',
      template.description || '',
      String(template.printerTemplateNumber || '')
    ].join(' ').toLowerCase().includes(query);
  });

  templateSetupEmptyEl.classList.toggle('hidden', filtered.length > 0);
  templateSetupListEl.innerHTML = filtered.map(renderTemplateCard).join('');

  templateSetupListEl.querySelectorAll('[data-action="edit-template"]').forEach((button) => {
    button.addEventListener('click', () => {
      const template = state.templates.find((entry) => entry._id === button.dataset.templateId);
      if (template) openTemplateEditor(template);
    });
  });
}

function renderTemplateCard(template) {
  return `
    <article class="template-setup-item ${template.active === false ? 'template-setup-item-inactive' : ''}">
      <div class="template-setup-item-main">
        <div class="template-setup-item-names">
          <strong>${escapeHtml(template.nameChinese || '未填写中文名')}</strong>
          <span>${escapeHtml(template.nameEnglish || template.name || 'Untitled template')}</span>
        </div>
        <div class="template-setup-item-meta">
          <span class="template-number-pill">#${escapeHtml(String(template.printerTemplateNumber || '-'))}</span>
          <span>${escapeHtml(template.description || 'No description / 无描述')}</span>
          <span>${escapeHtml(`${template.usageCount || 0} linked item${template.usageCount === 1 ? '' : 's'} / ${template.usageCount || 0} 个关联项目`)}</span>
        </div>
      </div>
      <div class="template-setup-item-actions">
        <span class="job-status ${template.active === false ? 'failed' : 'success'}">${template.active === false ? 'Inactive / 停用' : 'Active / 启用'}</span>
        <button class="btn-secondary" type="button" data-action="edit-template" data-template-id="${escapeHtml(template._id)}">Edit / 编辑</button>
      </div>
    </article>
  `;
}

function openTemplateEditor(template) {
  state.activeTemplateId = template ? template._id : '';
  templateEditorTitleEl.textContent = template ? 'Edit Template / 编辑模板' : 'New Template / 新建模板';
  templateNameChineseInputEl.value = template ? (template.nameChinese || '') : '';
  templateNameEnglishInputEl.value = template ? (template.nameEnglish || template.name || '') : '';
  templateNumberInputEl.value = template ? String(template.printerTemplateNumber || '') : '';
  templateHeightInputEl.value = template ? String(template.heightMm || 62) : '62';
  templateDescriptionInputEl.value = template ? (template.description || '') : '';
  templateActiveInputEl.checked = template ? template.active !== false : true;
  templateUsageCountEl.textContent = template
    ? `${template.usageCount || 0} linked item${template.usageCount === 1 ? '' : 's'} / ${template.usageCount || 0} 个关联项目`
    : '0 linked items / 0 个关联项目';
  templateEditorKeyEl.textContent = template
    ? `Template key / 模板键值: ${template.key}`
    : 'Key will be created automatically for new templates. / 新模板会自动生成键值。';
  templateEditorModalEl.classList.remove('hidden');
  templateEditorModalEl.setAttribute('aria-hidden', 'false');
}

function closeTemplateEditor(force = false) {
  if (state.saving && !force) return;
  templateEditorModalEl.classList.add('hidden');
  templateEditorModalEl.setAttribute('aria-hidden', 'true');
  state.activeTemplateId = '';
}

async function saveTemplate() {
  if (state.saving) return;
  const payload = {
    nameEnglish: templateNameEnglishInputEl.value.trim(),
    nameChinese: templateNameChineseInputEl.value.trim(),
    name: templateNameEnglishInputEl.value.trim(),
    printerTemplateNumber: Number(templateNumberInputEl.value),
    heightMm: Number(templateHeightInputEl.value),
    description: templateDescriptionInputEl.value.trim(),
    active: templateActiveInputEl.checked
  };

  if (!payload.nameEnglish) {
    showToast('Enter the English name first. / 请先填写英文名。');
    return;
  }
  if (!Number.isFinite(payload.printerTemplateNumber) || payload.printerTemplateNumber < 1 || payload.printerTemplateNumber > 255) {
    showToast('Template number must be between 1 and 255. / 模板编号必须在 1 到 255 之间。');
    return;
  }

  try {
    state.saving = true;
    templateEditorSaveButtonEl.disabled = true;
    templateEditorSaveButtonEl.textContent = 'Saving… / 保存中…';

    if (state.activeTemplateId) {
      await fetchJson(`${API_BASE}/templates/${encodeURIComponent(state.activeTemplateId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Template updated. / 模板已更新。');
    } else {
      await fetchJson(`${API_BASE}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showToast('Template created. / 模板已创建。');
    }

    closeTemplateEditor(true);
    await loadTemplates();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Could not save template. / 无法保存模板。');
  } finally {
    state.saving = false;
    templateEditorSaveButtonEl.disabled = false;
    templateEditorSaveButtonEl.textContent = 'Save Template / 保存模板';
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

function showToast(message) {
  templateSetupToastEl.textContent = message;
  templateSetupToastEl.classList.remove('hidden');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => templateSetupToastEl.classList.add('hidden'), 3200);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
