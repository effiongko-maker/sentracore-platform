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
 *   } else if (resource === "generator-log") {
 *     result = GeneratorLogController.handle(action, payload);  // ← ADD
 *   } else if (resource === "energy-reading") {
 *     result = EnergyReadingController.handle(action, payload);  // ← ADD
 *   } else if (resource === "diesel-usage") {
 *     result = DieselUsageController.handle(action, payload);  // ← ADD
 *   } else if (resource === "consumables-update") {
 *     result = ConsumablesUpdateController.handle(action, payload);  // ← ADD
 *   } else if (resource === "waste-log") {
 *     result = WasteLogController.handle(action, payload);  // ← ADD
 *   } else if (resource === "fumigation-log") {
 *     result = FumigationLogController.handle(action, payload);  // ← ADD
 *   } else if (resource === "deep-cleaning-log") {
 *     result = DeepCleaningLogController.handle(action, payload);  // ← ADD
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
