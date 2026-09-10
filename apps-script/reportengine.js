/**
 * FACILITYOS — REPORT ENGINE (Monthly Report)
 * ---------------------------------------------------------------------
 * Add this as a FOURTH script file in the same Apps Script project.
 * Reuses sheetToObjects_() from RegisterEngine.gs and daysBetween_().
 *
 * Scope decision: this engine computes every QUANTITATIVE section of
 * the Monthly Report directly from live data (Executive Summary, KPI
 * Dashboard, Asset Health, Key Activities). For the NARRATIVE sections
 * (Issues & Risks, Recommendations) it pulls in whatever was actually
 * submitted via the Periodic Review forms for that period — it does
 * NOT invent findings or recommendations. If nothing was submitted for
 * a period, that section is left as a clearly marked placeholder for a
 * human to fill in, rather than fabricated to look complete.
 *
 * Quarterly Report and EOSRP are NOT built yet — they'd reuse the same
 * pure computation functions below (just over a quarter/year range
 * instead of a month), the same way new forms reused the Form
 * Processor's engine. See the bottom of this file for what that'd
 * look like.
 * ---------------------------------------------------------------------
 */

// =========================================================================
// 1. ENTRY POINT
// =========================================================================

function generateMonthlyReport() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Generate Monthly Report",
    "Enter the month to report on, as YYYY-MM (e.g. 2026-07):",
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const period = response.getResponseText().trim();
  let range;
  try {
    range = parseMonthRange_(period);
  } catch (err) {
    ui.alert("Couldn't parse '" + period + "' — please use YYYY-MM, e.g. 2026-07.");
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = computeMonthlyReportData_(ss, range.start, range.end, period);
  const doc = buildMonthlyReportDoc_(data, period);

  ui.alert("Monthly report generated:\n" + doc.getUrl());
}

// =========================================================================
// 2. PURE HELPERS — no sheet I/O, unit-testable in isolation
// =========================================================================

/** Parses "YYYY-MM" into {start, end} Date objects covering that whole month. */
function parseMonthRange_(periodStr) {
  const match = /^(\d{4})-(\d{2})$/.exec(periodStr);
  if (!match) throw new Error("Invalid period format: " + periodStr);
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10); // 1-12
  if (month < 1 || month > 12) throw new Error("Invalid month: " + month);

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // day 0 of next month = last day of this month
  return { start: start, end: end };
}

/** Rows where dateHeader falls within [start, end] inclusive. */
function filterByDateRange_(rows, dateHeader, start, end) {
  return rows.filter(function (row) {
    if (!row[dateHeader]) return false;
    const d = new Date(row[dateHeader]);
    return d >= start && d <= end;
  });
}

function computeExecutiveSummary_(maintenanceRows, complaintRows, incidentRows, assetRows, start, end) {
  const raised = filterByDateRange_(maintenanceRows, "Date Requested", start, end);
  const closed = filterByDateRange_(maintenanceRows, "Date Completed", start, end)
    .filter(function (r) { return String(r["Status"]).toLowerCase() === "completed"; });
  const closureRate = raised.length > 0 ? Math.round((closed.length / raised.length) * 1000) / 10 : null;

  const operationalCount = assetRows.filter(function (r) { return String(r["Status"]).toLowerCase() === "operational"; }).length;
  const assetAvailability = assetRows.length > 0 ? Math.round((operationalCount / assetRows.length) * 1000) / 10 : null;

  const complaints = filterByDateRange_(complaintRows, "Date", start, end);
  // "Safety Incidents" in the template maps to all incidents logged in the
  // period — our Incident Type field is free text, not pre-classified as
  // safety/non-safety, so this counts every incident rather than guessing
  // which ones are safety-related.
  const incidents = filterByDateRange_(incidentRows, "Date Reported", start, end);

  return {
    workOrdersRaised: raised.length,
    workOrdersClosed: closed.length,
    closureRate: closureRate,
    assetAvailability: assetAvailability,
    clientComplaints: complaints.length,
    safetyIncidents: incidents.length
  };
}

function computeClosureTimeHours_(maintenanceRows, start, end) {
  const closedInPeriod = filterByDateRange_(maintenanceRows, "Date Completed", start, end)
    .filter(function (r) { return String(r["Status"]).toLowerCase() === "completed" && r["Date Requested"]; });
  if (closedInPeriod.length === 0) return null;

  const totalHours = closedInPeriod.reduce(function (sum, r) {
    const requested = new Date(r["Date Requested"]);
    const completed = new Date(r["Date Completed"]);
    return sum + (completed - requested) / (1000 * 60 * 60);
  }, 0);
  return Math.round((totalHours / closedInPeriod.length) * 10) / 10;
}

