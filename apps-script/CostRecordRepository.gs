/**
 * CostRecordRepository.gs
 *
 * Sheet: COST_RECORDS (source of truth for operational cost records).
 * Auto-creates the sheet with headers on first access if missing.
 *
 * ID format: COST-{YYYY}-{NNNNNN}
 *
 * Schema migration: preserves existing rows when transitioning from
 * Estimated Amount → Budgeted Amount and adds Location column safely.
 */

var CostRecordRepository = (function () {
  var SHEET_NAME = "COST_RECORDS";
  var HEADERS = [
    "Cost ID",
    "Recorded At",
    "Facility ID",
    "Department ID",
    "Location",
    "Work ID",
    "Work Order ID",
    "Job Order ID",
    "Description",
    "Category",
    "Budgeted Amount",
    "Actual Amount",
    "Currency",
    "Reimbursability",
    "Evidence Reference",
    "Evidence File ID",
    "Evidence File Name",
    "Evidence MIME Type",
    "Evidence File Size",
    "Evidence File URL",
    "Recorded By",
  ];
  var LEGACY_ESTIMATED_HEADER = "Estimated Amount";

  var VALID_CATEGORIES = {
    diesel_fuel: true,
    materials: true,
    spare_parts: true,
    labour: true,
    transportation: true,
    equipment: true,
    consumables: true,
    service: true,
    other: true,
  };

  var VALID_REIMBURSABILITY = {
    unknown: true,
    reimbursable: true,
    non_reimbursable: true,
  };

  function normalizeEnum_(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function readAmount_(raw) {
    if (raw === "" || raw == null) return undefined;
    var amount = Number(raw);
    return isFinite(amount) ? amount : undefined;
  }

  function requireAmount_(raw, fieldName) {
    var amount = readAmount_(raw);
    if (amount === undefined || amount < 0) {
      throw new Error(fieldName + " must be a non-negative number.");
    }
    return amount;
  }

  function headerIndex_(headers, name) {
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === name) return c;
    }
    return -1;
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
    headerMap = SheetFieldUtils.getHeaderMap(sheet);
    migrateSchema_(sheet, headerMap);
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  /**
   * Safe in-place migration for live COST_RECORDS sheets:
   * - Adds Location / Budgeted Amount headers without deleting rows
   * - Copies legacy Estimated Amount values into Budgeted Amount when empty
   */
  function migrateSchema_(sheet, headerMap) {
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return;

    var headers = values[0];
    var estimatedCol = headerIndex_(headers, LEGACY_ESTIMATED_HEADER);
    var budgetedCol = headerIndex_(headers, "Budgeted Amount");

    if (estimatedCol !== -1 && budgetedCol !== -1) {
      for (var r = 1; r < values.length; r++) {
        var budgetedVal = values[r][budgetedCol];
        var estimatedVal = values[r][estimatedCol];
        if (
          (budgetedVal === "" || budgetedVal == null) &&
          estimatedVal !== "" &&
          estimatedVal != null
        ) {
          sheet.getRange(r + 1, budgetedCol + 1).setValue(estimatedVal);
        }
      }
    }
  }

  function readBudgetedAmount_(sheetRow) {
    var budgeted = readAmount_(sheetRow["Budgeted Amount"]);
    if (budgeted !== undefined) return budgeted;
    return readAmount_(sheetRow[LEGACY_ESTIMATED_HEADER]);
  }

  function readBudgetedAmountFromPayload_(payload, current) {
    if (payload.budgetedAmount !== undefined) {
      return payload.budgetedAmount === null || payload.budgetedAmount === ""
        ? undefined
        : requireAmount_(payload.budgetedAmount, "Budgeted Amount");
    }
    // Legacy persistence adapter — not exposed on domain type
    if (payload.estimatedAmount !== undefined) {
      return payload.estimatedAmount === null || payload.estimatedAmount === ""
        ? undefined
        : requireAmount_(payload.estimatedAmount, "Budgeted Amount");
    }
    return current.budgetedAmount;
  }

  function toCanonical_(sheetRow) {
    var recordedAt =
      SheetFieldUtils.cellText(sheetRow["Recorded At"]) ||
      new Date().toISOString();
    var budgetedAmount = readBudgetedAmount_(sheetRow);
    var actualAmount = requireAmount_(sheetRow["Actual Amount"], "Actual Amount");
    var evidenceReference = SheetFieldUtils.cellText(sheetRow["Evidence Reference"]);

    return {
      costId: SheetFieldUtils.cellText(sheetRow["Cost ID"]),
      recordedAt: recordedAt,
      facilityId: SheetFieldUtils.cellText(sheetRow["Facility ID"]),
      location: SheetFieldUtils.cellText(sheetRow["Location"]) || "",
      departmentId:
        SheetFieldUtils.cellText(sheetRow["Department ID"]) || undefined,
      workId: SheetFieldUtils.cellText(sheetRow["Work ID"]) || undefined,
      workOrderId:
        SheetFieldUtils.cellText(sheetRow["Work Order ID"]) || undefined,
      jobOrderId:
        SheetFieldUtils.cellText(sheetRow["Job Order ID"]) || undefined,
      description: SheetFieldUtils.cellText(sheetRow["Description"]),
      category: normalizeEnum_(sheetRow["Category"]),
      budgetedAmount: budgetedAmount,
      actualAmount: actualAmount,
      currency: SheetFieldUtils.cellText(sheetRow["Currency"]) || "NGN",
      reimbursability: normalizeEnum_(sheetRow["Reimbursability"]) || "unknown",
      evidence: {
        reference: evidenceReference,
        fileId: SheetFieldUtils.cellText(sheetRow["Evidence File ID"]) || undefined,
        fileName:
          SheetFieldUtils.cellText(sheetRow["Evidence File Name"]) || undefined,
        mimeType:
          SheetFieldUtils.cellText(sheetRow["Evidence MIME Type"]) || undefined,
        sizeBytes: readAmount_(sheetRow["Evidence File Size"]),
        fileUrl:
          SheetFieldUtils.cellText(sheetRow["Evidence File URL"]) || undefined,
      },
      recordedBy: SheetFieldUtils.cellText(sheetRow["Recorded By"]),
    };
  }

  function canonicalToFields_(canonical) {
    return {
      "Cost ID": canonical.costId || "",
      "Recorded At": canonical.recordedAt || "",
      "Facility ID": canonical.facilityId || "",
      "Department ID": canonical.departmentId || "",
      Location: canonical.location || "",
      "Work ID": canonical.workId || "",
      "Work Order ID": canonical.workOrderId || "",
      "Job Order ID": canonical.jobOrderId || "",
      Description: canonical.description || "",
      Category: canonical.category || "",
      "Budgeted Amount":
        canonical.budgetedAmount != null ? canonical.budgetedAmount : "",
      "Actual Amount":
        canonical.actualAmount != null ? canonical.actualAmount : "",
      Currency: canonical.currency || "NGN",
      Reimbursability: canonical.reimbursability || "unknown",
      "Evidence Reference":
        (canonical.evidence && canonical.evidence.reference) || "",
      "Evidence File ID": (canonical.evidence && canonical.evidence.fileId) || "",
      "Evidence File Name":
        (canonical.evidence && canonical.evidence.fileName) || "",
      "Evidence MIME Type":
        (canonical.evidence && canonical.evidence.mimeType) || "",
      "Evidence File Size":
        canonical.evidence && canonical.evidence.sizeBytes != null
          ? canonical.evidence.sizeBytes
          : "",
      "Evidence File URL":
        (canonical.evidence && canonical.evidence.fileUrl) || "",
      "Recorded By": canonical.recordedBy || "",
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
      var costId = SheetFieldUtils.cellText(sheetRow["Cost ID"]);
      if (!costId) continue;
      rows.push(toCanonical_(sheetRow));
    }
    if (auditCollector && typeof OperationalListAudit !== "undefined") {
      OperationalListAudit.finishMapping_(auditCollector, tMap0, rows);
    }
    return rows;
  }

  function getById(costId) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].costId) === String(costId)) return all[i];
    }
    return null;
  }

  function findRowIndex_(costId) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Cost ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol] || "").trim() === String(costId)) {
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
      var costId = String(all[i].costId || "");
      var yearMatch = costId.match(/^COST-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "COST-" + year + "-" + padded;
  }

  function mergeCanonical_(current, payload) {
    payload = payload || {};
    var category =
      payload.category != null
        ? normalizeEnum_(payload.category)
        : current.category;
    if (payload.category != null && !VALID_CATEGORIES[category]) {
      throw new Error("Invalid cost category: " + payload.category);
    }

    var reimbursability =
      payload.reimbursability != null
        ? normalizeEnum_(payload.reimbursability)
        : current.reimbursability;
    if (
      payload.reimbursability != null &&
      !VALID_REIMBURSABILITY[reimbursability]
    ) {
      throw new Error("Invalid reimbursability: " + payload.reimbursability);
    }

    var budgetedAmount = readBudgetedAmountFromPayload_(payload, current);

    var actualAmount =
      payload.actualAmount != null
        ? requireAmount_(payload.actualAmount, "Actual Amount")
        : current.actualAmount;

    var evidence = current.evidence || { reference: "" };
    if (payload.evidence != null) {
      evidence = {
        reference:
          payload.evidence.reference != null
            ? String(payload.evidence.reference).trim()
            : evidence.reference,
        fileId:
          payload.evidence.fileId != null
            ? String(payload.evidence.fileId).trim()
            : evidence.fileId,
        fileName:
          payload.evidence.fileName != null
            ? String(payload.evidence.fileName).trim()
            : evidence.fileName,
        mimeType:
          payload.evidence.mimeType != null
            ? String(payload.evidence.mimeType).trim()
            : evidence.mimeType,
        sizeBytes:
          payload.evidence.sizeBytes != null
            ? requireAmount_(payload.evidence.sizeBytes, "Evidence file size")
            : evidence.sizeBytes,
        fileUrl:
          payload.evidence.fileUrl != null
            ? String(payload.evidence.fileUrl).trim()
            : evidence.fileUrl,
      };
    }

    var location =
      payload.location != null
        ? String(payload.location).trim()
        : current.location || "";

    return {
      costId: current.costId,
      recordedAt: current.recordedAt,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      location: location,
      departmentId:
        payload.departmentId !== undefined
          ? payload.departmentId || undefined
          : current.departmentId,
      workId:
        payload.workId !== undefined ? payload.workId || undefined : current.workId,
      workOrderId:
        payload.workOrderId !== undefined
          ? payload.workOrderId || undefined
          : current.workOrderId,
      jobOrderId:
        payload.jobOrderId !== undefined
          ? payload.jobOrderId || undefined
          : current.jobOrderId,
      description:
        payload.description != null ? payload.description : current.description,
      category: category,
      budgetedAmount: budgetedAmount,
      actualAmount: actualAmount,
      currency: payload.currency != null ? payload.currency : current.currency,
      reimbursability: reimbursability,
      evidence: evidence,
      recordedBy:
        payload.recordedBy != null ? payload.recordedBy : current.recordedBy,
    };
  }

  function create(payload) {
    payload = payload || {};
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var costId = nextId_();
    var category = normalizeEnum_(payload.category);
    if (!VALID_CATEGORIES[category]) {
      throw new Error("Invalid cost category: " + payload.category);
    }
    var reimbursability = normalizeEnum_(
      payload.reimbursability || "unknown"
    );
    if (!VALID_REIMBURSABILITY[reimbursability]) {
      throw new Error("Invalid reimbursability: " + payload.reimbursability);
    }

    var evidenceRef =
      payload.evidence && payload.evidence.reference
        ? String(payload.evidence.reference).trim()
        : "";
    if (!evidenceRef) {
      throw new Error("Evidence reference is required.");
    }

    var location = payload.location ? String(payload.location).trim() : "";
    if (!location) {
      throw new Error("Location is required.");
    }

    var budgetedAmount = readBudgetedAmountFromPayload_(payload, {});

    var canonical = {
      costId: costId,
      recordedAt: payload.recordedAt || now,
      facilityId: payload.facilityId || "",
      location: location,
      departmentId: payload.departmentId || undefined,
      workId: payload.workId || undefined,
      workOrderId: payload.workOrderId || undefined,
      jobOrderId: payload.jobOrderId || undefined,
      description: payload.description || "",
      category: category,
      budgetedAmount: budgetedAmount,
      actualAmount: requireAmount_(payload.actualAmount, "Actual Amount"),
      currency: payload.currency || "NGN",
      reimbursability: reimbursability,
      evidence: {
        reference: evidenceRef,
        fileId:
          payload.evidence && payload.evidence.fileId
            ? String(payload.evidence.fileId).trim()
            : undefined,
        fileName:
          payload.evidence && payload.evidence.fileName
            ? String(payload.evidence.fileName).trim()
            : undefined,
        mimeType:
          payload.evidence && payload.evidence.mimeType
            ? String(payload.evidence.mimeType).trim()
            : undefined,
        sizeBytes:
          payload.evidence && payload.evidence.sizeBytes != null
            ? requireAmount_(payload.evidence.sizeBytes, "Evidence file size")
            : undefined,
        fileUrl:
          payload.evidence && payload.evidence.fileUrl
            ? String(payload.evidence.fileUrl).trim()
            : undefined,
      },
      recordedBy: payload.recordedBy || "",
    };

    ensureHeaders_(sheet);
    var lastCol = sheet.getLastColumn();
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var fields = canonicalToFields_(canonical);
    var row = SheetFieldUtils.buildRowFromFields(headerMap, lastCol, fields);
    sheet.appendRow(row);
    return getById(costId);
  }

  function update(costId, payload) {
    var sheet = getSheet_();
    var rowIndex = findRowIndex_(costId);
    if (rowIndex === -1) return null;
    var current = getById(costId);
    if (!current) return null;
    var updated = mergeCanonical_(current, payload || {});
    if (!updated.evidence || !String(updated.evidence.reference || "").trim()) {
      throw new Error("Evidence reference is required.");
    }
    if (payload && payload.location != null && !String(payload.location).trim()) {
      throw new Error("Location is required.");
    }
    writeRow_(sheet, rowIndex, updated);
    return getById(costId);
  }

  return {
    HEADERS: HEADERS,
    SHEET_NAME: SHEET_NAME,
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
