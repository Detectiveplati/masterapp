# Raster Label Print — Task List

Replace P-touch Template mode with direct raster printing over the existing Bluetooth Web Serial connection.

---

## Context

**What exists now:**
- `buildPtouchTemplateJob()` in `label-print/app.js` (line 1691) sends 6 P-touch template commands
- `sendTemplateToBluetooth(payload)` (line 1680) is the transport wrapper — keep as-is
- Call sites are at lines 790 and 863 — do not touch

**What changes:**
- Replace `buildPtouchTemplateJob()` with a Canvas-rendered raster image
- Use Brother QL **raster protocol** instead of template mode
- No new npm packages, no backend changes, no route URL changes

**What does NOT change:**
- Web Serial connection, pairing, reconnect banner, diagnostics
- All API routes and DB logging
- `createClientPrintJob()` logging

---

## Phase 0 — Halal Logo Asset (Optional)
- [ ] Add `GET /api/label-print/assets/halal-logo` route in `routes/labelPrint.js`
  - Read `label-print/assets/halal-logo.png` from disk, return `{ data: "data:image/png;base64,..." }`
- [ ] Copy Halal logo to `label-print/assets/halal-logo.png`
- [ ] In `app.js`, fetch and cache at load time: `state.halalLogoBase64 = await fetch(...)`

---

## Phase 1 — Model Update
- [ ] `models/LabelPrintItem.js`: add `shelfLifeDays: { type: Number, default: 3, min: 0 }`
- [ ] `routes/labelPrint.js` PUT /items/:id: allow `shelfLifeDays` to be updated

---

## Phase 2 — Canvas Label Renderer
Add `async function renderLabelToRasterLines(item, template)` in `label-print/app.js`

**Canvas:**
- Width: `696` px (62mm @ 300dpi)
- Height: `Math.round(template.heightMm / 25.4 * 300)` px
- `new OffscreenCanvas(696, height)`, white background

**Layout:**
| Row | Content | Style |
|-----|---------|-------|
| 1 | Entity name | Bold ~28px centered |
| 2 | Address | ~16px centered |
| 3 | Divider line | 1px full width |
| 4 | Department name | ~18px centered |
| 5 | English product name | Bold ~52px, **shrink-to-fit** |
| 6 | Chinese product name | ~32px CJK centered |
| 7 | Production Date 开始日期: + today | ~18px |
| 8 | Used by Date 过期日期: + (today + shelfLifeDays) | ~18px |

**Font:** `'Noto Sans SC', 'Arial Unicode MS', sans-serif`

**Shrink-to-fit (row 5):**
```js
let fontSize = 52;
ctx.font = `bold ${fontSize}px 'Noto Sans SC', sans-serif`;
while (ctx.measureText(nameEn).width > 680 && fontSize > 14) {
  fontSize -= 2;
  ctx.font = `bold ${fontSize}px 'Noto Sans SC', sans-serif`;
}
```

**To monochrome raster lines:**
```js
const imageData = ctx.getImageData(0, 0, 696, height);
const lines = [];
for (let y = 0; y < height; y++) {
  const lineBytes = new Uint8Array(87); // 696/8
  for (let x = 0; x < 696; x++) {
    const i = (y * 696 + x) * 4;
    const bright = imageData.data[i]*0.299 + imageData.data[i+1]*0.587 + imageData.data[i+2]*0.114;
    if (bright < 128) lineBytes[Math.floor(x/8)] |= (0x80 >> (x%8));
  }
  lines.push(lineBytes);
}
return lines;
```

---

## Phase 3 — Raster Protocol Builder
Replace `buildPtouchTemplateJob(payload)` with `buildRasterJob(rasterLines, { cutMode })` in `app.js`

```
1. Invalidate:       200 × 0x00
2. Initialize:       [0x1B, 0x40]
3. Raster mode:      [0x1B, 0x69, 0x61, 0x01]
4. Print info:       [0x1B, 0x69, 0x7A, 0x8A, 0x0A, 0x3E, 0x00, lines_lo, lines_hi, 0x00, 0x00, 0x00, 0x01]
                     0x3E = 62mm, lines_lo/hi = total lines as little-endian uint16
5. Cut mode:         auto-cut → [0x1B, 0x69, 0x4D, 0x40]
                     no-cut   → [0x1B, 0x69, 0x4D, 0x00]
6. Expanded mode:    [0x1B, 0x69, 0x4B, 0x08]
7. Margin:           [0x1B, 0x69, 0x64, 0x00, 0x00]
8. Each raster line: [0x47, 0x00, 0x57, ...87 bytes...]
9. Print + feed:     [0x1A]
```

---

## Phase 4 — Wire Up
- [ ] `buildPrintPayload()`: add `item` to returned object so `sendTemplateToBluetooth` has it
- [ ] Replace `sendTemplateToBluetooth(payload)`:

```js
async function sendTemplateToBluetooth(payload) {
  const port = await verifyConnectionBeforePrint();
  const item = payload.item;
  const template = findTemplate(payload.templateKey);
  const rasterLines = await renderLabelToRasterLines(item, template);
  const bytes = buildRasterJob(rasterLines, { cutMode: payload.cutMode });
  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
    for (let i = 1; i < payload.copies; i++) {
      await new Promise(r => setTimeout(r, 100));
      await writer.write(bytes);
    }
  } finally {
    writer.releaseLock();
  }
}
```

---

## Phase 5 — Verification Checklist
- [ ] Single label prints with correct layout
- [ ] Long English name shrinks to fit without clipping
- [ ] Qty=3 prints 3 labels with cut between each
- [ ] no-cut mode skips the cutter
- [ ] Print job logged to DB with `status: 'success'`
- [ ] Printer disconnect → error toast + reconnect banner appear
- [ ] Test 62mm and 29mm template heights

---

## Key Variables (existing code)
| Variable | Source |
|----------|--------|
| `item.nameEnglish` | LabelPrintItem |
| `item.nameChinese` | LabelPrintItem |
| `item.shelfLifeDays` | **NEW** (Phase 1) |
| `template.departmentSignature` | LabelPrintTemplate |
| `template.departmentName` | LabelPrintTemplate |
| `template.heightMm` | LabelPrintTemplate |
| `payload.copies` | buildPrintPayload |
| `payload.cutMode` | buildPrintPayload |

## Files to Change
| File | What |
|------|------|
| `label-print/app.js` | renderLabelToRasterLines, buildRasterJob, sendTemplateToBluetooth, buildPrintPayload |
| `models/LabelPrintItem.js` | Add shelfLifeDays |
| `routes/labelPrint.js` | Allow shelfLifeDays in PUT /items/:id |
| `label-print/assets/` | Halal logo PNG (Phase 0, optional) |

## Caveats
- **No `BROTHER_PRINTER_BT_MAC` needed** — Web Serial uses browser port permissions, not MAC
- **CJK font risk**: test Chinese rendering on the actual Android tablet early
- Existing pre-stored printer templates become unused — they stay in DB but are never called
- No new npm dependencies required
