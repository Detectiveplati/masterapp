# Brother QL-820NWB Setup And Command Notes

This file extracts and consolidates the Brother setup and command information needed to configure the `label-print` module without losing the working assumptions.

Source PDFs used:
- `C:\Users\Zack\Downloads\P touch template.pdf`
- `C:\Users\Zack\Downloads\QL820NWB SDK (ESC P ).pdf`

This module currently uses:
- **P-touch Template**
- **62 mm continuous media**
- **network raw TCP**
- backend sends print jobs directly to the printer IP on **port 9100**
- backend selects a stored printer template and tells the printer to print it as-is

## 1. Current module assumptions

The current implementation in `masterapp` assumes:
- printer model is `Brother QL-820NWB`
- printing is done by Express, not by browser Bluetooth
- templates are already transferred into the printer
- the printer is reachable on the same network by IP/host
- the printer receives `P-touch Template` commands over raw TCP
- each print job only selects the printer template number, sets copies, applies cut mode, and triggers print
- the printer template itself owns all visual content and rules

Current default template keys:
- `template-1`
- `template-2`
- `template-3`
- `template-4`
- `template-5`
- `template-6`
- `template-7`
- `template-8`
- `template-9`
- `template-10`

## 2. Physical print dimensions

From the Brother ESC/P reference for QL-810W/820NWB:

For continuous 62 mm paper:
- label width: `62 mm`
- top margin: `1.5 mm`
- bottom margin: `3 mm`
- printable width: `58.95 mm`

Practical rule for this module:
- design to **58 mm printable width**
- do not design to the full 62 mm media width

The module uses these fixed label sizes:
- `58 x 29 mm`
- `58 x 62 mm`
- `58 x 100 mm`

Brother also states:
- maximum print length for template path: `1 m`
- resolution: `300 x 300 dpi`

## 3. Recommended Brother setup flow

From the P-touch Template manual:

1. Install the printer driver over USB first.
2. Use **P-touch Template Settings Tool** to configure printer-side template behavior.
3. Design the template in **P-touch Editor**.
4. Transfer the template into the printer using **P-touch Transfer Manager**.
5. Send host data/commands to the printer.

The current app uses the simpler P-touch Template concept:
- P-touch Template stores the template on the printer
- host selects which stored template to print
- printer prints after receiving the print trigger
- no runtime label text is injected by the app

## 4. P-touch Template Settings Tool settings to configure

Important settings described in the Brother manual:

- **Command mode setting**
  - use `P-touch Template mode`

- **Template number setting**
  - set the default template number for the transferred template
  - only transferred templates can be selected

- **Delimiter setting**
  - delimiter tells the printer when to move to the next object
  - can be 1 to 20 characters
  - default is tab (`09h`)

- **Print start trigger setting**
  - `Command Character`
  - `Data Insertion into All the Objects`
  - `Received Data Size`

- **Print start command text string**
  - default is `^FF`

- **Print start data amount**
  - range `1 to 999`

- **Character code set**
  - includes `Windows1252`, `Windows1250`, `Brother standard`

- **Prefix character**
  - default is `^`

- **Line feed command**
  - default is `^CR`

- **Number of copies**
  - range `1 to 99` for static printer setting

- **Cut at End**
  - enable if you want cut after the job finishes

- **Cut number**
  - `1 to 99`

- **Auto cut**
  - enable if you want cutting after N labels

## 5. Template design rules for stored-template mode

In the current app mode, each stored printer template is self-contained.

Practical rule:
- put the final text, barcode, QR, layout, and formatting directly into the P-touch template
- do not rely on app-side value insertion during normal printing

Department traceability rule for the current Sauce Department set:
- add a static footer text object directly inside each Sauce Department template
- footer text must be exactly `Sauce Department / 酱料部`
- place it in bottom-right empty space
- keep it smaller than the main item name/date text so it behaves as a traceability footer, not primary content
- do not change template numbers when adding this footer

