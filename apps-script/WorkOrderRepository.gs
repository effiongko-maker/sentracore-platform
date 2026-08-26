/**
 * WorkOrderRepository.gs
 *
 * Sheet: Work Orders (source of truth).
 * Relationship columns (added on first write if missing):
 *   Facility ID, Asset ID, Assigned To, Reported By,
 *   Incident ID, Parent Work Order ID, Source, Title, Approval ID
 * Event ID = Supabase operational_events.id only.
 * Maintenance ID = maintenance activity id (not parent work order).
 */

var WorkOrderRepository = (function () {
  var SHEET_CANDIDATES = ["Work Orders", "WorkOrders", "WORK_ORDERS"];

  /** Headers required for canonical Work Order relationship persistence. */
  var RELATIONSHIP_HEADERS = [
    "Facility ID",
    "Asset ID",
    "Assigned To",
    "Reported By",
    "Incident ID",
    "Parent Work Order ID",
    "Source",
    "Title",
    "Approval ID",
  ];

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
        if (String(headers[h]).trim() === "Work Order ID") {
          return candidate;
        }
      }
    }

    throw new Error(
      'Work Orders sheet not found. Expected a sheet with header "Work Order ID".'
    );
  }

  function ensureHeaders_(sheet) {
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var lastCol = Math.max(1, sheet.getLastColumn());
    var added = 0;
    for (var i = 0; i < RELATIONSHIP_HEADERS.length; i++) {
      var name = RELATIONSHIP_HEADERS[i];
      if (!SheetFieldUtils.hasHeader(headerMap, name)) {
        sheet.getRange(1, lastCol + 1 + added).setValue(name);
        added++;
      }
    }
    headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var missing = [];
    for (var j = 0; j < RELATIONSHIP_HEADERS.length; j++) {
      if (!SheetFieldUtils.hasHeader(headerMap, RELATIONSHIP_HEADERS[j])) {
        missing.push(RELATIONSHIP_HEADERS[j]);
      }
    }
    if (missing.length) {
      throw new Error(
        "Work Orders sheet missing required headers after ensure: " +
          missing.join(", ")
      );
    }
    return headerMap;
  }

  function readIncidentId_(sheetRow, headerMap) {
    if (SheetFieldUtils.hasHeader(headerMap, "Incident ID")) {
      var explicit = SheetFieldUtils.cellText(sheetRow["Incident ID"]);
      if (explicit) return explicit;
    }
    var legacy = SheetFieldUtils.cellText(sheetRow["Event ID"]);
    if (legacy && /^INC-/i.test(legacy)) return legacy;
    return undefined;
  }

  function readMaintenanceId_(sheetRow, headerMap) {
    var raw = SheetFieldUtils.cellText(sheetRow["Maintenance ID"]);
    if (!raw) return undefined;
    if (SheetFieldUtils.hasHeader(headerMap, "Parent Work Order ID")) {
      return /^MNT-/i.test(raw) ? raw : undefined;
    }
    if (/^MNT-/i.test(raw)) return raw;
    return undefined;
  }

  function readParentWorkOrderId_(sheetRow, headerMap) {
    if (SheetFieldUtils.hasHeader(headerMap, "Parent Work Order ID")) {
      return (
        SheetFieldUtils.cellText(sheetRow["Parent Work Order ID"]) || undefined
      );
    }
    var legacy = SheetFieldUtils.cellText(sheetRow["Maintenance ID"]);
    if (legacy && /^WO-/i.test(legacy)) return legacy;
    if (legacy && !/^MNT-/i.test(legacy) && legacy) return legacy;
    return undefined;
  }

  function readOperationalEventId_(sheetRow, headerMap) {
    var raw = SheetFieldUtils.cellText(sheetRow["Event ID"]);
    if (!raw) return undefined;
    if (/^INC-/i.test(raw)) return undefined;
    return raw;
  }

  function toCanonical_(sheetRow, headerMap) {
    var description = SheetFieldUtils.cellText(sheetRow["Description"]);
    var explicitTitle = SheetFieldUtils.cellText(sheetRow["Title"]);
    var title = explicitTitle;
    if (
      !title ||
      /(?:^|\n|\s)(?:Location|Department|Category|Source maintenance)\s*:/i.test(
        title
      )
    ) {
      var titleSource = title || description || "";
      if (titleSource) {
        var cut = titleSource.search(
          /\s*(?:\n\n+|(?:Location|Department|Category|Source maintenance)\s*:)/i
        );
        title =
          cut > 0
            ? String(titleSource.slice(0, cut)).trim()
            : String(titleSource.split(/\n+/)[0] || "").trim();
      } else {
        title = "";
      }
    }
    var requestedAt = SheetFieldUtils.cellText(sheetRow["Date Opened"]);
    var completedAt = SheetFieldUtils.cellText(sheetRow["Date Completed"]);
    var status = SheetFieldUtils.cellText(sheetRow["Status"])
      .toLowerCase()
      .replace(/\s+/g, "_");
    var priority = SheetFieldUtils.cellText(sheetRow["Priority"])
      .toLowerCase()
      .replace(/\s+/g, "_");
    var source = SheetFieldUtils.cellText(sheetRow["Source"]) || "manual";

    if (!status) status = "open";
    if (!priority) priority = "medium";

    return {
      id: SheetFieldUtils.cellText(sheetRow["Work Order ID"]),
      title: title,
      description: description || undefined,
      type: "corrective",
      source: source,
      facilityId: SheetFieldUtils.cellText(sheetRow["Facility ID"]),
      assetId: SheetFieldUtils.cellText(sheetRow["Asset ID"]) || undefined,
      reportedByUserId:
        SheetFieldUtils.cellText(sheetRow["Reported By"]) || undefined,
      incidentId: readIncidentId_(sheetRow, headerMap),
      maintenanceId: readMaintenanceId_(sheetRow, headerMap),
      parentWorkOrderId: readParentWorkOrderId_(sheetRow, headerMap),
      operationalEventId: readOperationalEventId_(sheetRow, headerMap),
      assignedToUserId:
        SheetFieldUtils.cellText(sheetRow["Assigned To"]) || undefined,
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
      approvalId:
        SheetFieldUtils.cellText(sheetRow["Approval ID"]) || undefined,
      createdAt: requestedAt || new Date().toISOString(),
      updatedAt: completedAt || requestedAt || new Date().toISOString(),
      createdByUserId: undefined,
      updatedByUserId: undefined,
      _completedBy: SheetFieldUtils.cellText(sheetRow["Completed By"]) || "",
      _dateClosed: SheetFieldUtils.cellText(sheetRow["Date Closed"]) || "",
    };
  }

  function canonicalToFields_(canonical) {
    var description = canonical.description || canonical.title || "";
    return {
      "Work Order ID": canonical.id || "",
      "Event ID": canonical.operationalEventId || "",
      "Maintenance ID": canonical.maintenanceId || "",
      "Facility ID": canonical.facilityId || "",
      "Asset ID": canonical.assetId || "",
      Description: description,
      Title: canonical.title || description,
      Priority: canonical.priority || "medium",
      "Assigned To": canonical.assignedToUserId || "",
      "Reported By": canonical.reportedByUserId || "",
      "Completed By": canonical._completedBy || "",
      "Date Opened": canonical.requestedAt || canonical.createdAt || "",
      "Date Completed": canonical.completedAt || "",
      "Date Closed": canonical._dateClosed || "",
      Status: canonical.status || "open",
      "Incident ID": canonical.incidentId || "",
      "Parent Work Order ID": canonical.parentWorkOrderId || "",
      Source: canonical.source || "manual",
      "Approval ID": canonical.approvalId || "",
    };
  }

  function writeRow_(sheet, rowIndex, canonical) {
    var headerMap = ensureHeaders_(sheet);
    var lastCol = sheet.getLastColumn();
    var fields = canonicalToFields_(canonical);
    var row = SheetFieldUtils.buildRowFromFieldsStrict(
      headerMap,
      lastCol,
      fields
    );
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var headerMap = SheetFieldUtils.headerMapFromRow
      ? SheetFieldUtils.headerMapFromRow(headers)
      : SheetFieldUtils.getHeaderMap(sheet);
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var id = SheetFieldUtils.cellText(sheetRow["Work Order ID"]);
      if (!id) continue;
      var canonical = toCanonical_(sheetRow, headerMap);
      delete canonical._completedBy;
      delete canonical._dateClosed;
      rows.push(canonical);
    }
    return rows;
  }

  function getById(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = SheetFieldUtils.headerMapFromRow
      ? SheetFieldUtils.headerMapFromRow(headers)
      : SheetFieldUtils.getHeaderMap(sheet);
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Work Order ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return null;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(id)) continue;
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var canonical = toCanonical_(sheetRow, headerMap);
      delete canonical._completedBy;
      delete canonical._dateClosed;
      return canonical;
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
        return r + 1;
      }
    }
    return -1;
  }

  /** Generate next WO id from an already-loaded values matrix (one read). */
  function nextIdFromValues_(values) {
    var year = new Date().getFullYear();
    var maxYear = 0;
    if (values.length <= 1) {
      return "WO-" + year + "-000001";
    }
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Work Order ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) {
      throw new Error('Work Orders sheet missing "Work Order ID" header.');
    }
    for (var r = 1; r < values.length; r++) {
      var workOrderId = String(values[r][idCol] || "");
      var yearMatch = workOrderId.match(/^WO-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "WO-" + year + "-" + padded;
  }

  function nextId_() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    return nextIdFromValues_(values);
  }

  function mergeCanonical_(current, payload) {
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
      incidentId:
        payload.incidentId != null ? payload.incidentId : current.incidentId,
      maintenanceId:
        payload.maintenanceId != null
          ? payload.maintenanceId
          : current.maintenanceId,
      parentWorkOrderId:
        payload.parentWorkOrderId != null
          ? payload.parentWorkOrderId
          : current.parentWorkOrderId,
      operationalEventId:
        payload.operationalEventId != null
          ? payload.operationalEventId
          : current.operationalEventId,
      assignedToUserId:
        payload.assignedToUserId != null
          ? payload.assignedToUserId
          : current.assignedToUserId,
      requestedAt:
        payload.requestedAt != null
          ? payload.requestedAt
          : current.requestedAt || current.createdAt,
      completedAt:
        payload.completedAt != null ? payload.completedAt : current.completedAt,
      status: payload.status != null ? payload.status : current.status,
      priority: payload.priority != null ? payload.priority : current.priority,
      requiresApproval:
        payload.requiresApproval != null
          ? payload.requiresApproval
          : current.requiresApproval,
      approvalId:
        payload.approvalId != null ? payload.approvalId : current.approvalId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
      _completedBy: current._completedBy || "",
      _dateClosed: current._dateClosed || "",
    };
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var values = sheet.getDataRange().getValues();
    var id = nextIdFromValues_(values);
    var description = payload.description || payload.title || "";
    var requestedAt = payload.requestedAt || payload.createdAt || now;

    var canonical = {
      id: id,
      title: payload.title || description,
      description: description,
      type: payload.type || "corrective",
      source: payload.source || "manual",
      facilityId: payload.facilityId || "",
      assetId: payload.assetId || "",
      reportedByUserId: payload.reportedByUserId || "",
      incidentId: payload.incidentId || "",
      maintenanceId: payload.maintenanceId || "",
      parentWorkOrderId: payload.parentWorkOrderId || "",
      operationalEventId: payload.operationalEventId || "",
      assignedToUserId: payload.assignedToUserId || "",
      requestedAt: requestedAt,
      completedAt: payload.completedAt || "",
      status: payload.status || "open",
      priority: payload.priority || "medium",
      requiresApproval: payload.requiresApproval || false,
      approvalId: payload.approvalId || "",
      createdAt: requestedAt,
      updatedAt: payload.updatedAt || requestedAt,
      _completedBy: "",
      _dateClosed: "",
    };

    var headerMap = ensureHeaders_(sheet);
    var lastCol = sheet.getLastColumn();
    var fields = canonicalToFields_(canonical);
    var row = SheetFieldUtils.buildRowFromFieldsStrict(
      headerMap,
      lastCol,
      fields
    );
    sheet.appendRow(row);

    // Return written canonical (no second full-sheet getById).
    var response = {};
    for (var key in canonical) {
      if (!canonical.hasOwnProperty(key)) continue;
      if (key === "_completedBy" || key === "_dateClosed") continue;
      response[key] = canonical[key];
    }
    return response;
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = SheetFieldUtils.headerMapFromRow
      ? SheetFieldUtils.headerMapFromRow(headers)
      : SheetFieldUtils.getHeaderMap(sheet);
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Work Order ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return null;

    var rowIndex = -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1;
        break;
      }
    }
    if (rowIndex === -1) return null;

    var sheetRow = SheetFieldUtils.rowToSheetObject(
      headers,
      values[rowIndex - 1]
    );
    var currentRaw = toCanonical_(sheetRow, headerMap);
    var updated = mergeCanonical_(currentRaw, payload);
    writeRow_(sheet, rowIndex, updated);

    var response = {};
    for (var key in updated) {
      if (!updated.hasOwnProperty(key)) continue;
      if (key === "_completedBy" || key === "_dateClosed") continue;
      response[key] = updated[key];
    }
    return response;
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
