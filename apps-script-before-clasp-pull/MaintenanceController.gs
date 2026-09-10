/**
 * MaintenanceController.gs
 *
 * Entry for module/resource === "maintenance".
 * Follows UsersController / IncidentsController architecture exactly.
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var MaintenanceController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Maintenance retrieved.",
            MaintenanceService.getAll(payload)
          );

        case "listCatalog":
          return jsonResponse_(
            true,
            "Maintenance catalog retrieved.",
            MaintenanceService.listCatalog(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Maintenance retrieved.",
            MaintenanceService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Maintenance created.",
            MaintenanceService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Maintenance updated.",
            MaintenanceService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Maintenance deactivated.",
            MaintenanceService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown maintenance action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Maintenance request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
