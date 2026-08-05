/**
 * UserRepository.gs
 *
 * Sheet: existing Users sheet (source of truth — do not recreate).
 * Live headers (row 1), observed from production getAll:
 *   User ID | Full Name | Email | Role | Specialization |
 *   Facility Assigned | Current Workload | Phone | Status | Date Added
 *
 * Maps spreadsheet fields → canonical camelCase User model for the API.
 * Soft-deactivate maps to Status=Inactive. Never delete rows.
 */

var UserRepository = (function () {
  var SHEET_CANDIDATES = ["Users", "USERS"];

  var SHEET_HEADERS = [
    "User ID",
    "Full Name",
    "Email",
    "Role",
    "Specialization",
    "Facility Assigned",
    "Current Workload",
    "Phone",
    "Status",
    "Date Added",
  ];

  function cellText_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function cellDateIso_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function normalizeStatus_(raw) {
    var value = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!value) return "pending";
    if (value === "active") return "active";
    if (value === "inactive" || value === "deactivated") return "inactive";
    if (value === "suspended") return "suspended";
    if (value === "pending") return "pending";
    return value;
  }

  function statusToSheet_(status) {
    var value = String(status || "pending").toLowerCase();
    if (value === "active") return "Active";
    if (value === "inactive") return "Inactive";
    if (value === "suspended") return "Suspended";
    if (value === "pending") return "Pending";
    return status || "Pending";
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = null;
    var i;

    for (i = 0; i < SHEET_CANDIDATES.length; i++) {
      sheet = ss.getSheetByName(SHEET_CANDIDATES[i]);
      if (sheet) return sheet;
    }

    // Discover by header: first sheet whose row 1 includes "User ID".
    var sheets = ss.getSheets();
    for (i = 0; i < sheets.length; i++) {
      var candidate = sheets[i];
      var lastCol = candidate.getLastColumn();
      if (lastCol < 1) continue;
      var headers = candidate.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).trim() === "User ID") {
          return candidate;
        }
      }
    }

    throw new Error(
      'Users sheet not found. Expected a sheet with header "User ID".'
    );
  }

  function rowToSheetObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[String(headers[i]).trim()] = row[i];
    }
    return obj;
  }

  /**
   * Map live sheet row → canonical User fields used by UserService / frontend.
   */
  function toCanonical_(sheetRow) {
    var dateAdded = cellDateIso_(sheetRow["Date Added"]);
    var workloadRaw = sheetRow["Current Workload"];
    var workload = Number(workloadRaw);
    if (!Number.isFinite(workload)) workload = 0;

    return {
      id: cellText_(sheetRow["User ID"]),
      name: cellText_(sheetRow["Full Name"]),
      email: cellText_(sheetRow["Email"]),
      phone: cellText_(sheetRow["Phone"]) || undefined,
      role: cellText_(sheetRow["Role"]) || "viewer",
      specialization: cellText_(sheetRow["Specialization"]) || "",
      facility: cellText_(sheetRow["Facility Assigned"]) || "",
      activeWorkOrders: workload,
      status: normalizeStatus_(sheetRow["Status"]),
      lastActive: dateAdded || new Date().toISOString(),
      createdAt: dateAdded || new Date().toISOString(),
      updatedAt: dateAdded || new Date().toISOString(),
    };
  }

  function canonicalToSheetRow_(canonical) {
    return [
      canonical.id || "",
      canonical.name || "",
      canonical.email || "",
      canonical.role || "",
      canonical.specialization || "",
      canonical.facility || "",
      canonical.activeWorkOrders != null ? canonical.activeWorkOrders : "",
      canonical.phone || "",
      statusToSheet_(canonical.status),
      canonical.createdAt || canonical.lastActive || "",
    ];
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var sheetRow = rowToSheetObject_(headers, values[r]);
      var id = cellText_(sheetRow["User ID"]);
      if (!id) continue;
      rows.push(toCanonical_(sheetRow));
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

  function findRowIndex_(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;

    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "User ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        return r + 1; // 1-based
      }
    }
    return -1;
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/^USR-(\d+)$/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "USR-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();

    var canonical = {
      id: id,
      name: (payload && payload.name) || "",
      email: (payload && payload.email) || "",
      phone: (payload && payload.phone) || "",
      role: (payload && payload.role) || "viewer",
      specialization: (payload && payload.specialization) || "",
      facility: (payload && payload.facility) || "",
      activeWorkOrders: 0,
      status: (payload && payload.status) || "pending",
      lastActive: now,
      createdAt: now,
      updatedAt: now,
    };

    sheet.appendRow(canonicalToSheetRow_(canonical));

    var found = getById(id);
    if (!found) {
      throw new Error(
        "User create wrote row " +
          id +
          " but getById could not re-read it. Check Users sheet headers."
      );
    }
    return found;
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var rowIndex = findRowIndex_(id);
    if (rowIndex === -1) return null;

    var current = getById(id);
    if (!current) return null;

    var updated = {
      id: id,
      name: payload.name != null ? payload.name : current.name,
      email: payload.email != null ? payload.email : current.email,
      phone: payload.phone != null ? payload.phone : current.phone || "",
      role: payload.role != null ? payload.role : current.role,
      specialization:
        payload.specialization != null
          ? payload.specialization
          : current.specialization,
      facility: payload.facility != null ? payload.facility : current.facility,
      activeWorkOrders:
        current.activeWorkOrders != null ? current.activeWorkOrders : 0,
      status: payload.status != null ? payload.status : current.status,
      lastActive: current.lastActive || current.createdAt || new Date().toISOString(),
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    sheet
      .getRange(rowIndex, 1, 1, SHEET_HEADERS.length)
      .setValues([canonicalToSheetRow_(updated)]);

    return getById(id);
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
