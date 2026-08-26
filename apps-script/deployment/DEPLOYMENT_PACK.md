# SentraCore Apps Script Deployment Pack

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: npm run apps-script:pack -->

Generated: 2026-08-26T03:00:57.294Z

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
- ApprovalsController.gs
- ApprovalService.gs
- AssetRepository.gs
- AssetsController.gs
- AssetService.gs
- FacilitiesController.gs
- FacilityRepository.gs
- FacilityService.gs
- IncidentRepository.gs
- IncidentsController.gs
- IncidentService.gs
- MaintenanceController.gs
- MaintenanceRepository.gs
- MaintenanceService.gs
- MasterDataController.gs
- MasterDataRepository.gs
- MasterDataService.gs
- ReportingSnapshotController.gs
- ReportingSnapshotRepository.gs
- ReportingSnapshotService.gs
- ReportingSnapshotTriggers.gs
- SheetFieldUtils.gs
- UserRepository.gs
- UsersController.gs
- UserService.gs
- WorkOrderRepository.gs
- WorkOrdersController.gs
- WorkOrderService.gs

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
 *             "incidents" | "maintenance" | "approvals" | "master-data" |
 *             "reporting-snapshot",
 *   action: string,
 *   payload: object
 * }
 *
 * `module` is accepted as an alias for `resource` for backwards compatibility.
 */

