/**
 * ReportingSnapshotRepository.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER (Sheets-backed).
 * ---------------------------------------------------------------------------
 * Stores a pre-aggregated ReportingSnapshot in the REPORTING_SNAPSHOT sheet so
 * Home / Dashboard / Reports can read KPIs + summary datasets without scanning
 * every domain sheet on each request.
 *
 * Google Sheets remains the system of record for domain entities.
 * This sheet is a derived cache and can later be replaced by a database-backed
 * repository without changing the application architecture
 * (DashboardService → ReportingService → Snapshot reader).
 *
 * Sheet: REPORTING_SNAPSHOT
 * Columns:
 *   section | scope | chunk | json | updatedAt | version
 *
 * Sections: meta | users | facilities | assets | incidents | maintenance |
 *           workOrders | kpis | projections | health
 */

var ReportingSnapshotRepository = (function () {
  var SHEET_NAME = "REPORTING_SNAPSHOT";
  var SCOPE_PORTFOLIO = "__portfolio__";
  var MAX_CELL_CHARS = 40000;
  var HEADERS = ["section", "scope", "chunk", "json", "updatedAt", "version"];

  var SECTIONS = [
    "meta",
    "users",
    "facilities",
    "assets",
    "incidents",
    "maintenance",
    "workOrders",
    "kpis",
    "projections",
    "health",
  ];

  /** Fully assembled portfolio snapshot JSON (hot-path sheet read). */
  var SECTION_ASSEMBLED = "assembled";

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  function chunkJson_(value) {
    var text = JSON.stringify(value == null ? null : value);
    var chunks = [];
    if (!text.length) {
      chunks.push("");
      return chunks;
    }
    for (var i = 0; i < text.length; i += MAX_CELL_CHARS) {
      chunks.push(text.substring(i, i + MAX_CELL_CHARS));
    }
    return chunks;
  }

  function deleteSectionRows_(sheet, section, scope) {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    // Delete from bottom to top to keep indices stable.
    for (var i = values.length - 1; i >= 0; i--) {
      if (
        String(values[i][0]) === section &&
        String(values[i][1]) === scope
      ) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  function writeSection(section, data, version, scope) {
    scope = scope || SCOPE_PORTFOLIO;
    version = version || Date.now();
    var sheet = getSheet_();
    deleteSectionRows_(sheet, section, scope);

    var chunks = chunkJson_(data);
    var updatedAt = new Date().toISOString();
    var rows = [];
    for (var i = 0; i < chunks.length; i++) {
      rows.push([section, scope, i, chunks[i], updatedAt, version]);
    }
    if (!rows.length) return;
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
      .setValues(rows);
  }

  function parseChunks_(parts) {
    if (!parts || !parts.length) return null;
    parts.sort(function (a, b) {
      return a.chunk - b.chunk;
    });
    var text = parts
      .map(function (p) {
        return p.json;
      })
      .join("");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] Failed to parse chunked JSON: " + err);
      return null;
    }
  }

  function readSection(section, scope) {
    scope = scope || SCOPE_PORTFOLIO;
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    var parts = [];
    for (var i = 0; i < values.length; i++) {
      if (
        String(values[i][0]) === section &&
        String(values[i][1]) === scope
      ) {
        parts.push({
          chunk: Number(values[i][2] || 0),
          json: String(values[i][3] || ""),
        });
      }
    }
    return parseChunks_(parts);
  }

  function writeFull(snapshotParts, version) {
    version = version || Date.now();
    var scope = SCOPE_PORTFOLIO;
    for (var i = 0; i < SECTIONS.length; i++) {
      var section = SECTIONS[i];
      writeSection(section, snapshotParts[section], version, scope);
    }
    return version;
  }

  /**
   * Single sheet scan — avoids N× getValues() when loading all sections.
   */
  function readFull(scope) {
    scope = scope || SCOPE_PORTFOLIO;
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    var bySection = {};
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][1]) !== scope) continue;
      var section = String(values[i][0] || "");
      if (!section || section === SECTION_ASSEMBLED) continue;
      if (!bySection[section]) bySection[section] = [];
      bySection[section].push({
        chunk: Number(values[i][2] || 0),
        json: String(values[i][3] || ""),
      });
    }

    var meta = parseChunks_(bySection.meta);
    if (!meta) return null;

    return {
      meta: meta,
      users: parseChunks_(bySection.users) || [],
      facilities: parseChunks_(bySection.facilities) || [],
      assets: parseChunks_(bySection.assets) || [],
      incidents: parseChunks_(bySection.incidents) || [],
      maintenance: parseChunks_(bySection.maintenance) || [],
      workOrders: parseChunks_(bySection.workOrders) || [],
      kpis: parseChunks_(bySection.kpis),
      projections: parseChunks_(bySection.projections),
      health: parseChunks_(bySection.health),
    };
  }

  function writeAssembled(snapshot, version, scope) {
    writeSection(SECTION_ASSEMBLED, snapshot, version, scope || SCOPE_PORTFOLIO);
  }

  function readAssembled(scope) {
    return readSection(SECTION_ASSEMBLED, scope || SCOPE_PORTFOLIO);
  }

  function clearAll() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow, HEADERS.length).clearContent();
    }
  }

  return {
    SCOPE_PORTFOLIO: SCOPE_PORTFOLIO,
    SECTION_ASSEMBLED: SECTION_ASSEMBLED,
    SECTIONS: SECTIONS,
    getSheet_: getSheet_,
    writeSection: writeSection,
    readSection: readSection,
    writeFull: writeFull,
    readFull: readFull,
    writeAssembled: writeAssembled,
    readAssembled: readAssembled,
    clearAll: clearAll,
  };
})();
