# Copilot Instructions — Central Kitchen Master App

## Stack

- **Runtime**: Node.js ≥ 18, CommonJS (`require`/`module.exports` — no ESM `import/export`)
- **Server**: Express 5 (`server.js` — single entry point, ~1100 lines)
- **Database**: MongoDB via Mongoose (ODM) for all modules; native `MongoClient` only in the legacy templog module
- **Auth**: JWT stored in an HTTP-only cookie (`ck_auth`), validated by `services/auth-middleware.js`
- **File uploads**: Multer (memory storage) → Cloudinary via `services/cloudinary-upload.js`
- **Frontend**: Plain HTML + Vanilla JS + CSS — no frameworks, no bundler, no TypeScript
- **Deployment**: Railway (environment variables injected at runtime via `.env` / Railway dashboard)

---

## Project Modules

| Module | Frontend dir | API prefix |
|---|---|---|
| Maintenance | `/maintenance/` | `/api/` |
| Food Safety | `/foodsafety/` | `/api/foodsafety/` |
| Kitchen Temp Log | `/templog/` | `/templog/api/` |
| Procurement | `/procurement/` | `/api/requests/` |
| Pest Control | `/pest/` | `/api/pest/` |
| Admin | `/admin/` | `/api/admin/` |

---

## Directory Structure

```
server.js          ← Express app, DB connections, all route mounting
auth-guard.js      ← Client-side auth check injected into every HTML page
models/            ← Mongoose schemas (one file per model)
routes/            ← Express routers (one file per module)
services/          ← Shared utilities: auth-middleware, cloudinary-upload, notification-service, qr-service
public/
  css/app.css      ← Global CSS variables and shared styles (--ink, --accent, --card, --border, etc.)
  js/shell.js      ← Client-side nav shell (topnav + sidenav rendered after auth)
  sw.js            ← Service worker (PWA)
maintenance/       ← HTML pages + module-scoped JS/CSS
foodsafety/        ← HTML pages + module-scoped JS
templog/           ← HTML pages + module-scoped JS
procurement/       ← HTML pages (inline <script> blocks)
pest/              ← HTML pages
```

---

## Code Rules

### Backend (Node / Express / Mongoose)

- Use `CommonJS` exclusively — never `import`/`export`
- Routes live in `routes/` — one router file per module; mount them in `server.js`
- Route handlers must be `async`; wrap bodies in `try/catch` and return `res.status(4xx/5xx).json({ error: err.message })`
- Business logic and DB queries go directly in route files (no separate service layer for new features — keep it consistent with existing code)
- Mongoose models go in `models/` — use `{ timestamps: true }` on every schema
- Always strip empty strings on optional enum fields before saving (pattern: `if (data[field] === '') delete data[field]`)
- Auth: protect API routes with `requireAuth` middleware from `services/auth-middleware.js`; protect page routes with `requirePageAccess`
- Never log sensitive values (passwords, JWT secrets, full tokens)
- Use `console.log('✓ [Module] ...')` for success and `console.error('✗ [Module] ...')` for errors — match the existing log style

### Frontend (HTML / Vanilla JS / CSS)

- Every HTML page **must** include the auth guard snippet at the top of `<head>`:
  ```html
  <script>document.documentElement.style.visibility='hidden'</script><script src="/auth-guard.js"></script>
  ```
- Every HTML page **must** include `<script src="/js/shell.js"></script>` as the last script before `</body>`
- Pages set `data-module="<modulename>"` on `<body>` for nav highlighting
- Use CSS custom properties from `app.css` — `var(--ink)`, `var(--accent)`, `var(--card)`, `var(--border)`, `var(--muted)`, `var(--success)`, `var(--steel)`, `var(--shadow)` — never hardcode hex colours that duplicate these
- `fetch()` calls to the API must include `{ credentials: 'include' }` for the auth cookie
- Always escape user-supplied strings before inserting into innerHTML — use an `escHtml()` function:
  ```js
  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  ```
- Do not use external CDN scripts unless already present in the file being edited

### Print / PDF pattern

When adding print/PDF export to a page, follow the pattern established in `templog/departments/combioven-report.html` and `procurement/requests.html`:
- Add `body.print` CSS rules to hide nav, controls, action buttons
- Add `@media print` block mirroring the same rules
- Add a `#print-header` div (hidden by default, shown in print mode) with title + subtitle
- `printPDF()` function: populate subtitle → `document.body.classList.add('print')` → `window.print()` → remove class on `afterprint`

### CSS

- Module-scoped styles go in an inline `<style>` block inside the HTML file (not a separate `.css` file) unless the module already has a `css/styles.css`
- Card layout: `background: linear-gradient(180deg, var(--card), #fffbf9); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 2px 6px var(--shadow);`
- Buttons use existing classes: `.btn`, `.btn-primary`, `.btn-outline`, `.btn-sm`, `.export-btn`
- Badges: `.badge`, `.badge-pending`, `.badge-received`

---

## What to Avoid

- Do **not** introduce TypeScript, React, Vue, or any frontend framework
- Do **not** add a build step or bundler (no webpack, vite, etc.)
- Do **not** introduce ESM (`import`/`export`) in backend files
- Do **not** create new Mongoose models with `strict: false` — keep schemas explicit
- Do **not** expose raw MongoDB `_id` or internal fields in API responses unless already done in the module
- Do **not** add new npm dependencies without flagging it — prefer using packages already in `package.json`
- Do **not** add `console.log` debug statements that would remain in production code
- Do **not** create summary markdown files after making changes

---

## Environment Variables (never hardcode)

```
MONGODB_URI        ← Main Mongoose connection string
MONGO_URI          ← Native MongoClient (templog)
JWT_SECRET         ← JWT signing secret
CLOUDINARY_URL     ← or CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET split vars
BYPASS_AUTH        ← 'true' only for local testing
NODE_ENV           ← 'production' on Railway
```
