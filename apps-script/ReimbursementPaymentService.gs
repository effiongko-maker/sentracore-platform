/**
 * ReimbursementPaymentService.gs
 *
 * Business rules for reimbursement payment receipts against CostSubmission.
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
    assertSubmissionExists_(String(draft.submissionId).trim());
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
    assertSubmissionExists_(String(merged.submissionId).trim());
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
