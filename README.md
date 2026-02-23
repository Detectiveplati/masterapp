# Central Kitchen Master App

A unified full-stack web application for central kitchen operations. Built with Node.js, Express, MongoDB, and vanilla HTML/CSS/JS — deployed on Railway, accessible on desktop and mobile.

Four modules run under one server, with a JWT-based auth system protecting the admin panel:

| Module | URL Path | Description |
|---|---|---|
| **Maintenance Dashboard** | `/maintenance/` | Equipment tracking, issue reporting, maintenance logs |
| **Kitchen Temp Log** | `/templog/` | Cooking temperature records, CSV/PDF export |
| **Kitchen Equipment Procurement** | `/procurement/` | Purchase request submission and tracking |
| **Food Safety NC** | `/foodsafety/` | Non-conformance reporting, photo upload, resolution tracking |

---

## Project Structure

```
masterapp/
├── index.html                    # Hub page — entry point at /
├── server.js                     # Express server (all routes + DB connections)
├── package.json
├── .env                          # Environment variables (not committed)
├── .env.example                  # Template for .env
├── .npmrc                        # PUPPETEER_SKIP_DOWNLOAD=true (for Railway)
│
├── maintenance/                  # Maintenance Dashboard
│   ├── maintenance.html          # Dashboard home
│   ├── equipment-list.html       # Equipment list with status + issue badges
│   ├── equipment-details.html    # Equipment detail, history, inline issue report
│   ├── add-equipment.html        # Add / edit equipment form
│   ├── report-issue.html         # Mobile QR staff issue form (bilingual EN/中文)
│   ├── all-issues.html           # All open issues view
│   ├── area-maintenance.html     # Report area issue with photo upload
│   ├── areas.html                # Area management + QR codes
│   ├── issue-details.html        # Area issue detail + priority/status editor
│   ├── log-maintenance.html      # Log a maintenance record
│   ├── js/
│   │   ├── api.js                # Auto-detecting API_BASE (localhost vs Railway)
│   │   ├── app.js                # Dashboard logic
│   │   ├── maintenance-logger.js # Log maintenance form handler
│   │   ├── equipment.js          # Equipment list logic
│   │   └── charts.js             # Chart rendering
│   └── css/styles.css
│
├── procurement/                  # Kitchen Equipment Procurement
│   ├── index.html                # Procurement hub (QR code display)
│   ├── request-form.html         # Staff purchase request form (bilingual EN/中文)
│   ├── requests.html             # All requests list (admin view)
│   └── request-detail.html       # Request detail + status management
│
├── foodsafety/                   # Food Safety NC Reporting
│   ├── index.html                # Food Safety hub
│   ├── report-nc.html            # Log a new NC (unit, subarea, category, photo)
│   ├── nc-list.html              # All NCs with open/resolved filter
│   ├── nc-detail.html            # NC detail, photo log, resolve, delete
│   ├── js/
│   │   └── foodsafety-nc.js      # Client-side logic for all NC pages
│   └── uploads/                  # Local photo fallback (ephemeral on Railway)
│       └── .gitkeep
│
├── admin/                        # Admin Panel (auth-protected)
│   └── index.html                # User management + permissions matrix
│
├── login.html                    # JWT login page (hub-level)
│
├── templog/                      # Kitchen Temp Log (embedded app)
│   └── departments/
│       └── combioven-report.html # Printable PDF report template
│
├── models/                       # Mongoose schemas
│   ├── Equipment.js
│   ├── EquipmentIssue.js
│   ├── MaintenanceRecord.js
│   ├── Area.js
│   ├── AreaIssue.js              # Priority: Low/Normal/Medium/Urgent/High/Critical
│   ├── Notification.js
│   ├── ProcurementRequest.js
│   ├── FoodSafetyNC.js           # NC report with photo + resolution subdoc
│   └── User.js                   # Auth user (username, passwordHash, role)
│
├── routes/                       # Express route handlers
│   ├── equipment.js
│   ├── equipmentIssues.js
│   ├── maintenance.js
│   ├── issues.js                 # Area issues
│   ├── areas.js
│   ├── reports.js
│   ├── notifications.js
│   ├── procurementRequests.js
│   ├── foodsafety.js             # Food Safety NC CRUD + photo upload
│   ├── auth.js                   # POST /login, POST /logout, GET /me
│   ├── admin.js                  # User management API (admin role required)
│   └── seed.js
│
└── services/
    ├── cloudinary-upload.js      # Shared Cloudinary multer factory
    ├── auth-middleware.js        # requireAuth / requireAdmin middleware
    ├── qr-service.js             # QR code generation
    ├── maintenance-calculator.js
    └── notification-service.js
```

