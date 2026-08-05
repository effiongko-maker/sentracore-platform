# Reporting Snapshot — Apps Script copy pack

> **STALE — DO NOT DEPLOY FROM THIS FILE.**
> This pack predates CacheService and will make every `getSnapshot` hit the sheet (5–9s).
> Use **`apps-script/deployment/DEPLOYMENT_PACK.md`** (v0.2.3+) instead.

Copy each section below into Apps Script as a **separate `.gs` file** (same name).

## Deploy order
1. Add files 1–4 (new)
2. Replace files 6a–6e (domain services with snapshot hooks)
3. Merge the router snippet (section 5)
4. Deploy → New version of the Web App
5. Run once: `installReportingSnapshotTrigger()`

---
## 1) NEW FILE — ReportingSnapshotRepository.gs

```javascript
/**
 * ReportingSnapshotRepository.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER (Sheets-backed).
 * ---------------------------------------------------------------------------
 * Stores a pre-aggregated ReportingSnapshot in the REPORTING_SNAPSHOT sheet so
 * Home / Dashboard / Reports can read KPIs + summary datasets without scanning
 * every domain sheet on each request.
 *
 * Google Sheets remains the system of record for domain entities.
 * This sheet is a derived cache and can later be replaced by a database-backed
 * repository without changing the application architecture
 * (DashboardService → ReportingService → Snapshot reader).
 *
 * Sheet: REPORTING_SNAPSHOT
 * Columns:
 *   section | scope | chunk | json | updatedAt | version
 *
 * Sections: meta | users | facilities | assets | incidents | maintenance |
 *           workOrders | kpis | projections | health
 */

var ReportingSnapshotRepository = (function () {
  var SHEET_NAME = "REPORTING_SNAPSHOT";
  var SCOPE_PORTFOLIO = "__portfolio__";
  var MAX_CELL_CHARS = 40000;
  var HEADERS = ["section", "scope", "chunk", "json", "updatedAt", "version"];

  var SECTIONS = [
    "meta",
    "users",
    "facilities",
    "assets",
    "incidents",
    "maintenance",
    "workOrders",
    "kpis",
    "projections",
    "health",
  ];

  function getSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    }
    return sheet;
  }

  function chunkJson_(value) {
    var text = JSON.stringify(value == null ? null : value);
    var chunks = [];
    if (!text.length) {
      chunks.push("");
      return chunks;
    }
    for (var i = 0; i < text.length; i += MAX_CELL_CHARS) {
      chunks.push(text.substring(i, i + MAX_CELL_CHARS));
    }
    return chunks;
  }

  function deleteSectionRows_(sheet, section, scope) {
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    // Delete from bottom to top to keep indices stable.
    for (var i = values.length - 1; i >= 0; i--) {
      if (
        String(values[i][0]) === section &&
        String(values[i][1]) === scope
      ) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  function writeSection(section, data, version, scope) {
    scope = scope || SCOPE_PORTFOLIO;
    version = version || Date.now();
    var sheet = getSheet_();
    deleteSectionRows_(sheet, section, scope);

    var chunks = chunkJson_(data);
    var updatedAt = new Date().toISOString();
    var rows = [];
    for (var i = 0; i < chunks.length; i++) {
      rows.push([section, scope, i, chunks[i], updatedAt, version]);
    }
    if (!rows.length) return;
    sheet
      .getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length)
      .setValues(rows);
  }

  function readSection(section, scope) {
    scope = scope || SCOPE_PORTFOLIO;
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return null;

    var values = sheet.getRange(2, 1, lastRow, HEADERS.length).getValues();
    var parts = [];
    for (var i = 0; i < values.length; i++) {
      if (
        String(values[i][0]) === section &&
        String(values[i][1]) === scope
      ) {
        parts.push({
          chunk: Number(values[i][2] || 0),
          json: String(values[i][3] || ""),
        });
      }
    }
    if (!parts.length) return null;
    parts.sort(function (a, b) {
      return a.chunk - b.chunk;
    });
    var text = parts
      .map(function (p) {
        return p.json;
      })
      .join("");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      Logger.log(
        "[REPORTING_SNAPSHOT] Failed to parse section " + section + ": " + err
      );
      return null;
    }
  }

  function writeFull(snapshotParts, version) {
    version = version || Date.now();
    var scope = SCOPE_PORTFOLIO;
    for (var i = 0; i < SECTIONS.length; i++) {
      var section = SECTIONS[i];
      writeSection(section, snapshotParts[section], version, scope);
    }
    return version;
  }

  function readFull(scope) {
    scope = scope || SCOPE_PORTFOLIO;
    var meta = readSection("meta", scope);
    if (!meta) return null;

    return {
      meta: meta,
      users: readSection("users", scope) || [],
      facilities: readSection("facilities", scope) || [],
      assets: readSection("assets", scope) || [],
      incidents: readSection("incidents", scope) || [],
      maintenance: readSection("maintenance", scope) || [],
      workOrders: readSection("workOrders", scope) || [],
      kpis: readSection("kpis", scope),
      projections: readSection("projections", scope),
      health: readSection("health", scope),
    };
  }

  function clearAll() {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow, HEADERS.length).clearContent();
    }
  }

  return {
    SCOPE_PORTFOLIO: SCOPE_PORTFOLIO,
    SECTIONS: SECTIONS,
    getSheet_: getSheet_,
    writeSection: writeSection,
    readSection: readSection,
    writeFull: writeFull,
    readFull: readFull,
    clearAll: clearAll,
  };
})();
```

