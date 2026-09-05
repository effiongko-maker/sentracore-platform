# SentraCore Apps Script Deployment Pack

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: npm run apps-script:pack -->

Generated: 2026-09-04T12:55:50.178Z

This document is the **single source of truth** for copying Apps Script
source into the Google Apps Script project.

For each file below:
1. Open or create a script file with the exact `FILE:` name.
2. Replace the entire contents with the block under that heading.
3. Save.

Then follow `DEPLOYMENT_CHECKLIST.md`.

## File index

- ROUTER.gs
- ApprovalRepository.gs
- AssetRepository.gs
- CostRecordRepository.gs
- CostSubmissionRepository.gs
- FacilityRepository.gs
- IncidentRepository.gs
- MaintenanceRepository.gs
- MasterDataRepository.gs
- ReimbursementAuthorizationRepository.gs
- ReimbursementPaymentRepository.gs
- ReportingSnapshotRepository.gs
- RequestRepository.gs
- UserRepository.gs
- WorkOrderRepository.gs
- ApprovalService.gs
- AssetService.gs
- CatalogCacheService.gs
- CostRecordService.gs
- CostSubmissionService.gs
- FacilityService.gs
- IncidentService.gs
- MaintenanceService.gs
- MasterDataService.gs
- OperationalWorkloadService.gs
- ReimbursementAuthorizationService.gs
- ReimbursementPaymentService.gs
- ReportingSnapshotService.gs
- RequestService.gs
- RequestTreatmentService.gs
- UserService.gs
- WorkOrderMaintenanceMutationService.gs
- WorkOrderService.gs
- ApprovalsController.gs
- AssetsController.gs
- CostRecordsController.gs
- CostSubmissionsController.gs
- FacilitiesController.gs
- IncidentsController.gs
- MaintenanceController.gs
- MasterDataController.gs
- OperationalWorkloadController.gs
- ReimbursementAuthorizationsController.gs
- ReimbursementPaymentsController.gs
- ReportingSnapshotController.gs
- RequestsController.gs
- UsersController.gs
- WorkOrdersController.gs
- OperationalListAudit.gs
- OperationalRegisterCache.gs
- ReportingSnapshotTriggers.gs
- RequestTreatmentLinkSpike.gs
- RequestTreatmentMutationSpike.gs
- SheetFieldUtils.gs

======================================
FILE:
ROUTER.gs
======================================

```javascript
/**
 * ROUTER.gs
 *
 * Production Apps Script entrypoint for SentraCore.
 * Copy this file into the Apps Script project as ROUTER.gs (or replace the
 * existing doPost / jsonResponse_ helpers with this complete file).
 *
 * Request envelope:
 * {
 *   resource: "users" | "facilities" | "assets" | "work-orders" |
 *             "incidents" | "maintenance" | "approvals" | "requests" |
 *             "master-data" | "reporting-snapshot" | "operational-workload" |
 *             "cost-records" | "cost-submissions" | "reimbursement-payments" |
 *             "reimbursement-authorizations",
 *   action: string,
 *   payload: object
 * }
 *
 * `module` is accepted as an alias for `resource` for backwards compatibility.
 */

function jsonResponse_(success, message, data, meta) {
  var payload = {
    success: !!success,
    message: message == null ? "" : String(message),
    data: data === undefined ? null : data,
  };
  if (meta && typeof meta === "object") {
    payload.meta = meta;
  }
  var text;
  try {
    text = JSON.stringify(payload);
  } catch (err) {
    text = JSON.stringify({
      success: false,
      message: "Failed to serialise Apps Script response.",
      data: null,
      meta: { errorClass: "serialization" },
    });
  }
  // ContentService accepts Unicode strings; do not pass through ByteString APIs.
  return ContentService.createTextOutput(text).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Classify Apps Script failures for client diagnostics (not end-user copy). */
function classifyAppsScriptError_(error) {
  var message = (error && error.message) || String(error || "");
  var lower = message.toLowerCase();
  if (
    /missing headers|missing required|is required|validation|invalid|cannot write sheet fields/.test(
      lower
    )
  ) {
    return { errorClass: "validation", retryable: false };
  }
  if (/timed out|timeout|exceeded maximum execution|service invoked too many/.test(lower)) {
    return { errorClass: "timeout", retryable: true };
  }
  if (/temporarily unavailable|rate limit|quota|backend error|internal error/.test(lower)) {
    return { errorClass: "transient", retryable: true };
  }
  return { errorClass: "exception", retryable: false };
}

function doPost(e) {
  var body = {};

  try {
    var raw =
      e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    body = JSON.parse(raw || "{}");
  } catch (err) {
    body = {};
  }

  var resource = String(body.resource || body.module || "").trim();
  var action = body.action || "getAll";
  var payload = body.payload || {};

  var result;

  try {
    if (resource === "users") {
      result = UsersController.handle(action, payload);
    } else if (resource === "facilities") {
      result = FacilitiesController.handle(action, payload);
    } else if (resource === "assets") {
      result = AssetsController.handle(action, payload);
    } else if (resource === "work-orders") {
      result = WorkOrdersController.handle(action, payload);
    } else if (resource === "incidents") {
      result = IncidentsController.handle(action, payload);
    } else if (resource === "maintenance") {
      result = MaintenanceController.handle(action, payload);
    } else if (resource === "approvals") {
      result = ApprovalsController.handle(action, payload);
    } else if (resource === "requests") {
      result = RequestsController.handle(action, payload);
    } else if (resource === "master-data") {
      result = MasterDataController.handle(action, payload);
    } else if (resource === "reporting-snapshot") {
      result = ReportingSnapshotController.handle(action, payload);
    } else if (resource === "operational-workload") {
      result = OperationalWorkloadController.handle(action, payload);
    } else if (resource === "cost-records") {
      result = CostRecordsController.handle(action, payload);
    } else if (resource === "cost-submissions") {
      result = CostSubmissionsController.handle(action, payload);
    } else if (resource === "reimbursement-payments") {
      result = ReimbursementPaymentsController.handle(action, payload);
    } else if (resource === "reimbursement-authorizations") {
      result = ReimbursementAuthorizationsController.handle(action, payload);
    } else {
      result = jsonResponse_(
        false,
        resource
          ? "Unknown module: " + resource
          : "Missing resource. Expected users|facilities|assets|work-orders|incidents|maintenance|approvals|requests|master-data|reporting-snapshot|operational-workload|cost-records|cost-submissions|reimbursement-payments|reimbursement-authorizations.",
        null,
        { errorClass: "validation", retryable: false }
      );
    }
  } catch (error) {
    var classified = classifyAppsScriptError_(error);
    result = jsonResponse_(
      false,
      (error && error.message) || "Unhandled Apps Script error.",
      null,
      classified
    );
  }

  return result;
}

/**
 * Optional health check for the Web App deployment URL.
 * GET returns a small JSON payload confirming the script is reachable.
 */
function doGet() {
  var builds = {};
  if (typeof UserRepository !== "undefined" && UserRepository.BUILD_MARKER) {
    builds.users = UserRepository.BUILD_MARKER;
  }
  if (typeof AssetRepository !== "undefined" && AssetRepository.BUILD_MARKER) {
    builds.assets = AssetRepository.BUILD_MARKER;
  }

  return jsonResponse_(true, "SentraCore Apps Script is online.", {
    service: "sentracore",
    resources: [
      "users",
      "facilities",
      "assets",
      "work-orders",
      "incidents",
      "maintenance",
      "approvals",
      "requests",
      "master-data",
      "reporting-snapshot",
      "operational-workload",
      "cost-records",
      "cost-submissions",
      "reimbursement-payments",
      "reimbursement-authorizations",
    ],
    builds: builds,
  });
}
```

======================================
FILE:
ApprovalRepository.gs
======================================

```javascript
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
    var rows = [];
    var tMap0 = auditCollector ? Date.now() : 0;
    for (var r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var id = SheetFieldUtils.cellText(sheetRow["Approval ID"]);
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
```

======================================
FILE:
AssetRepository.gs
======================================

```javascript
/**
 * AssetRepository.gs
 *
 * Sheet: Assets
 *
 * Canonical header row (columns A:N — exact order, do not reorder):
 *   Asset ID | Facility | Asset Name | Category | Manufacturer | Model |
 *   Serial Number | Install Date | Warranty Expiry | OEM ID | Condition |
 *   Status | Assigned To | Criticality
 *
 * Reads and writes by exact header name only — never by column index.
 * Facility stores the display value exactly as written (e.g. "NCC Annex").
 */

var AssetRepository = (function () {
  var SHEET_NAME = "Assets";

  var CANONICAL_HEADERS = [
    "Asset ID",
    "Facility",
    "Asset Name",
    "Category",
    "Manufacturer",
    "Model",
    "Serial Number",
    "Install Date",
    "Warranty Expiry",
    "OEM ID",
    "Condition",
    "Status",
    "Assigned To",
    "Criticality",
  ];

  /** Canonical API field → exact sheet header. */
  var FIELD_TO_HEADER = {
    id: "Asset ID",
    facility: "Facility",
    name: "Asset Name",
    category: "Category",
    manufacturer: "Manufacturer",
    model: "Model",
    serialNumber: "Serial Number",
    installDate: "Install Date",
    warrantyExpiry: "Warranty Expiry",
    oemId: "OEM ID",
    condition: "Condition",
    status: "Status",
    assignedTo: "Assigned To",
    criticality: "Criticality",
  };

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet
        .getRange(1, 1, 1, CANONICAL_HEADERS.length)
        .setValues([CANONICAL_HEADERS]);
    }
    return sheet;
  }

  function headerMap_(sheet) {
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  function readHeader_(sheetRow, header) {
    return SheetFieldUtils.cellText(sheetRow[header]);
  }

  function toCanonical_(sheetRow) {
    return {
      id: readHeader_(sheetRow, FIELD_TO_HEADER.id),
      facility: readHeader_(sheetRow, FIELD_TO_HEADER.facility),
      name: readHeader_(sheetRow, FIELD_TO_HEADER.name),
      category: readHeader_(sheetRow, FIELD_TO_HEADER.category) || "other",
      manufacturer: readHeader_(sheetRow, FIELD_TO_HEADER.manufacturer),
      model: readHeader_(sheetRow, FIELD_TO_HEADER.model),
      serialNumber: readHeader_(sheetRow, FIELD_TO_HEADER.serialNumber),
      installDate: readHeader_(sheetRow, FIELD_TO_HEADER.installDate),
      warrantyExpiry: readHeader_(sheetRow, FIELD_TO_HEADER.warrantyExpiry),
      oemId: readHeader_(sheetRow, FIELD_TO_HEADER.oemId),
      condition: readHeader_(sheetRow, FIELD_TO_HEADER.condition) || "good",
      status: readHeader_(sheetRow, FIELD_TO_HEADER.status) || "pending",
      assignedTo: readHeader_(sheetRow, FIELD_TO_HEADER.assignedTo),
      criticality:
        readHeader_(sheetRow, FIELD_TO_HEADER.criticality) || "unassessed",
    };
  }

  function canonicalToSheetFields_(canonical, headerMap) {
    var fields = {};
    var fieldKey;
    for (fieldKey in FIELD_TO_HEADER) {
      if (!FIELD_TO_HEADER.hasOwnProperty(fieldKey)) continue;
      var header = FIELD_TO_HEADER[fieldKey];
      if (headerMap[header] === undefined) continue;
      var value = canonical[fieldKey];
      fields[header] = value == null ? "" : value;
    }
    return fields;
  }

  /**
   * Overlay known fields onto the existing row so values never shift columns.
   */
  function writeCanonical_(sheet, rowIndex, canonical) {
    var headerMap = headerMap_(sheet);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var existing = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
    var row = existing.slice();
    var fields = canonicalToSheetFields_(canonical, headerMap);
    var header;
    for (header in fields) {
      if (!fields.hasOwnProperty(header)) continue;
      if (headerMap[header] === undefined) continue;
      row[headerMap[header]] = fields[header];
    }
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);
    return fields;
  }

  function ensureHeaders_(sheet) {
    var headerMap = headerMap_(sheet);
    if (headerMap[FIELD_TO_HEADER.id] !== undefined) return headerMap;
    sheet.clear();
    sheet
      .getRange(1, 1, 1, CANONICAL_HEADERS.length)
      .setValues([CANONICAL_HEADERS]);
    return headerMap_(sheet);
  }

  function nextId_() {
    var all = getAll();
    var max = 0;
    var i;
    for (i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/AST-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    return "AST-" + ("0000" + next).slice(-4);
  }

  function buildCanonical_(id, payload, current) {
    payload = payload || {};
    current = current || {};
    return {
      id: id,
      facility:
        payload.facility != null ? payload.facility : current.facility || "",
      name: payload.name != null ? payload.name : current.name || "",
      category:
        payload.category != null ? payload.category : current.category || "other",
      manufacturer:
        payload.manufacturer != null
          ? payload.manufacturer
          : current.manufacturer || "",
      model: payload.model != null ? payload.model : current.model || "",
      serialNumber:
        payload.serialNumber != null
          ? payload.serialNumber
          : current.serialNumber || "",
      installDate:
        payload.installDate != null
          ? payload.installDate
          : current.installDate || "",
      warrantyExpiry:
        payload.warrantyExpiry != null
          ? payload.warrantyExpiry
          : current.warrantyExpiry || "",
      oemId: payload.oemId != null ? payload.oemId : current.oemId || "",
      condition:
        payload.condition != null ? payload.condition : current.condition || "good",
      status:
        payload.status != null ? payload.status : current.status || "pending",
      assignedTo:
        payload.assignedTo != null
          ? payload.assignedTo
          : current.assignedTo || "",
      criticality:
        payload.criticality != null
          ? payload.criticality
          : current.criticality || "unassessed",
    };
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    var r;
    for (r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var canonical = toCanonical_(sheetRow);
      if (!canonical.id) continue;
      rows.push(canonical);
    }
    return rows;
  }

  function getById(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    if (headerMap[idHeader] === undefined) return null;
    var idCol = headerMap[idHeader];

    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(id)) continue;
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      return toCanonical_(sheetRow);
    }
    return null;
  }

  function create(payload) {
    var sheet = getSheet_();
    ensureHeaders_(sheet);
    var id = nextId_();
    var record = buildCanonical_(id, payload || {}, null);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var blank = [];
    var b;
    for (b = 0; b < lastCol; b++) blank.push("");
    sheet.appendRow(blank);
    var rowIndex = sheet.getLastRow();
    writeCanonical_(sheet, rowIndex, record);
    SpreadsheetApp.flush();
    return getById(id) || record;
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    if (headerMap[idHeader] === undefined) return null;
    var idCol = headerMap[idHeader];

    var rowIndex = -1;
    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1;
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(id);
    if (!current) return null;

    var merged = buildCanonical_(id, payload || {}, current);
    writeCanonical_(sheet, rowIndex, merged);
    SpreadsheetApp.flush();
    return getById(id) || merged;
  }

  function deactivate(id) {
    return update(id, { status: "inactive" });
  }

  /** WO filter dropdown — id, name, facility only. */
  function listFilterCatalog() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    var nameHeader = FIELD_TO_HEADER.name;
    var facilityHeader = FIELD_TO_HEADER.facility;
    if (!SheetFieldUtils.hasHeader(headerMap, idHeader)) return [];

    var idCol = headerMap[idHeader] + 1;
    var nameCol = SheetFieldUtils.hasHeader(headerMap, nameHeader)
      ? headerMap[nameHeader] + 1
      : -1;
    var facilityCol = SheetFieldUtils.hasHeader(headerMap, facilityHeader)
      ? headerMap[facilityHeader] + 1
      : -1;
    if (nameCol < 1) return [];

    var idValues = sheet.getRange(2, idCol, lastRow, idCol).getValues();
    var nameValues = sheet.getRange(2, nameCol, lastRow, nameCol).getValues();
    var facilityValues =
      facilityCol > 0
        ? sheet.getRange(2, facilityCol, lastRow, facilityCol).getValues()
        : null;

    var rows = [];
    var r;
    for (r = 0; r < idValues.length; r++) {
      var id = SheetFieldUtils.cellText(idValues[r][0]);
      if (!id) continue;
      var name = SheetFieldUtils.cellText(nameValues[r][0]) || id;
      var facility = facilityValues
        ? SheetFieldUtils.cellText(facilityValues[r][0])
        : "";
      rows.push({ id: id, name: name, facility: facility || "" });
    }
    rows.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    return rows;
  }

  return {
    getAll: getAll,
    getById: getById,
    listFilterCatalog: listFilterCatalog,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
CostRecordRepository.gs
======================================

```javascript
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
```

======================================
FILE:
CostSubmissionRepository.gs
======================================

```javascript
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
```

======================================
FILE:
FacilityRepository.gs
======================================

```javascript
/**
 * FacilityRepository.gs
 *
 * Sheet: Facilities
 * Columns (row 1 headers — exact order):
 *   id | name | code | location | type | manager | status | description | createdAt | updatedAt
 *
 * Mirrors UserRepository pattern. Soft-deactivate only — never delete rows.
 */

