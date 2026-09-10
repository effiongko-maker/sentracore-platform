/**
 * FumigationLogController.gs
 *
 * Entry for module/resource === "fumigation-log".
 *
 * Expected request body:
 * {
 *   resource: "fumigation-log",
 *   action: "getAll" | "getById" | "create" | "update",
 *   payload: { ... }
 * }
 */

var FumigationLogController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Fumigation logs retrieved.",
            FumigationLogService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Fumigation log retrieved.",
            FumigationLogService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Fumigation log created.",
            FumigationLogService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Fumigation log updated.",
            FumigationLogService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown fumigation-log action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Fumigation log request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