function computeCleaningCompliance_(cleaningRows, start, end) {
  const inPeriod = filterByDateRange_(cleaningRows, "Date", start, end);
  if (inPeriod.length === 0) return null;
  const passed = inPeriod.filter(function (r) { return String(r["Checklist Result"]).toLowerCase() === "pass"; }).length;
  return Math.round((passed / inPeriod.length) * 1000) / 10;
}

/**
 * Builds the KPI Dashboard table. Each row's "Actual" is null (shown as
 * "No data") when the period has no relevant entries — never a guessed
 * or interpolated value.
 */
function computeKpiDashboard_(maintenanceRows, cleaningRows, assetRows, start, end) {
  const closureTimeHrs = computeClosureTimeHours_(maintenanceRows, start, end);
  const operationalCount = assetRows.filter(function (r) { return String(r["Status"]).toLowerCase() === "operational"; }).length;
  const assetAvailability = assetRows.length > 0 ? Math.round((operationalCount / assetRows.length) * 1000) / 10 : null;
  const cleaningCompliance = computeCleaningCompliance_(cleaningRows, start, end);

  return [
    { kpi: "Response Time", target: "≤2hrs", actual: "No data logged this period", status: "n/a" },
    { kpi: "Closure Time", target: "≤24hrs",
      actual: closureTimeHrs === null ? "No jobs closed this period" : closureTimeHrs + " hrs",
      status: closureTimeHrs === null ? "n/a" : (closureTimeHrs <= 24 ? "Met" : "Not Met") },
    { kpi: "Asset Availability", target: "98%",
      actual: assetAvailability === null ? "No assets registered" : assetAvailability + "%",
      status: assetAvailability === null ? "n/a" : (assetAvailability >= 98 ? "Met" : "Not Met") },
    { kpi: "Cleaning Compliance", target: "95%",
      actual: cleaningCompliance === null ? "No cleaning logs this period" : cleaningCompliance + "%",
      status: cleaningCompliance === null ? "n/a" : (cleaningCompliance >= 95 ? "Met" : "Not Met") }
  ];
}

/**
 * For each of the four categories the template tracks, flags "Attention
 * Needed" if any open High-priority maintenance job touches an asset in
 * that category — otherwise "OK". This is a coarse signal, not a full
 * condition assessment.
 */
function computeAssetHealthSummary_(assetRows, maintenanceRows, categories) {
  categories = categories || ["Generators", "HVAC", "Fire Systems", "Plumbing"];
  const openHighPriorityAssetIds = maintenanceRows
    .filter(function (r) {
      return String(r["Status"]).toLowerCase() !== "completed" &&
             String(r["Priority"]).toLowerCase() === "high";
    })
    .map(function (r) { return r["Asset ID"]; });

  return categories.map(function (category) {
    const assetsInCategory = assetRows.filter(function (r) {
      return String(r["Category"]).toLowerCase().indexOf(category.toLowerCase().replace(/s$/, "")) !== -1;
    });
    const flagged = assetsInCategory.some(function (a) { return openHighPriorityAssetIds.indexOf(a["Asset ID"]) !== -1; });
    return { category: category, status: flagged ? "Attention Needed" : "OK" };
  });
}

function computeKeyActivities_(maintenanceRows, start, end) {
  return filterByDateRange_(maintenanceRows, "Date Completed", start, end)
    .filter(function (r) { return String(r["Status"]).toLowerCase() === "completed"; })
    .map(function (r) { return r["Description"] + " (" + r["Maintenance ID"] + ")"; });
}

/**
 * Pulls Issues/Recommendations from whatever Periodic Reviews were
 * actually submitted for this period — never fabricated. Returns
 * separate arrays plus a flag for whether anything was found.
 */
function computeIssuesAndRecommendations_(reviewRows, period) {
  const inPeriod = reviewRows.filter(function (r) { return r["Period"] === period; });
  const recommendations = inPeriod
    .filter(function (r) { return r["Recommendations"]; })
    .map(function (r) { return "[" + r["Review Type"] + "] " + r["Recommendations"]; });
  const summaries = inPeriod
    .filter(function (r) { return r["Summary"]; })
    .map(function (r) { return "[" + r["Review Type"] + "] " + r["Summary"]; });

  return { hasReviews: inPeriod.length > 0, summaries: summaries, recommendations: recommendations };
}

