/**
 * ReimbursementAuthorizationService.gs
 *
 * Business rules for reimbursement authorization of CostSubmission claims.
 * Distinct from Work Order client authorisation (Approvals).
 */

var ReimbursementAuthorizationService = (function () {
  function validateAuthorizationShape_(authorization, context) {
    authorization = authorization || {};
    var errors = [];

    if (context === "update") {
      if (
        !authorization.authorizationId ||
        !String(authorization.authorizationId).trim()
      ) {
        errors.push("authorizationId is required");
      } else if (
        !/^AUTH-\d{4}-\d{6}$/i.test(String(authorization.authorizationId))
      ) {
        errors.push("authorizationId must match AUTH-YYYY-NNNNNN format");
      }
    }

    if (!authorization.submissionId || !String(authorization.submissionId).trim()) {
      errors.push("submissionId is required");
    } else if (!/^SUB-\d{4}-\d{6}$/i.test(String(authorization.submissionId))) {
      errors.push("submissionId must match SUB-YYYY-NNNNNN format");
    }

    if (
      authorization.authorizedAmount == null ||
      authorization.authorizedAmount === "" ||
      !isFinite(Number(authorization.authorizedAmount)) ||
      Number(authorization.authorizedAmount) <= 0
    ) {
      errors.push("authorizedAmount must be a positive number");
    }

    if (!authorization.currency || !String(authorization.currency).trim()) {
      errors.push("currency is required");
    }
    if (!authorization.authorizedAt || !String(authorization.authorizedAt).trim()) {
      errors.push("authorizedAt is required");
    }
    if (!authorization.authorizedBy || !String(authorization.authorizedBy).trim()) {
      errors.push("authorizedBy is required");
    }
    if (!authorization.recordedAt || !String(authorization.recordedAt).trim()) {
      errors.push("recordedAt is required");
    }

    if (errors.length) {
      throw new Error(
        "Invalid reimbursement authorization: " + errors.join("; ")
      );
    }
  }

  function assertSubmissionAuthorizable_(submissionId) {
    if (typeof CostSubmissionRepository === "undefined") {
      throw new Error("CostSubmissionRepository is unavailable");
    }
    var submission = CostSubmissionRepository.getById(submissionId);
    if (!submission) {
      throw new Error("CostSubmission not found: " + submissionId);
    }
    var status = String(submission.status || "").toLowerCase();
    if (status !== "submitted") {
      throw new Error(
        "Only submitted claims can be authorized (queried claims must be resubmitted first)"
      );
    }
    return submission;
  }

  function sumReceivedForSubmission_(submissionId) {
    if (typeof ReimbursementPaymentRepository === "undefined") {
      throw new Error("ReimbursementPaymentRepository is unavailable");
    }
    var rows = ReimbursementPaymentRepository.listAllBySubmissionId(submissionId);
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      total += Number(rows[i].receivedAmount) || 0;
    }
    return total;
  }

  function assertAuthorizationNotBelowReceived_(submissionId, authorizedAmount) {
    var paid = sumReceivedForSubmission_(submissionId);
    var nextAuthorizedAmount = Number(authorizedAmount);
    if (nextAuthorizedAmount < paid) {
      throw new Error(
        "Authorized amount cannot be lower than received payments (received " +
          paid +
          ", attempted " +
          nextAuthorizedAmount +
          ")"
      );
    }
  }

  function getAll(payload) {
    return ReimbursementAuthorizationRepository.getAll(payload || {});
  }

  function getById(payload) {
    payload = payload || {};
    return ReimbursementAuthorizationRepository.getById(payload.authorizationId);
  }

  function getBySubmissionId(payload) {
    payload = payload || {};
    var submissionId = String(payload.submissionId || "").trim();
    if (!submissionId) throw new Error("submissionId is required");
    return ReimbursementAuthorizationRepository.getBySubmissionId(submissionId);
  }

  function create(payload) {
    payload = payload || {};
    var now = new Date().toISOString();
    var submissionId = String(payload.submissionId || "").trim();
    var submission = assertSubmissionAuthorizable_(submissionId);
    var existing =
      ReimbursementAuthorizationRepository.getBySubmissionId(submissionId);
    if (existing) {
      throw new Error(
        "Claim already authorized (" +
          existing.authorizationId +
          "). Update the existing authorization instead."
      );
    }

    var authorizedAmount =
      payload.authorizedAmount != null
        ? payload.authorizedAmount
        : submission.claimAmount;
    var draft = {
      submissionId: submissionId,
      authorizedAmount: authorizedAmount,
      currency: payload.currency || submission.currency || "NGN",
      authorizedAt: payload.authorizedAt || now,
      authorizedBy: payload.authorizedBy,
      authorityReference: payload.authorityReference,
      notes: payload.notes,
      recordedAt: payload.recordedAt || now,
    };
    validateAuthorizationShape_(draft, "create");
    var created = ReimbursementAuthorizationRepository.create(draft);
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyDomainChanged
    ) {
      ReportingSnapshotService.notifyDomainChanged(
        "reimbursement-authorizations"
      );
    }
    return created;
  }

  function update(payload) {
    payload = payload || {};
    var authorizationId = String(payload.authorizationId || "").trim();
    if (!authorizationId) throw new Error("authorizationId is required");
    var current =
      ReimbursementAuthorizationRepository.getById(authorizationId);
    if (!current) {
      throw new Error("Authorization not found: " + authorizationId);
    }
    assertSubmissionAuthorizable_(
      String(
        payload.submissionId != null
          ? payload.submissionId
          : current.submissionId
      ).trim()
    );
    var merged = {
      authorizationId: current.authorizationId,
      submissionId:
        payload.submissionId != null
          ? payload.submissionId
          : current.submissionId,
      authorizedAmount:
        payload.authorizedAmount !== undefined
          ? payload.authorizedAmount
          : current.authorizedAmount,
      currency:
        payload.currency != null ? payload.currency : current.currency,
      authorizedAt:
        payload.authorizedAt != null
          ? payload.authorizedAt
          : current.authorizedAt,
      authorizedBy:
        payload.authorizedBy != null
          ? payload.authorizedBy
          : current.authorizedBy,
      authorityReference:
        payload.authorityReference !== undefined
          ? payload.authorityReference
          : current.authorityReference,
      notes: payload.notes !== undefined ? payload.notes : current.notes,
      recordedAt: current.recordedAt,
    };
    validateAuthorizationShape_(merged, "update");
    assertAuthorizationNotBelowReceived_(
      String(merged.submissionId || "").trim(),
      merged.authorizedAmount
    );
    var updated = ReimbursementAuthorizationRepository.update(
      authorizationId,
      payload
    );
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyDomainChanged
    ) {
      ReportingSnapshotService.notifyDomainChanged(
        "reimbursement-authorizations"
      );
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    getBySubmissionId: getBySubmissionId,
    create: create,
    update: update,
  };
})();
