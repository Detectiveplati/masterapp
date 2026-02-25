// ============================================================
// DATA LAYER - Handles all persistence (CSV, Database, API)
// This abstraction allows easy migration from CSV to MongoDB
// ============================================================

let fileHandle = null;
let currentCSVFilename = 'deepfry.csv';  // Default filename
let FILE_HANDLE_KEY = 'deepfry_csv_handle';  // Will be updated based on filename

// Initialize the data layer
async function initializeData(csvFilename = 'deepfry.csv') {
  currentCSVFilename = csvFilename;
  FILE_HANDLE_KEY = `${csvFilename.replace('.csv', '')}_handle`;
  
  // Request persistent storage permission
  if (navigator.storage && navigator.storage.persist) {
    const isPersistent = await navigator.storage.persist();
    console.log('Persistent storage granted:', isPersistent);
  }
  await getOrCreateCSVFile();
}

// Get or create deepfry.csv file in departments folder
async function getOrCreateCSVFile() {
  if (fileHandle) return fileHandle;

  // Try to restore from previous session
  try {
    const storedHandle = await restoreFileHandle();
    if (storedHandle) {
      fileHandle = storedHandle;
      return fileHandle;
    }
  } catch (err) {
    console.log("Could not restore file handle, will prompt for " + currentCSVFilename);
  }

  // Prompt user to select CSV file from departments folder (only once)
  try {
    [fileHandle] = await window.showOpenFilePicker({
      suggestedName: currentCSVFilename,
      types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
      _preferredStartingDirectory: 'departments'
    });
  } catch (err) {
    throw err;
  }

  // Save handle for next session (auto-loads after this)
  try {
    await saveFileHandle(fileHandle);
  } catch (err) {
    console.log("Could not save file handle for next session");
  }

  return fileHandle;
}

// Save file handle to IndexedDB for persistence
async function saveFileHandle(handle) {
  const db = await openIndexedDB();
  const tx = db.transaction('fileHandles', 'readwrite');
  tx.objectStore('fileHandles').put({ key: FILE_HANDLE_KEY, handle });
}

// Restore file handle from IndexedDB
async function restoreFileHandle() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('fileHandles', 'readonly');
      const req = tx.objectStore('fileHandles').get(FILE_HANDLE_KEY);
      req.onsuccess = () => {
        const handle = req.result?.handle;
        if (handle) {
          // Verify handle is still valid
          handle.getFile().then(() => {
            resolve(handle);
          }).catch(() => {
            // Handle is stale
            resolve(null);
          });
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    console.log("Could not restore file handle:", err);
    return null;
  }
}

// Open or create IndexedDB
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('KitchenLogDB', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('fileHandles')) {
        db.createObjectStore('fileHandles', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Save cook data via API
async function saveCookData(cookData) {
  let res;
  try {
    res = await fetch('/templog/api/cooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cookData)
    });
  } catch (networkErr) {
    throw new Error(`网络错误 Network error: ${networkErr.message}`);
  }

  if (!res.ok) {
    let detail = '';
    try { const j = await res.json(); detail = j.error || ''; } catch (_) {}
    throw new Error(`保存失败 Save failed (HTTP ${res.status})${detail ? ': ' + detail : ''}`);
  }

  return true;
}

async function loadRecentCookData() {
  const res = await fetch('/templog/api/cooks?limit=8');
  if (!res.ok) return [];
  return res.json();
}

async function exportFullCSVData() {
  const res = await fetch('/templog/api/cooks/export');
  if (!res.ok) {
    throw new Error('Export failed');
  }
  return await res.blob();
}
