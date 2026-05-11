# UI Audit Report — Master App

Findings from reading all CSS files and key HTML files as of May 2026.

---

## Executive Summary

| Category | Severity | Status |
|----------|----------|--------|
| Duplicate `:root` block in app.css | HIGH | `public/css/app.css` lines 1–41 vs 1039–1057 |
| Legacy standalone CSS (3 files) | HIGH | maintenance, procurement, templog sub-pages |
| Missing `pest` module accent | MEDIUM | No `body[data-module="pest"]` rule in app.css |
| Inline `<style>` blocks (5 modules) | MEDIUM | pest, tempmon, iso, admin, some procurement pages |
| Emoji icons in 2 modules | LOW | pest, tempmon nav links |
| Inconsistent badge class names | LOW | Multiple naming schemes across modules |
| Duplicate component definitions | MEDIUM | stat-card, section-card, btn defined in 4+ places |

---

## 1. app.css Internal Conflicts

### Problem: Two `:root` Blocks Fighting Each Other

**Block 1** (lines 7–40) — Original warm/orange design system:
```css
:root {
  --ink:        #121316;
  --muted:      #5a616c;
  --bg:         #f4f5f7;
  --success:    #27ae60;
  --danger:     #c0392b;
  --accent:     #ff7a18;   /* ← orange */
  --accent-2:   #e74c3c;
  --topnav-h:   62px;
  --sidenav-w:  252px;
}
```

**Block 2** (lines 1039–1057) — Professional Refresh, overrides Block 1:
```css
:root {
  --ink:            #111827;   /* different */
  --muted:          #667085;   /* different */
  --bg:             #f3f4f6;
  --success:        #15803d;   /* different */
  --danger:         #b42318;   /* different */
  --accent:         #175cd3;   /* ← blue, completely different */
  --accent-2:       #1249a5;
  --topnav-h:       60px;      /* 2px different */
  --sidenav-w:      240px;     /* 12px different */
}
```

Block 2 wins due to cascade order. Block 1 is dead weight causing:
- Developer confusion about which tokens are active
- Risk of accidental reversion if styles are reordered
- 41 lines of misleading code

**Fix**: Delete lines 7–51 (Block 1 tokens + first module accent overrides). Keep only lines 1038–1586.

---

## 2. Legacy Standalone CSS Files

These three files define their own `:root {}` block and do not load app.css. They run on Maintenance sub-pages, Procurement request forms, and Templog department pages.

### `maintenance/css/styles.css` (296 lines)

Own tokens:
```css
:root {
  --bg-1:    #f6f4ef;
  --bg-2:    #efe6df;
  --accent:  #c0392b;    /* oven red — not matching app.css maintenance accent #155eef */
  --accent-2: #d35400;   /* warm orange */
}
```
What it duplicates from app.css:
- `section` + `section h2` styles (lines 84–103)
- `.equipment-card` (lines 112–133)
- `.record-card` (lines 178–200)
- `.issue-card` (lines 210–256)
- `button` base styles (lines 259–279)
- `.test-button` (lines 281–286)
- `footer` (lines 288–296)

**Impact**: Equipment list, issues list, and area maintenance pages show "oven red" `#c0392b` buttons while `maintenance/maintenance.html` (which uses app.css) shows blue `#155eef` buttons. Same module, two different accent colours.

---

### `procurement/css/styles.css` (328 lines)

Own tokens:
```css
:root {
  --accent:  #c0392b;
  --accent-2: #d35400;
}
```
What it duplicates:
- Full `header` layout (lines 36–76)
- `section` + `section h2` (lines 84–103)
- `.card` component (lines 102–119)
- `.btn` base + all variants (lines 150–171)
- `.badge` system (lines 173–190)
- `.request-card` (lines 192–213)
- `.stat-box` (lines 299–311)
- `.msg` (lines 313–316)

**Impact**: Request forms and request detail pages show red/orange buttons instead of the dark green (`#166534`) that `procurement/index.html` shows. Major visual inconsistency within the same module.

---

### `templog/styles.css` (844 lines)

