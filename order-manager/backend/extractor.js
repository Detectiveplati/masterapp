const fs = require("fs");
const path = require("path");
const process = require("process");

const dotenv = require("dotenv");
const { chromium } = require("@playwright/test");
const { enrichCombinedRows } = require("./reportRowUtils");

dotenv.config();

let sharedBrowserPromise = null;
const REQUIRED_EXTRACTOR_ENV_VARS = [
  "ORDER_MANAGER_BASE_URL",
  "ORDER_MANAGER_LOGIN_URL",
  "ORDER_MANAGER_REPORT_URL",
  "ORDER_MANAGER_USERNAME",
  "ORDER_MANAGER_PASSWORD"
];

function getConfig(overrides = {}) {
  return {
    baseUrl: requiredEnv("ORDER_MANAGER_BASE_URL"),
    loginUrl: requiredEnv("ORDER_MANAGER_LOGIN_URL"),
    reportUrl: requiredEnv("ORDER_MANAGER_REPORT_URL"),
    username: requiredEnv("ORDER_MANAGER_USERNAME"),
    password: requiredEnv("ORDER_MANAGER_PASSWORD"),
    reportType: process.env.ORDER_MANAGER_REPORT_TYPE || "combined",
    reportFormat: process.env.ORDER_MANAGER_REPORT_FORMAT || "html",
    reportDate: process.env.ORDER_MANAGER_REPORT_DATE || "",
    outputDir: process.env.ORDER_MANAGER_OUTPUT_DIR || "output",
    timeoutMs: parseNumber(process.env.ORDER_MANAGER_TIMEOUT_MS, 60000),
    headless: parseBoolean(process.env.ORDER_MANAGER_HEADLESS, true),
    saveFiles: parseBoolean(process.env.ORDER_MANAGER_SAVE_FILES, false),
    ...overrides
  };
}

function getMissingExtractorEnvVars() {
  return REQUIRED_EXTRACTOR_ENV_VARS.filter((name) => !String(process.env[name] || "").trim());
}

function isExtractorConfigured() {
  return getMissingExtractorEnvVars().length === 0;
}

async function runExtraction(overrides = {}) {
  const config = getConfig(overrides);
  let browser = await getSharedBrowser(config);
  let context;
  try {
    context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1600, height: 1200 }
    });
  } catch (error) {
    sharedBrowserPromise = null;
    browser = await getSharedBrowser(config);
    context = await browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1600, height: 1200 }
    });
  }

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(config.timeoutMs);

    await login(page, config);
    const extraction = config.reportType === "combined"
      ? await extractCombinedReport(context, page, config)
      : await extractSingleReport(page, config, config.reportType);
    if (config.saveFiles) {
      const written = await writeOutputs(extraction, config);
      extraction.outputFiles = written;
    }

    return extraction;
  } finally {
    await context.close();
  }
}

async function login(page, config) {
  await page.goto(config.loginUrl, { waitUntil: "domcontentloaded" });

  await page.locator("#user_login").fill(config.username);
  await page.locator("#user_pass").fill(config.password);
  await page.locator("#wp-submit").click();

  try {
    await page.waitForURL(
      (url) => !url.toString().includes("wp-login.php"),
      { waitUntil: "domcontentloaded", timeout: config.timeoutMs }
    );
  } catch (error) {
    const loginError = await readLoginError(page);
    if (loginError) {
      throw new Error(`Login appears to have failed. ${loginError}`);
    }
    throw new Error(
      `Login did not leave the WordPress login page within ${config.timeoutMs}ms. Current URL: ${page.url()}`
    );
  }

  if (page.url().includes("wp-login.php")) {
    const loginError = await readLoginError(page);
    throw new Error(loginError
      ? `Login appears to have failed. ${loginError}`
      : "Login appears to have failed. Still on the WordPress login page.");
  }
}

