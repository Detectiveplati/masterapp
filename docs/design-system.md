# Design System — Master App

Defines the single source of truth for all visual tokens and components going forward.
This is the **target state** after standardisation. Current state is documented in `audit-report.md`.

---

## 1. Design Tokens

All tokens live in `public/css/app.css` inside `:root {}`. The "Professional Refresh" section (lines 1038–1057) is the authoritative block. The original block above it should be removed.

### 1.1 Colour Palette

```css
:root {
  /* ── Neutrals ─────────────────────────────── */
  --ink:            #111827;   /* primary text */
  --muted:          #667085;   /* secondary text / labels */
  --bg:             #f3f4f6;   /* page background */
  --card:           #ffffff;   /* card / panel surface */
  --surface-subtle: #f8fafc;   /* hover states, zebra rows */

  /* ── Borders & Shadows ───────────────────── */
  --border:         #d9dee6;
  --border-strong:  #c3ccd8;
  --shadow:         rgba(15, 23, 42, 0.06);
  --shadow-soft:    0 8px 24px rgba(15, 23, 42, 0.06);

  /* ── Semantic Colours ────────────────────── */
  --success:        #15803d;
  --danger:         #b42318;
  --warning:        #b54708;
  --info:           #175cd3;

  /* ── Default Accent (Hub / Settings) ─────── */
  --accent:         #175cd3;
  --accent-2:       #1249a5;

  /* ── Layout ──────────────────────────────── */
  --topnav-h:       60px;
  --sidenav-w:      240px;
}
```

### 1.2 Module Accent Overrides

Each page sets `<body data-module="...">` and app.css maps it to an accent pair:

```css
body[data-module="maintenance"]     { --accent: #155eef; --accent-2: #1849a9; }
body[data-module="templog"]         { --accent: #0f766e; --accent-2: #115e59; }
body[data-module="order-manager"]   { --accent: #7c2d12; --accent-2: #9a3412; }
body[data-module="procurement"]     { --accent: #166534; --accent-2: #14532d; }
body[data-module="foodsafety"]      { --accent: #0f766e; --accent-2: #115e59; }
body[data-module="foodsafetyforms"] { --accent: #0f766e; --accent-2: #115e59; }
body[data-module="label-print"]     { --accent: #475467; --accent-2: #344054; }
body[data-module="admin"]           { --accent: #344054; --accent-2: #1d2939; }
body[data-module="hub"]             { --accent: #175cd3; --accent-2: #1849a9; }
body[data-module="iso"]             { --accent: #344054; --accent-2: #1d2939; }
body[data-module="tempmon"]         { --accent: #0f766e; --accent-2: #115e59; }
body[data-module="settings"]        { --accent: #175cd3; --accent-2: #1849a9; }
/* ADD: */
body[data-module="pest"]            { --accent: #166534; --accent-2: #14532d; }
```

> **Note on colour diversity**: The per-module accent approach is intentional — it helps staff instantly identify which module they're in. The inconsistency problem was using different button/component colours *within* a module, and having legacy files that ignored the token system entirely.

---

## 2. Typography

### Font Stack
```css
font-family: "Bahnschrift", "Trebuchet MS", "Segoe UI", Roboto, system-ui, sans-serif;
```
All modules in app.css use this. Legacy CSS files use `"Segoe UI", Roboto, system-ui` (subset — acceptable, no action needed).

### Type Scale

| Token / Usage | Size | Weight | Line Height |
|---------------|------|--------|-------------|
| Page title (h1) | 1.4–2rem (clamp) | 900 | 1.1 |
| Section heading (h2 in section) | 1rem | 700 | — |
| Card heading (hub-card h2) | 1.05rem | 700 | 1.3 |
| Body text | 0.9rem | 400 | 1.55 |
| Label (form, table header) | 0.75–0.78rem | 700–800 | — |
| Badge / chip | 0.72–0.78rem | 700 | — |
| Muted / meta | 0.78–0.88rem | 400–600 | — |

---

## 3. Spacing Scale

Use multiples of 4px. Standard values in use:

| Token name (informal) | Value | Common usage |
|-----------------------|-------|--------------|
| xs | 4px | gap inside compact rows |
| sm | 8px | gap between chips/badges |
| md | 12–14px | gap inside cards |
| lg | 16–20px | padding inside cards, section gaps |
| xl | 22–24px | card padding, form groups |
| 2xl | 28–32px | page top padding, hero padding |

No formal CSS custom properties needed for spacing — use `gap`, `padding`, and `margin` inline.

---

## 4. Border Radius Scale

| Usage | Value |
|-------|-------|
| Micro (filter buttons, pills) | 999px |
| Small (inputs, small cards, badges) | 8px |
| Medium (cards, panels, modals) | 8px |
| Large (hub cards, section blocks) | 8px |

> The override section standardised everything to `8px`. The original section used 10–18px radius. Use **8px** as the standard going forward; use `999px` for pill shapes only.

---

## 5. Component Definitions

### 5.1 Buttons

```css
/* Base */
button, .btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--accent);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
button:hover, .btn:hover { filter: brightness(0.98); }

/* Variants */
.btn-primary   { background: var(--accent); color: #fff; border-color: transparent; }
.btn-secondary { background: #fff; color: var(--ink); border-color: var(--border-strong); }
.btn-success   { background: var(--success); color: #fff; border-color: transparent; }
.btn-danger    { background: var(--danger); color: #fff; border-color: transparent; }
.btn-outline   { background: #fff; color: var(--ink); border-color: var(--border-strong); }
.btn-sm        { min-height: 32px; padding: 0 10px; font-size: 0.82rem; }
```

