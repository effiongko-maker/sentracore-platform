/**
 * ConsumablesUpdateRepository.gs
 *
 * Sheet: ConsumablesUpdates
 * Columns (row 1 headers — exact order):
 *   id | itemId | date | facilityId | itemName | opening | received | issued |
 *   closing | reorderLevel | createdAt | updatedAt | createdByUserId | updatedByUserId
 *
 * Mirrors DieselUsageRepository pattern. Soft rows only — never delete.
 * Closing is stored but always recalculated by ConsumablesUpdateService.
 */

var ConsumablesUpdateRepository = (function () {
  var SHEET_NAME = "ConsumablesUpdates";
  var HEADERS = [
    "id",
    "itemId",
    "date",
    "facilityId",
    "itemName",
    "opening",
    "received",
    "issued",
    "closing",
    "reorderLevel",
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

  function cellOptionalNumber_(value) {
    if (value == null || value === "") return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
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
      if (key === "opening" || key === "issued" || key === "closing") {
        obj[key] = cellNumber_(raw);
      } else if (key === "received" || key === "reorderLevel") {
        obj[key] = cellOptionalNumber_(raw);
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

  function nextId_(prefix, pattern) {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(pattern);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return prefix + padded;
  }

  function nextEntryId_() {
    return nextId_("CNUP-", /CNUP-(\d+)/i);
  }

  function nextItemId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].itemId || "").match(/ITEM-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "ITEM-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextEntryId_();
    var received =
      payload.received != null && payload.received !== ""
        ? payload.received
        : "";
    var reorderLevel =
      payload.reorderLevel != null && payload.reorderLevel !== ""
        ? payload.reorderLevel
        : "";
    var row = [
      id,
      payload.itemId || "",
      payload.date || "",
      payload.facilityId || "",
      payload.itemName || "",
      payload.opening != null ? payload.opening : 0,
      received,
      payload.issued != null ? payload.issued : 0,
      payload.closing != null ? payload.closing : 0,
      reorderLevel,
      now,
      now,
      payload.createdByUserId || "",
      payload.updatedByUserId || payload.createdByUserId || "",
    ];
    sheet.appendRow(row);
    return (
      getById(id) || {
        id: id,
        itemId: payload.itemId || "",
        date: payload.date || "",
        facilityId: payload.facilityId || "",
        itemName: payload.itemName || "",
        opening: payload.opening != null ? payload.opening : 0,
        received: received === "" ? null : received,
        issued: payload.issued != null ? payload.issued : 0,
        closing: payload.closing != null ? payload.closing : 0,
        reorderLevel: reorderLevel === "" ? null : reorderLevel,
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

    function optionalNum(field, currentValue) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) {
        return currentValue;
      }
      if (payload[field] == null || payload[field] === "") return null;
      return payload[field];
    }

    var updated = {
      id: id,
      itemId: payload.itemId != null ? payload.itemId : current.itemId,
      date: payload.date != null ? payload.date : current.date,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      itemName:
        payload.itemName != null ? payload.itemName : current.itemName,
      opening: payload.opening != null ? payload.opening : current.opening,
      received: optionalNum("received", current.received),
      issued: payload.issued != null ? payload.issued : current.issued,
      closing: payload.closing != null ? payload.closing : current.closing,
      reorderLevel: optionalNum("reorderLevel", current.reorderLevel),
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      createdByUserId: current.createdByUserId || "",
      updatedByUserId:
        payload.updatedByUserId != null
          ? payload.updatedByUserId
          : current.updatedByUserId || "",
    };

    var row = HEADERS.map(function (key) {
      if (key === "received" || key === "reorderLevel") {
        return updated[key] != null ? updated[key] : "";
      }
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
    nextItemId_: nextItemId_,
  };
})();
