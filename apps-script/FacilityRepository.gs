/**
 * FacilityRepository.gs
 *
 * Sheet: Facilities
 * Columns (row 1 headers — exact order):
 *   id | name | code | location | type | manager | status | description | createdAt | updatedAt
 *
 * Mirrors UserRepository pattern. Soft-deactivate only — never delete rows.
 */

var FacilityRepository = (function () {
  var SHEET_NAME = "Facilities";
  var HEADERS = [
    "id",
    "name",
    "code",
    "location",
    "type",
    "manager",
    "status",
    "description",
    "createdAt",
    "updatedAt",
  ];

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
    return sheet;
  }

  function rowToObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      rows.push(rowToObject_(headers, values[r]));
    }
    return rows;
  }

  function getById(id) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/FAC-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "FAC-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    // Human-friendly display code — auto-assigned, immutable after create.
    var code = String((payload && payload.code) || "").trim();
    if (!code) code = id;
    var row = [
      id,
      payload.name || "",
      code,
      payload.location || "",
      payload.type || "office",
      payload.manager || "",
      payload.status || "pending",
      payload.description || "",
      now,
      now,
    ];
    sheet.appendRow(row);
    return getById(id) || {
      id: id,
      name: payload.name || "",
      code: code,
      location: payload.location || "",
      type: payload.type || "office",
      manager: payload.manager || "",
      status: payload.status || "pending",
      description: payload.description || "",
      createdAt: now,
      updatedAt: now,
    };
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var idCol = headers.indexOf("id");
    var rowIndex = -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1; // 1-based
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(id);
    var updated = {
      id: id,
      name: payload.name != null ? payload.name : current.name,
      // Identifiers are immutable after create.
      code: current.code || id,
      location: payload.location != null ? payload.location : current.location,
      type: payload.type != null ? payload.type : current.type,
      manager: payload.manager != null ? payload.manager : current.manager,
      status: payload.status != null ? payload.status : current.status,
      description:
        payload.description != null ? payload.description : current.description,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    var row = HEADERS.map(function (key) {
      return updated[key] != null ? updated[key] : "";
    });
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
    return updated;
  }

  function deactivate(id) {
    return update(id, { status: "inactive" });
  }

  /** WO filter dropdown — id/name only. */
  function listFilterCatalog() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return [];
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMap = {};
    var h;
    for (h = 0; h < headers.length; h++) {
      headerMap[String(headers[h]).trim()] = h;
    }

    function col1Based(names) {
      var n;
      for (n = 0; n < names.length; n++) {
        if (headerMap[names[n]] !== undefined) return headerMap[names[n]] + 1;
      }
      return -1;
    }

    var idCol = col1Based(["id", "Facility ID"]);
    var nameCol = col1Based(["name", "Facility Name"]);
    if (idCol < 1 || nameCol < 1) return [];

    var idValues = sheet.getRange(2, idCol, lastRow, idCol).getValues();
    var nameValues = sheet.getRange(2, nameCol, lastRow, nameCol).getValues();
    var rows = [];
    var r;
    for (r = 0; r < idValues.length; r++) {
      var id = SheetFieldUtils.cellText(idValues[r][0]);
      if (!id) continue;
      var name = SheetFieldUtils.cellText(nameValues[r][0]) || id;
      rows.push({ id: id, name: name });
    }
    rows.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    return rows;
  }

  return {
    getAll: getAll,
    getById: getById,
    listFilterCatalog: listFilterCatalog,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
