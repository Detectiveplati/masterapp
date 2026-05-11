# Component Library — Master App

All components live in `public/css/app.css`. Copy-paste ready HTML examples with the correct class names.

---

## Layout Shell

Every page using the standard shell has this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <script>document.documentElement.style.visibility='hidden'</script>
  <script src="/auth-guard.js"></script>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title — Central Kitchen</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body data-module="[module-name]">
  <!-- #topnav and #sidenav injected by shell.js -->
  <main>
    <!-- page content here -->
  </main>
  <script src="/js/shell.js"></script>
  <script>
    /* page-specific JS */
  </script>
</body>
</html>
```

---

## Buttons

### Primary (accent colour)
```html
<button class="btn btn-primary">Save Changes</button>
<button class="btn btn-primary btn-sm">Add Item</button>
<a href="/some/path" class="btn btn-primary">Go to Report</a>
```

### Secondary (white/outline)
```html
<button class="btn btn-secondary">Cancel</button>
<button class="btn btn-secondary btn-sm">Reset</button>
```

### Success
```html
<button class="btn btn-success">Mark Complete</button>
```

### Danger
```html
<button class="btn btn-danger">Delete Record</button>
```

### Outline (transparent, border only)
```html
<button class="btn btn-outline">View Details</button>
```

### With icon
```html
<button class="btn btn-primary">
  <span class="action-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  </span>
  New Session
</button>
```

### Button Group (export row)
```html
<div style="display:flex;gap:10px;flex-wrap:wrap">
  <button class="btn btn-primary">Submit</button>
  <button class="btn btn-secondary">Save Draft</button>
  <button class="btn btn-outline btn-sm">Export CSV</button>
</div>
```

---

## Cards

### Basic Card
```html
<div class="card">
  <p>Content goes here.</p>
</div>
```

### Section Card (with header strip)
```html
<section>
  <h2>Section Title</h2>
  <p>Content goes here.</p>
</section>
```
Or using class:
```html
<div class="section-card">
  <h2 style="/* section-card h2 styles from app.css */">Section Title</h2>
  <p>Content here.</p>
</div>
```

### Stat Card (dashboard metrics)
```html
<div class="stat-card">
  <div class="val" id="totalCount">—</div>
  <div class="lbl">Total Records</div>
</div>

<!-- With status colour -->
<div class="stat-card danger">
  <div class="val" id="alertCount">—</div>
  <div class="lbl">Active Alerts</div>
</div>

<div class="stat-card warn">
  <div class="val">3</div>
  <div class="lbl">Pending Review</div>
</div>

<div class="stat-card ok">
  <div class="val">12</div>
  <div class="lbl">Completed Today</div>
</div>
```

### Stats Row (grid of stat cards)
```html
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px">
  <div class="stat-card"><div class="val" id="s1">—</div><div class="lbl">Label 1</div></div>
  <div class="stat-card danger"><div class="val" id="s2">—</div><div class="lbl">Label 2</div></div>
  <div class="stat-card ok"><div class="val" id="s3">—</div><div class="lbl">Label 3</div></div>
</div>
```

### Hub Card (module launcher)
```html
<a href="/module-path/" class="hub-card [module-name]" data-perm="[module-name]">
  <div class="icon" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <!-- icon path -->
    </svg>
  </div>
  <h2>Module Name</h2>
  <p>Short description of what this module does.</p>
  <div class="lock-note">No access. Contact administrator.</div>
  <div class="go-btn">Open Module
    <span class="go-arrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round">
      <path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>
    </svg></span>
  </div>
</a>
```

---

## Navigation

### Tab Bar (in-page tabs)
```html
<div class="tab-bar">
  <button class="tab-btn active" data-tab="overview" onclick="switchTab(this)">Overview</button>
  <button class="tab-btn" data-tab="records" onclick="switchTab(this)">Records</button>
  <button class="tab-btn" data-tab="settings" onclick="switchTab(this)">Settings</button>
</div>
```

JavaScript to activate:
```javascript
function switchTab(btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // show/hide panel logic
}
```

### Nav Links (horizontal page nav)
```html
<div class="nav-links" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:22px">
  <a href="/module/" class="nav-link active">Dashboard</a>
  <a href="/module/list.html" class="nav-link">Records</a>
  <a href="/module/report.html" class="nav-link">Report</a>
</div>
```

---

## Forms

### Form Group (label + input)
```html
<div class="form-group">
  <label>Inspection Date <span class="required">*</span></label>
  <input type="date" name="inspectionDate" required>
</div>
```

### Form Row (two columns)
```html
<div class="form-row">
  <div class="form-group">
    <label>First Name</label>
    <input type="text" name="firstName">
  </div>
  <div class="form-group">
    <label>Last Name</label>
    <input type="text" name="lastName">
  </div>
</div>
```

### Form Container (full form page)
```html
<div class="form-container">
  <div class="form-header">
    <h2>Create New Record</h2>
    <p>All fields marked * are required.</p>
  </div>
  <form id="myForm">
    <div class="form-group">
      <label>Item Name <span class="required">*</span></label>
      <input type="text" required>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea rows="4"></textarea>
    </div>
    <div id="formMsg" class="msg"></div>
    <button type="submit" class="btn btn-primary">Save Record</button>
  </form>
