/**
 * CostSubmissionRepository.gs
 *
 * Sheet: COST_SUBMISSIONS (source of truth for reimbursement claim packages).
 * Auto-creates the sheet with headers on first access if missing.
 *
 * ID format: SUB-{YYYY}-{NNNNNN}
 */

var CostSubmissionRepository = (function () {
  var SHEET_NAME = "COST_SUBMISSIONS";
  var HEADERS = [
    "Submission ID",
    "Status",
    "Currency",
    "Cost Record IDs",
    "Claim Amount",
    "Markup Amount",
    "Markup Rate Percent",
    "No Markup",
    "Facility ID",
    "Department ID",
    "Period Label",
    "Submission Kind",
    "Package Reference",
    "Package Type",
    "Package Date",
    "Package Notes",
    "Ref Issue ID",
    "Ref Request ID",
    "Ref Maintenance ID",
    "Ref Incident ID",
    "Ref Work Order ID",
    "Ref Job Order ID",
    "Ref Facility ID",
    "Ref Contract ID",
    "Execution Kind",
    "Execution ID",
    "Approval ID",
    "Created At",
    "Created By",
    "Submitted At",
    "Submitted By",
    "Queried At",
    "Query Notes",
    "Notes",
  ];

  var VALID_STATUSES = {
    draft: true,
    submitted: true,
    queried: true,
    cancelled: true,
  };

  var VALID_EXECUTION_KINDS = {
    work_order: true,
    job_order: true,
  };

  function readAmount_(raw) {
    if (raw === "" || raw == null) return undefined;
    var amount = Number(raw);
    return isFinite(amount) ? amount : undefined;
  }

  function readBooleanFlag_(raw) {
    if (raw === "" || raw == null) return undefined;
    var text = String(raw).trim().toLowerCase();
    if (text === "true" || text === "yes" || text === "1") return true;
    if (text === "false" || text === "no" || text === "0") return false;
    return undefined;
  }

  function readCostRecordIds_(payload, sheetRow) {
    if (payload && payload.costRecordIds != null) {
      if (Object.prototype.toString.call(payload.costRecordIds) === "[object Array]") {
        return SheetFieldUtils.formatIdList(payload.costRecordIds);
      }
      return SheetFieldUtils.formatIdList(
        SheetFieldUtils.parseIdList(payload.costRecordIds)
      );
    }
    if (payload && payload.costRecordId) {
      return SheetFieldUtils.formatIdList([payload.costRecordId]);
    }
    if (sheetRow) {
      return SheetFieldUtils.formatIdList(
        SheetFieldUtils.parseIdList(sheetRow["Cost Record IDs"])
      );
    }
    return "";
  }

  function readCostRecordIdsFromRow_(sheetRow) {
    return SheetFieldUtils.parseIdList(sheetRow["Cost Record IDs"]);
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

  function mapMarkupFromRow_(sheetRow) {
    var markupAmount = readAmount_(sheetRow["Markup Amount"]);
    var markupRatePercent = readAmount_(sheetRow["Markup Rate Percent"]);
    var noMarkup = readBooleanFlag_(sheetRow["No Markup"]);
    if (
      markupAmount === undefined &&
      markupRatePercent === undefined &&
      noMarkup === undefined
    ) {
      return undefined;
    }
    var markup = {};
    if (markupAmount !== undefined) markup.markupAmount = markupAmount;
    if (markupRatePercent !== undefined) markup.markupRatePercent = markupRatePercent;
    if (noMarkup !== undefined) markup.noMarkup = noMarkup;
    return markup;
  }

  function mapPackageFromRow_(sheetRow) {
    var reference = SheetFieldUtils.cellText(sheetRow["Package Reference"]);
    var packageType = SheetFieldUtils.cellText(sheetRow["Package Type"]);
    var packageDate = SheetFieldUtils.cellText(sheetRow["Package Date"]);
    var notes = SheetFieldUtils.cellText(sheetRow["Package Notes"]);
    if (!reference && !packageType && !packageDate && !notes) return undefined;
    return {
      reference: reference || undefined,
      packageType: packageType || undefined,
      packageDate: packageDate || undefined,
      notes: notes || undefined,
    };
  }

  function mapRefsFromRow_(sheetRow) {
    var refs = {
      issueId: SheetFieldUtils.cellText(sheetRow["Ref Issue ID"]) || undefined,
      requestId:
        SheetFieldUtils.cellText(sheetRow["Ref Request ID"]) || undefined,
      maintenanceId:
        SheetFieldUtils.cellText(sheetRow["Ref Maintenance ID"]) || undefined,
      incidentId:
        SheetFieldUtils.cellText(sheetRow["Ref Incident ID"]) || undefined,
      workOrderId:
        SheetFieldUtils.cellText(sheetRow["Ref Work Order ID"]) || undefined,
      jobOrderId:
        SheetFieldUtils.cellText(sheetRow["Ref Job Order ID"]) || undefined,
      facilityId:
        SheetFieldUtils.cellText(sheetRow["Ref Facility ID"]) || undefined,
      contractId:
        SheetFieldUtils.cellText(sheetRow["Ref Contract ID"]) || undefined,
    };
    var hasAny = false;
    for (var key in refs) {
      if (refs.hasOwnProperty(key) && refs[key]) {
        hasAny = true;
        break;
      }
    }
    return hasAny ? refs : undefined;
  }

  function toCanonical_(sheetRow) {
    var status = SheetFieldUtils.cellText(sheetRow["Status"]) || "draft";
    return {
      submissionId: SheetFieldUtils.cellText(sheetRow["Submission ID"]),
      status: status,
      currency: SheetFieldUtils.cellText(sheetRow["Currency"]) || "NGN",
      costRecordIds: readCostRecordIdsFromRow_(sheetRow),
      claimAmount: readAmount_(sheetRow["Claim Amount"]),
      markup: mapMarkupFromRow_(sheetRow),
      facilityId: SheetFieldUtils.cellText(sheetRow["Facility ID"]) || undefined,
      departmentId:
        SheetFieldUtils.cellText(sheetRow["Department ID"]) || undefined,
      periodLabel: SheetFieldUtils.cellText(sheetRow["Period Label"]) || undefined,
      submissionKind:
        SheetFieldUtils.cellText(sheetRow["Submission Kind"]) || undefined,
      submissionPackage: mapPackageFromRow_(sheetRow),
      refs: mapRefsFromRow_(sheetRow),
      executionKind:
        SheetFieldUtils.cellText(sheetRow["Execution Kind"]) || undefined,
      executionId: SheetFieldUtils.cellText(sheetRow["Execution ID"]) || undefined,
      approvalId: SheetFieldUtils.cellText(sheetRow["Approval ID"]) || undefined,
      createdAt:
        SheetFieldUtils.cellText(sheetRow["Created At"]) ||
        new Date().toISOString(),
      createdBy: SheetFieldUtils.cellText(sheetRow["Created By"]),
      submittedAt: SheetFieldUtils.cellText(sheetRow["Submitted At"]) || undefined,
      submittedBy: SheetFieldUtils.cellText(sheetRow["Submitted By"]) || undefined,
      queriedAt: SheetFieldUtils.cellText(sheetRow["Queried At"]) || undefined,
      queryNotes: SheetFieldUtils.cellText(sheetRow["Query Notes"]) || undefined,
      notes: SheetFieldUtils.cellText(sheetRow["Notes"]) || undefined,
    };
  }

  function canonicalToFields_(canonical) {
    var markup = canonical.markup || {};
    var pkg = canonical.submissionPackage || {};
    var refs = canonical.refs || {};
    return {
      "Submission ID": canonical.submissionId || "",
      Status: canonical.status || "draft",
      Currency: canonical.currency || "NGN",
      "Cost Record IDs": SheetFieldUtils.formatIdList(
        canonical.costRecordIds || []
      ),
      "Claim Amount":
        canonical.claimAmount != null ? canonical.claimAmount : "",
      "Markup Amount": markup.markupAmount != null ? markup.markupAmount : "",
      "Markup Rate Percent":
        markup.markupRatePercent != null ? markup.markupRatePercent : "",
      "No Markup":
        markup.noMarkup === true
          ? "true"
          : markup.noMarkup === false
            ? "false"
            : "",
      "Facility ID": canonical.facilityId || "",
      "Department ID": canonical.departmentId || "",
      "Period Label": canonical.periodLabel || "",
      "Submission Kind": canonical.submissionKind || "",
      "Package Reference": pkg.reference || "",
      "Package Type": pkg.packageType || "",
      "Package Date": pkg.packageDate || "",
      "Package Notes": pkg.notes || "",
      "Ref Issue ID": refs.issueId || "",
      "Ref Request ID": refs.requestId || "",
      "Ref Maintenance ID": refs.maintenanceId || "",
      "Ref Incident ID": refs.incidentId || "",
      "Ref Work Order ID": refs.workOrderId || "",
      "Ref Job Order ID": refs.jobOrderId || "",
      "Ref Facility ID": refs.facilityId || "",
      "Ref Contract ID": refs.contractId || "",
      "Execution Kind": canonical.executionKind || "",
      "Execution ID": canonical.executionId || "",
      "Approval ID": canonical.approvalId || "",
      "Created At": canonical.createdAt || "",
      "Created By": canonical.createdBy || "",
      "Submitted At": canonical.submittedAt || "",
      "Submitted By": canonical.submittedBy || "",
      "Queried At": canonical.queriedAt || "",
      "Query Notes": canonical.queryNotes || "",
      Notes: canonical.notes || "",
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
      var submissionId = SheetFieldUtils.cellText(sheetRow["Submission ID"]);
      if (!submissionId) continue;
      rows.push(toCanonical_(sheetRow));
    }
    if (auditCollector && typeof OperationalListAudit !== "undefined") {
      OperationalListAudit.finishMapping_(auditCollector, tMap0, rows);
    }
    return rows;
  }

  function getById(submissionId) {
    var all = getAll();
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].submissionId) === String(submissionId)) return all[i];
    }
    return null;
  }

  function findRowIndex_(submissionId) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Submission ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol] || "").trim() === String(submissionId)) {
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
      var submissionId = String(all[i].submissionId || "");
      var yearMatch = submissionId.match(/^SUB-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "SUB-" + year + "-" + padded;
  }

  function readMarkupFromPayload_(payload, current) {
    current = current || {};
    if (payload.markup === null) return undefined;
    if (payload.markup != null) {
      var markup = payload.markup;
      return {
        markupAmount:
          markup.markupAmount != null
            ? readAmount_(markup.markupAmount)
            : current.markupAmount,
        markupRatePercent:
          markup.markupRatePercent != null
            ? readAmount_(markup.markupRatePercent)
            : current.markupRatePercent,
        noMarkup:
          markup.noMarkup != null ? !!markup.noMarkup : current.noMarkup,
      };
    }
    return current.markup;
  }

  function readPackageFromPayload_(payload, current) {
    current = current || {};
    if (payload.submissionPackage === null) return undefined;
    if (payload.submissionPackage != null) {
      var pkg = payload.submissionPackage;
      return {
        reference:
          pkg.reference != null ? String(pkg.reference).trim() : current.reference,
        packageType:
          pkg.packageType != null
            ? String(pkg.packageType).trim()
            : current.packageType,
        packageDate:
          pkg.packageDate != null
            ? String(pkg.packageDate).trim()
            : current.packageDate,
        notes: pkg.notes != null ? String(pkg.notes).trim() : current.notes,
      };
    }
    return current.submissionPackage;
  }

  function readRefsFromPayload_(payload, current) {
    current = current || {};
    if (payload.refs === null) return undefined;
    if (payload.refs != null) {
      var refs = payload.refs;
      return {
        issueId:
          refs.issueId !== undefined ? refs.issueId || undefined : current.issueId,
        requestId:
          refs.requestId !== undefined
            ? refs.requestId || undefined
            : current.requestId,
        maintenanceId:
          refs.maintenanceId !== undefined
            ? refs.maintenanceId || undefined
            : current.maintenanceId,
        incidentId:
          refs.incidentId !== undefined
            ? refs.incidentId || undefined
            : current.incidentId,
        workOrderId:
          refs.workOrderId !== undefined
            ? refs.workOrderId || undefined
            : current.workOrderId,
        jobOrderId:
          refs.jobOrderId !== undefined
            ? refs.jobOrderId || undefined
            : current.jobOrderId,
        facilityId:
          refs.facilityId !== undefined
            ? refs.facilityId || undefined
            : current.facilityId,
        contractId:
          refs.contractId !== undefined
            ? refs.contractId || undefined
            : current.contractId,
      };
    }
    return current.refs;
  }

  function mergeCanonical_(current, payload) {
    payload = payload || {};
    var status =
      payload.status != null
        ? String(payload.status).trim().toLowerCase()
        : current.status;
    if (payload.status != null && !VALID_STATUSES[status]) {
      throw new Error("Invalid submission status: " + payload.status);
    }

    var executionKind =
      payload.executionKind !== undefined
        ? payload.executionKind
          ? String(payload.executionKind).trim().toLowerCase()
          : undefined
        : current.executionKind;
    if (
      executionKind &&
      !VALID_EXECUTION_KINDS[executionKind]
    ) {
      throw new Error("Invalid execution kind: " + payload.executionKind);
    }

    var costRecordIds =
      payload.costRecordIds != null || payload.costRecordId != null
        ? SheetFieldUtils.parseIdList(readCostRecordIds_(payload))
        : current.costRecordIds || [];

    var claimAmount =
      payload.claimAmount !== undefined
        ? payload.claimAmount === null || payload.claimAmount === ""
          ? undefined
          : readAmount_(payload.claimAmount)
        : current.claimAmount;

    return {
      submissionId: current.submissionId,
      status: status,
      currency: payload.currency != null ? payload.currency : current.currency,
      costRecordIds: costRecordIds,
      claimAmount: claimAmount,
      markup: readMarkupFromPayload_(payload, current.markup || {}),
      facilityId:
        payload.facilityId !== undefined
          ? payload.facilityId || undefined
          : current.facilityId,
      departmentId:
        payload.departmentId !== undefined
          ? payload.departmentId || undefined
          : current.departmentId,
      periodLabel:
        payload.periodLabel !== undefined
          ? payload.periodLabel || undefined
          : current.periodLabel,
      submissionKind:
        payload.submissionKind !== undefined
          ? payload.submissionKind || undefined
          : current.submissionKind,
      submissionPackage: readPackageFromPayload_(
        payload,
        current.submissionPackage || {}
      ),
      refs: readRefsFromPayload_(payload, current.refs || {}),
      executionKind: executionKind,
      executionId:
        payload.executionId !== undefined
          ? payload.executionId || undefined
          : current.executionId,
      approvalId:
        payload.approvalId !== undefined
          ? payload.approvalId || undefined
          : current.approvalId,
      createdAt: current.createdAt,
      createdBy:
        payload.createdBy != null ? payload.createdBy : current.createdBy,
      submittedAt:
        payload.submittedAt !== undefined
          ? payload.submittedAt || undefined
          : current.submittedAt,
      submittedBy:
        payload.submittedBy !== undefined
          ? payload.submittedBy || undefined
          : current.submittedBy,
      queriedAt:
        payload.queriedAt !== undefined
          ? payload.queriedAt || undefined
          : current.queriedAt,
      queryNotes:
        payload.queryNotes !== undefined
          ? payload.queryNotes || undefined
          : current.queryNotes,
      notes:
        payload.notes !== undefined ? payload.notes || undefined : current.notes,
    };
  }

  function create(payload) {
    payload = payload || {};
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var submissionId = nextId_();
    var status = String(payload.status || "draft").trim().toLowerCase();
    if (!VALID_STATUSES[status]) {
      throw new Error("Invalid submission status: " + payload.status);
    }

    var executionKind = payload.executionKind
      ? String(payload.executionKind).trim().toLowerCase()
      : undefined;
    if (executionKind && !VALID_EXECUTION_KINDS[executionKind]) {
      throw new Error("Invalid execution kind: " + payload.executionKind);
    }

    var canonical = {
      submissionId: submissionId,
      status: status,
      currency: payload.currency || "NGN",
      costRecordIds: SheetFieldUtils.parseIdList(readCostRecordIds_(payload)),
      claimAmount:
        payload.claimAmount != null && payload.claimAmount !== ""
          ? readAmount_(payload.claimAmount)
          : undefined,
      markup: readMarkupFromPayload_(payload, {}),
      facilityId: payload.facilityId || undefined,
      departmentId: payload.departmentId || undefined,
      periodLabel: payload.periodLabel || undefined,
      submissionKind: payload.submissionKind || undefined,
      submissionPackage: readPackageFromPayload_(payload, {}),
      refs: readRefsFromPayload_(payload, {}),
      executionKind: executionKind,
      executionId: payload.executionId || undefined,
      approvalId: payload.approvalId || undefined,
      createdAt: payload.createdAt || now,
      createdBy: payload.createdBy || "",
      submittedAt: payload.submittedAt || undefined,
      submittedBy: payload.submittedBy || undefined,
      queriedAt: payload.queriedAt || undefined,
      queryNotes: payload.queryNotes || undefined,
      notes: payload.notes || undefined,
    };

    var rowIndex = sheet.getLastRow() + 1;
    writeRow_(sheet, rowIndex, canonical);
    return canonical;
  }

  function update(submissionId, payload) {
    var rowIndex = findRowIndex_(submissionId);
    if (rowIndex === -1) return null;
    var current = getById(submissionId);
    if (!current) return null;
    var merged = mergeCanonical_(current, payload);
    var sheet = getSheet_();
    writeRow_(sheet, rowIndex, merged);
    return merged;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
