/**
 * ApprovalService.gs
 *
 * Business rules for client Approval Requests linked to Work Orders.
 */

var ApprovalService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var type = payload.type;
    var facilityId = payload.facilityId;
    var workOrderId = payload.workOrderId;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.workOrderId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.reason || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.type || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesType =
        !type ||
        type === "all" ||
        String(row.type || "").toLowerCase() === String(type).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesWorkOrder =
        !workOrderId ||
        workOrderId === "all" ||
        String(row.workOrderId) === String(workOrderId);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesType &&
        matchesFacility &&
        matchesWorkOrder
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
      var aAt = String(a.updatedAt || a.createdAt || "");
      var bAt = String(b.updatedAt || b.createdAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function loadCanonicalRows_(payload, auditCollector) {
    payload = payload || {};
    if (typeof OperationalRegisterCache === "undefined") {
      return ApprovalRepository.getAll(auditCollector);
    }
    return OperationalRegisterCache.getCanonicalRows(
      OperationalRegisterCache.NAMESPACES.approvals,
      function (collector) {
        return ApprovalRepository.getAll(collector);
      },
      {
        skipCache: !!payload._skipCache,
        auditCollector: auditCollector,
      }
    );
  }

  function invalidateRegisterCache_() {
    if (typeof OperationalRegisterCache !== "undefined") {
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.approvals
      );
    }
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return loadCanonicalRows_(payload, auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = loadCanonicalRows_(payload, null);
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Approval id is required.");
    var row = ApprovalRepository.getById(id);
    if (!row) throw new Error("Approval " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    if (!payload.workOrderId) {
      throw new Error("Work order id is required for an approval request.");
    }
    if (!payload.title) {
      throw new Error("Approval title is required.");
    }
    var created = ApprovalRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("approvals");
    }
    invalidateRegisterCache_();
    return created;
  }

  function update(payload) {
    payload = payload || {};
    if (!payload.id) throw new Error("Approval id is required.");
    var updated = ApprovalRepository.update(payload.id, payload);
    if (!updated) throw new Error("Approval " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("approvals");
    }
    invalidateRegisterCache_();
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Approval id is required.");
    var updated = ApprovalRepository.deactivate(payload.id);
    if (!updated) throw new Error("Approval " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("approvals");
    }
    invalidateRegisterCache_();
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
