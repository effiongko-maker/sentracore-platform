/**
 * DieselUsageController.gs
 *
 * Entry for module/resource === "diesel-usage".
 * Follows GeneratorLogController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "diesel-usage",
 *   action: "getAll" | "getById" | "create" | "update",
 *   payload: { ... }
 * }
 */

var DieselUsageController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Diesel usage entries retrieved.",
            DieselUsageService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Diesel usage entry retrieved.",
            DieselUsageService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Diesel usage entry created.",
            DieselUsageService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Diesel usage entry updated.",
            DieselUsageService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown diesel-usage action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Diesel usage request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
