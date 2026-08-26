/**
 * ApprovalRepository.gs
 *
 * Sheet: Approvals (source of truth).
 * Formal client / authority approval requests linked to Work Orders.
 * IDs: APR-{YYYY}-{######}
 * Work Orders may exist without an Approval.
 *
 * Lifecycle statuses (persisted):
 * draft → awaiting_submission → awaiting_response → approved|rejected → closed
 * Also: returned, cancelled, expired
 * Follow-up is an activity (Activity Log), not a status.
 */

var ApprovalRepository = (function () {
  var SHEET_CANDIDATES = ["Approvals", "APPROVALS", "Approval Requests"];

  var HEADERS = [
    "Approval ID",
    "Title",
    "Type",
    "Work Order ID",
    "Facility ID",
    "Asset ID",
    "Status",
    "Description",
    "Reason",
    "Cover Letter",
    "Template ID",
    "Client Name",
    "Client Address",
    "Approval Amount",
    "Approved Amount",
    "Currency",
    "Requested By",
    "Approved By",
    "Generated At",
    "Submitted At",
    "Decision At",
    "Decision Notes",
    "Decision Outcome",
    "Decision Reference",
    "Expires At",
    "Submission Method",
    "Submitted To",
    "Submission Reference",
    "Acknowledgement File Name",
    "Acknowledgement File Mime",
    "Acknowledgement File Size",
    "Decision Document File Name",
    "Decision Document File Mime",
    "Decision Document File Size",
    "Last Follow-up At",
    "Last Activity At",
    "Last Activity Summary",
    "Activity Log",
    "Created At",
    "Updated At",
  ];

  function getSpreadsheet_() {
    return SpreadsheetApp.getActiveSpreadsheet();
  }

  function getSheet_() {
    var ss = getSpreadsheet_();
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
        if (String(headers[h]).trim() === "Approval ID") {
          return candidate;
        }
      }
    }

    sheet = ss.insertSheet("Approvals");
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return sheet;
  }

  function ensureHeaders_(sheet) {
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
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

  function mapStatus_(raw) {
    var value = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    // Canonical: draft | awaiting_decision | approved | rejected | returned | cancelled | expired | closed
    // Unknown values must NOT silently become draft when they are submit aliases —
    // that caused submittedAt to persist while Status stayed Draft.
    var allowed = {
      draft: "draft",
      generated: "draft",
      awaiting_submission: "draft",
      submitted: "awaiting_decision",
      awaiting_response: "awaiting_decision",
      awaiting_decision: "awaiting_decision",
      approved: "approved",
      rejected: "rejected",
      returned: "returned",
      returned_for_clarification: "returned",
      query: "returned",
      cancelled: "cancelled",
      canceled: "cancelled",
      expired: "expired",
      closed: "closed",
    };
    if (allowed[value]) return allowed[value];
    // Preserve unrecognized non-empty tokens rather than forcing draft.
    return value || "draft";
  }

  function healStatus_(status, submittedAt) {
    var hasSubmitted = String(submittedAt || "").trim() !== "";
    if (
      hasSubmitted &&
      (status === "draft" ||
        status === "generated" ||
        status === "awaiting_submission")
    ) {
      return "awaiting_decision";
    }
    return status;
  }

  function mapType_(raw) {
    var value = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    var allowed = {
      standard_maintenance: "standard_maintenance",
      variation: "variation",
      additional_works: "variation",
      equipment_replacement: "equipment_replacement",
      emergency: "emergency",
      emergency_works: "emergency",
    };
    return allowed[value] || "standard_maintenance";
  }

  function mapDecisionOutcome_(raw) {
    var value = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (
      value === "approved" ||
      value === "rejected" ||
      value === "partially_approved"
    ) {
      return value;
    }
    return "";
  }

  function readAmount_(raw) {
    if (raw === "" || raw == null) return undefined;
    var amount = Number(raw);
    return isFinite(amount) ? amount : undefined;
  }

  function readSize_(raw) {
    if (raw === "" || raw == null) return undefined;
    var n = Number(raw);
    return isFinite(n) ? n : undefined;
  }

  function toCanonical_(sheetRow) {
    var createdAt =
      SheetFieldUtils.cellText(sheetRow["Created At"]) ||
      SheetFieldUtils.cellText(sheetRow["Generated At"]) ||
      new Date().toISOString();
    var updatedAt =
      SheetFieldUtils.cellText(sheetRow["Updated At"]) || createdAt;

    return {
      id: SheetFieldUtils.cellText(sheetRow["Approval ID"]),
      title: SheetFieldUtils.cellText(sheetRow["Title"]) || "",
      type: mapType_(sheetRow["Type"]),
      workOrderId: SheetFieldUtils.cellText(sheetRow["Work Order ID"]) || "",
      facilityId: SheetFieldUtils.cellText(sheetRow["Facility ID"]) || "",
      assetId: SheetFieldUtils.cellText(sheetRow["Asset ID"]) || undefined,
      status: healStatus_(
        mapStatus_(sheetRow["Status"]),
        SheetFieldUtils.cellText(sheetRow["Submitted At"])
      ),
      description:
        SheetFieldUtils.cellText(sheetRow["Description"]) || undefined,
      reason: SheetFieldUtils.cellText(sheetRow["Reason"]) || undefined,
      coverLetter:
        SheetFieldUtils.cellText(sheetRow["Cover Letter"]) || undefined,
      templateId:
        SheetFieldUtils.cellText(sheetRow["Template ID"]) || undefined,
      clientName:
        SheetFieldUtils.cellText(sheetRow["Client Name"]) || undefined,
      clientAddress:
        SheetFieldUtils.cellText(sheetRow["Client Address"]) || undefined,
      approvalAmount: readAmount_(sheetRow["Approval Amount"]),
      approvedAmount: readAmount_(sheetRow["Approved Amount"]),
      currency: SheetFieldUtils.cellText(sheetRow["Currency"]) || undefined,
      requestedByUserId:
        SheetFieldUtils.cellText(sheetRow["Requested By"]) || undefined,
      approvedByUserId:
        SheetFieldUtils.cellText(sheetRow["Approved By"]) || undefined,
      generatedAt:
        SheetFieldUtils.cellText(sheetRow["Generated At"]) || undefined,
      submittedAt:
        SheetFieldUtils.cellText(sheetRow["Submitted At"]) || undefined,
      decisionAt:
        SheetFieldUtils.cellText(sheetRow["Decision At"]) || undefined,
      decisionNotes:
        SheetFieldUtils.cellText(sheetRow["Decision Notes"]) || undefined,
      decisionOutcome:
        mapDecisionOutcome_(sheetRow["Decision Outcome"]) || undefined,
      decisionReference:
        SheetFieldUtils.cellText(sheetRow["Decision Reference"]) || undefined,
      expiresAt: SheetFieldUtils.cellText(sheetRow["Expires At"]) || undefined,
      submissionMethod:
        SheetFieldUtils.cellText(sheetRow["Submission Method"]) || undefined,
      submittedTo:
        SheetFieldUtils.cellText(sheetRow["Submitted To"]) || undefined,
      submissionReference:
        SheetFieldUtils.cellText(sheetRow["Submission Reference"]) || undefined,
      acknowledgementFileName:
        SheetFieldUtils.cellText(sheetRow["Acknowledgement File Name"]) ||
        undefined,
      acknowledgementFileMime:
        SheetFieldUtils.cellText(sheetRow["Acknowledgement File Mime"]) ||
        undefined,
      acknowledgementFileSize: readSize_(
        sheetRow["Acknowledgement File Size"]
      ),
      decisionDocumentFileName:
        SheetFieldUtils.cellText(sheetRow["Decision Document File Name"]) ||
        undefined,
      decisionDocumentFileMime:
        SheetFieldUtils.cellText(sheetRow["Decision Document File Mime"]) ||
        undefined,
      decisionDocumentFileSize: readSize_(
        sheetRow["Decision Document File Size"]
      ),
      lastFollowUpAt:
        SheetFieldUtils.cellText(sheetRow["Last Follow-up At"]) || undefined,
      lastActivityAt:
        SheetFieldUtils.cellText(sheetRow["Last Activity At"]) || undefined,
      lastActivitySummary:
        SheetFieldUtils.cellText(sheetRow["Last Activity Summary"]) ||
        undefined,
      activityLog: SheetFieldUtils.cellText(sheetRow["Activity Log"]) || undefined,
      createdAt: createdAt,
      updatedAt: updatedAt,
    };
  }

  function canonicalToFields_(canonical) {
    return {
      "Approval ID": canonical.id || "",
      Title: canonical.title || "",
      Type: canonical.type || "standard_maintenance",
      "Work Order ID": canonical.workOrderId || "",
      "Facility ID": canonical.facilityId || "",
      "Asset ID": canonical.assetId || "",
      Status: canonical.status || "draft",
      Description: canonical.description || "",
      Reason: canonical.reason || "",
      "Cover Letter": canonical.coverLetter || "",
      "Template ID": canonical.templateId || "",
      "Client Name": canonical.clientName || "",
      "Client Address": canonical.clientAddress || "",
      "Approval Amount":
        canonical.approvalAmount != null && canonical.approvalAmount !== ""
          ? canonical.approvalAmount
          : "",
      "Approved Amount":
        canonical.approvedAmount != null && canonical.approvedAmount !== ""
          ? canonical.approvedAmount
          : "",
      Currency: canonical.currency || "",
      "Requested By": canonical.requestedByUserId || "",
      "Approved By": canonical.approvedByUserId || "",
      "Generated At": canonical.generatedAt || "",
      "Submitted At": canonical.submittedAt || "",
      "Decision At": canonical.decisionAt || "",
      "Decision Notes": canonical.decisionNotes || "",
      "Decision Outcome": canonical.decisionOutcome || "",
      "Decision Reference": canonical.decisionReference || "",
      "Expires At": canonical.expiresAt || "",
      "Submission Method": canonical.submissionMethod || "",
      "Submitted To": canonical.submittedTo || "",
      "Submission Reference": canonical.submissionReference || "",
      "Acknowledgement File Name": canonical.acknowledgementFileName || "",
      "Acknowledgement File Mime": canonical.acknowledgementFileMime || "",
      "Acknowledgement File Size":
        canonical.acknowledgementFileSize != null
          ? canonical.acknowledgementFileSize
          : "",
      "Decision Document File Name": canonical.decisionDocumentFileName || "",
      "Decision Document File Mime": canonical.decisionDocumentFileMime || "",
      "Decision Document File Size":
        canonical.decisionDocumentFileSize != null
          ? canonical.decisionDocumentFileSize
          : "",
      "Last Follow-up At": canonical.lastFollowUpAt || "",
      "Last Activity At": canonical.lastActivityAt || "",
      "Last Activity Summary": canonical.lastActivitySummary || "",
      "Activity Log": canonical.activityLog || "",
      "Created At": canonical.createdAt || "",
      "Updated At": canonical.updatedAt || "",
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
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var id = SheetFieldUtils.cellText(sheetRow["Approval ID"]);
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
      if (String(headers[c]).trim() === "Approval ID") {
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
      var approvalId = String(all[i].id || "");
      var yearMatch = approvalId.match(/^APR-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "APR-" + year + "-" + padded;
  }

  function mergeAmount_(payloadValue, currentValue) {
    if (payloadValue === undefined) return currentValue;
    if (payloadValue === "" || payloadValue === null) return undefined;
    var num = Number(payloadValue);
    return isFinite(num) ? num : currentValue;
  }

  function mergeSize_(payloadValue, currentValue) {
    if (payloadValue === undefined) return currentValue;
    if (payloadValue === "" || payloadValue === null) return undefined;
    var num = Number(payloadValue);
    return isFinite(num) ? num : currentValue;
  }

  function mergeCanonical_(current, payload) {
    var nextStatus =
      payload.status != null ? mapStatus_(payload.status) : current.status;
    var nextSubmittedAt =
      payload.submittedAt != null ? payload.submittedAt : current.submittedAt;
    nextStatus = healStatus_(nextStatus, nextSubmittedAt);

    return {
      id: current.id,
      title: payload.title != null ? payload.title : current.title,
      type: payload.type != null ? mapType_(payload.type) : current.type,
      workOrderId:
        payload.workOrderId != null ? payload.workOrderId : current.workOrderId,
      facilityId:
        payload.facilityId != null ? payload.facilityId : current.facilityId,
      assetId: payload.assetId != null ? payload.assetId : current.assetId,
      status: nextStatus,
      description:
        payload.description != null ? payload.description : current.description,
      reason: payload.reason != null ? payload.reason : current.reason,
      coverLetter:
        payload.coverLetter != null ? payload.coverLetter : current.coverLetter,
      templateId:
        payload.templateId != null ? payload.templateId : current.templateId,
      clientName:
        payload.clientName != null ? payload.clientName : current.clientName,
      clientAddress:
        payload.clientAddress != null
          ? payload.clientAddress
          : current.clientAddress,
      approvalAmount: mergeAmount_(
        payload.approvalAmount,
        current.approvalAmount
      ),
      approvedAmount: mergeAmount_(
        payload.approvedAmount,
        current.approvedAmount
      ),
      currency: payload.currency != null ? payload.currency : current.currency,
      requestedByUserId:
        payload.requestedByUserId != null
          ? payload.requestedByUserId
          : current.requestedByUserId,
      approvedByUserId:
        payload.approvedByUserId != null
          ? payload.approvedByUserId
          : current.approvedByUserId,
      generatedAt:
        payload.generatedAt != null ? payload.generatedAt : current.generatedAt,
      submittedAt:
        payload.submittedAt != null ? payload.submittedAt : current.submittedAt,
      decisionAt:
        payload.decisionAt != null ? payload.decisionAt : current.decisionAt,
      decisionNotes:
        payload.decisionNotes != null
          ? payload.decisionNotes
          : current.decisionNotes,
      decisionOutcome:
        payload.decisionOutcome != null
          ? mapDecisionOutcome_(payload.decisionOutcome) || undefined
          : current.decisionOutcome,
      decisionReference:
        payload.decisionReference != null
          ? payload.decisionReference
          : current.decisionReference,
      expiresAt:
        payload.expiresAt != null ? payload.expiresAt : current.expiresAt,
      submissionMethod:
        payload.submissionMethod != null
          ? payload.submissionMethod
          : current.submissionMethod,
      submittedTo:
        payload.submittedTo != null ? payload.submittedTo : current.submittedTo,
      submissionReference:
        payload.submissionReference != null
          ? payload.submissionReference
          : current.submissionReference,
      acknowledgementFileName:
        payload.acknowledgementFileName != null
          ? payload.acknowledgementFileName
          : current.acknowledgementFileName,
      acknowledgementFileMime:
        payload.acknowledgementFileMime != null
          ? payload.acknowledgementFileMime
          : current.acknowledgementFileMime,
      acknowledgementFileSize: mergeSize_(
        payload.acknowledgementFileSize,
        current.acknowledgementFileSize
      ),
      decisionDocumentFileName:
        payload.decisionDocumentFileName != null
          ? payload.decisionDocumentFileName
          : current.decisionDocumentFileName,
      decisionDocumentFileMime:
        payload.decisionDocumentFileMime != null
          ? payload.decisionDocumentFileMime
          : current.decisionDocumentFileMime,
      decisionDocumentFileSize: mergeSize_(
        payload.decisionDocumentFileSize,
        current.decisionDocumentFileSize
      ),
      lastFollowUpAt:
        payload.lastFollowUpAt != null
          ? payload.lastFollowUpAt
          : current.lastFollowUpAt,
      lastActivityAt:
        payload.lastActivityAt != null
          ? payload.lastActivityAt
          : current.lastActivityAt,
      lastActivitySummary:
        payload.lastActivitySummary != null
          ? payload.lastActivitySummary
          : current.lastActivitySummary,
      activityLog:
        payload.activityLog != null ? payload.activityLog : current.activityLog,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    var status = mapStatus_(payload.status || "draft");
    var generatedAt =
      payload.generatedAt ||
      (status === "draft" || status === "awaiting_decision" ? now : "");

    var canonical = {
      id: id,
      title: payload.title || "Approval request",
      type: mapType_(payload.type || "standard_maintenance"),
      workOrderId: payload.workOrderId || "",
      facilityId: payload.facilityId || "",
      assetId: payload.assetId || "",
      status: status,
      description: payload.description || "",
      reason: payload.reason || "",
      coverLetter: payload.coverLetter || "",
      templateId: payload.templateId || "",
      clientName: payload.clientName || "",
      clientAddress: payload.clientAddress || "",
      approvalAmount: readAmount_(payload.approvalAmount),
      approvedAmount: readAmount_(payload.approvedAmount),
      currency: payload.currency || "",
      requestedByUserId: payload.requestedByUserId || "",
      approvedByUserId: payload.approvedByUserId || "",
      generatedAt: generatedAt,
      submittedAt: payload.submittedAt || "",
      decisionAt: payload.decisionAt || "",
      decisionNotes: payload.decisionNotes || "",
      decisionOutcome: mapDecisionOutcome_(payload.decisionOutcome) || "",
      decisionReference: payload.decisionReference || "",
      expiresAt: payload.expiresAt || "",
      submissionMethod: payload.submissionMethod || "",
      submittedTo: payload.submittedTo || "",
      submissionReference: payload.submissionReference || "",
      acknowledgementFileName: payload.acknowledgementFileName || "",
      acknowledgementFileMime: payload.acknowledgementFileMime || "",
      acknowledgementFileSize: readSize_(payload.acknowledgementFileSize),
      decisionDocumentFileName: payload.decisionDocumentFileName || "",
      decisionDocumentFileMime: payload.decisionDocumentFileMime || "",
      decisionDocumentFileSize: readSize_(payload.decisionDocumentFileSize),
      lastFollowUpAt: payload.lastFollowUpAt || "",
      lastActivityAt: payload.lastActivityAt || now,
      lastActivitySummary:
        payload.lastActivitySummary || "Approval request created",
      activityLog: payload.activityLog || "",
      createdAt: now,
      updatedAt: now,
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
