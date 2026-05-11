# Codebase Structure — Master App UI

## Directory Layout

```
masterapp/
├── public/
│   └── css/
│       └── app.css              ← Global design system (1,586 lines). Loaded by ALL pages.
├── maintenance/
│   ├── css/
│   │   └── styles.css           ← Legacy standalone CSS for sub-pages only
│   ├── maintenance.html         ← Loads app.css + inline <style>
│   ├── equipment-list.html      ← Loads maintenance/css/styles.css (legacy)
│   ├── issues-list.html         ← Loads maintenance/css/styles.css (legacy)
│   └── [other sub-pages]        ← Mix of app.css and legacy CSS
├── order-manager/
│   ├── styles.css               ← Module CSS loaded ON TOP of app.css
│   ├── chef-preorder.css        ← Module CSS loaded ON TOP of app.css
│   ├── kitchen/
│   │   └── styles.css           ← Module CSS loaded ON TOP of app.css
│   └── index.html               ← Loads app.css + styles.css
├── procurement/
│   ├── css/
│   │   └── styles.css           ← Legacy standalone CSS for sub-pages
│   └── index.html               ← Loads app.css + inline <style>
├── templog/
│   ├── styles.css               ← Used by sub-pages (kitchen/ etc.)
│   └── index.html               ← Loads app.css + inline <style> (overrides :root vars)
├── label-print/
│   └── styles.css               ← Module CSS loaded ON TOP of app.css
├── foodsafety/                  ← app.css only + minimal inline <style>
├── foodsafety-forms/            ← app.css only
├── pest/                        ← app.css + inline <style> block
├── tempmon/                     ← app.css + extensive inline <style> block
├── iso/                         ← app.css + extensive inline <style> block
├── admin/                       ← app.css + small inline <style>
└── index.html (hub)             ← app.css + small inline <style>
```

---

## CSS Files Inventory

| File | Size | Role | Loads app.css? |
|------|------|------|----------------|
| `public/css/app.css` | 1,586 lines | Global design system | — (IS the base) |
| `order-manager/styles.css` | 1,587 lines | Order Manager main pages | Yes (on top) |
| `order-manager/kitchen/styles.css` | 844 lines | Kitchen cook-card UI | Yes (on top) |
| `order-manager/chef-preorder.css` | 366 lines | Chef preorder page | Yes (on top) |
| `label-print/styles.css` | 856 lines | Label printing | Yes (on top) |
| `maintenance/css/styles.css` | 296 lines | Maintenance sub-pages | No (standalone legacy) |
| `procurement/css/styles.css` | 328 lines | Procurement forms | No (standalone legacy) |
| `templog/styles.css` | 844 lines | Kitchen cook-card UI | No (standalone legacy) |

**Important**: `maintenance/css/styles.css`, `procurement/css/styles.css`, and `templog/styles.css` are legacy files that define their own `:root {}` token block and do NOT import app.css. They power sub-pages that have not yet migrated to the shared design system.

---

## CSS Loading Pattern Per Module

### Tier 1 — app.css only (fully migrated)
```html
<link rel="stylesheet" href="/css/app.css">
<!-- optional inline <style> for page-specific overrides -->
```
Modules: `foodsafety`, `foodsafety-forms`, `admin`, `hub (index.html)`

### Tier 2 — app.css + extensive inline styles (partial migration)
```html
<link rel="stylesheet" href="/css/app.css">
<style>
  /* 80–150 lines of page-specific component styles */
</style>
```
Modules: `pest`, `tempmon`, `iso`, `maintenance/maintenance.html`, `procurement/index.html`

### Tier 3 — app.css + module CSS file (layered)
```html
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="./styles.css">
```
Modules: `order-manager`, `label-print`, `order-manager/kitchen`, `chef-preorder`

### Tier 4 — standalone CSS only (legacy, no app.css)
```html
<link rel="stylesheet" href="/maintenance/css/styles.css">
<!-- OR -->
<link rel="stylesheet" href="/procurement/css/styles.css">
```
Sub-pages: maintenance equipment/issue pages, procurement request forms, templog sub-pages

---

## HTML Template Patterns

### Modules with app.css shell (standard pattern)
All Tier 1/2/3 modules share this structure:
```html
<body data-module="[module-name]">
  <!-- #topnav and #sidenav injected by /js/shell.js -->
  <main>
    <!-- page content -->
  </main>
</body>
```
The `data-module` attribute drives accent colour via CSS variable overrides in app.css.

### Modules without app.css shell (legacy pattern)
Maintenance sub-pages and similar use a standalone `<header>` block:
```html
<body>
  <header>
    <div class="header-content">
      <img class="site-logo" ...>
      <div class="header-text">
        <h1>Page Title</h1>
        <p>Subtitle</p>
      </div>
    </div>
    <nav class="nav-links">...</nav>
  </header>
  <main>...</main>
  <footer>...</footer>
</body>
```

---

## Per-Module Accent Colours (defined in app.css)

| Module | `data-module` value | `--accent` | `--accent-2` | Visual |
|--------|--------------------|-----------|-----------|----|
| Hub | `hub` | `#175cd3` | `#1849a9` | Blue |
| Maintenance | `maintenance` | `#155eef` | `#1849a9` | Blue |
| Kitchen Temp Log | `templog` | `#0f766e` | `#115e59` | Teal |
| Order Manager | `order-manager` | `#7c2d12` | `#9a3412` | Dark Brown/Red |
| Procurement | `procurement` | `#166534` | `#14532d` | Dark Green |
| Food Safety | `foodsafety` | `#0f766e` | `#115e59` | Teal |
| Food Safety Forms | `foodsafetyforms` | `#0f766e` | `#115e59` | Teal |
| Label Print | `label-print` | `#475467` | `#344054` | Slate Gray |
| Admin | `admin` | `#344054` | `#1d2939` | Dark Slate |
| ISO Records | `iso` | `#344054` | `#1d2939` | Dark Slate |
| Temp Monitor | `tempmon` | `#0f766e` | `#115e59` | Teal |
| Pest Control | `pest` | *(none defined — falls through to default)* | | Blue (default) |

**Bug**: `pest` has no `body[data-module="pest"]` accent override in app.css. It inherits `--accent: #175cd3` (blue) from the global default, but many of its inline styles expect a green accent. This needs fixing.

---

## JavaScript Architecture

| File | Role |
|------|------|
| `/js/shell.js` | Injects `#topnav` + `#sidenav` HTML into every page, handles mobile nav toggle |
| `/auth-guard.js` | Hides page until auth is confirmed; redirects to `/login` if no session |
| `/js/lib/dom.js`, `http.js`, `tz.js` | Shared utility libraries |
| Per-module JS | Inline `<script>` in HTML or adjacent `.js` files |

---

## Language Toggle Scope

Only `foodsafety` loads `/foodsafety/js/foodsafety-i18n.js`. No other module has language support. This is intentional isolation, not a global feature.

---

## app.css Internal Structure

The file has **two conflicting definition blocks**:

| Lines | Block | Purpose |
|-------|-------|---------|
| 1–1037 | Original design tokens | First-pass colour scheme (warm orange radial gradients, gradient buttons, `border-radius: 14px`) |
| 1038–1586 | "Professional Refresh Overrides" | Later redesign that overrides tokens to a cleaner blue/teal/slate palette, flattens shadows, reduces border-radius to `8px` |

The overrides section **wins** (cascade order). The original block is dead weight and creates confusion. This is the highest-priority cleanup item.
