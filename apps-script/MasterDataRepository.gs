/**
 * MasterDataRepository.gs
 *
 * Sheet-backed repositories for master lookup entities:
 *   Departments | Buildings | Floors | Rooms | Vendors
 *
 * Soft-deactivate only — never delete rows.
 * Sheets are created with headers on first access.
 */

var MasterDataRepository = (function () {
  var ENTITIES = {
    departments: {
      sheetName: "Departments",
      idPrefix: "DEP",
      headers: [
        "id",
        "name",
        "code",
        "facilityId",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    buildings: {
      sheetName: "Buildings",
      idPrefix: "BLD",
      headers: [
        "id",
        "name",
        "code",
        "facilityId",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    floors: {
      sheetName: "Floors",
      idPrefix: "FLR",
      headers: [
        "id",
        "name",
        "code",
        "facilityId",
        "buildingId",
        "level",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    rooms: {
      sheetName: "Rooms",
      idPrefix: "RM",
      headers: [
        "id",
        "name",
        "code",
        "facilityId",
        "buildingId",
        "floorId",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    vendors: {
      sheetName: "Vendors",
      idPrefix: "VND",
      headers: [
        "id",
        "name",
        "code",
        "category",
        "contactName",
        "email",
        "phone",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
  };

  function getConfig_(entity) {
    var config = ENTITIES[entity];
    if (!config) throw new Error("Unknown master-data entity: " + entity);
    return config;
  }

  function getSheet_(config) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(config.sheetName);
      sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
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

  function getAll(entity) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      rows.push(rowToObject_(headers, values[r]));
    }
    return rows;
  }

  function getById(entity, id) {
    var all = getAll(entity);
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function nextId_(entity, config) {
    var all = getAll(entity);
    var max = 0;
    var pattern = new RegExp("^" + config.idPrefix + "-(\\d+)$", "i");
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(pattern);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return config.idPrefix + "-" + padded;
  }

  /**
   * Human-friendly code when the caller does not supply one.
   * Floors prefer level (e.g. L04); rooms prefer name when it looks like a room number.
   */
  function defaultCode_(entity, id, payload) {
    payload = payload || {};
    if (entity === "floors") {
      var level = String(payload.level || "").trim();
      if (level) {
        return /^[A-Za-z]/.test(level) ? level.toUpperCase() : "L" + level;
      }
    }
    if (entity === "rooms") {
      var roomName = String(payload.name || "").trim();
      if (roomName && /^[\d.A-Za-z-]{1,12}$/.test(roomName)) {
        return roomName;
      }
    }
    if (entity === "buildings") {
      var buildingName = String(payload.name || "").trim();
      if (buildingName && buildingName.length <= 8) {
        return buildingName.toUpperCase().replace(/\s+/g, "-");
      }
    }
    return id;
  }

  function create(entity, payload) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
    var now = new Date().toISOString();
    var id = nextId_(entity, config);
    payload = payload || {};

    var record = {};
    for (var i = 0; i < config.headers.length; i++) {
      var key = config.headers[i];
      if (key === "id") record.id = id;
      else if (key === "createdAt" || key === "updatedAt") record[key] = now;
      else if (key === "status") record.status = payload.status || "active";
      else if (key === "code") {
        var code = payload.code != null ? String(payload.code).trim() : "";
        record.code = code || defaultCode_(entity, id, payload);
      } else record[key] = payload[key] != null ? payload[key] : "";
    }

    var row = config.headers.map(function (key) {
      return record[key] != null ? record[key] : "";
    });
    sheet.appendRow(row);
    return getById(entity, id) || record;
  }

  function update(entity, id, payload) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
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

    var current = getById(entity, id);
    if (!current) return null;

    var updated = {};
    for (var i = 0; i < config.headers.length; i++) {
      var key = config.headers[i];
      if (key === "id") updated.id = id;
      else if (key === "createdAt") updated.createdAt = current.createdAt;
      else if (key === "updatedAt") updated.updatedAt = new Date().toISOString();
      else if (key === "code") {
        // Codes are immutable after create.
        updated.code = current.code || id;
      } else if (payload && payload[key] != null) updated[key] = payload[key];
      else updated[key] = current[key] != null ? current[key] : "";
    }

    var row = config.headers.map(function (key) {
      return updated[key] != null ? updated[key] : "";
    });
    sheet.getRange(rowIndex, 1, 1, config.headers.length).setValues([row]);
    return updated;
  }

  function deactivate(entity, id) {
    return update(entity, id, { status: "inactive" });
  }

  function listEntities() {
    return Object.keys(ENTITIES);
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
    listEntities: listEntities,
  };
})();
