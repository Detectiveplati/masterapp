// Food Safety NC Frontend Logic

// --- Utility: show notice ---
function showNotice(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'notice ' + type;
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- Report NC Form Submission ---
if (document.getElementById('ncForm')) {
  document.getElementById('ncForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData();
    fd.append('unit',             form.unit.value);
    fd.append('specificLocation', form.specificLocation.value);
    fd.append('description',      form.description.value);
    fd.append('priority',         form.priority.value);
    fd.append('reportedBy',       form.reportedBy.value);
    const photoFile = document.getElementById('photoInput').files[0];
    if (photoFile) fd.append('photo', photoFile);
    try {
      const res = await fetch('/api/foodsafety/report', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Failed to submit');
      showNotice('notice', 'success', '✅ NC report submitted successfully! Redirecting…');
      setTimeout(() => window.location.href = 'nc-list.html', 1500);
    } catch (err) {
      showNotice('notice', 'error', '❌ Error: ' + err.message);
    }
  });
}

// --- List NCs ---
if (document.getElementById('ncList')) {
  async function loadNCs() {
    const unit = document.getElementById('filterUnit').value;
    const status = document.getElementById('filterStatus').value;
    let url = '/api/foodsafety/list?';
    if (unit) url += 'unit=' + encodeURIComponent(unit) + '&';
    if (status) url += 'status=' + encodeURIComponent(status);
    try {
      const res = await fetch(url);
      const ncs = await res.json();
      const list = document.getElementById('ncList');
      if (!ncs.length) {
        list.innerHTML = '<div class="empty-state">No NC reports found.</div>';
        return;
      }
      list.innerHTML = ncs.map(nc => {
        const badgeCls = nc.status === 'Resolved' ? 'badge-resolved' : 'badge-open';
        const urgentBadge = nc.priority === 'Urgent' ? `<span class="badge badge-urgent" style="margin-left:6px">Urgent</span>` : '';
        return `
          <a class="nc-card" href="nc-detail.html?id=${nc._id}" style="text-decoration:none;color:inherit;">
            <div class="nc-card-header">
              <span class="nc-card-title">${nc.unit}${nc.specificLocation ? ' — ' + nc.specificLocation : ''}</span>
              <span>
                <span class="badge ${badgeCls}">${nc.status}</span>${urgentBadge}
              </span>
            </div>
            <div class="nc-card-meta">${(nc.description || '').slice(0, 140)}</div>
            <div class="nc-card-meta">Reported by ${nc.reportedBy} · ${new Date(nc.createdAt).toLocaleDateString()}</div>
          </a>`;
      }).join('');
    } catch (err) {
      document.getElementById('ncList').innerHTML = '<div class="empty-state">Error loading reports: ' + err.message + '</div>';
    }
  }
  document.getElementById('filterUnit').addEventListener('change', loadNCs);
  document.getElementById('filterStatus').addEventListener('change', loadNCs);
  loadNCs();
}

// --- NC Detail & Resolution ---
if (document.getElementById('ncDetail')) {
  async function loadDetail() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) { document.getElementById('detailTitle').textContent = 'No NC ID provided'; return; }
    try {
      const res = await fetch('/api/foodsafety/' + id);
      const nc = await res.json();

      const titleEl = document.getElementById('detailTitle');
      const subEl   = document.getElementById('detailSubtitle');
      if (titleEl) titleEl.textContent = nc.unit + (nc.specificLocation ? ' — ' + nc.specificLocation : '');
      const badgeCls = nc.status === 'Resolved' ? 'badge-resolved' : 'badge-open';
      const urgentBadge = nc.priority === 'Urgent' ? `<span class="badge badge-urgent" style="margin-left:6px">Urgent</span>` : '';
      if (subEl) subEl.innerHTML = `<span class="badge ${badgeCls}">${nc.status}</span>${urgentBadge} &nbsp; Reported ${new Date(nc.createdAt).toLocaleString()} by ${nc.reportedBy}`;

      const detailEl = document.getElementById('ncDetail');
      detailEl.innerHTML = `
        <div class="summary-grid">
          <div class="summary-item"><div class="summary-label">Unit / Area</div><div class="summary-value">${nc.unit}</div></div>
          <div class="summary-item"><div class="summary-label">Specific Location</div><div class="summary-value">${nc.specificLocation || '—'}</div></div>
          <div class="summary-item"><div class="summary-label">Priority</div><div class="summary-value">${nc.priority || 'Normal'}</div></div>
          <div class="summary-item"><div class="summary-label">Reported By</div><div class="summary-value">${nc.reportedBy}</div></div>
        </div>
        <div class="description-block">
          <div class="summary-label">Non-Conformance Description</div>
          <p>${nc.description}</p>
        </div>
        ${nc.photo ? `<div class="nc-photo"><div class="summary-label">Photo</div><img src="${nc.photo}" alt="NC photo"></div>` : ''}
        ${nc.status === 'Resolved' && nc.resolution ? `
        <div class="description-block" style="margin-top:16px;border-color:rgba(39,174,96,0.3);background:rgba(39,174,96,0.05)">
          <div class="summary-label" style="color:#1f7a4a">Resolution</div>
          <div class="summary-grid" style="margin-top:10px">
            <div class="summary-item"><div class="summary-label">Resolved By</div><div class="summary-value">${nc.resolution.resolver || '—'}</div></div>
            <div class="summary-item"><div class="summary-label">Resolved At</div><div class="summary-value">${nc.resolution.resolvedAt ? new Date(nc.resolution.resolvedAt).toLocaleString() : '—'}</div></div>
          </div>
          <p><strong>Notes:</strong> ${nc.resolution.notes || '—'}</p>
          ${nc.resolution.photo ? `<div class="nc-photo"><img src="${nc.resolution.photo}" alt="Resolution photo"></div>` : ''}
        </div>` : ''}
      `;

      const resSection   = document.getElementById('resolutionSection');
      const resActions   = document.getElementById('resolvedActions');
      if (nc.status === 'Resolved') {
        if (resSection) resSection.style.display = 'none';
        if (resActions) resActions.style.display = 'flex';
      } else {
        if (resSection) resSection.style.display = 'block';
        if (resActions) resActions.style.display = 'none';
      }
    } catch (err) {
      document.getElementById('ncDetail').innerHTML = '<p style="color:var(--accent)">Error loading NC report: ' + err.message + '</p>';
    }
  }

  loadDetail();

  // --- Resolution form ---
  document.getElementById('resolutionForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const fd = new FormData();
    fd.append('resolver',       this.resolver.value);
    fd.append('notes',          this.resolutionNotes.value);
    const resPhoto = document.getElementById('resolutionPhotoInput').files[0];
    if (resPhoto) fd.append('resolutionPhoto', resPhoto);
    try {
      const res = await fetch('/api/foodsafety/' + id + '/resolve', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Failed to resolve');
      showNotice('notice', 'success', '✅ Marked as resolved! Reloading…');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      showNotice('notice', 'error', '❌ Error: ' + err.message);
    }
  });
}

