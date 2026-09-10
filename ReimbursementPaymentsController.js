/**
 * ReimbursementPaymentsController.gs
 *
 * Entry for module/resource === "reimbursement-payments".
 */

var ReimbursementPaymentsController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getAll")) {
        case "getAll":
          return jsonResponse_(
            true,
            "Reimbursement payments retrieved.",
            ReimbursementPaymentService.getAll(payload)
          );

        case "getById":
          return jsonResponse_(
            true,
            "Reimbursement payment retrieved.",
            ReimbursementPaymentService.getById(payload)
          );

        case "create":
          return jsonResponse_(
            true,
            "Reimbursement payment recorded.",
            ReimbursementPaymentService.create(payload)
          );

        case "update":
          return jsonResponse_(
            true,
            "Reimbursement payment updated.",
            ReimbursementPaymentService.update(payload)
          );

        default:
          return jsonResponse_(
            false,
            "Unknown reimbursement-payments action: " + action,
            null
          );
      }
    } catch (error) {
      return jsonResponse_(
        false,
        error.message || "Reimbursement payments request failed.",
        null
      );
    }
  }

  return {
    handle: handle,
  };
})();
