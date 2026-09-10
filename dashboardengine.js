/**
 * FACILITYOS — DASHBOARD ENGINE
 * ---------------------------------------------------------------------
 * Add this as a THIRD script file in the same Apps Script project as
 * FacilityOS_FormProcessor.gs and FacilityOS_RegisterEngine.gs. Reuses
 * sheetToObjects_(), getRequiredSheet_(), findColumn_() from those files.
 *
 * Design: dashboards sit ABOVE registers in the data flow —
 *   Transaction Sheet -> Register (Register Engine) -> Dashboard (this file)
 * Anywhere a register already computes something (overdue, critical,
 * reorder, due-for-service), the dashboard reads the register's Flag
 * column rather than recomputing the logic — one source of truth for
 * "what's wrong," not two copies that can drift apart. Dashboards only
 * do their own computation for things no register covers: KPI trends,
 * closure-rate metrics, renewal windows, asset status counts.
 *
 * Four dashboards, matching the spec's four roles:
 *   - DASH - Technician:  a worklist — open jobs assigned to someone,
 *     flagged items first. No login system in this MVP, so it's the
 *     full open worklist; a technician scans for their own name.
 *   - DASH - Supervisor:  a control tower — counts + a single combined
 *     "Needs Attention" list pulled from every register's Flag column.
 *   - DASH - FM Manager:  performance — latest KPI per metric, maintenance
 *     closure rate, asset status breakdown.
 *   - DASH - Executive:   one page — top-line counts + upcoming renewals.
 * ---------------------------------------------------------------------
 */

// =========================================================================
// 1. ENTRY POINTS
// =========================================================================

function rebuildAllDashboards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  rebuildTechnicianDashboard_(ss);
  rebuildSupervisorDashboard_(ss);
  rebuildFmManagerDashboard_(ss);
  rebuildExecutiveDashboard_(ss);
  ss.toast("All dashboards rebuilt.", "FacilityOS");
}

// =========================================================================
// 2. PURE HELPERS — no sheet I/O, unit-testable in isolation
// =========================================================================

const OPEN_STATUSES_EXCLUDE = ["closed", "completed", "resolved"];
function isOpenStatus_(status) {
  return OPEN_STATUSES_EXCLUDE.indexOf(String(status).toLowerCase()) === -1;
}

/** Rows where headerName's value is non-empty (e.g. a Flag column). */
function filterFlagged_(rows, headerName) {
  return rows.filter(function (r) { return r[headerName] && String(r[headerName]).trim() !== ""; });
}

/**
 * Groups rows by keyHeader and returns the row with the latest date in
 * dateHeader for each key. Used for "latest KPI reading per KPI name."
 */
function computeLatestPerKey_(rows, keyHeader, dateHeader) {
  const latest = {};
  rows.forEach(function (row) {
    const key = row[keyHeader];
    if (!key) return;
    const rowDate = new Date(row[dateHeader]);
    if (!latest[key] || rowDate > new Date(latest[key][dateHeader])) {
      latest[key] = row;
    }
  });
  return Object.keys(latest).map(function (k) { return latest[k]; });
}

/**
 * From MAINTENANCE rows: how many completed within the last windowDays,
 * and the average days from Date Requested to Date Completed among those.
 */