// =========================================================================
// 3. AGGREGATOR — pulls the pure functions together against live sheets
// =========================================================================

function computeMonthlyReportData_(ss, start, end, period) {
  const maintenance = sheetToObjects_(getRequiredSheet_(ss, "MAINTENANCE"));
  const complaints = sheetToObjects_(getRequiredSheet_(ss, "CLIENT COMPLAINTS"));
  const incidents = sheetToObjects_(getRequiredSheet_(ss, "INCIDENTS"));
  const assets = sheetToObjects_(getRequiredSheet_(ss, "ASSETS"));
  const cleaning = sheetToObjects_(getRequiredSheet_(ss, "CLEANING"));
  const reviews = sheetToObjects_(getRequiredSheet_(ss, "PERIODIC REVIEWS"));

  return {
    period: period,
    executiveSummary: computeExecutiveSummary_(maintenance, complaints, incidents, assets, start, end),
    kpiDashboard: computeKpiDashboard_(maintenance, cleaning, assets, start, end),
    assetHealth: computeAssetHealthSummary_(assets, maintenance),
    keyActivities: computeKeyActivities_(maintenance, start, end),
    issuesAndRecs: computeIssuesAndRecommendations_(reviews, period)
  };
}

// =========================================================================
// 4. DOCUMENT BUILDER — mechanical assembly, no logic beyond formatting
// =========================================================================

function buildMonthlyReportDoc_(data, period) {
  const doc = DocumentApp.create("Facility Management Monthly Report - " + period);
  const body = doc.getBody();

  body.appendParagraph("FACILITY MANAGEMENT MONTHLY REPORT").setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph("Period: " + period);
  body.appendParagraph("Generated: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));

  body.appendParagraph("Section 1: Executive Summary").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const es = data.executiveSummary;
  const esTable = body.appendTable([
    ["Metric", "Result"],
    ["Work Orders Raised", String(es.workOrdersRaised)],
    ["Work Orders Closed", String(es.workOrdersClosed)],
    ["Closure Rate", es.closureRate === null ? "n/a (no work orders raised)" : es.closureRate + "%"],
    ["Asset Availability (%)", es.assetAvailability === null ? "n/a" : es.assetAvailability + "%"],
    ["Client Complaints", String(es.clientComplaints)],
    ["Safety Incidents", String(es.safetyIncidents)]
  ]);
  styleTableHeaderRow_(esTable);

  body.appendParagraph("Section 2: Contract Performance Dashboard").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const kpiTable = body.appendTable(
    [["KPI", "Target", "Actual", "Status"]].concat(
      data.kpiDashboard.map(function (k) { return [k.kpi, k.target, k.actual, k.status]; })
    )
  );
  styleTableHeaderRow_(kpiTable);

  body.appendParagraph("Section 3: Key Activities Completed").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (data.keyActivities.length === 0) {
    body.appendParagraph("(No maintenance jobs closed in this period.)").setItalic(true);
  } else {
    data.keyActivities.forEach(function (activity) {
      body.appendListItem(activity).setGlyphType(DocumentApp.GlyphType.BULLET);
    });
  }

  body.appendParagraph("Section 4: Major Asset Health Summary").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const healthTable = body.appendTable(
    [["Asset Category", "Status"]].concat(data.assetHealth.map(function (h) { return [h.category, h.status]; }))
  );
  styleTableHeaderRow_(healthTable);

  body.appendParagraph("Section 5: Issues & Risks").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (!data.issuesAndRecs.hasReviews) {
    body.appendParagraph(
      "No Periodic Review forms were submitted for " + period + " — add issues/risks manually before sending."
    ).setItalic(true);
  } else if (data.issuesAndRecs.summaries.length === 0) {
    body.appendParagraph("(Reviews submitted this period had no summary text.)").setItalic(true);
  } else {
    data.issuesAndRecs.summaries.forEach(function (s) { body.appendListItem(s).setGlyphType(DocumentApp.GlyphType.BULLET); });
  }

  body.appendParagraph("Section 6: Recommendations").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (!data.issuesAndRecs.hasReviews || data.issuesAndRecs.recommendations.length === 0) {
    body.appendParagraph(
      "No recommendations captured for " + period + " — add manually before sending."
    ).setItalic(true);
  } else {
    data.issuesAndRecs.recommendations.forEach(function (r) { body.appendListItem(r).setGlyphType(DocumentApp.GlyphType.BULLET); });
  }

  doc.saveAndClose();
  return doc;
}

function styleTableHeaderRow_(table) {
  const headerRow = table.getRow(0);
  for (let c = 0; c < headerRow.getNumCells(); c++) {
    headerRow.getCell(c).setBackgroundColor("#1F4E78");
    const text = headerRow.getCell(c).editAsText();
    text.setBold(true);
    text.setForegroundColor("#FFFFFF");
  }
}

// =========================================================================
// 5. QUARTERLY REPORT
// =========================================================================

function generateQuarterlyReport() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    "Generate Quarterly Report",
    "Enter the quarter to report on, as YYYY-Q# (e.g. 2026-Q3):",
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const period = response.getResponseText().trim();
  let range;
  try {
    range = parseQuarterRange_(period);
  } catch (err) {
    ui.alert("Couldn't parse '" + period + "' — please use YYYY-Q#, e.g. 2026-Q3.");
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = computeQuarterlyReportData_(ss, period, range);
  const doc = buildQuarterlyReportDoc_(data, period);
  ui.alert("Quarterly report generated:\n" + doc.getUrl());
}

/** Parses "YYYY-Q#" (Q1-Q4) into {start, end} covering that quarter. */
function parseQuarterRange_(periodStr) {
  const match = /^(\d{4})-Q([1-4])$/.exec(periodStr);
  if (!match) throw new Error("Invalid period format: " + periodStr);
  const year = parseInt(match[1], 10);
  const quarter = parseInt(match[2], 10);
  const startMonth = (quarter - 1) * 3; // Q1->0(Jan), Q2->3(Apr), Q3->6(Jul), Q4->9(Oct)
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0); // last day of the quarter's 3rd month
  return { start: start, end: end };
}

