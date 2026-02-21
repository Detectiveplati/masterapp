# Master Kitchen Management Application

A comprehensive kitchen management system integrating two powerful applications:
1. **Maintenance Dashboard** - Equipment tracking, maintenance scheduling, and issue management
2. **Kitchen Temp Log** - Cooking temperature logs with Bluetooth thermometer support

## 📁 Project Structure

```
masterapp/
├── server.js                     # Main Express server
├── package.json                  # Node.js dependencies
├── .env                          # Environment configuration
├── .gitignore                   # Git ignore rules
├── README.md                    # This file
│
├── public/                      # Client-side files (Frontend)
│   ├── index.html               # Main landing page
│   │
│   ├── css/                     # Stylesheets
│   │   └── styles.css           # Main application styles
│   │
│   ├── js/                      # JavaScript modules
│   │   ├── api.js               # API client for backend communication
│   │   ├── app.js               # Main application controller
│   │   ├── area-issues.js       # Area issues management
│   │   ├── charts.js            # Chart generation
│   │   ├── equipment.js         # Equipment management UI
│   │   ├── maintenance-logger.js # Maintenance logging
│   │   ├── qr-generator.js      # QR code generation
│   │   └── records.js           # Records management
│   │
│   ├── assets/                  # Static assets
│   │   ├── Chilli-Api-Logo-170px.png
│   │   └── icons/
│   │
│   └── *.html                   # Application pages
│       ├── add-equipment.html
│       ├── all-issues.html
│       ├── area-maintenance.html
│       ├── areas.html
│       ├── equipment-details.html
│       ├── equipment-list.html
│       ├── issue-details.html
│       ├── issues-list.html
│       ├── log-maintenance.html
│       ├── maintenance.html
│       └── report-issue.html
│
├── models/                      # MongoDB Models (Mongoose)
│   ├── Area.js
│   ├── AreaIssue.js
│   ├── Equipment.js
│   ├── EquipmentIssue.js
│   ├── MaintenanceRecord.js
│   └── Notification.js
│
├── routes/                      # Express API Routes
│   ├── areas.js
│   ├── equipment.js
│   ├── equipmentIssues.js
│   ├── issues.js
│   ├── maintenance.js
│   ├── notifications.js
│   ├── reports.js
│   └── seed.js
│
├── services/                    # Business Logic Services
│   ├── maintenance-calculator.js
│   ├── notification-service.js
│   └── qr-service.js
│
├── templog/                     # Embedded Kitchen Temp Log App
│   ├── index.html
│   ├── app.js
│   ├── data.js
│   ├── styles.css
│   └── departments/
│       ├── combioven.html
│       ├── combioven-data.html
│       └── combioven-report.html
│
└── docs/                        # Documentation
    ├── FUTURE_UPDATES.md
    ├── IMPLEMENTATION_PLAN.md
    ├── MONGODB_SETUP.md
    ├── PHASE_1_COMPLETE.md
    └── QUICK_START.md
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** 16+ and npm
- **MongoDB** (local or remote instance)
- Modern web browser (Chrome, Edge, Safari)
- **Optional**: ngrok for remote access

### Installation

1. **Clone and navigate**:
   ```bash
   cd masterapp
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment** (create `.env` file):
   ```env
   # Maintenance Dashboard Database
   MAINTENANCE_MONGODB_URI=mongodb://localhost:27017/central_kitchen_maintenance
   
   # Kitchen Temp Log Database
   TEMPLOG_MONGODB_URI=mongodb://localhost:27017
   TEMPLOG_DB_NAME=kitchenlog
   
   # Server Configuration
   PORT=3000
   HOST=0.0.0.0
   
   # Optional: QR Code Base URL
   QR_BASE_URL=http://localhost:3000
   ```

4. **Start MongoDB**:
   ```bash
   mongod
   ```

5. **Start the application**:
   ```bash
   npm start
   ```

