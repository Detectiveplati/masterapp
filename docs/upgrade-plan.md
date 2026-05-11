# Upgrade Plan — Master App UI Standardisation

Prioritised task list. Execute in order — each tier unblocks the next.

**Total estimated effort: ~30–38 hours**

---

## Priority 1 — Foundations (1–2 hours, no visual change)

These are pure housekeeping changes that make everything else easier. Do these first.

### P1-A: Clean up duplicate `:root` block in app.css
**File**: `public/css/app.css`
**Lines**: 7–51 (first `:root` block + first module accent block)
**Action**: Delete lines 7–51. The "Professional Refresh" block at line 1039 is the authoritative definition.
**Risk**: Zero — Block 2 already overrides Block 1. Deleting Block 1 changes nothing visible.
**Effort**: 0.5h

### P1-B: Add missing `pest` module accent
**File**: `public/css/app.css`
**Action**: Add after the other `body[data-module]` rules in the refresh block:
```css
body[data-module="pest"] { --accent: #166534; --accent-2: #14532d; }
```
**Effect**: Pest buttons/active states become dark green, consistent with food-safety adjacent nature.
**Effort**: 0.25h

### P1-C: Remove ISO inline accent override
**File**: `iso/index.html`
**Lines**: ~13 (`body[data-module="iso"] { --accent: #1565c0; --accent-2: #0d47a1; }`)
**Action**: Delete those 2 lines from the inline `<style>` block. The app.css already defines `iso` accent as `#344054` (dark slate). If dark-slate is wrong and blue is desired, update app.css instead so it's canonical.
**Effort**: 0.25h

### P1-D: Move label-print amber inline colour to token
**File**: `label-print/styles.css`
**Line**: 92
```css
/* Before */
border: 2px solid rgba(217, 119, 6, 0.22);
/* After */
border: 2px solid rgba(71, 84, 103, 0.22);  /* uses --border-strong tint at label-print accent */
```
**Effort**: 0.25h

---

## Priority 2 — Inline Style Extraction (4–6 hours)

Extract the large inline `<style>` blocks in pest, tempmon, and iso into dedicated CSS files. This makes them maintainable and removes duplication.

### P2-A: Pest — extract inline styles
**Files**:
- Source: `pest/index.html` lines 11–47, `pest/record.html` (check for inline styles), `pest/stations.html`
- Target: Create `pest/styles.css`

**What to extract**:
```css
/* These are in pest/index.html inline and should move to pest/styles.css */
.stat-card { ... }           /* replace with app.css stat-card */
.section-card h2 { ... }    /* replace with app.css section-card h2 */
.btn-green { ... }           /* replace with .btn-primary (uses --accent) */
.btn-grey  { ... }           /* replace with .btn-secondary */
.nav-link  { ... }           /* keep, but standardise to app.css pattern */
.session-row { ... }         /* keep (specific to pest) */
.finding-alert { ... }       /* keep (specific to pest) */
```

**What to consolidate**: `.btn-green` → `.btn` (uses `var(--accent)` which is now dark green), `.btn-grey` → `.btn-secondary`.

**Effort**: 1.5h

### P2-B: Temp Monitor — extract inline styles
**Files**:
- Source: `tempmon/index.html` inline style block (~100 lines), `tempmon/alerts.html`, `tempmon/report.html`, `tempmon/setup.html`, `tempmon/unit.html`, `tempmon/gateway.html`, `tempmon/gateway-log.html`
- Target: Create `tempmon/styles.css`

**What to extract and replace**:
```css
/* Replace hardcoded colours with tokens */
color: #c62828  → color: var(--danger)
color: #e65100  → color: var(--warning)
color: #2e7d32  → color: var(--success)
color: #1565c0  → color: var(--info)

/* Replace duplicated components */
.stat-card { ... }      → use app.css .stat-card + .stat-card.danger/.warn/.ok
.nav-link { ... }       → keep (acceptable local pattern)
.filter-btn { ... }     → consider using .tab-btn style
```

