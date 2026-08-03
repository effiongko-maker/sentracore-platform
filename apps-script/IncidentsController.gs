/**
 * IncidentsController.gs
 *
 * Entry for module/resource === "incidents".
 * Follows UsersController / WorkOrdersController architecture exactly.
 *
 * Uses shared jsonResponse_() — same helper as UsersController.
 */

var IncidentsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Incidents retrieved.",
            IncidentService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Incident retrieved.",
            IncidentService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Incident created.",
            IncidentService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Incident updated.",
            IncidentService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Incident deactivated.",
            IncidentService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown incidents action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Incidents request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