6. **Access the applications**:
   - **Maintenance Dashboard**: http://localhost:3000/
   - **Kitchen Temp Log**: http://localhost:3000/templog/
   - **Health Check**: http://localhost:3000/api/health

## 📱 Applications

### 1. Maintenance Dashboard

**Features:**
- Equipment inventory management
- Maintenance scheduling and tracking
- Issue reporting and resolution
- Area-based organization
- QR code generation for quick access
- Maintenance history and analytics
- Notification system
- Comprehensive reporting

**Key Pages:**
- `/` - Main dashboard
- `/equipment-list.html` - Equipment inventory
- `/add-equipment.html` - Add new equipment
- `/equipment-details.html?id=xxx` - Equipment details and QR code
- `/log-maintenance.html?equipmentId=xxx` - Log maintenance
- `/maintenance.html` - Maintenance overview
- `/issues-list.html` - All issues
- `/report-issue.html` - Report new issue
- `/areas.html` - Area management
- `/area-maintenance.html?areaId=xxx` - Area-specific maintenance

### 2. Kitchen Temp Log

**Features:**
- Multi-cook tracking with live timers
- Bluetooth thermometer integration
- Temperature and duration logging
- Staff tracking
- Tray counting
- CSV export
- PDF report generation
- Date range filtering

**Key Pages:**
- `/templog/` - Main temp log interface
- `/templog/departments/combioven.html` - Combi oven logging
- `/templog/departments/combioven-data.html` - Data viewer
- `/templog/departments/combioven-report.html` - PDF reports

## 🔧 Technology Stack

### Frontend
- **HTML5** - Semantic markup
- **CSS3** - Modern styling
- **Vanilla JavaScript** - No frameworks, pure ES6+
- **Web Bluetooth API** - Thermometer integration
- **Charts** - Data visualization

### Backend
- **Node.js** - JavaScript runtime
- **Express.js** - Web server framework
- **Mongoose** - MongoDB ODM (Maintenance Dashboard)
- **MongoDB Native Driver** - Direct database access (Temp Log)
- **Puppeteer** - PDF generation (optional)
- **QRCode** - QR code generation

### Databases
- **MongoDB** - Two separate databases:
  1. `central_kitchen_maintenance` - Maintenance Dashboard
  2. `kitchenlog` - Kitchen Temp Log

## 📚 API Documentation

### Maintenance Dashboard API

#### Equipment
- `GET /api/equipment` - Get all equipment
- `GET /api/equipment/:id` - Get equipment by ID
- `POST /api/equipment` - Create new equipment
- `PATCH /api/equipment/:id` - Update equipment
- `DELETE /api/equipment/:id` - Delete equipment

#### Maintenance Records
- `GET /api/maintenance` - Get all maintenance records
- `GET /api/maintenance/:id` - Get maintenance record by ID
- `POST /api/maintenance` - Create maintenance record
- `GET /api/maintenance/equipment/:equipmentId` - Get equipment maintenance history

#### Issues
- `GET /api/issues` - Get all issues
- `GET /api/issues/:id` - Get issue by ID
- `POST /api/issues` - Report new issue
- `PATCH /api/issues/:id` - Update issue
- `DELETE /api/issues/:id` - Delete issue

#### Equipment Issues
- `GET /api/equipment-issues` - Get all equipment issues
- `POST /api/equipment-issues` - Report equipment issue
- `PATCH /api/equipment-issues/:id/resolve` - Resolve issue

#### Areas
- `GET /api/areas` - Get all areas
- `GET /api/areas/:id` - Get area by ID
- `POST /api/areas` - Create new area
- `PATCH /api/areas/:id` - Update area

#### Reports
- `GET /api/reports/equipment-status` - Equipment status report
- `GET /api/reports/maintenance-overview` - Maintenance overview

#### Utilities
- `GET /api/public-url` - Get public access URL (ngrok support)
- `GET /api/health` - Health check endpoint

### Kitchen Temp Log API