This is actually a duplicate of `order-manager/kitchen/styles.css` — both implement the cook-card UI. The files are nearly identical (cook cards, timer displays, BT targeting, etc.).

Own tokens:
```css
:root {
  --accent:  #c0392b;
  --accent-2: #d35400;
}
```

**Impact**: Two files maintaining the same component. Any fix to cook-card UI must be applied in both files.

---

## 3. Module-by-Module Inconsistency Report

### Order Manager
**CSS file**: `order-manager/styles.css` (layered on app.css)

- Uses `--om-*` prefixed variables (private namespace) — 26 custom properties
- `border-radius: 24px` on `.section-card` (app.css uses 8px)
- `backdrop-filter: blur(16px)` on cards (not used anywhere else)
- Custom `border: rgba(74,53,32,0.1)` warm sepia borders (not in app.css token set)
- Buttons use `border-radius: 14px` (app.css uses 8px)
- Background: warm beige radial gradient vs app.css neutral grey
- `.module-card`, `.section-card` re-defined with conflicting styles vs app.css versions

This is the most divergent module visually — intentionally crafted but incompatible with the design system.

---

### Pest Control
**CSS**: inline `<style>` only (no separate file)

Issues found:
```css
/* Line 17 in pest/index.html */
.btn-green { background: linear-gradient(135deg, var(--accent), var(--accent-2)); ... }
/* ↑ Uses --accent but box-shadow hardcodes green rgba(46,125,50,0.25) — mismatch */

/* Line 18 */
.btn-grey { background: linear-gradient(135deg, #546e7a, #78909c); ... }
/* ↑ Should use .btn-secondary from app.css */

/* Line 43-44 */
.nav-link.active { background: var(--accent); color: #fff; }
/* ↑ OK but .nav-link is defined locally, duplicates app.css pattern */
```

Missing `body[data-module="pest"]` accent in app.css. The pest module renders with blue buttons (hub default) not green, because there is no pest accent defined.

---

### Temp Monitor
**CSS**: inline `<style>` only (~100 lines)

Issues found:
- `.stat-card` duplicated — should use app.css `.stat-card`
- `.nav-link` duplicated locally (same pattern as pest)
- Type badges (`.type-freezer`, `.type-chiller`, etc.) are module-specific, not in app.css — acceptable, these are domain-specific
- Filter buttons (`.filter-btn`) defined locally — should use app.css `.tab-btn` or a shared filter chip class
- Hardcoded colours not using tokens:
  - `#c62828` (danger red) — should be `var(--danger)`
  - `#e65100` (warning orange) — should be `var(--warning)`
  - `#2e7d32` (success green) — should be `var(--success)`
  - `#1565c0` (info blue) — should be `var(--info)`

---

### ISO Records
**CSS**: inline `<style>` (~140 lines)

Issues found:
```css
/* Overrides app.css accent LOCALLY in the inline style block: */
body[data-module="iso"] { --accent: #1565c0; --accent-2: #0d47a1; }
/* ↑ This overrides app.css's iso accent (#344054 dark slate) with blue. */
/* The app.css version is correct for consistency — this local override should be removed. */
```

- `.cat-tabs` + `.cat-tab` is an undocumented tab variant — should use `.tab-bar` + `.tab-btn`
- `.btn-filed` is a local action button that should be `.btn .btn-outline .btn-sm`
- `.stat-card` duplicated again
- `.section-card` + `.records-table` reasonably clean — acceptable inline styles

---

### Admin
**CSS**: inline `<style>` (57 lines)

Issues found:
```css
/* Line 35 in admin/index.html */
.btn-secondary {
  background: linear-gradient(135deg, #7f8c8d, #95a5a6);
  /* ↑ Redefines btn-secondary with old gradient style. app.css has flat white version */
```

- `.tab-bar` is re-padded locally to bleed outside `main` padding (lines 10–13). Acceptable page-specific override.
- Badge classes use `.badge-admin`, `.badge-user`, `.badge-inactive` — local, fine.

---

