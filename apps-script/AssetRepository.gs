/**
 * AssetRepository.gs
 *
 * Sheet: Assets
 * Columns (row 1 headers — exact order):
 *   id | assetTag | name | category | facility | manufacturer | model |
 *   serialNumber | purchaseDate | warrantyExpiry | condition | status |
 *   assignedTo | criticality | description | createdAt | updatedAt
 *
 * Mirrors FacilityRepository pattern. Soft-deactivate only — never delete rows.
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
      var match = String(all[i].id || "").match(/AST-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "AST-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var row = [
      id,
      payload.assetTag || "",
      payload.name || "",
      payload.category || "other",
      payload.facility || "",
      payload.manufacturer || "",
      payload.model || "",
      payload.serialNumber || "",
      payload.purchaseDate || "",
      payload.warrantyExpiry || "",
      payload.condition || "good",
      payload.status || "pending",
      payload.assignedTo || "",
      payload.criticality || "medium",
      payload.description || "",
      now,
      now,
    ];
    sheet.appendRow(row);
    return getById(id);
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
      assetTag: payload.assetTag != null ? payload.assetTag : current.assetTag,
      name: payload.name != null ? payload.name : current.name,
      category: payload.category != null ? payload.category : current.category,
      facility: payload.facility != null ? payload.facility : current.facility,
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

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
