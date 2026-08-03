/**
 * ROUTER_UPDATE.gs
 *
 * Paste / merge into your existing doPost router.
 *
 *   } else if (resource === "work-orders") {
 *     result = WorkOrdersController.handle(action, payload);
 *   } else if (resource === "incidents") {
 *     result = IncidentsController.handle(action, payload);   // ← ADD THIS
 *   } else {
 *     result = jsonResponse_(false, "Unknown module: " + resource, null);
 *   }
 *
 * DEPLOY (Incidents):
 * 1. Add IncidentsController.gs, IncidentService.gs, IncidentRepository.gs
 * 2. Ensure existing Incidents/Events sheet is present (do not redesign)
 * 3. Update router as above
 * 4. Deploy → New version of the Web App
 */

function __routerSnippetDocs() {
  // This file is documentation only — not executed.
}