async function openReport(page, config) {
  await page.goto(config.reportUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#food-report-export").waitFor({ state: "visible" });
  await submitReportForm(page, config);

  const table = page.locator("table").first();
  try {
    await table.waitFor({ state: "visible" });
  } catch (error) {
    const debugDir = path.resolve(process.cwd(), config.outputDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const htmlPath = path.join(debugDir, `debug-${stamp}.html`);
    const screenshotPath = path.join(debugDir, `debug-${stamp}.png`);

    await fs.promises.mkdir(debugDir, { recursive: true });
    await Promise.all([
      fs.promises.writeFile(htmlPath, await page.content(), "utf8"),
      page.screenshot({ path: screenshotPath, fullPage: true })
    ]);

    throw new Error(
      `Report table was not visible. URL: ${page.url()} | Title: ${await page.title()} | HTML: ${htmlPath} | Screenshot: ${screenshotPath}`
    );
  }
}

async function submitReportForm(page, config) {
  await page.locator(`#food-report-format-${config.reportFormat}`).check();
  await page.locator("#food-report-type").selectOption(config.reportType);

  if (config.reportDate) {
    await page.locator("#food-report-export-datepicker").fill(config.reportDate);
  }

  await page.locator("#food-report-export").click();
}

async function extractSingleReport(page, config, reportType) {
  await openReport(page, {
    ...config,
    reportType
  });

  if (reportType === "chef") {
    return extractChefReport(page);
  }

  if (reportType === "dish") {
    return extractDishReport(page);
  }

  throw new Error(`Unsupported report type: ${reportType}`);
}

async function extractCombinedReport(context, page, config) {
  const secondaryPage = await context.newPage();
  secondaryPage.setDefaultTimeout(config.timeoutMs);

  try {
    const [chefReport, dishReport] = await Promise.all([
      extractSingleReport(page, config, "chef"),
      extractSingleReport(secondaryPage, config, "dish")
    ]);
    return mergeReports(chefReport, dishReport, config.reportDate);
  } finally {
    await secondaryPage.close();
  }
}

async function extractChefReport(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const sections = Array.from(document.querySelectorAll("h3"))
      .map((heading) => {
        const title = clean(heading.textContent);
        if (!/^Chef:/i.test(title)) {
          return null;
        }

        const chefName = title.replace(/^Chef:\s*/i, "");
        if (!chefName) {
          return null;
        }

        let table = heading.nextElementSibling;
        while (table && table.tagName !== "TABLE") {
          table = table.nextElementSibling;
        }

        if (!table) {
          return null;
        }

        const allRows = Array.from(table.querySelectorAll("tr"));
        const periodRow = allRows.find((row) => {
          const texts = Array.from(row.cells || []).map((cell) => clean(cell.textContent));
          return texts.includes("AM") && texts.includes("PM");
        });
        const timeHeaderRow = allRows.find((row) => {
          const texts = Array.from(row.cells || []).map((cell) => clean(cell.textContent));
          return texts.includes("Dish") && texts.some((text) => /^\d{1,2}:\d{2}$/.test(text));
        });

        if (!timeHeaderRow) {
          return null;
        }

        const headers = Array.from(timeHeaderRow.cells).map((cell) => clean(cell.textContent));
        const dishIndex = headers.findIndex((text) => /^Dish$/i.test(text));
        const totalIndex = headers.findIndex((text) => /^Total$/i.test(text));

        let amCount = 0;
        let pmCount = 0;
        if (periodRow) {
          const periodCells = Array.from(periodRow.cells || []);
          if (periodCells.length >= 3) {
            amCount = Math.max(Number(periodCells[1].getAttribute("colspan")) || 0, 0);
            pmCount = Math.max(Number(periodCells[2].getAttribute("colspan")) || 0, 0);
          }
        }

        let timeSequence = 0;
        const timeHeaders = headers
          .map((text, index) => {
            if (!/^\d{1,2}:\d{2}$/.test(text)) {
              return null;
            }

            let period = "";
            if (amCount && timeSequence < amCount) {
              period = "AM";
            } else if (pmCount && timeSequence < amCount + pmCount) {
              period = "PM";
            }

            timeSequence += 1;
            return {
              raw: text,
              label: period ? `${period} ${text}` : text,
              index
            };
          })
          .filter(Boolean);

        const rows = [];
        const entries = [];
        let reachedHeader = false;

        for (const row of allRows) {
          if (row === timeHeaderRow) {
            reachedHeader = true;
            continue;
          }

          if (!reachedHeader) {
            continue;
          }

          const cells = Array.from(row.cells || []);
          if (!cells.length) {
            continue;
          }

          const dish = clean(cells[dishIndex] ? cells[dishIndex].textContent : "");
          if (!dish) {
            continue;
          }

          const rowRecord = {
            chef: chefName,
            dish,
            total: totalIndex >= 0 && cells[totalIndex] ? clean(cells[totalIndex].textContent) : ""
          };

          for (const header of timeHeaders) {
            const value = cells[header.index] ? clean(cells[header.index].textContent) : "";
            rowRecord[header.label] = value;
            if (value) {
              entries.push({
                chef: rowRecord.chef,
                dish,
                time: header.label,
                rawTime: header.raw,
                value,
                total: rowRecord.total
              });
            }
          }

          rows.push(rowRecord);
        }

        return {
          chef: chefName,
          headers,
          times: timeHeaders.map((item) => item.label),
          rows,
          entries
        };
      })
      .filter(Boolean);

    if (!sections.length) {
      throw new Error("No chef report sections were found on the exported page.");
    }

    return {
      reportType: "chef",
      extractedAt: new Date().toISOString(),
      sourceUrl: window.location.href,
      sectionCount: sections.length,
      chefs: sections.map((section) => section.chef),
      sections,
      rows: sections.flatMap((section) => section.rows),
      entries: sections.flatMap((section) => section.entries)
    };
  });
}

