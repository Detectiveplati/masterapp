# Page Authentication Reference

Shows which pages are protected by authentication and which are public.

---

## Auth Modes

| Mode | How to activate | Effect |
|---|---|---|
| **Auth ON** (production) | `BYPASS_AUTH=false` or unset | All protected pages redirect to `/login` |
| **Auth OFF** (testing) | `BYPASS_AUTH=true` in env | All pages open freely; fake admin user injected |

> **Current Railway setting:** `BYPASS_AUTH=true`  
> **Current local `.env`:** `BYPASS_AUTH=true`

---

## Pages

### 🌐 Public (never require login)

| URL | File | Notes |
|---|---|---|
| `/login` | `login.html` | Login form — always accessible |

---

### 🔐 Protected — Any Authenticated User

Redirects to `/login` if no valid session.

| URL | File | Permission Required |
|---|---|---|
| `/` | `index.html` | Any logged-in user |

---

### 🔧 Protected — Maintenance Module

Requires `maintenance` permission (or admin role).

| URL | File | Has Form / User Input |
|---|---|---|
| `/maintenance/` | `maintenance/maintenance.html` | Dashboard — read only |
| `/maintenance/equipment-list.html` | `maintenance/equipment-list.html` | — |
| `/maintenance/add-equipment.html` | `maintenance/add-equipment.html` | ✅ Add equipment form |
| `/maintenance/equipment-details.html` | `maintenance/equipment-details.html` | ✅ Edit/log issues |
| `/maintenance/areas.html` | `maintenance/areas.html` | ✅ Add area form |
| `/maintenance/area-maintenance.html` | `maintenance/area-maintenance.html` | ✅ Report area issue |
| `/maintenance/all-issues.html` | `maintenance/all-issues.html` | — |
| `/maintenance/issues-list.html` | `maintenance/issues-list.html` | — |
| `/maintenance/issue-details.html` | `maintenance/issue-details.html` | ✅ Resolve/update issue |
| `/maintenance/report-issue.html` | `maintenance/report-issue.html` | ✅ Report equipment issue |
| `/maintenance/log-maintenance.html` | `maintenance/log-maintenance.html` | ✅ Log maintenance record |
| `/maintenance/api-test.html` | `maintenance/api-test.html` | Dev/debug tool |

---

### 🥗 Protected — Food Safety Module

Requires `foodsafety` permission (or admin role).

| URL | File | Has Form / User Input |
|---|---|---|
| `/foodsafety/` | `foodsafety/index.html` | Overview — read only |
| `/foodsafety/report-nc.html` | `foodsafety/report-nc.html` | ✅ Log non-conformance |
| `/foodsafety/nc-list.html` | `foodsafety/nc-list.html` | — |
| `/foodsafety/nc-detail.html` | `foodsafety/nc-detail.html` | ✅ Update NC status |

---

### 🌡️ Protected — Kitchen Temp Log Module

Requires `templog` permission (or admin role).

| URL | File | Has Form / User Input |
|---|---|---|
| `/templog/` | `templog/index.html` | Overview |
| `/templog/departments/combioven.html` | `templog/departments/combioven.html` | ✅ Log cook records |
| `/templog/departments/combioven-data.html` | `templog/departments/combioven-data.html` | View records |
| `/templog/departments/combioven-report.html` | `templog/departments/combioven-report.html` | Reports / export |

---

### 📦 Protected — Procurement Module

Requires `procurement` permission (or admin role).

| URL | File | Has Form / User Input |
|---|---|---|
| `/procurement/` | `procurement/index.html` | Overview / QR code |
| `/procurement/requests` | `procurement/requests.html` | View all requests |
| `/procurement/request` | `procurement/request-form.html` | ✅ Submit new request |
| `/procurement/request/:id` | `procurement/request-detail.html` | ✅ Update request status |

---

### ⚙️ Protected — Admin Panel

Requires **admin role** only (no regular user access regardless of permissions).

| URL | File | Has Form / User Input |
|---|---|---|
| `/admin/` | `admin/index.html` | ✅ Create/edit users, set permissions |

---

## API Endpoints

### No auth required (public)

| Method | Endpoint | Used by |
|---|---|---|
| `POST` | `/api/requests` | Procurement request form |
| `GET` | `/api/requests` | Procurement requests list |
| `GET/PUT` | `/api/requests/:id` | Request detail |
| `POST` | `/templog/api/cooks` | Combi oven log form |
| `GET` | `/templog/api/cooks` | Cook records |
| `GET` | `/templog/api/cooks/export` | CSV export |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/qr` | QR code generation |
| `POST/GET` | `/api/equipment*` | Equipment CRUD |
| `POST/GET` | `/api/equipment-issues*` | Equipment issue reporting |
| `POST/GET` | `/api/issues*` | Area issue reporting |
| `POST/GET` | `/api/maintenance*` | Maintenance records |
| `POST/GET` | `/api/areas*` | Areas management |
| `POST/GET` | `/api/foodsafety*` | Food safety NCs |

### Auth required (always)

| Method | Endpoint | Used by |
|---|---|---|
| `POST` | `/api/auth/login` | Login page |
| `POST` | `/api/auth/logout` | Shell.js sign out button |
| `GET` | `/api/auth/me` | Auth guard / shell.js *(bypassed when BYPASS_AUTH=true)* |
| `GET/POST/PUT` | `/api/admin/*` | Admin panel *(fake admin injected when BYPASS_AUTH=true)* |

---

## Turning Auth On/Off

### Local development
Edit `.env`:
```
BYPASS_AUTH=true   # pages open freely
BYPASS_AUTH=false  # full login required
```

### Railway (production)
Dashboard → Service → Variables → set `BYPASS_AUTH` to `true` or `false` → redeploy.
