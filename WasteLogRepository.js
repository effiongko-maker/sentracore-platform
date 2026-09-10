/**
 * WasteLogRepository.gs
 *
 * Sheet: WasteLogs
 * Columns (row 1 headers — exact order):
 *   id | date | facilityId | wasteType | quantity | unit | disposalMethod |
 *   remarks | createdAt | updatedAt | createdByUserId | updatedByUserId
 *
 * Mirrors EnergyReadingRepository pattern. Soft rows only — never delete.
 * IDs: WLOG-####
 */

var WasteLogRepository = (function () {
  var SHEET_NAME = "WasteLogs";
  var HEADERS = [
    "id",
    "date",
    "facilityId",
    "wasteType",
    "quantity",
    "unit",
    "disposalMethod",
    "remarks",
    "createdAt",
    "updatedAt",
    "createdByUserId",
    "updatedByUserId",
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

  function cellText_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      if (!isFinite(value.getTime())) return "";
      return value.toISOString();
    }
    return String(value);
  }

  function cellNumber_(value) {
    if (value == null || value === "") return 0;
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function cellDate_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      if (!isFinite(value.getTime())) return "";
      var y = value.getFullYear();
      var m = ("0" + (value.getMonth() + 1)).slice(-2);
      var d = ("0" + value.getDate()).slice(-2);
      return y + "-" + m + "-" + d;
    }
    var text = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    var parsed = Date.parse(text);
    if (!isFinite(parsed)) return text;
    var dt = new Date(parsed);
    var yy = dt.getUTCFullYear();
    var mm = ("0" + (dt.getUTCMonth() + 1)).slice(-2);
    var dd = ("0" + dt.getUTCDate()).slice(-2);
    return yy + "-" + mm + "-" + dd;
  }

  function rowToObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      var key = headers[i];
      var raw = row[i];
      if (key === "quantity") {
        obj[key] = cellNumber_(raw);
      } else if (key === "date") {
        obj[key] = cellDate_(raw);
      } else {
        obj[key] = cellText_(raw);
      }
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
      var match = String(all[i].id || "").match(/WLOG-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "WLOG-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var row = [
      id,
      payload.date || "",
      payload.facilityId || "",
      payload.wasteType || "",
      payload.quantity != null ? payload.quantity : 0,
      payload.unit || "",
      payload.disposalMethod || "",
      payload.remarks || "",
      now,
      now,
      payload.createdByUserId || "",
      payload.updatedByUserId || payload.createdByUserId || "",
    ];
    sheet.appendRow(row);
    return (
      getById(id) || {
        id: id,
        date: payload.date || "",
        facilityId: payload.facilityId || "",
        wasteType: payload.wasteType || "",
        quantity: payload.quantity != null ? payload.quantity : 0,
        unit: payload.unit || "",
        disposalMethod: payload.disposalMethod || "",
        remarks: payload.remarks || "",
        createdAt: now,
        updatedAt: now,
        createdByUserId: payload.createdByUserId || "",
        updatedByUserId:
          payload.updatedByUserId || payload.createdByUserId || "",
      }
    );
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
        rowIndex = r + 1;
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(id);
    var updated = {
      id: id,
      date: payload.date != null ? payload.date : current.date,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      wasteType:
        payload.wasteType != null ? payload.wasteType : current.wasteType,
      quantity:
        payload.quantity != null ? payload.quantity : current.quantity,
      unit: payload.unit != null ? payload.unit : current.unit,
      disposalMethod:
        payload.disposalMethod != null
          ? payload.disposalMethod
          : current.disposalMethod,
      remarks: payload.remarks != null ? payload.remarks : current.remarks,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      createdByUserId: current.createdByUserId || "",
      updatedByUserId:
        payload.updatedByUserId != null
          ? payload.updatedByUserId
          : current.updatedByUserId || "",
    };

    var row = HEADERS.map(function (key) {
      return updated[key] != null ? updated[key] : "";
    });
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