async function extractDishReport(page) {
  return page.evaluate(() => {
    const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"));
    const sections = [];
    const rows = [];

    for (const heading of headings) {
      const title = clean(heading.textContent);
      if (!/^Dish:/i.test(title)) {
        continue;
      }

      const dish = title.replace(/^Dish:\s*/i, "");
      if (!dish) {
        continue;
      }

      const records = [];
      const seenKeys = new Set();
      let node = heading.nextElementSibling;

      while (node) {
        if (/^H[1-4]$/.test(node.tagName) && /^Dish:/i.test(clean(node.textContent))) {
          break;
        }

        const candidateTables = [];
        if (node.tagName === "TABLE") {
          candidateTables.push(node);
        }
        candidateTables.push(...Array.from(node.querySelectorAll ? node.querySelectorAll("table") : []));

        for (const table of candidateTables) {
          const fieldMap = {};
          for (const row of Array.from(table.querySelectorAll("tr"))) {
            const cells = Array.from(row.cells || []).map((cell) => clean(cell.textContent));
            if (cells.length >= 2) {
              const key = cells[0];
              const value = cells.slice(1).join(" ").trim();
              if (key) {
                fieldMap[key] = value;
              }
            }
          }

          if (fieldMap.Order) {
            const dedupeKey = [
              dish,
              fieldMap.Order || "",
              fieldMap["Prep Time"] || "",
              fieldMap.Qty || ""
            ].join("||");
            if (seenKeys.has(dedupeKey)) {
              continue;
            }
            seenKeys.add(dedupeKey);

            const record = {
              dish,
              orderNumber: fieldMap.Order || "",
              eventType: fieldMap["Event Type"] || "",
              functionTime: fieldMap["Function Time"] || "",
              prepTime: fieldMap["Prep Time"] || "",
              qty: fieldMap.Qty || "",
              notes: fieldMap.Notes || ""
            };
            records.push(record);
            rows.push(record);
          }
        }

        node = node.nextElementSibling;
      }

      sections.push({
        dish,
        rows: records
      });
    }

    if (!sections.length) {
      throw new Error("No dish report sections were found on the exported page.");
    }

    return {
      reportType: "dish",
      extractedAt: new Date().toISOString(),
      sourceUrl: window.location.href,
      sectionCount: sections.length,
      dishes: sections.map((section) => section.dish),
      sections,
      rows,
      entries: rows
    };
  });
}

