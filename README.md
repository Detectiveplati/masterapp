# Central Kitchen Master App

A unified full-stack web application for central kitchen operations. Built with Node.js, Express, MongoDB, and vanilla HTML/CSS/JS — deployed on Railway, accessible on desktop and mobile.

Three modules run under one server:

| Module | URL Path | Description |
|---|---|---|
| **Maintenance Dashboard** | `/maintenance/` | Equipment tracking, issue reporting, maintenance logs |
| **Kitchen Temp Log** | `/templog/` | Cooking temperature records, CSV/PDF export |
| **Kitchen Equipment Procurement** | `/procurement/` | Purchase request submission and tracking |

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
├── templog/                      # Kitchen Temp Log (embedded app)
│   └── departments/
│       └── combioven-report.html # Printable PDF report template
│
├── models/                       # Mongoose schemas
│   ├── Equipment.js
│   ├── EquipmentIssue.js
│   ├── MaintenanceRecord.js
│   ├── Area.js
│   ├── AreaIssue.js
│   ├── Notification.js
│   └── ProcurementRequest.js
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
│   └── seed.js
│
└── services/
    ├── cloudinary-upload.js      # Shared Cloudinary multer factory
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

# Cloudinary (photo uploads for issues, maintenance records, procurement)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Optional: override base URL for QR codes when using ngrok
QR_BASE_URL=http://<your-local-ip>:3000

NODE_ENV=development
```

> If Cloudinary is not configured, photo uploads are skipped gracefully — text submissions still work.

### Run

```bash
node server.js
```

Open `http://localhost:3000` for the hub page.

---

## Features

### Hub Page (`/`)
- Central landing page linking all three modules
- Live server health check showing database connection status

### Maintenance Dashboard (`/maintenance/`)
- Add, edit, delete equipment (walk-in freezers, chillers, warmers, etc.)
- Equipment status: Operational / Needs Action
- Staff issue reporting via QR code — bilingual EN / 中文, auto language detection
- Area issue reporting with optional photo upload (Cloudinary)
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
NODE_ENV=production
```

`PORT` is set automatically by Railway.

---

## Mobile / LAN Access (local dev)

1. Run `ipconfig` → find your IPv4 address
2. Set `QR_BASE_URL=http://<your-ip>:3000` in `.env`
3. Add a Windows Firewall inbound rule for TCP port 3000
4. Connect phone to the same WiFi
5. Open `http://<your-ip>:3000` on the phone
