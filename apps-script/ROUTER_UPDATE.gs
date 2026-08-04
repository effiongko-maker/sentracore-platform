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
 *     result = MaintenanceController.handle(action, payload);   // ← ADD THIS
 *   } else {
 *     result = jsonResponse_(false, "Unknown module: " + resource, null);
 *   }
 *
 * DEPLOY (Maintenance):
 * 1. Add MaintenanceController.gs, MaintenanceService.gs, MaintenanceRepository.gs
 * 2. Ensure existing Maintenance sheet is present (do not redesign)
 * 3. Update router as above
 * 4. Deploy → New version of the Web App
 */

function __routerSnippetDocs() {
  // This file is documentation only — not executed.
}
