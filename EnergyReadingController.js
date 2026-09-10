/**
 * EnergyReadingController.gs
 *
 * Entry for module/resource === "energy-reading".
 * Follows GeneratorLogController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "energy-reading",
 *   action: "getAll" | "getById" | "create" | "update",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as FacilitiesController.
 */

var EnergyReadingController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Energy readings retrieved.",
            EnergyReadingService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Energy reading retrieved.",
            EnergyReadingService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Energy reading created.",
            EnergyReadingService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Energy reading updated.",
            EnergyReadingService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown energy-reading action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Energy reading request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