var FacilityRepository = (function () {
  var SHEET_NAME = "Facilities";
  var HEADERS = [
    "id",
    "name",
    "code",
    "location",
    "type",
    "manager",
    "status",
    "description",
    "createdAt",
    "updatedAt",
  ];

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }
    return sheet;
  }

  function rowToObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      rows.push(rowToObject_(headers, values[r]));
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

  function nextId_() {
    var all = getAll();
    var max = 0;
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(/FAC-(\d+)/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return "FAC-" + padded;
  }

  function create(payload) {
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var id = nextId_();
    // Human-friendly display code — auto-assigned, immutable after create.
    var code = String((payload && payload.code) || "").trim();
    if (!code) code = id;
    var row = [
      id,
      payload.name || "",
      code,
      payload.location || "",
      payload.type || "office",
      payload.manager || "",
      payload.status || "pending",
      payload.description || "",
      now,
      now,
    ];
    sheet.appendRow(row);
    return getById(id) || {
      id: id,
      name: payload.name || "",
      code: code,
      location: payload.location || "",
      type: payload.type || "office",
      manager: payload.manager || "",
      status: payload.status || "pending",
      description: payload.description || "",
      createdAt: now,
      updatedAt: now,
    };
  }

  function update(id, payload) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var idCol = headers.indexOf("id");
    var rowIndex = -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1; // 1-based
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(id);
    var updated = {
      id: id,
      name: payload.name != null ? payload.name : current.name,
      // Identifiers are immutable after create.
      code: current.code || id,
      location: payload.location != null ? payload.location : current.location,
      type: payload.type != null ? payload.type : current.type,
      manager: payload.manager != null ? payload.manager : current.manager,
      status: payload.status != null ? payload.status : current.status,
      description:
        payload.description != null ? payload.description : current.description,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    var row = HEADERS.map(function (key) {
      return updated[key] != null ? updated[key] : "";
    });
    sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
    return updated;
  }

  function deactivate(id) {
    return update(id, { status: "inactive" });
  }

  /** WO filter dropdown — id/name only. */
  function listFilterCatalog() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return [];
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var headerMap = {};
    var h;
    for (h = 0; h < headers.length; h++) {
      headerMap[String(headers[h]).trim()] = h;
    }

    function col1Based(names) {
      var n;
      for (n = 0; n < names.length; n++) {
        if (headerMap[names[n]] !== undefined) return headerMap[names[n]] + 1;
      }
      return -1;
    }

    var idCol = col1Based(["id", "Facility ID"]);
    var nameCol = col1Based(["name", "Facility Name"]);
    if (idCol < 1 || nameCol < 1) return [];

    var idValues = sheet.getRange(2, idCol, lastRow, idCol).getValues();
    var nameValues = sheet.getRange(2, nameCol, lastRow, nameCol).getValues();
    var rows = [];
    var r;
    for (r = 0; r < idValues.length; r++) {
      var id = SheetFieldUtils.cellText(idValues[r][0]);
      if (!id) continue;
      var name = SheetFieldUtils.cellText(nameValues[r][0]) || id;
      rows.push({ id: id, name: name });
    }
    rows.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    return rows;
  }

  return {
    getAll: getAll,
    getById: getById,
    listFilterCatalog: listFilterCatalog,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
IncidentRepository.gs
======================================

```javascript
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
    "Request ID",
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
      sourceRequestId:
        SheetFieldUtils.hasHeader(headerMap, "Request ID")
          ? SheetFieldUtils.cellText(sheetRow["Request ID"]) || undefined
          : undefined,
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
      "Request ID": canonical.sourceRequestId || "",
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
      var id = SheetFieldUtils.cellText(sheetRow["Incident ID"]);
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
      sourceRequestId:
        payload.sourceRequestId != null
          ? payload.sourceRequestId
          : current.sourceRequestId,
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
      sourceRequestId: payload.sourceRequestId || "",
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
```

======================================
FILE:
MaintenanceRepository.gs
======================================

```javascript
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
    "Requires Work Order",
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

  function readRequiresWorkOrder_(sheetRow, headerMap, workOrderIds) {
    if (SheetFieldUtils.hasHeader(headerMap, "Requires Work Order")) {
      var raw = SheetFieldUtils.cellText(sheetRow["Requires Work Order"]);
      if (raw) {
        var lower = raw.toLowerCase();
        if (lower === "true" || lower === "yes" || lower === "1") return true;
        if (lower === "false" || lower === "no" || lower === "0") return false;
      }
    }
    return workOrderIds.length > 0 ? true : undefined;
  }

  function formatRequiresWorkOrder_(value) {
    if (value === true) return "Yes";
    if (value === false) return "No";
    return "";
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
      requiresWorkOrder: readRequiresWorkOrder_(sheetRow, headerMap, workOrderIds),
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
      "Requires Work Order": formatRequiresWorkOrder_(canonical.requiresWorkOrder),
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
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = SheetFieldUtils.headerMapFromRow
      ? SheetFieldUtils.headerMapFromRow(headers)
      : SheetFieldUtils.getHeaderMap(sheet);
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Maintenance ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return null;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(id)) continue;
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      return toCanonical_(sheetRow, headerMap);
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
      requiresWorkOrder:
        payload.requiresWorkOrder != null
          ? payload.requiresWorkOrder
          : current.requiresWorkOrder,
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
      requiresWorkOrder: payload.requiresWorkOrder != null
        ? payload.requiresWorkOrder === true
        : undefined,
      createdAt: reportedAt,
      updatedAt: reportedAt,
    };

    ensureHeaders_(sheet);
    var lastCol = sheet.getLastColumn();
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var fields = canonicalToFields_(canonical);
    var row = SheetFieldUtils.buildRowFromFields(headerMap, lastCol, fields);
    sheet.appendRow(row);
    return canonical;
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
      if (String(headers[c]).trim() === "Maintenance ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return null;

    var rowIndex = -1;
    var current = null;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(id)) {
        continue;
      }
      rowIndex = r + 1;
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      current = toCanonical_(sheetRow, headerMap);
      break;
    }
    if (rowIndex === -1 || !current) return null;

    var previousStatus = current.status;
    var updated = mergeCanonical_(current, payload);
    writeRow_(sheet, rowIndex, updated);
    return {
      canonical: updated,
      previousStatus: previousStatus,
    };
  }

  function deactivate(id) {
    var result = update(id, { status: "cancelled" });
    return result ? result.canonical : null;
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
```

======================================
FILE:
MasterDataRepository.gs
======================================

```javascript
/**
 * MasterDataRepository.gs
 *
 * Sheet-backed repositories for master lookup entities:
 *   Departments | Buildings | Floors | Rooms | Vendors
 *
 * Soft-deactivate only — never delete rows.
 * Sheets are created with headers on first access.
 */

var MasterDataRepository = (function () {
  var ENTITIES = {
    departments: {
      sheetName: "Departments",
      idPrefix: "DEP",
      headers: [
        "id",
        "name",
        "code",
        "facility",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    buildings: {
      sheetName: "Buildings",
      idPrefix: "BLD",
      headers: [
        "id",
        "name",
        "code",
        "facility",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    floors: {
      sheetName: "Floors",
      idPrefix: "FLR",
      headers: [
        "id",
        "name",
        "code",
        "facility",
        "building",
        "level",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    rooms: {
      sheetName: "Rooms",
      idPrefix: "RM",
      headers: [
        "id",
        "name",
        "code",
        "facility",
        "building",
        "floor",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
    vendors: {
      sheetName: "Vendors",
      idPrefix: "VND",
      headers: [
        "id",
        "name",
        "code",
        "category",
        "contactName",
        "email",
        "phone",
        "status",
        "description",
        "createdAt",
        "updatedAt",
      ],
    },
  };

  function getConfig_(entity) {
    var config = ENTITIES[entity];
    if (!config) throw new Error("Unknown master-data entity: " + entity);
    return config;
  }

  function getSheet_(config) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(config.sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(config.sheetName);
      sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
    }
    return sheet;
  }

  function rowToObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[headers[i]] = row[i];
    }
    return obj;
  }

  /**
   * Accept both live sheet keys (facility/building/floor) and camelId aliases
   * from the frontend (facilityId/buildingId/floorId).
   */
  function payloadValue_(payload, key) {
    payload = payload || {};
    if (payload[key] != null && String(payload[key]).trim() !== "") {
      return payload[key];
    }
    if (key === "facility" && payload.facilityId != null) return payload.facilityId;
    if (key === "building" && payload.buildingId != null) return payload.buildingId;
    if (key === "floor" && payload.floorId != null) return payload.floorId;
    if (key === "facilityId" && payload.facility != null) return payload.facility;
    if (key === "buildingId" && payload.building != null) return payload.building;
    if (key === "floorId" && payload.floor != null) return payload.floor;
    return payload[key];
  }

  function getAll(entity) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      rows.push(rowToObject_(headers, values[r]));
    }
    return rows;
  }

  function getById(entity, id) {
    var all = getAll(entity);
    for (var i = 0; i < all.length; i++) {
      if (String(all[i].id) === String(id)) return all[i];
    }
    return null;
  }

  function nextId_(entity, config) {
    var all = getAll(entity);
    var max = 0;
    var pattern = new RegExp("^" + config.idPrefix + "-(\\d+)$", "i");
    for (var i = 0; i < all.length; i++) {
      var match = String(all[i].id || "").match(pattern);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    var next = max + 1;
    var padded = ("0000" + next).slice(-4);
    return config.idPrefix + "-" + padded;
  }

  /**
   * Human-friendly code when the caller does not supply one.
   * Floors prefer level (e.g. L04); rooms prefer name when it looks like a room number.
   */
  function defaultCode_(entity, id, payload) {
    payload = payload || {};
    if (entity === "floors") {
      var level = String(payload.level || "").trim();
      if (level) {
        return /^[A-Za-z]/.test(level) ? level.toUpperCase() : "L" + level;
      }
    }
    if (entity === "rooms") {
      var roomName = String(payload.name || "").trim();
      if (roomName && /^[\d.A-Za-z-]{1,12}$/.test(roomName)) {
        return roomName;
      }
    }
    if (entity === "buildings") {
      var buildingName = String(payload.name || "").trim();
      if (buildingName && buildingName.length <= 8) {
        return buildingName.toUpperCase().replace(/\s+/g, "-");
      }
    }
    return id;
  }

  function create(entity, payload) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
    var now = new Date().toISOString();
    var id = nextId_(entity, config);
    payload = payload || {};

    var record = {};
    for (var i = 0; i < config.headers.length; i++) {
      var key = config.headers[i];
      if (key === "id") record.id = id;
      else if (key === "createdAt" || key === "updatedAt") record[key] = now;
      else if (key === "status") record.status = payload.status || "active";
      else if (key === "code") {
        var code = payload.code != null ? String(payload.code).trim() : "";
        record.code = code || defaultCode_(entity, id, payload);
      } else {
        var value = payloadValue_(payload, key);
        record[key] = value != null ? value : "";
      }
    }

    var row = config.headers.map(function (key) {
      return record[key] != null ? record[key] : "";
    });
    sheet.appendRow(row);
    return getById(entity, id) || record;
  }

  function update(entity, id, payload) {
    var config = getConfig_(entity);
    var sheet = getSheet_(config);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var idCol = headers.indexOf("id");
    var rowIndex = -1;

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) {
        rowIndex = r + 1;
        break;
      }
    }
    if (rowIndex === -1) return null;

    var current = getById(entity, id);
    if (!current) return null;

    var updated = {};
    for (var i = 0; i < config.headers.length; i++) {
      var key = config.headers[i];
      if (key === "id") updated.id = id;
      else if (key === "createdAt") updated.createdAt = current.createdAt;
      else if (key === "updatedAt") updated.updatedAt = new Date().toISOString();
      else if (key === "code") {
        // Codes are immutable after create.
        updated.code = current.code || id;
      } else if (payload && payloadValue_(payload, key) != null) {
        updated[key] = payloadValue_(payload, key);
      } else updated[key] = current[key] != null ? current[key] : "";
    }

    var row = config.headers.map(function (key) {
      return updated[key] != null ? updated[key] : "";
    });
    sheet.getRange(rowIndex, 1, 1, config.headers.length).setValues([row]);
    return updated;
  }

  function deactivate(entity, id) {
    return update(entity, id, { status: "inactive" });
  }

  function listEntities() {
    return Object.keys(ENTITIES);
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
    listEntities: listEntities,
  };
})();
```

======================================
FILE:
ReimbursementAuthorizationRepository.gs
======================================

```javascript
/**
 * ReimbursementAuthorizationRepository.gs
 *
 * Sheet: REIMBURSEMENT_AUTHORIZATIONS
 * Authorization of CostSubmission claims — not Work Order Approvals.
 * Never written onto CostRecord or CostSubmission status.
 *
 * ID format: AUTH-{YYYY}-{NNNNNN}
 */

var ReimbursementAuthorizationRepository = (function () {
  var SHEET_NAME = "REIMBURSEMENT_AUTHORIZATIONS";
  var HEADERS = [
    "Authorization ID",
    "Submission ID",
    "Authorized Amount",
    "Currency",
    "Authorized At",
    "Authorized By",
    "Authority Reference",
    "Notes",
    "Recorded At",
  ];

  function readAmount_(raw) {
    if (raw === "" || raw == null) return undefined;
    var amount = Number(raw);
    return isFinite(amount) ? amount : undefined;
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

  function rowToCanonical_(sheetRow) {
    return {
      authorizationId: SheetFieldUtils.cellText(sheetRow["Authorization ID"]),
      submissionId: SheetFieldUtils.cellText(sheetRow["Submission ID"]),
      authorizedAmount: readAmount_(sheetRow["Authorized Amount"]),
      currency: SheetFieldUtils.cellText(sheetRow["Currency"]) || "NGN",
      authorizedAt: SheetFieldUtils.cellText(sheetRow["Authorized At"]),
      authorizedBy: SheetFieldUtils.cellText(sheetRow["Authorized By"]),
      authorityReference:
        SheetFieldUtils.cellText(sheetRow["Authority Reference"]) || undefined,
      notes: SheetFieldUtils.cellText(sheetRow["Notes"]) || undefined,
      recordedAt: SheetFieldUtils.cellText(sheetRow["Recorded At"]),
    };
  }

  function canonicalToFields_(canonical) {
    return {
      "Authorization ID": canonical.authorizationId || "",
      "Submission ID": canonical.submissionId || "",
      "Authorized Amount":
        canonical.authorizedAmount != null ? canonical.authorizedAmount : "",
      Currency: canonical.currency || "NGN",
      "Authorized At": canonical.authorizedAt || "",
      "Authorized By": canonical.authorizedBy || "",
      "Authority Reference": canonical.authorityReference || "",
      Notes: canonical.notes || "",
      "Recorded At": canonical.recordedAt || "",
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

  function findRowIndex_(authorizationId) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Authorization ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol] || "").trim() === String(authorizationId)) {
        return r + 1;
      }
    }
    return -1;
  }

  function findBySubmissionId_(submissionId) {
    var id = String(submissionId || "").trim();
    if (!id) return null;
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;
    var headers = values[0];
    var matches = [];
    for (var r = 1; r < values.length; r++) {
      var obj = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      if (SheetFieldUtils.cellText(obj["Submission ID"]) === id) {
        matches.push(rowToCanonical_(obj));
      }
    }
    if (!matches.length) return null;
    matches.sort(function (a, b) {
      return String(b.authorizedAt || b.recordedAt || "").localeCompare(
        String(a.authorizedAt || a.recordedAt || "")
      );
    });
    return matches[0];
  }

  function nextId_() {
    var year = new Date().getFullYear();
    var all = getAll({ page: 1, pageSize: 10000 });
    var rows = all.data || [];
    var maxYear = 0;
    var prefix = "AUTH-" + year + "-";
    for (var i = 0; i < rows.length; i++) {
      var id = String(rows[i].authorizationId || "");
      if (id.indexOf(prefix) === 0) {
        var seq = Number(id.slice(prefix.length));
        if (isFinite(seq) && seq > maxYear) maxYear = seq;
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return prefix + padded;
  }

  function getAll(payload) {
    payload = payload || {};
    var page = Math.max(1, Number(payload.page) || 1);
    var pageSize = Math.max(1, Math.min(100, Number(payload.pageSize) || 25));
    var submissionId = payload.submissionId
      ? String(payload.submissionId).trim()
      : "";
    var search = payload.search
      ? String(payload.search).trim().toLowerCase()
      : "";

    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var rows = [];
    if (values.length > 1) {
      var headers = values[0];
      for (var r = 1; r < values.length; r++) {
        var obj = SheetFieldUtils.rowToSheetObject(headers, values[r]);
        var authorizationId = SheetFieldUtils.cellText(obj["Authorization ID"]);
        if (!authorizationId) continue;
        rows.push(rowToCanonical_(obj));
      }
    }

    rows.sort(function (a, b) {
      return String(b.authorizedAt || "").localeCompare(
        String(a.authorizedAt || "")
      );
    });

    if (submissionId) {
      rows = rows.filter(function (row) {
        return String(row.submissionId || "") === submissionId;
      });
    }
    if (search) {
      rows = rows.filter(function (row) {
        return (
          String(row.authorizationId || "")
            .toLowerCase()
            .indexOf(search) >= 0 ||
          String(row.submissionId || "")
            .toLowerCase()
            .indexOf(search) >= 0
        );
      });
    }

    var total = rows.length;
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);
    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
    };
  }

  function getById(authorizationId) {
    var id = String(authorizationId || "").trim();
    if (!id) throw new Error("authorizationId is required");
    var rowIndex = findRowIndex_(id);
    if (rowIndex < 0) throw new Error("Authorization not found: " + id);
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    return rowToCanonical_(
      SheetFieldUtils.rowToSheetObject(headers, values[rowIndex - 1])
    );
  }

  function getBySubmissionId(submissionId) {
    return findBySubmissionId_(submissionId);
  }

  function mergeCanonical_(current, payload) {
    payload = payload || {};
    return {
      authorizationId: current.authorizationId,
      submissionId:
        payload.submissionId != null
          ? String(payload.submissionId).trim()
          : current.submissionId,
      authorizedAmount:
        payload.authorizedAmount !== undefined
          ? readAmount_(payload.authorizedAmount)
          : current.authorizedAmount,
      currency:
        payload.currency != null ? payload.currency : current.currency,
      authorizedAt:
        payload.authorizedAt != null
          ? payload.authorizedAt
          : current.authorizedAt,
      authorizedBy:
        payload.authorizedBy != null
          ? payload.authorizedBy
          : current.authorizedBy,
      authorityReference:
        payload.authorityReference !== undefined
          ? payload.authorityReference || undefined
          : current.authorityReference,
      notes:
        payload.notes !== undefined ? payload.notes || undefined : current.notes,
      recordedAt: current.recordedAt,
    };
  }

  function create(payload) {
    payload = payload || {};
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var authorizationId = nextId_();
    var canonical = {
      authorizationId: authorizationId,
      submissionId: String(payload.submissionId || "").trim(),
      authorizedAmount: readAmount_(payload.authorizedAmount),
      currency: payload.currency || "NGN",
      authorizedAt: payload.authorizedAt || now,
      authorizedBy: payload.authorizedBy || "",
      authorityReference: payload.authorityReference || undefined,
      notes: payload.notes || undefined,
      recordedAt: payload.recordedAt || now,
    };
    var rowIndex = sheet.getLastRow() + 1;
    writeRow_(sheet, rowIndex, canonical);
    return canonical;
  }

  function update(authorizationId, payload) {
    var rowIndex = findRowIndex_(authorizationId);
    if (rowIndex === -1) return null;
    var current = getById(authorizationId);
    if (!current) return null;
    var merged = mergeCanonical_(current, payload || {});
    var sheet = getSheet_();
    writeRow_(sheet, rowIndex, merged);
    return merged;
  }

  return {
    getAll: getAll,
    getById: getById,
    getBySubmissionId: getBySubmissionId,
    create: create,
    update: update,
  };
})();
```

======================================
FILE:
ReimbursementPaymentRepository.gs
======================================

```javascript
/**
 * ReimbursementPaymentRepository.gs
 *
 * Sheet: REIMBURSEMENT_PAYMENTS
 * Receipts against CostSubmission — never written onto CostRecord or CostSubmission.
 *
 * ID format: PAY-{YYYY}-{NNNNNN}
 */

var ReimbursementPaymentRepository = (function () {
  var SHEET_NAME = "REIMBURSEMENT_PAYMENTS";
  var HEADERS = [
    "Payment ID",
    "Submission ID",
    "Received Amount",
    "Currency",
    "Received At",
    "Reference",
    "Method",
    "Evidence Reference",
    "Notes",
    "Recorded At",
    "Recorded By",
  ];

  function readAmount_(raw) {
    if (raw === "" || raw == null) return undefined;
    var amount = Number(raw);
    return isFinite(amount) ? amount : undefined;
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

  function rowToCanonical_(sheetRow) {
    return {
      paymentId: SheetFieldUtils.cellText(sheetRow["Payment ID"]),
      submissionId: SheetFieldUtils.cellText(sheetRow["Submission ID"]),
      receivedAmount: readAmount_(sheetRow["Received Amount"]),
      currency: SheetFieldUtils.cellText(sheetRow["Currency"]) || "NGN",
      receivedAt: SheetFieldUtils.cellText(sheetRow["Received At"]),
      reference: SheetFieldUtils.cellText(sheetRow["Reference"]) || undefined,
      method: SheetFieldUtils.cellText(sheetRow["Method"]) || undefined,
      evidenceReference:
        SheetFieldUtils.cellText(sheetRow["Evidence Reference"]) || undefined,
      notes: SheetFieldUtils.cellText(sheetRow["Notes"]) || undefined,
      recordedAt: SheetFieldUtils.cellText(sheetRow["Recorded At"]),
      recordedBy: SheetFieldUtils.cellText(sheetRow["Recorded By"]),
    };
  }

  function canonicalToFields_(canonical) {
    return {
      "Payment ID": canonical.paymentId || "",
      "Submission ID": canonical.submissionId || "",
      "Received Amount":
        canonical.receivedAmount != null ? canonical.receivedAmount : "",
      Currency: canonical.currency || "NGN",
      "Received At": canonical.receivedAt || "",
      Reference: canonical.reference || "",
      Method: canonical.method || "",
      "Evidence Reference": canonical.evidenceReference || "",
      Notes: canonical.notes || "",
      "Recorded At": canonical.recordedAt || "",
      "Recorded By": canonical.recordedBy || "",
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

  function findRowIndex_(paymentId) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return -1;
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Payment ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idCol] || "").trim() === String(paymentId)) {
        return r + 1;
      }
    }
    return -1;
  }

  /**
   * Next PAY-{year}-{NNNNNN} from persisted sheet Payment ID values.
   * Must not use paginated getAll() — that wrapper is not an array.
   */
  function nextId_() {
    var year = new Date().getFullYear();
    var prefix = "PAY-" + year + "-";
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var maxSeq = 0;
    if (values.length <= 1) {
      return prefix + "000001";
    }
    var headers = values[0];
    var idCol = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim() === "Payment ID") {
        idCol = c;
        break;
      }
    }
    if (idCol === -1) return prefix + "000001";
    for (var r = 1; r < values.length; r++) {
      var id = String(values[r][idCol] || "").trim();
      if (id.indexOf(prefix) === 0) {
        var seq = Number(id.slice(prefix.length));
        if (isFinite(seq) && seq > maxSeq) maxSeq = seq;
      }
    }
    var next = maxSeq + 1;
    var padded = ("000000" + next).slice(-6);
    return prefix + padded;
  }

  /**
   * All receipts for a submission — unpaginated sheet scan.
   * Used by the authorized-amount ceiling so pageSize=100 cannot undercount.
   */
  function listAllBySubmissionId(submissionId) {
    var id = String(submissionId || "").trim();
    var rows = [];
    if (!id) return rows;
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return rows;
    var headers = values[0];
    for (var r = 1; r < values.length; r++) {
      var obj = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var paymentId = SheetFieldUtils.cellText(obj["Payment ID"]);
      if (!paymentId) continue;
      var canonical = rowToCanonical_(obj);
      if (String(canonical.submissionId || "") === id) {
        rows.push(canonical);
      }
    }
    return rows;
  }

  function getAll(payload) {
    payload = payload || {};
    var page = Math.max(1, Number(payload.page) || 1);
    var pageSize = Math.max(1, Math.min(100, Number(payload.pageSize) || 25));
    var submissionId = payload.submissionId
      ? String(payload.submissionId).trim()
      : "";
    var search = payload.search
      ? String(payload.search).trim().toLowerCase()
      : "";

    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var rows = [];
    if (values.length > 1) {
      var headers = values[0];
      for (var r = 1; r < values.length; r++) {
        var obj = SheetFieldUtils.rowToSheetObject(headers, values[r]);
        var paymentId = SheetFieldUtils.cellText(obj["Payment ID"]);
        if (!paymentId) continue;
        rows.push(rowToCanonical_(obj));
      }
    }

    rows.sort(function (a, b) {
      return String(b.receivedAt || "").localeCompare(
        String(a.receivedAt || "")
      );
    });

    if (submissionId) {
      rows = rows.filter(function (row) {
        return String(row.submissionId || "") === submissionId;
      });
    }
    if (search) {
      rows = rows.filter(function (row) {
        return (
          String(row.paymentId || "")
            .toLowerCase()
            .indexOf(search) >= 0 ||
          String(row.reference || "")
            .toLowerCase()
            .indexOf(search) >= 0 ||
          String(row.submissionId || "")
            .toLowerCase()
            .indexOf(search) >= 0
        );
      });
    }

    var total = rows.length;
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);
    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
    };
  }

  function getById(paymentId) {
    var id = String(paymentId || "").trim();
    if (!id) throw new Error("paymentId is required");
    var rowIndex = findRowIndex_(id);
    if (rowIndex < 0) throw new Error("Payment not found: " + id);
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    return rowToCanonical_(
      SheetFieldUtils.rowToSheetObject(headers, values[rowIndex - 1])
    );
  }

  function mergeCanonical_(current, payload) {
    payload = payload || {};
    return {
      paymentId: current.paymentId,
      submissionId:
        payload.submissionId != null
          ? String(payload.submissionId).trim()
          : current.submissionId,
      receivedAmount:
        payload.receivedAmount !== undefined
          ? readAmount_(payload.receivedAmount)
          : current.receivedAmount,
      currency:
        payload.currency != null ? payload.currency : current.currency,
      receivedAt:
        payload.receivedAt != null ? payload.receivedAt : current.receivedAt,
      reference:
        payload.reference !== undefined
          ? payload.reference || undefined
          : current.reference,
      method:
        payload.method !== undefined
          ? payload.method || undefined
          : current.method,
      evidenceReference:
        payload.evidenceReference !== undefined
          ? payload.evidenceReference || undefined
          : current.evidenceReference,
      notes:
        payload.notes !== undefined ? payload.notes || undefined : current.notes,
      recordedAt: current.recordedAt,
      recordedBy:
        payload.recordedBy != null ? payload.recordedBy : current.recordedBy,
    };
  }

  function create(payload) {
    payload = payload || {};
    var sheet = getSheet_();
    var now = new Date().toISOString();
    var paymentId = nextId_();
    var canonical = {
      paymentId: paymentId,
      submissionId: String(payload.submissionId || "").trim(),
      receivedAmount: readAmount_(payload.receivedAmount),
      currency: payload.currency || "NGN",
      receivedAt: payload.receivedAt || now,
      reference: payload.reference || undefined,
      method: payload.method || undefined,
      evidenceReference: payload.evidenceReference || undefined,
      notes: payload.notes || undefined,
      recordedAt: payload.recordedAt || now,
      recordedBy: payload.recordedBy || "",
    };
    var rowIndex = sheet.getLastRow() + 1;
    writeRow_(sheet, rowIndex, canonical);
    return canonical;
  }

  function update(paymentId, payload) {
    var rowIndex = findRowIndex_(paymentId);
    if (rowIndex === -1) return null;
    var current = getById(paymentId);
    if (!current) return null;
    var merged = mergeCanonical_(current, payload || {});
    var sheet = getSheet_();
    writeRow_(sheet, rowIndex, merged);
    return merged;
  }

  return {
    getAll: getAll,
    getById: getById,
    listAllBySubmissionId: listAllBySubmissionId,
    create: create,
    update: update,
  };
})();
```

======================================
FILE:
ReportingSnapshotRepository.gs
======================================

```javascript
/**
 * ReportingSnapshotRepository.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER (Sheets-backed).
 * ---------------------------------------------------------------------------
 * Stores a pre-aggregated ReportingSnapshot in the REPORTING_SNAPSHOT sheet so
 * Home / Dashboard / Reports can read KPIs + summary datasets without scanning
 * every domain sheet on each request.
 *
 * Google Sheets remains the system of record for domain entities.
 * This sheet is a derived cache and can later be replaced by a database-backed
 * repository without changing the application architecture
 * (DashboardService → ReportingService → Snapshot reader).
 *
 * Sheet: REPORTING_SNAPSHOT
 * Columns:
 *   section | scope | chunk | json | updatedAt | version
 *
 * Sections: meta | users | facilities | assets | incidents | maintenance |
 *           workOrders | kpis | projections | health
 */

var ReportingSnapshotRepository = (function () {
  var SHEET_NAME = "REPORTING_SNAPSHOT";
  var SCOPE_PORTFOLIO = "__portfolio__";
  var MAX_CELL_CHARS = 40000;
  var HEADERS = ["section", "scope", "chunk", "json", "updatedAt", "version"];

  var SECTIONS = [
    "meta",
    "users",
    "facilities",
    "assets",
    "incidents",
    "maintenance",
    "workOrders",
    "kpis",
    "projections",
    "health",
  ];

  /** Fully assembled portfolio snapshot JSON (hot-path sheet read). */
  var SECTION_ASSEMBLED = "assembled";

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  function chunkJson_(value) {
    var text = JSON.stringify(value == null ? null : value);
    var chunks = [];
    if (!text.length) {
      chunks.push("");
      return chunks;
    }
    for (var i = 0; i < text.length; i += MAX_CELL_CHARS) {
      chunks.push(text.substring(i, i + MAX_CELL_CHARS));
    }
    return chunks;
  }

  function deleteSectionRows_(sheet, section, scope) {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    // Delete from bottom to top to keep indices stable.
    for (var i = values.length - 1; i >= 0; i--) {
      if (
        String(values[i][0]) === section &&
        String(values[i][1]) === scope
      ) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  function writeSection(section, data, version, scope) {
    scope = scope || SCOPE_PORTFOLIO;
    version = version || Date.now();
    var sheet = getSheet_();
    deleteSectionRows_(sheet, section, scope);

    var chunks = chunkJson_(data);
    var updatedAt = new Date().toISOString();
    var rows = [];
    for (var i = 0; i < chunks.length; i++) {
      rows.push([section, scope, i, chunks[i], updatedAt, version]);
    }
    if (!rows.length) return;
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
      .setValues(rows);
  }

  function parseChunks_(parts) {
    if (!parts || !parts.length) return null;
    parts.sort(function (a, b) {
      return a.chunk - b.chunk;
    });
    var text = parts
      .map(function (p) {
        return p.json;
      })
      .join("");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] Failed to parse chunked JSON: " + err);
      return null;
    }
  }

  function readSection(section, scope) {
    scope = scope || SCOPE_PORTFOLIO;
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    var parts = [];
    for (var i = 0; i < values.length; i++) {
      if (
        String(values[i][0]) === section &&
        String(values[i][1]) === scope
      ) {
        parts.push({
          chunk: Number(values[i][2] || 0),
          json: String(values[i][3] || ""),
        });
      }
    }
    return parseChunks_(parts);
  }

  function writeFull(snapshotParts, version) {
    version = version || Date.now();
    var scope = SCOPE_PORTFOLIO;
    for (var i = 0; i < SECTIONS.length; i++) {
      var section = SECTIONS[i];
      writeSection(section, snapshotParts[section], version, scope);
    }
    return version;
  }

  /**
   * Single sheet scan — avoids N× getValues() when loading all sections.
   */
  function readFull(scope) {
    scope = scope || SCOPE_PORTFOLIO;
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    var bySection = {};
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][1]) !== scope) continue;
      var section = String(values[i][0] || "");
      if (!section || section === SECTION_ASSEMBLED) continue;
      if (!bySection[section]) bySection[section] = [];
      bySection[section].push({
        chunk: Number(values[i][2] || 0),
        json: String(values[i][3] || ""),
      });
    }

    var meta = parseChunks_(bySection.meta);
    if (!meta) return null;

    return {
      meta: meta,
      users: parseChunks_(bySection.users) || [],
      facilities: parseChunks_(bySection.facilities) || [],
      assets: parseChunks_(bySection.assets) || [],
      incidents: parseChunks_(bySection.incidents) || [],
      maintenance: parseChunks_(bySection.maintenance) || [],
      workOrders: parseChunks_(bySection.workOrders) || [],
      kpis: parseChunks_(bySection.kpis),
      projections: parseChunks_(bySection.projections),
      health: parseChunks_(bySection.health),
    };
  }

  function writeAssembled(snapshot, version, scope) {
    writeSection(SECTION_ASSEMBLED, snapshot, version, scope || SCOPE_PORTFOLIO);
  }

  function readAssembled(scope) {
    return readSection(SECTION_ASSEMBLED, scope || SCOPE_PORTFOLIO);
  }

  function clearAll() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow, HEADERS.length).clearContent();
    }
  }

  return {
    SCOPE_PORTFOLIO: SCOPE_PORTFOLIO,
    SECTION_ASSEMBLED: SECTION_ASSEMBLED,
    SECTIONS: SECTIONS,
    getSheet_: getSheet_,
    writeSection: writeSection,
    readSection: readSection,
    writeFull: writeFull,
    readFull: readFull,
    writeAssembled: writeAssembled,
    readAssembled: readAssembled,
    clearAll: clearAll,
  };
})();
```

======================================
FILE:
RequestRepository.gs
======================================

```javascript
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
```

======================================
FILE:
UserRepository.gs
======================================

```javascript
/**
 * UserRepository.gs
 *
 * Sheet: USERS (legacy tab alias: Users)
 *
 * Canonical header row — map by exact header name ONLY:
 *   User ID | Full Name | Email | Role | Specialization |
 *   Facility Assigned | Current Workload | Phone | Status | Date Added
 *
 * NEVER write positional arrays. All creates/updates overlay fields by header map.
 * BUILD: 2026-08-25-users-header-v3
 */

var UserRepository = (function () {
  var BUILD_MARKER = "2026-08-25-users-header-v3";
  var CREATE_COUNT_KEY = "USER_REPO_CREATE_INVOCATIONS";
  var SHEET_CANDIDATES = ["USERS", "Users"];

  /** Canonical API field → exact sheet header. */
  var FIELD_TO_HEADER = {
    id: "User ID",
    name: "Full Name",
    email: "Email",
    role: "Role",
    specialization: "Specialization",
    facility: "Facility Assigned",
    activeWorkOrders: "Current Workload",
    phone: "Phone",
    status: "Status",
    createdAt: "Date Added",
  };

  var REQUIRED_HEADERS = [
    "User ID",
    "Full Name",
    "Email",
    "Role",
    "Specialization",
    "Facility Assigned",
    "Current Workload",
    "Phone",
    "Status",
    "Date Added",
  ];

  var UPDATEABLE_FIELDS = [
    "name",
    "email",
    "phone",
    "role",
    "specialization",
    "facility",
    "status",
  ];

  function cellText_(value) {
    return SheetFieldUtils.cellText(value);
  }

  function cellDateIso_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function normalizeStatus_(raw) {
    var value = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (!value) return "";
    if (value === "active") return "active";
    if (value === "inactive" || value === "deactivated") return "inactive";
    if (value === "suspended") return "suspended";
    if (value === "pending") return "pending";
    return value;
  }

  function statusToSheet_(status) {
    var value = String(status || "").toLowerCase();
    if (!value) return "";
    if (value === "active") return "Active";
    if (value === "inactive") return "Inactive";
    if (value === "suspended") return "Suspended";
    if (value === "pending") return "Pending";
    return status;
  }

  function parseWorkload_(raw) {
    var text = cellText_(raw);
    if (!text || text === "-") return 0;
    var n = Number(text);
    return Number.isFinite(n) ? n : 0;
  }

  function workloadToSheet_(value) {
    var n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "-";
    return n;
  }

  /** Preserve leading zeros — store phone as plain text. */
  function phoneToSheet_(value) {
    if (value == null || value === "") return "";
    return String(value).trim();
  }

  function stripMeta_(payload) {
    var clean = {};
    var key;
    payload = payload || {};
    for (key in payload) {
      if (!payload.hasOwnProperty(key)) continue;
      if (key === "_clientRequestId") continue;
      clean[key] = payload[key];
    }
    return clean;
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
      var headerMap = SheetFieldUtils.getHeaderMap(candidate);
      if (headerMap[FIELD_TO_HEADER.id] !== undefined) {
        return candidate;
      }
    }

    throw new Error(
      'USERS sheet not found. Expected tab "USERS" with header "User ID".'
    );
  }

  function headerMap_(sheet) {
    return SheetFieldUtils.getHeaderMap(sheet);
  }

  function assertRequiredHeaders_(headerMap) {
    var missing = [];
    var i;
    for (i = 0; i < REQUIRED_HEADERS.length; i++) {
      if (headerMap[REQUIRED_HEADERS[i]] === undefined) {
        missing.push(REQUIRED_HEADERS[i]);
      }
    }
    if (missing.length) {
      throw new Error(
        "USERS sheet missing required headers: " + missing.join(", ")
      );
    }
  }

  function readHeader_(sheetRow, header) {
    return cellText_(sheetRow[header]);
  }

  function toCanonical_(sheetRow) {
    var dateAdded = cellDateIso_(sheetRow[FIELD_TO_HEADER.createdAt]);

    return {
      id: readHeader_(sheetRow, FIELD_TO_HEADER.id),
      name: readHeader_(sheetRow, FIELD_TO_HEADER.name),
      email: readHeader_(sheetRow, FIELD_TO_HEADER.email),
      phone: readHeader_(sheetRow, FIELD_TO_HEADER.phone) || undefined,
      role: readHeader_(sheetRow, FIELD_TO_HEADER.role),
      specialization: readHeader_(sheetRow, FIELD_TO_HEADER.specialization),
      facility: readHeader_(sheetRow, FIELD_TO_HEADER.facility),
      activeWorkOrders: parseWorkload_(
        sheetRow[FIELD_TO_HEADER.activeWorkOrders]
      ),
      status: normalizeStatus_(sheetRow[FIELD_TO_HEADER.status]),
      lastActive: dateAdded || "",
      createdAt: dateAdded || "",
    };
  }

  function canonicalToSheetFields_(canonical, headerMap) {
    var fields = {};
    var fieldKey;

    for (fieldKey in FIELD_TO_HEADER) {
      if (!FIELD_TO_HEADER.hasOwnProperty(fieldKey)) continue;
      var header = FIELD_TO_HEADER[fieldKey];
      if (headerMap[header] === undefined) continue;

      var value = canonical[fieldKey];
      if (fieldKey === "status") {
        fields[header] = statusToSheet_(value);
      } else if (fieldKey === "activeWorkOrders") {
        fields[header] = workloadToSheet_(value);
      } else if (fieldKey === "phone") {
        fields[header] = phoneToSheet_(value);
      } else if (fieldKey === "createdAt") {
        fields[header] = value == null ? "" : value;
      } else {
        fields[header] = value == null ? "" : value;
      }
    }
    return fields;
  }

  function bumpCreateInvocationCount_() {
    var props = PropertiesService.getScriptProperties();
    var current = Number(props.getProperty(CREATE_COUNT_KEY) || "0");
    if (!Number.isFinite(current)) current = 0;
    var next = current + 1;
    props.setProperty(CREATE_COUNT_KEY, String(next));
    return next;
  }

  function logCreate_(details) {
    try {
      Logger.log("[UserRepository.create] " + JSON.stringify(details));
    } catch (ignore) {}
  }

  /**
   * Write only mapped headers onto an existing row. Never shifts columns.
   */
  function writeRowByHeaders_(sheet, rowIndex, fields, headerMap, lastCol) {
    var existing = sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
    var row = existing.slice();
    var header;
    for (header in fields) {
      if (!fields.hasOwnProperty(header)) continue;
      if (headerMap[header] === undefined) continue;
      row[headerMap[header]] = fields[header];
    }
    sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);

    if (
      headerMap[FIELD_TO_HEADER.phone] !== undefined &&
      fields[FIELD_TO_HEADER.phone] != null &&
      fields[FIELD_TO_HEADER.phone] !== ""
    ) {
      var phoneCol = headerMap[FIELD_TO_HEADER.phone] + 1;
      sheet.getRange(rowIndex, phoneCol).setNumberFormat("@");
    }

    return row;
  }

  function buildCanonicalForCreate_(id, payload) {
    payload = stripMeta_(payload);
    var now = new Date().toISOString();

    return {
      id: id,
      name: payload.name || "",
      email: payload.email || "",
      phone: payload.phone || undefined,
      role: payload.role || "",
      specialization: payload.specialization || "",
      facility: payload.facility || "",
      activeWorkOrders: 0,
      status: payload.status != null ? payload.status : "",
      lastActive: now,
      createdAt: now,
    };
  }

  function buildCanonicalForUpdate_(id, payload, current) {
    payload = stripMeta_(payload);
    current = current || {};
    var merged = {
      id: id,
      name: current.name || "",
      email: current.email || "",
      phone: current.phone,
      role: current.role || "",
      specialization: current.specialization || "",
      facility: current.facility || "",
      activeWorkOrders:
        current.activeWorkOrders != null ? current.activeWorkOrders : 0,
      status: current.status != null ? current.status : "",
      lastActive: current.lastActive || current.createdAt || "",
      createdAt: current.createdAt || "",
    };

    var i;
    for (i = 0; i < UPDATEABLE_FIELDS.length; i++) {
      var key = UPDATEABLE_FIELDS[i];
      if (payload.hasOwnProperty(key) && payload[key] !== undefined) {
        merged[key] = payload[key];
      }
    }

    if (payload.hasOwnProperty("activeWorkOrders")) {
      merged.activeWorkOrders = payload.activeWorkOrders;
    }

    return merged;
  }

  function verifyCanonicalAgainstRow_(sheetRow, expected) {
    var checks = [
      ["name", FIELD_TO_HEADER.name],
      ["email", FIELD_TO_HEADER.email],
      ["role", FIELD_TO_HEADER.role],
      ["specialization", FIELD_TO_HEADER.specialization],
      ["facility", FIELD_TO_HEADER.facility],
      ["status", FIELD_TO_HEADER.status],
    ];
    var i;
    for (i = 0; i < checks.length; i++) {
      var key = checks[i][0];
      var header = checks[i][1];
      var got = readHeader_(sheetRow, header);
      var want = String(expected[key] == null ? "" : expected[key]);
      if (header === FIELD_TO_HEADER.status) {
        got = normalizeStatus_(got);
        want = normalizeStatus_(want);
      }
      if (String(got) !== String(want)) {
        throw new Error(
          "USERS write verification failed for " +
            header +
            ' (expected "' +
            want +
            '", got "' +
            got +
            '"). Redeploy UserRepository.gs build ' +
            BUILD_MARKER +
            "."
        );
      }
    }
    if (expected.phone) {
      var gotPhone = readHeader_(sheetRow, FIELD_TO_HEADER.phone);
      var wantPhone = phoneToSheet_(expected.phone);
      if (
        String(gotPhone).replace(/^0+/, "") !==
        String(wantPhone).replace(/^0+/, "")
      ) {
        throw new Error(
          'USERS write verification failed for Phone (expected "' +
            wantPhone +
            '", got "' +
            gotPhone +
            '").'
        );
      }
    }
  }

  function getAll() {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return [];

    var headers = values[0];
    var rows = [];
    var r;
    for (r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var canonical = toCanonical_(sheetRow);
      if (!canonical.id) continue;
      rows.push(canonical);
    }
    return rows;
  }

  function getById(id) {
    var sheet = getSheet_();
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) return null;

    var headers = values[0];
    var headerMap = headerMap_(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    if (headerMap[idHeader] === undefined) return null;
    var idCol = headerMap[idHeader];

    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) !== String(id)) continue;
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      return toCanonical_(sheetRow);
    }
    return null;
  }

  function idExistsOnSheet_(sheet, headerMap, id) {
    var idHeader = FIELD_TO_HEADER.id;
    var idCol = headerMap[idHeader];
    if (idCol === undefined) return false;

    var values = sheet.getDataRange().getValues();
    var r;
    for (r = 1; r < values.length; r++) {
      if (String(values[r][idCol]) === String(id)) return true;
    }
    return false;
  }

  /** Highest numeric USR suffix on the sheet — ignores malformed IDs. */
  function maxExistingIdSuffix_(sheet, headerMap) {
    var idHeader = FIELD_TO_HEADER.id;
    var idCol = headerMap[idHeader];
    if (idCol === undefined) {
      throw new Error('USERS sheet missing "User ID" header.');
    }

    var values = sheet.getDataRange().getValues();
    var max = 0;
    var r;
    for (r = 1; r < values.length; r++) {
      var match = String(values[r][idCol] || "").match(/^USR-(\d+)$/i);
      if (match) {
        var n = parseInt(match[1], 10);
        if (n > max) max = n;
      }
    }
    return max;
  }

  /**
   * Increment from the highest USR suffix and verify the candidate is unused.
   * Duplicate/malformed rows cannot reset the counter below the true max suffix.
   */
  function allocateUniqueId_(sheet, headerMap) {
    var suffix = maxExistingIdSuffix_(sheet, headerMap);
    var attempt;
    for (attempt = 0; attempt < 100; attempt++) {
      suffix = suffix + 1;
      var candidate = "USR-" + ("0000" + suffix).slice(-4);
      if (!idExistsOnSheet_(sheet, headerMap, candidate)) {
        return candidate;
      }
    }
    throw new Error(
      "Could not allocate a unique User ID after 100 attempts. Check for duplicate USR rows."
    );
  }

  function create(payload) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error("USERS create busy — another write is in progress.");
    }

    var clientRequestId =
      payload && payload._clientRequestId
        ? String(payload._clientRequestId)
        : "";
    var startedAt = new Date().toISOString();
    var createInvocationCount = bumpCreateInvocationCount_();

    try {
      var sheet = getSheet_();
      var headerMap = headerMap_(sheet);
      assertRequiredHeaders_(headerMap);

      var id = allocateUniqueId_(sheet, headerMap);
      if (idExistsOnSheet_(sheet, headerMap, id)) {
        throw new Error(
          "Refusing to create duplicate User ID " +
            id +
            ". Delete or repair conflicting rows first."
        );
      }

      var record = buildCanonicalForCreate_(id, payload);
      var lastCol = Math.max(sheet.getLastColumn(), REQUIRED_HEADERS.length);
      var fields = canonicalToSheetFields_(record, headerMap);
      var row = SheetFieldUtils.buildRowFromFields(headerMap, lastCol, fields);

      logCreate_({
        buildMarker: BUILD_MARKER,
        clientRequestId: clientRequestId,
        startedAt: startedAt,
        createInvocationCount: createInvocationCount,
        generatedId: id,
        fieldsWritten: fields,
      });

      sheet.appendRow(new Array(lastCol).fill(""));
      var rowIndex = sheet.getLastRow();
      sheet.getRange(rowIndex, 1, 1, lastCol).setValues([row]);

      if (
        headerMap[FIELD_TO_HEADER.phone] !== undefined &&
        fields[FIELD_TO_HEADER.phone] != null &&
        fields[FIELD_TO_HEADER.phone] !== ""
      ) {
        var phoneCol = headerMap[FIELD_TO_HEADER.phone] + 1;
        sheet.getRange(rowIndex, phoneCol).setNumberFormat("@");
      }

      SpreadsheetApp.flush();

      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var writtenRow = SheetFieldUtils.rowToSheetObject(
        headers,
        sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0]
      );
      verifyCanonicalAgainstRow_(writtenRow, record);

      var found = getById(id);
      if (!found) {
        throw new Error(
          "User create wrote row " +
            id +
            " but getById could not re-read it."
        );
      }

      found._write = {
        buildMarker: BUILD_MARKER,
        createPath: "UserRepository.create",
        sheetName: sheet.getName(),
        rowIndex: rowIndex,
        clientRequestId: clientRequestId,
        startedAt: startedAt,
        createInvocationCount: createInvocationCount,
        generatedId: id,
        fieldsWritten: fields,
      };
      return found;
    } finally {
      lock.releaseLock();
    }
  }

  function update(id, payload) {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      throw new Error("USERS update busy — another write is in progress.");
    }

    try {
      var sheet = getSheet_();
      var values = sheet.getDataRange().getValues();
      if (values.length <= 1) return null;

      var headers = values[0];
      var headerMap = headerMap_(sheet);
      assertRequiredHeaders_(headerMap);
      var idHeader = FIELD_TO_HEADER.id;
      if (headerMap[idHeader] === undefined) return null;
      var idCol = headerMap[idHeader];

      var rowIndex = -1;
      var r;
      for (r = 1; r < values.length; r++) {
        if (String(values[r][idCol]) === String(id)) {
          rowIndex = r + 1;
          break;
        }
      }
      if (rowIndex === -1) return null;

      var current = getById(id);
      if (!current) return null;

      var merged = buildCanonicalForUpdate_(id, payload || {}, current);
      var lastCol = Math.max(sheet.getLastColumn(), REQUIRED_HEADERS.length);
      var fields = canonicalToSheetFields_(merged, headerMap);
      writeRowByHeaders_(sheet, rowIndex, fields, headerMap, lastCol);
      SpreadsheetApp.flush();

      var writtenRow = SheetFieldUtils.rowToSheetObject(
        headers,
        sheet.getRange(rowIndex, 1, 1, lastCol).getValues()[0]
      );
      verifyCanonicalAgainstRow_(writtenRow, merged);
      return getById(id);
    } finally {
      lock.releaseLock();
    }
  }

  function deactivate(id) {
    return update(id, { status: "inactive" });
  }

  function getBuildInfo() {
    return {
      buildMarker: BUILD_MARKER,
      createPath: "UserRepository.create",
      fieldToHeader: FIELD_TO_HEADER,
      createInvocationCount: Number(
        PropertiesService.getScriptProperties().getProperty(CREATE_COUNT_KEY) ||
          "0"
      ),
    };
  }

  /** WO filter dropdown — id/name only. */
  function listFilterCatalog() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var idHeader = FIELD_TO_HEADER.id;
    var nameHeader = FIELD_TO_HEADER.name;
    if (!SheetFieldUtils.hasHeader(headerMap, idHeader)) return [];

    var idCol = headerMap[idHeader] + 1;
    var nameCol = SheetFieldUtils.hasHeader(headerMap, nameHeader)
      ? headerMap[nameHeader] + 1
      : -1;
    if (nameCol < 1) return [];

    var idValues = sheet.getRange(2, idCol, lastRow, idCol).getValues();
    var nameValues = sheet.getRange(2, nameCol, lastRow, nameCol).getValues();
    var rows = [];
    var r;
    for (r = 0; r < idValues.length; r++) {
      var id = cellText_(idValues[r][0]);
      if (!id) continue;
      var name = cellText_(nameValues[r][0]) || id;
      rows.push({ id: id, name: name });
    }
    rows.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    return rows;
  }

  return {
    BUILD_MARKER: BUILD_MARKER,
    getAll: getAll,
    getById: getById,
    listFilterCatalog: listFilterCatalog,
    create: create,
    update: update,
    deactivate: deactivate,
    getBuildInfo: getBuildInfo,
  };
})();
```

======================================
FILE:
WorkOrderRepository.gs
======================================

```javascript
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
    var headerMap = SheetFieldUtils.headerMapFromRow
      ? SheetFieldUtils.headerMapFromRow(headers)
      : SheetFieldUtils.getHeaderMap(sheet);
    var rows = [];
    var tMap0 = auditCollector ? Date.now() : 0;
    for (var r = 1; r < values.length; r++) {
      var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[r]);
      var id = SheetFieldUtils.cellText(sheetRow["Work Order ID"]);
      if (!id) continue;
      var canonical = toCanonical_(sheetRow, headerMap);
      delete canonical._completedBy;
      delete canonical._dateClosed;
      rows.push(canonical);
    }
    if (auditCollector && typeof OperationalListAudit !== "undefined") {
      OperationalListAudit.finishMapping_(auditCollector, tMap0, rows);
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
```

======================================
FILE:
ApprovalService.gs
======================================

```javascript
/**
 * ApprovalService.gs
 *
 * Business rules for client Approval Requests linked to Work Orders.
 */

var ApprovalService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var type = payload.type;
    var facilityId = payload.facilityId;
    var workOrderId = payload.workOrderId;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.workOrderId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.reason || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.type || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesType =
        !type ||
        type === "all" ||
        String(row.type || "").toLowerCase() === String(type).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesWorkOrder =
        !workOrderId ||
        workOrderId === "all" ||
        String(row.workOrderId) === String(workOrderId);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesType &&
        matchesFacility &&
        matchesWorkOrder
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.updatedAt || a.createdAt || "");
      var bAt = String(b.updatedAt || b.createdAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function loadCanonicalRows_(payload, auditCollector) {
    payload = payload || {};
    if (typeof OperationalRegisterCache === "undefined") {
      return ApprovalRepository.getAll(auditCollector);
    }
    return OperationalRegisterCache.getCanonicalRows(
      OperationalRegisterCache.NAMESPACES.approvals,
      function (collector) {
        return ApprovalRepository.getAll(collector);
      },
      {
        skipCache: !!payload._skipCache,
        auditCollector: auditCollector,
      }
    );
  }

  function invalidateRegisterCache_() {
    if (typeof OperationalRegisterCache !== "undefined") {
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.approvals
      );
    }
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return loadCanonicalRows_(payload, auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = loadCanonicalRows_(payload, null);
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Approval id is required.");
    var row = ApprovalRepository.getById(id);
    if (!row) throw new Error("Approval " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    if (!payload.workOrderId) {
      throw new Error("Work order id is required for an approval request.");
    }
    if (!payload.title) {
      throw new Error("Approval title is required.");
    }
    var created = ApprovalRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("approvals");
    }
    invalidateRegisterCache_();
    return created;
  }

  function update(payload) {
    payload = payload || {};
    if (!payload.id) throw new Error("Approval id is required.");
    var updated = ApprovalRepository.update(payload.id, payload);
    if (!updated) throw new Error("Approval " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("approvals");
    }
    invalidateRegisterCache_();
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Approval id is required.");
    var updated = ApprovalRepository.deactivate(payload.id);
    if (!updated) throw new Error("Approval " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("approvals");
    }
    invalidateRegisterCache_();
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
AssetService.gs
======================================

```javascript
/**
 * AssetService.gs
 *
 * Business rules for Assets. Mirrors FacilityService.gs / WorkOrderService.gs.
 * Never talks to the spreadsheet directly — only AssetRepository.
 *
 * List pipeline: all → sort by id → search/filters → paginate
 */

var AssetService = (function () {
  function parseAssetSeq_(id) {
    var match = String(id || "").match(/AST-(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var category = payload.category;
    var facility = payload.facility;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facility || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.serialNumber || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.manufacturer || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.model || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assignedTo || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.oemId || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesCategory =
        !category ||
        category === "all" ||
        String(row.category).toLowerCase() === String(category).toLowerCase();

      var rowFacility = String(row.facility || "");
      var matchesFacility =
        !facility ||
        facility === "all" ||
        rowFacility === String(facility);

      if (
        !matchesFacility &&
        facility &&
        facility !== "all" &&
        typeof FacilityRepository !== "undefined"
      ) {
        try {
          var facilities = FacilityRepository.getAll() || [];
          var i;
          for (i = 0; i < facilities.length; i++) {
            var f = facilities[i];
            var fid = String(f.id || "");
            var fname = String(f.name || "");
            if (
              (fid === String(facility) || fname === String(facility)) &&
              (rowFacility === fid || rowFacility === fname)
            ) {
              matchesFacility = true;
              break;
            }
          }
        } catch (ignore) {}
      }

      return (
        matchesSearch && matchesStatus && matchesCategory && matchesFacility
      );
    });
  }

  function compareName_(a, b) {
    var byName = String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return String(a.id || "").localeCompare(String(b.id || ""));
  }

  function sortRows_(rows, payload) {
    var sort = String((payload && payload.sort) || "newest").toLowerCase();
    var next = rows.slice();
    if (sort === "oldest") {
      return next.sort(function (a, b) {
        var aSeq = parseAssetSeq_(a.id);
        var bSeq = parseAssetSeq_(b.id);
        if (aSeq === bSeq) {
          return String(a.id || "").localeCompare(String(b.id || ""));
        }
        return aSeq - bSeq;
      });
    }
    if (sort === "name_asc") {
      return next.sort(function (a, b) {
        return compareName_(a, b);
      });
    }
    if (sort === "name_desc") {
      return next.sort(function (a, b) {
        return compareName_(b, a);
      });
    }
    return next.sort(function (a, b) {
      var aSeq = parseAssetSeq_(a.id);
      var bSeq = parseAssetSeq_(b.id);
      if (aSeq === bSeq) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return bSeq - aSeq;
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = AssetRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Asset id is required.");
    var asset = AssetRepository.getById(id);
    if (!asset) throw new Error("Asset " + id + " not found.");
    return asset;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("Asset name is required.");
    if (!payload.facility) throw new Error("Facility is required.");
    var created = AssetRepository.create(payload);
    if (!created || !created.id) {
      throw new Error(
        "Asset create failed: repository returned no record. Check the Assets sheet headers."
      );
    }
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Asset id is required.");
    var updated = AssetRepository.update(payload.id, payload);
    if (!updated) throw new Error("Asset " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Asset id is required.");
    var updated = AssetRepository.deactivate(payload.id);
    if (!updated) throw new Error("Asset " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
CatalogCacheService.gs
======================================

```javascript
/**
 * CatalogCacheService.gs
 *
 * Apps Script CacheService layer for lightweight reference/catalog projections.
 * Caches finished JSON projections — not raw full-sheet objects.
 */

var CatalogCacheService = (function () {
  var CACHE_VERSION = "v1";
  var KEY_WO_FILTER_CATALOG = "catalog:" + CACHE_VERSION + ":wo-filter";
  var KEY_MAINTENANCE_CATALOG = "catalog:" + CACHE_VERSION + ":mnt-list";
  var KEY_LOCATION_CATALOG = "catalog:" + CACHE_VERSION + ":location";
  /** Safety-net TTL — mutations invalidate explicitly; never rely on TTL alone. */
  var TTL_SECONDS = 600;

  function cache_() {
    return CacheService.getScriptCache();
  }

  function readJson_(key) {
    var t0 = Date.now();
    var raw = SheetFieldUtils.cacheGetUtf8(cache_(), key);
    var cacheReadMs = Date.now() - t0;
    if (raw == null || raw === "") return null;
    try {
      return { value: JSON.parse(raw), cacheReadMs: cacheReadMs };
    } catch (err) {
      try {
        cache_().remove(key);
      } catch (removeErr) {}
      return null;
    }
  }

  function writeJson_(key, value) {
    SheetFieldUtils.cachePutUtf8(
      cache_(),
      key,
      JSON.stringify(value),
      TTL_SECONDS
    );
  }

  function getWoFilterCatalog() {
    var parsed = readJson_(KEY_WO_FILTER_CATALOG);
    if (!parsed) return null;
    return {
      data: parsed.value,
      cacheReadMs: parsed.cacheReadMs,
    };
  }

  function putWoFilterCatalog(data) {
    writeJson_(KEY_WO_FILTER_CATALOG, data);
  }

  function invalidateWoFilterCatalog() {
    try {
      cache_().remove(KEY_WO_FILTER_CATALOG);
      Logger.log("[CatalogCacheService] invalidated " + KEY_WO_FILTER_CATALOG);
    } catch (err) {
      Logger.log("[CatalogCacheService] invalidate wo-filter failed: " + err);
    }
  }

  function getMaintenanceCatalogRows() {
    var parsed = readJson_(KEY_MAINTENANCE_CATALOG);
    if (!parsed) return null;
    return {
      rows: parsed.value,
      cacheReadMs: parsed.cacheReadMs,
    };
  }

  function putMaintenanceCatalogRows(rows) {
    writeJson_(KEY_MAINTENANCE_CATALOG, rows);
  }

  function invalidateMaintenanceCatalog() {
    try {
      cache_().remove(KEY_MAINTENANCE_CATALOG);
      Logger.log(
        "[CatalogCacheService] invalidated " + KEY_MAINTENANCE_CATALOG
      );
    } catch (err) {
      Logger.log("[CatalogCacheService] invalidate mnt-list failed: " + err);
    }
  }

  function getLocationCatalog() {
    var parsed = readJson_(KEY_LOCATION_CATALOG);
    if (!parsed) return null;
    return {
      data: parsed.value,
      cacheReadMs: parsed.cacheReadMs,
    };
  }

  function putLocationCatalog(data) {
    writeJson_(KEY_LOCATION_CATALOG, data);
  }

  function invalidateLocationCatalog() {
    try {
      cache_().remove(KEY_LOCATION_CATALOG);
      Logger.log("[CatalogCacheService] invalidated " + KEY_LOCATION_CATALOG);
    } catch (err) {
      Logger.log(
        "[CatalogCacheService] invalidate location catalog failed: " + err
      );
    }
  }

  return {
    CACHE_VERSION: CACHE_VERSION,
    KEY_WO_FILTER_CATALOG: KEY_WO_FILTER_CATALOG,
    KEY_MAINTENANCE_CATALOG: KEY_MAINTENANCE_CATALOG,
    KEY_LOCATION_CATALOG: KEY_LOCATION_CATALOG,
    getWoFilterCatalog: getWoFilterCatalog,
    putWoFilterCatalog: putWoFilterCatalog,
    invalidateWoFilterCatalog: invalidateWoFilterCatalog,
    getMaintenanceCatalogRows: getMaintenanceCatalogRows,
    putMaintenanceCatalogRows: putMaintenanceCatalogRows,
    invalidateMaintenanceCatalog: invalidateMaintenanceCatalog,
    getLocationCatalog: getLocationCatalog,
    putLocationCatalog: putLocationCatalog,
    invalidateLocationCatalog: invalidateLocationCatalog,
  };
})();
```

======================================
FILE:
CostRecordService.gs
======================================

```javascript
/**
 * CostRecordService.gs
 *
 * Business rules for CostRecord persistence.
 * Never talks to the spreadsheet directly — only CostRecordRepository.
 */

/**
 * Run once from the Apps Script editor after deploying receipt uploads.
 * This deliberately prompts the project owner for the required Drive scope.
 */
function initialiseCostEvidenceStorage() {
  return CostRecordService.initialiseEvidenceStorage();
}

var CostRecordService = (function () {
  var EVIDENCE_FOLDER_NAME = "SentraCore Cost Evidence";
  var MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024;
  var VALID_EVIDENCE_MIME_TYPES = {
    "application/pdf": true,
    "image/jpeg": true,
    "image/png": true,
  };
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

  /**
   * V1 lock: reject updates when the cost is on a non-draft, non-cancelled claim.
   * Draft claims do not lock. Authoritative — do not rely on the UI alone.
   */
  function allowsProtectedCostUnlock_(payload) {
    payload = payload || {};
    var action = String(payload._protectedAction || "");
    var mode = String(payload._authorityMode || "");
    return (
      action === "finance.cost.unlock_edit" &&
      (mode === "facility_manager" || mode === "platform_override")
    );
  }

  function assertCostRecordEditable_(costId, payload) {
    if (allowsProtectedCostUnlock_(payload)) return;
    if (typeof CostSubmissionRepository === "undefined") return;
    var rows = CostSubmissionRepository.getAll() || [];
    var target = String(costId || "");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var status = String(row.status || "").toLowerCase();
      if (status === "draft" || status === "cancelled") continue;
      var ids = row.costRecordIds || [];
      for (var j = 0; j < ids.length; j++) {
        if (String(ids[j]) === target) {
          throw new Error(
            "Cost record " +
              target +
              " cannot be edited because it is part of reimbursement claim " +
              String(row.submissionId || "") +
              " (" +
              status +
              ")."
          );
        }
      }
    }
  }

  function validateCreatePayload_(payload) {
    payload = payload || {};
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility id is required.");
    }
    if (!payload.location || !String(payload.location).trim()) {
      throw new Error("Location is required.");
    }
    if (!payload.description || !String(payload.description).trim()) {
      throw new Error("Description is required.");
    }
    if (!payload.recordedBy || !String(payload.recordedBy).trim()) {
      throw new Error("Recorded by is required.");
    }
    var category = normalizeEnum_(payload.category);
    if (!VALID_CATEGORIES[category]) {
      throw new Error("Invalid cost category: " + payload.category);
    }
    var reimbursability = normalizeEnum_(payload.reimbursability || "unknown");
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
    if (payload.actualAmount == null || Number(payload.actualAmount) < 0) {
      throw new Error("Actual amount must be a non-negative number.");
    }
    if (
      payload.budgetedAmount != null &&
      payload.budgetedAmount !== "" &&
      Number(payload.budgetedAmount) < 0
    ) {
      throw new Error("Budgeted amount must be a non-negative number.");
    }
    if (
      payload.estimatedAmount != null &&
      payload.estimatedAmount !== "" &&
      Number(payload.estimatedAmount) < 0
    ) {
      throw new Error("Budgeted amount must be a non-negative number.");
    }
  }

  function evidenceFolder_() {
    var folders = DriveApp.getFoldersByName(EVIDENCE_FOLDER_NAME);
    return folders.hasNext() ? folders.next() : DriveApp.createFolder(EVIDENCE_FOLDER_NAME);
  }

  function initialiseEvidenceStorage() {
    var folder = evidenceFolder_();
    return { id: folder.getId(), name: folder.getName(), url: folder.getUrl() };
  }

  function safeEvidenceFileName_(fileName) {
    var name = String(fileName || "receipt").trim();
    name = name.replace(/[\\\\/:*?"<>|]/g, "-");
    return name || "receipt";
  }

  function uploadEvidence_(evidence) {
    var upload = evidence && evidence.upload;
    if (!upload) return { evidence: evidence, file: null };

    var mimeType = String(upload.mimeType || "").toLowerCase();
    if (!VALID_EVIDENCE_MIME_TYPES[mimeType]) {
      throw new Error("Evidence upload must be a PDF, JPEG, or PNG file.");
    }
    var declaredSize = Number(upload.sizeBytes);
    if (!isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_EVIDENCE_FILE_BYTES) {
      throw new Error("Evidence upload must be 5 MB or smaller.");
    }
    var bytes;
    try {
      bytes = Utilities.base64Decode(String(upload.base64 || ""));
    } catch (error) {
      throw new Error("Evidence upload could not be decoded.");
    }
    if (!bytes.length || bytes.length > MAX_EVIDENCE_FILE_BYTES) {
      throw new Error("Evidence upload must be 5 MB or smaller.");
    }

    var fileName = safeEvidenceFileName_(upload.fileName);
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var file = evidenceFolder_().createFile(blob);
    return {
      evidence: {
        reference: String((evidence && evidence.reference) || fileName).trim(),
        fileId: file.getId(),
        fileName: file.getName(),
        mimeType: mimeType,
        sizeBytes: bytes.length,
        fileUrl: file.getUrl(),
      },
      file: file,
    };
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var facilityId = payload.facilityId;
    var category = payload.category;
    var reimbursability = payload.reimbursability;
    var workId = payload.workId;
    var workOrderId = payload.workOrderId;
    var jobOrderId = payload.jobOrderId;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.costId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.evidence && row.evidence.reference ? row.evidence.reference : "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesCategory =
        !category ||
        category === "all" ||
        String(row.category) === String(category);

      var matchesReimbursability =
        !reimbursability ||
        reimbursability === "all" ||
        String(row.reimbursability) === String(reimbursability);

      var matchesWorkId =
        !workId || String(row.workId || "") === String(workId);
      var matchesWorkOrderId =
        !workOrderId || String(row.workOrderId || "") === String(workOrderId);
      var matchesJobOrderId =
        !jobOrderId || String(row.jobOrderId || "") === String(jobOrderId);

      return (
        matchesSearch &&
        matchesFacility &&
        matchesCategory &&
        matchesReimbursability &&
        matchesWorkId &&
        matchesWorkOrderId &&
        matchesJobOrderId
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.recordedAt || "");
      var bAt = String(b.recordedAt || "");
      if (aAt === bAt) {
        return String(b.costId || "").localeCompare(String(a.costId || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return CostRecordRepository.getAll(auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = CostRecordRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var costId = payload && (payload.costId || payload.id);
    if (!costId) throw new Error("Cost id is required.");
    var row = CostRecordRepository.getById(costId);
    if (!row) throw new Error("Cost record " + costId + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    validateCreatePayload_(payload);
    var uploaded = uploadEvidence_(payload.evidence);
    payload.evidence = uploaded.evidence;
    var created;
    try {
      created = CostRecordRepository.create(payload);
    } catch (error) {
      if (uploaded.file) uploaded.file.setTrashed(true);
      throw error;
    }
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyModuleChanged
    ) {
      ReportingSnapshotService.notifyModuleChanged("cost-records");
    }
    return created;
  }

  function update(payload) {
    payload = payload || {};
    var costId = payload.costId || payload.id;
    if (!costId) throw new Error("Cost id is required.");
    assertCostRecordEditable_(costId, payload);
    if (payload.category != null && !VALID_CATEGORIES[normalizeEnum_(payload.category)]) {
      throw new Error("Invalid cost category: " + payload.category);
    }
    if (
      payload.reimbursability != null &&
      !VALID_REIMBURSABILITY[normalizeEnum_(payload.reimbursability)]
    ) {
      throw new Error("Invalid reimbursability: " + payload.reimbursability);
    }
    if (payload.actualAmount != null && Number(payload.actualAmount) < 0) {
      throw new Error("Actual amount must be a non-negative number.");
    }
    if (
      payload.budgetedAmount != null &&
      payload.budgetedAmount !== "" &&
      Number(payload.budgetedAmount) < 0
    ) {
      throw new Error("Budgeted amount must be a non-negative number.");
    }
    if (
      payload.estimatedAmount != null &&
      payload.estimatedAmount !== "" &&
      Number(payload.estimatedAmount) < 0
    ) {
      throw new Error("Budgeted amount must be a non-negative number.");
    }
    var updated = CostRecordRepository.update(costId, payload);
    if (!updated) throw new Error("Cost record " + costId + " not found.");
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyModuleChanged
    ) {
      ReportingSnapshotService.notifyModuleChanged("cost-records");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    initialiseEvidenceStorage: initialiseEvidenceStorage,
  };
})();
```

======================================
FILE:
CostSubmissionService.gs
======================================

```javascript
/**
 * CostSubmissionService.gs
 *
 * Business rules for CostSubmission persistence.
 * Never talks to the spreadsheet directly — only CostSubmissionRepository.
 */

var CostSubmissionService = (function () {
  var VALID_STATUSES = {
    draft: true,
    submitted: true,
    queried: true,
    cancelled: true,
  };

  function normalizeStatus_(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function readCostRecordIds_(payload) {
    payload = payload || {};
    if (payload.costRecordIds != null) {
      if (Object.prototype.toString.call(payload.costRecordIds) === "[object Array]") {
        return payload.costRecordIds;
      }
      return SheetFieldUtils.parseIdList(payload.costRecordIds);
    }
    if (payload.costRecordId) {
      return [String(payload.costRecordId).trim()];
    }
    return [];
  }

  function validateSubmissionShape_(submission, context) {
    submission = submission || {};
    var errors = [];

    if (context === "update") {
      if (
        !submission.submissionId ||
        !String(submission.submissionId).trim()
      ) {
        errors.push("submissionId is required");
      } else if (
        !/^SUB-\d{4}-\d{6}$/i.test(String(submission.submissionId))
      ) {
        errors.push("submissionId must match SUB-YYYY-NNNNNN format");
      }
    }

    var status = normalizeStatus_(submission.status);
    if (!VALID_STATUSES[status]) {
      errors.push("status must be draft, submitted, queried, or cancelled");
    }

    if (!submission.createdAt || !String(submission.createdAt).trim()) {
      errors.push("createdAt is required");
    }
    if (!submission.createdBy || !String(submission.createdBy).trim()) {
      errors.push("createdBy is required");
    }
    if (!submission.currency || !String(submission.currency).trim()) {
      errors.push("currency is required");
    }

    var costRecordIds = submission.costRecordIds || [];
    if (
      (status === "submitted" || status === "queried") &&
      costRecordIds.length === 0
    ) {
      errors.push(
        "at least one CostRecord reference is required when status is submitted or queried"
      );
    }

    if (
      submission.claimAmount != null &&
      submission.claimAmount !== "" &&
      Number(submission.claimAmount) < 0
    ) {
      errors.push("claimAmount must be a non-negative number when supplied");
    }

    if (submission.markup) {
      if (
        submission.markup.markupAmount != null &&
        Number(submission.markup.markupAmount) < 0
      ) {
        errors.push("markup.markupAmount must be non-negative when supplied");
      }
      if (
        submission.markup.markupRatePercent != null &&
        Number(submission.markup.markupRatePercent) < 0
      ) {
        errors.push(
          "markup.markupRatePercent must be non-negative when supplied"
        );
      }
    }

    if (status === "submitted" || status === "queried") {
      if (!submission.submittedAt || !String(submission.submittedAt).trim()) {
        errors.push("submittedAt is required when status is submitted or queried");
      }
      if (!submission.submittedBy || !String(submission.submittedBy).trim()) {
        errors.push("submittedBy is required when status is submitted or queried");
      }
    }

    if (status === "queried") {
      if (!submission.queriedAt || !String(submission.queriedAt).trim()) {
        errors.push("queriedAt is required when status is queried");
      }
    }

    if (errors.length) {
      throw new Error(errors.join("; "));
    }
  }

  function validateCreatePayload_(payload) {
    payload = payload || {};
    if (!payload.createdBy || !String(payload.createdBy).trim()) {
      throw new Error("Created by is required.");
    }
    if (!payload.currency || !String(payload.currency).trim()) {
      throw new Error("Currency is required.");
    }
    var status = normalizeStatus_(payload.status || "draft");
    if (!VALID_STATUSES[status]) {
      throw new Error("Invalid submission status: " + payload.status);
    }

    validateSubmissionShape_(
      {
        status: status,
        currency: payload.currency,
        createdAt: payload.createdAt || new Date().toISOString(),
        createdBy: payload.createdBy,
        costRecordIds: readCostRecordIds_(payload),
        claimAmount: payload.claimAmount,
        markup: payload.markup,
        submittedAt: payload.submittedAt,
        submittedBy: payload.submittedBy,
        queriedAt: payload.queriedAt,
      },
      "create"
    );
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var facilityId = payload.facilityId;
    var status = payload.status;
    var approvalId = payload.approvalId;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.submissionId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.periodLabel || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.submissionKind || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        (row.costRecordIds || []).join(",").toLowerCase().indexOf(search) !== -1;

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId || "") === String(facilityId);

      var matchesStatus =
        !status || status === "all" || String(row.status) === String(status);

      var matchesApproval =
        !approvalId || String(row.approvalId || "") === String(approvalId);

      return (
        matchesSearch && matchesFacility && matchesStatus && matchesApproval
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.createdAt || "");
      var bAt = String(b.createdAt || "");
      if (aAt === bAt) {
        return String(a.submissionId || "").localeCompare(
          String(b.submissionId || "")
        );
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return CostSubmissionRepository.getAll(auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = CostSubmissionRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var submissionId =
      payload && (payload.submissionId || payload.id);
    if (!submissionId) throw new Error("Submission id is required.");
    var row = CostSubmissionRepository.getById(submissionId);
    if (!row) throw new Error("Cost submission " + submissionId + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    validateCreatePayload_(payload);
    var created = CostSubmissionRepository.create(payload);
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyModuleChanged
    ) {
      ReportingSnapshotService.notifyModuleChanged("cost-submissions");
    }
    return created;
  }

  function update(payload) {
    payload = payload || {};
    var submissionId = payload.submissionId || payload.id;
    if (!submissionId) throw new Error("Submission id is required.");

    var existing = CostSubmissionRepository.getById(submissionId);
    if (!existing) {
      throw new Error("Cost submission " + submissionId + " not found.");
    }

    var nextStatus =
      payload.status != null
        ? normalizeStatus_(payload.status)
        : normalizeStatus_(existing.status);
    var fromStatus = normalizeStatus_(existing.status);
    if (fromStatus !== nextStatus) {
      var allowed = {
        draft: { submitted: true, cancelled: true },
        submitted: { queried: true, cancelled: true },
        queried: { submitted: true, cancelled: true },
        cancelled: {},
      };
      if (!allowed[fromStatus] || !allowed[fromStatus][nextStatus]) {
        throw new Error(
          "Invalid submission lifecycle transition: " +
            fromStatus +
            " → " +
            nextStatus
        );
      }
    }

    var merged = {
      submissionId: existing.submissionId,
      status: payload.status != null ? payload.status : existing.status,
      currency: payload.currency != null ? payload.currency : existing.currency,
      createdAt: existing.createdAt,
      createdBy: payload.createdBy != null ? payload.createdBy : existing.createdBy,
      costRecordIds:
        payload.costRecordIds != null || payload.costRecordId != null
          ? readCostRecordIds_(payload)
          : existing.costRecordIds,
      claimAmount:
        payload.claimAmount !== undefined
          ? payload.claimAmount
          : existing.claimAmount,
      markup: payload.markup != null ? payload.markup : existing.markup,
      facilityId:
        payload.facilityId !== undefined
          ? payload.facilityId
          : existing.facilityId,
      departmentId:
        payload.departmentId !== undefined
          ? payload.departmentId
          : existing.departmentId,
      periodLabel:
        payload.periodLabel !== undefined
          ? payload.periodLabel
          : existing.periodLabel,
      submissionKind:
        payload.submissionKind !== undefined
          ? payload.submissionKind
          : existing.submissionKind,
      submissionPackage:
        payload.submissionPackage != null
          ? payload.submissionPackage
          : existing.submissionPackage,
      refs: payload.refs != null ? payload.refs : existing.refs,
      executionKind:
        payload.executionKind !== undefined
          ? payload.executionKind
          : existing.executionKind,
      executionId:
        payload.executionId !== undefined
          ? payload.executionId
          : existing.executionId,
      approvalId:
        payload.approvalId !== undefined
          ? payload.approvalId
          : existing.approvalId,
      submittedAt:
        payload.submittedAt !== undefined
          ? payload.submittedAt
          : existing.submittedAt,
      submittedBy:
        payload.submittedBy !== undefined
          ? payload.submittedBy
          : existing.submittedBy,
      queriedAt:
        payload.queriedAt !== undefined ? payload.queriedAt : existing.queriedAt,
      queryNotes:
        payload.queryNotes !== undefined
          ? payload.queryNotes
          : existing.queryNotes,
      notes: payload.notes !== undefined ? payload.notes : existing.notes,
    };

    validateSubmissionShape_(merged, "update");
    var updated = CostSubmissionRepository.update(submissionId, payload);
    if (!updated) throw new Error("Cost submission " + submissionId + " not found.");
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyModuleChanged
    ) {
      ReportingSnapshotService.notifyModuleChanged("cost-submissions");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
```

======================================
FILE:
FacilityService.gs
======================================

```javascript
/**
 * FacilityService.gs
 *
 * Business rules for Facilities. Mirrors UserService.gs pattern.
 * Never talks to the spreadsheet directly — only FacilityRepository.
 */

var FacilityService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var type = payload.type;
    var location = payload.location;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.code || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.location || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.manager || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status || status === "all" || String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesType =
        !type || type === "all" || String(row.type).toLowerCase() === String(type).toLowerCase();

      var matchesLocation =
        !location ||
        location === "all" ||
        String(row.location) === String(location);

      return matchesSearch && matchesStatus && matchesType && matchesLocation;
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = FacilityRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Facility id is required.");
    var facility = FacilityRepository.getById(id);
    if (!facility) throw new Error("Facility " + id + " not found.");
    return facility;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("Facility name is required.");
    // Facility code is system-generated when omitted.
    var created = FacilityRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
      CatalogCacheService.invalidateLocationCatalog();
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Facility id is required.");
    var updated = FacilityRepository.update(payload.id, payload);
    if (!updated) throw new Error("Facility " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
      CatalogCacheService.invalidateLocationCatalog();
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Facility id is required.");
    var updated = FacilityRepository.deactivate(payload.id);
    if (!updated) throw new Error("Facility " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
      CatalogCacheService.invalidateLocationCatalog();
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
IncidentService.gs
======================================

```javascript
/**
 * IncidentService.gs
 *
 * Business rules for Incidents. Mirrors WorkOrderService.gs.
 * Never talks to the spreadsheet directly — only IncidentRepository.
 */

var IncidentService = (function () {
  function applyWorkOrderRule_(payload) {
    payload = payload || {};
    if (payload.requiresWorkOrder === false || payload.requiresWorkOrder === "false") {
      payload.requiresWorkOrder = false;
      payload.workOrderId = "";
    }
    return payload;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var severity = payload.severity;
    var status = payload.status;
    var facilityId = payload.facilityId;
    var assignedToUserId = payload.assignedToUserId;
    var requiresWorkOrder = payload.requiresWorkOrder;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesSeverity =
        !severity ||
        severity === "all" ||
        String(row.severity).toLowerCase() === String(severity).toLowerCase();

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesAssignee =
        !assignedToUserId ||
        assignedToUserId === "all" ||
        String(row.assignedToUserId) === String(assignedToUserId);

      var matchesRequiresWo = true;
      if (requiresWorkOrder !== undefined && requiresWorkOrder !== "all") {
        var flag =
          row.requiresWorkOrder === true ||
          row.requiresWorkOrder === "true" ||
          row.requiresWorkOrder === 1;
        var wanted =
          requiresWorkOrder === true ||
          requiresWorkOrder === "true" ||
          requiresWorkOrder === 1;
        matchesRequiresWo = flag === wanted;
      }

      return (
        matchesSearch &&
        matchesSeverity &&
        matchesStatus &&
        matchesFacility &&
        matchesAssignee &&
        matchesRequiresWo
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.createdAt || a.reportedAt || a.updatedAt || "");
      var bAt = String(b.createdAt || b.reportedAt || b.updatedAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function loadCanonicalRows_(payload, auditCollector) {
    payload = payload || {};
    if (typeof OperationalRegisterCache === "undefined") {
      return IncidentRepository.getAll(auditCollector);
    }
    return OperationalRegisterCache.getCanonicalRows(
      OperationalRegisterCache.NAMESPACES.incidents,
      function (collector) {
        return IncidentRepository.getAll(collector);
      },
      {
        skipCache: !!payload._skipCache,
        auditCollector: auditCollector,
      }
    );
  }

  function invalidateRegisterCache_() {
    if (typeof OperationalRegisterCache !== "undefined") {
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.incidents
      );
    }
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return loadCanonicalRows_(payload, auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = loadCanonicalRows_(payload, null);
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Incident id is required.");
    var incident = IncidentRepository.getById(id);
    if (!incident) throw new Error("Incident " + id + " not found.");
    return incident;
  }

  function create(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.title) throw new Error("Incident title is required.");
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = IncidentRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    invalidateRegisterCache_();
    return created;
  }

  function update(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.id) throw new Error("Incident id is required.");
    var updated = IncidentRepository.update(payload.id, payload);
    if (!updated) throw new Error("Incident " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    invalidateRegisterCache_();
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Incident id is required.");
    var updated = IncidentRepository.deactivate(payload.id);
    if (!updated) throw new Error("Incident " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    invalidateRegisterCache_();
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
MaintenanceService.gs
======================================

```javascript
/**
 * MaintenanceService.gs
 *
 * Business rules for Maintenance. Mirrors IncidentService.gs.
 * Never talks to the spreadsheet directly — only MaintenanceRepository.
 */

var MaintenanceService = (function () {
  function applyWorkOrderRule_(payload) {
    payload = payload || {};
    if (
      payload.requiresWorkOrder === false ||
      payload.requiresWorkOrder === "false"
    ) {
      payload.requiresWorkOrder = false;
      payload.workOrderId = "";
    }
    return payload;
  }

  function matchesWorkOrderSearch_(row, search) {
    if (!search) return false;
    var primary = String(row.workOrderId || "").toLowerCase();
    if (primary && primary.indexOf(search) !== -1) return true;
    var ids = row.workOrderIds;
    if (ids && ids.length) {
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i] || "").toLowerCase().indexOf(search) !== -1) {
          return true;
        }
      }
    }
    return false;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var priority = payload.priority;
    var status = payload.status;
    var type = payload.type;
    var facilityId = payload.facilityId;
    var assignedToUserId = payload.assignedToUserId;
    var requiresWorkOrder = payload.requiresWorkOrder;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.department || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        matchesWorkOrderSearch_(row, search);

      var matchesPriority =
        !priority ||
        priority === "all" ||
        String(row.priority).toLowerCase() === String(priority).toLowerCase();

      var matchesStatus;
      if (status === "active") {
        var activeStatuses = {
          requested: true,
          triaged: true,
          scheduled: true,
          in_progress: true,
          on_hold: true,
        };
        matchesStatus =
          activeStatuses[String(row.status).toLowerCase()] === true;
      } else {
        matchesStatus =
          !status ||
          status === "all" ||
          String(row.status).toLowerCase() === String(status).toLowerCase();
      }

      var matchesType =
        !type ||
        type === "all" ||
        String(row.type).toLowerCase() === String(type).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesAssignee =
        !assignedToUserId ||
        assignedToUserId === "all" ||
        String(row.assignedToUserId) === String(assignedToUserId);

      var matchesRequiresWo = true;
      if (requiresWorkOrder !== undefined && requiresWorkOrder !== "all") {
        var flag =
          row.requiresWorkOrder === true ||
          row.requiresWorkOrder === "true" ||
          row.requiresWorkOrder === 1;
        var wanted =
          requiresWorkOrder === true ||
          requiresWorkOrder === "true" ||
          requiresWorkOrder === 1;
        matchesRequiresWo = flag === wanted;
      }

      return (
        matchesSearch &&
        matchesPriority &&
        matchesStatus &&
        matchesType &&
        matchesFacility &&
        matchesAssignee &&
        matchesRequiresWo
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.updatedAt || a.createdAt || a.reportedAt || "");
      var bAt = String(b.updatedAt || b.createdAt || b.reportedAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function loadCanonicalRows_(payload, auditCollector) {
    payload = payload || {};
    if (typeof OperationalRegisterCache === "undefined") {
      return MaintenanceRepository.getAll(auditCollector);
    }
    return OperationalRegisterCache.getCanonicalRows(
      OperationalRegisterCache.NAMESPACES.maintenance,
      function (collector) {
        return MaintenanceRepository.getAll(collector);
      },
      {
        skipCache: !!payload._skipCache,
        auditCollector: auditCollector,
      }
    );
  }

  function invalidateRegisterCache_() {
    if (typeof OperationalRegisterCache !== "undefined") {
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.maintenance
      );
    }
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return loadCanonicalRows_(payload, auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = loadCanonicalRows_(payload, null);
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function listCatalog(payload) {
    payload = payload || {};
    var tTotal0 = Date.now();
    var skipCache = !!payload._skipCache;
    var cacheHit = false;
    var cacheReadMs = 0;
    var sheetReadMs = 0;
    var rows = null;

    if (!skipCache && typeof CatalogCacheService !== "undefined") {
      var cached = CatalogCacheService.getMaintenanceCatalogRows();
      if (cached && cached.rows) {
        cacheHit = true;
        cacheReadMs = cached.cacheReadMs || 0;
        rows = cached.rows;
      }
    }

    if (!cacheHit) {
      var tSheet0 = Date.now();
      rows = MaintenanceRepository.listCatalog() || [];
      sheetReadMs = Date.now() - tSheet0;
      if (typeof CatalogCacheService !== "undefined") {
        CatalogCacheService.putMaintenanceCatalogRows(rows);
      }
    }

    var tProj0 = Date.now();
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var filtered = rows.filter(function (row) {
      if (!search) return true;
      return (
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1
      );
    });
    filtered.sort(function (a, b) {
      return String(a.title || a.id || "").localeCompare(
        String(b.title || b.id || "")
      );
    });
    var result = paginate_(filtered, payload);
    var projectionMs = Date.now() - tProj0;
    var totalServerMs = Date.now() - tTotal0;

    Logger.log(
      "[MaintenanceService.listCatalog] cacheHit=" +
        cacheHit +
        " sheetReadMs=" +
        sheetReadMs +
        " cacheReadMs=" +
        cacheReadMs +
        " totalServerMs=" +
        totalServerMs
    );

    if (payload._auditTiming) {
      result._cacheDiagnostics = {
        cacheHit: cacheHit,
        cacheReadMs: cacheReadMs,
        sheetReadMs: sheetReadMs,
        projectionMs: projectionMs,
        totalServerMs: totalServerMs,
      };
    }
    return result;
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Maintenance id is required.");
    var row = MaintenanceRepository.getById(id);
    if (!row) throw new Error("Maintenance " + id + " not found.");
    return row;
  }

  function create(payload) {
    var t0 = Date.now();
    payload = applyWorkOrderRule_(payload);
    if (!payload || (!payload.title && !payload.description)) {
      throw new Error("Maintenance title is required.");
    }
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var tValidated = Date.now();
    var created = MaintenanceRepository.create(payload);
    var tRepo = Date.now();
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateMaintenanceCatalog();
    }
    invalidateRegisterCache_();
    var tNotify = Date.now();
    var timings = {
      validateMs: tValidated - t0,
      repositoryMs: tRepo - tValidated,
      snapshotNotifyMs: tNotify - tRepo,
      totalMs: tNotify - t0,
    };
    Logger.log("[MaintenanceService.create] timings " + JSON.stringify(timings));
    if (payload && payload._auditTiming) {
      created._serverTimings = timings;
    }
    return created;
  }

  function update(payload) {
    var t0 = Date.now();
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.id) throw new Error("Maintenance id is required.");
    var repoResult = MaintenanceRepository.update(payload.id, payload);
    if (!repoResult) throw new Error("Maintenance " + payload.id + " not found.");
    var updated = repoResult.canonical;
    var previousStatus = repoResult.previousStatus;
    if (!updated) throw new Error("Maintenance " + payload.id + " not found.");
    if (payload._returnPreviousStatus && previousStatus != null) {
      updated._previousStatus = previousStatus;
      updated._buildMarker = "2026-09-01-phase32-maintenance-update-v1";
    }
    var tRepo = Date.now();
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateMaintenanceCatalog();
    }
    invalidateRegisterCache_();
    var tNotify = Date.now();
    var timings = {
      repositoryMs: tRepo - t0,
      snapshotNotifyMs: tNotify - tRepo,
      totalMs: tNotify - t0,
    };
    Logger.log("[MaintenanceService.update] timings " + JSON.stringify(timings));
    if (payload && payload._auditTiming) {
      updated._serverTimings = timings;
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Maintenance id is required.");
    var updated = MaintenanceRepository.deactivate(payload.id);
    if (!updated) throw new Error("Maintenance " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateMaintenanceCatalog();
    }
    invalidateRegisterCache_();
    return updated;
  }

  return {
    getAll: getAll,
    listCatalog: listCatalog,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
MasterDataService.gs
======================================

```javascript
/**
 * MasterDataService.gs
 *
 * Business rules for master lookup entities.
 * Never talks to the spreadsheet directly — only MasterDataRepository.
 *
 * Does not notify ReportingSnapshot (master data is lookup-only for now).
 */

var MasterDataService = (function () {
  function normalizeEntity_(payload) {
    var entity = payload && payload.entity;
    if (!entity) throw new Error("Master-data entity is required.");
    entity = String(entity).toLowerCase().trim();
    var known = MasterDataRepository.listEntities();
    if (known.indexOf(entity) === -1) {
      throw new Error("Unknown master-data entity: " + entity);
    }
    return entity;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var facilityId = payload.facilityId;
    var buildingId = payload.buildingId;
    var floorId = payload.floorId;
    var category = payload.category;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.code || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.category || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.contactName || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.email || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId || row.facility || "") === String(facilityId);

      var matchesBuilding =
        !buildingId ||
        buildingId === "all" ||
        String(row.buildingId || row.building || "") === String(buildingId);

      var matchesFloor =
        !floorId ||
        floorId === "all" ||
        String(row.floorId || row.floor || "") === String(floorId);

      var matchesCategory =
        !category ||
        category === "all" ||
        String(row.category || "")
          .toLowerCase() === String(category).toLowerCase();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesFacility &&
        matchesBuilding &&
        matchesFloor &&
        matchesCategory
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var entity = normalizeEntity_(payload);
    var rows = MasterDataRepository.getAll(entity);
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var entity = normalizeEntity_(payload);
    var id = payload && payload.id;
    if (!id) throw new Error("Master-data id is required.");
    var row = MasterDataRepository.getById(entity, id);
    if (!row) throw new Error(entity + " " + id + " not found.");
    return row;
  }

  function create(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.name) {
      throw new Error("Name is required.");
    }
    var created = MasterDataRepository.create(entity, payload);
    invalidateLocationCatalogCache_();
    return created;
  }

  function update(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.update(entity, payload.id, payload);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
    invalidateLocationCatalogCache_();
    return updated;
  }

  function deactivate(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.deactivate(entity, payload.id);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
    invalidateLocationCatalogCache_();
    return updated;
  }

  function isActiveRow_(row) {
    var status = String((row && row.status) || "active")
      .toLowerCase()
      .replace(/\s+/g, "_");
    return status === "active" || status === "" || status === "pending";
  }

  /** Facility sheet uses FacilityService aliases (Facility ID / Facility Name / Status). */
  function facilityCell_(row, key) {
    if (!row) return "";
    if (row[key] != null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
    return "";
  }

  function isActiveFacilityRow_(row) {
    var status = String(
      facilityCell_(row, "status") ||
        facilityCell_(row, "Status") ||
        "active"
    )
      .toLowerCase()
      .replace(/\s+/g, "_");
    return status === "active" || status === "" || status === "pending";
  }

  function projectFacilityLocationItem_(row) {
    return {
      id:
        facilityCell_(row, "id") || facilityCell_(row, "Facility ID"),
      name:
        facilityCell_(row, "name") || facilityCell_(row, "Facility Name"),
      status:
        facilityCell_(row, "status") ||
        facilityCell_(row, "Status") ||
        "active",
    };
  }

  function projectLocationItem_(row, relations) {
    relations = relations || {};
    return {
      id: String((row && row.id) || "").trim(),
      name: String((row && row.name) || "").trim(),
      facilityId: relations.facilityId
        ? String(relations.facilityId).trim()
        : undefined,
      buildingId: relations.buildingId
        ? String(relations.buildingId).trim()
        : undefined,
      floorId: relations.floorId
        ? String(relations.floorId).trim()
        : undefined,
    };
  }

  function invalidateLocationCatalogCache_() {
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateLocationCatalog();
    }
  }

  /**
   * One-shot location hierarchy for cascading selectors.
   * Flat catalog — client filters locally (Facility → Building → Floor → Room).
   */
  function getLocationCatalog(payload) {
    payload = payload || {};
    var t0 = Date.now();
    var skipCache = payload._skipCache === true;

    if (!skipCache && typeof CatalogCacheService !== "undefined") {
      var cached = CatalogCacheService.getLocationCatalog();
      if (cached && cached.data) {
        var warm = {
          facilities: cached.data.facilities || [],
          buildings: cached.data.buildings || [],
          floors: cached.data.floors || [],
          rooms: cached.data.rooms || [],
        };
        if (payload._auditTiming) {
          warm._serverTimings = {
            cacheHit: true,
            cacheReadMs: cached.cacheReadMs || 0,
            sheetReadMs: 0,
            mapMs: 0,
            totalMs: Date.now() - t0,
            counts: {
              facilities: warm.facilities.length,
              buildings: warm.buildings.length,
              floors: warm.floors.length,
              rooms: warm.rooms.length,
            },
          };
        }
        return warm;
      }
    }

    var facilitiesRaw =
      typeof FacilityRepository !== "undefined"
        ? FacilityRepository.getAll()
        : [];
    var buildingsRaw = MasterDataRepository.getAll("buildings");
    var floorsRaw = MasterDataRepository.getAll("floors");
    var roomsRaw = MasterDataRepository.getAll("rooms");
    var tRead = Date.now();

    var facilities = [];
    var i;
    for (i = 0; i < facilitiesRaw.length; i++) {
      if (!isActiveFacilityRow_(facilitiesRaw[i])) continue;
      var facility = projectFacilityLocationItem_(facilitiesRaw[i]);
      if (facility.id && facility.name) facilities.push(facility);
    }

    var buildings = [];
    for (i = 0; i < buildingsRaw.length; i++) {
      if (!isActiveRow_(buildingsRaw[i])) continue;
      var building = projectLocationItem_(buildingsRaw[i], {
        facilityId: buildingsRaw[i].facilityId || buildingsRaw[i].facility,
      });
      if (building.id && building.name) buildings.push(building);
    }

    var floors = [];
    for (i = 0; i < floorsRaw.length; i++) {
      if (!isActiveRow_(floorsRaw[i])) continue;
      var floor = projectLocationItem_(floorsRaw[i], {
        facilityId: floorsRaw[i].facilityId || floorsRaw[i].facility,
        buildingId: floorsRaw[i].buildingId || floorsRaw[i].building,
      });
      if (floor.id && floor.name) floors.push(floor);
    }

    var rooms = [];
    for (i = 0; i < roomsRaw.length; i++) {
      if (!isActiveRow_(roomsRaw[i])) continue;
      var room = projectLocationItem_(roomsRaw[i], {
        facilityId: roomsRaw[i].facilityId || roomsRaw[i].facility,
        buildingId: roomsRaw[i].buildingId || roomsRaw[i].building,
        floorId: roomsRaw[i].floorId || roomsRaw[i].floor,
      });
      if (room.id && room.name) rooms.push(room);
    }

    var result = {
      facilities: facilities,
      buildings: buildings,
      floors: floors,
      rooms: rooms,
    };

    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.putLocationCatalog(result);
    }

    if (payload._auditTiming) {
      result._serverTimings = {
        cacheHit: false,
        cacheReadMs: 0,
        sheetReadMs: tRead - t0,
        mapMs: Date.now() - tRead,
        totalMs: Date.now() - t0,
        counts: {
          facilities: facilities.length,
          buildings: buildings.length,
          floors: floors.length,
          rooms: rooms.length,
        },
      };
    }

    return result;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
    getLocationCatalog: getLocationCatalog,
  };
})();
```

======================================
FILE:
OperationalWorkloadService.gs
======================================

```javascript
/**
 * OperationalWorkloadService.gs
 *
 * Bounded workload summary for People / Assets list enrichment.
 * Scans operational sheets once per request; returns counts only for
 * requested entity IDs (no full-catalog fan-out to the client).
 *
 * BUILD: 2026-09-02-phase33-operational-workload-v1
 */

var OperationalWorkloadService = (function () {
  var BUILD_MARKER = "2026-09-02-phase33-operational-workload-v1";

  var ACTIVE_WO = {
    draft: true,
    open: true,
    assigned: true,
    in_progress: true,
    on_hold: true,
  };

  var ACTIVE_MNT = {
    requested: true,
    triaged: true,
    scheduled: true,
    in_progress: true,
    on_hold: true,
  };

  var ACTIVE_INC = {
    reported: true,
    triaged: true,
    investigating: true,
    contained: true,
  };

  function normalizeStatus_(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function isActive_(status, map) {
    return !!map[normalizeStatus_(status)];
  }

  function isCanonicalUserId_(id) {
    var value = String(id || "").trim();
    if (!value) return false;
    if (/^USR-/i.test(value)) return true;
    if (/\s/.test(value)) return false;
    if (/^[A-Za-z][A-Za-z.'-]+$/.test(value) && !/^\d/.test(value)) return false;
    return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
  }

  function isCanonicalAssetId_(id) {
    var value = String(id || "").trim();
    if (!value) return false;
    if (/^AST-/i.test(value)) return true;
    if (/\s/.test(value)) return false;
    return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
  }

  function toSet_(ids) {
    var set = {};
    var i;
    for (i = 0; i < (ids || []).length; i++) {
      var id = String(ids[i] || "").trim();
      if (id) set[id] = true;
    }
    return set;
  }

  function emptyBreakdown_() {
    return { workOrders: 0, maintenance: 0, incidents: 0 };
  }

  function ensureUserEvidence_(map, evidence, userId) {
    if (!map[userId]) {
      map[userId] = 0;
      evidence[userId] = { count: 0, workOrderIds: [] };
    }
  }

  function ensureAssetEvidence_(map, evidence, assetId) {
    if (!map[assetId]) {
      map[assetId] = {
        activeWorkload: 0,
        workloadBreakdown: emptyBreakdown_(),
      };
      evidence[assetId] = {
        activeWorkload: 0,
        workloadBreakdown: emptyBreakdown_(),
        workOrderIds: [],
        maintenanceIds: [],
        incidentIds: [],
      };
    }
  }

  function bumpUser_(byUserId, byUserIdEvidence, userId, workOrderId) {
    if (!isCanonicalUserId_(userId)) return;
    var id = String(userId).trim();
    ensureUserEvidence_(byUserId, byUserIdEvidence, id);
    byUserId[id] += 1;
    byUserIdEvidence[id].count += 1;
    byUserIdEvidence[id].workOrderIds.push(workOrderId);
  }

  function bumpAssetWo_(byAssetId, byAssetIdEvidence, assetId, workOrderId) {
    if (!isCanonicalAssetId_(assetId)) return;
    var id = String(assetId).trim();
    ensureAssetEvidence_(byAssetId, byAssetIdEvidence, id);
    byAssetId[id].workloadBreakdown.workOrders += 1;
    byAssetId[id].activeWorkload += 1;
    byAssetIdEvidence[id].workloadBreakdown.workOrders += 1;
    byAssetIdEvidence[id].activeWorkload += 1;
    byAssetIdEvidence[id].workOrderIds.push(workOrderId);
  }

  function bumpAssetMnt_(byAssetId, byAssetIdEvidence, assetId, maintenanceId) {
    if (!isCanonicalAssetId_(assetId)) return;
    var id = String(assetId).trim();
    ensureAssetEvidence_(byAssetId, byAssetIdEvidence, id);
    byAssetId[id].workloadBreakdown.maintenance += 1;
    byAssetId[id].activeWorkload += 1;
    byAssetIdEvidence[id].workloadBreakdown.maintenance += 1;
    byAssetIdEvidence[id].activeWorkload += 1;
    byAssetIdEvidence[id].maintenanceIds.push(maintenanceId);
  }

  function bumpAssetInc_(byAssetId, byAssetIdEvidence, assetId, incidentId) {
    if (!isCanonicalAssetId_(assetId)) return;
    var id = String(assetId).trim();
    ensureAssetEvidence_(byAssetId, byAssetIdEvidence, id);
    byAssetId[id].workloadBreakdown.incidents += 1;
    byAssetId[id].activeWorkload += 1;
    byAssetIdEvidence[id].workloadBreakdown.incidents += 1;
    byAssetIdEvidence[id].activeWorkload += 1;
    byAssetIdEvidence[id].incidentIds.push(incidentId);
  }

  /**
   * Return workload summaries for requested People / Asset IDs only.
   * payload: { assetIds?: string[], userIds?: string[] }
   */
  function getEntitySummary(payload) {
    payload = payload || {};
    var assetSet = toSet_(payload.assetIds);
    var userSet = toSet_(payload.userIds);
    var wantAssets = Object.keys(assetSet).length > 0;
    var wantUsers = Object.keys(userSet).length > 0;

    var byUserId = {};
    var byUserIdEvidence = {};
    var byAssetId = {};
    var byAssetIdEvidence = {};

    if (!wantAssets && !wantUsers) {
      return {
        byUserId: byUserId,
        byUserIdEvidence: byUserIdEvidence,
        byAssetId: byAssetId,
        byAssetIdEvidence: byAssetIdEvidence,
        _buildMarker: BUILD_MARKER,
      };
    }

    if (wantUsers && typeof WorkOrderRepository !== "undefined") {
      var workOrders = WorkOrderRepository.getAll() || [];
      var w;
      for (w = 0; w < workOrders.length; w++) {
        var wo = workOrders[w];
        if (!wo || !wo.id) continue;
        if (!isActive_(wo.status, ACTIVE_WO)) continue;
        if (userSet[String(wo.assignedToUserId || "").trim()]) {
          bumpUser_(byUserId, byUserIdEvidence, wo.assignedToUserId, wo.id);
        }
      }
    }

    if (wantAssets) {
      if (typeof WorkOrderRepository !== "undefined") {
        var woRows = WorkOrderRepository.getAll() || [];
        var wi;
        for (wi = 0; wi < woRows.length; wi++) {
          var woRow = woRows[wi];
          if (!woRow || !woRow.id) continue;
          if (!isActive_(woRow.status, ACTIVE_WO)) continue;
          var woAssetId = String(woRow.assetId || "").trim();
          if (assetSet[woAssetId]) {
            bumpAssetWo_(byAssetId, byAssetIdEvidence, woAssetId, woRow.id);
          }
        }
      }

      if (typeof MaintenanceRepository !== "undefined") {
        var mntRows = MaintenanceRepository.getAll() || [];
        var mi;
        for (mi = 0; mi < mntRows.length; mi++) {
          var mnt = mntRows[mi];
          if (!mnt || !mnt.id) continue;
          if (!isActive_(mnt.status, ACTIVE_MNT)) continue;
          var mntAssetId = String(mnt.assetId || "").trim();
          if (assetSet[mntAssetId]) {
            bumpAssetMnt_(byAssetId, byAssetIdEvidence, mntAssetId, mnt.id);
          }
        }
      }

      if (typeof IncidentRepository !== "undefined") {
        var incRows = IncidentRepository.getAll() || [];
        var ii;
        for (ii = 0; ii < incRows.length; ii++) {
          var inc = incRows[ii];
          if (!inc || !inc.id) continue;
          if (!isActive_(inc.status, ACTIVE_INC)) continue;
          var incAssetId = String(inc.assetId || "").trim();
          if (assetSet[incAssetId]) {
            bumpAssetInc_(byAssetId, byAssetIdEvidence, incAssetId, inc.id);
          }
        }
      }
    }

    return {
      byUserId: byUserId,
      byUserIdEvidence: byUserIdEvidence,
      byAssetId: byAssetId,
      byAssetIdEvidence: byAssetIdEvidence,
      _buildMarker: BUILD_MARKER,
    };
  }

  return {
    BUILD_MARKER: BUILD_MARKER,
    getEntitySummary: getEntitySummary,
  };
})();
```

======================================
FILE:
ReimbursementAuthorizationService.gs
======================================

```javascript
/**
 * ReimbursementAuthorizationService.gs
 *
 * Business rules for reimbursement authorization of CostSubmission claims.
 * Distinct from Work Order client authorisation (Approvals).
 */

var ReimbursementAuthorizationService = (function () {
  function validateAuthorizationShape_(authorization, context) {
    authorization = authorization || {};
    var errors = [];

    if (context === "update") {
      if (
        !authorization.authorizationId ||
        !String(authorization.authorizationId).trim()
      ) {
        errors.push("authorizationId is required");
      } else if (
        !/^AUTH-\d{4}-\d{6}$/i.test(String(authorization.authorizationId))
      ) {
        errors.push("authorizationId must match AUTH-YYYY-NNNNNN format");
      }
    }

    if (!authorization.submissionId || !String(authorization.submissionId).trim()) {
      errors.push("submissionId is required");
    } else if (!/^SUB-\d{4}-\d{6}$/i.test(String(authorization.submissionId))) {
      errors.push("submissionId must match SUB-YYYY-NNNNNN format");
    }

    if (
      authorization.authorizedAmount == null ||
      authorization.authorizedAmount === "" ||
      !isFinite(Number(authorization.authorizedAmount)) ||
      Number(authorization.authorizedAmount) <= 0
    ) {
      errors.push("authorizedAmount must be a positive number");
    }

    if (!authorization.currency || !String(authorization.currency).trim()) {
      errors.push("currency is required");
    }
    if (!authorization.authorizedAt || !String(authorization.authorizedAt).trim()) {
      errors.push("authorizedAt is required");
    }
    if (!authorization.authorizedBy || !String(authorization.authorizedBy).trim()) {
      errors.push("authorizedBy is required");
    }
    if (!authorization.recordedAt || !String(authorization.recordedAt).trim()) {
      errors.push("recordedAt is required");
    }

    if (errors.length) {
      throw new Error(
        "Invalid reimbursement authorization: " + errors.join("; ")
      );
    }
  }

  function assertSubmissionAuthorizable_(submissionId) {
    if (typeof CostSubmissionRepository === "undefined") {
      throw new Error("CostSubmissionRepository is unavailable");
    }
    var submission = CostSubmissionRepository.getById(submissionId);
    if (!submission) {
      throw new Error("CostSubmission not found: " + submissionId);
    }
    var status = String(submission.status || "").toLowerCase();
    if (status !== "submitted") {
      throw new Error(
        "Only submitted claims can be authorized (queried claims must be resubmitted first)"
      );
    }
    return submission;
  }

  function sumReceivedForSubmission_(submissionId) {
    if (typeof ReimbursementPaymentRepository === "undefined") {
      throw new Error("ReimbursementPaymentRepository is unavailable");
    }
    var rows = ReimbursementPaymentRepository.listAllBySubmissionId(submissionId);
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      total += Number(rows[i].receivedAmount) || 0;
    }
    return total;
  }

  function assertAuthorizationNotBelowReceived_(submissionId, authorizedAmount) {
    var paid = sumReceivedForSubmission_(submissionId);
    var nextAuthorizedAmount = Number(authorizedAmount);
    if (nextAuthorizedAmount < paid) {
      throw new Error(
        "Authorized amount cannot be lower than received payments (received " +
          paid +
          ", attempted " +
          nextAuthorizedAmount +
          ")"
      );
    }
  }

  function getAll(payload) {
    return ReimbursementAuthorizationRepository.getAll(payload || {});
  }

  function getById(payload) {
    payload = payload || {};
    return ReimbursementAuthorizationRepository.getById(payload.authorizationId);
  }

  function getBySubmissionId(payload) {
    payload = payload || {};
    var submissionId = String(payload.submissionId || "").trim();
    if (!submissionId) throw new Error("submissionId is required");
    return ReimbursementAuthorizationRepository.getBySubmissionId(submissionId);
  }

  function create(payload) {
    payload = payload || {};
    var now = new Date().toISOString();
    var submissionId = String(payload.submissionId || "").trim();
    var submission = assertSubmissionAuthorizable_(submissionId);
    var existing =
      ReimbursementAuthorizationRepository.getBySubmissionId(submissionId);
    if (existing) {
      throw new Error(
        "Claim already authorized (" +
          existing.authorizationId +
          "). Update the existing authorization instead."
      );
    }

    var authorizedAmount =
      payload.authorizedAmount != null
        ? payload.authorizedAmount
        : submission.claimAmount;
    var draft = {
      submissionId: submissionId,
      authorizedAmount: authorizedAmount,
      currency: payload.currency || submission.currency || "NGN",
      authorizedAt: payload.authorizedAt || now,
      authorizedBy: payload.authorizedBy,
      authorityReference: payload.authorityReference,
      notes: payload.notes,
      recordedAt: payload.recordedAt || now,
    };
    validateAuthorizationShape_(draft, "create");
    var created = ReimbursementAuthorizationRepository.create(draft);
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyDomainChanged
    ) {
      ReportingSnapshotService.notifyDomainChanged(
        "reimbursement-authorizations"
      );
    }
    return created;
  }

  function update(payload) {
    payload = payload || {};
    var authorizationId = String(payload.authorizationId || "").trim();
    if (!authorizationId) throw new Error("authorizationId is required");
    var current =
      ReimbursementAuthorizationRepository.getById(authorizationId);
    if (!current) {
      throw new Error("Authorization not found: " + authorizationId);
    }
    assertSubmissionAuthorizable_(
      String(
        payload.submissionId != null
          ? payload.submissionId
          : current.submissionId
      ).trim()
    );
    var merged = {
      authorizationId: current.authorizationId,
      submissionId:
        payload.submissionId != null
          ? payload.submissionId
          : current.submissionId,
      authorizedAmount:
        payload.authorizedAmount !== undefined
          ? payload.authorizedAmount
          : current.authorizedAmount,
      currency:
        payload.currency != null ? payload.currency : current.currency,
      authorizedAt:
        payload.authorizedAt != null
          ? payload.authorizedAt
          : current.authorizedAt,
      authorizedBy:
        payload.authorizedBy != null
          ? payload.authorizedBy
          : current.authorizedBy,
      authorityReference:
        payload.authorityReference !== undefined
          ? payload.authorityReference
          : current.authorityReference,
      notes: payload.notes !== undefined ? payload.notes : current.notes,
      recordedAt: current.recordedAt,
    };
    validateAuthorizationShape_(merged, "update");
    assertAuthorizationNotBelowReceived_(
      String(merged.submissionId || "").trim(),
      merged.authorizedAmount
    );
    var updated = ReimbursementAuthorizationRepository.update(
      authorizationId,
      payload
    );
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyDomainChanged
    ) {
      ReportingSnapshotService.notifyDomainChanged(
        "reimbursement-authorizations"
      );
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    getBySubmissionId: getBySubmissionId,
    create: create,
    update: update,
  };
})();
```

======================================
FILE:
ReimbursementPaymentService.gs
======================================

```javascript
/**
 * ReimbursementPaymentService.gs
 *
 * Business rules for reimbursement payment receipts against CostSubmission.
 * Cumulative receipts must never exceed authorizedAmount.
 */

var ReimbursementPaymentService = (function () {
  function validatePaymentShape_(payment, context) {
    payment = payment || {};
    var errors = [];

    if (context === "update") {
      if (!payment.paymentId || !String(payment.paymentId).trim()) {
        errors.push("paymentId is required");
      } else if (!/^PAY-\d{4}-\d{6}$/i.test(String(payment.paymentId))) {
        errors.push("paymentId must match PAY-YYYY-NNNNNN format");
      }
    }

    if (!payment.submissionId || !String(payment.submissionId).trim()) {
      errors.push("submissionId is required");
    } else if (!/^SUB-\d{4}-\d{6}$/i.test(String(payment.submissionId))) {
      errors.push("submissionId must match SUB-YYYY-NNNNNN format");
    }

    if (
      payment.receivedAmount == null ||
      payment.receivedAmount === "" ||
      !isFinite(Number(payment.receivedAmount)) ||
      Number(payment.receivedAmount) <= 0
    ) {
      errors.push("receivedAmount must be a positive number");
    }

    if (!payment.currency || !String(payment.currency).trim()) {
      errors.push("currency is required");
    }
    if (!payment.receivedAt || !String(payment.receivedAt).trim()) {
      errors.push("receivedAt is required");
    }
    if (!payment.recordedAt || !String(payment.recordedAt).trim()) {
      errors.push("recordedAt is required");
    }
    if (!payment.recordedBy || !String(payment.recordedBy).trim()) {
      errors.push("recordedBy is required");
    }

    if (errors.length) {
      throw new Error("Invalid reimbursement payment: " + errors.join("; "));
    }
  }

  function requireAuthorization_(submissionId) {
    if (typeof ReimbursementAuthorizationRepository === "undefined") {
      throw new Error("ReimbursementAuthorizationRepository is unavailable");
    }
    var authorization =
      ReimbursementAuthorizationRepository.getBySubmissionId(submissionId);
    if (!authorization) {
      throw new Error(
        "Authorize this claim before recording payment receipts"
      );
    }
    var authorizedAmount = Number(authorization.authorizedAmount);
    if (!isFinite(authorizedAmount) || authorizedAmount <= 0) {
      throw new Error("Authorization has no valid authorizedAmount");
    }
    return authorization;
  }

  function sumExistingPayments_(submissionId, excludePaymentId) {
    var rows = ReimbursementPaymentRepository.listAllBySubmissionId(
      submissionId
    );
    var paid = 0;
    var exclude = excludePaymentId ? String(excludePaymentId).trim() : "";
    for (var i = 0; i < rows.length; i++) {
      if (exclude && String(rows[i].paymentId || "") === exclude) continue;
      paid += Number(rows[i].receivedAmount) || 0;
    }
    return paid;
  }

  /**
   * Source of truth: existing payments + incoming amount must not exceed
   * authorizedAmount. Exact outstanding payment is allowed.
   */
  function assertWithinAuthorizedAmount_(
    submissionId,
    incomingAmount,
    excludePaymentId
  ) {
    var authorization = requireAuthorization_(submissionId);
    var authorizedAmount = Number(authorization.authorizedAmount);
    var alreadyPaid = sumExistingPayments_(submissionId, excludePaymentId);
    var incoming = Number(incomingAmount);
    var outstanding = authorizedAmount - alreadyPaid;
    var nextTotal = alreadyPaid + incoming;

    if (!isFinite(incoming) || incoming <= 0) {
      throw new Error("receivedAmount must be a positive number");
    }
    if (nextTotal > authorizedAmount) {
      throw new Error(
        "Payment exceeds outstanding authorized amount (outstanding " +
          Math.max(0, outstanding) +
          ", attempted " +
          incoming +
          ")"
      );
    }
  }

  function assertSubmissionExists_(submissionId) {
    if (typeof CostSubmissionRepository === "undefined") {
      throw new Error("CostSubmissionRepository is unavailable");
    }
    var submission = CostSubmissionRepository.getById(submissionId);
    if (!submission) {
      throw new Error("CostSubmission not found: " + submissionId);
    }
    var status = String(submission.status || "").toLowerCase();
    if (status !== "submitted" && status !== "queried") {
      throw new Error(
        "Payments can only be recorded against submitted or queried submissions"
      );
    }
    requireAuthorization_(submissionId);
    return submission;
  }

  function getAll(payload) {
    return ReimbursementPaymentRepository.getAll(payload || {});
  }

  function getById(payload) {
    payload = payload || {};
    return ReimbursementPaymentRepository.getById(payload.paymentId);
  }

  function create(payload) {
    payload = payload || {};
    var now = new Date().toISOString();
    var draft = {
      submissionId: payload.submissionId,
      receivedAmount: payload.receivedAmount,
      currency: payload.currency || "NGN",
      receivedAt: payload.receivedAt || now,
      reference: payload.reference,
      method: payload.method,
      evidenceReference: payload.evidenceReference,
      notes: payload.notes,
      recordedAt: payload.recordedAt || now,
      recordedBy: payload.recordedBy,
    };
    validatePaymentShape_(draft, "create");
    var submissionId = String(draft.submissionId).trim();
    assertSubmissionExists_(submissionId);
    assertWithinAuthorizedAmount_(
      submissionId,
      draft.receivedAmount,
      null
    );
    var created = ReimbursementPaymentRepository.create(draft);
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyDomainChanged
    ) {
      ReportingSnapshotService.notifyDomainChanged("reimbursement-payments");
    }
    return created;
  }

  function update(payload) {
    payload = payload || {};
    var paymentId = String(payload.paymentId || "").trim();
    if (!paymentId) throw new Error("paymentId is required");
    var current = ReimbursementPaymentRepository.getById(paymentId);
    if (!current) throw new Error("Payment not found: " + paymentId);
    var merged = {
      paymentId: current.paymentId,
      submissionId:
        payload.submissionId != null
          ? payload.submissionId
          : current.submissionId,
      receivedAmount:
        payload.receivedAmount !== undefined
          ? payload.receivedAmount
          : current.receivedAmount,
      currency:
        payload.currency != null ? payload.currency : current.currency,
      receivedAt:
        payload.receivedAt != null ? payload.receivedAt : current.receivedAt,
      reference:
        payload.reference !== undefined ? payload.reference : current.reference,
      method: payload.method !== undefined ? payload.method : current.method,
      evidenceReference:
        payload.evidenceReference !== undefined
          ? payload.evidenceReference
          : current.evidenceReference,
      notes: payload.notes !== undefined ? payload.notes : current.notes,
      recordedAt: current.recordedAt,
      recordedBy:
        payload.recordedBy != null ? payload.recordedBy : current.recordedBy,
    };
    validatePaymentShape_(merged, "update");
    var submissionId = String(merged.submissionId).trim();
    assertSubmissionExists_(submissionId);
    assertWithinAuthorizedAmount_(
      submissionId,
      merged.receivedAmount,
      paymentId
    );
    var updated = ReimbursementPaymentRepository.update(paymentId, payload);
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyDomainChanged
    ) {
      ReportingSnapshotService.notifyDomainChanged("reimbursement-payments");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
```

======================================
FILE:
ReportingSnapshotService.gs
======================================

```javascript
/**
 * ReportingSnapshotService.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER (Sheets-backed).
 * ---------------------------------------------------------------------------
 * Builds and refreshes the REPORTING_SNAPSHOT derived cache from domain
 * repositories. Domain sheets remain the system of record.
 *
 * Partial refresh:
 *   After create/update/deactivate on a module, refresh that module's section
 *   then recompute derived KPIs / projections / health.
 *
 * Full rebuild:
 *   Scheduled trigger + cold-start / explicit rebuild action.
 *
 * Can later be replaced by a database-backed repository without changing
 * DashboardService → ReportingService application architecture.
 *
 * NOTE: Next.js ReportingService re-derives KPIs/projections after load so
 * TypeScript remains the authoritative calculation path for the app.
 * These Apps Script helpers keep sheet-stored values consistent for direct
 * sheet consumers and reduce drift before hydration.
 */

var ReportingSnapshotService = (function () {
  /**
   * CacheService hot path for assembled snapshot JSON.
   * Keys are CONSTANT (not epoch-suffixed). Invalidation uses cache.remove().
   */
  var CACHE_TTL_SECONDS = 21600; // 6h max; also cleared on notify/rebuild/refresh
  var CACHE_KEY_PORTFOLIO = "rs_snap_v1_portfolio";
  var CACHE_KEY_FAC_PREFIX = "rs_snap_v1_fac_";
  var CACHE_MAX_CHARS = 90000; // CacheService ~100KB limit with headroom

  var ACTIVE_ENTITY = {
    active: true,
    operational: true,
    in_service: true,
    online: true,
    open: true,
  };
  var INACTIVE_ENTITY = {
    inactive: true,
    deactivated: true,
    decommissioned: true,
    offline: true,
    archived: true,
    closed: true,
    cancelled: true,
    canceled: true,
    suspended: true,
  };
  var OPERATIONAL_ASSET = {
    active: true,
    operational: true,
    in_service: true,
    online: true,
    available: true,
  };
  var OPEN_WO = {
    draft: true,
    open: true,
    assigned: true,
    in_progress: true,
    on_hold: true,
  };
  var BACKLOG_MNT = {
    requested: true,
    triaged: true,
    scheduled: true,
    in_progress: true,
    on_hold: true,
  };
  var CLOSED_INCIDENT = {
    resolved: true,
    closed: true,
    cancelled: true,
    canceled: true,
  };

  /**
   * Normalize sheet enum/status tokens before comparison.
   * "Active", "ACTIVE", " active ", "On Hold" → active / on_hold
   */
  function normalizeToken_(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  /** Read a field with case-insensitive key fallback (status / Status / STATUS). */
  function fieldValue_(row, key) {
    if (!row || typeof row !== "object") return "";
    if (row[key] != null && row[key] !== "") return row[key];

    var want = String(key).toLowerCase();
    for (var prop in row) {
      if (!Object.prototype.hasOwnProperty.call(row, prop)) continue;
      if (String(prop).toLowerCase() === want) {
        return row[prop];
      }
    }
    return "";
  }

  function rowStatus_(row) {
    return fieldValue_(row, "status");
  }

  function toIsoUtc_(value, fallback) {
    fallback = fallback || new Date().toISOString();
    if (value == null || value === "") return fallback;
    if (Object.prototype.toString.call(value) === "[object Date]") {
      var t = value.getTime();
      return isNaN(t) ? fallback : value.toISOString();
    }
    if (typeof value === "number" && isFinite(value)) {
      var fromNumber = new Date(value);
      return isNaN(fromNumber.getTime()) ? fallback : fromNumber.toISOString();
    }
    var text = String(value).trim();
    if (!text) return fallback;
    var parsed = new Date(text);
    return isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
  }

  function ageInSeconds_(generatedAt, nowMs) {
    nowMs = nowMs || Date.now();
    var ms = Date.parse(generatedAt);
    if (isNaN(ms)) return 0;
    return Math.max(0, Math.floor((nowMs - ms) / 1000));
  }

  /** Facilities / users: Active / ACTIVE / active (and operational synonyms). */
  function isActiveEntityStatus_(status) {
    var token = normalizeToken_(status);
    if (!token) return false;
    if (INACTIVE_ENTITY[token]) return false;
    return !!ACTIVE_ENTITY[token];
  }

  /** Assets: Operational / OPERATIONAL / Active / active count as operational. */
  function isOperationalAssetStatus_(status) {
    var token = normalizeToken_(status);
    if (!token) return false;
    if (INACTIVE_ENTITY[token]) return false;
    return !!(OPERATIONAL_ASSET[token] || ACTIVE_ENTITY[token]);
  }

  function dayKey_(iso, asOf) {
    return toIsoUtc_(iso || asOf, asOf).slice(0, 10);
  }

  function isBeforeDay_(iso, asOf) {
    if (!iso) return false;
    return dayKey_(iso, asOf) < dayKey_(asOf, asOf);
  }

  function isSameDay_(iso, asOf) {
    if (!iso) return false;
    return dayKey_(iso, asOf) === dayKey_(asOf, asOf);
  }

  function isOpenWorkOrder_(wo) {
    return !!OPEN_WO[normalizeToken_(rowStatus_(wo))];
  }

  function isMaintenanceBacklog_(row) {
    return !!BACKLOG_MNT[normalizeToken_(rowStatus_(row))];
  }

  function isCriticalOpenIncident_(incident) {
    return (
      normalizeToken_(fieldValue_(incident, "severity")) === "critical" &&
      !CLOSED_INCIDENT[normalizeToken_(rowStatus_(incident))]
    );
  }

  function isCriticalOpenWork_(row) {
    return (
      isMaintenanceBacklog_(row) && isHighOrCritical_(fieldValue_(row, "priority"))
    );
  }

  function workOrderLinked_(row) {
    var woId = fieldValue_(row, "workOrderId");
    if (String(woId || "").trim()) return true;
    var woIds = fieldValue_(row, "workOrderIds");
    return Array.isArray(woIds) && woIds.length > 0;
  }

  function isOnHold_(status) {
    return normalizeToken_(status) === "on_hold";
  }

  function isHighOrCritical_(priority) {
    var token = normalizeToken_(priority);
    return token === "high" || token === "critical";
  }

  function safeRepoGetAll_(repo) {
    try {
      if (repo && typeof repo.getAll === "function") {
        return repo.getAll() || [];
      }
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] repository getAll failed: " + err);
    }
    return [];
  }

  function loadDomainRows_() {
    return {
      users:
        typeof UserRepository !== "undefined"
          ? safeRepoGetAll_(UserRepository)
          : [],
      facilities:
        typeof FacilityRepository !== "undefined"
          ? safeRepoGetAll_(FacilityRepository)
          : [],
      assets:
        typeof AssetRepository !== "undefined"
          ? safeRepoGetAll_(AssetRepository)
          : [],
      incidents:
        typeof IncidentRepository !== "undefined"
          ? safeRepoGetAll_(IncidentRepository)
          : [],
      maintenance:
        typeof MaintenanceRepository !== "undefined"
          ? safeRepoGetAll_(MaintenanceRepository)
          : [],
      workOrders:
        typeof WorkOrderRepository !== "undefined"
          ? safeRepoGetAll_(WorkOrderRepository)
          : [],
    };
  }

  function loadModuleRows_(module) {
    if (module === "users") {
      return typeof UserRepository !== "undefined"
        ? safeRepoGetAll_(UserRepository)
        : [];
    }
    if (module === "facilities") {
      return typeof FacilityRepository !== "undefined"
        ? safeRepoGetAll_(FacilityRepository)
        : [];
    }
    if (module === "assets") {
      return typeof AssetRepository !== "undefined"
        ? safeRepoGetAll_(AssetRepository)
        : [];
    }
    if (module === "incidents") {
      return typeof IncidentRepository !== "undefined"
        ? safeRepoGetAll_(IncidentRepository)
        : [];
    }
    if (module === "maintenance") {
      return typeof MaintenanceRepository !== "undefined"
        ? safeRepoGetAll_(MaintenanceRepository)
        : [];
    }
    if (module === "workOrders" || module === "work-orders") {
      return typeof WorkOrderRepository !== "undefined"
        ? safeRepoGetAll_(WorkOrderRepository)
        : [];
    }
    return [];
  }

  function sectionForModule_(module) {
    if (module === "work-orders") return "workOrders";
    return module;
  }

  function scriptCache_() {
    return CacheService.getScriptCache();
  }

  /** Constant CacheService key — must not change between consecutive getSnapshot calls. */
  function snapshotCacheKey_(facilityId) {
    if (facilityId) return CACHE_KEY_FAC_PREFIX + String(facilityId);
    return CACHE_KEY_PORTFOLIO;
  }

  function invalidateSnapshotCache_() {
    try {
      var cache = scriptCache_();
      // Constant-key invalidation (do NOT rotate keys via PropertiesService epoch).
      cache.remove(CACHE_KEY_PORTFOLIO);
      Logger.log(
        "[REPORTING_SNAPSHOT] cache invalidated key=" + CACHE_KEY_PORTFOLIO
      );
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache invalidate failed: " + err);
    }
  }

  function markCacheStatus_(snapshot, status) {
    if (!snapshot) return snapshot;
    if (!snapshot._snapshotMeta) {
      snapshot._snapshotMeta = { source: "REPORTING_SNAPSHOT" };
    }
    snapshot._snapshotMeta.cache = status;
    return snapshot;
  }

  function readCachedSnapshot_(facilityId) {
    try {
      var key = snapshotCacheKey_(facilityId);
      var text = SheetFieldUtils.cacheGetUtf8(scriptCache_(), key);
      if (!text) {
        Logger.log("[REPORTING_SNAPSHOT] cache MISS key=" + key);
        return null;
      }
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !parsed.kpis) {
        Logger.log("[REPORTING_SNAPSHOT] cache invalid payload key=" + key);
        return null;
      }
      if (parsed._snapshotMeta) {
        parsed._snapshotMeta.ageInSeconds = ageInSeconds_(
          parsed._snapshotMeta.generatedAt || parsed.asOf
        );
        parsed._snapshotMeta.source =
          parsed._snapshotMeta.source || "REPORTING_SNAPSHOT";
      }
      Logger.log("[REPORTING_SNAPSHOT] cache HIT key=" + key);
      return parsed;
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache read failed: " + err);
      return null;
    }
  }

  function writeCachedSnapshot_(facilityId, snapshot) {
    try {
      if (!snapshot) return false;
      // Never persist transient cache status into the stored value.
      if (snapshot._snapshotMeta && snapshot._snapshotMeta.cache) {
        delete snapshot._snapshotMeta.cache;
      }
      var text = JSON.stringify(snapshot);
      if (!text) {
        return false;
      }
      // UTF-8 → base64 expands size; leave headroom under CacheService ~100KB.
      var encodedLengthEstimate = Math.ceil((text.length * 4) / 3) + 8;
      if (
        text.length > CACHE_MAX_CHARS ||
        encodedLengthEstimate > CACHE_MAX_CHARS
      ) {
        Logger.log(
          "[REPORTING_SNAPSHOT] skip cache write - payload too large (" +
            text.length +
            " chars)"
        );
        return false;
      }
      var key = snapshotCacheKey_(facilityId);
      var cache = scriptCache_();
      // CacheService is ByteString/Latin-1 safe only — encode Unicode first.
      SheetFieldUtils.cachePutUtf8(cache, key, text, CACHE_TTL_SECONDS);
      // Verify immediately - silent put failures are the usual cause of "no speedup".
      var verify = SheetFieldUtils.cacheGetUtf8(cache, key);
      if (!verify || verify.length !== text.length) {
        Logger.log(
          "[REPORTING_SNAPSHOT] cache put VERIFY FAILED key=" +
            key +
            " wrote=" +
            text.length +
            " read=" +
            (verify ? verify.length : 0)
        );
        return false;
      }
      Logger.log(
        "[REPORTING_SNAPSHOT] cache put ok key=" +
          key +
          " chars=" +
          text.length +
          " ttl=" +
          CACHE_TTL_SECONDS
      );
      return true;
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache write failed: " + err);
      return false;
    }
  }

  function computeKpis_(asOf, rows) {
    asOf = toIsoUtc_(asOf);
    var facilities = rows.facilities || [];
    var assets = rows.assets || [];
    var incidents = rows.incidents || [];
    var maintenance = rows.maintenance || [];
    var workOrders = rows.workOrders || [];
    var users = rows.users || [];

    var activeFacilities = facilities.filter(function (f) {
      return isActiveEntityStatus_(rowStatus_(f));
    }).length;
    var activeAssets = assets.filter(function (a) {
      return isOperationalAssetStatus_(rowStatus_(a));
    }).length;
    var openWorkOrders = workOrders.filter(isOpenWorkOrder_);
    var backlog = maintenance.filter(isMaintenanceBacklog_);
    var criticalOpen = incidents.filter(isCriticalOpenIncident_);
    var criticalWorkOpen = maintenance.filter(isCriticalOpenWork_);

    var assetsOperationalPercent =
      assets.length > 0
        ? Math.round((activeAssets / assets.length) * 100)
        : null;

    return {
      activeFacilities: activeFacilities,
      inactiveFacilities: Math.max(0, facilities.length - activeFacilities),
      totalFacilities: facilities.length,
      activeAssets: activeAssets,
      totalAssets: assets.length,
      assetsOperationalPercent: assetsOperationalPercent,
      assetsInPoorCondition: assets.filter(function (a) {
        return normalizeToken_(fieldValue_(a, "condition")) === "poor";
      }).length,
      activeWorkforce: users.filter(function (u) {
        return isActiveEntityStatus_(rowStatus_(u));
      }).length,
      totalUsers: users.length,
      openWorkOrders: openWorkOrders.length,
      workOrdersCreatedToday: workOrders.filter(function (wo) {
        return isSameDay_(
          fieldValue_(wo, "createdAt") || fieldValue_(wo, "requestedAt"),
          asOf
        );
      }).length,
      workOrdersDueToday: openWorkOrders.filter(function (wo) {
        return isSameDay_(fieldValue_(wo, "dueAt"), asOf);
      }).length,
      overdueWorkOrders: openWorkOrders.filter(function (wo) {
        return isBeforeDay_(fieldValue_(wo, "dueAt"), asOf);
      }).length,
      criticalIncidents: criticalOpen.length,
      criticalIncidentsUnassigned: criticalOpen.filter(function (incident) {
        return !String(fieldValue_(incident, "assignedToUserId") || "").trim();
      }).length,
      incidentsNeedingWorkOrder: incidents.filter(function (incident) {
        var requiresRaw = fieldValue_(incident, "requiresWorkOrder");
        var requires =
          requiresRaw === true || normalizeToken_(requiresRaw) === "true";
        return (
          !CLOSED_INCIDENT[normalizeToken_(rowStatus_(incident))] &&
          requires &&
          !String(fieldValue_(incident, "workOrderId") || "").trim()
        );
      }).length,
      criticalWork: criticalWorkOpen.length,
      criticalWorkUnassigned: criticalWorkOpen.filter(function (row) {
        return !String(fieldValue_(row, "assignedToUserId") || "").trim();
      }).length,
      workNeedingWorkOrder: maintenance.filter(function (row) {
        var requiresRaw = fieldValue_(row, "requiresWorkOrder");
        var requires =
          requiresRaw === true || normalizeToken_(requiresRaw) === "true";
        return (
          isMaintenanceBacklog_(row) && requires && !workOrderLinked_(row)
        );
      }).length,
      maintenanceBacklog: backlog.length,
      overdueMaintenance: backlog.filter(function (row) {
        return isBeforeDay_(fieldValue_(row, "dueAt"), asOf);
      }).length,
      maintenanceOnHold: maintenance.filter(function (row) {
        return isOnHold_(rowStatus_(row));
      }).length,
      workOrdersOnHold: workOrders.filter(function (wo) {
        return isOnHold_(rowStatus_(wo));
      }).length,
    };
  }

  function computeHealth_(kpis) {
    var score = 100;
    score -= Math.min(40, (kpis.criticalWork || 0) * 15);
    score -= Math.min(25, (kpis.overdueWorkOrders || 0) * 5);
    score -= Math.min(20, (kpis.overdueMaintenance || 0) * 4);
    score -= Math.min(10, (kpis.assetsInPoorCondition || 0) * 2);
    score -= Math.min(10, (kpis.workNeedingWorkOrder || 0) * 3);
    score = Math.max(0, Math.min(100, score));

    var band =
      score >= 80 ? "healthy" : score >= 55 ? "watch" : "critical";
    var summary =
      band === "healthy"
        ? "Here's what's happening across your facilities today."
        : band === "watch"
          ? "Some items need attention before end of day."
          : "Critical pressure detected — review critical work and overdue jobs.";

    return { band: band, score: score, summary: summary };
  }

  function labelize_(value) {
    return normalizeToken_(value)
      .split("_")
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function toneFromPriority_(priority) {
    var p = normalizeToken_(priority);
    if (p === "critical") return "danger";
    if (p === "high") return "warning";
    if (p === "medium") return "info";
    return "neutral";
  }

  /** Newest first; stable secondary key for deterministic ordering. */
  function sortByDateDesc_(rows, getDate, getTieBreaker) {
    return (rows || []).slice().sort(function (a, b) {
      var left = toIsoUtc_(getDate(a) || "", "1970-01-01T00:00:00.000Z");
      var right = toIsoUtc_(getDate(b) || "", "1970-01-01T00:00:00.000Z");
      if (left < right) return 1;
      if (left > right) return -1;
      var leftId = String(getTieBreaker ? getTieBreaker(a) : "");
      var rightId = String(getTieBreaker ? getTieBreaker(b) : "");
      if (leftId < rightId) return -1;
      if (leftId > rightId) return 1;
      return 0;
    });
  }

  function projectWorkOrder_(wo) {
    var status = normalizeToken_(rowStatus_(wo));
    var priority = normalizeToken_(fieldValue_(wo, "priority"));
    return {
      module: "work-orders",
      entityId: wo.id,
      title: wo.title || wo.id,
      status: status,
      priority: priority,
      facilityId: fieldValue_(wo, "facilityId") || wo.facilityId,
      meta: labelize_(priority) + " · " + labelize_(status),
      reportedAt: fieldValue_(wo, "requestedAt")
        ? toIsoUtc_(fieldValue_(wo, "requestedAt"))
        : fieldValue_(wo, "requestedAt"),
      tone: toneFromPriority_(priority),
    };
  }

  function projectMaintenance_(row) {
    var status = normalizeToken_(rowStatus_(row));
    var priority = normalizeToken_(fieldValue_(row, "priority"));
    return {
      module: "maintenance",
      entityId: row.id,
      title: row.title || row.id,
      status: status,
      priority: priority,
      facilityId: fieldValue_(row, "facilityId") || row.facilityId,
      meta: labelize_(priority) + " · " + labelize_(status),
      reportedAt: fieldValue_(row, "reportedAt")
        ? toIsoUtc_(fieldValue_(row, "reportedAt"))
        : fieldValue_(row, "reportedAt"),
      tone: toneFromPriority_(priority),
    };
  }

  function projectIncident_(incident) {
    var status = normalizeToken_(rowStatus_(incident));
    var severity = normalizeToken_(fieldValue_(incident, "severity"));
    return {
      module: "incidents",
      entityId: incident.id,
      title: incident.title || incident.id,
      status: status,
      priority: severity,
      facilityId: fieldValue_(incident, "facilityId") || incident.facilityId,
      meta: labelize_(severity) + " · " + labelize_(status),
      reportedAt: fieldValue_(incident, "reportedAt")
        ? toIsoUtc_(fieldValue_(incident, "reportedAt"))
        : fieldValue_(incident, "reportedAt"),
      tone: toneFromPriority_(severity),
    };
  }

  function computeProjections_(asOf, rows) {
    asOf = toIsoUtc_(asOf);
    var incidents = rows.incidents || [];
    var maintenance = rows.maintenance || [];
    var workOrders = rows.workOrders || [];
    var LIST_LIMIT = 5;

    function isOverdueWo(wo) {
      return (
        isOpenWorkOrder_(wo) &&
        fieldValue_(wo, "dueAt") &&
        isBeforeDay_(fieldValue_(wo, "dueAt"), asOf)
      );
    }
    function isOverdueMnt(row) {
      return (
        isMaintenanceBacklog_(row) &&
        fieldValue_(row, "dueAt") &&
        isBeforeDay_(fieldValue_(row, "dueAt"), asOf)
      );
    }

    var overdueWorkOrders = sortByDateDesc_(
      workOrders.filter(isOverdueWo),
      function (wo) {
        return (
          fieldValue_(wo, "dueAt") ||
          fieldValue_(wo, "requestedAt") ||
          fieldValue_(wo, "createdAt")
        );
      },
      function (wo) {
        return wo.id;
      }
    )
      .slice(0, LIST_LIMIT)
      .map(projectWorkOrder_);

    var maintenanceAttention = sortByDateDesc_(
      maintenance.filter(function (row) {
        return (
          isOverdueMnt(row) ||
          isOnHold_(rowStatus_(row)) ||
          isHighOrCritical_(fieldValue_(row, "priority"))
        );
      }),
      function (row) {
        return (
          fieldValue_(row, "dueAt") ||
          fieldValue_(row, "reportedAt") ||
          fieldValue_(row, "createdAt")
        );
      },
      function (row) {
        return row.id;
      }
    )
      .slice(0, LIST_LIMIT)
      .map(projectMaintenance_);

    var blockedItems = sortByDateDesc_(
      workOrders
        .filter(function (wo) {
          return isOnHold_(rowStatus_(wo));
        })
        .map(projectWorkOrder_)
        .concat(
          maintenance
            .filter(function (row) {
              return isOnHold_(rowStatus_(row));
            })
            .map(projectMaintenance_)
        ),
      function (item) {
        return item.reportedAt;
      },
      function (item) {
        return item.entityId;
      }
    ).slice(0, LIST_LIMIT);

    return {
      criticalIncidents: sortByDateDesc_(
        incidents.filter(isCriticalOpenIncident_),
        function (incident) {
          return (
            fieldValue_(incident, "reportedAt") ||
            fieldValue_(incident, "createdAt")
          );
        },
        function (incident) {
          return incident.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectIncident_),
      criticalWork: sortByDateDesc_(
        maintenance.filter(isCriticalOpenWork_),
        function (row) {
          return (
            fieldValue_(row, "dueAt") ||
            fieldValue_(row, "reportedAt") ||
            fieldValue_(row, "createdAt")
          );
        },
        function (row) {
          return row.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectMaintenance_),
      overdueWorkOrders: overdueWorkOrders,
      maintenanceAttention: maintenanceAttention,
      blockedItems: blockedItems,
      latestOpenWorkOrders: sortByDateDesc_(
        workOrders.filter(isOpenWorkOrder_),
        function (wo) {
          return (
            fieldValue_(wo, "requestedAt") || fieldValue_(wo, "createdAt")
          );
        },
        function (wo) {
          return wo.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectWorkOrder_),
      latestActiveMaintenance: sortByDateDesc_(
        maintenance.filter(isMaintenanceBacklog_),
        function (row) {
          return (
            fieldValue_(row, "reportedAt") || fieldValue_(row, "createdAt")
          );
        },
        function (row) {
          return row.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectMaintenance_),
    };
  }

  function filterByFacilityId_(rows, facilityId) {
    if (!facilityId) return rows || [];
    return (rows || []).filter(function (row) {
      var rowFacilityId = fieldValue_(row, "facilityId");
      if (rowFacilityId && String(rowFacilityId) === String(facilityId)) {
        return true;
      }
      var rowFacility = fieldValue_(row, "facility");
      if (rowFacility && String(rowFacility) === String(facilityId)) {
        return true;
      }
      return false;
    });
  }

  function assembleSnapshot_(parts, facilityId) {
    var asOf = toIsoUtc_(
      (parts.meta && parts.meta.asOf) || new Date().toISOString()
    );
    var generatedAt = toIsoUtc_(
      (parts.meta && parts.meta.generatedAt) || asOf,
      asOf
    );
    var version =
      (parts.meta && (parts.meta.snapshotVersion || parts.meta.version)) ||
      generatedAt;

    var facilities = parts.facilities || [];
    if (facilityId) {
      facilities = facilities.filter(function (f) {
        return String(f.id) === String(facilityId);
      });
    }

    var assets = filterByFacilityId_(parts.assets, facilityId);
    var incidents = filterByFacilityId_(parts.incidents, facilityId);
    var maintenance = filterByFacilityId_(parts.maintenance, facilityId);
    var workOrders = filterByFacilityId_(parts.workOrders, facilityId);
    var users = parts.users || [];

    var scopedRows = {
      users: users,
      facilities: facilities,
      assets: assets,
      incidents: incidents,
      maintenance: maintenance,
      workOrders: workOrders,
    };

    // Facility-scoped views must recompute. Portfolio prefers sheet-stored
    // derived fields (already refreshed on notifyModuleChanged / rebuild).
    var kpis;
    var projections;
    var health;
    if (facilityId || !parts.kpis || !parts.projections || !parts.health) {
      kpis = computeKpis_(asOf, scopedRows);
      projections = computeProjections_(asOf, scopedRows);
      health = computeHealth_(kpis);
    } else {
      kpis = parts.kpis;
      projections = parts.projections;
      health = parts.health;
    }

    return {
      asOf: asOf,
      facilityId: facilityId || undefined,
      currentUserId: parts.meta && parts.meta.currentUserId,
      users: users,
      facilities: facilities,
      assets: assets,
      incidents: incidents,
      maintenance: maintenance,
      workOrders: workOrders,
      kpis: kpis,
      projections: projections,
      health: health,
      _snapshotMeta: {
        source: "REPORTING_SNAPSHOT",
        generatedAt: generatedAt,
        ageInSeconds: ageInSeconds_(generatedAt),
        snapshotVersion: version,
        scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
      },
    };
  }

  function persistAssembled_(snapshot, version) {
    if (!snapshot || snapshot.facilityId) return;
    try {
      ReportingSnapshotRepository.writeAssembled(
        snapshot,
        version || Date.now()
      );
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] writeAssembled failed: " + err);
    }
  }

  function touchAssembledMeta_(snapshot) {
    if (!snapshot) return null;
    if (snapshot._snapshotMeta) {
      snapshot._snapshotMeta.ageInSeconds = ageInSeconds_(
        snapshot._snapshotMeta.generatedAt || snapshot.asOf
      );
      snapshot._snapshotMeta.source =
        snapshot._snapshotMeta.source || "REPORTING_SNAPSHOT";
    }
    return snapshot;
  }

  function recomputeDerived_(version) {
    var asOf = new Date().toISOString();
    var parts = {
      users: ReportingSnapshotRepository.readSection("users") || [],
      facilities: ReportingSnapshotRepository.readSection("facilities") || [],
      assets: ReportingSnapshotRepository.readSection("assets") || [],
      incidents: ReportingSnapshotRepository.readSection("incidents") || [],
      maintenance: ReportingSnapshotRepository.readSection("maintenance") || [],
      workOrders: ReportingSnapshotRepository.readSection("workOrders") || [],
    };

    var kpis = computeKpis_(asOf, parts);
    var projections = computeProjections_(asOf, parts);
    var health = computeHealth_(kpis);
    version = version || Date.now();

    ReportingSnapshotRepository.writeSection(
      "meta",
      {
        asOf: asOf,
        generatedAt: asOf,
        version: version,
        snapshotVersion: version,
        scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
      },
      version
    );
    ReportingSnapshotRepository.writeSection("kpis", kpis, version);
    ReportingSnapshotRepository.writeSection("projections", projections, version);
    ReportingSnapshotRepository.writeSection("health", health, version);

    return version;
  }

  function withLock_(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return fn();
    } finally {
      try {
        lock.releaseLock();
      } catch (ignore) {}
    }
  }

  function rebuildAll() {
    return withLock_(function () {
      var started = Date.now();
      Logger.log("[REPORTING_SNAPSHOT] full rebuild start");
      var asOf = new Date().toISOString();
      var rows = loadDomainRows_();
      var kpis = computeKpis_(asOf, rows);
      var projections = computeProjections_(asOf, rows);
      var health = computeHealth_(kpis);
      var version = Date.now();

      ReportingSnapshotRepository.writeFull(
        {
          meta: {
            asOf: asOf,
            generatedAt: asOf,
            version: version,
            snapshotVersion: version,
            scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
          },
          users: rows.users,
          facilities: rows.facilities,
          assets: rows.assets,
          incidents: rows.incidents,
          maintenance: rows.maintenance,
          workOrders: rows.workOrders,
          kpis: kpis,
          projections: projections,
          health: health,
        },
        version
      );

      invalidateSnapshotCache_();
      // Skip assembled section — it is stale until we rewrite it below.
      var snapshot = getSnapshotFromSheetUnlocked_({}, { skipAssembled: true });
      if (snapshot) {
        persistAssembled_(snapshot, version);
        writeCachedSnapshot_(undefined, snapshot);
      }

      Logger.log(
        "[REPORTING_SNAPSHOT] full rebuild done " +
          (Date.now() - started) +
          "ms"
      );
      return snapshot;
    });
  }

  /**
   * Refresh only the affected domain section, then recompute derived KPIs.
   * module: users | facilities | assets | incidents | maintenance | workOrders | work-orders
   */
  function refreshModule(module) {
    return withLock_(function () {
      var section = sectionForModule_(module);
      var started = Date.now();
      Logger.log("[REPORTING_SNAPSHOT] partial refresh module=" + section);

      var rows = loadModuleRows_(module);
      var version = Date.now();
      ReportingSnapshotRepository.writeSection(section, rows, version);
      recomputeDerived_(version);
      invalidateSnapshotCache_();

      // Skip assembled section — it is stale until we rewrite it below.
      var snapshot = getSnapshotFromSheetUnlocked_({}, { skipAssembled: true });
      if (snapshot) {
        persistAssembled_(snapshot, version);
        writeCachedSnapshot_(undefined, snapshot);
      }

      Logger.log(
        "[REPORTING_SNAPSHOT] partial refresh done module=" +
          section +
          " " +
          (Date.now() - started) +
          "ms"
      );
      return snapshot;
    });
  }

  /** Sheet-backed assemble — used on cache miss / after rebuild. */
  function getSnapshotFromSheetUnlocked_(payload, options) {
    payload = payload || {};
    options = options || {};
    var facilityId = payload.facilityId;

    // Prefer pre-serialized portfolio JSON (one section) over multi-section assemble.
    if (!facilityId && !options.skipAssembled) {
      var assembled = touchAssembledMeta_(
        ReportingSnapshotRepository.readAssembled()
      );
      if (assembled && assembled.kpis) {
        return assembled;
      }
    }

    var parts = ReportingSnapshotRepository.readFull();
    if (!parts || !parts.meta || !parts.kpis) {
      return null;
    }
    // Sheet assemble only — do NOT write assembled/cache here.
    // GET must stay read-only aside from CacheService.put in getSnapshot().
    return assembleSnapshot_(parts, facilityId);
  }

  function getSnapshot(payload) {
    payload = payload || {};
    var facilityId = payload.facilityId;
    var t0 = Date.now();

    // Flush dirty markers from recent CRUD (deferred off the write path).
    var flushPlan = flushDirtyModulesUnlocked_();
    if (flushPlan) {
      var tFlush = Date.now();
      if (flushPlan.mode === "rebuildAll") {
        rebuildAll();
      } else {
        refreshModule(flushPlan.modules[0]);
      }
      Logger.log(
        "[REPORTING_SNAPSHOT] deferred flush " +
          flushPlan.mode +
          " " +
          (Date.now() - tFlush) +
          "ms"
      );
    }

    // 1) CacheService — constant key, no sheet I/O
    var cached = readCachedSnapshot_(facilityId);
    if (cached) {
      Logger.log(
        "[REPORTING_SNAPSHOT] getSnapshot cache HIT " + (Date.now() - t0) + "ms"
      );
      return markCacheStatus_(cached, "HIT");
    }

    // 2) Pre-serialized assembled section, else single-pass sheet assemble
    var existing = getSnapshotFromSheetUnlocked_(payload);
    if (existing) {
      writeCachedSnapshot_(facilityId, existing);
      Logger.log(
        "[REPORTING_SNAPSHOT] getSnapshot sheet MISS " + (Date.now() - t0) + "ms"
      );
      return markCacheStatus_(existing, "MISS");
    }

    Logger.log("[REPORTING_SNAPSHOT] sheet miss — rebuilding");
    var rebuilt = rebuildAll();
    return markCacheStatus_(rebuilt, "MISS");
  }

  /**
   * Read-only operational diagnostics.
   * Does NOT rebuild, does NOT invalidate cache, does NOT write CacheService.
   */
  function diagnostics(payload) {
    payload = payload || {};
    var facilityId = payload.facilityId;
    var started = Date.now();

    var cacheReadStarted = Date.now();
    var cached = readCachedSnapshot_(facilityId);
    var cacheReadMs = Date.now() - cacheReadStarted;

    var snapshot = null;
    var cacheStatus = "MISS";
    var snapshotReadMs = 0;

    if (cached) {
      snapshot = cached;
      cacheStatus = "HIT";
    } else {
      var sheetReadStarted = Date.now();
      // Read-only sheet path — never put cache / never rebuild.
      snapshot = getSnapshotFromSheetUnlocked_(payload);
      snapshotReadMs = Date.now() - sheetReadStarted;
    }

    var meta = (snapshot && snapshot._snapshotMeta) || {};
    var generatedAt =
      (meta && meta.generatedAt) || (snapshot && snapshot.asOf) || null;

    return {
      snapshotVersion:
        meta.snapshotVersion != null ? meta.snapshotVersion : null,
      generatedAt: generatedAt,
      snapshotAgeSeconds: generatedAt ? ageInSeconds_(generatedAt) : null,
      cacheStatus: cacheStatus,
      snapshotSource: meta.source || (snapshot ? "REPORTING_SNAPSHOT" : null),
      users: snapshot && snapshot.users ? snapshot.users.length : 0,
      facilities:
        snapshot && snapshot.facilities ? snapshot.facilities.length : 0,
      assets: snapshot && snapshot.assets ? snapshot.assets.length : 0,
      incidents:
        snapshot && snapshot.incidents ? snapshot.incidents.length : 0,
      maintenance:
        snapshot && snapshot.maintenance ? snapshot.maintenance.length : 0,
      workOrders:
        snapshot && snapshot.workOrders ? snapshot.workOrders.length : 0,
      appsScriptExecutionMs: Date.now() - started,
      cacheReadMs: cacheReadMs,
      snapshotReadMs: snapshotReadMs,
    };
  }

  /**
   * Mark reporting snapshot stale after domain writes.
   * MUST NOT run refreshModule synchronously — that reloads domain sheets,
   * rewrites REPORTING_SNAPSHOT sections (row-by-row deletes), and holds
   * LockService for tens of seconds, blocking Work Order / Maintenance CRUD.
   *
   * Cache is cleared immediately. Deferred refresh runs on next getSnapshot
   * (Dashboard) or via the scheduled rebuild trigger.
   */
  function notifyModuleChanged(module) {
    var started = Date.now();
    try {
      invalidateSnapshotCache_();
      markSnapshotDirty_(module);
      Logger.log(
        "[REPORTING_SNAPSHOT] notifyModuleChanged deferred module=" +
          module +
          " " +
          (Date.now() - started) +
          "ms (invalidate+dirty only)"
      );
    } catch (err) {
      try {
        invalidateSnapshotCache_();
      } catch (ignore) {}
      Logger.log(
        "[REPORTING_SNAPSHOT] notifyModuleChanged failed module=" +
          module +
          " err=" +
          err
      );
    }
  }

  var DIRTY_PROP_KEY = "REPORTING_SNAPSHOT_DIRTY_MODULES";

  function markSnapshotDirty_(module) {
    var section = sectionForModule_(module);
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(DIRTY_PROP_KEY);
    var map = {};
    if (raw) {
      try {
        map = JSON.parse(raw) || {};
      } catch (ignore) {
        map = {};
      }
    }
    map[section] = new Date().toISOString();
    props.setProperty(DIRTY_PROP_KEY, JSON.stringify(map));
  }

  function consumeDirtyModules_() {
    var props = PropertiesService.getScriptProperties();
    var raw = props.getProperty(DIRTY_PROP_KEY);
    if (!raw) return [];
    props.deleteProperty(DIRTY_PROP_KEY);
    try {
      var map = JSON.parse(raw) || {};
      return Object.keys(map);
    } catch (ignore) {
      return [];
    }
  }

  /**
   * Apply deferred module refreshes before serving a snapshot read.
   * Keeps write path fast; Dashboard pays once when data is dirty.
   */
  function flushDirtyModulesUnlocked_() {
    var dirty = consumeDirtyModules_();
    if (!dirty.length) return null;
    var started = Date.now();
    // Multiple dirty modules → one full rebuild is cheaper than N partials
    // (each partial re-reads all snapshot sections for KPI recompute).
    if (dirty.length >= 2) {
      Logger.log(
        "[REPORTING_SNAPSHOT] flush dirty via rebuildAll modules=" +
          dirty.join(",")
      );
      // rebuildAll takes its own lock — caller must not hold lock.
      return { mode: "rebuildAll", modules: dirty, started: started };
    }
    return { mode: "refreshModule", modules: dirty, started: started };
  }

  return {
    rebuildAll: rebuildAll,
    refreshModule: refreshModule,
    getSnapshot: getSnapshot,
    diagnostics: diagnostics,
    notifyModuleChanged: notifyModuleChanged,
  };
})();
```

======================================
FILE:
RequestService.gs
======================================

```javascript
/**
 * RequestService.gs
 *
 * Business rules for Requests (intake layer).
 * Never talks to the spreadsheet directly — only RequestRepository.
 *
 * Phase 1: no OperationalRegisterCache — measure list latency first.
 */

var RequestService = (function () {
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

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var facilityId = payload.facilityId;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.reporterName || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.reporterContact || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.locationDetail || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      return matchesSearch && matchesStatus && matchesFacility;
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.createdAt || a.occurredAt || a.updatedAt || "");
      var bAt = String(b.createdAt || b.occurredAt || b.updatedAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return RequestRepository.getAll(auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = RequestRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Request id is required.");
    var row = RequestRepository.getById(id);
    if (!row) throw new Error("Request " + id + " not found.");
    return row;
  }

  function create(payload) {
    var t0 = Date.now();
    payload = payload || {};
    if (!payload.title || !String(payload.title).trim()) {
      throw new Error("Request title is required.");
    }
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility id is required.");
    }
    if (payload.status != null && !VALID_STATUSES[String(payload.status)]) {
      throw new Error("Invalid request status: " + payload.status);
    }
    if (
      payload.requestType != null &&
      String(payload.requestType).trim() !== "" &&
      !VALID_REQUEST_TYPES[String(payload.requestType)]
    ) {
      throw new Error(
        "Invalid request type: " +
          payload.requestType +
          ". Expected maintenance|incident."
      );
    }
    var tValidated = Date.now();
    var created = RequestRepository.create(payload);
    var tRepo = Date.now();
    var timings = {
      validateMs: tValidated - t0,
      repositoryMs: tRepo - tValidated,
      totalMs: tRepo - t0,
    };
    Logger.log("[RequestService.create] timings " + JSON.stringify(timings));
    if (payload._auditTiming) {
      created._serverTimings = timings;
    }
    return created;
  }

  function update(payload) {
    var t0 = Date.now();
    payload = payload || {};
    if (!payload.id) throw new Error("Request id is required.");
    if (payload.status != null && !VALID_STATUSES[String(payload.status)]) {
      throw new Error("Invalid request status: " + payload.status);
    }
    if (
      payload.requestType != null &&
      String(payload.requestType).trim() !== "" &&
      !VALID_REQUEST_TYPES[String(payload.requestType)]
    ) {
      throw new Error(
        "Invalid request type: " +
          payload.requestType +
          ". Expected maintenance|incident."
      );
    }
    var updated = RequestRepository.update(payload.id, payload);
    if (!updated) throw new Error("Request " + payload.id + " not found.");
    var tRepo = Date.now();
    var timings = {
      repositoryMs: tRepo - t0,
      totalMs: tRepo - t0,
    };
    Logger.log("[RequestService.update] timings " + JSON.stringify(timings));
    if (payload._auditTiming) {
      updated._serverTimings = timings;
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Request id is required.");
    var updated = RequestRepository.deactivate(payload.id);
    if (!updated) throw new Error("Request " + payload.id + " not found.");
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
RequestTreatmentService.gs
======================================

```javascript
/**
 * RequestTreatmentService.gs
 *
 * Consolidated Create-from-Request treatment mutation (Architecture B).
 *
 * Contract:
 *   resource: "requests"
 *   action:   "createTreatment"
 *   payload: {
 *     kind: "maintenance" | "incident",
 *     requestId: string,
 *     childInput: object,     // validated domain create fields from Next.js
 *     idempotencyKey: string,
 *     actorUserId?: string
 *   }
 *
 * Ordering (required):
 *   Create child (sourceRequestId set)
 *     → appendUnique child id on Request
 *     → status = being_treated (if non-terminal)
 *
 * LockService.getScriptLock() covers the mutation only — not a transaction.
 * Idempotency: PropertiesService ScriptProperties (survives separate invocations).
 * Auth + operational events remain on the Next.js side.
 *
 * BUILD: 2026-08-30-create-treatment-v1
 */

var RequestTreatmentService = (function () {
  var BUILD_MARKER = "2026-08-30-create-treatment-v1";
  var IDEM_PREFIX = "treatIdem:v1:";
  var LOCK_WAIT_MS = 30000;

  var TERMINAL_STATUSES = {
    resolved: true,
    closed: true,
    cancelled: true,
  };

  function nowIso_() {
    return new Date().toISOString();
  }

  function cell_(value) {
    if (value == null) return "";
    return String(value).trim();
  }

  function idempotencyPropertyKey_(kind, requestId, idempotencyKey) {
    return IDEM_PREFIX + kind + ":" + requestId + ":" + idempotencyKey;
  }

  function readIdempotency_(propKey) {
    var raw = PropertiesService.getScriptProperties().getProperty(propKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (ignore) {
      return null;
    }
  }

  function writeIdempotency_(propKey, record) {
    PropertiesService.getScriptProperties().setProperty(
      propKey,
      JSON.stringify(record)
    );
  }

  function isTerminal_(status) {
    return !!TERMINAL_STATUSES[String(status || "").toLowerCase()];
  }

  function statusAfterTreatment_(current) {
    if (isTerminal_(current)) return current;
    return "being_treated";
  }

  function loadAuthoritativeChild_(kind, childId) {
    if (kind === "maintenance") {
      return MaintenanceService.getById({ id: childId });
    }
    return IncidentService.getById({ id: childId });
  }

  /**
   * Prefer validated Next.js childInput; force relationship integrity fields.
   */
  function buildChildPayload_(kind, request, childInput, actorUserId) {
    childInput = childInput || {};
    var payload = {};
    var key;
    for (key in childInput) {
      if (
        childInput.hasOwnProperty(key) &&
        String(key).indexOf("_") !== 0
      ) {
        payload[key] = childInput[key];
      }
    }

    var facilityId = cell_(payload.facilityId) || cell_(request.facilityId);
    var title =
      cell_(payload.title) ||
      cell_(request.title) ||
      "Treatment " + request.id;
    var description =
      cell_(payload.description) || cell_(request.description) || title;
    var actor = cell_(actorUserId) || cell_(payload.updatedByUserId) || cell_(payload.createdByUserId);

    payload.title = title;
    payload.description = description;
    payload.facilityId = facilityId;
    payload.source = "request";
    payload.sourceRequestId = request.id;
    if (!cell_(payload.locationDetail) && cell_(request.locationDetail)) {
      payload.locationDetail = request.locationDetail;
    }
    if (!cell_(payload.reportedByUserId) && cell_(request.reportedByUserId)) {
      payload.reportedByUserId = request.reportedByUserId;
    }
    if (actor) {
      if (!cell_(payload.createdByUserId)) payload.createdByUserId = actor;
      payload.updatedByUserId = actor;
    }

    if (kind === "maintenance") {
      if (!cell_(payload.type)) payload.type = "corrective";
      if (!cell_(payload.priority)) payload.priority = "medium";
      if (!cell_(payload.status)) payload.status = "requested";
      if (!cell_(payload.reportedAt)) {
        payload.reportedAt = request.occurredAt || nowIso_();
      }
    } else {
      if (!cell_(payload.type)) payload.type = "other";
      if (!cell_(payload.severity)) payload.severity = "medium";
      if (!cell_(payload.status)) payload.status = "reported";
      if (!cell_(payload.reportedVia)) payload.reportedVia = "portal";
      if (!cell_(payload.reportedAt)) {
        payload.reportedAt = request.occurredAt || nowIso_();
      }
    }

    return payload;
  }

  function validateFacilityMatch_(request, childPayload) {
    var reqFac = cell_(request.facilityId);
    var childFac = cell_(childPayload.facilityId);
    if (!reqFac) {
      throw new Error("Request facilityId is required for treatment.");
    }
    if (!childFac) {
      throw new Error("Child facilityId is required for treatment.");
    }
    if (childFac !== reqFac) {
      throw new Error(
        "Facility mismatch: child facilityId " +
          childFac +
          " does not match request facilityId " +
          reqFac +
          "."
      );
    }
  }

  function compensateClearSource_(kind, childId, expectedRequestId, actorUserId) {
    var actor = cell_(actorUserId) || "system-compensation";
    if (kind === "maintenance") {
      var mnt = MaintenanceService.getById({ id: childId });
      if (!mnt) return { attempted: true, cleared: false, reason: "not_found" };
      if (cell_(mnt.sourceRequestId) !== expectedRequestId) {
        return {
          attempted: true,
          cleared: false,
          reason: "source_mismatch",
          sourceRequestId: mnt.sourceRequestId,
        };
      }
      MaintenanceService.update({
        id: childId,
        sourceRequestId: "",
        updatedByUserId: actor,
      });
      return { attempted: true, cleared: true };
    }

    var inc = IncidentService.getById({ id: childId });
    if (!inc) return { attempted: true, cleared: false, reason: "not_found" };
    if (cell_(inc.sourceRequestId) !== expectedRequestId) {
      return {
        attempted: true,
        cleared: false,
        reason: "source_mismatch",
        sourceRequestId: inc.sourceRequestId,
      };
    }
    IncidentService.update({
      id: childId,
      sourceRequestId: "",
      updatedByUserId: actor,
    });
    return { attempted: true, cleared: true };
  }

  function appendChildOnRequest_(kind, request, childId, actorUserId) {
    var updatePayload = {
      id: request.id,
      status: statusAfterTreatment_(request.status),
      updatedByUserId: cell_(actorUserId) || request.updatedByUserId || "",
    };
    if (kind === "maintenance") {
      updatePayload.maintenanceIds = SheetFieldUtils.appendUniqueId(
        request.maintenanceIds || [],
        childId
      );
    } else {
      updatePayload.incidentIds = SheetFieldUtils.appendUniqueId(
        request.incidentIds || [],
        childId
      );
    }
    return RequestService.update(updatePayload);
  }

  function createChild_(kind, childPayload) {
    if (kind === "maintenance") {
      return MaintenanceService.create(childPayload);
    }
    return IncidentService.create(childPayload);
  }

  function createTreatment(payload) {
    var tWall0 = Date.now();
    payload = payload || {};

    var kind = cell_(payload.kind).toLowerCase();
    var requestId = cell_(payload.requestId);
    var idempotencyKey = cell_(payload.idempotencyKey);
    var childInput = payload.childInput || {};
    var actorUserId = cell_(payload.actorUserId);

    if (kind !== "maintenance" && kind !== "incident") {
      throw new Error(
        'Invalid kind: expected "maintenance" or "incident", got "' +
          payload.kind +
          '".'
      );
    }
    if (!requestId) throw new Error("requestId is required.");
    if (!idempotencyKey) throw new Error("idempotencyKey is required.");

    var timings = {
      buildMarker: BUILD_MARKER,
      lockAcquireMs: 0,
      idempotencyLookupMs: 0,
      requestReadMs: 0,
      validateMs: 0,
      childCreateMs: 0,
      requestUpdateMs: 0,
      idempotencyWriteMs: 0,
      compensationMs: 0,
      sheetReadMs: 0,
      sheetWriteMs: 0,
      serverTotalMs: 0,
      heldLockMs: 0,
    };

    var propKey = idempotencyPropertyKey_(kind, requestId, idempotencyKey);

    var tLock0 = Date.now();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      throw new Error(
        "createTreatment busy — another treatment mutation holds the script lock."
      );
    }
    timings.lockAcquireMs = Date.now() - tLock0;
    var tHeld0 = Date.now();

    var child = null;
    var createdNewChild = false;

    try {
      var tIdem0 = Date.now();
      var existing = readIdempotency_(propKey);
      timings.idempotencyLookupMs = Date.now() - tIdem0;

      if (existing && existing.childId) {
        var tRead0 = Date.now();
        var requestExisting = RequestService.getById({ id: requestId });
        var childExisting = loadAuthoritativeChild_(kind, existing.childId);
        timings.requestReadMs = Date.now() - tRead0;
        timings.sheetReadMs += timings.requestReadMs;
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;

        var outIdem = {
          buildMarker: BUILD_MARKER,
          kind: kind,
          idempotent: true,
          idempotencyKey: idempotencyKey,
          request: requestExisting,
          timings: timings,
        };
        if (kind === "maintenance") {
          outIdem.maintenance = childExisting;
        } else {
          outIdem.incident = childExisting;
        }
        return outIdem;
      }

      var tReq0 = Date.now();
      var request;
      try {
        request = RequestService.getById({ id: requestId });
      } catch (notFoundErr) {
        timings.requestReadMs = Date.now() - tReq0;
        timings.sheetReadMs += timings.requestReadMs;
        throw new Error("Request " + requestId + " not found.");
      }
      timings.requestReadMs = Date.now() - tReq0;
      timings.sheetReadMs += timings.requestReadMs;

      var tVal0 = Date.now();
      if (isTerminal_(request.status)) {
        throw new Error(
          "Request " +
            requestId +
            " is " +
            request.status +
            " and cannot receive treatment."
        );
      }

      var childPayload = buildChildPayload_(
        kind,
        request,
        childInput,
        actorUserId
      );
      validateFacilityMatch_(request, childPayload);
      timings.validateMs = Date.now() - tVal0;

      var tChild0 = Date.now();
      child = createChild_(kind, childPayload);
      createdNewChild = true;
      timings.childCreateMs = Date.now() - tChild0;
      timings.sheetWriteMs += timings.childCreateMs;

      if (cell_(child.sourceRequestId) !== request.id) {
        throw new Error(
          "Child sourceRequestId integrity failure: expected " +
            request.id +
            ", got " +
            child.sourceRequestId
        );
      }

      var tUpd0 = Date.now();
      var freshReq = RequestService.getById({ id: request.id });
      var updatedRequest = appendChildOnRequest_(
        kind,
        freshReq,
        child.id,
        actorUserId
      );
      timings.requestUpdateMs = Date.now() - tUpd0;
      timings.sheetWriteMs += timings.requestUpdateMs;

      var tIdemW0 = Date.now();
      writeIdempotency_(propKey, {
        kind: kind,
        requestId: request.id,
        childId: child.id,
        completedAt: nowIso_(),
        buildMarker: BUILD_MARKER,
      });
      timings.idempotencyWriteMs = Date.now() - tIdemW0;

      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;

      var out = {
        buildMarker: BUILD_MARKER,
        kind: kind,
        idempotent: false,
        idempotencyKey: idempotencyKey,
        request: updatedRequest,
        timings: timings,
      };
      if (kind === "maintenance") {
        out.maintenance = child;
      } else {
        out.incident = child;
      }
      return out;
    } catch (error) {
      if (createdNewChild && child && child.id) {
        var tComp0 = Date.now();
        var compensation;
        try {
          compensation = compensateClearSource_(
            kind,
            child.id,
            requestId,
            actorUserId
          );
        } catch (compErr) {
          compensation = {
            attempted: true,
            cleared: false,
            reason: "compensation_threw",
            error: (compErr && compErr.message) || String(compErr),
          };
        }
        timings.compensationMs = Date.now() - tComp0;
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;

        throw new Error(
          "Treatment mutation failed after child create. childId=" +
            child.id +
            " compensation=" +
            JSON.stringify(compensation) +
            " timings=" +
            JSON.stringify(timings) +
            " cause=" +
            ((error && error.message) || String(error))
        );
      }
      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;
      throw error;
    } finally {
      try {
        lock.releaseLock();
      } catch (ignoreRelease) {
        // ignore
      }
    }
  }

  // --- Link Treatment (Phase 2.8) — state-based idempotency ---

  var LINK_BUILD_MARKER = "2026-08-30-link-treatment-v1";

  function loadLinkChild_(kind, childId) {
    if (kind === "maintenance") {
      return MaintenanceService.getById({ id: childId });
    }
    return IncidentService.getById({ id: childId });
  }

  function updateLinkChildSource_(kind, childId, sourceRequestId, actorUserId) {
    if (kind === "maintenance") {
      return MaintenanceService.update({
        id: childId,
        sourceRequestId: sourceRequestId,
        updatedByUserId: cell_(actorUserId) || "",
      });
    }
    return IncidentService.update({
      id: childId,
      sourceRequestId: sourceRequestId,
      updatedByUserId: cell_(actorUserId) || "",
    });
  }

  function compensateClearLinkSource_(
    kind,
    childId,
    expectedRequestId,
    actorUserId
  ) {
    var child = loadLinkChild_(kind, childId);
    if (!child) return { attempted: true, cleared: false, reason: "not_found" };
    if (cell_(child.sourceRequestId) !== expectedRequestId) {
      return {
        attempted: true,
        cleared: false,
        reason: "source_mismatch",
        sourceRequestId: child.sourceRequestId,
      };
    }
    updateLinkChildSource_(kind, childId, "", actorUserId);
    return { attempted: true, cleared: true };
  }

  function appendLinkChildOnRequest_(kind, request, childId, actorUserId) {
    var updatePayload = {
      id: request.id,
      status: statusAfterTreatment_(request.status),
      updatedByUserId: cell_(actorUserId) || request.updatedByUserId || "",
    };
    if (kind === "maintenance") {
      updatePayload.maintenanceIds = SheetFieldUtils.appendUniqueId(
        request.maintenanceIds || [],
        childId
      );
    } else {
      updatePayload.incidentIds = SheetFieldUtils.appendUniqueId(
        request.incidentIds || [],
        childId
      );
    }
    return RequestService.update(updatePayload);
  }

  function requestHasLinkChild_(kind, request, childId) {
    var list =
      kind === "maintenance"
        ? request.maintenanceIds || []
        : request.incidentIds || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] === childId) return true;
    }
    return false;
  }

  function classifyLinkOwnership_(child, requestId) {
    var existing = cell_(child.sourceRequestId);
    if (!existing) return "linkable";
    if (existing === requestId) return "already_linked";
    return "conflict";
  }

  /**
   * Consolidated Link-from-Request mutation.
   * State-based idempotency via sourceRequestId + appendUnique.
   */
  function linkTreatment(payload) {
    var tWall0 = Date.now();
    payload = payload || {};

    var kind = cell_(payload.kind).toLowerCase();
    var requestId = cell_(payload.requestId);
    var childId = cell_(payload.childId);
    var actorUserId = cell_(payload.actorUserId);
    var idempotencyKey = cell_(payload.idempotencyKey);

    if (kind !== "maintenance" && kind !== "incident") {
      throw new Error(
        'Invalid kind: expected "maintenance" or "incident", got "' +
          payload.kind +
          '".'
      );
    }
    if (!requestId) throw new Error("requestId is required.");
    if (!childId) throw new Error("childId is required.");

    var timings = {
      buildMarker: LINK_BUILD_MARKER,
      lockAcquireMs: 0,
      requestReadMs: 0,
      childReadMs: 0,
      validateMs: 0,
      childUpdateMs: 0,
      requestUpdateMs: 0,
      compensationMs: 0,
      sheetReadMs: 0,
      sheetWriteMs: 0,
      serverTotalMs: 0,
      heldLockMs: 0,
    };

    var tLock0 = Date.now();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      throw new Error(
        "linkTreatment busy — another treatment mutation holds the script lock."
      );
    }
    timings.lockAcquireMs = Date.now() - tLock0;
    var tHeld0 = Date.now();

    var childWroteSource = false;

    try {
      var tReq0 = Date.now();
      var request;
      try {
        request = RequestService.getById({ id: requestId });
      } catch (notFoundErr) {
        timings.requestReadMs = Date.now() - tReq0;
        timings.sheetReadMs += timings.requestReadMs;
        throw new Error("Request " + requestId + " not found.");
      }
      timings.requestReadMs = Date.now() - tReq0;
      timings.sheetReadMs += timings.requestReadMs;

      var tChild0 = Date.now();
      var child;
      try {
        child = loadLinkChild_(kind, childId);
      } catch (childErr) {
        timings.childReadMs = Date.now() - tChild0;
        timings.sheetReadMs += timings.childReadMs;
        throw new Error(
          (kind === "maintenance" ? "Maintenance " : "Incident ") +
            childId +
            " not found."
        );
      }
      timings.childReadMs = Date.now() - tChild0;
      timings.sheetReadMs += timings.childReadMs;

      var tVal0 = Date.now();
      if (isTerminal_(request.status)) {
        throw new Error(
          "Request " +
            requestId +
            " is " +
            request.status +
            " and cannot receive treatment."
        );
      }

      var reqFac = cell_(request.facilityId);
      var childFac = cell_(child.facilityId);
      if (reqFac && childFac && reqFac !== childFac) {
        throw new Error(
          "Facility mismatch: child facilityId " +
            childFac +
            " does not match request facilityId " +
            reqFac +
            "."
        );
      }

      var ownership = classifyLinkOwnership_(child, requestId);
      if (ownership === "conflict") {
        throw new Error(
          childId +
            " is already linked to " +
            cell_(child.sourceRequestId) +
            " and cannot be reassigned."
        );
      }
      timings.validateMs = Date.now() - tVal0;

      if (
        ownership === "already_linked" &&
        requestHasLinkChild_(kind, request, childId)
      ) {
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;
        var outIdem = {
          buildMarker: LINK_BUILD_MARKER,
          kind: kind,
          idempotent: true,
          idempotencyMode: "state",
          idempotencyKey: idempotencyKey || null,
          request: request,
          timings: timings,
        };
        if (kind === "maintenance") outIdem.maintenance = child;
        else outIdem.incident = child;
        return outIdem;
      }

      var linkedChild = child;
      if (ownership === "linkable") {
        var tUpdC0 = Date.now();
        linkedChild = updateLinkChildSource_(
          kind,
          childId,
          requestId,
          actorUserId
        );
        childWroteSource = true;
        timings.childUpdateMs = Date.now() - tUpdC0;
        timings.sheetWriteMs += timings.childUpdateMs;
      }

      var tFresh0 = Date.now();
      var freshReq = RequestService.getById({ id: requestId });
      timings.requestReadMs += Date.now() - tFresh0;
      timings.sheetReadMs += Date.now() - tFresh0;

      var updatedRequest = freshReq;
      if (!requestHasLinkChild_(kind, freshReq, childId)) {
        var tUpdR0 = Date.now();
        updatedRequest = appendLinkChildOnRequest_(
          kind,
          freshReq,
          childId,
          actorUserId
        );
        timings.requestUpdateMs = Date.now() - tUpdR0;
        timings.sheetWriteMs += timings.requestUpdateMs;
      }

      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;

      var out = {
        buildMarker: LINK_BUILD_MARKER,
        kind: kind,
        idempotent: ownership === "already_linked",
        idempotencyMode: "state",
        idempotencyKey: idempotencyKey || null,
        request: updatedRequest,
        timings: timings,
      };
      if (kind === "maintenance") out.maintenance = linkedChild;
      else out.incident = linkedChild;
      return out;
    } catch (error) {
      if (childWroteSource) {
        var tComp0 = Date.now();
        var compensation;
        try {
          compensation = compensateClearLinkSource_(
            kind,
            childId,
            requestId,
            actorUserId
          );
        } catch (compErr) {
          compensation = {
            attempted: true,
            cleared: false,
            reason: "compensation_threw",
            error: (compErr && compErr.message) || String(compErr),
          };
        }
        timings.compensationMs = Date.now() - tComp0;
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;
        throw new Error(
          "Link mutation failed after child sourceRequestId write. childId=" +
            childId +
            " compensation=" +
            JSON.stringify(compensation) +
            " timings=" +
            JSON.stringify(timings) +
            " cause=" +
            ((error && error.message) || String(error))
        );
      }
      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;
      throw error;
    } finally {
      try {
        lock.releaseLock();
      } catch (ignoreRelease) {
        // ignore
      }
    }
  }

  return {
    BUILD_MARKER: BUILD_MARKER,
    LINK_BUILD_MARKER: LINK_BUILD_MARKER,
    createTreatment: createTreatment,
    linkTreatment: linkTreatment,
  };
})();
```

======================================
FILE:
UserService.gs
======================================

```javascript
/**
 * UserService.gs
 *
 * Business rules for Users.
 * Never talks to the spreadsheet directly — only UserRepository.
 */

var UserService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var role = payload.role;
    var facility = payload.facility;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.email || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.phone || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.role || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.specialization || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facility || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status || "")
          .toLowerCase() === String(status).toLowerCase();

      var matchesRole =
        !role ||
        role === "all" ||
        String(row.role || "")
          .toLowerCase() === String(role).toLowerCase();

      var rowFacility = String(row.facility || "");
      var matchesFacility =
        !facility ||
        facility === "all" ||
        rowFacility === String(facility) ||
        (rowFacility && rowFacility !== "-" &&
          String(rowFacility).toLowerCase() === String(facility).toLowerCase());

      if (
        !matchesFacility &&
        facility &&
        facility !== "all" &&
        typeof FacilityRepository !== "undefined"
      ) {
        try {
          var facilities = FacilityRepository.getAll() || [];
          var i;
          for (i = 0; i < facilities.length; i++) {
            var f = facilities[i];
            var fid = String(f.id || "");
            var fname = String(f.name || "");
            if (
              (fid === String(facility) || fname === String(facility)) &&
              (rowFacility === fid ||
                rowFacility === fname ||
                String(rowFacility).toLowerCase() ===
                  String(fname).toLowerCase())
            ) {
              matchesFacility = true;
              break;
            }
          }
        } catch (ignore) {}
      }

      return (
        matchesSearch && matchesStatus && matchesRole && matchesFacility
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function getAll(payload) {
    var rows = UserRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("User id is required.");
    var user = UserRepository.getById(id);
    if (!user) throw new Error("User " + id + " not found.");
    return user;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("User name is required.");
    if (!payload.email) throw new Error("User email is required.");
    var created = UserRepository.create(payload);
    if (!created || !created.id) {
      throw new Error(
        "User create failed: repository returned no record. Check USERS sheet headers."
      );
    }
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("User id is required.");
    var updated = UserRepository.update(payload.id, payload);
    if (!updated) throw new Error("User " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("User id is required.");
    var updated = UserRepository.deactivate(payload.id);
    if (!updated) throw new Error("User " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
WorkOrderMaintenanceMutationService.gs
======================================

```javascript
/**
 * WorkOrderMaintenanceMutationService.gs
 *
 * Consolidated Create Work Order from Maintenance mutation (Phase 28D).
 *
 * Contract:
 *   resource: "work-orders"
 *   action:   "createFromMaintenance"
 *   payload: {
 *     maintenanceId: string,
 *     title?: string,
 *     requestedAt?: string,
 *     createdByUserId?: string,
 *     updatedByUserId?: string,
 *     actorUserId?: string
 *   }
 *
 * Ordering (single Apps Script invocation):
 *   Load Maintenance
 *     → idempotent return if linked WO exists
 *     → create Work Order (maintenanceId set)
 *     → update Maintenance backlink (workOrderIds merge)
 *     → verify reciprocal references
 *
 * LockService.getScriptLock() covers the mutation only — not a transaction.
 * Supabase operational_action_leases remain on the Next.js side.
 *
 * BUILD: 2026-09-01-phase29-wo-mutation-v1
 */

var WorkOrderMaintenanceMutationService = (function () {
  var BUILD_MARKER = "2026-09-01-phase29-wo-mutation-v1";
  var LOCK_WAIT_MS = 30000;

  function cell_(value) {
    if (value == null) return "";
    return String(value).trim();
  }

  function nowIso_() {
    return new Date().toISOString();
  }

  function parseDescriptionNotes_(description) {
    var text = cell_(description);
    var notes = { body: "", location: "", category: "" };
    if (!text) return notes;

    var blocks = text.split(/\n\n+/);
    var bodyParts = [];
    var i;
    for (i = 0; i < blocks.length; i++) {
      var block = cell_(blocks[i]);
      if (!block) continue;
      var lines = block.split(/\n+/);
      var j;
      var matchedStructured = false;
      for (j = 0; j < lines.length; j++) {
        var line = cell_(lines[j]);
        var match = line.match(
          /^(Location|Category|Attachment|Requested by|Reported by)\s*:\s*(.+)$/i
        );
        if (match) {
          matchedStructured = true;
          var label = String(match[1] || "").toLowerCase();
          var value = cell_(match[2]);
          if (label === "location") notes.location = value;
          if (label === "category") notes.category = value;
        }
      }
      if (!matchedStructured) bodyParts.push(block);
    }
    notes.body = bodyParts.join("\n\n");
    return notes;
  }

  function displayMaintenanceTitle_(maintenance) {
    var rawTitle = cell_(maintenance.title);
    var description = cell_(maintenance.description);
    var notesFromDescription = parseDescriptionNotes_(description);
    var notesFromTitle = parseDescriptionNotes_(rawTitle);

    if (!rawTitle) {
      return notesFromDescription.body || "Untitled";
    }

    var titleLooksLikeDescription =
      Boolean(description) &&
      (rawTitle === description ||
        notesFromTitle.location ||
        notesFromTitle.category);

    if (titleLooksLikeDescription) {
      return (
        notesFromTitle.body ||
        notesFromDescription.body ||
        cell_(rawTitle.split(/\n+/)[0]) ||
        "Untitled"
      );
    }

    if (rawTitle.indexOf("\n") === -1) return rawTitle;
    return cell_(rawTitle.split(/\n+/)[0]) || "Untitled";
  }

  function mapMaintenanceTypeToWoType_(type) {
    var map = {
      preventive: "preventive",
      corrective: "corrective",
      inspection: "inspection",
      predictive: "preventive",
      routine: "preventive",
      other: "other",
    };
    return map[String(type || "").toLowerCase()] || "corrective";
  }

  function mapMaintenanceSourceToWoSource_(source) {
    var s = String(source || "").toLowerCase();
    if (s === "incident") return "incident";
    if (s === "request") return "request";
    return "manual";
  }

  function buildWorkOrderPayload_(maintenance, payload) {
    payload = payload || {};
    var notes = parseDescriptionNotes_(maintenance.description);
    var title = cell_(payload.title) || displayMaintenanceTitle_(maintenance);
    if (title.length > 200) title = title.slice(0, 200);

    var descriptionParts = [];
    if (notes.body) descriptionParts.push(notes.body);
    if (notes.location) descriptionParts.push("Location: " + notes.location);
    if (cell_(maintenance.department)) {
      descriptionParts.push("Department: " + maintenance.department);
    }
    if (notes.category) descriptionParts.push("Category: " + notes.category);
    descriptionParts.push("Source maintenance: " + maintenance.id);

    var maintType = String(maintenance.type || "").toLowerCase();
    var maintenanceType =
      maintType === "preventive" ||
      maintType === "routine" ||
      maintType === "predictive"
        ? "planned"
        : "unplanned";

    var actor =
      cell_(payload.updatedByUserId) ||
      cell_(payload.createdByUserId) ||
      cell_(payload.actorUserId);

    return {
      title: title,
      description: descriptionParts.join("\n\n") || undefined,
      type: mapMaintenanceTypeToWoType_(maintenance.type),
      maintenanceType: maintenanceType,
      source: mapMaintenanceSourceToWoSource_(maintenance.source),
      facilityId: maintenance.facilityId,
      assetId: maintenance.assetId || "",
      maintenanceId: maintenance.id,
      incidentId: maintenance.incidentId || "",
      reportedByUserId: maintenance.reportedByUserId || "",
      assignedToUserId: maintenance.assignedToUserId || "",
      priority: maintenance.priority || "medium",
      status: "open",
      requestedAt: cell_(payload.requestedAt) || nowIso_(),
      createdByUserId: actor,
      updatedByUserId: actor,
    };
  }

  function existingWorkOrderId_(maintenance) {
    if (!maintenance) return "";
    if (cell_(maintenance.workOrderId)) return cell_(maintenance.workOrderId);
    var ids = maintenance.workOrderIds;
    if (ids && ids.length) return cell_(ids[0]);
    return "";
  }

  function invalidateCaches_() {
    if (typeof OperationalRegisterCache !== "undefined") {
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.workOrders
      );
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.maintenance
      );
    }
  }

  function notifySnapshots_() {
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
  }

  function compensateClearWoMaintenanceLink_(workOrderId) {
    try {
      WorkOrderRepository.update(workOrderId, { maintenanceId: "" });
      return { attempted: true, cleared: true };
    } catch (err) {
      return {
        attempted: true,
        cleared: false,
        error: (err && err.message) || String(err),
      };
    }
  }

  function verifyReciprocalLinks_(maintenance, workOrder) {
    if (cell_(workOrder.maintenanceId) !== cell_(maintenance.id)) {
      throw new Error(
        "Work Order backlink integrity failure: expected maintenanceId " +
          maintenance.id +
          ", got " +
          workOrder.maintenanceId
      );
    }
    var ids = maintenance.workOrderIds || [];
    var primary = cell_(maintenance.workOrderId) || cell_(ids[0]);
    var includes =
      primary === workOrder.id ||
      ids.some(function (id) {
        return cell_(id) === workOrder.id;
      });
    if (!includes) {
      throw new Error(
        "Maintenance backlink integrity failure: workOrderIds missing " +
          workOrder.id
      );
    }
  }

  function createFromMaintenance(payload) {
    var tWall0 = Date.now();
    payload = payload || {};

    var maintenanceId = cell_(payload.maintenanceId);
    if (!maintenanceId) throw new Error("maintenanceId is required.");

    var timings = {
      buildMarker: BUILD_MARKER,
      lockAcquireMs: 0,
      maintenanceReadMs: 0,
      validateMs: 0,
      payloadBuildMs: 0,
      workOrderCreateMs: 0,
      maintenanceUpdateMs: 0,
      verifyMs: 0,
      responseBuildMs: 0,
      compensationMs: 0,
      cacheNotifyMs: 0,
      serverTotalMs: 0,
      heldLockMs: 0,
    };

    var tLock0 = Date.now();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      throw new Error(
        "createFromMaintenance busy — another mutation holds the script lock."
      );
    }
    timings.lockAcquireMs = Date.now() - tLock0;
    var tHeld0 = Date.now();

    var workOrder = null;
    var createdNewWorkOrder = false;

    try {
      var tRead0 = Date.now();
      var maintenance = MaintenanceRepository.getById(maintenanceId);
      timings.maintenanceReadMs = Date.now() - tRead0;
      if (!maintenance) {
        throw new Error("Maintenance " + maintenanceId + " not found.");
      }

      var tVal0 = Date.now();
      var existingId = existingWorkOrderId_(maintenance);
      if (existingId) {
        var existingWo = WorkOrderRepository.getById(existingId);
        if (existingWo) {
          timings.validateMs = Date.now() - tVal0;
          timings.heldLockMs = Date.now() - tHeld0;
          timings.serverTotalMs = Date.now() - tWall0;
          return {
            buildMarker: BUILD_MARKER,
            created: false,
            maintenance: maintenance,
            workOrder: existingWo,
            timings: timings,
          };
        }
      }
      timings.validateMs = Date.now() - tVal0;

      if (!cell_(maintenance.facilityId)) {
        throw new Error("Maintenance facilityId is required to create a Work Order.");
      }

      var tPayload0 = Date.now();
      var woPayload = buildWorkOrderPayload_(maintenance, payload);
      timings.payloadBuildMs = Date.now() - tPayload0;

      var tCreate0 = Date.now();
      workOrder = WorkOrderRepository.create(woPayload);
      createdNewWorkOrder = true;
      timings.workOrderCreateMs = Date.now() - tCreate0;

      if (cell_(workOrder.maintenanceId) !== maintenanceId) {
        throw new Error(
          "Work Order maintenanceId integrity failure during create."
        );
      }

      var tMaintUpd0 = Date.now();
      var maintRepoResult = MaintenanceRepository.update(maintenanceId, {
        workOrderId: workOrder.id,
        workOrderIds: SheetFieldUtils.appendUniqueId(
          maintenance.workOrderIds || [],
          workOrder.id
        ),
        requiresWorkOrder: true,
      });
      var updatedMaintenance = maintRepoResult ? maintRepoResult.canonical : null;
      timings.maintenanceUpdateMs = Date.now() - tMaintUpd0;

      if (!updatedMaintenance) {
        throw new Error(
          "Maintenance backlink update failed for " + maintenanceId + "."
        );
      }

      var tVerify0 = Date.now();
      verifyReciprocalLinks_(updatedMaintenance, workOrder);
      timings.verifyMs = Date.now() - tVerify0;

      var tNotify0 = Date.now();
      invalidateCaches_();
      notifySnapshots_();
      timings.cacheNotifyMs = Date.now() - tNotify0;

      var tResponse0 = Date.now();
      timings.responseBuildMs = Date.now() - tResponse0;
      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;

      Logger.log(
        "[WorkOrderMaintenanceMutationService.createFromMaintenance] timings " +
          JSON.stringify(timings)
      );

      return {
        buildMarker: BUILD_MARKER,
        created: true,
        maintenance: updatedMaintenance,
        workOrder: workOrder,
        timings: timings,
      };
    } catch (error) {
      if (createdNewWorkOrder && workOrder && workOrder.id) {
        var tComp0 = Date.now();
        var compensation = compensateClearWoMaintenanceLink_(workOrder.id);
        timings.compensationMs = Date.now() - tComp0;
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;
        Logger.log(
          "[WorkOrderMaintenanceMutationService.createFromMaintenance] compensation " +
            JSON.stringify(compensation)
        );
        throw new Error(
          (error && error.message) ||
            "createFromMaintenance failed after Work Order create. compensation=" +
              JSON.stringify(compensation)
        );
      }
      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;
      throw error;
    } finally {
      lock.releaseLock();
    }
  }

  return {
    createFromMaintenance: createFromMaintenance,
  };
})();
```

======================================
FILE:
WorkOrderService.gs
======================================

```javascript
/**
 * WorkOrderService.gs
 *
 * Business rules for Work Orders. Mirrors FacilityService.gs / AssetService.gs.
 * Never talks to the spreadsheet directly — only WorkOrderRepository.
 */

var WorkOrderService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var priority = payload.priority;
    var facilityId = payload.facilityId;
    var assignedToUserId = payload.assignedToUserId;
    var type = payload.type;
    var assetId = payload.assetId;
    var maintenanceId = payload.maintenanceId;
    var dueDate = payload.dueDate;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.workInstructions || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assetId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.maintenanceId || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesPriority =
        !priority ||
        priority === "all" ||
        String(row.priority).toLowerCase() === String(priority).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesAssignee =
        !assignedToUserId ||
        assignedToUserId === "all" ||
        String(row.assignedToUserId) === String(assignedToUserId);

      var matchesType =
        !type ||
        type === "all" ||
        String(row.type).toLowerCase() === String(type).toLowerCase();

      var matchesAsset =
        !assetId ||
        assetId === "all" ||
        String(row.assetId || "") === String(assetId);

      var matchesMaintenance =
        !maintenanceId ||
        maintenanceId === "all" ||
        String(row.maintenanceId || "") === String(maintenanceId);

      var matchesDue = true;
      if (dueDate && dueDate !== "all") {
        var dueRaw = String(row.dueAt || "").trim();
        if (dueDate === "no_due") {
          matchesDue = !dueRaw;
        } else if (!dueRaw) {
          matchesDue = false;
        } else {
          var dueMs = Date.parse(dueRaw);
          if (!isFinite(dueMs)) {
            matchesDue = false;
          } else {
            var now = new Date();
            var startOfToday = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            ).getTime();
            if (dueDate === "overdue") {
              matchesDue = dueMs < startOfToday;
            } else if (dueDate === "next_7_days") {
              var weekMs = startOfToday + 7 * 24 * 60 * 60 * 1000;
              matchesDue = dueMs >= startOfToday && dueMs <= weekMs;
            }
          }
        }
      }

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesFacility &&
        matchesAssignee &&
        matchesType &&
        matchesAsset &&
        matchesMaintenance &&
        matchesDue
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.createdAt || a.reportedAt || a.updatedAt || "");
      var bAt = String(b.createdAt || b.reportedAt || b.updatedAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function loadCanonicalRows_(payload, auditCollector) {
    payload = payload || {};
    if (typeof OperationalRegisterCache === "undefined") {
      return WorkOrderRepository.getAll(auditCollector);
    }
    return OperationalRegisterCache.getCanonicalRows(
      OperationalRegisterCache.NAMESPACES.workOrders,
      function (collector) {
        return WorkOrderRepository.getAll(collector);
      },
      {
        skipCache: !!payload._skipCache,
        auditCollector: auditCollector,
      }
    );
  }

  function invalidateRegisterCache_() {
    if (typeof OperationalRegisterCache !== "undefined") {
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.workOrders
      );
    }
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return loadCanonicalRows_(payload, auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = loadCanonicalRows_(payload, null);
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Work order id is required.");
    var workOrder = WorkOrderRepository.getById(id);
    if (!workOrder) throw new Error("Work order " + id + " not found.");
    return workOrder;
  }

  function create(payload) {
    var t0 = Date.now();
    if (!payload || !payload.title) throw new Error("Work order title is required.");
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var tValidated = Date.now();
    var created = WorkOrderRepository.create(payload);
    var tRepo = Date.now();
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    invalidateRegisterCache_();
    var tNotify = Date.now();
    var timings = {
      validateMs: tValidated - t0,
      repositoryMs: tRepo - tValidated,
      snapshotNotifyMs: tNotify - tRepo,
      totalMs: tNotify - t0,
    };
    Logger.log("[WorkOrderService.create] timings " + JSON.stringify(timings));
    if (payload && payload._auditTiming) {
      created._serverTimings = timings;
    }
    return created;
  }

  function update(payload) {
    var t0 = Date.now();
    if (!payload || !payload.id) throw new Error("Work order id is required.");
    var updated = WorkOrderRepository.update(payload.id, payload);
    if (!updated) throw new Error("Work order " + payload.id + " not found.");
    var tRepo = Date.now();
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    invalidateRegisterCache_();
    var tNotify = Date.now();
    var timings = {
      repositoryMs: tRepo - t0,
      snapshotNotifyMs: tNotify - tRepo,
      totalMs: tNotify - t0,
    };
    Logger.log("[WorkOrderService.update] timings " + JSON.stringify(timings));
    if (payload && payload._auditTiming) {
      updated._serverTimings = timings;
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Work order id is required.");
    var updated = WorkOrderRepository.deactivate(payload.id);
    if (!updated) throw new Error("Work order " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    invalidateRegisterCache_();
    return updated;
  }

  /**
   * Consolidated WO filter catalogs — one invocation, column-limited projections.
   * Does not call getAll on domain services.
   */
  function loadFilterCatalogFromSheets_() {
    var t0 = Date.now();
    var facilities = [];
    var users = [];
    var assets = [];

    if (
      typeof FacilityRepository !== "undefined" &&
      FacilityRepository.listFilterCatalog
    ) {
      facilities = FacilityRepository.listFilterCatalog() || [];
    }
    if (
      typeof UserRepository !== "undefined" &&
      UserRepository.listFilterCatalog
    ) {
      users = UserRepository.listFilterCatalog() || [];
    }
    if (
      typeof AssetRepository !== "undefined" &&
      AssetRepository.listFilterCatalog
    ) {
      assets = AssetRepository.listFilterCatalog() || [];
    }

    return {
      facilities: facilities,
      users: users,
      assets: assets,
      sheetReadMs: Date.now() - t0,
    };
  }

  function attachCacheDiagnostics_(target, payload, diagnostics) {
    if (payload && payload._auditTiming && diagnostics) {
      target._cacheDiagnostics = diagnostics;
    }
    return target;
  }

  function getFilterCatalog(payload) {
    payload = payload || {};
    var tTotal0 = Date.now();
    var skipCache = !!payload._skipCache;
    var cacheHit = false;
    var cacheReadMs = 0;
    var sheetReadMs = 0;
    var projectionMs = 0;
    var catalog = null;

    if (!skipCache && typeof CatalogCacheService !== "undefined") {
      var cached = CatalogCacheService.getWoFilterCatalog();
      if (cached && cached.data) {
        cacheHit = true;
        cacheReadMs = cached.cacheReadMs || 0;
        catalog = cached.data;
      }
    }

    if (!cacheHit) {
      var loaded = loadFilterCatalogFromSheets_();
      sheetReadMs = loaded.sheetReadMs;
      catalog = {
        facilities: loaded.facilities,
        users: loaded.users,
        assets: loaded.assets,
      };
      if (typeof CatalogCacheService !== "undefined") {
        CatalogCacheService.putWoFilterCatalog(catalog);
      }
    }

    var totalServerMs = Date.now() - tTotal0;
    var result = {
      facilities: catalog.facilities || [],
      users: catalog.users || [],
      assets: catalog.assets || [],
    };

    Logger.log(
      "[WorkOrderService.getFilterCatalog] cacheHit=" +
        cacheHit +
        " sheetReadMs=" +
        sheetReadMs +
        " cacheReadMs=" +
        cacheReadMs +
        " totalServerMs=" +
        totalServerMs
    );

    return attachCacheDiagnostics_(result, payload, {
      cacheHit: cacheHit,
      cacheReadMs: cacheReadMs,
      sheetReadMs: sheetReadMs,
      projectionMs: projectionMs,
      totalServerMs: totalServerMs,
    });
  }

  return {
    getAll: getAll,
    getById: getById,
    getFilterCatalog: getFilterCatalog,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
```

======================================
FILE:
ApprovalsController.gs
======================================

```javascript
/**
 * ApprovalsController.gs
 *
 * Entry for module/resource === "approvals".
 */

var ApprovalsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Approvals retrieved.",
            ApprovalService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Approval retrieved.",
            ApprovalService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Approval created.",
            ApprovalService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Approval updated.",
            ApprovalService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Approval cancelled.",
            ApprovalService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown approvals action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Approvals request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
AssetsController.gs
======================================

```javascript
/**
 * AssetsController.gs
 *
 * Entry for module/resource === "assets".
 * Follows UsersController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "assets",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var AssetsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Assets retrieved.",
            AssetService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Asset retrieved.",
            AssetService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Asset created.",
            AssetService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Asset updated.",
            AssetService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Asset deactivated.",
            AssetService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown assets action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Assets request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
CostRecordsController.gs
======================================

```javascript
  /**
  * CostRecordsController.gs
  *
  * Entry for module/resource === "cost-records".
  */

  var CostRecordsController = (function () {
    function handle(action, payload) {
      try {
        switch (String(action || "getAll")) {
          case "getAll":
            return jsonResponse_(
              true,
              "Cost records retrieved.",
              CostRecordService.getAll(payload)
            );

          case "getById":
            return jsonResponse_(
              true,
              "Cost record retrieved.",
              CostRecordService.getById(payload)
            );

          case "create":
            return jsonResponse_(
              true,
              "Cost record created.",
              CostRecordService.create(payload)
            );

          case "update":
            return jsonResponse_(
              true,
              "Cost record updated.",
              CostRecordService.update(payload)
            );

          default:
            return jsonResponse_(
              false,
              "Unknown cost-records action: " + action,
              null
            );
        }
      } catch (error) {
        return jsonResponse_(
          false,
          error.message || "Cost records request failed.",
          null
        );
      }
    }

    return {
      handle: handle,
    };
  })();
```

======================================
FILE:
CostSubmissionsController.gs
======================================

```javascript
/**
 * CostSubmissionsController.gs
 *
 * Entry for module/resource === "cost-submissions".
 */

var CostSubmissionsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Cost submissions retrieved.",
            CostSubmissionService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Cost submission retrieved.",
            CostSubmissionService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Cost submission created.",
            CostSubmissionService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Cost submission updated.",
            CostSubmissionService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown cost-submissions action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Cost submissions request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
FacilitiesController.gs
======================================

```javascript
/**
 * FacilitiesController.gs
 *
 * Entry for module/resource === "facilities".
 * Follows UsersController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "facilities",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var FacilitiesController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Facilities retrieved.",
            FacilityService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Facility retrieved.",
            FacilityService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Facility created.",
            FacilityService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Facility updated.",
            FacilityService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Facility deactivated.",
            FacilityService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown facilities action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Facilities request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
IncidentsController.gs
======================================

```javascript
/**
 * IncidentsController.gs
 *
 * Entry for module/resource === "incidents".
 * Follows UsersController / WorkOrdersController architecture exactly.
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var IncidentsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Incidents retrieved.",
            IncidentService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Incident retrieved.",
            IncidentService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Incident created.",
            IncidentService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Incident updated.",
            IncidentService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Incident deactivated.",
            IncidentService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown incidents action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Incidents request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
MaintenanceController.gs
======================================

```javascript
/**
 * MaintenanceController.gs
 *
 * Entry for module/resource === "maintenance".
 * Follows UsersController / IncidentsController architecture exactly.
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var MaintenanceController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Maintenance retrieved.",
            MaintenanceService.getAll(payload)
          );

        case "listCatalog":
          return jsonResponse_(
            true,
            "Maintenance catalog retrieved.",
            MaintenanceService.listCatalog(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Maintenance retrieved.",
            MaintenanceService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Maintenance created.",
            MaintenanceService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Maintenance updated.",
            MaintenanceService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Maintenance deactivated.",
            MaintenanceService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown maintenance action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Maintenance request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
MasterDataController.gs
======================================

```javascript
/**
 * MasterDataController.gs
 *
 * Entry for module/resource === "master-data".
 *
 * Expected request body:
 * {
 *   resource: "master-data",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate" | "getLocationCatalog",
 *   payload: { entity: "departments"|"buildings"|"floors"|"rooms"|"vendors", ... }
 * }
 */

var MasterDataController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Master data retrieved.",
            MasterDataService.getAll(payload)
          );

        case "getLocationCatalog":
          return jsonResponse_(
            true,
            "Location catalog retrieved.",
            MasterDataService.getLocationCatalog(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Master data item retrieved.",
            MasterDataService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Master data item created.",
            MasterDataService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Master data item updated.",
            MasterDataService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Master data item deactivated.",
            MasterDataService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown master-data action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Master-data request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
OperationalWorkloadController.gs
======================================

```javascript
/**
 * OperationalWorkloadController.gs
 *
 * Entry for module/resource === "operational-workload".
 */

var OperationalWorkloadController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getEntitySummary")) {
        case "getEntitySummary":
          return jsonResponse_(
            true,
            "Operational workload summary retrieved.",
            OperationalWorkloadService.getEntitySummary(payload)
          );

        case "buildInfo":
          return jsonResponse_(true, "Operational workload build info.", {
            buildMarker: OperationalWorkloadService.BUILD_MARKER,
          });

        default:
          return jsonResponse_(
            false,
            "Unknown operational-workload action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Operational workload request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
ReimbursementAuthorizationsController.gs
======================================

```javascript
/**
 * ReimbursementAuthorizationsController.gs
 *
 * Entry for module/resource === "reimbursement-authorizations".
 */

var ReimbursementAuthorizationsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Reimbursement authorizations retrieved.",
            ReimbursementAuthorizationService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Reimbursement authorization retrieved.",
            ReimbursementAuthorizationService.getById(payload)
          );

        case "getBySubmissionId":
          return jsonResponse_(
            true,
            "Reimbursement authorization retrieved.",
            ReimbursementAuthorizationService.getBySubmissionId(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Reimbursement authorization recorded.",
            ReimbursementAuthorizationService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Reimbursement authorization updated.",
            ReimbursementAuthorizationService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown reimbursement-authorizations action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Reimbursement authorizations request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
ReimbursementPaymentsController.gs
======================================

```javascript
/**
 * ReimbursementPaymentsController.gs
 *
 * Entry for module/resource === "reimbursement-payments".
 */

var ReimbursementPaymentsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Reimbursement payments retrieved.",
            ReimbursementPaymentService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Reimbursement payment retrieved.",
            ReimbursementPaymentService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Reimbursement payment recorded.",
            ReimbursementPaymentService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Reimbursement payment updated.",
            ReimbursementPaymentService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown reimbursement-payments action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Reimbursement payments request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
ReportingSnapshotController.gs
======================================

```javascript
/**
 * ReportingSnapshotController.gs
 *
 * Entry for module/resource === "reporting-snapshot".
 *
 * Actions:
 *   getSnapshot   — read derived REPORTING_SNAPSHOT (rebuilds on cold miss)
 *   diagnostics   — read-only cache/sheet health (no rebuild / no invalidate)
 *   rebuild       — force full rebuild from domain sheets
 *   refreshModule — partial refresh { module: "facilities" | ... }
 *
 * Uses shared jsonResponse_() — same helper as other controllers.
 */

var ReportingSnapshotController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getSnapshot")) {
        case "getSnapshot":
          return jsonResponse_(
            true,
            "Reporting snapshot loaded.",
            ReportingSnapshotService.getSnapshot(payload)
          );

        case "diagnostics":
          return jsonResponse_(
            true,
            "Reporting snapshot diagnostics.",
            ReportingSnapshotService.diagnostics(payload)
          );

        case "rebuild":
          return jsonResponse_(
            true,
            "Reporting snapshot rebuilt.",
            ReportingSnapshotService.rebuildAll()
          );

        case "refreshModule":
          return jsonResponse_(
            true,
            "Reporting snapshot module refreshed.",
            ReportingSnapshotService.refreshModule(
              payload && payload.module ? payload.module : ""
            )
          );

        default:
          return jsonResponse_(
            false,
            "Unknown reporting-snapshot action: " + action,
            null
          );
      }
    } catch (err) {
      return jsonResponse_(
        false,
        err && err.message ? err.message : String(err),
        null
      );
    }
  }

  return { handle: handle };
})();
```

======================================
FILE:
RequestsController.gs
======================================

```javascript
/**
 * RequestsController.gs
 *
 * Entry for module/resource === "requests".
 * Follows IncidentsController / WorkOrdersController architecture.
 */

var RequestsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Requests retrieved.",
            RequestService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Request retrieved.",
            RequestService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Request created.",
            RequestService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Request updated.",
            RequestService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Request deactivated.",
            RequestService.deactivate(payload)
          );

        case "createTreatment":
          return jsonResponse_(
            true,
            "Treatment mutation completed.",
            RequestTreatmentService.createTreatment(payload)
          );

        case "linkTreatment":
          return jsonResponse_(
            true,
            "Link treatment mutation completed.",
            RequestTreatmentService.linkTreatment(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown requests action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Requests request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
UsersController.gs
======================================

```javascript
/**
 * UsersController.gs
 *
 * Entry for module/resource === "users".
 *
 * Expected request body:
 * {
 *   resource: "users",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate" | "buildInfo",
 *   payload: { ... }
 * }
 *
 * Always returns jsonResponse_(success, message, data).
 * getAll data MUST be the paginated object from UserService.getAll(payload)
 * — do NOT wrap it again as { data: paginated, page, totalPages }.
 */

var UsersController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Users retrieved.",
            UserService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "User retrieved.",
            UserService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "User created.",
            UserService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "User updated.",
            UserService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "User deactivated.",
            UserService.deactivate(payload)
          );

        case "buildInfo":
          return jsonResponse_(
            true,
            "Users module build info.",
            UserRepository.getBuildInfo()
          );

        default:
          return jsonResponse_(
            false,
            "Unknown users action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Users request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
WorkOrdersController.gs
======================================

```javascript
/**
 * WorkOrdersController.gs
 *
 * Entry for module/resource === "work-orders".
 * Follows UsersController / AssetsController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "work-orders",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var WorkOrdersController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Work orders retrieved.",
            WorkOrderService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Work order retrieved.",
            WorkOrderService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Work order created.",
            WorkOrderService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Work order updated.",
            WorkOrderService.update(payload)
          );

        case "createFromMaintenance":
          return jsonResponse_(
            true,
            "Work order created from maintenance.",
            WorkOrderMaintenanceMutationService.createFromMaintenance(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Work order deactivated.",
            WorkOrderService.deactivate(payload)
          );

        case "getFilterCatalog":
          return jsonResponse_(
            true,
            "Work order filter catalog retrieved.",
            WorkOrderService.getFilterCatalog(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown work-orders action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Work orders request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
```

======================================
FILE:
OperationalListAudit.gs
======================================

```javascript
/**
 * OperationalListAudit.gs
 *
 * Audit-gated timing helpers for operational register getAll paths.
 * Active only when payload._auditTiming is true — no production behaviour change.
 */

var OperationalListAudit = (function () {
  /**
   * Wraps a domain getAll pipeline with measured phase boundaries.
   * repositoryGetAll(auditCollector) must populate sheet + mapping timings on auditCollector.
   */
  function instrumentGetAll_(payload, repositoryGetAll, applyFilters, sortFn, paginate) {
    var tTotal0 = Date.now();
    var repoAudit = {};

    var rows = repositoryGetAll(repoAudit);

    var tFilter0 = Date.now();
    var filtered = applyFilters(rows, payload);
    var filterMs = Date.now() - tFilter0;

    var tSort0 = Date.now();
    var sorted = sortFn(filtered);
    var sortMs = Date.now() - tSort0;

    var rowsBeforePagination = sorted.length;

    var tPage0 = Date.now();
    var result = paginate(sorted, payload);
    var paginationMs = Date.now() - tPage0;

    var tSer0 = Date.now();
    try {
      JSON.stringify({
        success: true,
        message: "",
        data: result,
      });
    } catch (serErr) {}
    var serializationMs = Date.now() - tSer0;

    var totalServerMs = Date.now() - tTotal0;
    var rowsReturned =
      result && result.data && result.data.length != null
        ? result.data.length
        : 0;

    result._listDiagnostics = {
      totalServerMs: totalServerMs,
      spreadsheetOpenMs: repoAudit.spreadsheetOpenMs || 0,
      sheetLookupMs: repoAudit.sheetLookupMs || 0,
      sheetReadMs: repoAudit.sheetReadMs || 0,
      rawRowCount: repoAudit.rawRowCount || 0,
      rawColumnCount: repoAudit.rawColumnCount || 0,
      canonicalMappingMs: repoAudit.canonicalMappingMs || 0,
      filterMs: filterMs,
      sortMs: sortMs,
      paginationMs: paginationMs,
      serializationMs: serializationMs,
      rowsMapped: repoAudit.rowsMapped || rows.length,
      rowsFiltered: filtered.length,
      rowsSorted: sorted.length,
      rowsBeforePagination: rowsBeforePagination,
      rowsReturned: rowsReturned,
      cacheHit: !!repoAudit.cacheHit,
      cacheReadMs: repoAudit.cacheReadMs || 0,
      cacheInteraction: repoAudit.cacheInteraction || "none",
    };

    Logger.log(
      "[OperationalListAudit] " +
        JSON.stringify({
          totalServerMs: totalServerMs,
          cacheHit: !!repoAudit.cacheHit,
          sheetReadMs: repoAudit.sheetReadMs || 0,
          rowsMapped: repoAudit.rowsMapped || rows.length,
          rowsReturned: rowsReturned,
        })
    );

    return result;
  }

  /**
   * Optional audit collector passed to Repository.getAll(collector).
   * Splits getSheet_ / getDataRange / getValues / mapping into measured phases.
   */
  function beginSheetRead_(getSheetFn, collector) {
    var tOpen0 = Date.now();
    var sheet = getSheetFn();
    collector.spreadsheetOpenMs = Date.now() - tOpen0;

    var tLookup0 = Date.now();
    var dataRange = sheet.getDataRange();
    collector.sheetLookupMs = Date.now() - tLookup0;

    var tRead0 = Date.now();
    var values = dataRange.getValues();
    collector.sheetReadMs = Date.now() - tRead0;
    collector.rawRowCount = values.length;
    collector.rawColumnCount =
      values.length > 0 && values[0] ? values[0].length : 0;

    return { sheet: sheet, values: values };
  }

  function finishMapping_(collector, tMap0, rows) {
    collector.canonicalMappingMs = Date.now() - tMap0;
    collector.rowsMapped = rows.length;
  }

  return {
    instrumentGetAll_: instrumentGetAll_,
    beginSheetRead_: beginSheetRead_,
    finishMapping_: finishMapping_,
  };
})();
```

======================================
FILE:
OperationalRegisterCache.gs
======================================

```javascript
/**
 * OperationalRegisterCache.gs
 *
 * Reusable Apps Script CacheService primitive for operational register
 * canonical row sets (Maintenance, Incidents, Approvals, Work Orders).
 *
 * Caches the mapped canonical array — not raw sheet rows and not
 * filtered/paginated page responses. Mutations invalidate explicitly;
 * TTL is a safety net only.
 *
 * Domain differences are limited to:
 *   - cache key / namespace
 *   - TTL (shared default)
 *   - repository loader (caller-supplied)
 *   - invalidation namespace
 */

var OperationalRegisterCache = (function () {
  var CACHE_VERSION = "v1";
  /** Safety-net TTL — mutations invalidate explicitly; never rely on TTL alone. */
  var TTL_SECONDS = 600;
  /**
   * CacheService ~100KB limit. UTF-8→base64 expands size; leave headroom.
   * Oversized payloads skip put (cold path continues to work).
   */
  var MAX_ENCODED_CHARS = 90000;

  var NAMESPACES = {
    maintenance: "maintenance",
    incidents: "incidents",
    approvals: "approvals",
    workOrders: "work-orders",
  };

  function cacheKey_(namespace) {
    return "opreg:" + CACHE_VERSION + ":" + String(namespace || "");
  }

  function cache_() {
    return CacheService.getScriptCache();
  }

  function getRows(namespace) {
    var key = cacheKey_(namespace);
    var t0 = Date.now();
    var raw = SheetFieldUtils.cacheGetUtf8(cache_(), key);
    var cacheReadMs = Date.now() - t0;
    if (raw == null || raw === "") return null;
    try {
      var value = JSON.parse(raw);
      if (!Array.isArray(value)) return null;
      return { rows: value, cacheReadMs: cacheReadMs };
    } catch (err) {
      try {
        cache_().remove(key);
      } catch (removeErr) {}
      return null;
    }
  }

  function putRows(namespace, rows) {
    var key = cacheKey_(namespace);
    try {
      var text = JSON.stringify(rows || []);
      var encodedLen =
        ("u8b64:").length +
        Math.ceil((Utilities.newBlob(text).getBytes().length * 4) / 3);
      if (encodedLen > MAX_ENCODED_CHARS) {
        Logger.log(
          "[OperationalRegisterCache] skip put " +
            key +
            " — encoded ~" +
            encodedLen +
            " exceeds " +
            MAX_ENCODED_CHARS
        );
        return false;
      }
      SheetFieldUtils.cachePutUtf8(cache_(), key, text, TTL_SECONDS);
      return true;
    } catch (err) {
      Logger.log(
        "[OperationalRegisterCache] put failed " + key + ": " + err
      );
      return false;
    }
  }

  function invalidate(namespace) {
    var key = cacheKey_(namespace);
    try {
      cache_().remove(key);
      Logger.log("[OperationalRegisterCache] invalidated " + key);
    } catch (err) {
      Logger.log(
        "[OperationalRegisterCache] invalidate failed " + key + ": " + err
      );
    }
  }

  /**
   * Load canonical rows from cache, or call loaderFn and populate cache.
   *
   * loaderFn(auditCollector?) → Array
   * options: { skipCache: boolean, auditCollector: object }
   */
  function getCanonicalRows(namespace, loaderFn, options) {
    options = options || {};
    var skipCache = !!options.skipCache;
    var auditCollector = options.auditCollector || null;

    if (!skipCache) {
      var cached = getRows(namespace);
      if (cached && cached.rows) {
        if (auditCollector) {
          auditCollector.cacheHit = true;
          auditCollector.cacheReadMs = cached.cacheReadMs || 0;
          auditCollector.cacheInteraction = "hit";
          auditCollector.rowsMapped = cached.rows.length;
          auditCollector.spreadsheetOpenMs = 0;
          auditCollector.sheetLookupMs = 0;
          auditCollector.sheetReadMs = 0;
          auditCollector.canonicalMappingMs = 0;
        }
        return cached.rows;
      }
    }

    var rows = loaderFn(auditCollector) || [];
    putRows(namespace, rows);
    if (auditCollector) {
      auditCollector.cacheHit = false;
      if (!auditCollector.cacheInteraction) {
        auditCollector.cacheInteraction = skipCache ? "skipped" : "miss";
      }
      if (auditCollector.rowsMapped == null) {
        auditCollector.rowsMapped = rows.length;
      }
    }
    return rows;
  }

  return {
    CACHE_VERSION: CACHE_VERSION,
    TTL_SECONDS: TTL_SECONDS,
    NAMESPACES: NAMESPACES,
    getRows: getRows,
    putRows: putRows,
    invalidate: invalidate,
    getCanonicalRows: getCanonicalRows,
  };
})();
```

======================================
FILE:
ReportingSnapshotTriggers.gs
======================================

```javascript
/**
 * ReportingSnapshotTriggers.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER — scheduled safety-net rebuild.
 * ---------------------------------------------------------------------------
 * Installs a time-driven trigger that fully rebuilds REPORTING_SNAPSHOT every
 * 10 minutes. Partial refreshes still run on CRUD; this catches drift.
 *
 * Run once (from Apps Script editor):
 *   installReportingSnapshotTrigger()
 *
 * To remove:
 *   removeReportingSnapshotTriggers()
 */

function rebuildReportingSnapshotScheduled() {
  try {
    ReportingSnapshotService.rebuildAll();
  } catch (err) {
    Logger.log(
      "[REPORTING_SNAPSHOT] scheduled rebuild failed: " +
        (err && err.message ? err.message : err)
    );
  }
}

function installReportingSnapshotTrigger() {
  removeReportingSnapshotTriggers();

  ScriptApp.newTrigger("rebuildReportingSnapshotScheduled")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log(
    "[REPORTING_SNAPSHOT] installed 10-minute rebuild trigger"
  );

  // Cold-start: ensure the sheet exists and is populated.
  try {
    ReportingSnapshotService.rebuildAll();
  } catch (err) {
    Logger.log(
      "[REPORTING_SNAPSHOT] initial rebuild failed: " +
        (err && err.message ? err.message : err)
    );
  }
}

function removeReportingSnapshotTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "rebuildReportingSnapshotScheduled") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
```

======================================
FILE:
RequestTreatmentLinkSpike.gs
======================================

```javascript
/**
 * RequestTreatmentLinkSpike.gs
 *
 * Deprecated Phase 2.7 alias. Prefer RequestTreatmentService.linkTreatment.
 * Kept so partial deploys that still reference the spike symbol keep working.
 */

var RequestTreatmentLinkSpike = (function () {
  return {
    linkTreatment: function (payload) {
      return RequestTreatmentService.linkTreatment(payload);
    },
  };
})();
```

======================================
FILE:
RequestTreatmentMutationSpike.gs
======================================

```javascript
/**
 * RequestTreatmentMutationSpike.gs
 *
 * Deprecated Phase 2.5 alias. Prefer RequestTreatmentService.gs.
 * Kept so partial deploys that still reference the spike symbol keep working.
 */

var RequestTreatmentMutationSpike = (function () {
  return {
    createTreatment: function (payload) {
      return RequestTreatmentService.createTreatment(payload);
    },
  };
})();
```

======================================
FILE:
SheetFieldUtils.gs
======================================

```javascript
/**
 * SheetFieldUtils.gs — shared sheet helpers for operational repositories.
 */

var SheetFieldUtils = (function () {
  function cellText_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function parseIdList_(raw) {
    var text = cellText_(raw);
    if (!text) return [];
    var parts = text.split(/[,;|]/);
    var out = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var id = String(parts[i]).trim();
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function formatIdList_(ids) {
    if (!ids || !ids.length) return "";
    return ids.join(", ");
  }

  function appendUniqueId_(ids, id) {
    var list = ids ? ids.slice() : [];
    var trimmed = cellText_(id);
    if (!trimmed) return list;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === trimmed) return list;
    }
    list.push(trimmed);
    return list;
  }

  function getHeaderMap_(sheet) {
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return {};
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    return headerMapFromRow_(headers);
  }

  /** Build header map from an already-loaded header row (avoids re-read). */
  function headerMapFromRow_(headers) {
    var map = {};
    for (var i = 0; i < headers.length; i++) {
      map[String(headers[i]).trim()] = i;
    }
    return map;
  }

  function rowToSheetObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[String(headers[i]).trim()] = row[i];
    }
    return obj;
  }

  function buildRowFromFields_(headerMap, lastCol, fields) {
    var row = new Array(lastCol);
    for (var i = 0; i < lastCol; i++) row[i] = "";
    for (var header in fields) {
      if (fields.hasOwnProperty(header) && headerMap[header] !== undefined) {
        row[headerMap[header]] = fields[header];
      }
    }
    return row;
  }

  /**
   * Like buildRowFromFields_, but throws when any field with a non-empty value
   * targets a missing header — prevents silent data loss on writes.
   */
  function buildRowFromFieldsStrict_(headerMap, lastCol, fields) {
    var missing = [];
    for (var header in fields) {
      if (!fields.hasOwnProperty(header)) continue;
      if (headerMap[header] !== undefined) continue;
      var value = fields[header];
      if (value == null || String(value).trim() === "") continue;
      missing.push(header);
    }
    if (missing.length) {
      throw new Error(
        "Cannot write sheet fields — missing headers: " + missing.join(", ")
      );
    }
    return buildRowFromFields_(headerMap, lastCol, fields);
  }

  function hasHeader_(headerMap, name) {
    return headerMap[name] !== undefined;
  }

  /**
   * CacheService values are Latin-1 ByteStrings. Arbitrary Unicode (e.g. … — –)
   * must be UTF-8 encoded then base64'd before put().
   */
  var CACHE_UTF8_PREFIX = "u8b64:";

  function cachePutUtf8(cache, key, value, ttlSeconds) {
    var text = value == null ? "" : String(value);
    var encoded =
      CACHE_UTF8_PREFIX +
      Utilities.base64Encode(text, Utilities.Charset.UTF_8);
    if (ttlSeconds == null) {
      cache.put(key, encoded);
    } else {
      cache.put(key, encoded, ttlSeconds);
    }
    return encoded.length;
  }

  function cacheGetUtf8(cache, key) {
    var raw = cache.get(key);
    if (raw == null) return null;
    var text = String(raw);
    if (text.indexOf(CACHE_UTF8_PREFIX) === 0) {
      var bytes = Utilities.base64Decode(
        text.substring(CACHE_UTF8_PREFIX.length)
      );
      return Utilities.newBlob(bytes).getDataAsString("UTF-8");
    }
    // Legacy plain entries (ASCII / previously written Latin-1-safe JSON).
    return text;
  }

  return {
    cellText: cellText_,
    parseIdList: parseIdList_,
    formatIdList: formatIdList_,
    appendUniqueId: appendUniqueId_,
    getHeaderMap: getHeaderMap_,
    headerMapFromRow: headerMapFromRow_,
    rowToSheetObject: rowToSheetObject_,
    buildRowFromFields: buildRowFromFields_,
    buildRowFromFieldsStrict: buildRowFromFieldsStrict_,
    hasHeader: hasHeader_,
    cachePutUtf8: cachePutUtf8,
    cacheGetUtf8: cacheGetUtf8,
  };
})();
```

