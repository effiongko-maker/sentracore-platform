/**
 * FACILITYOS — REGISTER ENGINE
 * ---------------------------------------------------------------------
 * Add this as a SECOND script file in the SAME Apps Script project as
 * FacilityOS_FormProcessor.gs (Apps Script editor > + next to Files).
 * They share globals, so this file reuses getRequiredSheet_() and
 * findColumn_() defined over there — don't redefine them here.
 *
 * Design:
 *   - REGISTER_CONFIGS is the only thing you touch to wire up a new
 *     register later. Each entry maps ONE source transaction sheet to
 *     ONE register tab, with a header list and a buildRow function.
 *   - rebuildRegisterFor_(sourceSheetName) rebuilds just the one
 *     register affected by a form submission — called from
 *     onFormSubmit() in the Form Processor file (see the one-line hook
 *     below) so registers update within the same submission, not on a
 *     delay.
 *   - rebuildAllRegisters() rebuilds every configured register — wired
 *     to a "FacilityOS > Rebuild All Registers" menu item for manual
 *     runs, and safe to also put on a time-driven trigger later.
 *   - Registers are NEVER hand-edited: this engine clears and rewrites
 *     the whole body below the header every time it runs.
 * ---------------------------------------------------------------------
 */

// =========================================================================
// 1. CONFIG — add one block per register here as more come online
// =========================================================================

const REGISTER_CONFIGS = {

  "MAINTENANCE": {
  registerTab: "REG - Maintenance Register",
  headers: [
    "Maintenance ID",
    "Facility",
    "Asset",
    "Description",
    "Requester",
    "Assigned To",
    "Priority",
    "Severity",
    "Status",
    "Date Requested",
    "Date Completed",
    "Days Open",
    "Flag"
  ],

  overdueDays: 3,

  buildRow: function (row, lookups, today) {

    const sla = SLAEngine.calculate(row);
    const decision = DecisionEngine.evaluateMaintenance(row);

    return [
      row["Maintenance ID"],
      lookups.facilityName(row["Facility ID"]),
      lookups.assetName(row["Asset ID"]),
      row["Description"],
      lookups.userName(row["Requester"]),
      row["Assigned To"] ? lookups.userName(row["Assigned To"]) : "",
      row["Priority"],
      decision.severity,
      row["Status"],
      row["Date Requested"] || "",
      row["Date Completed"] || "",
      sla.ageDays,
      sla.overdue
        ? "⚠ Overdue (L" + sla.escalationLevel + ")"
        : "✓ Within SLA"
    ];

  }
},

  "INCIDENTS": {
    registerTab: "REG - Incident Register",
    headers: ["Incident ID", "Facility", "Incident Type", "Severity", "Description",
              "Reported By", "Date Reported", "Root Cause", "Corrective Action", "Owner",
              "Status", "Days Open", "Flag"],
    overdueDays: 1, // incidents are flagged overdue faster than routine maintenance
    buildRow: function (row, lookups, today) {
      const opened = lookups.eventTimestamp(row["Event ID"]);
      const isOpen = String(row["Status"]).toLowerCase() !== "closed" &&
                     String(row["Status"]).toLowerCase() !== "resolved";
      const daysOpen = opened ? daysBetween_(opened, today) : "";
      const overdue = isOpen && daysOpen !== "" && daysOpen > this.overdueDays;
      const critical = String(row["Severity"]).toLowerCase() === "critical" && isOpen;
      return [
        row["Incident ID"],
        lookups.facilityName(row["Facility ID"]),
        row["Incident Type"],
        row["Severity"],
        row["Description"],
        lookups.userName(row["Reported By"]),
        row["Date Reported"],
        row["Root Cause"] || "",
        row["Corrective Action"] || "",
        row["Owner"] ? lookups.userName(row["Owner"]) : "",
        row["Status"],
        daysOpen,
        critical ? "🔴 Critical" : (overdue ? "⚠ Overdue" : "")
      ];
    }
  },

  "GENERATOR READINGS": {
    registerTab: "REG - Generator Register",
    headers: ["Reading ID", "Facility", "Generator", "Date", "Start Reading (hrs)",
              "End Reading (hrs)", "Run Hours", "Fuel Used (L)", "Remarks", "Flag"],
    // Flags a reading if Run Hours looks inconsistent with Start/End Reading —
    // real logs sometimes have Run Hours entered by observation rather than
    // computed, so this is a data-quality flag, not a rejection.
    runHoursTolerance: 1,
    buildRow: function (row, lookups, today) {
      const start = parseFloat(row["Start Reading (hrs)"]);
      const end = parseFloat(row["End Reading (hrs)"]);
      const runHours = parseFloat(row["Run Hours"]);
      let flag = "";
      if (!isNaN(start) && !isNaN(end) && !isNaN(runHours)) {
        const computed = end - start;
        if (Math.abs(computed - runHours) > this.runHoursTolerance) {
          flag = "⚠ Check reading";
        }
      }
      return [
        row["Reading ID"],
        lookups.facilityName(row["Facility ID"]),
        row["Generator ID"],
        row["Date"],
        row["Start Reading (hrs)"],
        row["End Reading (hrs)"],
        row["Run Hours"],
        row["Fuel Used (L)"] || "",
        row["Remarks"] || "",
        flag
      ];
    }
  },

  "DIESEL LOG": {
    registerTab: "REG - Diesel Register",
    headers: ["Log ID", "Facility", "Generator", "Date", "Opening Level (L)", "Added (L)",
              "Closing Level (L)", "Consumption (L)", "Flag"],
    // Flags a suspiciously high single-day consumption relative to typical
    // generator draw — a cheap sanity check on data entry, not a hard rule.
    highConsumptionThreshold: 100,
    buildRow: function (row, lookups, today) {
      const consumption = parseFloat(row["Consumption (L)"]);
      const flag = (!isNaN(consumption) && consumption > this.highConsumptionThreshold)
        ? "⚠ High usage" : (consumption < 0 ? "⚠ Negative — check entry" : "");
      return [
        row["Log ID"],
        lookups.facilityName(row["Facility ID"]),
        row["Generator ID"],
        row["Date"],
        row["Opening Level (L)"],
        row["Added (L)"],
        row["Closing Level (L)"],
        row["Consumption (L)"],
        flag
      ];
    }
  },

  "INVENTORY": {
    registerTab: "REG - Consumables Register",
    headers: ["Item ID", "Facility", "Item Name", "Opening", "Received", "Issued",
              "Closing", "Reorder Level", "Date", "Flag"],
    buildRow: function (row, lookups, today) {
      const closing = parseFloat(row["Closing"]);
      const reorder = parseFloat(row["Reorder Level"]);
      const belowReorder = !isNaN(closing) && !isNaN(reorder) && reorder > 0 && closing <= reorder;
      return [
        row["Item ID"],
        lookups.facilityName(row["Facility ID"]),
        row["Item Name"],
        row["Opening"],
        row["Received"],
        row["Issued"],
        row["Closing"],
        row["Reorder Level"],
        row["Date"],
        belowReorder ? "⚠ Reorder now" : ""
      ];
    }
  }

  // Next register to add, e.g.:
  // "CLIENT COMPLAINTS": { registerTab: "REG - Complaint Register", ... }
};