- `POST /templog/api/cooks` - Save cook record
- `GET /templog/api/cooks?limit=8` - Get recent cooks
- `GET /templog/api/cooks?startDate=...&endDate=...` - Filter by date
- `GET /templog/api/cooks/export` - Export as CSV
- `GET /templog/api/cooks/report.pdf` - Generate PDF report

## 🏗️ Architecture

### Design Patterns
- **MVC Pattern**: Separation of Model (MongoDB), View (HTML/CSS), Controller (JS)
- **RESTful API**: Standard HTTP methods and status codes
- **Modular Design**: Single responsibility principle
- **Service Layer**: Business logic separated from routes

### Code Organization
1. **Public Folder**: All client-accessible files
2. **Models**: MongoDB schema definitions (Mongoose)
3. **Routes**: Express route handlers
4. **Services**: Business logic and utilities
5. **Separation of Concerns**: Clear boundaries between layers

### Database Design
- **Maintenance Dashboard**: Mongoose schemas with relationships
- **Kitchen Temp Log**: Direct MongoDB collection access
- **Two separate databases**: Proper isolation of concerns

## 🔐 Security

- Environment variables for sensitive configuration
- Input validation on server-side
- CORS enabled for cross-origin requests
- Error handling without exposing internals
- MongoDB connection error handling

## 📱 Mobile & Remote Access

### LAN Access
Access from tablets/phones on the same network:
```
http://<your-computer-ip>:3000/
```

### Remote Access (ngrok)
1. Install ngrok: https://ngrok.com/
2. Start ngrok:
   ```bash
   ngrok http 3000
   ```
3. Use the provided HTTPS URL
4. QR codes auto-detect ngrok URLs

## 🛠️ Development

### File Structure Guidelines

**Adding New Frontend Features:**
1. HTML files go in `public/`
2. CSS goes in `public/css/`
3. JavaScript modules go in `public/js/`
4. Update navigation in `public/index.html`

**Adding New Backend Features:**
1. Models go in `models/`
2. Routes go in `routes/`
3. Business logic goes in `services/`
4. Register routes in `server.js`

### Code Standards
- **JSDoc comments** for functions
- **Consistent naming**: camelCase for JS, kebab-case for files
- **Error handling**: Try-catch with meaningful messages
- **Async/await**: For asynchronous operations
- **No console.log in production**: Use proper logging

### Testing
```bash
# Start in development mode
npm start

# Test health endpoint
curl http://localhost:3000/api/health

# Test equipment API
curl http://localhost:3000/api/equipment
```

## 📦 Deployment

### Production Checklist
- [ ] Update `.env` with production MongoDB URIs
- [ ] Set proper HOST and PORT
- [ ] Install all dependencies including Puppeteer
- [ ] Configure firewall rules
- [ ] Set up MongoDB backups
- [ ] Configure HTTPS/SSL
- [ ] Set up process manager (PM2)
- [ ] Configure reverse proxy (Nginx)

### PM2 Deployment
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name "master-kitchen-app"

# Save process list
pm2 save

# Set to start on boot
pm2 startup
```

## 🐛 Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongod --version`
- Check connection strings in `.env`
- Verify firewall allows port 27017

### PDF Generation Fails
- Install Puppeteer: `npm install puppeteer`
- Puppeteer may need additional dependencies on Linux

### QR Codes Not Working
- Check QR_BASE_URL in `.env`
- Ensure ngrok is running if using remote access
- Test `/api/public-url` endpoint

## 📄 License

ISC

## 👥 Contributors

Central Kitchen Team

## 📞 Support

For issues or questions, refer to the documentation in the `docs/` folder:
- `QUICK_START.md` - Getting started guide
- `MONGODB_SETUP.md` - Database setup
- `IMPLEMENTATION_PLAN.md` - Feature roadmap
- `FUTURE_UPDATES.md` - Planned improvements

---

**Built with ❤️ for professional kitchen operations**

Last Updated: February 21, 2026
