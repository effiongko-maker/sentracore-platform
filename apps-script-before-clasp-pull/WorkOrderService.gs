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
    var assetId = payload.assetId;
    var maintenanceId = payload.maintenanceId;
    var dueDate = payload.dueDate;

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
          .indexOf(search) !== -1 ||
        String(row.maintenanceId || "")
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

      var matchesAsset =
        !assetId ||
        assetId === "all" ||
        String(row.assetId || "") === String(assetId);

      var matchesMaintenance =
        !maintenanceId ||
        maintenanceId === "all" ||
        String(row.maintenanceId || "") === String(maintenanceId);

      var matchesDue = true;
      if (dueDate && dueDate !== "all") {
        var dueRaw = String(row.dueAt || "").trim();
        if (dueDate === "no_due") {
          matchesDue = !dueRaw;
        } else if (!dueRaw) {
          matchesDue = false;
        } else {
          var dueMs = Date.parse(dueRaw);
          if (!isFinite(dueMs)) {
            matchesDue = false;
          } else {
            var now = new Date();
            var startOfToday = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            ).getTime();
            if (dueDate === "overdue") {
              matchesDue = dueMs < startOfToday;
            } else if (dueDate === "next_7_days") {
              var weekMs = startOfToday + 7 * 24 * 60 * 60 * 1000;
              matchesDue = dueMs >= startOfToday && dueMs <= weekMs;
            }
          }
        }
      }

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesFacility &&
        matchesAssignee &&
        matchesType &&
        matchesAsset &&
        matchesMaintenance &&
        matchesDue
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

  function loadCanonicalRows_(payload, auditCollector) {
    payload = payload || {};
    if (typeof OperationalRegisterCache === "undefined") {
      return WorkOrderRepository.getAll(auditCollector);
    }
    return OperationalRegisterCache.getCanonicalRows(
      OperationalRegisterCache.NAMESPACES.workOrders,
      function (collector) {
        return WorkOrderRepository.getAll(collector);
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
        OperationalRegisterCache.NAMESPACES.workOrders
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
    if (!id) throw new Error("Work order id is required.");
    var workOrder = WorkOrderRepository.getById(id);
    if (!workOrder) throw new Error("Work order " + id + " not found.");
    return workOrder;
  }

  function create(payload) {
    var t0 = Date.now();
    if (!payload || !payload.title) throw new Error("Work order title is required.");
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var tValidated = Date.now();
    var created = WorkOrderRepository.create(payload);
    var tRepo = Date.now();
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    invalidateRegisterCache_();
    var tNotify = Date.now();
    var timings = {
      validateMs: tValidated - t0,
      repositoryMs: tRepo - tValidated,
      snapshotNotifyMs: tNotify - tRepo,
      totalMs: tNotify - t0,
    };
    Logger.log("[WorkOrderService.create] timings " + JSON.stringify(timings));
    if (payload && payload._auditTiming) {
      created._serverTimings = timings;
    }
    return created;
  }

  function update(payload) {
    var t0 = Date.now();
    if (!payload || !payload.id) throw new Error("Work order id is required.");
    var updated = WorkOrderRepository.update(payload.id, payload);
    if (!updated) throw new Error("Work order " + payload.id + " not found.");
    var tRepo = Date.now();
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
    }
    invalidateRegisterCache_();
    var tNotify = Date.now();
    var timings = {
      repositoryMs: tRepo - t0,
      snapshotNotifyMs: tNotify - tRepo,
      totalMs: tNotify - t0,
    };
    Logger.log("[WorkOrderService.update] timings " + JSON.stringify(timings));
    if (payload && payload._auditTiming) {
      updated._serverTimings = timings;
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
    invalidateRegisterCache_();
    return updated;
  }

  /**
   * Consolidated WO filter catalogs — one invocation, column-limited projections.
   * Does not call getAll on domain services.
   */
  function loadFilterCatalogFromSheets_() {
    var t0 = Date.now();
    var facilities = [];
    var users = [];
    var assets = [];

    if (
      typeof FacilityRepository !== "undefined" &&
      FacilityRepository.listFilterCatalog
    ) {
      facilities = FacilityRepository.listFilterCatalog() || [];
    }
    if (
      typeof UserRepository !== "undefined" &&
      UserRepository.listFilterCatalog
    ) {
      users = UserRepository.listFilterCatalog() || [];
    }
    if (
      typeof AssetRepository !== "undefined" &&
      AssetRepository.listFilterCatalog
    ) {
      assets = AssetRepository.listFilterCatalog() || [];
    }

    return {
      facilities: facilities,
      users: users,
      assets: assets,
      sheetReadMs: Date.now() - t0,
    };
  }

  function attachCacheDiagnostics_(target, payload, diagnostics) {
    if (payload && payload._auditTiming && diagnostics) {
      target._cacheDiagnostics = diagnostics;
    }
    return target;
  }

  function getFilterCatalog(payload) {
    payload = payload || {};
    var tTotal0 = Date.now();
    var skipCache = !!payload._skipCache;
    var cacheHit = false;
    var cacheReadMs = 0;
    var sheetReadMs = 0;
    var projectionMs = 0;
    var catalog = null;

    if (!skipCache && typeof CatalogCacheService !== "undefined") {
      var cached = CatalogCacheService.getWoFilterCatalog();
      if (cached && cached.data) {
        cacheHit = true;
        cacheReadMs = cached.cacheReadMs || 0;
        catalog = cached.data;
      }
    }

    if (!cacheHit) {
      var loaded = loadFilterCatalogFromSheets_();
      sheetReadMs = loaded.sheetReadMs;
      catalog = {
        facilities: loaded.facilities,
        users: loaded.users,
        assets: loaded.assets,
      };
      if (typeof CatalogCacheService !== "undefined") {
        CatalogCacheService.putWoFilterCatalog(catalog);
      }
    }

    var totalServerMs = Date.now() - tTotal0;
    var result = {
      facilities: catalog.facilities || [],
      users: catalog.users || [],
      assets: catalog.assets || [],
    };

    Logger.log(
      "[WorkOrderService.getFilterCatalog] cacheHit=" +
        cacheHit +
        " sheetReadMs=" +
        sheetReadMs +
        " cacheReadMs=" +
        cacheReadMs +
        " totalServerMs=" +
        totalServerMs
    );

    return attachCacheDiagnostics_(result, payload, {
      cacheHit: cacheHit,
      cacheReadMs: cacheReadMs,
      sheetReadMs: sheetReadMs,
      projectionMs: projectionMs,
      totalServerMs: totalServerMs,
    });
  }

  return {
    getAll: getAll,
    getById: getById,
    getFilterCatalog: getFilterCatalog,
    create: create,
    update: update,
    deactivate: deactivate,
  };
})();
