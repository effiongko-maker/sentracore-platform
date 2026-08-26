/**
 * ApprovalsController.gs
 *
 * Entry for module/resource === "approvals".
 */

var ApprovalsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Approvals retrieved.",
            ApprovalService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Approval retrieved.",
            ApprovalService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Approval created.",
            ApprovalService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Approval updated.",
            ApprovalService.update(payload)
          );

        case "deactivate":
          return jsonResponse_(
            true,
            "Approval cancelled.",
            ApprovalService.deactivate(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown approvals action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Approvals request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
