# Future Updates & Planned Features

This document tracks planned features, improvements, and ideas for future development of the Central Kitchen Maintenance Dashboard.

---

## 🛒 Equipment Purchase Request via QR

### Overview
A QR-code-driven purchase request workflow that allows staff to scan a QR code on equipment (or a printed request sheet) and submit a request to buy new equipment or replacement parts — directly from their phone.

### Proposed Flow
1. A dedicated **"Request Purchase"** QR code is displayed in the kitchen (per equipment or at a common station).
2. Staff scan the QR code and land on `request-purchase.html` — a mobile-friendly form.
3. Staff fill in:
   - Equipment name / type (or auto-populated if linked to a specific unit)
   - What is needed (new unit, spare part, consumable, etc.)
   - Reason / urgency level (Low / Medium / Urgent)
   - Requested quantity
   - Optional: photo attachment or notes
4. Submission is saved to MongoDB and surfaced in the admin dashboard.
5. Admin can review, approve, reject, or mark as ordered from the dashboard.

### Data Model (Proposed)
```javascript
{
  requestId: String,          // Auto-generated reference number
  equipmentId: String,        // Optional — linked equipment
  itemRequested: String,      // What is being requested
  reason: String,             // Why it is needed
  urgency: String,            // 'low' | 'medium' | 'urgent'
  quantity: Number,
  requestedBy: String,        // Staff name (optional)
  status: String,             // 'pending' | 'approved' | 'ordered' | 'rejected'
  requestedDate: Date,
  reviewedDate: Date,
  reviewedBy: String,
  notes: String               // Admin notes
}
```

### Admin Features
- Purchase request list in dashboard with status filters (Pending / Approved / Ordered)
- Approve / Reject / Mark as Ordered actions per request
- Email or push notification to admin when a new request is submitted
- Export requests to CSV for procurement team

### Bilingual Support
- Form available in English and 中文 (matching `report-issue.html` pattern)

### Files to Create
| File | Purpose |
|------|---------|
| `request-purchase.html` | Mobile QR form for staff |
| `purchase-requests.html` | Admin view of all requests |
| `models/PurchaseRequest.js` | Mongoose schema |
| `routes/purchaseRequests.js` | CRUD API |

---

## 📊 Reports & Analytics Page

- Monthly maintenance summary per equipment
- Most frequently reported issues
- Equipment with highest downtime / most issues
- Export to PDF or CSV
- Chart: issue trends over time (line chart)
- Chart: equipment status breakdown (donut chart)

---

## 🔔 Notifications System

- In-app notification bell (route `GET /api/notifications` already exists)
- Alert when equipment has been in "Needs Action" status for >N days
- Alert when new staff issue is reported
- Daily digest summary (optional email)

---

## 📍 Areas Management

- Group equipment by kitchen area (e.g. Cold Storage, Cooking, Prep)
- Area-level status overview
- Area-specific QR sheets that list all equipment in that zone
- `models/Area.js` and `models/AreaIssue.js` already scaffolded

---

## 🔑 User Authentication & Roles

- Admin login (view all data, approve purchases, resolve issues)
- Staff access (report issues, request purchases — no login required via QR)
- Optional PIN-based access for managers on shared devices
- JWT session tokens

---

## 📱 Progressive Web App (PWA)

- Add `manifest.json` and service worker
- "Add to Home Screen" prompt on mobile
- Offline caching of equipment list for QR scan without server

---

## 🔄 Maintenance Scheduling

- Set recurring maintenance intervals per equipment (e.g. every 30 days)
- Dashboard highlights equipment overdue for maintenance
- Calendar view of upcoming scheduled maintenance
- Auto-generate maintenance tasks

---

## 🖨️ Printable QR Sheets

- Generate a printable A4 PDF with all QR codes for a given area or all equipment
- Each QR label includes equipment name, ID, type, and location
- For posting on equipment or in binders

---

## 📦 Supplier & Parts Database

- Track approved suppliers per equipment type
- Link spare parts to equipment records
- Request parts directly from a supplier contact via the purchase request workflow

---

## Notes

- Features are listed in rough priority order within each section.
- Implementation details are subject to change based on operational feedback.
- See `IMPLEMENTATION_PLAN.md` for the original phased plan.
