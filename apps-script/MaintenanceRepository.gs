/**
 * MaintenanceRepository.gs
 *
 * Sheet: Maintenance (source of truth).
 * Relationship columns (added on first write if missing):
 *   Incident ID, Work Order IDs, Source (explicit)
 * Event ID = Supabase operational_events.id only.
 */

var MaintenanceRepository = (function () {
  var SHEET_CANDIDATES = ["Maintenance", "MAINTENANCE", "Maintenances"];

  var RELATIONSHIP_HEADERS = [
    "Incident ID",
    "Work Order IDs",
    "Source",
    "Title",
    "Updated At",
    "Request ID",
    "Completion Notes",
  ];

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

  function toCanonical_(sheetRow, headerMap) {
    var description = SheetFieldUtils.cellText(sheetRow["Description"]);
    var title =
      SheetFieldUtils.cellText(sheetRow["Title"]) || description;
    var reportedAt = SheetFieldUtils.cellText(sheetRow["Date Requested"]);
    var completedAt = SheetFieldUtils.cellText(sheetRow["Date Completed"]);
    var updatedAt =
      SheetFieldUtils.cellText(sheetRow["Updated At"]) ||
      completedAt ||
      reportedAt;
    var status = mapStatus_(sheetRow["Status"]);
    var priority = normalizeEnum_(sheetRow["Priority"]) || "medium";
    var now = new Date().toISOString();
    var reported = reportedAt || now;
    var workOrderIds = readWorkOrderIds_(sheetRow, headerMap);
    var source = normalizeEnum_(sheetRow["Source"]) || "manual";

    return {
      id: SheetFieldUtils.cellText(sheetRow["Maintenance ID"]),
      title: title,
      description: description || undefined,
      type: "corrective",
      source: source,
      categoryId: undefined,
      department: SheetFieldUtils.cellText(sheetRow["Department"]) || undefined,
      facilityId: SheetFieldUtils.cellText(sheetRow["Facility ID"]),
      assetId: SheetFieldUtils.cellText(sheetRow["Asset ID"]) || undefined,
      reportedByUserId:
        SheetFieldUtils.cellText(sheetRow["Requester"]) || undefined,
      assignedToUserId:
        SheetFieldUtils.cellText(sheetRow["Assigned To"]) || undefined,
      assignedGroupId: undefined,
      operationalEventId:
        SheetFieldUtils.cellText(sheetRow["Event ID"]) || undefined,
      incidentId: SheetFieldUtils.cellText(sheetRow["Incident ID"]) || undefined,
      sourceRequestId:
        SheetFieldUtils.hasHeader(headerMap, "Request ID")
          ? SheetFieldUtils.cellText(sheetRow["Request ID"]) || undefined
          : undefined,
      workOrderIds: workOrderIds,
      workOrderId: workOrderIds.length ? workOrderIds[0] : undefined,
      parentMaintenanceId: undefined,
      priority: priority,
      status: status,
      holdReason: undefined,
      requiresWorkOrder: workOrderIds.length > 0 ? true : undefined,
      reportedAt: reported,
      scheduledStartAt: undefined,
      scheduledEndAt: undefined,
      dueAt: undefined,
      startedAt: undefined,
      completedAt: completedAt || undefined,
      completionNotes:
        SheetFieldUtils.hasHeader(headerMap, "Completion Notes")
          ? SheetFieldUtils.cellText(sheetRow["Completion Notes"]) || undefined
          : undefined,
      workPerformed: undefined,
      createdAt: reported,
      updatedAt: updatedAt || reported,
      createdByUserId: undefined,
      updatedByUserId: undefined,
    };
  }

  function canonicalToFields_(canonical) {
    var workOrderIds =
      canonical.workOrderIds ||
      (canonical.workOrderId ? [canonical.workOrderId] : []);
    var description = canonical.description || canonical.title || "";

    return {
      "Maintenance ID": canonical.id || "",
      "Event ID": canonical.operationalEventId || "",
      "Facility ID": canonical.facilityId || "",
      "Asset ID": canonical.assetId || "",
      Requester: canonical.reportedByUserId || "",
      Department: canonical.department || "",
      Priority: canonical.priority || "medium",
      Description: description,
      Title: canonical.title || description,
      "Assigned To": canonical.assignedToUserId || "",
      "Date Requested": canonical.reportedAt || canonical.createdAt || "",
      "Date Completed": canonical.completedAt || "",
      "Updated At":
        canonical.updatedAt ||
        canonical.completedAt ||
        canonical.reportedAt ||
        canonical.createdAt ||
        "",
      Status: canonical.status || "requested",
      "Incident ID": canonical.incidentId || "",
      "Work Order IDs": SheetFieldUtils.formatIdList(workOrderIds),
      Source: canonical.source || "manual",
      "Request ID": canonical.sourceRequestId || "",
      "Completion Notes": canonical.completionNotes || "",
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
      var sheetPhase = OperationalListAudit.beginSheetRead_(getSheet_, auditCollector);
      sheet = sheetPhase.sheet;
      values = sheetPhase.values;
    } else {
      sheet = getSheet_();
      values = sheet.getDataRange().getValues();
    }
    if (values.length <= 1) return [];

    var headers = values[0];
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var rows = [];
    var tMap0 = auditCollector ? Date.now() : 0;
    for (var r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var id = SheetFieldUtils.cellText(sheetRow["Maintenance ID"]);
      if (!id) continue;
      rows.push(toCanonical_(sheetRow, headerMap));
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
      if (String(headers[c]).trim() === "Maintenance ID") {
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
      var maintenanceId = String(all[i].id || "");
      var yearMatch = maintenanceId.match(/^MNT-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "MNT-" + year + "-" + padded;
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
      department:
        payload.department != null ? payload.department : current.department,
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
      operationalEventId:
        payload.operationalEventId != null
          ? payload.operationalEventId
          : current.operationalEventId,
      incidentId:
        payload.incidentId != null ? payload.incidentId : current.incidentId,
      sourceRequestId:
        payload.sourceRequestId != null
          ? payload.sourceRequestId
          : current.sourceRequestId,
      workOrderIds: workOrderIds,
      workOrderId: workOrderIds.length ? workOrderIds[0] : undefined,
      reportedAt:
        payload.reportedAt != null
          ? payload.reportedAt
          : current.reportedAt || current.createdAt,
      completedAt:
        payload.completedAt != null ? payload.completedAt : current.completedAt,
      completionNotes:
        payload.completionNotes != null
          ? payload.completionNotes
          : current.completionNotes,
      priority:
        payload.priority != null ? payload.priority : current.priority,
      status: payload.status != null ? payload.status : current.status,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
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
      type: payload.type || "corrective",
      source: payload.source || "manual",
      department: payload.department || "",
      facilityId: payload.facilityId || "",
      assetId: payload.assetId || "",
      reportedByUserId: payload.reportedByUserId || "",
      assignedToUserId: payload.assignedToUserId || "",
      operationalEventId: payload.operationalEventId || "",
      incidentId: payload.incidentId || "",
      sourceRequestId: payload.sourceRequestId || "",
      workOrderIds: workOrderIds,
      workOrderId: workOrderIds.length ? workOrderIds[0] : undefined,
      reportedAt: reportedAt,
      completedAt: payload.completedAt || "",
      completionNotes: payload.completionNotes || "",
      priority: payload.priority || "medium",
      status: payload.status || "requested",
      createdAt: reportedAt,
      updatedAt: reportedAt,
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

  /** First display line for catalog when Title column is empty. */
  function catalogTitleFromDescription_(text) {
    var description = SheetFieldUtils.cellText(text);
    if (!description) return "";
    var blocks = description.split(/\n\n+/);
    var i;
    for (i = 0; i < blocks.length; i++) {
      var block = String(blocks[i] || "").trim();
      if (
        block &&
        !/^(Location|Category|Attachment|Requested by|Reported by):/i.test(
          block
        )
      ) {
        var line = block.split(/\n+/)[0];
        return line ? String(line).trim() : "";
      }
    }
    return "";
  }

  /**
   * Lightweight id/title rows for filter dropdowns.
   * Reads only Maintenance ID + Title (or Description fallback) columns.
   */
  function listCatalog() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    if (!SheetFieldUtils.hasHeader(headerMap, "Maintenance ID")) return [];

    var idCol = headerMap["Maintenance ID"] + 1;
    var titleCol = SheetFieldUtils.hasHeader(headerMap, "Title")
      ? headerMap["Title"] + 1
      : -1;
    var descCol = SheetFieldUtils.hasHeader(headerMap, "Description")
      ? headerMap["Description"] + 1
      : -1;

    var idValues = sheet.getRange(2, idCol, lastRow, idCol).getValues();
    var titleValues =
      titleCol > 0
        ? sheet.getRange(2, titleCol, lastRow, titleCol).getValues()
        : null;
    var descValues =
      !titleValues && descCol > 0
        ? sheet.getRange(2, descCol, lastRow, descCol).getValues()
        : null;

    var rows = [];
    var r;
    for (r = 0; r < idValues.length; r++) {
      var id = SheetFieldUtils.cellText(idValues[r][0]);
      if (!id) continue;

      var title = "";
      if (titleValues) {
        title = SheetFieldUtils.cellText(titleValues[r][0]);
      } else if (descValues) {
        title = catalogTitleFromDescription_(descValues[r][0]);
      }
      if (!title) title = id;

      rows.push({ id: id, title: title });
    }
    return rows;
  }

  return {
    getAll: getAll,
    getById: getById,
    listCatalog: listCatalog,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
