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
