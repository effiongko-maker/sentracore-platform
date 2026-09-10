/**
 * ConsumablesUpdateController.gs
 *
 * Entry for module/resource === "consumables-update".
 * Follows DieselUsageController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "consumables-update",
 *   action: "getAll" | "getById" | "create" | "update",
 *   payload: { ... }
 * }
 */

var ConsumablesUpdateController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Consumables updates retrieved.",
            ConsumablesUpdateService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Consumables update retrieved.",
            ConsumablesUpdateService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Consumables update created.",
            ConsumablesUpdateService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Consumables update updated.",
            ConsumablesUpdateService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown consumables-update action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Consumables update request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
