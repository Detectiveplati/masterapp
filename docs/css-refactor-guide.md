# CSS Refactor Guide — Master App

Step-by-step code changes with before/after snippets.

---

## Step 1: Clean app.css (app.css lines 7–51 deletion)

**File**: `public/css/app.css`

Delete the entire original `:root` block and the first set of per-module accent overrides.

```css
/* ── DELETE THESE LINES (7–51): ───────────────────────────────────────────── */
:root {
  --ink:        #121316;
  --muted:      #5a616c;
  --bg:         #f4f5f7;
  --card:       #ffffff;
  --border:     rgba(18, 19, 22, 0.09);
  --shadow:     rgba(18, 19, 22, 0.08);
  --success:    #27ae60;
  --danger:     #c0392b;
  --warning:    #d97706;
  --urgent:     #9333ea;
  --steel:      #bfc8cc;
  --btn-text:   #ffffff;

  --clr-maintenance: #ff7a18;
  /* ... all other --clr-* variables ... */
  --accent:   #ff7a18;
  --accent-2: #e74c3c;
  --topnav-h:  62px;
  --sidenav-w: 252px;
}

/* DELETE these first accent override rules too (they're overridden later anyway): */
body[data-module="maintenance"] { --accent: #ff7a18; --accent-2: #e74c3c; }
body[data-module="templog"]     { --accent: #3aa6ff; --accent-2: #0e7fd6; }
/* ... etc ... */
```

After deletion, the first CSS rule should be `/* ── 1. Reset & Base ── */`.

**Then add the pest accent** to the Professional Refresh block (around line 1070 after cleanup):

```css
/* ADD THIS LINE: */
body[data-module="pest"]        { --accent: #166534; --accent-2: #14532d; }
```

---

## Step 2: Migrate a Maintenance Sub-page (template)

Using `maintenance/equipment-list.html` as the example.

### Before (in `<head>`):
```html
<link rel="stylesheet" href="/maintenance/css/styles.css">
```

### After (in `<head>`):
```html
<link rel="stylesheet" href="/css/app.css">
```

### Before `<body>`:
```html
<body>
```

### After `<body>`:
```html
<body data-module="maintenance">
```

### Before — standalone `<header>` block:
```html
<header>
  <div class="header-content">
    <img class="site-logo" src="/images/logo.png">
    <div class="header-text">
      <h1>Equipment List</h1>
      <p>Central Kitchen Maintenance</p>
    </div>
  </div>
  <div class="nav-links">
    <a href="/maintenance/maintenance.html">Dashboard</a>
    <a href="/maintenance/equipment-list.html" class="active">Equipment</a>
  </div>
</header>
```

### After — remove the `<header>` block entirely:
The `#topnav` and `#sidenav` are injected by `/js/shell.js`. Add the script at the bottom of `<body>` if not already present:
```html
<script src="/js/shell.js"></script>
```

The `<main>` content stays unchanged — app.css `.section-card`, `.data-table`, `.btn`, etc. all map to the same HTML structure.

### Before — button styles:
```html
<!-- Old standalone CSS buttons -->
<button onclick="someAction()">Save Record</button>
<button class="test-button">Test Connection</button>
```

### After — with app.css classes:
```html
<button class="btn btn-primary" onclick="someAction()">Save Record</button>
<button class="btn btn-secondary">Test Connection</button>
```

### Before — section heading:
```html
<section>
  <h2>🔧 Equipment Status</h2>
  <!-- content -->
</section>
```

### After — no change needed:
`section h2` is styled identically by app.css. Only difference: app.css removes the orange border-left and replaces with a `border-bottom` inside a `#fcfcfd` background strip. The HTML is unchanged.

---

## Step 3: Replace Pest Inline Styles

**File**: `pest/index.html`

Create `pest/styles.css` and replace the inline `<style>` block.

### Before (inline `<style>` in `<head>`):
```html
<style>
  .btn{padding:10px 20px;border:none;border-radius:10px;cursor:pointer;...}
  .btn-green{background:linear-gradient(135deg,var(--accent),var(--accent-2));...box-shadow:0 3px 10px rgba(46,125,50,0.25)}
  .btn-grey{background:linear-gradient(135deg,#546e7a,#78909c);color:#fff;...}
  .stat-card{background:var(--card);border:1px solid var(--border);border-radius:14px;...}
  ...
</style>
```