**Keep as-is** (domain-specific): `.type-freezer/chiller/warmer/ambient`, `.ws-pill.*`, `.unit-card.*`, `.temp-in-range/warning/critical`.

**Effort**: 2h

### P2-C: ISO Records — extract inline styles
**Files**:
- Source: `iso/index.html` inline style block (~140 lines)
- Target: Create `iso/styles.css`

**What to replace**:
```css
/* Replace .cat-tabs/.cat-tab with app.css .tab-bar/.tab-btn */
/* Replace .btn-filed with .btn.btn-outline.btn-sm */
/* Replace .btn-primary with app.css .btn */
/* Replace .stat-card duplicate with app.css stat-card */
/* Replace hardcoded hover colours with token-based */
```

**Keep as-is**: `.records-table`, `.editable-cell`, `#editPanel` drawer, `.modal-overlay/.modal-box`.

**Effort**: 1.5h

---

## Priority 3 — Migrate Maintenance Sub-pages (6–8 hours)

The most impactful consistency fix. Currently maintenance sub-pages show red buttons while the main dashboard shows blue.

### P3-A: Update maintenance sub-pages to load app.css

**Affected files**:
- `maintenance/equipment-list.html`
- `maintenance/issues-list.html`
- `maintenance/equipment-details.html`
- `maintenance/all-issues.html`
- `maintenance/areas.html`
- `maintenance/area-maintenance.html`
- `maintenance/add-equipment.html`
- `maintenance/log-maintenance.html`
- `maintenance/report-issue.html`
- `maintenance/issue-details.html`

**Action for each file**: Replace `<link href="/maintenance/css/styles.css">` with `<link href="/css/app.css">`, then add `data-module="maintenance"` to `<body>`.

**Effort**: 1h (mechanical search-replace)

### P3-B: Remove/refactor maintenance/css/styles.css

After all HTML files point to app.css, audit what's in `maintenance/css/styles.css` that isn't covered by app.css. The only unique content is:
- `.header-content` layout (if standalone header is kept)
- `.site-logo` sizing

If sub-pages are converted to use the `#topnav`/`#sidenav` shell (the `/js/shell.js` injection), this file can be deleted entirely. If they keep standalone headers, keep only the header-specific rules (~30 lines).

**Effort**: 2h

### P3-C: Replace maintenance-specific component styles

For each migrated sub-page, replace:
- `button` → `class="btn btn-primary"`
- `.test-button` → `class="btn btn-secondary"`
- `section h2` → keep HTML, app.css handles it
- `.record-card`, `.issue-card`, `.equipment-card` → app.css handles these identically
- `.status-badge.*` → app.css handles these

**Effort**: 3–4h (HTML edits across 10 files)

---

## Priority 4 — Migrate Procurement Sub-pages (4–6 hours)

`procurement/index.html` already uses app.css. The request forms and detail pages use the legacy standalone CSS.

### P4-A: Update procurement sub-pages to load app.css

**Affected files**:
- `procurement/request-form.html`
- `procurement/request-detail.html`
- `procurement/requests.html`

**Action**: Same pattern as P3-A — swap CSS link, add `data-module="procurement"`.

**Effort**: 0.5h

### P4-B: Replace procurement-specific components

```css
/* procurement/css/styles.css duplicate components to replace */
.btn variants      → app.css .btn system
.card              → app.css .card
header { ... }     → if using app.css shell, remove entirely
section h2         → app.css handles it
.badge-*           → standardise to app.css badge classes
.stat-box          → app.css .stat-card
.msg               → app.css .msg (already in app.css)
```

**Effort**: 3–4h

---

## Priority 5 — Templog and Cook-Card Unification (8–10 hours)

The most complex task. Two near-identical CSS files need to be merged.

### P5-A: Audit differences between templog/styles.css and order-manager/kitchen/styles.css

**Command**: `diff templog/styles.css order-manager/kitchen/styles.css`

