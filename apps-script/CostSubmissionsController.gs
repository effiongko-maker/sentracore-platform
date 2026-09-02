/**
 * CostSubmissionsController.gs
 *
 * Entry for module/resource === "cost-submissions".
 */

var CostSubmissionsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Cost submissions retrieved.",
            CostSubmissionService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Cost submission retrieved.",
            CostSubmissionService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Cost submission created.",
            CostSubmissionService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Cost submission updated.",
            CostSubmissionService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown cost-submissions action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Cost submissions request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