### After — create `pest/styles.css`:
```css
/* pest/styles.css — pest-specific components only */

/* Session list */
.sessions-list { display: flex; flex-direction: column; gap: 10px; }
.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.session-row:hover { border-color: var(--accent); box-shadow: 0 2px 8px var(--shadow); }
.session-date { font-weight: 800; font-size: 1rem; color: var(--ink); }
.session-meta { font-size: 0.8rem; color: var(--muted); margin-top: 2px; }

/* Findings alert */
.finding-alert {
  background: rgba(180, 35, 24, 0.06);
  border: 1px solid rgba(180, 35, 24, 0.15);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.85rem;
  color: var(--danger);
  font-weight: 600;
  margin-top: 6px;
}

/* Delete button */
.btn-del {
  padding: 6px 10px;
  background: rgba(180, 35, 24, 0.08);
  border: 1px solid rgba(180, 35, 24, 0.18);
  color: var(--danger);
  border-radius: 6px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
}
.btn-del:hover { background: rgba(180, 35, 24, 0.15); }
```

### After — HTML button changes:
```html
<!-- Before -->
<button class="btn btn-green" onclick="openNewSession()">➕ New Session</button>
<button class="btn btn-grey" onclick="closeModal()">Cancel</button>
<button class="btn btn-outline">📋 View Report</button>

<!-- After -->
<button class="btn btn-primary" onclick="openNewSession()">New Session</button>
<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
<a href="/pest/report.html" class="btn btn-outline">View Report</a>
```

### After — stat cards:
```html
<!-- Before (inline style card classes) -->
<div class="stat-card"><div class="val" id="statSessions">—</div><div class="lbl">Total Sessions</div></div>
<div class="stat-card alert"><div class="val" id="statAlerts">—</div><div class="lbl">Active Findings</div></div>
<div class="stat-card warn"><div class="val" id="statStations">—</div><div class="lbl">Active Stations</div></div>

<!-- After (app.css stat-card with standardised modifiers) -->
<div class="stat-card"><div class="val" id="statSessions">—</div><div class="lbl">Total Sessions</div></div>
<div class="stat-card danger"><div class="val" id="statAlerts">—</div><div class="lbl">Active Findings</div></div>
<div class="stat-card warn"><div class="val" id="statStations">—</div><div class="lbl">Active Stations</div></div>
```

Add to `public/css/app.css` (if not already present):
```css
.stat-card.danger .val { color: var(--danger); }
.stat-card.warn   .val { color: var(--warning); }
.stat-card.ok     .val { color: var(--success); }
```

---

## Step 4: Replace ISO Inline Tab with `.tab-bar`

**File**: `iso/index.html`

### Before — custom `.cat-tabs`:
```html
<style>
  .cat-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
  .cat-tab { background: var(--card); border: 1.5px solid var(--border); border-radius: 10px;
    padding: 10px 16px; cursor: pointer; font-family: inherit; font-size: 0.88rem; ... }
  .cat-tab.active { border-color: var(--accent); background: rgba(21,101,192,.06); ... }
</style>
...
<div class="cat-tabs" id="catTabs">
  <button class="cat-tab active" data-cat="all" onclick="filterCat(this)">
    <div class="t-title">All Records</div>
    <div class="t-stats">...</div>
  </button>
  ...
</div>
```

### After — use `.tab-bar`:
```html
<!-- Remove the cat-tabs CSS from inline style -->
<div class="tab-bar" id="catTabs">
  <button class="tab-btn active" data-cat="all" onclick="filterCat(this)">All Records</button>
  <button class="tab-btn" data-cat="sop" onclick="filterCat(this)">SOPs</button>
  <button class="tab-btn" data-cat="form" onclick="filterCat(this)">Forms</button>
</div>
```

> If you need per-tab record counts, add them as a `<small>` inside the button — app.css handles it naturally.

### JS update needed:
The JS that checks `cat-tab` class must change to `tab-btn`:
```javascript
// Before
document.querySelectorAll('.cat-tab').forEach(el => el.classList.remove('active'));
// After
document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
```

---

## Step 5: Standardise Temp Monitor Status Colours

**File**: `tempmon/index.html` inline styles

Replace hardcoded hex colours with tokens:

