/**
 * WorkOrderRepository.gs
 *
 * Sheet: existing Work Orders sheet (source of truth — do not recreate).
 * Live headers (row 1):
 *   Work Order ID | Event ID | Maintenance ID | Facility ID | Asset ID |
 *   Description | Priority | Assigned To | Completed By | Date Opened |
 *   Date Completed | Date Closed | Status
 *
 * Maps spreadsheet fields → frozen canonical WorkOrder model.
 * Soft-deactivate maps to Status=cancelled. Never delete rows.
 */

var WorkOrderRepository = (function () {
  var SHEET_CANDIDATES = ["Work Orders", "WorkOrders", "WORK_ORDERS"];

  var SHEET_HEADERS = [
    "Work Order ID",
    "Event ID",
    "Maintenance ID",
    "Facility ID",
    "Asset ID",
    "Description",
    "Priority",
    "Assigned To",
    "Completed By",
    "Date Opened",
    "Date Completed",
    "Date Closed",
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

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = null;
    var i;

    for (i = 0; i < SHEET_CANDIDATES.length; i++) {
      sheet = ss.getSheetByName(SHEET_CANDIDATES[i]);
      if (sheet) return sheet;
    }

    // Discover by header: first sheet whose row 1 includes "Work Order ID".
    var sheets = ss.getSheets();
    for (i = 0; i < sheets.length; i++) {
      var candidate = sheets[i];
      var lastCol = candidate.getLastColumn();
      if (lastCol < 1) continue;
      var headers = candidate.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).trim() === "Work Order ID") {
          return candidate;
        }
      }
    }

    throw new Error(
      'Work Orders sheet not found. Expected a sheet with header "Work Order ID".'
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
   * Map live sheet row → frozen canonical WorkOrder fields.
   */
  function toCanonical_(sheetRow) {
    var description = cellText_(sheetRow["Description"]);
    var requestedAt = cellDateIso_(sheetRow["Date Opened"]);
    var completedAt = cellDateIso_(sheetRow["Date Completed"]);
    var status = cellText_(sheetRow["Status"]).toLowerCase().replace(/\s+/g, "_");
    var priority = cellText_(sheetRow["Priority"])
      .toLowerCase()
      .replace(/\s+/g, "_");

    if (!status) status = "open";
    if (!priority) priority = "medium";

    return {
      id: cellText_(sheetRow["Work Order ID"]),
      title: description,
      description: description || undefined,
      type: "corrective",
      source: "manual",
      facilityId: cellText_(sheetRow["Facility ID"]),
      assetId: cellText_(sheetRow["Asset ID"]) || undefined,
      reportedByUserId: undefined,
      incidentId: cellText_(sheetRow["Event ID"]) || undefined,
      parentWorkOrderId: cellText_(sheetRow["Maintenance ID"]) || undefined,
      assignedToUserId: cellText_(sheetRow["Assigned To"]) || undefined,
      assignedGroupId: undefined,
      requestedAt: requestedAt || undefined,
      scheduledStartAt: undefined,
      scheduledEndAt: undefined,
      dueAt: undefined,
      status: status,
      priority: priority,
      holdReason: undefined,
      startedAt: undefined,
      completedAt: completedAt || undefined,
      estimatedHours: undefined,
      actualHours: undefined,
      estimatedCost: undefined,
      actualCost: undefined,
      completionNotes: undefined,
      workPerformed: undefined,
      downtimeMinutes: undefined,
      slaDueAt: undefined,
      requiresApproval: undefined,
      createdAt: requestedAt || new Date().toISOString(),
      updatedAt: completedAt || requestedAt || new Date().toISOString(),
      createdByUserId: undefined,
      updatedByUserId: undefined,
      // Sheet-only (not part of frozen UI model; kept for write-back)
      _completedBy: cellText_(sheetRow["Completed By"]) || "",
      _dateClosed: cellDateIso_(sheetRow["Date Closed"]) || "",
    };
  }

  function canonicalToSheetRow_(canonical) {
    return [
      canonical.id || "",
      canonical.incidentId || "",
      canonical.parentWorkOrderId || "",
      canonical.facilityId || "",
      canonical.assetId || "",
      canonical.description || canonical.title || "",
      canonical.priority || "medium",
      canonical.assignedToUserId || "",
      canonical._completedBy || "",
      canonical.requestedAt || canonical.createdAt || "",
      canonical.completedAt || "",
      canonical._dateClosed || "",
      canonical.status || "open",
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
      var id = cellText_(sheetRow["Work Order ID"]);
      if (!id) continue;
      var canonical = toCanonical_(sheetRow);
      // Strip write-back helpers from API responses
      delete canonical._completedBy;
      delete canonical._dateClosed;
      rows.push(canonical);
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
      if (String(headers[c]).trim() === "Work Order ID") {
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
      var match = String(all[i].id || "").match(/WO-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "WO-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var description = payload.description || payload.title || "";
    var requestedAt = payload.requestedAt || payload.createdAt || now;

    var canonical = {
      id: id,
      title: description,
      description: description,
      type: payload.type || "corrective",
      source: payload.source || "manual",
      facilityId: payload.facilityId || "",
      assetId: payload.assetId || "",
      incidentId: payload.incidentId || "",
      parentWorkOrderId: payload.parentWorkOrderId || "",
      assignedToUserId: payload.assignedToUserId || "",
      requestedAt: requestedAt,
      completedAt: payload.completedAt || "",
      status: payload.status || "open",
      priority: payload.priority || "medium",
      createdAt: requestedAt,
      updatedAt: payload.updatedAt || requestedAt,
      _completedBy: "",
      _dateClosed: "",
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

    // Re-read sheet-only fields for write-back
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var sheetRow = rowToSheetObject_(headers, values[rowIndex - 1]);
    var completedBy = cellText_(sheetRow["Completed By"]);
    var dateClosed = cellDateIso_(sheetRow["Date Closed"]);

    var description =
      payload.description != null
        ? payload.description
        : payload.title != null
          ? payload.title
          : current.description || current.title || "";

    var requestedAt =
      payload.requestedAt != null
        ? payload.requestedAt
        : current.requestedAt || current.createdAt || "";

    var completedAt =
      payload.completedAt != null ? payload.completedAt : current.completedAt || "";

    var updated = {
      id: id,
      title: description,
      description: description,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      assetId: payload.assetId != null ? payload.assetId : current.assetId || "",
      incidentId:
        payload.incidentId != null ? payload.incidentId : current.incidentId || "",
      parentWorkOrderId:
        payload.parentWorkOrderId != null
          ? payload.parentWorkOrderId
          : current.parentWorkOrderId || "",
      assignedToUserId:
        payload.assignedToUserId != null
          ? payload.assignedToUserId
          : current.assignedToUserId || "",
      requestedAt: requestedAt,
      completedAt: completedAt,
      status: payload.status != null ? payload.status : current.status,
      priority: payload.priority != null ? payload.priority : current.priority,
      _completedBy: completedBy,
      _dateClosed: dateClosed,
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