/** "2026-Q3" -> "2026-Q2"; "2026-Q1" -> "2025-Q4" (wraps year boundary). */
function previousQuarterPeriod_(periodStr) {
  const match = /^(\d{4})-Q([1-4])$/.exec(periodStr);
  if (!match) throw new Error("Invalid period format: " + periodStr);
  let year = parseInt(match[1], 10);
  let quarter = parseInt(match[2], 10);
  quarter -= 1;
  if (quarter < 1) { quarter = 4; year -= 1; }
  return year + "-Q" + quarter;
}

/**
 * Merges this quarter's and last quarter's KPI dashboards into a trend
 * table. Trend is "n/a" whenever either side has no data — never
 * inferred from a single data point.
 */
function computeKpiTrend_(currentKpis, previousKpis) {
  return currentKpis.map(function (curr) {
    const prev = previousKpis.filter(function (p) { return p.kpi === curr.kpi; })[0];
    let trend = "n/a";
    if (curr.status !== "n/a" && prev && prev.status !== "n/a") {
      const currNum = parseFloat(curr.actual);
      const prevNum = parseFloat(prev.actual);
      if (!isNaN(currNum) && !isNaN(prevNum)) {
        trend = currNum > prevNum ? "▲" : (currNum < prevNum ? "▼" : "▬");
      }
    }
    return { kpi: curr.kpi, current: curr.actual, previous: prev ? prev.actual : "No data", trend: trend };
  });
}

function computeQuarterlyReportData_(ss, period, range) {
  const maintenance = sheetToObjects_(getRequiredSheet_(ss, "MAINTENANCE"));
  const assets = sheetToObjects_(getRequiredSheet_(ss, "ASSETS"));
  const cleaning = sheetToObjects_(getRequiredSheet_(ss, "CLEANING"));
  const reviews = sheetToObjects_(getRequiredSheet_(ss, "PERIODIC REVIEWS"));

  const currentKpis = computeKpiDashboard_(maintenance, cleaning, assets, range.start, range.end);

  let previousKpis = [];
  try {
    const prevPeriod = previousQuarterPeriod_(period);
    const prevRange = parseQuarterRange_(prevPeriod);
    previousKpis = computeKpiDashboard_(maintenance, cleaning, assets, prevRange.start, prevRange.end);
  } catch (err) {
    // First-ever quarter with no prior data — trend table just shows "No data".
  }

  const reviewsInPeriod = computeIssuesAndRecommendations_(reviews, period);

  return {
    period: period,
    kpiTrend: computeKpiTrend_(currentKpis, previousKpis),
    assetCondition: computeAssetHealthSummary_(assets, maintenance, ["Generator", "HVAC", "Fire Systems"]),
    majorProjectsCompleted: computeKeyActivities_(maintenance, range.start, range.end),
    majorRisks: reviewsInPeriod.summaries,
    recommendations: reviewsInPeriod.recommendations,
    hasReviews: reviewsInPeriod.hasReviews
  };
}

