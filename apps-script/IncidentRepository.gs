/**
 * IncidentRepository.gs
 *
 * Sheet: Incidents (source of truth).
 * Relationship columns (added on first write if missing):
 *   Asset ID, Work Order IDs, Maintenance IDs, Parent Incident ID, Source, Title
 * Event ID = Supabase operational_events.id only (not Incident / Parent ids).
 */

var IncidentRepository = (function () {
  var SHEET_CANDIDATES = ["Incidents", "INCIDENTS"];

  var RELATIONSHIP_HEADERS = [
    "Asset ID",
    "Work Order IDs",
    "Maintenance IDs",
    "Parent Incident ID",
    "Source",
    "Title",
  ];

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

  function ensureHeaders_(sheet) {
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var lastCol = sheet.getLastColumn();
    var added = 0;
    for (var i = 0; i < RELATIONSHIP_HEADERS.length; i++) {
      var name = RELATIONSHIP_HEADERS[i];
      if (!SheetFieldUtils.hasHeader(headerMap, name)) {
        sheet.getRange(1, lastCol + 1 + added).setValue(name);
        added++;
      }
    }
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  function readWorkOrderIds_(sheetRow, headerMap) {
    if (SheetFieldUtils.hasHeader(headerMap, "Work Order IDs")) {
      return SheetFieldUtils.parseIdList(sheetRow["Work Order IDs"]);
    }
    var single = SheetFieldUtils.cellText(sheetRow["Work Order ID"]);
    return single ? [single] : [];
  }

  function readMaintenanceIds_(sheetRow, headerMap) {
    if (SheetFieldUtils.hasHeader(headerMap, "Maintenance IDs")) {
      return SheetFieldUtils.parseIdList(sheetRow["Maintenance IDs"]);
    }
    return [];
  }

  function toCanonical_(sheetRow, headerMap) {
    var description = SheetFieldUtils.cellText(sheetRow["Description"]);
    var title =
      SheetFieldUtils.cellText(sheetRow["Title"]) || description;
    var reportedAt = SheetFieldUtils.cellText(sheetRow["Date Reported"]);
    var status = mapStatus_(sheetRow["Status"]);
    var severity = normalizeEnum_(sheetRow["Severity"]) || "medium";
    var type = normalizeEnum_(sheetRow["Incident Type"]) || "other";
    var source = normalizeEnum_(sheetRow["Source"]) || "manual";
    var workOrderIds = readWorkOrderIds_(sheetRow, headerMap);
    var maintenanceIds = readMaintenanceIds_(sheetRow, headerMap);

    return {
      id: SheetFieldUtils.cellText(sheetRow["Incident ID"]),
      title: title,
      description: description || undefined,
      type: type,
      source: source,
      facilityId: SheetFieldUtils.cellText(sheetRow["Facility ID"]),
      assetId: SheetFieldUtils.cellText(sheetRow["Asset ID"]) || undefined,
      locationDetail: undefined,
      reportedByUserId:
        SheetFieldUtils.cellText(sheetRow["Reported By"]) || undefined,
      assignedToUserId: SheetFieldUtils.cellText(sheetRow["Owner"]) || undefined,
      assignedGroupId: undefined,
      workOrderIds: workOrderIds,
      workOrderId: workOrderIds.length ? workOrderIds[0] : undefined,
      maintenanceIds: maintenanceIds,
      parentIncidentId:
        SheetFieldUtils.cellText(sheetRow["Parent Incident ID"]) || undefined,
      operationalEventId:
        SheetFieldUtils.cellText(sheetRow["Event ID"]) || undefined,
      reportedAt: reportedAt || new Date().toISOString(),
      discoveredAt: undefined,
      reportedVia: undefined,
      severity: severity,
      peopleAffected: undefined,
      isEmergency: undefined,
      status: status,
      holdReason: undefined,
      requiresWorkOrder: workOrderIds.length > 0 ? true : undefined,
      acknowledgedAt: undefined,
      responseDueAt: undefined,
      containedAt: undefined,
      resolvedAt: undefined,
      closedAt: undefined,
      immediateActions: undefined,
      rootCause: SheetFieldUtils.cellText(sheetRow["Root Cause"]) || undefined,
      correctiveActions:
        SheetFieldUtils.cellText(sheetRow["Corrective Action"]) || undefined,
      preventiveActions: undefined,
      resolutionNotes: undefined,
      createdAt: reportedAt || new Date().toISOString(),
      updatedAt: reportedAt || new Date().toISOString(),
      createdByUserId: undefined,
      updatedByUserId: undefined,
    };
  }

  function canonicalToFields_(canonical) {
    var workOrderIds =
      canonical.workOrderIds ||
      (canonical.workOrderId ? [canonical.workOrderId] : []);
    var maintenanceIds = canonical.maintenanceIds || [];
    var description = canonical.description || canonical.title || "";

    return {
      "Incident ID": canonical.id || "",
      "Event ID": canonical.operationalEventId || "",
      "Facility ID": canonical.facilityId || "",
      "Incident Type": canonical.type || "other",
      Severity: canonical.severity || "medium",
      Description: description,
      Title: canonical.title || description,
      "Reported By": canonical.reportedByUserId || "",
      "Date Reported": canonical.reportedAt || canonical.createdAt || "",
      "Root Cause": canonical.rootCause || "",
      "Corrective Action": canonical.correctiveActions || "",
      Owner: canonical.assignedToUserId || "",
      Status: canonical.status || "reported",
      "Asset ID": canonical.assetId || "",
      "Work Order IDs": SheetFieldUtils.formatIdList(workOrderIds),
      "Maintenance IDs": SheetFieldUtils.formatIdList(maintenanceIds),
      "Parent Incident ID": canonical.parentIncidentId || "",
      Source: canonical.source || "manual",
    };
  }

  function writeRow_(sheet, rowIndex, canonical) {
    var headerMap = ensureHeaders_(sheet);
    var lastCol = sheet.getLastColumn();
    var fields = canonicalToFields_(canonical);
    var row = SheetFieldUtils.buildRowFromFields(headerMap, lastCol, fields);
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var id = SheetFieldUtils.cellText(sheetRow["Incident ID"]);
      if (!id) continue;
      rows.push(toCanonical_(sheetRow, headerMap));
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
        return r + 1;
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
      var incidentId = String(all[i].id || "");
      var yearMatch = incidentId.match(/^INC-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "INC-" + year + "-" + padded;
  }

  function mergeCanonical_(current, payload) {
    var workOrderIds =
      payload.workOrderIds != null
        ? payload.workOrderIds
        : current.workOrderIds || [];
    if (payload.workOrderId && workOrderIds.indexOf(payload.workOrderId) === -1) {
      workOrderIds = SheetFieldUtils.appendUniqueId(
        workOrderIds,
        payload.workOrderId
      );
    }
    var maintenanceIds =
      payload.maintenanceIds != null
        ? payload.maintenanceIds
        : current.maintenanceIds || [];

    var description =
      payload.description != null
        ? payload.description
        : payload.title != null
          ? payload.title
          : current.description || current.title || "";

    return {
      id: current.id,
      title: payload.title != null ? payload.title : description,
      description: description,
      type: payload.type != null ? payload.type : current.type,
      source: payload.source != null ? payload.source : current.source,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      assetId: payload.assetId != null ? payload.assetId : current.assetId,
      reportedByUserId:
        payload.reportedByUserId != null
          ? payload.reportedByUserId
          : current.reportedByUserId,
      assignedToUserId:
        payload.assignedToUserId != null
          ? payload.assignedToUserId
          : current.assignedToUserId,
      workOrderIds: workOrderIds,
      workOrderId: workOrderIds.length ? workOrderIds[0] : undefined,
      maintenanceIds: maintenanceIds,
      parentIncidentId:
        payload.parentIncidentId != null
          ? payload.parentIncidentId
          : current.parentIncidentId,
      operationalEventId:
        payload.operationalEventId != null
          ? payload.operationalEventId
          : current.operationalEventId,
      reportedAt:
        payload.reportedAt != null
          ? payload.reportedAt
          : current.reportedAt || current.createdAt,
      severity:
        payload.severity != null ? payload.severity : current.severity,
      status: payload.status != null ? payload.status : current.status,
      rootCause:
        payload.rootCause != null ? payload.rootCause : current.rootCause,
      correctiveActions:
        payload.correctiveActions != null
          ? payload.correctiveActions
          : current.correctiveActions,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      requiresWorkOrder:
        payload.requiresWorkOrder != null
          ? payload.requiresWorkOrder
          : current.requiresWorkOrder,
    };
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var description = payload.description || payload.title || "";
    var reportedAt = payload.reportedAt || now;
    var workOrderIds = payload.workOrderIds || [];
    if (payload.workOrderId) {
      workOrderIds = SheetFieldUtils.appendUniqueId(
        workOrderIds,
        payload.workOrderId
      );
    }

    var canonical = {
      id: id,
      title: payload.title || description,
      description: description,
      type: payload.type || "other",
      source: payload.source || "manual",
      facilityId: payload.facilityId || "",
      assetId: payload.assetId || "",
      reportedByUserId: payload.reportedByUserId || "",
      assignedToUserId: payload.assignedToUserId || "",
      workOrderIds: workOrderIds,
      workOrderId: workOrderIds.length ? workOrderIds[0] : undefined,
      maintenanceIds: payload.maintenanceIds || [],
      parentIncidentId: payload.parentIncidentId || "",
      operationalEventId: payload.operationalEventId || "",
      reportedAt: reportedAt,
      severity: payload.severity || "medium",
      status: payload.status || "reported",
      rootCause: payload.rootCause || "",
      correctiveActions: payload.correctiveActions || "",
      createdAt: reportedAt,
      updatedAt: reportedAt,
      requiresWorkOrder: payload.requiresWorkOrder === true,
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

    var updated = mergeCanonical_(current, payload);
    writeRow_(sheet, rowIndex, updated);
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