function mergeReports(chefReport, dishReport, reportDate) {
  const dishBuckets = new Map();
  const allDishRows = [];

  for (const row of dishReport.rows) {
    const normalized = {
      ...row,
      normalizedDish: normalizeDishName(row.dish),
      normalizedPrepTime: normalizeClockLabel(row.prepTime),
      normalizedFunctionTime: normalizeClockLabel(row.functionTime),
      qtyNumber: parseInteger(row.qty),
      matched: false
    };
    const key = `${normalized.normalizedDish}||${normalized.normalizedPrepTime}`;
    if (!dishBuckets.has(key)) {
      dishBuckets.set(key, createDishBucket());
    }
    addDishRowToBucket(dishBuckets.get(key), normalized);
    allDishRows.push(normalized);
  }

  const mergedEntries = [];
  const unmatchedChefEntries = [];

  for (const entry of chefReport.entries) {
    const key = `${normalizeDishName(entry.dish)}||${normalizeClockLabel(entry.time)}`;
    const bucket = dishBuckets.get(key) || createDishBucket();
    const quantities = parseQuantityParts(entry.value);

    if (!quantities.length) {
      unmatchedChefEntries.push({
        ...entry,
        reason: "No numeric quantity found in chef cell."
      });
      continue;
    }

    const usedRows = [];
    let matchedAll = true;

    for (const qty of quantities) {
      const match = takeDishRowFromBucket(bucket, qty);
      if (!match) {
        matchedAll = false;
        break;
      }
      usedRows.push(match);
    }

    if (!matchedAll) {
      for (const row of usedRows) {
        restoreDishRowToBucket(bucket, row);
      }
      unmatchedChefEntries.push({
        ...entry,
        reason: `Could not fully match quantities [${quantities.join(", ")}] for ${entry.dish} at ${entry.time}.`
      });
      continue;
    }

    for (const row of usedRows) {
      mergedEntries.push({
        reportDate: reportDate || "",
        chef: entry.chef,
        dish: entry.dish,
        prepTime: row.prepTime,
        prepTimeLabel: row.normalizedPrepTime,
        functionTime: row.functionTime,
        functionTimeLabel: row.normalizedFunctionTime,
        qty: row.qty,
        orderNumber: row.orderNumber,
        eventType: row.eventType,
        notes: row.notes,
        chefCellValue: entry.value,
        chefCellTime: entry.time,
        chefCellRawTime: entry.rawTime,
        chefRowTotal: entry.total
      });
    }
  }

  const unmatchedDishRows = allDishRows
    .filter((row) => !row.matched)
    .map((row) => ({
      reportDate: reportDate || "",
      chef: "",
      dish: row.dish,
      prepTime: row.prepTime,
      prepTimeLabel: row.normalizedPrepTime,
      functionTime: row.functionTime,
      functionTimeLabel: row.normalizedFunctionTime,
      qty: row.qty,
      orderNumber: row.orderNumber,
      eventType: row.eventType,
      notes: row.notes,
      chefCellValue: "",
      chefCellTime: "",
      chefCellRawTime: "",
      chefRowTotal: "",
      unmatchedReason: "Present in by dish report but not matched to a chef timeline cell."
    }));

  return {
    reportType: "combined",
    extractedAt: new Date().toISOString(),
    sourceUrl: chefReport.sourceUrl,
    sectionCount: chefReport.sectionCount,
    chefs: chefReport.chefs,
    sections: chefReport.sections,
    csvRows: enrichCombinedRows([
      ...mergedEntries.map((row) => ({ ...row, unmatchedReason: "" })),
      ...unmatchedDishRows,
      ...unmatchedChefEntries.map((entry) => ({
        reportDate: reportDate || "",
        chef: entry.chef,
        dish: entry.dish,
        prepTime: "",
        prepTimeLabel: normalizeClockLabel(entry.time),
        functionTime: "",
        functionTimeLabel: "",
        qty: "",
        orderNumber: "",
        eventType: "",
        notes: "",
        chefCellValue: entry.value,
        chefCellTime: entry.time,
        chefCellRawTime: entry.rawTime,
        chefRowTotal: entry.total,
        unmatchedReason: entry.reason
      }))
    ]),
    mergeSummary: {
      matchedRowCount: mergedEntries.length,
      unmatchedDishRowCount: unmatchedDishRows.length,
      unmatchedChefEntryCount: unmatchedChefEntries.length,
      dishRowCount: dishReport.rows.length,
      chefEntryCount: chefReport.entries.length
    }
  };
}