function buildQuarterlyReportDoc_(data, period) {
  const doc = DocumentApp.create("Facility Management Quarterly Report - " + period);
  const body = doc.getBody();

  body.appendParagraph("FACILITY MANAGEMENT QUARTERLY REPORT").setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph("Quarter: " + period);
  body.appendParagraph("Generated: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));

  body.appendParagraph("Section 2: KPI Trends").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const trendTable = body.appendTable(
    [["KPI", "This Quarter", "Last Quarter", "Trend"]].concat(
      data.kpiTrend.map(function (t) { return [t.kpi, t.current, t.previous, t.trend]; })
    )
  );
  styleTableHeaderRow_(trendTable);

  body.appendParagraph("Section 3: Major Asset Condition Register").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const conditionTable = body.appendTable(
    [["Asset Group", "Status"]].concat(data.assetCondition.map(function (h) { return [h.category, h.status]; }))
  );
  styleTableHeaderRow_(conditionTable);

  body.appendParagraph("Section 4: Major Projects Completed").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  appendBulletsOrPlaceholder_(body, data.majorProjectsCompleted, "No maintenance jobs closed this quarter.");

  body.appendParagraph("Section 5: Major Risks").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (!data.hasReviews) {
    body.appendParagraph("No Periodic Review forms were submitted for " + period + " — add risks manually.").setItalic(true);
  } else {
    appendBulletsOrPlaceholder_(body, data.majorRisks, "(Reviews submitted had no summary text.)");
  }

  body.appendParagraph("Section 6: Recommendations").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (!data.hasReviews) {
    body.appendParagraph("No recommendations captured for " + period + " — add manually.").setItalic(true);
  } else {
    appendBulletsOrPlaceholder_(body, data.recommendations, "(No recommendations submitted.)");
  }

  doc.saveAndClose();
  return doc;
}

// =========================================================================
// 6. END OF YEAR STATUS REPORT (EOSRP)
// =========================================================================

function generateEOSRP() {
  const ui = SpreadsheetApp.getUi();
  const yearResponse = ui.prompt("Generate EOSRP", "Enter the year, as YYYY (e.g. 2026):", ui.ButtonSet.OK_CANCEL);
  if (yearResponse.getSelectedButton() !== ui.Button.OK) return;
  const facilityResponse = ui.prompt("Generate EOSRP", "Enter the Facility ID this report covers (e.g. FAC-0001):", ui.ButtonSet.OK_CANCEL);
  if (facilityResponse.getSelectedButton() !== ui.Button.OK) return;

  const yearStr = yearResponse.getResponseText().trim();
  const facilityId = facilityResponse.getResponseText().trim();
  let range;
  try {
    range = parseYearRange_(yearStr);
  } catch (err) {
    ui.alert("Couldn't parse '" + yearStr + "' — please use YYYY, e.g. 2026.");
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = computeEOSRPData_(ss, yearStr, facilityId, range);
  const doc = buildEOSRPDoc_(data, yearStr, facilityId);
  ui.alert("EOSRP generated:\n" + doc.getUrl());
}

/** Parses "YYYY" into {start, end} covering the calendar year. */
function parseYearRange_(yearStr) {
  const match = /^(\d{4})$/.exec(yearStr);
  if (!match) throw new Error("Invalid year: " + yearStr);
  const year = parseInt(match[1], 10);
  return { start: new Date(year, 0, 1), end: new Date(year, 11, 31) };
}

function computeEOSRPData_(ss, yearStr, facilityId, range) {
  const maintenance = sheetToObjects_(getRequiredSheet_(ss, "MAINTENANCE"));
  const assets = sheetToObjects_(getRequiredSheet_(ss, "ASSETS")).filter(function (a) { return a["Facility ID"] === facilityId; });
  const cleaning = sheetToObjects_(getRequiredSheet_(ss, "CLEANING"));
  const reviews = sheetToObjects_(getRequiredSheet_(ss, "PERIODIC REVIEWS")).filter(function (r) { return r["Facility ID"] === facilityId; });
  const contracts = sheetToObjects_(getRequiredSheet_(ss, "CONTRACTS")).filter(function (c) { return c["Facility ID"] === facilityId; });

  // If a facility has multiple contracts on file, use the most recently started one.
  const contract = contracts.sort(function (a, b) { return new Date(b["Start Date"]) - new Date(a["Start Date"]); })[0] || null;

  const annualKpis = computeKpiDashboard_(maintenance.filter(function (m) { return m["Facility ID"] === facilityId; }), cleaning, assets, range.start, range.end);

  // "Major Achievements" and "Challenges Encountered" both draw from the
  // same Periodic Review summary text for the year — the review form
  // doesn't currently distinguish which is which, so both sections pull
  // the same source and a human sorts out the framing. Lessons Learned
  // has no structured source at all and is always left as a placeholder.
  const yearReviews = reviews.filter(function (r) { return String(r["Period"]).indexOf(yearStr) === 0; });
  const summaries = yearReviews.filter(function (r) { return r["Summary"]; }).map(function (r) { return "[" + r["Review Type"] + "] " + r["Summary"]; });
  const recommendations = yearReviews.filter(function (r) { return r["Recommendations"]; }).map(function (r) { return "[" + r["Review Type"] + "] " + r["Recommendations"]; });

  return {
    facilityId: facilityId,
    contract: contract,
    annualKpis: annualKpis,
    assetHealth: computeAssetHealthSummary_(assets, maintenance.filter(function (m) { return m["Facility ID"] === facilityId; })),
    achievements: summaries,
    challenges: summaries, // same source, see note above
    recommendations: recommendations,
    hasReviews: yearReviews.length > 0
  };
}

function buildEOSRPDoc_(data, yearStr, facilityId) {
  const doc = DocumentApp.create("Facility Management EOSRP - " + facilityId + " - " + yearStr);
  const body = doc.getBody();

  body.appendParagraph("FACILITY MANAGEMENT END OF YEAR STATUS REPORT").setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph("Year: " + yearStr + "    Facility: " + facilityId);
  body.appendParagraph("Generated: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"));

  body.appendParagraph("1. Contract Overview").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (!data.contract) {
    body.appendParagraph("No contract on file for " + facilityId + " — add manually.").setItalic(true);
  } else {
    body.appendParagraph("Scope: " + (data.contract["Scope Summary"] || "(not on file)"));
    body.appendParagraph("Contract Value: " + (data.contract["Contract Value (NGN)"] || "(not on file)"));
    body.appendParagraph("Coverage: " + data.contract["Start Date"] + " to " + data.contract["End Date"]);
  }

  body.appendParagraph("2. Annual Performance Summary").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const kpiTable = body.appendTable(
    [["KPI", "Target", "Annual Actual"]].concat(data.annualKpis.map(function (k) { return [k.kpi, k.target, k.actual]; }))
  );
  styleTableHeaderRow_(kpiTable);

  body.appendParagraph("3. Major Achievements").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  if (!data.hasReviews) {
    body.appendParagraph("No Periodic Reviews on file for " + yearStr + " — add manually.").setItalic(true);
  } else {
    appendBulletsOrPlaceholder_(body, data.achievements, "(No summaries submitted.)");
  }

  body.appendParagraph("4. Asset Health Assessment").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  const healthTable = body.appendTable(
    [["Asset Category", "Status"]].concat(data.assetHealth.map(function (h) { return [h.category, h.status]; }))
  );
  styleTableHeaderRow_(healthTable);

  body.appendParagraph("5. Challenges Encountered (operational & strategic)").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  appendBulletsOrPlaceholder_(body, data.challenges, "No challenges logged via Periodic Reviews this year — add manually.");

  body.appendParagraph("6. Lessons Learned").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph("(No structured source for this yet — add manually. Consider adding a dedicated field to the Periodic Review form if this is needed every year.)").setItalic(true);

  body.appendParagraph("7. Recommendation").setHeading(DocumentApp.ParagraphHeading.HEADING1);
  appendBulletsOrPlaceholder_(body, data.recommendations, "No recommendations captured — add manually.");

  doc.saveAndClose();
  return doc;
}

// =========================================================================
// 7. SHARED
// =========================================================================

function appendBulletsOrPlaceholder_(body, items, placeholderText) {
  if (!items || items.length === 0) {
    body.appendParagraph(placeholderText).setItalic(true);
  } else {
    items.forEach(function (item) { body.appendListItem(item).setGlyphType(DocumentApp.GlyphType.BULLET); });
  }
}