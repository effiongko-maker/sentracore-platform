/**
 * IncidentRepository.gs
 *
 * Sheet: existing Incidents sheet (source of truth — do not recreate).
 * Live headers (row 1):
 *   Incident ID | Event ID | Facility ID | Incident Type | Severity |
 *   Description | Reported By | Date Reported | Root Cause |
 *   Corrective Action | Owner | Status
 *
 * Maps spreadsheet fields → frozen canonical Incident model.
 * Soft-deactivate maps to Status=cancelled. Never delete rows.
 */

var IncidentRepository = (function () {
  var SHEET_CANDIDATES = ["Incidents", "INCIDENTS"];

  var SHEET_HEADERS = [
    "Incident ID",
    "Event ID",
    "Facility ID",
    "Incident Type",
    "Severity",
    "Description",
    "Reported By",
    "Date Reported",
    "Root Cause",
    "Corrective Action",
    "Owner",
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
    if (value === "open") return "reported";
    return value || "reported";
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = null;
    var i;

    for (i = 0; i < SHEET_CANDIDATES.length; i++) {
      sheet = ss.getSheetByName(SHEET_CANDIDATES[i]);
      if (sheet) return sheet;
    }

    // Discover by header: first sheet whose row 1 includes "Incident ID".
    var sheets = ss.getSheets();
    for (i = 0; i < sheets.length; i++) {
      var candidate = sheets[i];
      var lastCol = candidate.getLastColumn();
      if (lastCol < 1) continue;
      var headers = candidate.getRange(1, 1, 1, lastCol).getValues()[0];
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).trim() === "Incident ID") {
          return candidate;
        }
      }
    }

    throw new Error(
      'Incidents sheet not found. Expected a sheet with header "Incident ID".'
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
   * Map live sheet row → frozen canonical Incident fields.
   */
  function toCanonical_(sheetRow) {
    var description = cellText_(sheetRow["Description"]);
    var reportedAt = cellDateIso_(sheetRow["Date Reported"]);
    var status = mapStatus_(sheetRow["Status"]);
    var severity = normalizeEnum_(sheetRow["Severity"]) || "medium";
    var type = normalizeEnum_(sheetRow["Incident Type"]) || "other";

    return {
      id: cellText_(sheetRow["Incident ID"]),
      // title mirrors description when the sheet has no Title column
      title: description,
      description: description || undefined,
      type: type,
      source: "manual",
      facilityId: cellText_(sheetRow["Facility ID"]),
      assetId: undefined,
      locationDetail: undefined,
      reportedByUserId: cellText_(sheetRow["Reported By"]) || undefined,
      assignedToUserId: cellText_(sheetRow["Owner"]) || undefined,
      assignedGroupId: undefined,
      workOrderId: undefined,
      // TODO: Temporary mapping until the Event Log module is implemented.
      // Event ID is not a parent incident; it will move to a dedicated Event entity.
      parentIncidentId: cellText_(sheetRow["Event ID"]) || undefined,
      reportedAt: reportedAt || new Date().toISOString(),
      discoveredAt: undefined,
      reportedVia: undefined,
      severity: severity,
      peopleAffected: undefined,
      isEmergency: undefined,
      status: status,
      holdReason: undefined,
      requiresWorkOrder: undefined,
      acknowledgedAt: undefined,
      responseDueAt: undefined,
      containedAt: undefined,
      resolvedAt: undefined,
      closedAt: undefined,
      immediateActions: undefined,
      rootCause: cellText_(sheetRow["Root Cause"]) || undefined,
      correctiveActions: cellText_(sheetRow["Corrective Action"]) || undefined,
      preventiveActions: undefined,
      resolutionNotes: undefined,
      createdAt: reportedAt || new Date().toISOString(),
      updatedAt: reportedAt || new Date().toISOString(),
      createdByUserId: undefined,
      updatedByUserId: undefined,
    };
  }

  function canonicalToSheetRow_(canonical) {
    return [
      canonical.id || "",
      canonical.parentIncidentId || "",
      canonical.facilityId || "",
      canonical.type || "other",
      canonical.severity || "medium",
      canonical.description || canonical.title || "",
      canonical.reportedByUserId || "",
      canonical.reportedAt || canonical.createdAt || "",
      canonical.rootCause || "",
      canonical.correctiveActions || "",
      canonical.assignedToUserId || "",
      canonical.status || "reported",
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
      var id = cellText_(sheetRow["Incident ID"]);
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
      if (String(headers[c]).trim() === "Incident ID") {
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
    var year = new Date().getFullYear();
    var all = getAll();
    var maxYear = 0;
    var i;
    for (i = 0; i < all.length; i++) {
      var id = String(all[i].id || "");
      var yearMatch = id.match(/^INC-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "INC-" + year + "-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var description = payload.description || payload.title || "";
    var reportedAt = payload.reportedAt || now;

    // Enforce: requiresWorkOrder=false ⇒ workOrderId cleared (sheet has no WO column).
    var requiresWorkOrder = payload.requiresWorkOrder === true;

    var canonical = {
      id: id,
      title: description,
      description: description,
      type: payload.type || "other",
      source: "manual",
      facilityId: payload.facilityId || "",
      reportedByUserId: payload.reportedByUserId || "",
      assignedToUserId: payload.assignedToUserId || "",
      // TODO: Temporary mapping until the Event Log module is implemented.
      parentIncidentId: payload.parentIncidentId || "",
      reportedAt: reportedAt,
      severity: payload.severity || "medium",
      status: payload.status || "reported",
      rootCause: payload.rootCause || "",
      correctiveActions: payload.correctiveActions || "",
      createdAt: reportedAt,
      updatedAt: reportedAt,
      requiresWorkOrder: requiresWorkOrder,
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

    var updated = {
      id: id,
      title: description,
      description: description,
      type: payload.type != null ? payload.type : current.type,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      reportedByUserId:
        payload.reportedByUserId != null
          ? payload.reportedByUserId
          : current.reportedByUserId || "",
      assignedToUserId:
        payload.assignedToUserId != null
          ? payload.assignedToUserId
          : current.assignedToUserId || "",
      // TODO: Temporary mapping until the Event Log module is implemented.
      parentIncidentId:
        payload.parentIncidentId != null
          ? payload.parentIncidentId
          : current.parentIncidentId || "",
      reportedAt: reportedAt,
      severity:
        payload.severity != null ? payload.severity : current.severity,
      status: payload.status != null ? payload.status : current.status,
      rootCause:
        payload.rootCause != null ? payload.rootCause : current.rootCause || "",
      correctiveActions:
        payload.correctiveActions != null
          ? payload.correctiveActions
          : current.correctiveActions || "",
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
