/**
 * ReimbursementAuthorizationsController.gs
 *
 * Entry for module/resource === "reimbursement-authorizations".
 */

var ReimbursementAuthorizationsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Reimbursement authorizations retrieved.",
            ReimbursementAuthorizationService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Reimbursement authorization retrieved.",
            ReimbursementAuthorizationService.getById(payload)
          );

        case "getBySubmissionId":
          return jsonResponse_(
            true,
            "Reimbursement authorization retrieved.",
            ReimbursementAuthorizationService.getBySubmissionId(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Reimbursement authorization recorded.",
            ReimbursementAuthorizationService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Reimbursement authorization updated.",
            ReimbursementAuthorizationService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown reimbursement-authorizations action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Reimbursement authorizations request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
