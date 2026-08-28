/**
 * MaintenanceService.gs
 *
 * Business rules for Maintenance. Mirrors IncidentService.gs.
 * Never talks to the spreadsheet directly — only MaintenanceRepository.
 */

var MaintenanceService = (function () {
  function applyWorkOrderRule_(payload) {
    payload = payload || {};
    if (
      payload.requiresWorkOrder === false ||
      payload.requiresWorkOrder === "false"
    ) {
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
    var priority = payload.priority;
    var status = payload.status;
    var type = payload.type;
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
          .indexOf(search) !== -1 ||
        String(row.department || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesPriority =
        !priority ||
        priority === "all" ||
        String(row.priority).toLowerCase() === String(priority).toLowerCase();

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesType =
        !type ||
        type === "all" ||
        String(row.type).toLowerCase() === String(type).toLowerCase();

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
        matchesPriority &&
        matchesStatus &&
        matchesType &&
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
      var aAt = String(a.updatedAt || a.createdAt || a.reportedAt || "");
      var bAt = String(b.updatedAt || b.createdAt || b.reportedAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function loadCanonicalRows_(payload, auditCollector) {
    payload = payload || {};
    if (typeof OperationalRegisterCache === "undefined") {
      return MaintenanceRepository.getAll(auditCollector);
    }
    return OperationalRegisterCache.getCanonicalRows(
      OperationalRegisterCache.NAMESPACES.maintenance,
      function (collector) {
        return MaintenanceRepository.getAll(collector);
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
        OperationalRegisterCache.NAMESPACES.maintenance
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

  function listCatalog(payload) {
    payload = payload || {};
    var tTotal0 = Date.now();
    var skipCache = !!payload._skipCache;
    var cacheHit = false;
    var cacheReadMs = 0;
    var sheetReadMs = 0;
    var rows = null;

    if (!skipCache && typeof CatalogCacheService !== "undefined") {
      var cached = CatalogCacheService.getMaintenanceCatalogRows();
      if (cached && cached.rows) {
        cacheHit = true;
        cacheReadMs = cached.cacheReadMs || 0;
        rows = cached.rows;
      }
    }

    if (!cacheHit) {
      var tSheet0 = Date.now();
      rows = MaintenanceRepository.listCatalog() || [];
      sheetReadMs = Date.now() - tSheet0;
      if (typeof CatalogCacheService !== "undefined") {
        CatalogCacheService.putMaintenanceCatalogRows(rows);
      }
    }

    var tProj0 = Date.now();
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var filtered = rows.filter(function (row) {
      if (!search) return true;
      return (
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.title || "")
          .toLowerCase()
          .indexOf(search) !== -1
      );
    });
    filtered.sort(function (a, b) {
      return String(a.title || a.id || "").localeCompare(
        String(b.title || b.id || "")
      );
    });
    var result = paginate_(filtered, payload);
    var projectionMs = Date.now() - tProj0;
    var totalServerMs = Date.now() - tTotal0;

    Logger.log(
      "[MaintenanceService.listCatalog] cacheHit=" +
        cacheHit +
        " sheetReadMs=" +
        sheetReadMs +
        " cacheReadMs=" +
        cacheReadMs +
        " totalServerMs=" +
        totalServerMs
    );

    if (payload._auditTiming) {
      result._cacheDiagnostics = {
        cacheHit: cacheHit,
        cacheReadMs: cacheReadMs,
        sheetReadMs: sheetReadMs,
        projectionMs: projectionMs,
        totalServerMs: totalServerMs,
      };
    }
    return result;
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Maintenance id is required.");
    var row = MaintenanceRepository.getById(id);
    if (!row) throw new Error("Maintenance " + id + " not found.");
    return row;
  }

  function create(payload) {
    var t0 = Date.now();
    payload = applyWorkOrderRule_(payload);
    if (!payload || (!payload.title && !payload.description)) {
      throw new Error("Maintenance title is required.");
    }
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var tValidated = Date.now();
    var created = MaintenanceRepository.create(payload);
    var tRepo = Date.now();
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateMaintenanceCatalog();
    }
    invalidateRegisterCache_();
    var tNotify = Date.now();
    var timings = {
      validateMs: tValidated - t0,
      repositoryMs: tRepo - tValidated,
      snapshotNotifyMs: tNotify - tRepo,
      totalMs: tNotify - t0,
    };
    Logger.log("[MaintenanceService.create] timings " + JSON.stringify(timings));
    if (payload && payload._auditTiming) {
      created._serverTimings = timings;
    }
    return created;
  }

  function update(payload) {
    var t0 = Date.now();
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.id) throw new Error("Maintenance id is required.");
    var updated = MaintenanceRepository.update(payload.id, payload);
    if (!updated) throw new Error("Maintenance " + payload.id + " not found.");
    var tRepo = Date.now();
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateMaintenanceCatalog();
    }
    invalidateRegisterCache_();
    var tNotify = Date.now();
    var timings = {
      repositoryMs: tRepo - t0,
      snapshotNotifyMs: tNotify - tRepo,
      totalMs: tNotify - t0,
    };
    Logger.log("[MaintenanceService.update] timings " + JSON.stringify(timings));
    if (payload && payload._auditTiming) {
      updated._serverTimings = timings;
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Maintenance id is required.");
    var updated = MaintenanceRepository.deactivate(payload.id);
    if (!updated) throw new Error("Maintenance " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateMaintenanceCatalog();
    }
    invalidateRegisterCache_();
    return updated;
  }

  return {
    getAll: getAll,
    listCatalog: listCatalog,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