**Do not use**: `.btn-green`, `.btn-grey`, `.btn-accent` — replace with `.btn-success`, `.btn-secondary`, `.btn-primary` respectively.

---

### 5.2 Tab Bar

```css
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--border);
  margin-bottom: 24px;
  overflow-x: auto;
}
.tab-btn {
  padding: 12px 20px;
  font-size: 0.92rem;
  font-weight: 700;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  cursor: pointer;
  color: var(--muted);
  margin-bottom: -2px;
  font-family: inherit;
}
.tab-btn:hover  { color: var(--accent); }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
```

Use **only** `.tab-bar` + `.tab-btn`. Replace `.nav-links` + `.nav-link` patterns with this when used for in-page navigation. Keep `.nav-link` for cross-page breadcrumb-style links.

---

### 5.3 Cards

#### Standard Card
```css
.card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px 22px;
  box-shadow: var(--shadow-soft);
  margin-bottom: 24px;
}
```

#### Section Card (titled card with header bar)
```css
.section-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px 22px;
  box-shadow: var(--shadow-soft);
}
section h2 {
  margin: -20px -22px 20px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  border-radius: 8px 8px 0 0;
  background: #fcfcfd;
  color: var(--ink);
  font-size: 1rem;
  font-weight: 700;
}
```

#### Stat Card (dashboard metrics)
```css
.stat-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px 16px;
  box-shadow: var(--shadow-soft);
}
.stat-card .val { font-size: 2rem; font-weight: 900; color: var(--accent); }
.stat-card .lbl { font-size: 0.75rem; color: var(--muted); margin-top: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
```

**Standardised modifier classes** (replace module-specific colour classes):
```css
.stat-card.danger .val { color: var(--danger); }
.stat-card.warn   .val { color: var(--warning); }
.stat-card.ok     .val { color: var(--success); }
```

---

### 5.4 Navigation Links (`.nav-link`)

Used for horizontal in-module page navigation (not tabs):

```css
.nav-link {
  padding: 8px 14px;
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 700;
  text-decoration: none;
  transition: background 0.15s;
}
.nav-link:hover  { background: #e0e0e0; color: var(--ink); }
.nav-link.active { background: var(--accent); color: #fff; }
```

---

### 5.5 Status Badges

```css
.badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.73rem;
  font-weight: 700;
  white-space: nowrap;
}
.badge-green   { background: rgba(39,174,96,.12);  color: #1a7a46; }
.badge-grey    { background: rgba(90,97,108,.12);  color: var(--muted); }
.badge-orange  { background: rgba(217,119,6,.12);  color: #b45309; }
.badge-red     { background: rgba(192,57,43,.12);  color: #c0392b; }
.badge-blue    { background: rgba(21,101,192,.12); color: #1565c0; }
```

**Semantic aliases** (use these in code rather than colour-named ones):
```css
.badge-success  = .badge-green
.badge-danger   = .badge-red
.badge-warning  = .badge-orange
.badge-info     = .badge-blue
.badge-neutral  = .badge-grey
```

---

### 5.6 Forms

```css
/* Input / Select / Textarea */
input[type="text"], input[type="date"], input[type="number"],
input[type="search"], input[type="email"], input[type="password"],
select, textarea {
  width: 100%;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 10px 13px;
  font-size: 0.95rem;
  font-family: inherit;
  background: #fff;
  color: var(--ink);
}
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(23, 92, 211, 0.10);
}

/* Form group */
.form-group {
  display: flex;
  flex-direction: column;
  margin-bottom: 18px;
  gap: 6px;
}
.form-group label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--ink);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
```

---

### 5.7 Toast Notifications

```css
.toast {
  position: fixed;
  top: calc(var(--topnav-h) + 14px);
  right: 20px;
  background: var(--success);
  color: #fff;
  padding: 14px 22px;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  font-size: 0.95rem;
  font-weight: 700;
  z-index: 9999;
  animation: toastIn 0.28s ease-out;
}
.toast.error { background: var(--danger); }
```

---

### 5.8 Data Tables

```css
.data-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.data-table th {
  padding: 10px 14px;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
  border-bottom: 2px solid var(--border);
  text-align: left;
}
.data-table td { padding: 12px 14px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.data-table tr:last-child td { border-bottom: none; }
.data-table tr:hover td { background: var(--surface-subtle); }
```

---

## 6. Icons

### Standard: SVG Inline Icons

All new and migrated components use inline SVG (24×24 viewBox, stroke-width 1.8, no fill):

```html
<span class="nav-icon" aria-hidden="true">
  <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round">
    <!-- path data -->
  </svg>
</span>
```

### Icon Size Classes

| Class | Size | Usage |
|-------|------|-------|
| `.nav-icon` | 18×18px | Sidebar nav items |
| `.page-title-icon` | 20×20px | Page headings |
| `.module-icon` (hub card) | 36×36px | Hub module cards |
| `.action-icon` | 16×16px | Button icons |

### Emoji Deprecation

Modules currently using emoji icons (pest, tempmon nav links): these work but are not consistent with the SVG approach used in hub, foodsafety, maintenance. Migrate on a module-by-module basis — no emergency.

---

## 7. Accessibility Guidelines

- All interactive elements need `:focus` styles (app.css provides these globally via `border-color` + `box-shadow`)
- Buttons with only icons need `aria-label="..."` or `<span class="sr-only">...</span>`
- SVG icons used decoratively get `aria-hidden="true"`
- Status badges should not rely on colour alone — include text
- Form inputs must have associated `<label>` elements (not just placeholders)
- Colour contrast: --ink `#111827` on --card `#ffffff` = 16.1:1 ✅; --muted `#667085` on `#ffffff` = 5.7:1 ✅; --accent `#175cd3` on `#ffffff` = 5.9:1 ✅