---
## 2) NEW FILE — ReportingSnapshotService.gs

```javascript
/**
 * ReportingSnapshotService.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER (Sheets-backed).
 * ---------------------------------------------------------------------------
 * Builds and refreshes the REPORTING_SNAPSHOT derived cache from domain
 * repositories. Domain sheets remain the system of record.
 *
 * Partial refresh:
 *   After create/update/deactivate on a module, refresh that module's section
 *   then recompute derived KPIs / projections / health.
 *
 * Full rebuild:
 *   Scheduled trigger + cold-start / explicit rebuild action.
 *
 * Can later be replaced by a database-backed repository without changing
 * DashboardService → ReportingService application architecture.
 */

var ReportingSnapshotService = (function () {
  var OPEN_WO = {
    open: true,
    assigned: true,
    in_progress: true,
    on_hold: true,
  };
  var BACKLOG_MNT = {
    requested: true,
    triaged: true,
    scheduled: true,
    in_progress: true,
    on_hold: true,
  };
  var CLOSED_INCIDENT = {
    resolved: true,
    closed: true,
    cancelled: true,
  };

  function dayKey_(iso, asOf) {
    var value = iso || asOf || "";
    return String(value).slice(0, 10);
  }

  function isBeforeDay_(iso, asOf) {
    if (!iso) return false;
    return dayKey_(iso, asOf) < dayKey_(asOf, asOf);
  }

  function isSameDay_(iso, asOf) {
    if (!iso) return false;
    return dayKey_(iso, asOf) === dayKey_(asOf, asOf);
  }

  function isOpenWorkOrder_(wo) {
    return !!OPEN_WO[String(wo.status || "").toLowerCase()];
  }

  function isMaintenanceBacklog_(row) {
    return !!BACKLOG_MNT[String(row.status || "").toLowerCase()];
  }

  function isCriticalOpenIncident_(incident) {
    return (
      String(incident.severity || "").toLowerCase() === "critical" &&
      !CLOSED_INCIDENT[String(incident.status || "").toLowerCase()]
    );
  }

  function safeRepoGetAll_(repo) {
    try {
      if (repo && typeof repo.getAll === "function") {
        return repo.getAll() || [];
      }
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] repository getAll failed: " + err);
    }
    return [];
  }

  function loadDomainRows_() {
    return {
      users:
        typeof UserRepository !== "undefined"
          ? safeRepoGetAll_(UserRepository)
          : [],
      facilities:
        typeof FacilityRepository !== "undefined"
          ? safeRepoGetAll_(FacilityRepository)
          : [],
      assets:
        typeof AssetRepository !== "undefined"
          ? safeRepoGetAll_(AssetRepository)
          : [],
      incidents:
        typeof IncidentRepository !== "undefined"
          ? safeRepoGetAll_(IncidentRepository)
          : [],
      maintenance:
        typeof MaintenanceRepository !== "undefined"
          ? safeRepoGetAll_(MaintenanceRepository)
          : [],
      workOrders:
        typeof WorkOrderRepository !== "undefined"
          ? safeRepoGetAll_(WorkOrderRepository)
          : [],
    };
  }

  function loadModuleRows_(module) {
    if (module === "users") {
      return typeof UserRepository !== "undefined"
        ? safeRepoGetAll_(UserRepository)
        : [];
    }
    if (module === "facilities") {
      return typeof FacilityRepository !== "undefined"
        ? safeRepoGetAll_(FacilityRepository)
        : [];
    }
    if (module === "assets") {
      return typeof AssetRepository !== "undefined"
        ? safeRepoGetAll_(AssetRepository)
        : [];
    }
    if (module === "incidents") {
      return typeof IncidentRepository !== "undefined"
        ? safeRepoGetAll_(IncidentRepository)
        : [];
    }
    if (module === "maintenance") {
      return typeof MaintenanceRepository !== "undefined"
        ? safeRepoGetAll_(MaintenanceRepository)
        : [];
    }
    if (module === "workOrders" || module === "work-orders") {
      return typeof WorkOrderRepository !== "undefined"
        ? safeRepoGetAll_(WorkOrderRepository)
        : [];
    }
    return [];
  }

  function sectionForModule_(module) {
    if (module === "work-orders") return "workOrders";
    return module;
  }

  function computeKpis_(asOf, rows) {
    var facilities = rows.facilities || [];
    var assets = rows.assets || [];
    var incidents = rows.incidents || [];
    var maintenance = rows.maintenance || [];
    var workOrders = rows.workOrders || [];
    var users = rows.users || [];

    var activeFacilities = facilities.filter(function (f) {
      return String(f.status || "").toLowerCase() === "active";
    }).length;
    var activeAssets = assets.filter(function (a) {
      return String(a.status || "").toLowerCase() === "active";
    }).length;
    var openWorkOrders = workOrders.filter(isOpenWorkOrder_);
    var backlog = maintenance.filter(isMaintenanceBacklog_);
    var criticalOpen = incidents.filter(isCriticalOpenIncident_);

    var assetsOperationalPercent =
      assets.length > 0
        ? Math.round((activeAssets / assets.length) * 100)
        : null;

    return {
      activeFacilities: activeFacilities,
      inactiveFacilities: Math.max(0, facilities.length - activeFacilities),
      totalFacilities: facilities.length,
      activeAssets: activeAssets,
      totalAssets: assets.length,
      assetsOperationalPercent: assetsOperationalPercent,
      assetsInPoorCondition: assets.filter(function (a) {
        return String(a.condition || "").toLowerCase() === "poor";
      }).length,
      activeWorkforce: users.filter(function (u) {
        return String(u.status || "").toLowerCase() === "active";
      }).length,
      totalUsers: users.length,
      openWorkOrders: openWorkOrders.length,
      workOrdersCreatedToday: workOrders.filter(function (wo) {
        return isSameDay_(wo.createdAt || wo.requestedAt, asOf);
      }).length,
      workOrdersDueToday: openWorkOrders.filter(function (wo) {
        return isSameDay_(wo.dueAt, asOf);
      }).length,
      overdueWorkOrders: openWorkOrders.filter(function (wo) {
        return isBeforeDay_(wo.dueAt, asOf);
      }).length,
      criticalIncidents: criticalOpen.length,
      criticalIncidentsUnassigned: criticalOpen.filter(function (incident) {
        return !incident.assignedToUserId;
      }).length,
      incidentsNeedingWorkOrder: incidents.filter(function (incident) {
        return (
          !CLOSED_INCIDENT[String(incident.status || "").toLowerCase()] &&
          incident.requiresWorkOrder === true &&
          !incident.workOrderId
        );
      }).length,
      maintenanceBacklog: backlog.length,
      overdueMaintenance: backlog.filter(function (row) {
        return isBeforeDay_(row.dueAt, asOf);
      }).length,
      maintenanceOnHold: maintenance.filter(function (row) {
        return String(row.status || "").toLowerCase() === "on_hold";
      }).length,
      workOrdersOnHold: workOrders.filter(function (wo) {
        return String(wo.status || "").toLowerCase() === "on_hold";
      }).length,
    };
  }

  function computeHealth_(kpis) {
    var score = 100;
    score -= Math.min(40, (kpis.criticalIncidents || 0) * 15);
    score -= Math.min(25, (kpis.overdueWorkOrders || 0) * 5);
    score -= Math.min(20, (kpis.overdueMaintenance || 0) * 4);
    score -= Math.min(10, (kpis.assetsInPoorCondition || 0) * 2);
    score -= Math.min(10, (kpis.incidentsNeedingWorkOrder || 0) * 3);
    score = Math.max(0, Math.min(100, score));

    var band =
      score >= 80 ? "healthy" : score >= 55 ? "watch" : "critical";
    var summary =
      band === "healthy"
        ? "Here's what's happening across your facilities today."
        : band === "watch"
          ? "Some items need attention before end of day."
          : "Critical pressure detected — review open incidents and overdue work.";

    return { band: band, score: score, summary: summary };
  }

  function labelize_(value) {
    return String(value || "")
      .split("_")
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function toneFromPriority_(priority) {
    var p = String(priority || "").toLowerCase();
    if (p === "critical") return "danger";
    if (p === "high") return "warning";
    if (p === "medium") return "info";
    return "neutral";
  }

  function sortByDateDesc_(rows, getDate) {
    return (rows || []).slice().sort(function (a, b) {
      var left = getDate(a) || "";
      var right = getDate(b) || "";
      if (left < right) return 1;
      if (left > right) return -1;
      return 0;
    });
  }

  function projectWorkOrder_(wo) {
    return {
      module: "work-orders",
      entityId: wo.id,
      title: wo.title || wo.id,
      status: wo.status,
      priority: wo.priority,
      facilityId: wo.facilityId,
      meta: labelize_(wo.priority) + " · " + labelize_(wo.status),
      reportedAt: wo.requestedAt,
      tone: toneFromPriority_(wo.priority),
    };
  }

  function projectMaintenance_(row) {
    return {
      module: "maintenance",
      entityId: row.id,
      title: row.title || row.id,
      status: row.status,
      priority: row.priority,
      facilityId: row.facilityId,
      meta: labelize_(row.priority) + " · " + labelize_(row.status),
      reportedAt: row.reportedAt,
      tone: toneFromPriority_(row.priority),
    };
  }

  function projectIncident_(incident) {
    return {
      module: "incidents",
      entityId: incident.id,
      title: incident.title || incident.id,
      status: incident.status,
      priority: incident.severity,
      facilityId: incident.facilityId,
      meta: labelize_(incident.severity) + " · " + labelize_(incident.status),
      reportedAt: incident.reportedAt,
      tone: toneFromPriority_(incident.severity),
    };
  }

  function computeProjections_(asOf, rows) {
    var incidents = rows.incidents || [];
    var maintenance = rows.maintenance || [];
    var workOrders = rows.workOrders || [];
    var LIST_LIMIT = 5;

    function isOverdueWo(wo) {
      return isOpenWorkOrder_(wo) && wo.dueAt && isBeforeDay_(wo.dueAt, asOf);
    }
    function isOverdueMnt(row) {
      return (
        isMaintenanceBacklog_(row) && row.dueAt && isBeforeDay_(row.dueAt, asOf)
      );
    }

    var overdueWorkOrders = sortByDateDesc_(
      workOrders.filter(isOverdueWo),
      function (wo) {
        return wo.dueAt || wo.requestedAt;
      }
    )
      .slice(0, LIST_LIMIT)
      .map(projectWorkOrder_);

    var maintenanceAttention = sortByDateDesc_(
      maintenance.filter(function (row) {
        var priority = String(row.priority || "").toLowerCase();
        return (
          isOverdueMnt(row) ||
          String(row.status || "").toLowerCase() === "on_hold" ||
          priority === "critical" ||
          priority === "high"
        );
      }),
      function (row) {
        return row.dueAt || row.reportedAt;
      }
    )
      .slice(0, LIST_LIMIT)
      .map(projectMaintenance_);

    var blockedItems = sortByDateDesc_(
      workOrders
        .filter(function (wo) {
          return String(wo.status || "").toLowerCase() === "on_hold";
        })
        .map(projectWorkOrder_)
        .concat(
          maintenance
            .filter(function (row) {
              return String(row.status || "").toLowerCase() === "on_hold";
            })
            .map(projectMaintenance_)
        ),
      function (item) {
        return item.reportedAt;
      }
    ).slice(0, LIST_LIMIT);

    return {
      criticalIncidents: sortByDateDesc_(
        incidents.filter(isCriticalOpenIncident_),
        function (incident) {
          return incident.reportedAt;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectIncident_),
      overdueWorkOrders: overdueWorkOrders,
      maintenanceAttention: maintenanceAttention,
      blockedItems: blockedItems,
      latestOpenWorkOrders: sortByDateDesc_(
        workOrders.filter(isOpenWorkOrder_),
        function (wo) {
          return wo.requestedAt || wo.createdAt;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectWorkOrder_),
      latestActiveMaintenance: sortByDateDesc_(
        maintenance.filter(isMaintenanceBacklog_),
        function (row) {
          return row.reportedAt;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectMaintenance_),
    };
  }

  function filterByFacilityId_(rows, facilityId) {
    if (!facilityId) return rows || [];
    return (rows || []).filter(function (row) {
      if (row.facilityId && String(row.facilityId) === String(facilityId)) {
        return true;
      }
      if (row.facility && String(row.facility) === String(facilityId)) {
        return true;
      }
      return false;
    });
  }

  function assembleSnapshot_(parts, facilityId) {
    var asOf =
      (parts.meta && parts.meta.asOf) || new Date().toISOString();
    var facilities = parts.facilities || [];
    if (facilityId) {
      facilities = facilities.filter(function (f) {
        return String(f.id) === String(facilityId);
      });
    }

    var assets = filterByFacilityId_(parts.assets, facilityId);
    var incidents = filterByFacilityId_(parts.incidents, facilityId);
    var maintenance = filterByFacilityId_(parts.maintenance, facilityId);
    var workOrders = filterByFacilityId_(parts.workOrders, facilityId);
    var users = parts.users || [];

    // When facility-scoped, recompute derived values for that scope.
    var kpis = facilityId
      ? computeKpis_(asOf, {
          users: users,
          facilities: facilities,
          assets: assets,
          incidents: incidents,
          maintenance: maintenance,
          workOrders: workOrders,
        })
      : parts.kpis ||
        computeKpis_(asOf, {
          users: users,
          facilities: facilities,
          assets: assets,
          incidents: incidents,
          maintenance: maintenance,
          workOrders: workOrders,
        });

    var projections = facilityId
      ? computeProjections_(asOf, {
          incidents: incidents,
          maintenance: maintenance,
          workOrders: workOrders,
        })
      : parts.projections ||
        computeProjections_(asOf, {
          incidents: incidents,
          maintenance: maintenance,
          workOrders: workOrders,
        });

    var health = facilityId
      ? computeHealth_(kpis)
      : parts.health || computeHealth_(kpis);

    return {
      asOf: asOf,
      facilityId: facilityId || undefined,
      currentUserId: parts.meta && parts.meta.currentUserId,
      users: users,
      facilities: facilities,
      assets: assets,
      incidents: incidents,
      maintenance: maintenance,
      workOrders: workOrders,
      kpis: kpis,
      projections: projections,
      health: health,
      _snapshotMeta: {
        source: "REPORTING_SNAPSHOT",
        generatedAt: parts.meta && parts.meta.generatedAt,
        version: parts.meta && parts.meta.version,
        scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
      },
    };
  }

  function recomputeDerived_(version) {
    var asOf = new Date().toISOString();
    var parts = {
      users: ReportingSnapshotRepository.readSection("users") || [],
      facilities: ReportingSnapshotRepository.readSection("facilities") || [],
      assets: ReportingSnapshotRepository.readSection("assets") || [],
      incidents: ReportingSnapshotRepository.readSection("incidents") || [],
      maintenance: ReportingSnapshotRepository.readSection("maintenance") || [],
      workOrders: ReportingSnapshotRepository.readSection("workOrders") || [],
    };

    var kpis = computeKpis_(asOf, parts);
    var projections = computeProjections_(asOf, parts);
    var health = computeHealth_(kpis);
    version = version || Date.now();

    ReportingSnapshotRepository.writeSection(
      "meta",
      {
        asOf: asOf,
        generatedAt: asOf,
        version: version,
        scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
      },
      version
    );
    ReportingSnapshotRepository.writeSection("kpis", kpis, version);
    ReportingSnapshotRepository.writeSection("projections", projections, version);
    ReportingSnapshotRepository.writeSection("health", health, version);

    return version;
  }

  function withLock_(fn) {
    var lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return fn();
    } finally {
      try {
        lock.releaseLock();
      } catch (ignore) {}
    }
  }

  function rebuildAll() {
    return withLock_(function () {
      var started = Date.now();
      Logger.log("[REPORTING_SNAPSHOT] full rebuild start");
      var asOf = new Date().toISOString();
      var rows = loadDomainRows_();
      var kpis = computeKpis_(asOf, rows);
      var projections = computeProjections_(asOf, rows);
      var health = computeHealth_(kpis);
      var version = Date.now();

      ReportingSnapshotRepository.writeFull(
        {
          meta: {
            asOf: asOf,
            generatedAt: asOf,
            version: version,
            scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
          },
          users: rows.users,
          facilities: rows.facilities,
          assets: rows.assets,
          incidents: rows.incidents,
          maintenance: rows.maintenance,
          workOrders: rows.workOrders,
          kpis: kpis,
          projections: projections,
          health: health,
        },
        version
      );

      Logger.log(
        "[REPORTING_SNAPSHOT] full rebuild done " +
          (Date.now() - started) +
          "ms"
      );
      return getSnapshotUnlocked_({});
    });
  }

  /**
   * Refresh only the affected domain section, then recompute derived KPIs.
   * module: users | facilities | assets | incidents | maintenance | workOrders | work-orders
   */
  function refreshModule(module) {
    return withLock_(function () {
      var section = sectionForModule_(module);
      var started = Date.now();
      Logger.log("[REPORTING_SNAPSHOT] partial refresh module=" + section);

      var rows = loadModuleRows_(module);
      var version = Date.now();
      ReportingSnapshotRepository.writeSection(section, rows, version);
      recomputeDerived_(version);

      Logger.log(
        "[REPORTING_SNAPSHOT] partial refresh done module=" +
          section +
          " " +
          (Date.now() - started) +
          "ms"
      );
      return getSnapshotUnlocked_({});
    });
  }

  function getSnapshotUnlocked_(payload) {
    payload = payload || {};
    var parts = ReportingSnapshotRepository.readFull();
    if (!parts || !parts.meta || !parts.kpis) {
      return null;
    }
    return assembleSnapshot_(parts, payload.facilityId);
  }

  function getSnapshot(payload) {
    payload = payload || {};
    var existing = getSnapshotUnlocked_(payload);
    if (existing) return existing;
    Logger.log("[REPORTING_SNAPSHOT] cache miss — rebuilding");
    return rebuildAll();
  }

  /**
   * Fire-and-forget style wrapper for domain service hooks.
   * Never throws into CRUD paths.
   */
  function notifyModuleChanged(module) {
    try {
      refreshModule(module);
    } catch (err) {
      Logger.log(
        "[REPORTING_SNAPSHOT] notifyModuleChanged failed module=" +
          module +
          " err=" +
          err
      );
    }
  }

  return {
    rebuildAll: rebuildAll,
    refreshModule: refreshModule,
    getSnapshot: getSnapshot,
    notifyModuleChanged: notifyModuleChanged,
  };
})();
```