Brother limits still apply:
- a template can contain up to `50 objects`
- QL-820NWB can store up to `255 templates`
- total transfer size limit is `6 MB`

## 6. Commands used by the current backend

The current backend logic is based on these Brother commands.

### Enter P-touch Template mode

`ESC i a n`

- hex: `1B 69 61 n`
- `n=03h` enters P-touch Template mode

Current code uses:
- `1B 69 61 03`

### Initialize dynamic settings

`^II`

- resets dynamic settings back to printer defaults

### Select template number

`^TS0xy`

- template range in this command is `1 to 99`
- example for template 3:
  - `^TS003`

### Set number of copies

`^CNxyz`

- range `1 to 999`
- example for 3 copies:
  - `^CN003`

### Set cut options

`^CO n1 n2 n3 n4`

Meaning:
- `n1`: auto cut on/off
- `n2n3`: cut every N labels
- `n4`: cut at end on/off

Examples from Brother:
- cut every 2 labels:
  - `^CO1020`

Current module behavior:
- `auto-cut` -> `^CO1011`
- `no-cut` -> `^CO0010`

This is the current implementation assumption and should be validated on your actual printer.

### Start printing

`^FF`

From Brother:
- starts printing
- normally works when print start trigger is configured appropriately

Brother example:
- `^TS003^FF`

## 7. Current backend print sequence

The module currently builds a job in this sequence:

1. Enter P-touch Template mode
2. `^II`
3. `^TS...` select template
4. `^CN...` set copies
5. `^CO...` set cut behavior
6. `^FF`

This is implemented in:
- `routes/labelPrint.js`

## 8. Network requirements

For the current implementation to work:

- printer must be on the same reachable network as the Express server
- printer IP or hostname must be saved in the UI/backend
- backend connects to:
  - `host = printer IP`
  - `port = 9100`

Current app UI exposes:
- printer host/IP
- printer port
- test network
- test print

If `Test Network` fails:
- wrong IP/hostname
- wrong port
- printer not on LAN/Wi-Fi
- firewall/network isolation
- server not on the same reachable network

## 9. What to configure in the printer and app

### In Brother tools

Configure and transfer:
- correct media size
- correct template number
- print mode using P-touch Template

Suggested print trigger:
- keep default `^FF` command trigger unless you have a strong reason to change it

### In the app

Configure:
- printer IP/host
- printer port, usually `9100`
- template number mapping

## 10. Current limitations

These are important:

- current backend assumes P-touch Template commands over raw TCP will be accepted by your printer network path
- current implementation does not yet request or parse printer status via `^SR`
- current implementation assumes templates are already provisioned manually over USB
- normal printing does not use app-side object insertion
- `objectNameMap`, `^ON`, and `^DI` are legacy concepts for field-driven printing, not the current stored-template mode

## 11. Safe configuration checklist

Before changing anything:

1. Record printer IP address
2. Record template number transferred into printer
3. Record media type loaded into printer
4. Record cut preferences in P-touch Template Settings Tool
5. Keep exported screenshots or notes from P-touch Editor for each template

Recommended per-template record:

```md
Template key: template-2
Printer template number: 2
Media: 62 mm continuous
Stored content: fully defined inside P-touch Editor
Cut default: auto-cut
Department: Sauce Department
Department signature: Sauce Department / 酱料部
Department signature placement: bottom-right footer
```

## 12. Files in this repo that depend on these settings

Relevant implementation files:
- `label-print/index.html`
- `label-print/app.js`
- `routes/labelPrint.js`
- `models/LabelPrintPrinter.js`
- `models/LabelPrintTemplate.js`
- `models/LabelPrintItem.js`

## 13. Future improvements

Recommended next improvements:
- add printer status request using `^SR`
- add saved setup profiles per printer
- add explicit setup export/import JSON
- add a template validation endpoint that confirms printer template numbering