</div>
```

### Toolbar (filter bar above a list)
```html
<div class="toolbar">
  <div class="search-box">
    <input type="search" placeholder="Search records…">
  </div>
  <div class="filter-group">
    <select>
      <option value="">All Status</option>
      <option value="active">Active</option>
      <option value="closed">Closed</option>
    </select>
    <select>
      <option value="">All Dates</option>
    </select>
  </div>
  <button class="btn btn-primary btn-sm">Export</button>
</div>
```

---

## Data Table

```html
<div class="data-table-wrap">
  <table class="data-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Item</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="tableBody">
      <tr>
        <td>2026-05-01</td>
        <td>Refrigerator Unit A</td>
        <td><span class="badge badge-success">Operational</span></td>
        <td>
          <button class="btn btn-outline btn-sm">View</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

## Badges

```html
<!-- Status -->
<span class="badge badge-success">Operational</span>
<span class="badge badge-danger">Critical</span>
<span class="badge badge-warning">Pending</span>
<span class="badge badge-info">In Review</span>
<span class="badge badge-neutral">Inactive</span>

<!-- Text only — no class needed, just inline colour via modifier on parent -->
<span class="status-badge status-operational">Operational</span>
<span class="status-badge status-needs_action">Needs Action</span>
<span class="status-badge status-maintenance">Maintenance</span>
<span class="status-badge status-offline">Offline</span>
```

---

## Notices & Messages

### Inline notice (always visible)
```html
<div class="notice success">Record saved successfully.</div>
<div class="notice error">An error occurred. Please try again.</div>
```

### JavaScript-controlled message
```html
<div id="msg" class="msg"></div>

<script>
function showMsg(text, type = 'success') {
  const el = document.getElementById('msg');
  el.className = `msg ${type}`;
  el.textContent = text;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}
</script>
```

### Toast (top-right popup)
```html
<!-- HTML: one toast element, reused via JS -->
<div id="toast" class="toast" style="display:none"></div>

<script>
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ` ${type}` : '');
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}
// Usage:
showToast('Record saved.');
showToast('Failed to connect.', 'error');
</script>
```

---

## Modal

```html
<!-- Trigger -->
<button class="btn btn-primary" onclick="document.getElementById('myModal').classList.add('open')">
  Open Modal
</button>

<!-- Modal structure -->
<div id="myModal" class="modal-overlay" onclick="if(event.target===this)this.classList.remove('open')">
  <div style="background:var(--card);border-radius:8px;padding:28px;width:min(96vw,480px);
              box-shadow:0 16px 48px rgba(0,0,0,0.2)">
    <h3 style="font-size:1.1rem;margin-bottom:20px;color:var(--ink)">Modal Title</h3>

    <div class="form-group">
      <label>Field Label</label>
      <input type="text" placeholder="Enter value">
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:22px">
      <button class="btn btn-secondary"
              onclick="document.getElementById('myModal').classList.remove('open')">
        Cancel
      </button>
      <button class="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

---

## Empty State

```html
<div class="empty-state">
  <div class="icon" style="font-size:2.5rem;margin-bottom:12px">📋</div>
  <p>No records found.</p>
</div>
```

Or with SVG icon:
```html
<div class="empty-state">
  <div class="icon" style="width:36px;height:36px;margin:0 auto 12px;color:#98a2b3" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round">
      <!-- icon path -->
    </svg>
  </div>
  <p>No records yet. <a href="#">Create the first one →</a></p>
</div>
```

---

## Status Bar (live system status)

```html
<div class="status-bar">
  <span class="status-dot"></span>
  <span id="systemStatus">All systems operational</span>
  <span id="lastSync" style="margin-left:auto;font-size:0.76rem;color:var(--muted)">
    Last sync: just now
  </span>
</div>
```

---

## Page Header Pattern (standard for module pages)

```html
<main>
  <!-- Nav links (when module has sub-pages) -->
  <div class="nav-links" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:22px">
    <a href="/module/" class="nav-link active">Dashboard</a>
    <a href="/module/list.html" class="nav-link">Records</a>
  </div>

  <!-- Page header with action buttons -->
  <div style="display:flex;align-items:center;justify-content:space-between;
              flex-wrap:wrap;gap:12px;margin-bottom:24px">
    <h1 style="font-size:1.35rem;font-weight:900;color:var(--ink);margin:0">
      Page Title
    </h1>
    <div style="display:flex;gap:10px">
      <button class="btn btn-secondary btn-sm">Export</button>
      <button class="btn btn-primary" onclick="openCreateModal()">+ New Record</button>
    </div>
  </div>

  <!-- Stat summary -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
              gap:16px;margin-bottom:28px">
    <div class="stat-card"><div class="val" id="s1">—</div><div class="lbl">Total</div></div>
    <div class="stat-card danger"><div class="val" id="s2">—</div><div class="lbl">Critical</div></div>
    <div class="stat-card ok"><div class="val" id="s3">—</div><div class="lbl">Resolved</div></div>
  </div>

  <!-- Main content -->
  <section>
    <h2>Records</h2>
    <div class="toolbar">...</div>
    <div class="data-table-wrap">
      <table class="data-table">...</table>
    </div>
  </section>
</main>
```

---

## Accessibility Checklist per Component

| Component | Required Attribute |
|-----------|-------------------|
| Icon-only button | `aria-label="Action Name"` |
| Decorative SVG | `aria-hidden="true"` |
| Form input | Associated `<label>` element |
| Modal | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="..."` on wrapper |
| Status badge | Text label (not colour alone) |
| Loading state | `aria-live="polite"` or `aria-busy="true"` on container |
| Error message | `role="alert"` for immediate announcement |
| Required field | `aria-required="true"` or `required` attribute |