// =========================================================================
// 1b. Waste / Fumigation / Deep Cleaning registers
// =========================================================================

REGISTER_CONFIGS["WASTE LOG"] = {
  registerTab: "REG - Waste Register",
  headers: ["Log ID", "Facility", "Waste Type", "Quantity", "Unit", "Disposal Method", "Date", "Remarks"],
  buildRow: function (row, lookups) {
    return [row["Log ID"], lookups.facilityName(row["Facility ID"]), row["Waste Type"], row["Quantity"],
            row["Unit"], row["Disposal Method"], row["Date"], row["Remarks"] || ""];
  }
};

REGISTER_CONFIGS["FUMIGATION LOG"] = {
  registerTab: "REG - Fumigation Register",
  headers: ["Log ID", "Facility", "Area Treated", "Pest Type", "Vendor", "Date", "Next Due Date", "Status", "Flag"],
  buildRow: function (row, lookups, today) {
    const nextDue = row["Next Due Date"] ? new Date(row["Next Due Date"]) : null;
    const overdue = nextDue && nextDue < today;
    return [row["Log ID"], lookups.facilityName(row["Facility ID"]), row["Area Treated"],
            row["Pest Type"] || "", row["Vendor"], row["Date"], row["Next Due Date"] || "",
            row["Status"], overdue ? "⚠ Due" : ""];
  }
};

REGISTER_CONFIGS["DEEP CLEANING LOG"] = {
  registerTab: "REG - Deep Cleaning Register",
  headers: ["Log ID", "Facility", "Area", "Vendor/Team", "Date", "Status", "Remarks"],
  buildRow: function (row, lookups) {
    return [row["Log ID"], lookups.facilityName(row["Facility ID"]), row["Area"],
            row["Vendor/Team"], row["Date"], row["Status"], row["Remarks"] || ""];
  }
};

// =========================================================================
// 2. ENTRY POINTS
// =========================================================================

/**
 * Rebuilds only the register tied to one source sheet. Call this from
 * onFormSubmit() right after writeTransactionRow_() — see hook below.
 */
function rebuildRegisterFor_(sourceSheetName) {
  const config = REGISTER_CONFIGS[sourceSheetName];
  if (!config) return; // no register wired up for this sheet yet — fine
  rebuildOneRegister_(sourceSheetName, config);
}