---
## 3) NEW FILE — ReportingSnapshotController.gs

```javascript
/**
 * ReportingSnapshotController.gs
 *
 * Entry for module/resource === "reporting-snapshot".
 *
 * Actions:
 *   getSnapshot  — read derived REPORTING_SNAPSHOT (rebuilds on cold miss)
 *   rebuild      — force full rebuild from domain sheets
 *   refreshModule — partial refresh { module: "facilities" | ... }
 *
 * Uses shared jsonResponse_() — same helper as other controllers.
 */

var ReportingSnapshotController = (function () {
  function handle(action, payload) {
    try {
      switch (String(action || "getSnapshot")) {
        case "getSnapshot":
          return jsonResponse_(
            true,
            "Reporting snapshot loaded.",
            ReportingSnapshotService.getSnapshot(payload)
          );

        case "rebuild":
          return jsonResponse_(
            true,
            "Reporting snapshot rebuilt.",
            ReportingSnapshotService.rebuildAll()
          );

        case "refreshModule":
          return jsonResponse_(
            true,
            "Reporting snapshot module refreshed.",
            ReportingSnapshotService.refreshModule(
              payload && payload.module ? payload.module : ""
            )
          );

        default:
          return jsonResponse_(
            false,
            "Unknown reporting-snapshot action: " + action,
            null
          );
      }
    } catch (err) {
      return jsonResponse_(
        false,
        err && err.message ? err.message : String(err),
        null
      );
    }
  }

  return { handle: handle };
})();
```