Key differences identified:
- `kitchen/styles.css` has `.retention-task-*` classes (not in templog/styles.css)
- Minor colour differences in `.corner-resume` button
- Both have identical cook-card, timer, temp-display, BT-targeting styles

### P5-B: Create shared `public/css/cook-card.css`

Extract the shared cook-card component (~600 lines) into a single file:
- `public/css/cook-card.css`

Both `templog/` and `order-manager/kitchen/` pages load this instead of their local CSS.

**Effort**: 3h

### P5-C: Migrate templog sub-pages to app.css

**Affected files**:
- `templog/departments/combioven.html`
- `templog/departments/combioven-report.html`
- `templog/departments/combioven-data.html`
- `templog/departments/equipment-temperature.html`
- `templog/departments/lora-control-panel.html`

**Action**: Point to app.css + `public/css/cook-card.css`, add `data-module="templog"`, remove templog/styles.css reference.

**Effort**: 2h

### P5-D: Migrate templog/index.html inline :root override

**File**: `templog/index.html`

Currently has inline `:root` that partially overrides app.css with orange/blue accent pair:
```css
:root {
  --accent:   #ff7a18;   /* should not override — app.css templog accent is #0f766e */
  --accent-2: #3aa6ff;
}
```

**Action**: Delete this inline `:root` block. The app.css templog accent (teal) is the correct one.

**Effort**: 0.5h

---

## Priority 6 — Order Manager Theme (4–6 hours, optional)

The order-manager uses a custom warm-brown `--om-*` design system. It's internally consistent and well-crafted. The question is whether to keep the distinct visual identity or bring it into alignment with the rest of the app.

### Option A: Keep distinct (recommended for now)
No changes. Order Manager's warm brown/beige theme is intentional and distinguishes the "production/printing" workflow visually. Document it as an intentional deviation.

**Action**: Add a comment at top of `order-manager/styles.css`:
```css
/* Order Manager uses a warm brown palette intentionally distinct from the global design system.
   If standardising: replace --om-* variables with app.css --ink/--muted/--accent equivalents. */
```

### Option B: Standardise to app.css
Replace all `--om-*` references with app.css equivalents:
- `--om-ink` → `var(--ink)`
- `--om-muted` → `var(--muted)`
- `--om-accent` → `var(--accent)` (becomes dark red `#7c2d12`)
- `--om-border-soft` → `var(--border)`
- `--om-surface` → `var(--card)`

**Effort**: 5–6h (search/replace + visual QA across 6 order-manager HTML files)

---

## Effort Summary

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P1 | Clean app.css + add pest accent | 1.25h | Low visibility, high code quality |
| P2 | Extract pest/tempmon/iso inline styles | 5h | Clean code, slight consistency win |
| P3 | Migrate maintenance sub-pages | 7h | **HIGH** — fixes split visual identity within module |
| P4 | Migrate procurement sub-pages | 5h | **MEDIUM** — fixes split visual identity |
| P5 | Unify cook-card CSS + migrate templog | 6h | **MEDIUM** — eliminates duplicate file |
| P6 | Order Manager standardisation | 0h (Option A) | Optional |
| **Total** | | **~30h** | |

---

## Dependency Order

```
P1 (app.css cleanup)
  ↓
P2 (extract inline styles) — can run in parallel with P3
  ↓
P3 (maintenance migration) — benefits from P1 accent fix
  ↓
P4 (procurement migration) — same pattern as P3
  ↓
P5 (cook-card unification) — independent of P3/P4

P6 — independent of all above
```

---

## Testing Checklist per Migration

For each module migrated:
- [ ] Open module index page — check accent colour and nav highlight match expected
- [ ] Open each sub-page — check consistent button/card/badge appearance
- [ ] Submit a form — check success/error toast appears correctly
- [ ] Check on mobile 375px width — nav toggle, stacked layout
- [ ] Check on desktop 1280px — sidenav visible, content not overflowing
- [ ] Check dark text on cards is readable (no white-on-white or black-on-black)
- [ ] Check all buttons have hover state
- [ ] Verify no broken references to deleted CSS classes