function jsonResponse_(success, message, data) {
  var payload = {
    success: !!success,
    message: message == null ? "" : String(message),
    data: data === undefined ? null : data,
  };
  var text;
  try {
    text = JSON.stringify(payload);
  } catch (err) {
    text = JSON.stringify({
      success: false,
      message: "Failed to serialise Apps Script response.",
      data: null,
    });
  }
  // ContentService accepts Unicode strings; do not pass through ByteString APIs.
  return ContentService.createTextOutput(text).setMimeType(
    ContentService.MimeType.JSON
  );
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
    } else if (resource === "master-data") {
      result = MasterDataController.handle(action, payload);
    } else if (resource === "reporting-snapshot") {
      result = ReportingSnapshotController.handle(action, payload);
    } else {
      result = jsonResponse_(
        false,
        resource
          ? "Unknown module: " + resource
          : "Missing resource. Expected users|facilities|assets|work-orders|incidents|maintenance|approvals|master-data|reporting-snapshot.",
        null
      );
    }
  } catch (error) {
    result = jsonResponse_(
      false,
      (error && error.message) || "Unhandled Apps Script error.",
      null
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
      "master-data",
      "reporting-snapshot",
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

  function getAll(payload) {
    var rows = ApprovalRepository.getAll();
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
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Approval id is required.");
    var updated = ApprovalRepository.deactivate(payload.id);
    if (!updated) throw new Error("Approval " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("approvals");
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

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
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
    var sorted = sortNewestFirst_(filtered);
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
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Asset id is required.");
    var updated = AssetRepository.update(payload.id, payload);
    if (!updated) throw new Error("Asset " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
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
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Facility id is required.");
    var updated = FacilityRepository.update(payload.id, payload);
    if (!updated) throw new Error("Facility " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
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

  function getAll(payload) {
    var rows = IncidentRepository.getAll();
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
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Incident id is required.");
    var updated = IncidentRepository.deactivate(payload.id);
    if (!updated) throw new Error("Incident " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
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
    "Source",
    "Title",
    "Updated At",
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
      completionNotes: undefined,
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
      var id = SheetFieldUtils.cellText(sheetRow["Maintenance ID"]);
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
      workOrderIds: workOrderIds,
      workOrderId: workOrderIds.length ? workOrderIds[0] : undefined,
      reportedAt:
        payload.reportedAt != null
          ? payload.reportedAt
          : current.reportedAt || current.createdAt,
      completedAt:
        payload.completedAt != null ? payload.completedAt : current.completedAt,
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
      workOrderIds: workOrderIds,
      workOrderId: workOrderIds.length ? workOrderIds[0] : undefined,
      reportedAt: reportedAt,
      completedAt: payload.completedAt || "",
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
          .indexOf(search) !== -1;

      var matchesPriority =
        !priority ||
        priority === "all" ||
        String(row.priority).toLowerCase() === String(priority).toLowerCase();

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

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

  function getAll(payload) {
    var rows = MaintenanceRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Maintenance id is required.");
    var row = MaintenanceRepository.getById(id);
    if (!row) throw new Error("Maintenance " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || (!payload.title && !payload.description)) {
      throw new Error("Maintenance title is required.");
    }
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = MaintenanceRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    return created;
  }

  function update(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.id) throw new Error("Maintenance id is required.");
    var updated = MaintenanceRepository.update(payload.id, payload);
    if (!updated) throw new Error("Maintenance " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
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
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
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
    return MasterDataRepository.create(entity, payload);
  }

  function update(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.update(entity, payload.id, payload);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
    return updated;
  }

  function deactivate(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.deactivate(entity, payload.id);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
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
    score -= Math.min(40, (kpis.criticalIncidents || 0) * 15);
    score -= Math.min(25, (kpis.overdueWorkOrders || 0) * 5);
    score -= Math.min(20, (kpis.overdueMaintenance || 0) * 4);
    score -= Math.min(10, (kpis.assetsInPoorCondition || 0) * 2);
    score -= Math.min(10, (kpis.incidentsNeedingWorkOrder || 0) * 3);
    score = Math.max(0, Math.min(100, score));

    var band =
      score >= 80 ? "healthy" : score >= 55 ? "watch" : "critical";
    var summary =
      band === "healthy"
        ? "Here's what's happening across your facilities today."
        : band === "watch"
          ? "Some items need attention before end of day."
          : "Critical pressure detected — review open incidents and overdue work.";

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

    // 1) CacheService — constant key, no sheet I/O
    var cached = readCachedSnapshot_(facilityId);
    if (cached) {
      return markCacheStatus_(cached, "HIT");
    }

    // 2) Pre-serialized assembled section, else single-pass sheet assemble
    var existing = getSnapshotFromSheetUnlocked_(payload);
    if (existing) {
      writeCachedSnapshot_(facilityId, existing);
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
   * Fire-and-forget style wrapper for domain service hooks.
   * Never throws into CRUD paths.
   */
  function notifyModuleChanged(module) {
    try {
      // refreshModule invalidates + repopulates CacheService.
      refreshModule(module);
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
    rowToSheetObject: rowToSheetObject_,
    buildRowFromFields: buildRowFromFields_,
    hasHeader: hasHeader_,
    cachePutUtf8: cachePutUtf8,
    cacheGetUtf8: cacheGetUtf8,
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

  return {
    BUILD_MARKER: BUILD_MARKER,
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
    getBuildInfo: getBuildInfo,
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
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("User id is required.");
    var updated = UserRepository.update(payload.id, payload);
    if (!updated) throw new Error("User " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
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
WorkOrderRepository.gs
======================================

```javascript
/**
 * WorkOrderRepository.gs
 *
 * Sheet: Work Orders (source of truth).
 * Relationship columns (added on first write if missing):
 *   Incident ID, Parent Work Order ID, Source, Title
 * Event ID = Supabase operational_events.id only.
 * Maintenance ID = maintenance activity id (not parent work order).
 */

var WorkOrderRepository = (function () {
  var SHEET_CANDIDATES = ["Work Orders", "WorkOrders", "WORK_ORDERS"];

  var RELATIONSHIP_HEADERS = [
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
      reportedByUserId: undefined,
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
      var workOrderId = String(all[i].id || "");
      var yearMatch = workOrderId.match(/^WO-(\d{4})-(\d+)$/i);
      if (yearMatch && parseInt(yearMatch[1], 10) === year) {
        maxYear = Math.max(maxYear, parseInt(yearMatch[2], 10));
      }
    }
    var next = maxYear + 1;
    var padded = ("000000" + next).slice(-6);
    return "WO-" + year + "-" + padded;
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
    var id = nextId_();
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

    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var headerMap = SheetFieldUtils.getHeaderMap(sheet);
    var sheetRow = SheetFieldUtils.rowToSheetObject(headers, values[rowIndex - 1]);
    var currentRaw = toCanonical_(sheetRow, headerMap);

    var updated = mergeCanonical_(currentRaw, payload);
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

        case "deactivate":
          return jsonResponse_(
            true,
            "Work order deactivated.",
            WorkOrderService.deactivate(payload)
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

  function getAll(payload) {
    var rows = WorkOrderRepository.getAll();
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
    if (!payload || !payload.title) throw new Error("Work order title is required.");
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = WorkOrderRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Work order id is required.");
    var updated = WorkOrderRepository.update(payload.id, payload);
    if (!updated) throw new Error("Work order " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
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

