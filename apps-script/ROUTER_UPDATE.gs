/**
 * ROUTER_UPDATE.gs
 *
 * Paste / merge into your existing doPost router.
 *
 * function doPost(e) {
 *   var body = {};
 *   try {
 *     body = JSON.parse(e.postData.contents || "{}");
 *   } catch (err) {
 *     body = {};
 *   }
 *
 *   var resource = body.resource || body.module || "";
 *   var action = body.action || "getAll";
 *   var payload = body.payload || {};
 *
 *   var result;
 *
 *   if (resource === "users") {
 *     result = UsersController.handle(action, payload);
 *   } else if (resource === "facilities") {
 *     result = FacilitiesController.handle(action, payload);
 *   } else if (resource === "assets") {
 *     result = AssetsController.handle(action, payload);
 *   } else if (resource === "work-orders") {
 *     result = WorkOrdersController.handle(action, payload);   // ← ADD THIS
 *   } else {
 *     result = jsonResponse_(false, "Unknown module: " + resource, null);
 *   }
 *
 *   // If Users already returns TextOutput from jsonResponse_, return result directly.
 *   // Otherwise wrap with ContentService as your existing Users router does.
 *   return result;
 * }
 *
 * DEPLOY (Work Orders):
 * 1. Add WorkOrdersController.gs, WorkOrderService.gs, WorkOrderRepository.gs
 * 2. Create sheet WORK_ORDERS with headers (see WorkOrders.sheet.seed.md)
 * 3. Update router as above
 * 4. Deploy → New version of the Web App
 */

function __routerSnippetDocs() {
  // This file is documentation only — not executed.
}
