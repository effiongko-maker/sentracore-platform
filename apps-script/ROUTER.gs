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
 *             "master-data" | "reporting-snapshot" | "operational-workload" | "command-centre-fm" |
 *             "cost-records" | "cost-submissions" | "reimbursement-payments" |
 *             "diesel-usage" | "consumables-update" | "waste-log" | "fumigation-log" | "deep-cleaning-log",
 *   action: string,
 *   payload: object,
 *   requestId: string,
 *   sharedSecret: string  // Script Property APPS_SCRIPT_SHARED_SECRET; never logged
 * }
 *
 * `module` is accepted as an alias for `resource` for backwards compatibility.
 * Anonymous possession of the /exec URL is not authorization.
 */

var currentRequestId_ = "";

function jsonResponse_(success, message, data, meta) {
  var mergedMeta = meta && typeof meta === "object" ? meta : {};
  if (currentRequestId_ && mergedMeta.requestId == null) {
    mergedMeta.requestId = currentRequestId_;
  }
  var payload = {
    success: !!success,
    message: message == null ? "" : String(message),
    data: data === undefined ? null : data,
  };
  if (Object.keys(mergedMeta).length) {
    payload.meta = mergedMeta;
  }
  var text;
  try {
    text = JSON.stringify(payload);
  } catch (err) {
    text = JSON.stringify({
      success: false,
      message: "Failed to serialise Apps Script response.",
      data: null,
      meta: {
        errorClass: "serialization",
        requestId: currentRequestId_ || undefined,
      },
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
  if (/apps_script_auth/.test(lower)) {
    return { errorClass: "auth", retryable: false };
  }
  return { errorClass: "exception", retryable: false };
}

function secretsEqual_(left, right) {
  var a = String(left == null ? "" : left);
  var b = String(right == null ? "" : right);
  var max = Math.max(a.length, b.length);
  var mismatch = a.length === b.length ? 0 : 1;
  for (var i = 0; i < max; i++) {
    var ca = i < a.length ? a.charCodeAt(i) : 0;
    var cb = i < b.length ? b.charCodeAt(i) : 0;
    mismatch = mismatch | (ca ^ cb);
  }
  return mismatch === 0;
}

function authorizeAppsScriptRequest_(body) {
  var expected = "";
  try {
    expected = String(
      PropertiesService.getScriptProperties().getProperty(
        "APPS_SCRIPT_SHARED_SECRET"
      ) || ""
    ).trim();
  } catch (err) {
    expected = "";
  }
  if (!expected) {
    throw new Error("APPS_SCRIPT_AUTH_NOT_CONFIGURED");
  }
  var provided = String(
    (body && (body.sharedSecret || body.authToken)) || ""
  ).trim();
  if (!secretsEqual_(expected, provided)) {
    throw new Error("APPS_SCRIPT_AUTH_FAILED");
  }
}

function doPost(e) {
  var body = {};
  currentRequestId_ = "";

  try {
    var raw =
      e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    body = JSON.parse(raw || "{}");
  } catch (err) {
    body = {};
  }

  currentRequestId_ = String(body.requestId || "").trim();
  var resource = String(body.resource || body.module || "").trim();
  var action = body.action || "getAll";
  var payload = body.payload || {};

  var result;

  try {
    authorizeAppsScriptRequest_(body);
    Logger.log(
      "[apps-script] request " +
        JSON.stringify({
          requestId: currentRequestId_ || null,
          resource: resource,
          action: action,
        })
    );
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
    } else if (resource === "command-centre-fm") {
      result = CommandCentreFmSummaryController.handle(action, payload);
    } else if (resource === "cost-records") {
      result = CostRecordsController.handle(action, payload);
    } else if (resource === "cost-submissions") {
      result = CostSubmissionsController.handle(action, payload);
    } else if (resource === "reimbursement-payments") {
      result = ReimbursementPaymentsController.handle(action, payload);
    } else if (resource === "reimbursement-authorizations") {
      result = ReimbursementAuthorizationsController.handle(action, payload);
    } else if (resource === "generator-log") {
      result = GeneratorLogController.handle(action, payload);
    } else if (resource === "energy-reading") {
      result = EnergyReadingController.handle(action, payload);
    } else if (resource === "diesel-usage") {
      result = DieselUsageController.handle(action, payload);
    } else if (resource === "consumables-update") {
      result = ConsumablesUpdateController.handle(action, payload);
    } else if (resource === "waste-log") {
      result = WasteLogController.handle(action, payload);
    } else if (resource === "fumigation-log") {
      result = FumigationLogController.handle(action, payload);
    } else if (resource === "deep-cleaning-log") {
      result = DeepCleaningLogController.handle(action, payload);
    } else {
      result = jsonResponse_(
        false,
        resource
          ? "Unknown module: " + resource
          : "Missing resource. Expected users|facilities|assets|work-orders|incidents|maintenance|approvals|requests|master-data|reporting-snapshot|operational-workload|cost-records|cost-submissions|reimbursement-payments|reimbursement-authorizations|generator-log|energy-reading|diesel-usage|consumables-update|waste-log|fumigation-log|deep-cleaning-log.",
        null,
        { errorClass: "validation", retryable: false }
      );
    }
  } catch (error) {
    var classified = classifyAppsScriptError_(error);
    var errorMessage = (error && error.message) || "Unhandled Apps Script error.";
    if (
      errorMessage === "APPS_SCRIPT_AUTH_NOT_CONFIGURED" ||
      errorMessage === "APPS_SCRIPT_AUTH_FAILED"
    ) {
      errorMessage = "Unauthorized.";
      classified = { errorClass: "auth", retryable: false };
    }
    Logger.log(
      "[apps-script] error " +
        JSON.stringify({
          requestId: currentRequestId_ || null,
          resource: resource,
          action: action,
          errorClass: classified.errorClass,
        })
    );
    result = jsonResponse_(false, errorMessage, null, classified);
  }

  return result;
}

/**
 * Optional health check for the Web App deployment URL.
 * GET is liveness only — it does not return operational data and does not
 * authenticate. All operational reads/writes go through doPost.
 */
function doGet() {
  var builds = {};
  if (typeof UserRepository !== "undefined" && UserRepository.BUILD_MARKER) {
    builds.users = UserRepository.BUILD_MARKER;
  }
  if (typeof AssetRepository !== "undefined" && AssetRepository.BUILD_MARKER) {
    builds.assets = AssetRepository.BUILD_MARKER;
  }
  if (
    typeof GeneratorLogRepository !== "undefined" &&
    GeneratorLogRepository.BUILD_MARKER
  ) {
    builds.generatorLog = GeneratorLogRepository.BUILD_MARKER;
  }
  if (
    typeof DieselUsageRepository !== "undefined" &&
    DieselUsageRepository.BUILD_MARKER
  ) {
    builds.dieselUsage = DieselUsageRepository.BUILD_MARKER;
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
      "command-centre-fm",
      "cost-records",
      "cost-submissions",
      "reimbursement-payments",
      "reimbursement-authorizations",
      "generator-log",
      "energy-reading",
      "diesel-usage",
      "consumables-update",
      "waste-log",
      "fumigation-log",
      "deep-cleaning-log",
    ],
    builds: builds,
  });
}