async function writeOutputs(extraction, config) {
  const outputDir = path.resolve(process.cwd(), config.outputDir);
  await fs.promises.mkdir(outputDir, { recursive: true });

  const stamp = extraction.extractedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `report-${stamp}.json`);
  const csvPath = path.join(outputDir, `report-${stamp}.csv`);

  await Promise.all([
    fs.promises.writeFile(jsonPath, JSON.stringify(extraction, null, 2), "utf8"),
    fs.promises.writeFile(csvPath, encodeCsvForExcel(toCsv(extraction.csvRows || [])))
  ]);

  return { jsonPath, csvPath };
}

function toCsv(rows) {
  const headers = resolveCsvHeaders(rows);
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header] || "")).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function encodeCsvForExcel(text) {
  return Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(text, "utf8")
  ]);
}

function resolveCsvHeaders(rows) {
  const combinedHeaders = [
    "reportDate",
    "chef",
    "dish",
    "prepTime",
    "prepTimeLabel",
    "functionTime",
    "functionTimeLabel",
    "qty",
    "orderNumber",
    "eventType",
    "notes",
    "chefCellValue",
    "chefCellTime",
    "chefCellRawTime",
    "chefRowTotal",
    "unmatchedReason"
  ];
  const chefHeaders = ["chef", "dish", "time", "rawTime", "value", "total"];

  if (!rows || !rows.length) {
    return combinedHeaders;
  }

  return Object.prototype.hasOwnProperty.call(rows[0], "orderNumber")
    ? combinedHeaders
    : chefHeaders;
}

function escapeCsv(value) {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
}

async function readLoginError(page) {
  const selectors = [
    "#login_error",
    ".message",
    ".login .notice",
    ".login .notice-error",
    ".login .notice-warning",
    ".login .notice-info"
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      const text = String(await locator.textContent() || "").replace(/\s+/g, " ").trim();
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function requiredEnv(primaryName) {
  const value = process.env[primaryName];
  if (!value) {
    throw new Error(`Missing required environment variable: ${primaryName}`);
  }
  return value;
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

function parseNumber(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDishName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeClockLabel(value) {
  const text = String(value || "").replace(/\s+/g, "").toUpperCase();
  const match = text.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
  if (!match) {
    return String(value || "").trim();
  }

  let hour = Number(match[1]);
  const minuteNumber = Number(match[2]);
  const period = match[3];
  const roundedMinute = minuteNumber >= 30 ? 30 : 0;
  const minute = String(roundedMinute).padStart(2, "0");
  if (period) {
    return `${period} ${hour}:${minute}`;
  }
  return `${hour}:${minute}`;
}

function createDishBucket() {
  return {
    rows: [],
    byQty: new Map()
  };
}

function addDishRowToBucket(bucket, row) {
  bucket.rows.push(row);
  if (!bucket.byQty.has(row.qtyNumber)) {
    bucket.byQty.set(row.qtyNumber, []);
  }
  bucket.byQty.get(row.qtyNumber).push(row);
}

function takeDishRowFromBucket(bucket, qty) {
  const queue = bucket.byQty.get(qty) || [];
  const row = queue.shift() || null;
  if (row) {
    row.matched = true;
  }
  return row;
}

function restoreDishRowToBucket(bucket, row) {
  row.matched = false;
  if (!bucket.byQty.has(row.qtyNumber)) {
    bucket.byQty.set(row.qtyNumber, []);
  }
  bucket.byQty.get(row.qtyNumber).unshift(row);
}

async function getSharedBrowser(config) {
  if (!sharedBrowserPromise) {
    sharedBrowserPromise = chromium.launch({ headless: config.headless }).catch((error) => {
      sharedBrowserPromise = null;
      throw error;
    });
  }
  return sharedBrowserPromise;
}

function parseQuantityParts(value) {
  return String(value || "")
    .match(/\d+/g)?.map((part) => Number(part)).filter((part) => Number.isFinite(part)) || [];
}

function parseInteger(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : NaN;
}

module.exports = {
  getConfig,
  getMissingExtractorEnvVars,
  isExtractorConfigured,
  runExtraction,
  toCsv
};