### Label Print
**CSS**: `label-print/styles.css` (856 lines, layered on app.css)

Has TWO sections internally:
1. Original design (lines 1–254): warm amber theme (`#d97706`, `#b45309`, `#92400e`)
2. "Professional refresh overrides" (lines 256–856): cleans up to neutral app.css style

The override section correctly uses `var(--accent)`, `var(--border)` etc. But the original section has hardcoded amber colours that the override section doesn't fully suppress:
- `.command-eyebrow { color: #b45309; }` (line 77) — overridden at line 329 ✅
- `.search-box input { border: 2px solid rgba(217, 119, 6, 0.22); }` (line 92) — NOT overridden, still uses amber border

---

### Maintenance (sub-pages)
**CSS**: `maintenance/css/styles.css` (296 lines, standalone, no app.css)

All sub-pages (equipment-list, issues-list, area-maintenance, etc.) render with old oven-red accent `#c0392b`. The dashboard page `maintenance.html` renders with app.css blue `#155eef`. Staff using the module switch between two completely different visual themes depending on which page they're on.

---

## 4. Hardcoded Colour Audit

Colours that appear hardcoded across module CSS/inline styles that should use tokens:

| Hardcoded Value | Should Be | Found In |
|----------------|-----------|---------|
| `#c0392b` | `var(--danger)` or `var(--accent)` in maintenance | maintenance/css, procurement/css |
| `#d35400` | `var(--warning)` or `var(--accent-2)` | maintenance/css, procurement/css |
| `#c62828` | `var(--danger)` | tempmon inline, iso inline |
| `#e65100` | `var(--warning)` | tempmon inline, kitchen/styles.css |
| `#2e7d32` | `var(--success)` | tempmon inline, kitchen/styles.css |
| `#1565c0` | `var(--info)` | tempmon inline, iso inline (overrides) |
| `#d32f2f` | `var(--danger)` | templog/styles.css, kitchen/styles.css |
| `#d97706` / `#b45309` | `var(--warning)` | label-print/styles.css |
| `#27ae60` | `var(--success)` | procurement/css/styles.css |
| `#e74c3c` | `var(--danger)` | multiple inline styles |
| `#7f8c8d` / `#95a5a6` | Use `.btn-secondary` | admin inline, foodsafety inline |
| `#f5f5f5` / `#444` | `var(--surface-subtle)` / `var(--ink)` | kitchen/styles.css table rows |

---

## 5. Duplicate Component Count

| Component | Defined In |
|-----------|-----------|
| `.stat-card` | app.css, tempmon inline, pest inline, iso inline, maintenance/css, procurement/css |
| `.section-card h2` | app.css, maintenance/css, procurement/css, iso inline |
| `.btn` base | app.css, procurement/css, iso inline, pest inline |
| `.nav-link` | app.css (not named), tempmon inline, pest inline, iso inline (as `.btn-filed`) |
| `button` base | app.css, maintenance/css, templog/styles.css, kitchen/styles.css |
| `footer` | app.css, maintenance/css, procurement/css |
| `.msg` / toast | app.css, procurement/css, templog/styles.css |

---

## 6. Language Toggle

Only `foodsafety/index.html` loads `/foodsafety/js/foodsafety-i18n.js`. No other module has this. Not a problem — it's module-specific — but should be formally documented as intentional rather than forgotten.

---

## 7. Quick Wins (zero-HTML changes)

These can be fixed purely in CSS with no HTML changes:

1. **Add `body[data-module="pest"]` accent to app.css** — 1 line, fixes pest button colours
2. **Remove lines 1–51 of app.css** (dead first `:root` block) — immediate code quality improvement
3. **Remove ISO inline accent override** (`body[data-module="iso"] { --accent: #1565c0 }` in iso/index.html) — iso gets correct app.css dark-slate accent
4. **Add `.stat-card.danger/.warn/.ok` to app.css** (they're already there in tempmon/pest inline — just add to global)
5. **Delete duplicate `footer` and `button` definitions from maintenance/css/styles.css** — safe once sub-pages are migrated
