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
      "master-data",
      "reporting-snapshot",
    ],
    builds: builds,
  });
}
