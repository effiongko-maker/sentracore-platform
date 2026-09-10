/**
 * GeneratorLogController.gs
 *
 * Entry for module/resource === "generator-log".
 * Follows FacilitiesController architecture exactly.
 *
 * Expected request body:
 * {
 *   resource: "generator-log",
 *   action: "getAll" | "getById" | "create" | "update",
 *   payload: { ... }
 * }
 *
 * Uses shared jsonResponse_() — same helper as FacilitiesController.
 */

var GeneratorLogController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Generator logs retrieved.",
            GeneratorLogService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Generator log retrieved.",
            GeneratorLogService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Generator log created.",
            GeneratorLogService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Generator log updated.",
            GeneratorLogService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown generator-log action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Generator log request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