function computeMaintenanceClosureMetrics_(maintenanceRows, today, windowDays) {
  const cutoff = new Date(today.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const completedInWindow = maintenanceRows.filter(function (row) {
    if (String(row["Status"]).toLowerCase() !== "completed") return false;
    if (!row["Date Completed"]) return false;
    return new Date(row["Date Completed"]) >= cutoff;
  });

  let avgDays = null;
  if (completedInWindow.length > 0) {
    const totalDays = completedInWindow.reduce(function (sum, row) {
      const requested = new Date(row["Date Requested"]);
      const completed = new Date(row["Date Completed"]);
      return sum + daysBetween_(requested, completed);
    }, 0);
    avgDays = Math.round((totalDays / completedInWindow.length) * 10) / 10;
  }

  const openCount = maintenanceRows.filter(function (row) { return isOpenStatus_(row["Status"]); }).length;

  return { openCount: openCount, completedInWindow: completedInWindow.length, avgDaysToClose: avgDays };
}

/** Counts ASSETS rows by Status. */
function computeAssetStatusCounts_(assetRows) {
  const counts = {};
  assetRows.forEach(function (row) {
    const status = row["Status"] || "Unknown";
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

/** CONTRACTS rows with a Renewal Date within the next windowDays (and not past). */
function computeUpcomingRenewals_(contractRows, today, windowDays) {
  const cutoff = new Date(today.getTime() + windowDays * 24 * 60 * 60 * 1000);
  return contractRows
    .filter(function (row) {
      if (!row["Renewal Date"]) return false;
      const renewal = new Date(row["Renewal Date"]);
      return renewal >= today && renewal <= cutoff;
    })
    .sort(function (a, b) { return new Date(a["Renewal Date"]) - new Date(b["Renewal Date"]); });
}

// =========================================================================
// 3. TECHNICIAN DASHBOARD
// =========================================================================

function rebuildTechnicianDashboard_(ss) {
  const sheet = getOrCreateRegisterSheet_(ss, "DASH - Technician", []);
  sheet.clear();

  let row = writeSectionHeader_(sheet, 1, "OPEN MAINTENANCE JOBS");
  const maintReg = ss.getSheetByName("REG - Maintenance Register");
  row = writeTable_(sheet, row, maintReg ? sheetToObjects_(maintReg).filter(function (r) { return isOpenStatus_(r["Status"]); }) : []);

  row = writeSectionHeader_(sheet, row + 1, "OPEN INCIDENTS");
  const incReg = ss.getSheetByName("REG - Incident Register");
  row = writeTable_(sheet, row, incReg ? sheetToObjects_(incReg).filter(function (r) { return isOpenStatus_(r["Status"]); }) : []);

  row = writeSectionHeader_(sheet, row + 1, "INSPECTION ITEMS NEEDING ACTION");
  const inspSheet = ss.getSheetByName("INSPECTIONS");
  const inspRows = inspSheet ? sheetToObjects_(inspSheet).filter(function (r) {
    return r["Action Required"] && String(r["Action Required"]).trim() !== "";
  }) : [];
  writeTable_(sheet, row, inspRows);

  sheet.setColumnWidth(1, 160);
  for (let c = 2; c <= 10; c++) sheet.autoResizeColumn(c);
}

// =========================================================================
// 4. SUPERVISOR DASHBOARD
// =========================================================================

function rebuildSupervisorDashboard_(ss) {
  const sheet = getOrCreateRegisterSheet_(ss, "DASH - Supervisor", []);
  sheet.clear();

  const registerNames = [
    "REG - Maintenance Register", "REG - Incident Register", "REG - Generator Register",
    "REG - Diesel Register", "REG - Consumables Register", "REG - Fumigation Register"
  ];

  let row = writeSectionHeader_(sheet, 1, "SUMMARY COUNTS");
  const summaryRows = [];
  registerNames.forEach(function (name) {
    const regSheet = ss.getSheetByName(name);
    if (!regSheet) return;
    const objs = sheetToObjects_(regSheet);
    const flaggedCount = filterFlagged_(objs, "Flag").length;
    summaryRows.push([name.replace("REG - ", ""), objs.length, flaggedCount]);
  });
  sheet.getRange(row, 1, 1, 3).setValues([["Register", "Total Rows", "Flagged"]]).setFontWeight("bold");
  if (summaryRows.length > 0) sheet.getRange(row + 1, 1, summaryRows.length, 3).setValues(summaryRows);
  row = row + summaryRows.length + 2;

  row = writeSectionHeader_(sheet, row, "NEEDS ATTENTION (all flagged items, across registers)");
  const combined = [];
  registerNames.forEach(function (name) {
    const regSheet = ss.getSheetByName(name);
    if (!regSheet) return;
    const flagged = filterFlagged_(sheetToObjects_(regSheet), "Flag");
    flagged.forEach(function (r) {
      combined.push({
        "Source Register": name.replace("REG - ", ""),
        "ID": r[Object.keys(r)[0]],
        "Facility": r["Facility"] || "",
        "Flag": r["Flag"]
      });
    });
  });
  writeTable_(sheet, row, combined);

  for (let c = 1; c <= 6; c++) sheet.autoResizeColumn(c);
}

// =========================================================================
// 5. FM MANAGER DASHBOARD
// =========================================================================

function rebuildFmManagerDashboard_(ss) {
  const sheet = getOrCreateRegisterSheet_(ss, "DASH - FM Manager", []);
  sheet.clear();
  const today = new Date();

  let row = writeSectionHeader_(sheet, 1, "LATEST KPI READINGS");
  const kpiSheet = ss.getSheetByName("KPI EVENTS");
  const latestKpis = kpiSheet ? computeLatestPerKey_(sheetToObjects_(kpiSheet), "KPI Name", "Date") : [];
  row = writeTable_(sheet, row, latestKpis.map(function (r) {
    return { "KPI Name": r["KPI Name"], "Latest Value": r["Value"], "Target": r["Target"],
             "Status": r["Status"] || "(not assessed)", "Date": r["Date"] };
  }));

  row = writeSectionHeader_(sheet, row + 1, "MAINTENANCE CLOSURE (last 30 days)");
  const maintSheet = ss.getSheetByName("MAINTENANCE");
  const closure = maintSheet
    ? computeMaintenanceClosureMetrics_(sheetToObjects_(maintSheet), today, 30)
    : { openCount: 0, completedInWindow: 0, avgDaysToClose: null };
  sheet.getRange(row, 1, 3, 2).setValues([
    ["Currently Open", closure.openCount],
    ["Completed (last 30 days)", closure.completedInWindow],
    ["Avg Days to Close", closure.avgDaysToClose === null ? "n/a" : closure.avgDaysToClose]
  ]);
  row += 4;

  row = writeSectionHeader_(sheet, row, "ASSET STATUS BREAKDOWN");
  const assetSheet = ss.getSheetByName("ASSETS");
  const statusCounts = assetSheet ? computeAssetStatusCounts_(sheetToObjects_(assetSheet)) : {};
  const statusRows = Object.keys(statusCounts).map(function (k) { return [k, statusCounts[k]]; });
  if (statusRows.length > 0) sheet.getRange(row, 1, statusRows.length, 2).setValues(statusRows);

  for (let c = 1; c <= 5; c++) sheet.autoResizeColumn(c);
}

// =========================================================================
// 6. EXECUTIVE DASHBOARD
// =========================================================================

function rebuildExecutiveDashboard_(ss) {
  const sheet = getOrCreateRegisterSheet_(ss, "DASH - Executive", []);
  sheet.clear();
  const today = new Date();

  const facilitiesSheet = ss.getSheetByName("FACILITIES");
  const contractsSheet = ss.getSheetByName("CONTRACTS");
  const maintReg = ss.getSheetByName("REG - Maintenance Register");
  const incReg = ss.getSheetByName("REG - Incident Register");
  const kpiSheet = ss.getSheetByName("KPI EVENTS");

  const facilityCount = facilitiesSheet ? sheetToObjects_(facilitiesSheet).length : 0;
  const contracts = contractsSheet ? sheetToObjects_(contractsSheet) : [];
  const activeContracts = contracts.filter(function (r) { return String(r["Status"]).toLowerCase() === "active"; }).length;
  const overdueMaintenance = maintReg ? filterFlagged_(sheetToObjects_(maintReg), "Flag").filter(function (r) { return r["Flag"].indexOf("Overdue") !== -1; }).length : 0;
  const criticalIncidents = incReg ? sheetToObjects_(incReg).filter(function (r) { return String(r["Flag"]).indexOf("Critical") !== -1; }).length : 0;

  let latestKpis = [];
  if (kpiSheet) latestKpis = computeLatestPerKey_(sheetToObjects_(kpiSheet), "KPI Name", "Date");
  const kpisMet = latestKpis.filter(function (r) { return String(r["Status"]).toLowerCase() === "met"; }).length;

  let row = writeSectionHeader_(sheet, 1, "TOP-LINE SNAPSHOT");
  sheet.getRange(row, 1, 6, 2).setValues([
    ["Facilities", facilityCount],
    ["Active Contracts", activeContracts],
    ["Overdue Maintenance Items", overdueMaintenance],
    ["Critical Open Incidents", criticalIncidents],
    ["KPIs Currently Met", kpisMet + " / " + latestKpis.length],
    ["Snapshot Date", Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy-MM-dd")]
  ]);
  row += 7;

  row = writeSectionHeader_(sheet, row, "UPCOMING CONTRACT RENEWALS (next 60 days)");
  const upcoming = computeUpcomingRenewals_(contracts, today, 60);
  writeTable_(sheet, row, upcoming.map(function (r) {
    return { "Contract ID": r["Contract ID"], "Client ID": r["Client ID"], "Facility ID": r["Facility ID"], "Renewal Date": r["Renewal Date"] };
  }));

  for (let c = 1; c <= 5; c++) sheet.autoResizeColumn(c);
}

// =========================================================================
// 7. SHARED WRITE HELPERS
// =========================================================================

function writeSectionHeader_(sheet, row, title) {
  const cell = sheet.getRange(row, 1);
  cell.setValue(title);
  cell.setFontWeight("bold").setFontColor("#FFFFFF").setBackground("#1F4E78");
  sheet.getRange(row, 1, 1, 8).merge();
  return row + 1;
}

/** Writes an array of {header: value} row objects as a table starting at `row`. Returns the next free row. */
function writeTable_(sheet, row, rowObjects) {
  if (!rowObjects || rowObjects.length === 0) {
    sheet.getRange(row, 1).setValue("(none)").setFontStyle("italic").setFontColor("#808080");
    return row + 2;
  }
  const headers = Object.keys(rowObjects[0]);
  sheet.getRange(row, 1, 1, headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#D9E1F2");

  const dataRows = rowObjects.map(function (obj) {
    return headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ""; });
  });
  sheet.getRange(row + 1, 1, dataRows.length, headers.length).setValues(dataRows);

  return row + dataRows.length + 2;
}
/**
 * Returns an existing sheet or creates it if it doesn't exist.
 * If the sheet is newly created, writes the supplied header row.
 */
function getOrCreateRegisterSheet_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);

    if (headers && headers.length > 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
    }
  }

  return sheet;
}