---
## 4) NEW FILE — ReportingSnapshotTriggers.gs

```javascript
/**
 * ReportingSnapshotTriggers.gs
 *
 * PERFORMANCE OPTIMIZATION LAYER — scheduled safety-net rebuild.
 * ---------------------------------------------------------------------------
 * Installs a time-driven trigger that fully rebuilds REPORTING_SNAPSHOT every
 * 10 minutes. Partial refreshes still run on CRUD; this catches drift.
 *
 * Run once (from Apps Script editor):
 *   installReportingSnapshotTrigger()
 *
 * To remove:
 *   removeReportingSnapshotTriggers()
 */

function rebuildReportingSnapshotScheduled() {
  try {
    ReportingSnapshotService.rebuildAll();
  } catch (err) {
    Logger.log(
      "[REPORTING_SNAPSHOT] scheduled rebuild failed: " +
        (err && err.message ? err.message : err)
    );
  }
}

function installReportingSnapshotTrigger() {
  removeReportingSnapshotTriggers();

  ScriptApp.newTrigger("rebuildReportingSnapshotScheduled")
    .timeBased()
    .everyMinutes(10)
    .create();

  Logger.log(
    "[REPORTING_SNAPSHOT] installed 10-minute rebuild trigger"
  );

  // Cold-start: ensure the sheet exists and is populated.
  try {
    ReportingSnapshotService.rebuildAll();
  } catch (err) {
    Logger.log(
      "[REPORTING_SNAPSHOT] initial rebuild failed: " +
        (err && err.message ? err.message : err)
    );
  }
}

function removeReportingSnapshotTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "rebuildReportingSnapshotScheduled") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
```

