/**
 * ROUTER_UPDATE.gs
 *
 * Paste / merge into your existing doPost router.
 *
 *   } else if (resource === "work-orders") {
 *     result = WorkOrdersController.handle(action, payload);
 *   } else if (resource === "incidents") {
 *     result = IncidentsController.handle(action, payload);
 *   } else if (resource === "maintenance") {
 *     result = MaintenanceController.handle(action, payload);
 *   } else if (resource === "reporting-snapshot") {
 *     result = ReportingSnapshotController.handle(action, payload);  // ← ADD
 *   } else {
 *     result = jsonResponse_(false, "Unknown module: " + resource, null);
 *   }
 *
 * DEPLOY (Reporting Snapshot — performance layer):
 * 1. Add ReportingSnapshotRepository.gs, ReportingSnapshotService.gs,
 *    ReportingSnapshotController.gs, ReportingSnapshotTriggers.gs
 * 2. Update domain services to call ReportingSnapshotService.notifyModuleChanged(...)
 *    after create / update / deactivate
 *    - facilities / assets / incidents / maintenance / workOrders: patched in repo
 *    - users: see UsersService.snapshotHooks.gs (UserService not in this repo)
 * 3. Update router as above
 * 4. Deploy → New version of the Web App
 * 5. Run installReportingSnapshotTrigger() once
 */

function __routerSnippetDocs() {
  // This file is documentation only — not executed.
}
