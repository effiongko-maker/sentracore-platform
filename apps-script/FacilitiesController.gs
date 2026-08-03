/**
 * FacilitiesController.gs
 *
 * Entry for module/resource === "facilities".
 * Follows UsersController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "facilities",
 *   action: "getAll" | "getById" | "create" | "update" | "deactivate",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var FacilitiesController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Facilities retrieved.",
            FacilityService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Facility retrieved.",
            FacilityService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Facility created.",
            FacilityService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Facility updated.",
            FacilityService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Facility deactivated.",
            FacilityService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown facilities action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Facilities request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
