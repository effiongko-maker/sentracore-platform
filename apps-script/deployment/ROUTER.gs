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
 *             "incidents" | "maintenance" | "master-data" |
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
    } else if (resource === "master-data") {
      result = MasterDataController.handle(action, payload);
    } else if (resource === "reporting-snapshot") {
      result = ReportingSnapshotController.handle(action, payload);
    } else {
      result = jsonResponse_(
        false,
        resource
          ? "Unknown module: " + resource
          : "Missing resource. Expected users|facilities|assets|work-orders|incidents|maintenance|master-data|reporting-snapshot.",
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
  return jsonResponse_(true, "SentraCore Apps Script is online.", {
    service: "sentracore",
    resources: [
      "users",
      "facilities",
      "assets",
      "work-orders",
      "incidents",
      "maintenance",
      "master-data",
      "reporting-snapshot",
    ],
  });
}