---

## Setup

### Prerequisites
- Node.js v18+
- MongoDB running locally

### Install

```bash
git clone <repository-url>
cd masterapp
npm install
```

### Configure

Copy `.env.example` to `.env` and fill in your values:

```env
PORT=3000

# Maintenance Dashboard DB
MAINTENANCE_MONGODB_URI=mongodb://localhost:27017/central_kitchen_maintenance

# Kitchen Temp Log DB
TEMPLOG_MONGODB_URI=mongodb://localhost:27017
TEMPLOG_DB_NAME=kitchenlog

# Cloudinary (photo uploads for issues, maintenance records, procurement, food safety NCs)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Auth (JWT)
JWT_SECRET=change_this_to_a_long_random_string

# Optional: override base URL for QR codes when using ngrok
QR_BASE_URL=http://<your-local-ip>:3000

NODE_ENV=development
```

> If Cloudinary is not configured, photo uploads fall back to local disk (`foodsafety/uploads/`) — text submissions always work. Note: the local disk is ephemeral on Railway; configure Cloudinary for permanent photo storage.

### Run

```bash
node server.js
```

Open `http://localhost:3000` for the hub page.

---

## Features

### Hub Page (`/`)
- Central landing page linking all four modules
- Live server health check showing database connection status
- Admin & User Management card links to `/login?next=/admin/`

### Maintenance Dashboard (`/maintenance/`)
- Add, edit, delete equipment (walk-in freezers, chillers, warmers, etc.)
- Equipment status: Operational / Needs Action
- Staff issue reporting via QR code — bilingual EN / 中文, auto language detection
- Area issue reporting with optional photo upload (Cloudinary)
- Area issue detail page: inline priority editor (Low / Normal / Urgent / High / Critical) and status editor
- Maintenance log with optional photo upload per record
- All-issues view showing every open equipment and area issue
- Per-equipment history: maintenance records + reported issues
- Auto-generated QR codes per equipment linking to the staff reporting form

### Kitchen Temp Log (`/templog/`)
- Log cooking activities: food item, staff, start/end time, duration, core temp, tray count
- Filter records by date range or year/month
- Export to CSV (all records or filtered by period)
- Export to PDF (requires Puppeteer — disabled on Railway by default)

### Kitchen Equipment Procurement (`/procurement/`)
- Staff submit purchase requests via QR-accessible mobile form — bilingual EN / 中文
- Fields: item name, category, quantity, urgency, reason, optional photo
- Admin view: all requests with status filters and search
- Status workflow: Pending → Approved → Ordered → Received (or Cancelled)
- QR code on the procurement hub page pointing to the request form, auto-detects host

### Food Safety NC (`/foodsafety/`)
- Log non-conformances (NCs): unit, subarea (Main CK has 14 selectable zones), category, description, optional photo
- NC list with open / resolved filter and per-card delete
- NC detail: full report view, photo log panel (report photo + resolution photo), mark as resolved with optional resolution notes and photo
- Photos stored in Cloudinary; falls back to local disk if Cloudinary is not configured
- Delete NCs from list or detail page (with confirmation)

### Admin & User Management (`/admin/`)
- JWT-based authentication with httpOnly cookies (`ck_auth`)
- Login page at `/login` — supports `?next=` redirect param
- Admin panel: user list with role management, permissions matrix
- Default seed user: `admin` / `admin123` (change on first deploy)
- Protected routes: `requireAuth` and `requireAdmin` middleware

---

## API Reference

