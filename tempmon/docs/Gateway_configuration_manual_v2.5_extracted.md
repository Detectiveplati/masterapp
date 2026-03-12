# RD06/LORA Gateway Configuration Manual V2.4 — Extracted Text

> Source: `Gateway configuration manual_v2.5.pdf`  
> Extracted: 2026-03-11

---

## 1. USB RS232 Cable

Connect the LoRa Gateway to computer via RS232 cable. The smaller USB port connects with the LoRa Gateway USB port, the bigger USB port connects with the computer.

## 2. Driver Installation

1. PL-2303 driver is for RS232 configuration cable. Please install under Windows 10 or newer.
2. Connect the configuration cable to the computer.
3. Go to Desktop → My Computer → right-click → Manager → System Tools → Device Manager → Ports — you will find the port the configuration cable is using.

## 3. Configure Software

4. Connect LoRa Gateway with computer via the configuration cable.
5. Run the configuration software.

### (3) Connect
After the Gateway is powered on, click **Connect**. The interface will appear after connection is successful.

### (4) Set Gateway — 2G/4G Gateway version
The configuration software will automatically jump to the shortcut setting interface where you can set the APN of the SIM card. After setting the APN, click "Save".

### (5) Set Gateway — WIFI version
The configuration software will automatically jump to the shortcut setting interface. Default is Ethernet. If WIFI transmission is required, select WIFI and set the WIFI name and password, then click Save.

---

## Configure Server and Network

### 2G/4G Gateway version

- **(1) Device Information** — Device ID: transmission is TCP/IP
- **(2) Data Transfer Protocol** — TCP/IP or HTTP
- **(3) TCP/IP Transfer Protocol** — TCP or UDP
- **(4) Set Server IP and Port** — IP: xxx.xxx.xxx.xxx or domain; Port: server port
- **(5) Set APN** — APN, Username, Password (max 27 chars each)
- **(6) Data Interval** — Sending data interval: [10, 999] seconds

### WIFI Gateway version

- **(7) Data Transfer Protocol** — TCP/IP or HTTP
- **(8) TCP/IP Transfer Protocol** — TCP or UDP
- **(9) Set Server IP and Port** — IP or domain; Port
- **(10) Transfer Mode** — LAN (network cable) or WIFI
- **(11) Set WIFI** — WIFI Name (max 27 chars), WIFI Password (max 27 chars)

---

## TAG Settings ⭐ IMPORTANT

- **Add**: Add a tag to the gateway's receive list
- **Type**: TAG07 / TAG07B / TAG08 / TAG08B / TAG09
- **Channel**: Select channel [1, 100]
- **TAG ID**: Sensor ID — 8 characters
- **Delete**: Delete a/all tags from the list

### ⭐ Confirmed channel assignments (supplier-confirmed, cmdtype:147 SETASSIGNTAG)

| Tag Type | Channel |
|---|---|
| TAG09 | **3** |
| TAG08B | **2** |

When adding TAG09 sensors in the Tag Settings table, set Channel = **3**.  
When adding TAG08B sensors, set Channel = **2**.

> ⚠️ **NOTE**: If a gateway has **added a channel to a tag**, the gateway will **only receive the tag with the added channel**. Multiple channels can be added.

This means: if no TAG IDs are added, the gateway accepts all. But if ANY tag has been added to the filter list, the gateway will **only** accept those specific tags/channels.

---

## RS485 Settings (WIFI Gateway version has no RS485 settings)

**Serial port settings:**
- Baud rate: 1200 / 9600 / 19200 / 38400 / 57600 / 115200 (default: 9600)
- Data bits: 0–8 bit (default), 1–9 bit
- Stop bit: 0=0.5bit, 1=1bit (default), 2=1.5bit, 3=2bit
- Parity: 0=none (default), 1=Even, 2=Odd

**Work modes:**
- **Active transport**: RS485 sends data proactively
- **Modbus**: Sends data when RS485 receives a request

**Tag offline time**: Gateway considers sensor offline if not received within this period [0–86400 seconds] — only used in RS485 Modbus mode.

**Reader time**: RS485 sends sensor data once per period regardless of how many times LoRa received it [0–3600 seconds].

---

## 4. Other Settings

- **Clear Flash**: Clears history stored in flash memory.
- **Factory Reset**: Sets all parameters to factory default values.

---

## Debug Mode

1. Click to enter debug mode — configure Gateway parameters and view logs via commands.
2. In debug mode, Gateway parameters are configured directly by commands. After writing commands, click "Send".
3. After 1 minute, Gateway exits configuration mode and enters log mode — machine data can be viewed, logs stored in log file.
4. Click to exit debug mode and return to the home page.

---

## DFU (Firmware Upgrade)

1. Select the `.bin` file and click "Start".
2. Firmware upgrade proceeds.
3. Device firmware upgrade completes successfully.
4. If device cannot be connected/upgraded due to abnormal operation, contact manufacturer.

---

## Configure (Save/Load Config BIN Files)

Used when configuring a large number of gateways by saving and loading configuration BIN files.

> Note: Only firmware V3.23 and above support saving and reading configuration files.

1. After configuration is completed, click "Start".
2. Select saved configuration BIN file and click "Write" — all configuration parameters will be written.