---
## 6a) REPLACE — FacilityService.gs

```javascript
/**
 * FacilityService.gs
 *
 * Business rules for Facilities. Mirrors UserService.gs pattern.
 * Never talks to the spreadsheet directly — only FacilityRepository.
 */

var FacilityService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var type = payload.type;
    var location = payload.location;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.code || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.location || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.manager || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status || status === "all" || String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesType =
        !type || type === "all" || String(row.type).toLowerCase() === String(type).toLowerCase();

      var matchesLocation =
        !location ||
        location === "all" ||
        String(row.location) === String(location);

      return matchesSearch && matchesStatus && matchesType && matchesLocation;
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

  function getAll(payload) {
    var rows = FacilityRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Facility id is required.");
    var facility = FacilityRepository.getById(id);
    if (!facility) throw new Error("Facility " + id + " not found.");
    return facility;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("Facility name is required.");
    if (!payload.code) throw new Error("Facility code is required.");
    var created = FacilityRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Facility id is required.");
    var updated = FacilityRepository.update(payload.id, payload);
    if (!updated) throw new Error("Facility " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Facility id is required.");
    var updated = FacilityRepository.deactivate(payload.id);
    if (!updated) throw new Error("Facility " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("facilities");
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
```

---
## 6b) REPLACE — AssetService.gs

