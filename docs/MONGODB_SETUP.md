# MongoDB Setup Guide

## Installation

### Windows
1. Download MongoDB Community Server from: https://www.mongodb.com/try/download/community
2. Run the installer and follow the setup wizard
3. Choose "Complete" installation
4. Install MongoDB as a Windows Service (recommended)

### Alternative: MongoDB Atlas (Cloud)
If you prefer a cloud database, you can use MongoDB Atlas (free tier available):
1. Sign up at: https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Get your connection string
4. Update `.env` file with your Atlas connection string:
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/maintenance_dashboard
   ```

## Starting MongoDB (Local Installation)

### Windows
MongoDB should start automatically if installed as a service. To manually start:
```bash
net start MongoDB
```

To stop:
```bash
net stop MongoDB
```

## Verifying MongoDB Connection

After MongoDB is running, start your application:
```bash
npm start
```

You should see: `MongoDB connected successfully`

## Database Structure

### Equipment Collection
- `name`: Equipment name
- `type`: Type of equipment (freezer, chiller, etc.)
- `status`: Current status (operational, maintenance, broken, offline)
- `createdAt`: Auto-generated timestamp
- `updatedAt`: Auto-generated timestamp

### MaintenanceRecord Collection
- `equipmentId`: Reference to Equipment
- `activity`: Description of maintenance activity
- `date`: Date of maintenance
- `notes`: Additional notes (optional)
- `performedBy`: Person who performed maintenance (optional)
- `createdAt`: Auto-generated timestamp
- `updatedAt`: Auto-generated timestamp

## API Endpoints

### Equipment
- `GET /api/equipment` - Get all equipment
- `GET /api/equipment/:id` - Get single equipment
- `POST /api/equipment` - Create new equipment
- `PUT /api/equipment/:id` - Update equipment
- `DELETE /api/equipment/:id` - Delete equipment

### Maintenance Records
- `GET /api/records` - Get all maintenance records
- `GET /api/records/equipment/:equipmentId` - Get records for specific equipment
- `GET /api/records/:id` - Get single record
- `POST /api/records` - Create new record
- `PUT /api/records/:id` - Update record
- `DELETE /api/records/:id` - Delete record
