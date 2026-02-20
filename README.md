# Central Kitchen Maintenance Dashboard

A full-stack maintenance management system for central kitchen equipment (freezers, chillers, warmers, etc.). Built with Node.js, Express, MongoDB, and vanilla HTML/CSS/JS — designed for both desktop admin use and mobile staff access via QR codes.

---

## Current Status: Phase 1 Complete + Phase 2 Active

### ✅ Completed Features

#### Core Infrastructure
- Node.js/Express REST API server on port 3000
- MongoDB database (`maintenance_dashboard`) via Mongoose
- Server binds to `0.0.0.0` for local network (LAN/phone) access
- Dynamic `API_BASE` — works on desktop (`localhost`) and mobile (LAN IP) without code changes
- Environment config via `.env` (port, DB URI, QR base URL)

#### Equipment Management
- Add, edit, and view equipment records (name, type, location, status, serial number, purchase date)
- Equipment ID auto-populates from equipment name (overridable)
- Equipment types: Walk-In Freezer, Standing Freezer, Walk-In Chiller, Standing Chiller, Warmer
- Status tracking: Operational / Needs Action
- Equipment list with live status badges and search/filter

#### QR Code System
- Unique QR code generated per equipment record
- QR codes link to mobile-friendly **staff issue reporting form** (`report-issue.html`)
- QR base URL configured via `QR_BASE_URL` in `.env` for LAN access from phones
- Regenerate QR from equipment details page

#### Staff Issue Reporting (`report-issue.html`)
- Mobile-optimised form accessible via QR scan
- **Bilingual: English / 中文 (Mandarin)** with auto language detection from browser
- Language toggle button (EN / 中文) in top corner
- Loads equipment name/type/location automatically from ID in URL
- Reports saved to MongoDB with reporter name (optional), description, timestamp
- Success screen with option to report another issue

#### Issue Tracking & Management
- Full CRUD API for staff-reported equipment issues (`/api/equipment-issues`)
- Equipment details page shows all reported issues with Open/Resolved badges
- Inline "Report an Issue" form directly on the equipment details page
- Mark issues as Resolved or Delete from the details page
- Issue count badges on equipment list cards (red `⚠️ N open issues`)

#### Needs Attention Dashboard (`all-issues.html`)
- Combined view of all open staff-reported issues **and** equipment with status "Needs Action"
- Accessible by clicking the **⚠️ Needs Attention** stat pill on the equipment list
- Staff issue cards show: equipment name, ID, location, description, reporter, date
- Equipment cards show: type icon, name, location, "Needs Action" badge
- Every card is clickable — navigates to that equipment's detail page

#### Maintenance Logging
- Log maintenance activities against equipment records
- Maintenance history viewable per equipment on details page

---

## Project Structure

```
maintenancedb/
├── server.js                   # Express server, route registration, DB connection
├── index.html                   # Dashboard home
├── equipment-list.html          # Equipment list with status + issue badges
├── equipment-details.html       # Equipment detail, maintenance history, issue management
├── add-equipment.html           # Add / edit equipment form
├── report-issue.html            # Mobile QR staff issue form (bilingual EN/中文)
├── all-issues.html              # Combined needs-attention view
├── log-maintenance.html         # Log maintenance page
├── models/
│   ├── Equipment.js             # Equipment schema
│   ├── EquipmentIssue.js        # Staff-reported issue schema
│   ├── MaintenanceRecord.js     # Maintenance log schema
│   ├── Area.js / AreaIssue.js  # Area management schemas
│   └── Notification.js          # Notification schema
├── routes/
│   ├── equipment.js             # Equipment CRUD API
│   ├── equipmentIssues.js       # Issue reporting CRUD API
│   ├── maintenance.js           # Maintenance log API
│   ├── reports.js               # Reports/analytics API
│   └── notifications.js         # Notifications API
├── services/
│   ├── qr-service.js            # QR code generation (uses QR_BASE_URL from .env)
│   ├── maintenance-calculator.js
│   └── notification-service.js
├── js/
│   ├── api.js                   # Dynamic API_BASE (works on localhost + LAN)
│   ├── app.js                   # Dashboard logic
│   ├── equipment.js             # Equipment list logic
│   └── charts.js                # Chart rendering
└── css/
    └── styles.css
```

---

## Setup Instructions

### Prerequisites
- Node.js v18+
- MongoDB running locally (`mongodb://localhost:27017`)

### Installation

```bash
git clone <repository-url>
cd maintenancedb
npm install
```

### Configuration

Create a `.env` file in the `maintenancedb/` directory:

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/maintenance_dashboard
QR_BASE_URL=http://<your-local-ip>:3000
NODE_ENV=development
```

> Replace `<your-local-ip>` with your machine's LAN IP (run `ipconfig` on Windows) so QR codes work from phones on the same network.

### Running

```bash
node server.js
```

Server starts at `http://localhost:3000`. Access from phone at `http://<your-local-ip>:3000`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/equipment` | List all equipment |
| POST | `/api/equipment` | Add equipment |
| PUT | `/api/equipment/:id` | Update equipment |
| DELETE | `/api/equipment/:id` | Delete equipment |
| GET | `/api/equipment-issues/all-open` | All open staff issues |
| GET | `/api/equipment-issues/counts` | Open issue counts per equipment |
| GET | `/api/equipment-issues/equipment/:id` | Issues for one piece of equipment |
| POST | `/api/equipment-issues` | Report a new issue |
| PATCH | `/api/equipment-issues/:id/resolve` | Mark issue resolved |
| DELETE | `/api/equipment-issues/:id` | Delete issue |
| GET | `/api/maintenance` | List maintenance records |
| POST | `/api/maintenance` | Log maintenance |

---

## Phone / Mobile Access

1. Find your local IP: run `ipconfig` in terminal, look for IPv4 under your active adapter
2. Set `QR_BASE_URL=http://<ip>:3000` in `.env`
3. Add a Windows Firewall inbound rule for TCP port 3000
4. Connect phone to the same WiFi
5. Open `http://<ip>:3000` on phone browser or scan a QR code

---

## Contributing

Pull requests welcome. Open an issue for any bugs or feature suggestions.