```javascript
/**
 * AssetService.gs
 *
 * Business rules for Assets. Mirrors FacilityService.gs pattern.
 * Never talks to the spreadsheet directly — only AssetRepository.
 */

var AssetService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var category = payload.category;
    var facility = payload.facility;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assetTag || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facility || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.serialNumber || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.manufacturer || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assignedTo || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesCategory =
        !category ||
        category === "all" ||
        String(row.category).toLowerCase() === String(category).toLowerCase();

      var matchesFacility =
        !facility ||
        facility === "all" ||
        String(row.facility) === String(facility);

      return (
        matchesSearch && matchesStatus && matchesCategory && matchesFacility
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

  function getAll(payload) {
    var rows = AssetRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Asset id is required.");
    var asset = AssetRepository.getById(id);
    if (!asset) throw new Error("Asset " + id + " not found.");
    return asset;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("Asset name is required.");
    if (!payload.assetTag) throw new Error("Asset tag is required.");
    var created = AssetRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("Asset id is required.");
    var updated = AssetRepository.update(payload.id, payload);
    if (!updated) throw new Error("Asset " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Asset id is required.");
    var updated = AssetRepository.deactivate(payload.id);
    if (!updated) throw new Error("Asset " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
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
```

---
## 6c) REPLACE — IncidentService.gs

