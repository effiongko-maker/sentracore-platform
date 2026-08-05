/**
 * IncidentService.gs
 *
 * Business rules for Incidents. Mirrors WorkOrderService.gs.
 * Never talks to the spreadsheet directly — only IncidentRepository.
 */

var IncidentService = (function () {
  function applyWorkOrderRule_(payload) {
    payload = payload || {};
    if (payload.requiresWorkOrder === false || payload.requiresWorkOrder === "false") {
      payload.requiresWorkOrder = false;
      payload.workOrderId = "";
    }
    return payload;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var severity = payload.severity;
    var status = payload.status;
    var facilityId = payload.facilityId;
    var assignedToUserId = payload.assignedToUserId;
    var requiresWorkOrder = payload.requiresWorkOrder;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.description || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesSeverity =
        !severity ||
        severity === "all" ||
        String(row.severity).toLowerCase() === String(severity).toLowerCase();

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesAssignee =
        !assignedToUserId ||
        assignedToUserId === "all" ||
        String(row.assignedToUserId) === String(assignedToUserId);

      var matchesRequiresWo = true;
      if (requiresWorkOrder !== undefined && requiresWorkOrder !== "all") {
        var flag =
          row.requiresWorkOrder === true ||
          row.requiresWorkOrder === "true" ||
          row.requiresWorkOrder === 1;
        var wanted =
          requiresWorkOrder === true ||
          requiresWorkOrder === "true" ||
          requiresWorkOrder === 1;
        matchesRequiresWo = flag === wanted;
      }

      return (
        matchesSearch &&
        matchesSeverity &&
        matchesStatus &&
        matchesFacility &&
        matchesAssignee &&
        matchesRequiresWo
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
      var aAt = String(a.createdAt || a.reportedAt || a.updatedAt || "");
      var bAt = String(b.createdAt || b.reportedAt || b.updatedAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function getAll(payload) {
    var rows = IncidentRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Incident id is required.");
    var incident = IncidentRepository.getById(id);
    if (!incident) throw new Error("Incident " + id + " not found.");
    return incident;
  }

  function create(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.title) throw new Error("Incident title is required.");
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = IncidentRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    return created;
  }

  function update(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.id) throw new Error("Incident id is required.");
    var updated = IncidentRepository.update(payload.id, payload);
    if (!updated) throw new Error("Incident " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Incident id is required.");
    var updated = IncidentRepository.deactivate(payload.id);
    if (!updated) throw new Error("Incident " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("incidents");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