/** Rebuilds every configured register. Menu-driven; safe to also schedule. */
function rebuildAllRegisters() {
  Object.keys(REGISTER_CONFIGS).forEach(function (sourceSheetName) {
    rebuildOneRegister_(sourceSheetName, REGISTER_CONFIGS[sourceSheetName]);
  });
  SpreadsheetApp.getActiveSpreadsheet().toast("All registers rebuilt.", "FacilityOS");
}

function rebuildOneRegister_(sourceSheetName, config) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = getRequiredSheet_(ss, sourceSheetName);
  const registerSheet = getOrCreateRegisterSheet_(ss, config.registerTab, config.headers);

  const rows = sheetToObjects_(sourceSheet);
  const lookups = buildLookups_(ss);
  const today = new Date();

  const outputRows = rows.map(function (row) {
    return config.buildRow(row, lookups, today);
  });

  // Sort: overdue/critical flags first, then by ID.
  outputRows.sort(function (a, b) {
    const flagCol = config.headers.length - 1;
    const aFlag = a[flagCol] ? 0 : 1;
    const bFlag = b[flagCol] ? 0 : 1;
    if (aFlag !== bFlag) return aFlag - bFlag;
    return String(a[0]).localeCompare(String(b[0]));
  });

  writeRegisterBody_(registerSheet, config.headers, outputRows);
}

// =========================================================================
// 3. LOOKUPS — human-readable names instead of raw IDs
// =========================================================================

function buildLookups_(ss) {
  const facilities = buildLookupMap_(ss, "FACILITIES", "Facility ID", "Facility Name");
  const assets = buildLookupMap_(ss, "ASSETS", "Asset ID", "Asset Name");
  const users = buildLookupMap_(ss, "USERS", "User ID", "Full Name");
  const eventTimestamps = buildLookupMap_(ss, "EVENT LOG", "Event ID", "Timestamp");

  return {
    facilityName: function (id) { return facilities[id] || id || ""; },
    assetName: function (id) { return id ? (assets[id] || id) : ""; },
    userName: function (id) { return users[id] || id || ""; },
    eventTimestamp: function (eventId) {
      const raw = eventTimestamps[eventId];
      return raw ? new Date(raw) : null;
    }
  };
}

function buildLookupMap_(ss, sheetName, keyHeader, valueHeader) {
  const sheet = ss.getSheetByName(sheetName);
  const map = {};
  if (!sheet) return map; // sheet missing shouldn't crash registers
  const objects = sheetToObjects_(sheet);
  objects.forEach(function (obj) {
    if (obj[keyHeader]) map[obj[keyHeader]] = obj[valueHeader];
  });
  return map;
}

// =========================================================================
// 4. SHEET I/O HELPERS
// =========================================================================

/** Converts all data rows (below header) into an array of {header: value} objects. */
function sheetToObjects_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return values.map(function(row) {
    const obj = {};
    headers.forEach(function(header, i) {
      obj[header] = row[i];
    });
    return obj;
  });
}

function getOrCreateRegisterSheet_(ss, tabName, headers) {
  let sheet = ss.getSheetByName(tabName);

  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];

  if (currentHeaders.join("|") !== headers.join("|")) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function writeRegisterBody_(sheet, headers, rows) {
  const lastRow = sheet.getMaxRows();
  const lastCol = sheet.getMaxColumns();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  }

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  for (let c = 1; c <= headers.length; c++) {
    sheet.autoResizeColumn(c);
  }
}

function daysBetween_(fromDate, toDate) {
  const msPerDay = 1000 * 60 * 60 * 24;

  const from = new Date(
    fromDate.getFullYear(),
    fromDate.getMonth(),
    fromDate.getDate()
  );

  const to = new Date(
    toDate.getFullYear(),
    toDate.getMonth(),
    toDate.getDate()
  );

  return Math.round((to - from) / msPerDay);
}
// =========================================================================
// 5. MENU — manual rebuild without waiting for a form submission
// =========================================================================

function onOpen() {
  const menu = SpreadsheetApp.getUi().createMenu("FacilityOS")
    .addItem("Rebuild All Registers", "rebuildAllRegisters");

  // DashboardEngine.gs is a separate file added later — guard so the menu
  // still builds fine before it exists.
  if (typeof rebuildAllDashboards === "function") {
    menu.addItem("Rebuild All Dashboards", "rebuildAllDashboards");
  }

  // ReportEngine.gs, same idea — guarded so the menu works before it's added.
  if (typeof generateMonthlyReport === "function") {
    menu.addItem("Generate Monthly Report", "generateMonthlyReport");
  }
  if (typeof generateQuarterlyReport === "function") {
    menu.addItem("Generate Quarterly Report", "generateQuarterlyReport");
  }
  if (typeof generateEOSRP === "function") {
    menu.addItem("Generate EOSRP (Annual)", "generateEOSRP");
  }

  // DropdownSync.gs, same guarded pattern.
  if (typeof syncAllFormDropdowns === "function") {
    menu.addItem("Sync Form Dropdowns", "syncAllFormDropdowns");
  }
  menu.addToUi();
}