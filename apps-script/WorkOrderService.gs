/**
 * WorkOrderService.gs
 *
 * Business rules for Work Orders. Mirrors FacilityService.gs / AssetService.gs.
 * Never talks to the spreadsheet directly — only WorkOrderRepository.
 */

var WorkOrderService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var priority = payload.priority;
    var facilityId = payload.facilityId;
    var assignedToUserId = payload.assignedToUserId;
    var type = payload.type;

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
        String(row.workInstructions || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assetId || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesPriority =
        !priority ||
        priority === "all" ||
        String(row.priority).toLowerCase() === String(priority).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesAssignee =
        !assignedToUserId ||
        assignedToUserId === "all" ||
        String(row.assignedToUserId) === String(assignedToUserId);

      var matchesType =
        !type ||
        type === "all" ||
        String(row.type).toLowerCase() === String(type).toLowerCase();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesFacility &&
        matchesAssignee &&
        matchesType
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
    var rows = WorkOrderRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Work order id is required.");
    var workOrder = WorkOrderRepository.getById(id);
    if (!workOrder) throw new Error("Work order " + id + " not found.");
    return workOrder;
  }

  function create(payload) {
    if (!payload || !payload.title) throw new Error("Work order title is required.");
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = WorkOrderRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Work order id is required.");
    var updated = WorkOrderRepository.update(payload.id, payload);
    if (!updated) throw new Error("Work order " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Work order id is required.");
    var updated = WorkOrderRepository.deactivate(payload.id);
    if (!updated) throw new Error("Work order " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
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
