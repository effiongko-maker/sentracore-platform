/**
 * RequestsController.gs
 *
 * Entry for module/resource === "requests".
 * Follows IncidentsController / WorkOrdersController architecture.
 */

var RequestsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Requests retrieved.",
            RequestService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Request retrieved.",
            RequestService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Request created.",
            RequestService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Request updated.",
            RequestService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Request deactivated.",
            RequestService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown requests action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Requests request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
