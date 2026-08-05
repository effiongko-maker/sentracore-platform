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
