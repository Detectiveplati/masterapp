# TZONE Sensor Tag User Guide — Extracted Reference
> Sources: `RD07_WiFi、TAG08(B-L) Basic User Guide_V1.2.pdf`, `RD07_WiFi、TAG09 Basic User Guide_V1.2.pdf`, `LoRa Gateway_WIFI Data Protocol of TCP Communication_v2.0.pdf`  
> Extracted: 2026-03-11

---

## Supported Tag Models

| Model | Type | Sensors | Notes |
|---|---|---|---|
| TAG07 | LoRa wireless | Temp + Humidity | 1% humidity resolution |
| TAG07B | LoRa wireless | Temp + Humidity | Variant of TAG07 |
| TAG08 | LoRa wireless | Temp + Humidity | 1% humidity resolution |
| TAG08B | LoRa wireless | Temp + Humidity | 0.1% humidity resolution (2-byte) |
| TAG08L | LoRa wireless | Temp + Humidity | Long range variant |
| TAG09 | LoRa wireless | Temp only | Temperature only, no humidity |

---

## 1. Initial Setup (Tag + Gateway)

### 1.1 Using the TZONE Cloud Platform (manufacturer's platform)
*(For reference only — your setup uses a custom server instead)*

1. Register at `http://cloud.tzonedigital.com/`
2. Login → Device Management → Add
3. Enter: Device Name, Device ID (8-char ID from tag label), Group, Remarks, optional map location
4. Click Save — "Add succeeded" confirmation
5. Power on the gateway — tag data is automatically sent

### 1.2 Using Your Custom HTTP Server (this setup)
1. Register the tag in the gateway's TAG Settings whitelist (TZConfig.exe) **or** leave the whitelist empty to accept all
2. Register the sensor ID in the app at `/tempmon/gateway.html` → Register a Sensor Tag
3. Power on / wake the tag — it will begin transmitting automatically

---

## 2. Starting the RD07_WiFi Gateway + Tags

### 2.1 Gateway startup
1. Install RF and GSM antenna on the gateway
2. Connect power supply
3. Turn on the device: **left switch = ON, right switch = OFF**
4. Machine is working when **3 LED lights flash simultaneously**
5. Default: data sent to TZONE cloud platform
   - For your custom server: configure via TZConfig.exe (HTTP mode, set your server URL)

### 2.2 Network connection
- Default transmission mode: **LAN (Ethernet cable)**
- To switch to WIFI: use TZConfig.exe configuration software → set WIFI name + password → Save

---

## 3. Gateway LED Indicator Meanings ⭐

| LED Colour | Behaviour | Meaning |
|---|---|---|
| **Blue** | On for 0.1 second | Data received from a tag |
| **Green** | Blinks once for 2 seconds | Reading sent to server successfully |
| **Red** | Flashing every 2 seconds | No power supply connected (running on battery) |
| **Red** | Always on | Power supply is connected |

> Use the Blue LED to confirm a tag is transmitting. If blue never flashes when a tag is nearby, the tag is either sleeping or out of range.

---

## 4. Tag Startup and Operation ⭐

### Default behaviour (out of the box)
- Tags are **on by default** and will start sending data automatically when powered
- Default reporting interval: **every 15 minutes**
- Data is sent directly to the LoRa gateway within range

### Button usage ⭐
| Action | Result |
|---|---|
| **Press button for ~1 second** | Tag immediately sends one reading to the gateway (use this to test/verify) |
| *(No reset described — see Gateway TAG filter if sensor not appearing)* | |

> **Key note for sensor `82242258` or any non-appearing sensor:**  
> Press the button for ~1 second to force an immediate transmission. Watch the gateway's Blue LED — if it flashes, the gateway received the signal. If not, either the TAG filter is blocking it or the battery is low.

### Antenna
- Connect the antenna before use (screws onto the tag body)
- Range: typically up to ~50 m indoors from the gateway

---

## 5. Tag Data Format (from TCP/HTTP Protocol v2.0)

### 5.1 Tag type codes (used internally by gateway)

| Code | Models |
|---|---|
| `01` | TAG07, TAG07B, TAG08, TAG08L, TAG09 |
| `04` | TAG08B |
| `08` | TAG11 (not temperature sensor) |

### 5.2 Single tag data record structure

For **TAG07 / TAG07B / TAG08 / TAG08B / TAG08L / TAG09** (Type 01 or 04):

| Field | Bytes | Description |
|---|---|---|
| **ID** | 4 | 8-digit sensor ID, e.g. `72180476` |
| **Status** | 1 | Bit flags — see below |
| **Battery Voltage** | 2 | Unit: 1 mV, MSB first. e.g. `0E 38` = 3640 mV = **3.64V** |
| **Temperature** | 2 | MSB first, unit 0.1°C — see encoding below |
| **Humidity** | 1 (TAG08B: 2) | Type 01: 1 byte, unit 1%. Type 04 (TAG08B): 2 bytes, unit 0.1% |
| **RSSI** | 1 | Signal strength in -dBm. e.g. `07` = -7 dBm (strong), `7A` = -122 dBm (weak) |
| **RTC Time** | 6 | Year, Month, Day, Hour, Min, Sec (each 1 byte, BCD/hex) |

