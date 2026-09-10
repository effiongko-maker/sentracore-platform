/**
 * DeepCleaningLogController.gs
 *
 * Entry for module/resource === "deep-cleaning-log".
 *
 * Expected request body:
 * {
 *   resource: "deep-cleaning-log",
 *   action: "getAll" | "getById" | "create" | "update",
 *   payload: { ... }
 * }
 */

var DeepCleaningLogController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Deep cleaning logs retrieved.",
            DeepCleaningLogService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Deep cleaning log retrieved.",
            DeepCleaningLogService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Deep cleaning log created.",
            DeepCleaningLogService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Deep cleaning log updated.",
            DeepCleaningLogService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown deep-cleaning-log action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Deep cleaning log request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
