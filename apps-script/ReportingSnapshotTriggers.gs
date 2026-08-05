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
