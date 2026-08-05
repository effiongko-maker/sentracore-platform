/**
 * AssetRepository.gs
 *
 * Sheet: Assets
 * Canonical columns (row 1 — preferred):
 *   id | assetTag | name | category | facility | manufacturer | model |
 *   serialNumber | purchaseDate | warrantyExpiry | condition | status |
 *   assignedTo | criticality | description | createdAt | updatedAt
 *
 * Also accepts legacy display headers (e.g. "Asset ID", "Facility ID").
 * Soft-deactivate only — never delete rows.
 */

var AssetRepository = (function () {
  var SHEET_NAME = "Assets";
  var HEADERS = [
    "id",
    "assetTag",
    "name",
    "category",
    "facility",
    "manufacturer",
    "model",
    "serialNumber",
    "purchaseDate",
    "warrantyExpiry",
    "condition",
    "status",
    "assignedTo",
    "criticality",
    "description",
    "createdAt",
    "updatedAt",
  ];

  /** Map legacy / display headers → canonical camelCase keys. */
  var HEADER_ALIASES = {
    "Asset ID": "id",
    Id: "id",
    ID: "id",
    "Asset Tag": "assetTag",
    Tag: "assetTag",
    "Asset Name": "name",
    Name: "name",
    Category: "category",
    "Facility ID": "facility",
    Facility: "facility",
    Manufacturer: "manufacturer",
    Model: "model",
    "Serial Number": "serialNumber",
    "Install Date": "purchaseDate",
    "Purchase Date": "purchaseDate",
    "Warranty Expiry": "warrantyExpiry",
    Condition: "condition",
    Status: "status",
    "Assigned To": "assignedTo",
    "OEM ID": "assignedTo",
    Criticality: "criticality",
    Description: "description",
    "Created At": "createdAt",
    "Updated At": "updatedAt",
  };

  function canonicalKey_(header) {
    var raw = String(header == null ? "" : header).trim();
    if (!raw) return "";
    if (HEADER_ALIASES[raw]) return HEADER_ALIASES[raw];
    return raw;
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
    return sheet;
  }

  function sheetHeaders_(sheet) {
    var lastCol = Math.max(sheet.getLastColumn(), HEADERS.length);
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var normalized = [];
    var i;
    for (i = 0; i < headers.length; i++) {
      normalized.push(String(headers[i] == null ? "" : headers[i]).trim());
    }
    // Empty brand-new sheet edge case
    if (!normalized[0]) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      return HEADERS.slice();
    }
    return normalized;
  }

  function rowToObject_(headers, row) {
    var obj = {};
    var i;
    for (i = 0; i < headers.length; i++) {
      var key = canonicalKey_(headers[i]);
      if (!key) continue;
      // Prefer first non-empty mapping if aliases collide
      if (obj[key] == null || obj[key] === "") {
        obj[key] = row[i];
      }
    }
    return obj;
  }

  function rowId_(row) {
    if (!row) return "";
    return String(row.id || row["Asset ID"] || "").trim();
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    var r;
    for (r = 1; r < values.length; r++) {
      rows.push(rowToObject_(headers, values[r]));
    }
    return rows;
  }

  function getById(id) {
    var all = getAll();
    var i;
    for (i = 0; i < all.length; i++) {
      if (rowId_(all[i]) === String(id)) return all[i];
    }
    return null;
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    var i;
    for (i = 0; i < all.length; i++) {
      var match = String(rowId_(all[i]) || "").match(/AST-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "AST-" + padded;
  }

  /**
   * Human-friendly asset number. Uses facility code when available:
   * AST-{FACILITYCODE}-{####}. Falls back to system id.
   */
  function nextAssetTag_(id, facility) {
    var seqMatch = String(id || "").match(/AST-(\d+)/i);
    var seq = seqMatch ? seqMatch[1] : ("0000" + String(Date.now()).slice(-4)).slice(-4);
    var facilityKey = String(facility || "").trim();
    var facilityCode = "";

    if (facilityKey && typeof FacilityRepository !== "undefined") {
      try {
        var facilities = FacilityRepository.getAll();
        var i;
        for (i = 0; i < facilities.length; i++) {
          var f = facilities[i];
          if (
            String(f.id) === facilityKey ||
            String(f.name) === facilityKey ||
            String(f.code) === facilityKey
          ) {
            facilityCode = String(f.code || f.id || "")
              .trim()
              .toUpperCase()
              .replace(/[^A-Z0-9]+/g, "");
            break;
          }
        }
      } catch (ignore) {}
    }

    if (!facilityCode && facilityKey) {
      facilityCode = facilityKey
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 8);
    }

    if (facilityCode) {
      return "AST-" + facilityCode.slice(0, 8) + "-" + seq;
    }
    return id;
  }

  function buildRecord_(id, payload, createdAt, updatedAt) {
    var suppliedTag = String((payload && payload.assetTag) || "").trim();
    return {
      id: id,
      assetTag: suppliedTag || nextAssetTag_(id, payload && payload.facility),
      name: (payload && payload.name) || "",
      category: (payload && payload.category) || "other",
      facility: (payload && payload.facility) || "",
      manufacturer: (payload && payload.manufacturer) || "",
      model: (payload && payload.model) || "",
      serialNumber: (payload && payload.serialNumber) || "",
      purchaseDate: (payload && payload.purchaseDate) || "",
      warrantyExpiry: (payload && payload.warrantyExpiry) || "",
      condition: (payload && payload.condition) || "good",
      status: (payload && payload.status) || "pending",
      assignedTo: (payload && payload.assignedTo) || "",
      criticality: (payload && payload.criticality) || "medium",
      description: (payload && payload.description) || "",
      createdAt: createdAt,
      updatedAt: updatedAt,
    };
  }

  function recordToRow_(headers, record) {
    var row = [];
    var i;
    for (i = 0; i < headers.length; i++) {
      var key = canonicalKey_(headers[i]);
      row.push(key && record[key] != null ? record[key] : "");
    }
    return row;
  }

  function create(payload) {
    var sheet = getSheet_();
    var headers = sheetHeaders_(sheet);
    var now = new Date().toISOString();
    var id = nextId_();
    var record = buildRecord_(id, payload || {}, now, now);
    sheet.appendRow(recordToRow_(headers, record));

    // Prefer sheet re-read; fall back to in-memory record so create never returns null.
    var found = getById(id);
    return found || record;
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var idCol = -1;
    var c;
    for (c = 0; c < headers.length; c++) {
      if (canonicalKey_(headers[c]) === "id") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return null;

    var rowIndex = -1;
    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1; // 1-based
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(id) || buildRecord_(id, {}, "", "");
    var updated = buildRecord_(
      id,
      {
        // Asset number is immutable after create.
        assetTag: current.assetTag || id,
        name: payload.name != null ? payload.name : current.name,
        category:
          payload.category != null ? payload.category : current.category,
        facility:
          payload.facility != null ? payload.facility : current.facility,
        manufacturer:
          payload.manufacturer != null
            ? payload.manufacturer
            : current.manufacturer,
        model: payload.model != null ? payload.model : current.model,
        serialNumber:
          payload.serialNumber != null
            ? payload.serialNumber
            : current.serialNumber,
        purchaseDate:
          payload.purchaseDate != null
            ? payload.purchaseDate
            : current.purchaseDate,
        warrantyExpiry:
          payload.warrantyExpiry != null
            ? payload.warrantyExpiry
            : current.warrantyExpiry,
        condition:
          payload.condition != null ? payload.condition : current.condition,
        status: payload.status != null ? payload.status : current.status,
        assignedTo:
          payload.assignedTo != null ? payload.assignedTo : current.assignedTo,
        criticality:
          payload.criticality != null
            ? payload.criticality
            : current.criticality,
        description:
          payload.description != null
            ? payload.description
            : current.description,
      },
      current.createdAt || new Date().toISOString(),
      new Date().toISOString()
    );

    sheet
      .getRange(rowIndex, 1, 1, headers.length)
      .setValues([recordToRow_(headers, updated)]);
    return updated;
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
