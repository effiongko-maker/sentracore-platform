/**
 * RequestRepository.gs
 *
 * Sheet: Requests (source of truth for intake records).
 * Auto-creates the sheet with headers on first access if missing.
 *
 * ID format: REQ-{YYYY}-{NNNNNN}
 */

var RequestRepository = (function () {
  var SHEET_NAME = "Requests";
  var HEADERS = [
    "Request ID",
    "Title",
    "Description",
    "Facility ID",
    "Occurred At",
    "Location Detail",
    "Reporter Name",
    "Reporter Contact",
    "Reported By User ID",
    "Request Type",
    "Status",
    "Incident IDs",
    "Maintenance IDs",
    "Work Order IDs",
    "Created At",
    "Updated At",
    "Created By User ID",
    "Updated By User ID",
  ];

  var VALID_STATUSES = {
    submitted: true,
    under_review: true,
    being_treated: true,
    resolved: true,
    closed: true,
    cancelled: true,
  };

  var VALID_REQUEST_TYPES = {
    maintenance: true,
    incident: true,
  };

  function normalizeEnum_(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function mapStatus_(raw) {
    var value = normalizeEnum_(raw);
    if (VALID_STATUSES[value]) return value;
    return "submitted";
  }

  /** Optional intake classification; empty/unknown → undefined (legacy rows). */
  function mapRequestType_(raw) {
    var value = normalizeEnum_(raw);
    if (VALID_REQUEST_TYPES[value]) return value;
    return undefined;
  }

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      return sheet;
    }
    ensureHeaders_(sheet);
    return sheet;
  }

  function ensureHeaders_(sheet) {
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var lastCol = Math.max(1, sheet.getLastColumn());
    var added = 0;
    for (var i = 0; i < HEADERS.length; i++) {
      var name = HEADERS[i];
      if (!SheetFieldUtils.hasHeader(headerMap, name)) {
        sheet.getRange(1, lastCol + 1 + added).setValue(name);
        added++;
      }
    }
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  function coerceIdList_(value) {
    if (value == null) return [];
    if (Object.prototype.toString.call(value) === "[object Array]") {
      return SheetFieldUtils.parseIdList(SheetFieldUtils.formatIdList(value));
    }
    return SheetFieldUtils.parseIdList(value);
  }

  function toCanonical_(sheetRow) {
    var incidentIds = SheetFieldUtils.parseIdList(sheetRow["Incident IDs"]);
    var maintenanceIds = SheetFieldUtils.parseIdList(
      sheetRow["Maintenance IDs"]
    );
    var workOrderIds = SheetFieldUtils.parseIdList(sheetRow["Work Order IDs"]);
    var createdAt =
      SheetFieldUtils.cellText(sheetRow["Created At"]) ||
      new Date().toISOString();
    var occurredAt =
      SheetFieldUtils.cellText(sheetRow["Occurred At"]) || createdAt;

    return {
      id: SheetFieldUtils.cellText(sheetRow["Request ID"]),
      title: SheetFieldUtils.cellText(sheetRow["Title"]),
      description:
        SheetFieldUtils.cellText(sheetRow["Description"]) || undefined,
      facilityId: SheetFieldUtils.cellText(sheetRow["Facility ID"]),
      occurredAt: occurredAt,
      locationDetail:
        SheetFieldUtils.cellText(sheetRow["Location Detail"]) || undefined,
      reporterName:
        SheetFieldUtils.cellText(sheetRow["Reporter Name"]) || undefined,
      reporterContact:
        SheetFieldUtils.cellText(sheetRow["Reporter Contact"]) || undefined,
      reportedByUserId:
        SheetFieldUtils.cellText(sheetRow["Reported By User ID"]) || undefined,
      requestType: mapRequestType_(sheetRow["Request Type"]),
      status: mapStatus_(sheetRow["Status"]),
      incidentIds: incidentIds,
      maintenanceIds: maintenanceIds,
      workOrderIds: workOrderIds,
      createdAt: createdAt,
      updatedAt:
        SheetFieldUtils.cellText(sheetRow["Updated At"]) || createdAt,
      createdByUserId:
        SheetFieldUtils.cellText(sheetRow["Created By User ID"]) || undefined,
      updatedByUserId:
        SheetFieldUtils.cellText(sheetRow["Updated By User ID"]) || undefined,
    };
  }

  function canonicalToFields_(canonical) {
    return {
      "Request ID": canonical.id || "",
      Title: canonical.title || "",
      Description: canonical.description || "",
      "Facility ID": canonical.facilityId || "",
      "Occurred At": canonical.occurredAt || "",
      "Location Detail": canonical.locationDetail || "",
      "Reporter Name": canonical.reporterName || "",
      "Reporter Contact": canonical.reporterContact || "",
      "Reported By User ID": canonical.reportedByUserId || "",
      "Request Type": canonical.requestType || "",
      Status: canonical.status || "submitted",
      "Incident IDs": SheetFieldUtils.formatIdList(canonical.incidentIds || []),
      "Maintenance IDs": SheetFieldUtils.formatIdList(
        canonical.maintenanceIds || []
      ),
      "Work Order IDs": SheetFieldUtils.formatIdList(
        canonical.workOrderIds || []
      ),
      "Created At": canonical.createdAt || "",
      "Updated At": canonical.updatedAt || "",
      "Created By User ID": canonical.createdByUserId || "",
      "Updated By User ID": canonical.updatedByUserId || "",
    };
  }

  function writeRow_(sheet, rowIndex, canonical) {
    var headerMap = ensureHeaders_(sheet);
    var lastCol = sheet.getLastColumn();
    var fields = canonicalToFields_(canonical);
    var row = SheetFieldUtils.buildRowFromFields(headerMap, lastCol, fields);
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);
  }

  function getAll(auditCollector) {
    var sheet;
    var values;
    if (auditCollector && typeof OperationalListAudit !== "undefined") {
      var sheetPhase = OperationalListAudit.beginSheetRead_(
        getSheet_,
        auditCollector
      );
      sheet = sheetPhase.sheet;
      values = sheetPhase.values;
    } else {
      sheet = getSheet_();
      values = sheet.getDataRange().getValues();
    }
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    var tMap0 = auditCollector ? Date.now() : 0;
    for (var r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var id = SheetFieldUtils.cellText(sheetRow["Request ID"]);
      if (!id) continue;
      rows.push(toCanonical_(sheetRow));
    }
    if (auditCollector && typeof OperationalListAudit !== "undefined") {
      OperationalListAudit.finishMapping_(auditCollector, tMap0, rows);
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
      if (String(headers[c]).trim() === "Request ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol] || "").trim() === String(id)) {
        return r + 1;
      }
    }
    return -1;
  }

  function nextId_() {
    var year = new Date().getFullYear();
    var all = getAll();
    var maxYear = 0;
    for (var i = 0; i < all.length; i++) {
      var requestId = String(all[i].id || "");
      var yearMatch = requestId.match(/^REQ-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "REQ-" + year + "-" + padded;
  }

  function mergeCanonical_(current, payload) {
    var status =
      payload.status != null ? mapStatus_(payload.status) : current.status;
    if (payload.status != null && !VALID_STATUSES[normalizeEnum_(payload.status)]) {
      throw new Error(
        "Invalid request status: " +
          payload.status +
          ". Expected submitted|under_review|being_treated|resolved|closed|cancelled."
      );
    }

    var incidentIds =
      payload.incidentIds != null
        ? coerceIdList_(payload.incidentIds)
        : current.incidentIds || [];
    var maintenanceIds =
      payload.maintenanceIds != null
        ? coerceIdList_(payload.maintenanceIds)
        : current.maintenanceIds || [];
    var workOrderIds =
      payload.workOrderIds != null
        ? coerceIdList_(payload.workOrderIds)
        : current.workOrderIds || [];

    return {
      id: current.id,
      title: payload.title != null ? payload.title : current.title,
      description:
        payload.description != null ? payload.description : current.description,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      occurredAt:
        payload.occurredAt != null ? payload.occurredAt : current.occurredAt,
      locationDetail:
        payload.locationDetail != null
          ? payload.locationDetail
          : current.locationDetail,
      reporterName:
        payload.reporterName != null
          ? payload.reporterName
          : current.reporterName,
      reporterContact:
        payload.reporterContact != null
          ? payload.reporterContact
          : current.reporterContact,
      reportedByUserId:
        payload.reportedByUserId != null
          ? payload.reportedByUserId
          : current.reportedByUserId,
      requestType:
        payload.requestType != null
          ? mapRequestType_(payload.requestType) || current.requestType
          : current.requestType,
      status: status,
      incidentIds: incidentIds,
      maintenanceIds: maintenanceIds,
      workOrderIds: workOrderIds,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      createdByUserId: current.createdByUserId,
      updatedByUserId:
        payload.updatedByUserId != null
          ? payload.updatedByUserId
          : current.updatedByUserId,
    };
  }

  function create(payload) {
    payload = payload || {};
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var status = mapStatus_(payload.status || "submitted");
    if (payload.status != null && !VALID_STATUSES[normalizeEnum_(payload.status)]) {
      throw new Error(
        "Invalid request status: " +
          payload.status +
          ". Expected submitted|under_review|being_treated|resolved|closed|cancelled."
      );
    }
    if (
      payload.requestType != null &&
      String(payload.requestType).trim() !== "" &&
      !VALID_REQUEST_TYPES[normalizeEnum_(payload.requestType)]
    ) {
      throw new Error(
        "Invalid request type: " +
          payload.requestType +
          ". Expected maintenance|incident."
      );
    }

    var canonical = {
      id: id,
      title: payload.title || "",
      description: payload.description || "",
      facilityId: payload.facilityId || "",
      occurredAt: payload.occurredAt || now,
      locationDetail: payload.locationDetail || "",
      reporterName: payload.reporterName || "",
      reporterContact: payload.reporterContact || "",
      reportedByUserId: payload.reportedByUserId || "",
      requestType: mapRequestType_(payload.requestType),
      status: status,
      incidentIds: coerceIdList_(payload.incidentIds || []),
      maintenanceIds: coerceIdList_(payload.maintenanceIds || []),
      workOrderIds: coerceIdList_(payload.workOrderIds || []),
      createdAt: now,
      updatedAt: now,
      createdByUserId: payload.createdByUserId || "",
      updatedByUserId: payload.updatedByUserId || payload.createdByUserId || "",
    };

    ensureHeaders_(sheet);
    var lastCol = sheet.getLastColumn();
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var fields = canonicalToFields_(canonical);
    var row = SheetFieldUtils.buildRowFromFields(headerMap, lastCol, fields);
    sheet.appendRow(row);
    return getById(id);
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var rowIndex = findRowIndex_(id);
    if (rowIndex === -1) return null;
    var current = getById(id);
    if (!current) return null;
    var updated = mergeCanonical_(current, payload || {});
    writeRow_(sheet, rowIndex, updated);
    return getById(id);
  }

  function deactivate(id) {
    return update(id, { status: "cancelled" });
  }

  return {
    HEADERS: HEADERS,
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