```css
/* Before */
.stat-card.danger .val { color: #c62828; }
.stat-card.warn   .val { color: #e65100; }
.stat-card.ok     .val { color: #2e7d32; }

/* After — these should live in app.css, not inline */
/* DELETE from tempmon inline and ADD to public/css/app.css: */
.stat-card.danger .val { color: var(--danger); }
.stat-card.warn   .val { color: var(--warning); }
.stat-card.ok     .val { color: var(--success); }
```

```css
/* Before — hardcoded colours in filter buttons */
.filter-btn.f-critical.active { background: #c62828; border-color: #c62828; }
.filter-btn.f-warning.active  { background: #e65100; border-color: #e65100; }
.filter-btn.f-ok.active       { background: #2e7d32; border-color: #2e7d32; }
.filter-btn.f-freezer.active  { background: #1565c0; border-color: #1565c0; }

/* After */
.filter-btn.f-critical.active { background: var(--danger);  border-color: var(--danger); }
.filter-btn.f-warning.active  { background: var(--warning); border-color: var(--warning); }
.filter-btn.f-ok.active       { background: var(--success); border-color: var(--success); }
.filter-btn.f-freezer.active  { background: var(--info);    border-color: var(--info); }
```

---

## Step 6: Procurement Sub-page Migration

**Files**: `procurement/request-form.html`, `procurement/request-detail.html`, `procurement/requests.html`

### Before — head:
```html
<link rel="stylesheet" href="/procurement/css/styles.css">
```

### After:
```html
<link rel="stylesheet" href="/css/app.css">
```
```html
<body data-module="procurement">
```

### Component mapping:

| Old class | New class | Notes |
|-----------|-----------|-------|
| `button` (bare) | `class="btn btn-primary"` | Add class to HTML |
| `.btn-primary` (old orange) | `.btn-primary` (new green) | Token change, no HTML change |
| `.btn-outline` (old red border) | `.btn-outline` | Now uses `--border-strong`, correct |
| `.badge-approved` | `.badge.badge-success` | |
| `.badge-pending` | `.badge.badge-neutral` | |
| `.badge-ordered` | `.badge.badge-warning` | |
| `.badge-received` | `.badge.badge-success` | |
| `.badge-cancelled` | `.badge.badge-neutral` | |
| `.badge-high` | `.badge.badge-danger` | |
| `.badge-urgent` | `.badge.badge-danger` | |
| `.stat-box` | `.stat-card` | Same HTML structure works |
| `.filters` container | `.toolbar` | Same concept |
| `.msg.success/.error` | `.msg.success/.error` | Already in app.css |

---

## Step 7: Merge Cook-Card CSS

Create shared file for the cook-card UI used by both templog and order-manager/kitchen.

### Create `public/css/cook-card.css`:

```css
/* public/css/cook-card.css
   Cook-card UI shared by templog/departments/ and order-manager/kitchen/
   Requires app.css to be loaded first (uses --accent, --success, --card etc.) */

/* ── Active cooks header ───────────────────────────────────── */
#active-cooks { ... }
.active-grid  { ... }
.cook-card    { ... }
/* etc — copy from order-manager/kitchen/styles.css which is the more up-to-date version */
```

### Load order in affected HTML files:
```html
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/css/cook-card.css">
<!-- module-specific overrides if any -->
```

### Delete these files after migration:
- `templog/styles.css` (replaced by `/css/cook-card.css`)
- `order-manager/kitchen/styles.css` (replaced by `/css/cook-card.css`)

---

## Regression Testing Script

After each migration step, verify:

```
1. Open module index in browser
2. Check: accent colour on buttons matches expected (P1-B table)
3. Check: nav-link active state has correct colour
4. Check: section h2 has header bar (white background, border-bottom)
5. Check: stat-card numbers are correct colour (accent for default, danger/warn/ok for state)
6. Submit a form → toast appears top-right
7. Mobile (375px): hamburger menu visible, nav slides in/out
8. Print page (Ctrl+P preview for order-manager) → check print styles still work
```

---

## Files to Delete After Full Migration

| File | Condition |
|------|-----------|
| `maintenance/css/styles.css` | After all maintenance sub-pages use app.css |
| `procurement/css/styles.css` | After all procurement pages use app.css |
| `templog/styles.css` | After cook-card.css is extracted |
| `order-manager/kitchen/styles.css` | After cook-card.css is extracted |
