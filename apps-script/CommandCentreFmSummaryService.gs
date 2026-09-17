/**
 * Versioned, count-only FM contracts for Command Centre.
 * TypeScript owns the canonical predicates; this is the verified data-source mirror.
 */
var CommandCentreFmSummaryService = (function () {
  var OPERATIONAL_PICTURE_VERSION = "operational-picture.v1";
  var ASSIGNMENT_SUMMARY_VERSION = "assignment-summary.v1";

  var ACTIVE_MAINTENANCE = {
    requested: true,
    triaged: true,
    scheduled: true,
    in_progress: true,
    on_hold: true,
  };
  var ASSIGNED_WORK_ORDERS = {
    open: true,
    assigned: true,
    in_progress: true,
    on_hold: true,
  };
  var ACTIVE_INCIDENTS = {
    reported: true,
    triaged: true,
    investigating: true,
    contained: true,
  };
  var AWAITING_APPROVAL = {
    awaiting_decision: true,
    awaiting_submission: true,
    submitted: true,
    awaiting_response: true,
    returned: true,
  };

  function token_(value) {
    return String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  function dayKey_(value) {
    if (value == null || value === "") return null;
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function requireAsOf_(payload) {
    var asOf = String((payload && payload.asOf) || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(asOf)) {
      throw new Error("asOf must be an ISO-8601 UTC timestamp.");
    }
    if (!dayKey_(asOf)) throw new Error("asOf is invalid.");
    return asOf;
  }

  function isOverdue_(value, asOf) {
    var dueDay = dayKey_(value);
    return dueDay !== null && dueDay < dayKey_(asOf);
  }

  function hasNoWorkOrderLink_(row) {
    return (
      !!row.requiresWorkOrder &&
      !row.workOrderId &&
      !(row.workOrderIds && row.workOrderIds.length > 0)
    );
  }

  function summarizeMaintenance_(rows, asOf) {
    var result = { state: "healthy", critical: 0, inProgress: 0, awaitingAction: 0, overdue: 0 };
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i] || {};
      var status = token_(row.status);
      if (!ACTIVE_MAINTENANCE[status]) continue;
      var priority = token_(row.priority);
      if (priority === "high" || priority === "critical") result.critical++;
      if (status === "in_progress") result.inProgress++;
      if (status === "on_hold" || hasNoWorkOrderLink_(row)) result.awaitingAction++;
      if (isOverdue_(row.dueAt, asOf)) result.overdue++;
    }
    return result;
  }

  function summarizeWorkOrders_(rows, asOf) {
    var result = { state: "healthy", awaitingAction: 0, overdue: 0 };
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i] || {};
      var status = token_(row.status);
      if (!ASSIGNED_WORK_ORDERS[status]) continue;
      if (status === "on_hold") result.awaitingAction++;
      if (isOverdue_(row.dueAt || row.slaDueAt, asOf)) result.overdue++;
    }
    return result;
  }

  function summarizeApprovals_(rows) {
    var result = { state: "healthy", awaitingAction: 0 };
    for (var i = 0; i < (rows || []).length; i++) {
      if (AWAITING_APPROVAL[token_((rows[i] || {}).status)]) result.awaitingAction++;
    }
    return result;
  }

  function unavailable_() {
    return { state: "unavailable" };
  }

  function safeSummary_(load, summarize) {
    try {
      return summarize(load());
    } catch (error) {
      return unavailable_();
    }
  }

  function getOperationalPicture(payload) {
    var asOf = requireAsOf_(payload);
    return {
      contractVersion: OPERATIONAL_PICTURE_VERSION,
      asOf: asOf,
      maintenance: safeSummary_(
        function () { return MaintenanceRepository.getAll(); },
        function (rows) { return summarizeMaintenance_(rows, asOf); }
      ),
      workOrders: safeSummary_(
        function () { return WorkOrderRepository.getAll(); },
        function (rows) { return summarizeWorkOrders_(rows, asOf); }
      ),
      approvals: safeSummary_(
        function () { return ApprovalRepository.getAll(); },
        summarizeApprovals_
      ),
    };
  }

  function countAssignments_(rows, operationalUserId, activeStatuses) {
    var count = 0;
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i] || {};
      if (
        String(row.assignedToUserId || "") === operationalUserId &&
        activeStatuses[token_(row.status)]
      ) count++;
    }
    return { state: "healthy", active: count };
  }

  function assignmentDomain_(load, operationalUserId, statuses) {
    return safeSummary_(load, function (rows) {
      return countAssignments_(rows, operationalUserId, statuses);
    });
  }

  function getAssignmentSummary(payload) {
    var operationalUserId = String(
      (payload && (payload.operationalUserId || payload.sheetUserId)) || ""
    ).trim();
    if (!/^USR-/.test(operationalUserId)) {
      throw new Error("operationalUserId must be a USR-* identity.");
    }
    return {
      contractVersion: ASSIGNMENT_SUMMARY_VERSION,
      operationalUserId: operationalUserId,
      maintenance: assignmentDomain_(
        function () { return MaintenanceRepository.getAll(); },
        operationalUserId,
        ACTIVE_MAINTENANCE
      ),
      workOrders: assignmentDomain_(
        function () { return WorkOrderRepository.getAll(); },
        operationalUserId,
        ASSIGNED_WORK_ORDERS
      ),
      incidents: assignmentDomain_(
        function () { return IncidentRepository.getAll(); },
        operationalUserId,
        ACTIVE_INCIDENTS
      ),
    };
  }

  return {
    OPERATIONAL_PICTURE_VERSION: OPERATIONAL_PICTURE_VERSION,
    ASSIGNMENT_SUMMARY_VERSION: ASSIGNMENT_SUMMARY_VERSION,
    getOperationalPicture: getOperationalPicture,
    getAssignmentSummary: getAssignmentSummary,
    summarizeMaintenanceForRows: summarizeMaintenance_,
    summarizeWorkOrdersForRows: summarizeWorkOrders_,
    summarizeApprovalsForRows: summarizeApprovals_,
    countAssignmentsForRows: countAssignments_,
  };
})();
