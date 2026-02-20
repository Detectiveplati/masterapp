# Kitchen Temperature & Timing Log System

A kitchen cooking log app focused on the Combi Oven department. Built with vanilla JavaScript for tablet use, with real-time timers, temperature tracking, and a Node/Express + MongoDB backend for persistence.

## Summary

This is a kitchen cooking log app for the Combi Oven department. It tracks each cook’s food item, start/end times, duration, core temperature, staff member, and tray count, shows recent entries, and supports CSV export plus PDF reporting through a Node/Express + MongoDB backend.

## Overview

This system streamlines kitchen operations by providing a Combi Oven cooking log with automatic data persistence, recent activity, and exportable reports.

## Features

### Core Functionality
- **Combi Oven Log**: Dedicated interface for combi oven cooks
- **Real-Time Timers**: Individual timers per active cook
- **Staff Tracking**: Associate each cook with a specific chef
- **Temperature Logging**: Record core temperature readings
- **Tray Counting**: Track the number of trays prepared
- **Recent Activity Display**: Quick view of the last 8 completed cooks
- **CSV Export**: Full data export for analysis and archiving
- **PDF Reports**: Printable report via HTML → PDF export
- **Date-Range Reporting**: Filter logs by start/end date (auto-loads on report page)

### Technical Highlights
- **Bilingual Interface**: Chinese (Simplified) + English UI text
- **Tablet Optimized**: Responsive layout for 658x858 Android tablets
- **Node + MongoDB**: Express API with MongoDB persistence
- **Report Rendering**: HTML report page supports PDF generation

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: Node.js, Express
- **Database**: MongoDB
- **Target Platform**: Android tablets (658x858 minimum resolution)

## Architecture

The application follows a simple client + API architecture:

```
┌─────────────────────────┐
│   UI Layer (app.js)     │
│   - Timer management    │
│   - Staff selection     │
│   - Cooking workflow    │
└────────────┬────────────┘
             │
┌────────────▼────────────┐
│  API Layer (server.js)  │
│   - /api/cooks           │
│   - CSV/PDF exports     │
└────────────┬────────────┘
             │
┌────────────▼────────────┐
│   MongoDB               │
│   - cooks collection    │
└─────────────────────────┘
```

This abstraction enables seamless migration to MongoDB or other databases without modifying the UI layer.

## File Structure

```
Kitchen Temp Log/
├── index.html                 # Home page
├── app.js                     # Core cooking logic & UI management
├── data.js                    # API calls to /api/cooks
├── server.js                  # Express API server
├── styles.css                 # Unified styling (tablet optimized)
├── assets/                    # Branding assets
│   └── Chilli-Api-Logo-170px.png
├── departments/
│   ├── combioven.html         # Combi Oven interface
│   ├── combioven-data.html    # Date range data view
│   └── combioven-report.html  # Report + PDF export
└── README.md                  # This file
```

## Department Configuration

### Combi Oven Department
- **Staff**: Ah Dong (specialized griller)
- **Menu Items**: 17 grilled items including honey wings, pandan chicken, teriyaki chicken, satay, and more

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB connection string (local or Atlas)
- Chrome/Chromium-based browser

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Detectiveplati/kitchentemplog.git
   cd kitchentemplog
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set environment variables** (create a `.env` file)
   ```bash
   MONGODB_URI=mongodb+srv://USER:PASS@cluster/db
   DB_NAME=kitchenlog
   PORT=3000
   ```

4. **Start the server**
   ```bash
   node server.js
   ```

5. **Open in browser**
   - Navigate to `http://localhost:3000`

### First-Time Setup

1. Ensure MongoDB is reachable via `MONGODB_URI`
2. Open the Combi Oven page and start logging cooks

## Usage Workflow

### Adding a New Cook