### 5.3 Status byte — bit flags

| Bit | Meaning when `1` | Meaning when `0` |
|---|---|---|
| Bit 7 | Undervoltage (low battery) | Normal voltage |
| Bit 6 | Temperature alarm | Normal temperature |
| Bit 5 | Tag button was pressed | Button not pressed |
| Bit 4 | ACK from gateway required (set by cmd 009) | ACK disabled |
| Bit 3 | Tag RTC time enabled | Tag RTC time disabled |
| Bit 2–0 | Reserved | — |

### 5.4 Temperature encoding

| Raw bytes | Interpretation |
|---|---|
| `00 D6` | +21.4°C (Bit14=0 → positive) |
| `40 D6` | -21.4°C (Bit14=1 → negative) |
| `80 00` | Tag working **abnormally** (Bit15=1) |

- Bit 15 = abnormal flag (1 = fault, 0 = normal)
- Bit 14 = sign (1 = negative, 0 = positive)
- Bits 13–0 = temperature value × 10 (unit 0.1°C)

### 5.5 Humidity encoding

| Value | Meaning |
|---|---|
| `FF` (first byte) | Tag has **no humidity sensor** (e.g. TAG09) |
| `30` | 48% humidity (TYPE 01: 1 byte, value = %) |
| `02 CF` | 71.9% humidity (TYPE 04/TAG08B: 2 bytes, value ÷ 10) |

### 5.6 Battery voltage reference

| Hex | Voltage | Status |
|---|---|---|
| `0E 38` | 3.64V | Good |
| `0D DE` | 3.55V | Acceptable |
| `0E 24` | 3.62V | Good |
| Below ~3.3V | — | Consider replacing |

---

## 6. Transmission Interval (Default: 15 minutes)

Tags automatically report every **15 minutes** by default.

You can change the interval via a **900 downlink command** from your server to the gateway:
```
*000000,900,{TAG_ID},002,{minutes}#
```
Example — set tag `82242275` to report every 5 minutes:
```
*000000,900,82242275,002,5#
```

To read the current interval:
```
*000000,900,82242275,253,002#
```

> The gateway relays these commands to the tag over LoRa. The tag must be awake (or will receive it on next check-in) to apply the setting.

---

## 7. Troubleshooting

### Tag not detected by gateway

| Symptom | Likely Cause | Fix |
|---|---|---|
| Blue LED never flashes | Tag not transmitting | Press button 1 second to force immediate send |
| Blue LED flashes but no reading in app | Tag ID not in whitelist OR not registered in app | Add tag ID to TZConfig.exe TAG Settings, then register in app |
| Tag registered but reads 0°C / no data | Low battery | Check `bat` field in gateway events, replace battery if <3.3V |
| Tag appeared before, now missing | Gateway TAG filter was updated | Re-check TZConfig TAG Settings tab |

### Battery low indicators
- Status byte Bit 7 = `1` in the raw data record
- `bat` field in the JSON payload will be below ~3.3V

---

## 8. Data Record Example (Real payload from your gateway)

```json
{
  "msgtype": 3,
  "hw": "0406",
  "fw": "03.22.00.00",
  "imei": "652484907900339",
  "data": {
    "tag07": [
      {
        "id": "82242275",
        "temp": 4.6,
        "humi": 100,
        "rssi": -122,
        "bat": 3.61,
        "rtc": "260311022033",
        "sta": 0
      }
    ]
  },
  "rtc": "260311022322",
  "sn": 100
}
```

**RTC format**: `YYMMDDHHmmss` compact 12-digit string  
→ `"260311022033"` = 2026-03-11 02:20:33 UTC

**`sta` field** (corresponds to Status byte):
- `0` = normal
- Check bit flags above for non-zero values

---

## 9. Files in this Docs Folder

| File | Contents |
|---|---|
| `Gateway configuration manual_v2.5.pdf` | Original gateway config manual (PDF) |
| `Gateway_configuration_manual_v2.5_extracted.md` | Extracted text of gateway manual |
| `RD07_WiFi、TAG08(B-L) Basic User Guide_V1.2.pdf` | Original TAG08/08B/08L user guide (PDF) |
| `RD07_WiFi、TAG09 Basic User Guide_V1.2.pdf` | Original TAG09 user guide (PDF) |
| `Gateway Data Protocol of HTTP Communication -v2.0.pdf` | HTTP payload protocol spec (PDF) |
| `LoRa Gateway_WIFI Data Protocol of TCP Communication_v2.0.pdf` | TCP protocol + detailed tag data format (PDF) |
| `Sensor_Tag_User_Guide_extracted.md` | This file |
