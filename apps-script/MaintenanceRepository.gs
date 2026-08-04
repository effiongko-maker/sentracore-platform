/**
 * MaintenanceRepository.gs
 *
 * Sheet: existing Maintenance sheet (source of truth — do not recreate).
 * Live headers (row 1):
 *   Maintenance ID | Event ID | Facility ID | Asset ID | Requester |
 *   Department | Priority | Description | Assigned To |
 *   Date Requested | Date Completed | Status
 *
 * Maps spreadsheet fields → frozen canonical Maintenance model.
 * Soft-deactivate maps to Status=cancelled. Never delete rows.
 */

var MaintenanceRepository = (function () {
  var SHEET_CANDIDATES = ["Maintenance", "MAINTENANCE", "Maintenances"];

  var SHEET_HEADERS = [
    "Maintenance ID",
    "Event ID",
    "Facility ID",
    "Asset ID",
    "Requester",
    "Department",
    "Priority",
    "Description",
    "Assigned To",
    "Date Requested",
    "Date Completed",
    "Status",
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

  function normalizeEnum_(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function mapStatus_(raw) {
    var value = normalizeEnum_(raw);
    if (value === "open" || value === "new") return "requested";
    return value || "requested";
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = null;
    var i;

    for (i = 0; i < SHEET_CANDIDATES.length; i++) {
      sheet = ss.getSheetByName(SHEET_CANDIDATES[i]);
      if (sheet) return sheet;
    }

    // Discover by header: first sheet whose row 1 includes "Maintenance ID".
    var sheets = ss.getSheets();
    for (i = 0; i < sheets.length; i++) {
      var candidate = sheets[i];
      var lastCol = candidate.getLastColumn();
      if (lastCol < 1) continue;
      var headers = candidate.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).trim() === "Maintenance ID") {
          return candidate;
        }
      }
    }

    throw new Error(
      'Maintenance sheet not found. Expected a sheet with header "Maintenance ID".'
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
   * Map live sheet row → frozen canonical Maintenance fields.
   */
  function toCanonical_(sheetRow) {
    var description = cellText_(sheetRow["Description"]);
    var reportedAt = cellDateIso_(sheetRow["Date Requested"]);
    var completedAt = cellDateIso_(sheetRow["Date Completed"]);
    var status = mapStatus_(sheetRow["Status"]);
    var priority = normalizeEnum_(sheetRow["Priority"]) || "medium";
    var now = new Date().toISOString();
    var reported = reportedAt || now;

    return {
      id: cellText_(sheetRow["Maintenance ID"]),
      // title mirrors description when the sheet has no Title column
      title: description,
      description: description || undefined,
      type: "corrective",
      source: "manual",
      categoryId: undefined,
      department: cellText_(sheetRow["Department"]) || undefined,
      facilityId: cellText_(sheetRow["Facility ID"]),
      assetId: cellText_(sheetRow["Asset ID"]) || undefined,
      reportedByUserId: cellText_(sheetRow["Requester"]) || undefined,
      assignedToUserId: cellText_(sheetRow["Assigned To"]) || undefined,
      assignedGroupId: undefined,
      // TODO: Temporary / forward-compatible link to Event Log.
      eventId: cellText_(sheetRow["Event ID"]) || undefined,
      incidentId: undefined,
      workOrderId: undefined,
      parentMaintenanceId: undefined,
      priority: priority,
      status: status,
      holdReason: undefined,
      requiresWorkOrder: undefined,
      reportedAt: reported,
      scheduledStartAt: undefined,
      scheduledEndAt: undefined,
      dueAt: undefined,
      startedAt: undefined,
      completedAt: completedAt || undefined,
      completionNotes: undefined,
      workPerformed: undefined,
      createdAt: reported,
      updatedAt: completedAt || reported,
      createdByUserId: undefined,
      updatedByUserId: undefined,
    };
  }

  function canonicalToSheetRow_(canonical) {
    return [
      canonical.id || "",
      canonical.eventId || "",
      canonical.facilityId || "",
      canonical.assetId || "",
      canonical.reportedByUserId || "",
      canonical.department || "",
      canonical.priority || "medium",
      canonical.description || canonical.title || "",
      canonical.assignedToUserId || "",
      canonical.reportedAt || canonical.createdAt || "",
      canonical.completedAt || "",
      canonical.status || "requested",
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
      var id = cellText_(sheetRow["Maintenance ID"]);
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
      if (String(headers[c]).trim() === "Maintenance ID") {
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
      var match = String(all[i].id || "").match(/MNT-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "MNT-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var description = payload.description || payload.title || "";
    var reportedAt = payload.reportedAt || now;
    var completedAt = payload.completedAt || "";

    var canonical = {
      id: id,
      title: description,
      description: description,
      type: payload.type || "corrective",
      source: "manual",
      department: payload.department || "",
      facilityId: payload.facilityId || "",
      assetId: payload.assetId || "",
      reportedByUserId: payload.reportedByUserId || "",
      assignedToUserId: payload.assignedToUserId || "",
      eventId: payload.eventId || "",
      reportedAt: reportedAt,
      completedAt: completedAt,
      priority: payload.priority || "medium",
      status: payload.status || "requested",
      createdAt: reportedAt,
      updatedAt: completedAt || reportedAt,
    };

    sheet.appendRow(canonicalToSheetRow_(canonical));
    return getById(id);
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var rowIndex = findRowIndex_(id);
    if (rowIndex === -1) return null;

    var current = getById(id);
    if (!current) return null;

    var description =
      payload.description != null
        ? payload.description
        : payload.title != null
          ? payload.title
          : current.description || current.title || "";

    var reportedAt =
      payload.reportedAt != null
        ? payload.reportedAt
        : current.reportedAt || current.createdAt || "";

    var completedAt =
      payload.completedAt != null
        ? payload.completedAt
        : current.completedAt || "";

    var updated = {
      id: id,
      title: description,
      description: description,
      department:
        payload.department != null
          ? payload.department
          : current.department || "",
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      assetId: payload.assetId != null ? payload.assetId : current.assetId || "",
      reportedByUserId:
        payload.reportedByUserId != null
          ? payload.reportedByUserId
          : current.reportedByUserId || "",
      assignedToUserId:
        payload.assignedToUserId != null
          ? payload.assignedToUserId
          : current.assignedToUserId || "",
      eventId:
        payload.eventId != null ? payload.eventId : current.eventId || "",
      reportedAt: reportedAt,
      completedAt: completedAt,
      priority:
        payload.priority != null ? payload.priority : current.priority,
      status: payload.status != null ? payload.status : current.status,
    };

    sheet
      .getRange(rowIndex, 1, 1, SHEET_HEADERS.length)
      .setValues([canonicalToSheetRow_(updated)]);

    return getById(id);
  }

  function deactivate(id) {
    return update(id, { status: "cancelled" });
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