1. **Select Staff**: Click on a chef's name at the top (auto-selected)
2. **Select Food**: Click on a food item from the menu
3. **Start Timer**: Press "START COOKING" when the item enters the cooking area
4. **Monitor**: Watch the real-time timer on the cook card
5. **End Cooking**: Press "END COOKING" when done
6. **Log Details**: Enter core temperature and number of trays
7. **Save**: Click "SAVE" to record in the database
8. **View History**: Recently completed cooks appear in the "Recent Cooks" section

### Removing a Cook

- Click "Cancel / Remove" to discard a cook entry
- Available before cooking starts or after cooking ends
- Hidden while cooking is in progress

### Export Data

- Click "Download Full CSV" to export all records
- Use the report page to export PDF

## CSV Format

Each cook record includes:

| Field | Example | Purpose |
|-------|---------|---------|
| Food | Spring Roll | Item being cooked |
| Start Date | 2026-01-20 | Date cooking began |
| Start Time | 14:30:45 | Time cooking began |
| End Date | 2026-01-20 | Date cooking ended |
| End Time | 14:35:22 | Time cooking ended |
| Duration | 4.6 | Minutes cooked |
| Temp | 75.5 | Core temperature (°C) |
| Staff | Alice | Chef responsible |
| Trays | 3 | Number of trays |

## Customization

### Adding a New Menu Item

Edit the relevant department HTML file and add to the food grid:

```html
<button class="food-btn" onclick="addNewCook('新食物 New Food')">
  新食物 New Food
</button>
```

### Adding a New Staff Member

Edit the department HTML and add a staff button:

```html
<button id="staff-NewChef" class="staff-btn" onclick="setGlobalStaff('New Chef')">
  New Chef
</button>
```

### Modifying Tablet Layout

Adjust in `styles.css`:
- **Grid sizing**: `minmax(180px, 1fr)` controls items per row
- **Font sizes**: Adjust `rem` values for different screen sizes
- **Spacing**: Modify `gap` and `padding` values

## Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| Core App | ✅ | ✅ | ✅ | ✅ |
| PDF Export | ✅ | ✅ | ✅ | ✅ |

## Known Limitations

- Tablet optimization targets 658×858 minimum; smaller screens may require scrolling
- Single user per session (no concurrent multi-user support)
- PDF export requires Puppeteer to be installed

## Future Enhancements

- **Multi-User Support**: Concurrent user sessions with conflict resolution
- **Analytics Dashboard**: Charts and insights on cooking times and temperatures
- **Mobile App**: Native iOS/Android applications
- **Real-Time Sync**: Cloud synchronization across multiple tablets
- **QR Code Integration**: Quick food item selection via QR codes
- **Temperature Alerts**: Notifications when temperatures deviate from targets
- **Staff Performance**: Metrics and trends for each chef

## Development Notes

### Code Standards

- **UI Layer** (`app.js`): Manages state and DOM interactions
- **Data Layer** (`data.js`): API calls to `server.js`
- **Styling** (`styles.css`): Unified tablet-optimized styles
- **Bilingual**: All user-facing text includes Chinese/English

### API Endpoints

- `POST /api/cooks` — save cook record
- `GET /api/cooks?limit=8` — recent entries
- `GET /api/cooks?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` — date range
- `GET /api/cooks/export` — CSV export
- `GET /api/cooks/report.pdf` — PDF report

### Testing

- Test on actual tablet devices for accurate UI validation
- Verify API responses with date range filters
- Check bilingual text in all user interfaces

## License

Pending

## Support & Contribution

For issues, suggestions, or contributions:

1. Open an issue on GitHub
2. Describe the problem with steps to reproduce
3. Include device/browser information
4. Provide CSV sample if data-related

## Author

Kitchen Temperature & Timing Log System
- Repository: [Detectiveplati/kitchentemplog](https://github.com/Detectiveplati/kitchentemplog)
- Maintained by: Zack

---

**Last Updated**: January 2026  
**Current Version**: 1.0  
**Status**: In Progress
