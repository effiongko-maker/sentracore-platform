/**
 * CostSubmissionService.gs
 *
 * Business rules for CostSubmission persistence.
 * Never talks to the spreadsheet directly — only CostSubmissionRepository.
 */

var CostSubmissionService = (function () {
  var VALID_STATUSES = {
    draft: true,
    submitted: true,
    queried: true,
    cancelled: true,
  };

  function normalizeStatus_(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function readCostRecordIds_(payload) {
    payload = payload || {};
    if (payload.costRecordIds != null) {
      if (Object.prototype.toString.call(payload.costRecordIds) === "[object Array]") {
        return payload.costRecordIds;
      }
      return SheetFieldUtils.parseIdList(payload.costRecordIds);
    }
    if (payload.costRecordId) {
      return [String(payload.costRecordId).trim()];
    }
    return [];
  }

  function validateSubmissionShape_(submission, context) {
    submission = submission || {};
    var errors = [];

    if (context === "update") {
      if (
        !submission.submissionId ||
        !String(submission.submissionId).trim()
      ) {
        errors.push("submissionId is required");
      } else if (
        !/^SUB-\d{4}-\d{6}$/i.test(String(submission.submissionId))
      ) {
        errors.push("submissionId must match SUB-YYYY-NNNNNN format");
      }
    }

    var status = normalizeStatus_(submission.status);
    if (!VALID_STATUSES[status]) {
      errors.push("status must be draft, submitted, queried, or cancelled");
    }

    if (!submission.createdAt || !String(submission.createdAt).trim()) {
      errors.push("createdAt is required");
    }
    if (!submission.createdBy || !String(submission.createdBy).trim()) {
      errors.push("createdBy is required");
    }
    if (!submission.currency || !String(submission.currency).trim()) {
      errors.push("currency is required");
    }

    var costRecordIds = submission.costRecordIds || [];
    if (
      (status === "submitted" || status === "queried") &&
      costRecordIds.length === 0
    ) {
      errors.push(
        "at least one CostRecord reference is required when status is submitted or queried"
      );
    }

    if (
      submission.claimAmount != null &&
      submission.claimAmount !== "" &&
      Number(submission.claimAmount) < 0
    ) {
      errors.push("claimAmount must be a non-negative number when supplied");
    }

    if (submission.markup) {
      if (
        submission.markup.markupAmount != null &&
        Number(submission.markup.markupAmount) < 0
      ) {
        errors.push("markup.markupAmount must be non-negative when supplied");
      }
      if (
        submission.markup.markupRatePercent != null &&
        Number(submission.markup.markupRatePercent) < 0
      ) {
        errors.push(
          "markup.markupRatePercent must be non-negative when supplied"
        );
      }
    }

    if (status === "submitted" || status === "queried") {
      if (!submission.submittedAt || !String(submission.submittedAt).trim()) {
        errors.push("submittedAt is required when status is submitted or queried");
      }
      if (!submission.submittedBy || !String(submission.submittedBy).trim()) {
        errors.push("submittedBy is required when status is submitted or queried");
      }
    }

    if (status === "queried") {
      if (!submission.queriedAt || !String(submission.queriedAt).trim()) {
        errors.push("queriedAt is required when status is queried");
      }
    }

    if (errors.length) {
      throw new Error(errors.join("; "));
    }
  }

  function validateCreatePayload_(payload) {
    payload = payload || {};
    if (!payload.createdBy || !String(payload.createdBy).trim()) {
      throw new Error("Created by is required.");
    }
    if (!payload.currency || !String(payload.currency).trim()) {
      throw new Error("Currency is required.");
    }
    var status = normalizeStatus_(payload.status || "draft");
    if (!VALID_STATUSES[status]) {
      throw new Error("Invalid submission status: " + payload.status);
    }

    validateSubmissionShape_(
      {
        status: status,
        currency: payload.currency,
        createdAt: payload.createdAt || new Date().toISOString(),
        createdBy: payload.createdBy,
        costRecordIds: readCostRecordIds_(payload),
        claimAmount: payload.claimAmount,
        markup: payload.markup,
        submittedAt: payload.submittedAt,
        submittedBy: payload.submittedBy,
        queriedAt: payload.queriedAt,
      },
      "create"
    );
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var facilityId = payload.facilityId;
    var status = payload.status;
    var approvalId = payload.approvalId;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.submissionId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.periodLabel || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.submissionKind || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        (row.costRecordIds || []).join(",").toLowerCase().indexOf(search) !== -1;

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId || "") === String(facilityId);

      var matchesStatus =
        !status || status === "all" || String(row.status) === String(status);

      var matchesApproval =
        !approvalId || String(row.approvalId || "") === String(approvalId);

      return (
        matchesSearch && matchesFacility && matchesStatus && matchesApproval
      );
    });
  }

  function paginate_(rows, payload) {
    payload = payload || {};
    var page = Number(payload.page || 1);
    var pageSize = Number(payload.pageSize || 8);
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 8;

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / pageSize));
    var start = (page - 1) * pageSize;
    var data = rows.slice(start, start + pageSize);

    return {
      data: data,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
    };
  }

  function sortNewestFirst_(rows) {
    return rows.slice().sort(function (a, b) {
      var aAt = String(a.createdAt || "");
      var bAt = String(b.createdAt || "");
      if (aAt === bAt) {
        return String(a.submissionId || "").localeCompare(
          String(b.submissionId || "")
        );
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return CostSubmissionRepository.getAll(auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = CostSubmissionRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var submissionId =
      payload && (payload.submissionId || payload.id);
    if (!submissionId) throw new Error("Submission id is required.");
    var row = CostSubmissionRepository.getById(submissionId);
    if (!row) throw new Error("Cost submission " + submissionId + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    validateCreatePayload_(payload);
    var created = CostSubmissionRepository.create(payload);
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyModuleChanged
    ) {
      ReportingSnapshotService.notifyModuleChanged("cost-submissions");
    }
    return created;
  }

  function update(payload) {
    payload = payload || {};
    var submissionId = payload.submissionId || payload.id;
    if (!submissionId) throw new Error("Submission id is required.");

    var existing = CostSubmissionRepository.getById(submissionId);
    if (!existing) {
      throw new Error("Cost submission " + submissionId + " not found.");
    }

    var nextStatus =
      payload.status != null
        ? normalizeStatus_(payload.status)
        : normalizeStatus_(existing.status);
    var fromStatus = normalizeStatus_(existing.status);
    if (fromStatus !== nextStatus) {
      var allowed = {
        draft: { submitted: true, cancelled: true },
        submitted: { queried: true, cancelled: true },
        queried: { submitted: true, cancelled: true },
        cancelled: {},
      };
      if (!allowed[fromStatus] || !allowed[fromStatus][nextStatus]) {
        throw new Error(
          "Invalid submission lifecycle transition: " +
            fromStatus +
            " → " +
            nextStatus
        );
      }
    }

    var merged = {
      submissionId: existing.submissionId,
      status: payload.status != null ? payload.status : existing.status,
      currency: payload.currency != null ? payload.currency : existing.currency,
      createdAt: existing.createdAt,
      createdBy: payload.createdBy != null ? payload.createdBy : existing.createdBy,
      costRecordIds:
        payload.costRecordIds != null || payload.costRecordId != null
          ? readCostRecordIds_(payload)
          : existing.costRecordIds,
      claimAmount:
        payload.claimAmount !== undefined
          ? payload.claimAmount
          : existing.claimAmount,
      markup: payload.markup != null ? payload.markup : existing.markup,
      facilityId:
        payload.facilityId !== undefined
          ? payload.facilityId
          : existing.facilityId,
      departmentId:
        payload.departmentId !== undefined
          ? payload.departmentId
          : existing.departmentId,
      periodLabel:
        payload.periodLabel !== undefined
          ? payload.periodLabel
          : existing.periodLabel,
      submissionKind:
        payload.submissionKind !== undefined
          ? payload.submissionKind
          : existing.submissionKind,
      submissionPackage:
        payload.submissionPackage != null
          ? payload.submissionPackage
          : existing.submissionPackage,
      refs: payload.refs != null ? payload.refs : existing.refs,
      executionKind:
        payload.executionKind !== undefined
          ? payload.executionKind
          : existing.executionKind,
      executionId:
        payload.executionId !== undefined
          ? payload.executionId
          : existing.executionId,
      approvalId:
        payload.approvalId !== undefined
          ? payload.approvalId
          : existing.approvalId,
      submittedAt:
        payload.submittedAt !== undefined
          ? payload.submittedAt
          : existing.submittedAt,
      submittedBy:
        payload.submittedBy !== undefined
          ? payload.submittedBy
          : existing.submittedBy,
      queriedAt:
        payload.queriedAt !== undefined ? payload.queriedAt : existing.queriedAt,
      queryNotes:
        payload.queryNotes !== undefined
          ? payload.queryNotes
          : existing.queryNotes,
      notes: payload.notes !== undefined ? payload.notes : existing.notes,
    };

    validateSubmissionShape_(merged, "update");
    var updated = CostSubmissionRepository.update(submissionId, payload);
    if (!updated) throw new Error("Cost submission " + submissionId + " not found.");
    if (
      typeof ReportingSnapshotService !== "undefined" &&
      ReportingSnapshotService.notifyModuleChanged
    ) {
      ReportingSnapshotService.notifyModuleChanged("cost-submissions");
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