```javascript
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

  function getAll(payload) {
    var rows = IncidentRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
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
```

---
## 6d) REPLACE — MaintenanceService.gs

```javascript
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

  function getAll(payload) {
    var rows = MaintenanceRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Maintenance id is required.");
    var row = MaintenanceRepository.getById(id);
    if (!row) throw new Error("Maintenance " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || (!payload.title && !payload.description)) {
      throw new Error("Maintenance title is required.");
    }
    if (!payload.facilityId) throw new Error("Facility id is required.");
    var created = MaintenanceRepository.create(payload);
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
    return created;
  }

  function update(payload) {
    payload = applyWorkOrderRule_(payload);
    if (!payload || !payload.id) throw new Error("Maintenance id is required.");
    var updated = MaintenanceRepository.update(payload.id, payload);
    if (!updated) throw new Error("Maintenance " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("maintenance");
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
```

---
## 6e) REPLACE — WorkOrderService.gs

```javascript
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

  function getAll(payload) {
    var rows = WorkOrderRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
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
```

---
## 5) MERGE into existing doPost router

```javascript
} else if (resource === "reporting-snapshot") {
  result = ReportingSnapshotController.handle(action, payload);
}
```

---

## After deploy

In Apps Script editor → Run:

```javascript
installReportingSnapshotTrigger()
```
