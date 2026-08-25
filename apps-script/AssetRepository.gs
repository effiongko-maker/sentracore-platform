/**
 * AssetRepository.gs
 *
 * Sheet: Assets
 *
 * Canonical header row (columns A:N — exact order, do not reorder):
 *   Asset ID | Facility | Asset Name | Category | Manufacturer | Model |
 *   Serial Number | Install Date | Warranty Expiry | OEM ID | Condition |
 *   Status | Assigned To | Criticality
 *
 * Reads and writes by exact header name only — never by column index.
 * Facility stores the display value exactly as written (e.g. "NCC Annex").
 */

var AssetRepository = (function () {
  var SHEET_NAME = "Assets";

  var CANONICAL_HEADERS = [
    "Asset ID",
    "Facility",
    "Asset Name",
    "Category",
    "Manufacturer",
    "Model",
    "Serial Number",
    "Install Date",
    "Warranty Expiry",
    "OEM ID",
    "Condition",
    "Status",
    "Assigned To",
    "Criticality",
  ];

  /** Canonical API field → exact sheet header. */
  var FIELD_TO_HEADER = {
    id: "Asset ID",
    facility: "Facility",
    name: "Asset Name",
    category: "Category",
    manufacturer: "Manufacturer",
    model: "Model",
    serialNumber: "Serial Number",
    installDate: "Install Date",
    warrantyExpiry: "Warranty Expiry",
    oemId: "OEM ID",
    condition: "Condition",
    status: "Status",
    assignedTo: "Assigned To",
    criticality: "Criticality",
  };

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet
        .getRange(1, 1, 1, CANONICAL_HEADERS.length)
        .setValues([CANONICAL_HEADERS]);
    }
    return sheet;
  }

  function headerMap_(sheet) {
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  function readHeader_(sheetRow, header) {
    return SheetFieldUtils.cellText(sheetRow[header]);
  }

  function toCanonical_(sheetRow) {
    return {
      id: readHeader_(sheetRow, FIELD_TO_HEADER.id),
      facility: readHeader_(sheetRow, FIELD_TO_HEADER.facility),
      name: readHeader_(sheetRow, FIELD_TO_HEADER.name),
      category: readHeader_(sheetRow, FIELD_TO_HEADER.category) || "other",
      manufacturer: readHeader_(sheetRow, FIELD_TO_HEADER.manufacturer),
      model: readHeader_(sheetRow, FIELD_TO_HEADER.model),
      serialNumber: readHeader_(sheetRow, FIELD_TO_HEADER.serialNumber),
      installDate: readHeader_(sheetRow, FIELD_TO_HEADER.installDate),
      warrantyExpiry: readHeader_(sheetRow, FIELD_TO_HEADER.warrantyExpiry),
      oemId: readHeader_(sheetRow, FIELD_TO_HEADER.oemId),
      condition: readHeader_(sheetRow, FIELD_TO_HEADER.condition) || "good",
      status: readHeader_(sheetRow, FIELD_TO_HEADER.status) || "pending",
      assignedTo: readHeader_(sheetRow, FIELD_TO_HEADER.assignedTo),
      criticality:
        readHeader_(sheetRow, FIELD_TO_HEADER.criticality) || "unassessed",
    };
  }

  function canonicalToSheetFields_(canonical, headerMap) {
    var fields = {};
    var fieldKey;
    for (fieldKey in FIELD_TO_HEADER) {
      if (!FIELD_TO_HEADER.hasOwnProperty(fieldKey)) continue;
      var header = FIELD_TO_HEADER[fieldKey];
      if (headerMap[header] === undefined) continue;
      var value = canonical[fieldKey];
      fields[header] = value == null ? "" : value;
    }
    return fields;
  }

  /**
   * Overlay known fields onto the existing row so values never shift columns.
   */
  function writeCanonical_(sheet, rowIndex, canonical) {
    var headerMap = headerMap_(sheet);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var existing = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
    var row = existing.slice();
    var fields = canonicalToSheetFields_(canonical, headerMap);
    var header;
    for (header in fields) {
      if (!fields.hasOwnProperty(header)) continue;
      if (headerMap[header] === undefined) continue;
      row[headerMap[header]] = fields[header];
    }
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);
    return fields;
  }

  function ensureHeaders_(sheet) {
    var headerMap = headerMap_(sheet);
    if (headerMap[FIELD_TO_HEADER.id] !== undefined) return headerMap;
    sheet.clear();
    sheet
      .getRange(1, 1, 1, CANONICAL_HEADERS.length)
      .setValues([CANONICAL_HEADERS]);
    return headerMap_(sheet);
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    var i;
    for (i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/AST-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    return "AST-" + ("0000" + next).slice(-4);
  }

  function buildCanonical_(id, payload, current) {
    payload = payload || {};
    current = current || {};
    return {
      id: id,
      facility:
        payload.facility != null ? payload.facility : current.facility || "",
      name: payload.name != null ? payload.name : current.name || "",
      category:
        payload.category != null ? payload.category : current.category || "other",
      manufacturer:
        payload.manufacturer != null
          ? payload.manufacturer
          : current.manufacturer || "",
      model: payload.model != null ? payload.model : current.model || "",
      serialNumber:
        payload.serialNumber != null
          ? payload.serialNumber
          : current.serialNumber || "",
      installDate:
        payload.installDate != null
          ? payload.installDate
          : current.installDate || "",
      warrantyExpiry:
        payload.warrantyExpiry != null
          ? payload.warrantyExpiry
          : current.warrantyExpiry || "",
      oemId: payload.oemId != null ? payload.oemId : current.oemId || "",
      condition:
        payload.condition != null ? payload.condition : current.condition || "good",
      status:
        payload.status != null ? payload.status : current.status || "pending",
      assignedTo:
        payload.assignedTo != null
          ? payload.assignedTo
          : current.assignedTo || "",
      criticality:
        payload.criticality != null
          ? payload.criticality
          : current.criticality || "unassessed",
    };
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    var r;
    for (r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var canonical = toCanonical_(sheetRow);
      if (!canonical.id) continue;
      rows.push(canonical);
    }
    return rows;
  }

  function getById(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    if (headerMap[idHeader] === undefined) return null;
    var idCol = headerMap[idHeader];

    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(id)) continue;
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      return toCanonical_(sheetRow);
    }
    return null;
  }

  function create(payload) {
    var sheet = getSheet_();
    ensureHeaders_(sheet);
    var id = nextId_();
    var record = buildCanonical_(id, payload || {}, null);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var blank = [];
    var b;
    for (b = 0; b < lastCol; b++) blank.push("");
    sheet.appendRow(blank);
    var rowIndex = sheet.getLastRow();
    writeCanonical_(sheet, rowIndex, record);
    SpreadsheetApp.flush();
    return getById(id) || record;
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    if (headerMap[idHeader] === undefined) return null;
    var idCol = headerMap[idHeader];

    var rowIndex = -1;
    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1;
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(id);
    if (!current) return null;

    var merged = buildCanonical_(id, payload || {}, current);
    writeCanonical_(sheet, rowIndex, merged);
    SpreadsheetApp.flush();
    return getById(id) || merged;
  }

  function deactivate(id) {
    return update(id, { status: "inactive" });
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