### Maintenance

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/equipment` | List all equipment |
| POST | `/api/equipment` | Create equipment |
| GET | `/api/equipment/:id` | Get equipment by ID |
| PUT | `/api/equipment/:id` | Update equipment |
| DELETE | `/api/equipment/:id` | Delete equipment |
| POST | `/api/equipment/:id/generate-qr` | Regenerate QR code |
| GET | `/api/equipment-issues` | All equipment issues |
| POST | `/api/equipment-issues` | Report issue (multipart/form-data, optional `image`) |
| GET | `/api/equipment-issues/all-open` | All open issues |
| GET | `/api/equipment-issues/counts` | Open issue counts per equipment |
| GET | `/api/equipment-issues/equipment/:id` | Issues for one equipment |
| PATCH | `/api/equipment-issues/:id/resolve` | Resolve issue |
| DELETE | `/api/equipment-issues/:id` | Delete issue |
| GET | `/api/maintenance` | List maintenance records |
| POST | `/api/maintenance` | Log maintenance (multipart/form-data, optional `image`) |
| GET | `/api/issues` | List area issues |
| POST | `/api/issues` | Report area issue (multipart/form-data, optional `image`) |
| PUT | `/api/issues/:id` | Update area issue (priority, status, etc.) |
| GET | `/api/areas` | List areas |
| GET | `/api/reports` | Reports / analytics |

### Procurement

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/requests` | List all requests |
| POST | `/api/requests` | Submit request (multipart/form-data, optional `image`) |
| GET | `/api/requests/:id` | Get request by ID |
| PATCH | `/api/requests/:id` | Update request status |
| DELETE | `/api/requests/:id` | Delete request |

### Food Safety NC

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/foodsafety/report` | Submit new NC (multipart/form-data, optional `photo`) |
| GET | `/api/foodsafety/list` | List all NCs (filterable by status) |
| GET | `/api/foodsafety/:id` | Get NC by ID |
| POST | `/api/foodsafety/:id/resolve` | Resolve NC (multipart/form-data, optional `resolutionPhoto`) |
| DELETE | `/api/foodsafety/:id` | Delete NC |

### Auth & Admin

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login — sets `ck_auth` httpOnly cookie |
| POST | `/api/auth/logout` | Clear auth cookie |
| GET | `/api/auth/me` | Current user info (requires auth) |
| GET | `/api/admin/users` | List all users (admin only) |
| POST | `/api/admin/users` | Create user (admin only) |
| PUT | `/api/admin/users/:id` | Update user role/password (admin only) |
| DELETE | `/api/admin/users/:id` | Delete user (admin only) |

### TempLog

| Method | Endpoint | Description |
|---|---|---|
| GET | `/templog/api/cooks` | List cook records (filterable by date) |
| POST | `/templog/api/cooks` | Save a cook record |
| GET | `/templog/api/cooks/export` | Download CSV |
| GET | `/templog/api/cooks/report.pdf` | Download PDF (requires Puppeteer) |

### Utility

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server + DB connection status |
| GET | `/api/qr` | PNG QR code pointing to `/procurement/request` |
| GET | `/api/public-url` | Returns ngrok tunnel URL or local IP |

---

## Deployment (Railway)

- `app.set('trust proxy', 1)` — ensures `req.protocol` is `https` behind Railway's proxy
- `PUPPETEER_SKIP_DOWNLOAD=true` in `.npmrc` — skips Chromium download during build
- `"engines": { "node": ">=18.0.0" }` in `package.json`
- Push to GitHub → Railway auto-deploys

### Required Railway Environment Variables

```
MAINTENANCE_MONGODB_URI
TEMPLOG_MONGODB_URI
TEMPLOG_DB_NAME
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
JWT_SECRET
NODE_ENV=production
```

`PORT` is set automatically by Railway.

> **Photos on Railway:** Railway has an ephemeral filesystem — locally-saved photos are lost on redeploy. Set the three `CLOUDINARY_*` variables so all photos are stored permanently in Cloudinary.

---

## Mobile / LAN Access (local dev)

1. Run `ipconfig` → find your IPv4 address
2. Set `QR_BASE_URL=http://<your-ip>:3000` in `.env`
3. Add a Windows Firewall inbound rule for TCP port 3000
4. Connect phone to the same WiFi
5. Open `http://<your-ip>:3000` on the phone
