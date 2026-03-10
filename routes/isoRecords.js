'use strict';
const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const XLSX       = require('xlsx');
const IsoRecord  = require('../models/IsoRecord');
const { requireAuth } = require('../services/auth-middleware');

// Protect all ISO Records routes
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Shared status computation — never store status in DB
// ---------------------------------------------------------------------------
function computeStatus(record) {
  const { latestDateFiled, frequency } = record;
  if (!latestDateFiled) return 'Not Filed';

  const now    = new Date();
  const filed  = new Date(latestDateFiled);
  const monthsDiff =
    (now.getFullYear() - filed.getFullYear()) * 12 +
    (now.getMonth()    - filed.getMonth());

  // Daily forms are physically filed monthly, so previous month is still on-time.
  if (frequency === 'Daily' || frequency === 'Monthly') {
    if (monthsDiff <= 1) return 'Up to Date';
    if (monthsDiff === 2) return '1 Month Late';
    return `${monthsDiff - 1} Months Late`;
  }

  return 'Not Filed';
}

function withStatus(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  obj.status = computeStatus(obj);
  return obj;
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ---------------------------------------------------------------------------
// Seed default records on first run
// ---------------------------------------------------------------------------
const SEED_RECORDS = [
  // Cooking Temperature Logs (1-12)
  { recordName: 'Pan Fry',       department: 'Pan Fry',       category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Soup & Salad',  department: 'Soup & Salad',  category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Night Shift',   department: 'Night Shift',   category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Dim Sum',       department: 'Dim Sum',       category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Braising',      department: 'Braising',      category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Deep Fry',      department: 'Deep Fry',      category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Combi Oven',    department: 'Combi Oven',    category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Cakes & Kueh',  department: 'Cakes & Kueh',  category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Fried Rice',    department: 'Fried Rice',    category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Stir Fry',      department: 'Stir Fry',      category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Paste',         department: 'Paste',         category: 'Cooking Temperature Logs', frequency: 'Daily' },
  { recordName: 'Sauce',         department: 'Sauce',         category: 'Cooking Temperature Logs', frequency: 'Daily' },
  // Units (Multiple Locations)
  { recordName: 'Daily Personal Hygiene Checklist',   department: '06-15/16/17/27', category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Kitchen Equipment Temperature Log',  department: '06-15/16/17/27', category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Warmer Temperature Record',          department: '06-15/16/17/27', category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Daily Personal Hygiene Checklist',   department: '06-19',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Kitchen Equipment Temperature Log',  department: '06-19',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Warmer Temperature Record',          department: '06-19',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Daily Personal Hygiene Checklist',   department: '06-08',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Kitchen Equipment Temperature Log',  department: '06-08',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Warmer Temperature Record',          department: '06-08',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Daily Personal Hygiene Checklist',   department: '05-26',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Kitchen Equipment Temperature Log',  department: '05-26',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Warmer Temperature Record',          department: '05-26',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Daily Personal Hygiene Checklist',   department: '05-27',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Kitchen Equipment Temperature Log',  department: '05-27',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  { recordName: 'Warmer Temperature Record',          department: '05-27',          category: 'Units (Multiple Locations)', frequency: 'Daily' },
  // Fruits & Vegetables
  { recordName: 'Fruits & Vegetables Cleaning and Sanitizing Record',           department: '06-15/16/17/27', category: 'Fruits & Vegetables (06-15/16/17/27)', frequency: 'Daily'   },
  { recordName: 'Verification of Fruit & Vegetable PPM Dispenser Pump Record', department: '06-15/16/17/27', category: 'Fruits & Vegetables (06-15/16/17/27)', frequency: 'Monthly' },
  // Others
  { recordName: 'Disposal of Retention Sample Record', department: 'General', category: 'Others', frequency: 'Monthly' },
  { recordName: 'Reuse Metal Tin Record',              department: 'General', category: 'Others', frequency: 'Monthly' },
  { recordName: 'Vehicle Cleanliness Log',             department: 'General', category: 'Others', frequency: 'Daily'   }
];

async function seedIfEmpty() {
  try {
    const count = await IsoRecord.countDocuments();
    // Last day of previous month (e.g. Feb 28 when run in March)
    const prevMonthEnd = new Date();
    prevMonthEnd.setDate(0);
    prevMonthEnd.setHours(0, 0, 0, 0);
    if (count === 0) {
      await IsoRecord.insertMany(SEED_RECORDS.map(r => ({ ...r, latestDateFiled: prevMonthEnd })));
      console.log(`✓ [ISO Records] Seeded ${SEED_RECORDS.length} default records`);
    } else {
      // One-time backfill: set any unfiled records to last month's end date
      const nullCount = await IsoRecord.countDocuments({ latestDateFiled: null });
      if (nullCount > 0) {
        await IsoRecord.updateMany({ latestDateFiled: null }, { $set: { latestDateFiled: prevMonthEnd } });
        console.log(`✓ [ISO Records] Backfilled ${nullCount} records with last month's date`);
      }
    }
  } catch (err) {
    console.error('✗ [ISO Records] Seed error:', err.message);
  }
}

if (mongoose.connection.readyState === 1) {
  seedIfEmpty();
} else {
  mongoose.connection.once('open', seedIfEmpty);
}

// ---------------------------------------------------------------------------
// GET /api/iso-records — all records with computed status
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    const records = await IsoRecord.find().sort({ createdAt: 1 }).lean();
    res.json(records.map(withStatus));
  } catch (err) {
    console.error('✗ [ISO Records] GET /:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/iso-records/export — download .xlsx report
// NOTE: defined BEFORE /:id to prevent "export" being matched as an ID
// ---------------------------------------------------------------------------
router.get('/export', async (req, res) => {
  try {
    const records = await IsoRecord.find().sort({ createdAt: 1 }).lean();
    const rows    = records.map(withStatus);

    const now    = new Date();
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const month  = MONTHS[now.getMonth()];
    const year   = now.getFullYear();

    function fmtDate(d) {
      if (!d) return '—';
      const dt = new Date(d);
      return `${String(dt.getDate()).padStart(2,'0')} ${SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
    }

    const S = {
      header:    { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1565C0' } }, alignment: { horizontal: 'center', wrapText: true } },
      upToDate:  { fill: { patternType: 'solid', fgColor: { rgb: 'E3F2FD' } } },
      overdue:   { fill: { patternType: 'solid', fgColor: { rgb: 'FFEBEE' } } },
      notFiled:  { fill: { patternType: 'solid', fgColor: { rgb: 'F5F5F5' } } }
    };

    function rowStyle(status) {
      if (status === 'Up to Date') return S.upToDate;
      if (status === 'Not Filed')  return S.notFiled;
      return S.overdue;
    }

    function applyStyles(ws, numCols, numDataRows, statuses) {
      for (let c = 0; c < numCols; c++) {
        const ref = XLSX.utils.encode_cell({ r: 0, c });
        if (ws[ref]) ws[ref].s = S.header;
      }
      for (let r = 0; r < numDataRows; r++) {
        const style = statuses ? rowStyle(statuses[r]) : S.upToDate;
        for (let c = 0; c < numCols; c++) {
          const ref = XLSX.utils.encode_cell({ r: r + 1, c });
          if (ws[ref]) ws[ref].s = style;
        }
      }
    }

    const HEADERS = ['No.', 'Record Name', 'Department', 'Person in Charge', 'Frequency', 'Latest Date Filed', 'Status'];
    const COLS    = [{ wch: 5 }, { wch: 48 }, { wch: 26 }, { wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 16 }];

    function buildRows(list) {
      return list.map((r, i) => [
        i + 1, r.recordName, r.department, r.personInCharge || '—',
        r.frequency, fmtDate(r.latestDateFiled), r.status
      ]);
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const upCount  = rows.filter(r => r.status === 'Up to Date').length;
    const lateCount = rows.filter(r => r.status !== 'Up to Date' && r.status !== 'Not Filed').length;
    const nfCount  = rows.filter(r => r.status === 'Not Filed').length;
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['Metric', 'Count'],
      ['Total Records',  rows.length],
      ['Up to Date',     upCount],
      ['Overdue',        lateCount],
      ['Not Filed',      nfCount]
    ]);
    applyStyles(ws1, 2, 4, null);
    ws1['!cols'] = [{ wch: 22 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // Sheet 2: All Records
    const allDataRows = buildRows(rows);
    const ws2 = XLSX.utils.aoa_to_sheet([HEADERS, ...allDataRows]);
    applyStyles(ws2, HEADERS.length, allDataRows.length, rows.map(r => r.status));
    ws2['!cols'] = COLS;
    XLSX.utils.book_append_sheet(wb, ws2, 'All Records');

    // Sheet 3: Overdue & Not Filed
    const overdueRows = rows.filter(r => r.status !== 'Up to Date');
    const overdueData = buildRows(overdueRows);
    const ws3 = XLSX.utils.aoa_to_sheet([HEADERS, ...overdueData]);
    applyStyles(ws3, HEADERS.length, overdueData.length, overdueRows.map(r => r.status));
    ws3['!cols'] = COLS;
    XLSX.utils.book_append_sheet(wb, ws3, 'Overdue & Not Filed');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="ISO_Records_${month}_${year}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('✗ [ISO Records] GET /export:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/iso-records/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid record ID' });
    const record = await IsoRecord.findById(req.params.id).lean();
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json(withStatus(record));
  } catch (err) {
    console.error('✗ [ISO Records] GET /:id:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/iso-records/:id — update record fields
// ---------------------------------------------------------------------------
router.put('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid record ID' });

    const { personInCharge, latestDateFiled, frequency, category, recordName, department, comment, commentResolved } = req.body;
    const update = {};
    if (personInCharge  !== undefined) update.personInCharge  = personInCharge || '';
    if (latestDateFiled !== undefined) update.latestDateFiled = latestDateFiled || null;
    if (frequency       !== undefined) update.frequency       = frequency;
    if (category        !== undefined) update.category        = category;
    if (recordName      !== undefined) update.recordName      = recordName;
    if (department      !== undefined) update.department      = department;
    if (comment         !== undefined) {
      update.comment = comment;
      if (!comment) update.commentResolved = false; // clear resolved when note is cleared
    }
    if (commentResolved !== undefined) update.commentResolved = commentResolved;

    const record = await IsoRecord.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json(withStatus(record));
  } catch (err) {
    console.error('✗ [ISO Records] PUT /:id:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/iso-records/:id/filedtoday — stamp today's date
// ---------------------------------------------------------------------------
router.put('/:id/filedtoday', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid record ID' });
    const record = await IsoRecord.findByIdAndUpdate(
      req.params.id,
      { latestDateFiled: new Date() },
      { new: true }
    );
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json(withStatus(record));
  } catch (err) {
    console.error('✗ [ISO Records] PUT /:id/filedtoday:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/iso-records — create new record
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { recordName, category, department, frequency, personInCharge } = req.body;
    if (!recordName || !category) return res.status(400).json({ message: 'recordName and category are required' });

    const record = new IsoRecord({
      recordName,
      category,
      department:      department      || '',
      frequency:       frequency       || 'Daily',
      personInCharge:  personInCharge  || '',
      latestDateFiled: null
    });
    await record.save();
    res.status(201).json(withStatus(record));
  } catch (err) {
    console.error('✗ [ISO Records] POST /:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/iso-records/:id
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) return res.status(400).json({ message: 'Invalid record ID' });
    const record = await IsoRecord.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    console.error('✗ [ISO Records] DELETE /:id:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
