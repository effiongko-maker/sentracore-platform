/**
 * WasteLogController.gs
 *
 * Entry for module/resource === "waste-log".
 * Follows EnergyReadingController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "waste-log",
 *   action: "getAll" | "getById" | "create" | "update",
 *   payload: { ... }
 * }
 */

var WasteLogController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Waste logs retrieved.",
            WasteLogService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Waste log retrieved.",
            WasteLogService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Waste log created.",
            WasteLogService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Waste log updated.",
            WasteLogService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown waste-log action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Waste log request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
