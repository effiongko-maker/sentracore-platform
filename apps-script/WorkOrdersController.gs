/**
 * WorkOrdersController.gs
 *
 * Entry for module/resource === "work-orders".
 * Follows UsersController / AssetsController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "work-orders",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var WorkOrdersController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Work orders retrieved.",
            WorkOrderService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Work order retrieved.",
            WorkOrderService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Work order created.",
            WorkOrderService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Work order updated.",
            WorkOrderService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Work order deactivated.",
            WorkOrderService.deactivate(payload)
          );

        case "getFilterCatalog":
          return jsonResponse_(
            true,
            "Work order filter catalog retrieved.",
            WorkOrderService.getFilterCatalog(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown work-orders action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Work orders request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
