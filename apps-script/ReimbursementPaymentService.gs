/**
 * ReimbursementPaymentService.gs
 *
 * Business rules for reimbursement payment receipts against CostSubmission.
 * Cumulative receipts must never exceed authorizedAmount.
 */

var ReimbursementPaymentService = (function () {
  function validatePaymentShape_(payment, context) {
    payment = payment || {};
    var errors = [];

    if (context === "update") {
      if (!payment.paymentId || !String(payment.paymentId).trim()) {
        errors.push("paymentId is required");
      } else if (!/^PAY-\d{4}-\d{6}$/i.test(String(payment.paymentId))) {
        errors.push("paymentId must match PAY-YYYY-NNNNNN format");
      }
    }

    if (!payment.submissionId || !String(payment.submissionId).trim()) {
      errors.push("submissionId is required");
    } else if (!/^SUB-\d{4}-\d{6}$/i.test(String(payment.submissionId))) {
      errors.push("submissionId must match SUB-YYYY-NNNNNN format");
    }

    if (
      payment.receivedAmount == null ||
      payment.receivedAmount === "" ||
      !isFinite(Number(payment.receivedAmount)) ||
      Number(payment.receivedAmount) <= 0
    ) {
      errors.push("receivedAmount must be a positive number");
    }

    if (!payment.currency || !String(payment.currency).trim()) {
      errors.push("currency is required");
    }
    if (!payment.receivedAt || !String(payment.receivedAt).trim()) {
      errors.push("receivedAt is required");
    }
    if (!payment.recordedAt || !String(payment.recordedAt).trim()) {
      errors.push("recordedAt is required");
    }
    if (!payment.recordedBy || !String(payment.recordedBy).trim()) {
      errors.push("recordedBy is required");
    }

    if (errors.length) {
      throw new Error("Invalid reimbursement payment: " + errors.join("; "));
    }
  }

  function requireAuthorization_(submissionId) {
    if (typeof ReimbursementAuthorizationRepository === "undefined") {
      throw new Error("ReimbursementAuthorizationRepository is unavailable");
    }
    var authorization =
      ReimbursementAuthorizationRepository.getBySubmissionId(submissionId);
    if (!authorization) {
      throw new Error(
        "Authorize this claim before recording payment receipts"
      );
    }
    var authorizedAmount = Number(authorization.authorizedAmount);
    if (!isFinite(authorizedAmount) || authorizedAmount <= 0) {
      throw new Error("Authorization has no valid authorizedAmount");
    }
    return authorization;
  }

  function sumExistingPayments_(submissionId, excludePaymentId) {
    var rows = ReimbursementPaymentRepository.listAllBySubmissionId(
      submissionId
    );
    var paid = 0;
    var exclude = excludePaymentId ? String(excludePaymentId).trim() : "";
    for (var i = 0; i < rows.length; i++) {
      if (exclude && String(rows[i].paymentId || "") === exclude) continue;
      paid += Number(rows[i].receivedAmount) || 0;
    }
    return paid;
  }

  /**
   * Source of truth: existing payments + incoming amount must not exceed
   * authorizedAmount. Exact outstanding payment is allowed.
   */
  function assertWithinAuthorizedAmount_(
    submissionId,
    incomingAmount,
    excludePaymentId
  ) {
    var authorization = requireAuthorization_(submissionId);
    var authorizedAmount = Number(authorization.authorizedAmount);
    var alreadyPaid = sumExistingPayments_(submissionId, excludePaymentId);
    var incoming = Number(incomingAmount);
    var outstanding = authorizedAmount - alreadyPaid;
    var nextTotal = alreadyPaid + incoming;

    if (!isFinite(incoming) || incoming <= 0) {
      throw new Error("receivedAmount must be a positive number");
    }
    if (nextTotal > authorizedAmount) {
      throw new Error(
        "Payment exceeds outstanding authorized amount (outstanding " +
          Math.max(0, outstanding) +
          ", attempted " +
          incoming +
          ")"
      );
    }
  }

  function assertSubmissionExists_(submissionId) {
    if (typeof CostSubmissionRepository === "undefined") {
      throw new Error("CostSubmissionRepository is unavailable");
    }
    var submission = CostSubmissionRepository.getById(submissionId);
    if (!submission) {
      throw new Error("CostSubmission not found: " + submissionId);
    }
    var status = String(submission.status || "").toLowerCase();
    if (status !== "submitted" && status !== "queried") {
      throw new Error(
        "Payments can only be recorded against submitted or queried submissions"
      );
    }
    requireAuthorization_(submissionId);
    return submission;
  }

  function getAll(payload) {
    return ReimbursementPaymentRepository.getAll(payload || {});
  }

  function getById(payload) {
    payload = payload || {};
    return ReimbursementPaymentRepository.getById(payload.paymentId);
  }

  function create(payload) {
    payload = payload || {};
    var now = new Date().toISOString();
    var draft = {
      submissionId: payload.submissionId,
      receivedAmount: payload.receivedAmount,
      currency: payload.currency || "NGN",
      receivedAt: payload.receivedAt || now,
      reference: payload.reference,
      method: payload.method,
      evidenceReference: payload.evidenceReference,
      notes: payload.notes,
      recordedAt: payload.recordedAt || now,
      recordedBy: payload.recordedBy,
    };
    validatePaymentShape_(draft, "create");
    var submissionId = String(draft.submissionId).trim();
    assertSubmissionExists_(submissionId);
    assertWithinAuthorizedAmount_(
      submissionId,
      draft.receivedAmount,
      null
    );
    var created = ReimbursementPaymentRepository.create(draft);
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyDomainChanged
    ) {
      ReportingSnapshotService.notifyDomainChanged("reimbursement-payments");
    }
    return created;
  }

  function update(payload) {
    payload = payload || {};
    var paymentId = String(payload.paymentId || "").trim();
    if (!paymentId) throw new Error("paymentId is required");
    var current = ReimbursementPaymentRepository.getById(paymentId);
    if (!current) throw new Error("Payment not found: " + paymentId);
    var merged = {
      paymentId: current.paymentId,
      submissionId:
        payload.submissionId != null
          ? payload.submissionId
          : current.submissionId,
      receivedAmount:
        payload.receivedAmount !== undefined
          ? payload.receivedAmount
          : current.receivedAmount,
      currency:
        payload.currency != null ? payload.currency : current.currency,
      receivedAt:
        payload.receivedAt != null ? payload.receivedAt : current.receivedAt,
      reference:
        payload.reference !== undefined ? payload.reference : current.reference,
      method: payload.method !== undefined ? payload.method : current.method,
      evidenceReference:
        payload.evidenceReference !== undefined
          ? payload.evidenceReference
          : current.evidenceReference,
      notes: payload.notes !== undefined ? payload.notes : current.notes,
      recordedAt: current.recordedAt,
      recordedBy:
        payload.recordedBy != null ? payload.recordedBy : current.recordedBy,
    };
    validatePaymentShape_(merged, "update");
    var submissionId = String(merged.submissionId).trim();
    assertSubmissionExists_(submissionId);
    assertWithinAuthorizedAmount_(
      submissionId,
      merged.receivedAmount,
      paymentId
    );
    var updated = ReimbursementPaymentRepository.update(paymentId, payload);
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyDomainChanged
    ) {
      ReportingSnapshotService.notifyDomainChanged("reimbursement-payments");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
