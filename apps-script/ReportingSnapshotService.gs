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
 *
 * NOTE: Next.js ReportingService re-derives KPIs/projections after load so
 * TypeScript remains the authoritative calculation path for the app.
 * These Apps Script helpers keep sheet-stored values consistent for direct
 * sheet consumers and reduce drift before hydration.
 */

var ReportingSnapshotService = (function () {
  /**
   * CacheService hot path for assembled snapshot JSON.
   * Keys are CONSTANT (not epoch-suffixed). Invalidation uses cache.remove().
   */
  var CACHE_TTL_SECONDS = 21600; // 6h max; also cleared on notify/rebuild/refresh
  var CACHE_KEY_PORTFOLIO = "rs_snap_v1_portfolio";
  var CACHE_KEY_FAC_PREFIX = "rs_snap_v1_fac_";
  var CACHE_MAX_CHARS = 90000; // CacheService ~100KB limit with headroom

  var ACTIVE_ENTITY = {
    active: true,
    operational: true,
    in_service: true,
    online: true,
    open: true,
  };
  var INACTIVE_ENTITY = {
    inactive: true,
    deactivated: true,
    decommissioned: true,
    offline: true,
    archived: true,
    closed: true,
    cancelled: true,
    canceled: true,
    suspended: true,
  };
  var OPERATIONAL_ASSET = {
    active: true,
    operational: true,
    in_service: true,
    online: true,
    available: true,
  };
  var OPEN_WO = {
    draft: true,
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
    canceled: true,
  };

  /**
   * Normalize sheet enum/status tokens before comparison.
   * "Active", "ACTIVE", " active ", "On Hold" → active / on_hold
   */
  function normalizeToken_(value) {
    return String(value == null ? "" : value)
      .replace(/\u00a0/g, " ")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
  }

  /** Read a field with case-insensitive key fallback (status / Status / STATUS). */
  function fieldValue_(row, key) {
    if (!row || typeof row !== "object") return "";
    if (row[key] != null && row[key] !== "") return row[key];

    var want = String(key).toLowerCase();
    for (var prop in row) {
      if (!Object.prototype.hasOwnProperty.call(row, prop)) continue;
      if (String(prop).toLowerCase() === want) {
        return row[prop];
      }
    }
    return "";
  }

  function rowStatus_(row) {
    return fieldValue_(row, "status");
  }

  function toIsoUtc_(value, fallback) {
    fallback = fallback || new Date().toISOString();
    if (value == null || value === "") return fallback;
    if (Object.prototype.toString.call(value) === "[object Date]") {
      var t = value.getTime();
      return isNaN(t) ? fallback : value.toISOString();
    }
    if (typeof value === "number" && isFinite(value)) {
      var fromNumber = new Date(value);
      return isNaN(fromNumber.getTime()) ? fallback : fromNumber.toISOString();
    }
    var text = String(value).trim();
    if (!text) return fallback;
    var parsed = new Date(text);
    return isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
  }

  function ageInSeconds_(generatedAt, nowMs) {
    nowMs = nowMs || Date.now();
    var ms = Date.parse(generatedAt);
    if (isNaN(ms)) return 0;
    return Math.max(0, Math.floor((nowMs - ms) / 1000));
  }

  /** Facilities / users: Active / ACTIVE / active (and operational synonyms). */
  function isActiveEntityStatus_(status) {
    var token = normalizeToken_(status);
    if (!token) return false;
    if (INACTIVE_ENTITY[token]) return false;
    return !!ACTIVE_ENTITY[token];
  }

  /** Assets: Operational / OPERATIONAL / Active / active count as operational. */
  function isOperationalAssetStatus_(status) {
    var token = normalizeToken_(status);
    if (!token) return false;
    if (INACTIVE_ENTITY[token]) return false;
    return !!(OPERATIONAL_ASSET[token] || ACTIVE_ENTITY[token]);
  }

  function dayKey_(iso, asOf) {
    return toIsoUtc_(iso || asOf, asOf).slice(0, 10);
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
    return !!OPEN_WO[normalizeToken_(rowStatus_(wo))];
  }

  function isMaintenanceBacklog_(row) {
    return !!BACKLOG_MNT[normalizeToken_(rowStatus_(row))];
  }

  function isCriticalOpenIncident_(incident) {
    return (
      normalizeToken_(fieldValue_(incident, "severity")) === "critical" &&
      !CLOSED_INCIDENT[normalizeToken_(rowStatus_(incident))]
    );
  }

  function isOnHold_(status) {
    return normalizeToken_(status) === "on_hold";
  }

  function isHighOrCritical_(priority) {
    var token = normalizeToken_(priority);
    return token === "high" || token === "critical";
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

  function scriptCache_() {
    return CacheService.getScriptCache();
  }

  /** Constant CacheService key — must not change between consecutive getSnapshot calls. */
  function snapshotCacheKey_(facilityId) {
    if (facilityId) return CACHE_KEY_FAC_PREFIX + String(facilityId);
    return CACHE_KEY_PORTFOLIO;
  }

  function invalidateSnapshotCache_() {
    try {
      var cache = scriptCache_();
      // Constant-key invalidation (do NOT rotate keys via PropertiesService epoch).
      cache.remove(CACHE_KEY_PORTFOLIO);
      Logger.log(
        "[REPORTING_SNAPSHOT] cache invalidated key=" + CACHE_KEY_PORTFOLIO
      );
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache invalidate failed: " + err);
    }
  }

  function markCacheStatus_(snapshot, status) {
    if (!snapshot) return snapshot;
    if (!snapshot._snapshotMeta) {
      snapshot._snapshotMeta = { source: "REPORTING_SNAPSHOT" };
    }
    snapshot._snapshotMeta.cache = status;
    return snapshot;
  }

  function readCachedSnapshot_(facilityId) {
    try {
      var key = snapshotCacheKey_(facilityId);
      var text = SheetFieldUtils.cacheGetUtf8(scriptCache_(), key);
      if (!text) {
        Logger.log("[REPORTING_SNAPSHOT] cache MISS key=" + key);
        return null;
      }
      var parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || !parsed.kpis) {
        Logger.log("[REPORTING_SNAPSHOT] cache invalid payload key=" + key);
        return null;
      }
      if (parsed._snapshotMeta) {
        parsed._snapshotMeta.ageInSeconds = ageInSeconds_(
          parsed._snapshotMeta.generatedAt || parsed.asOf
        );
        parsed._snapshotMeta.source =
          parsed._snapshotMeta.source || "REPORTING_SNAPSHOT";
      }
      Logger.log("[REPORTING_SNAPSHOT] cache HIT key=" + key);
      return parsed;
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache read failed: " + err);
      return null;
    }
  }

  function writeCachedSnapshot_(facilityId, snapshot) {
    try {
      if (!snapshot) return false;
      // Never persist transient cache status into the stored value.
      if (snapshot._snapshotMeta && snapshot._snapshotMeta.cache) {
        delete snapshot._snapshotMeta.cache;
      }
      var text = JSON.stringify(snapshot);
      if (!text) {
        return false;
      }
      // UTF-8 → base64 expands size; leave headroom under CacheService ~100KB.
      var encodedLengthEstimate = Math.ceil((text.length * 4) / 3) + 8;
      if (
        text.length > CACHE_MAX_CHARS ||
        encodedLengthEstimate > CACHE_MAX_CHARS
      ) {
        Logger.log(
          "[REPORTING_SNAPSHOT] skip cache write - payload too large (" +
            text.length +
            " chars)"
        );
        return false;
      }
      var key = snapshotCacheKey_(facilityId);
      var cache = scriptCache_();
      // CacheService is ByteString/Latin-1 safe only — encode Unicode first.
      SheetFieldUtils.cachePutUtf8(cache, key, text, CACHE_TTL_SECONDS);
      // Verify immediately - silent put failures are the usual cause of "no speedup".
      var verify = SheetFieldUtils.cacheGetUtf8(cache, key);
      if (!verify || verify.length !== text.length) {
        Logger.log(
          "[REPORTING_SNAPSHOT] cache put VERIFY FAILED key=" +
            key +
            " wrote=" +
            text.length +
            " read=" +
            (verify ? verify.length : 0)
        );
        return false;
      }
      Logger.log(
        "[REPORTING_SNAPSHOT] cache put ok key=" +
          key +
          " chars=" +
          text.length +
          " ttl=" +
          CACHE_TTL_SECONDS
      );
      return true;
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] cache write failed: " + err);
      return false;
    }
  }

  function computeKpis_(asOf, rows) {
    asOf = toIsoUtc_(asOf);
    var facilities = rows.facilities || [];
    var assets = rows.assets || [];
    var incidents = rows.incidents || [];
    var maintenance = rows.maintenance || [];
    var workOrders = rows.workOrders || [];
    var users = rows.users || [];

    var activeFacilities = facilities.filter(function (f) {
      return isActiveEntityStatus_(rowStatus_(f));
    }).length;
    var activeAssets = assets.filter(function (a) {
      return isOperationalAssetStatus_(rowStatus_(a));
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
        return normalizeToken_(fieldValue_(a, "condition")) === "poor";
      }).length,
      activeWorkforce: users.filter(function (u) {
        return isActiveEntityStatus_(rowStatus_(u));
      }).length,
      totalUsers: users.length,
      openWorkOrders: openWorkOrders.length,
      workOrdersCreatedToday: workOrders.filter(function (wo) {
        return isSameDay_(
          fieldValue_(wo, "createdAt") || fieldValue_(wo, "requestedAt"),
          asOf
        );
      }).length,
      workOrdersDueToday: openWorkOrders.filter(function (wo) {
        return isSameDay_(fieldValue_(wo, "dueAt"), asOf);
      }).length,
      overdueWorkOrders: openWorkOrders.filter(function (wo) {
        return isBeforeDay_(fieldValue_(wo, "dueAt"), asOf);
      }).length,
      criticalIncidents: criticalOpen.length,
      criticalIncidentsUnassigned: criticalOpen.filter(function (incident) {
        return !String(fieldValue_(incident, "assignedToUserId") || "").trim();
      }).length,
      incidentsNeedingWorkOrder: incidents.filter(function (incident) {
        var requiresRaw = fieldValue_(incident, "requiresWorkOrder");
        var requires =
          requiresRaw === true || normalizeToken_(requiresRaw) === "true";
        return (
          !CLOSED_INCIDENT[normalizeToken_(rowStatus_(incident))] &&
          requires &&
          !String(fieldValue_(incident, "workOrderId") || "").trim()
        );
      }).length,
      maintenanceBacklog: backlog.length,
      overdueMaintenance: backlog.filter(function (row) {
        return isBeforeDay_(fieldValue_(row, "dueAt"), asOf);
      }).length,
      maintenanceOnHold: maintenance.filter(function (row) {
        return isOnHold_(rowStatus_(row));
      }).length,
      workOrdersOnHold: workOrders.filter(function (wo) {
        return isOnHold_(rowStatus_(wo));
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
    return normalizeToken_(value)
      .split("_")
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(" ");
  }

  function toneFromPriority_(priority) {
    var p = normalizeToken_(priority);
    if (p === "critical") return "danger";
    if (p === "high") return "warning";
    if (p === "medium") return "info";
    return "neutral";
  }

  /** Newest first; stable secondary key for deterministic ordering. */
  function sortByDateDesc_(rows, getDate, getTieBreaker) {
    return (rows || []).slice().sort(function (a, b) {
      var left = toIsoUtc_(getDate(a) || "", "1970-01-01T00:00:00.000Z");
      var right = toIsoUtc_(getDate(b) || "", "1970-01-01T00:00:00.000Z");
      if (left < right) return 1;
      if (left > right) return -1;
      var leftId = String(getTieBreaker ? getTieBreaker(a) : "");
      var rightId = String(getTieBreaker ? getTieBreaker(b) : "");
      if (leftId < rightId) return -1;
      if (leftId > rightId) return 1;
      return 0;
    });
  }

  function projectWorkOrder_(wo) {
    var status = normalizeToken_(rowStatus_(wo));
    var priority = normalizeToken_(fieldValue_(wo, "priority"));
    return {
      module: "work-orders",
      entityId: wo.id,
      title: wo.title || wo.id,
      status: status,
      priority: priority,
      facilityId: fieldValue_(wo, "facilityId") || wo.facilityId,
      meta: labelize_(priority) + " · " + labelize_(status),
      reportedAt: fieldValue_(wo, "requestedAt")
        ? toIsoUtc_(fieldValue_(wo, "requestedAt"))
        : fieldValue_(wo, "requestedAt"),
      tone: toneFromPriority_(priority),
    };
  }

  function projectMaintenance_(row) {
    var status = normalizeToken_(rowStatus_(row));
    var priority = normalizeToken_(fieldValue_(row, "priority"));
    return {
      module: "maintenance",
      entityId: row.id,
      title: row.title || row.id,
      status: status,
      priority: priority,
      facilityId: fieldValue_(row, "facilityId") || row.facilityId,
      meta: labelize_(priority) + " · " + labelize_(status),
      reportedAt: fieldValue_(row, "reportedAt")
        ? toIsoUtc_(fieldValue_(row, "reportedAt"))
        : fieldValue_(row, "reportedAt"),
      tone: toneFromPriority_(priority),
    };
  }

  function projectIncident_(incident) {
    var status = normalizeToken_(rowStatus_(incident));
    var severity = normalizeToken_(fieldValue_(incident, "severity"));
    return {
      module: "incidents",
      entityId: incident.id,
      title: incident.title || incident.id,
      status: status,
      priority: severity,
      facilityId: fieldValue_(incident, "facilityId") || incident.facilityId,
      meta: labelize_(severity) + " · " + labelize_(status),
      reportedAt: fieldValue_(incident, "reportedAt")
        ? toIsoUtc_(fieldValue_(incident, "reportedAt"))
        : fieldValue_(incident, "reportedAt"),
      tone: toneFromPriority_(severity),
    };
  }

  function computeProjections_(asOf, rows) {
    asOf = toIsoUtc_(asOf);
    var incidents = rows.incidents || [];
    var maintenance = rows.maintenance || [];
    var workOrders = rows.workOrders || [];
    var LIST_LIMIT = 5;

    function isOverdueWo(wo) {
      return (
        isOpenWorkOrder_(wo) &&
        fieldValue_(wo, "dueAt") &&
        isBeforeDay_(fieldValue_(wo, "dueAt"), asOf)
      );
    }
    function isOverdueMnt(row) {
      return (
        isMaintenanceBacklog_(row) &&
        fieldValue_(row, "dueAt") &&
        isBeforeDay_(fieldValue_(row, "dueAt"), asOf)
      );
    }

    var overdueWorkOrders = sortByDateDesc_(
      workOrders.filter(isOverdueWo),
      function (wo) {
        return (
          fieldValue_(wo, "dueAt") ||
          fieldValue_(wo, "requestedAt") ||
          fieldValue_(wo, "createdAt")
        );
      },
      function (wo) {
        return wo.id;
      }
    )
      .slice(0, LIST_LIMIT)
      .map(projectWorkOrder_);

    var maintenanceAttention = sortByDateDesc_(
      maintenance.filter(function (row) {
        return (
          isOverdueMnt(row) ||
          isOnHold_(rowStatus_(row)) ||
          isHighOrCritical_(fieldValue_(row, "priority"))
        );
      }),
      function (row) {
        return (
          fieldValue_(row, "dueAt") ||
          fieldValue_(row, "reportedAt") ||
          fieldValue_(row, "createdAt")
        );
      },
      function (row) {
        return row.id;
      }
    )
      .slice(0, LIST_LIMIT)
      .map(projectMaintenance_);

    var blockedItems = sortByDateDesc_(
      workOrders
        .filter(function (wo) {
          return isOnHold_(rowStatus_(wo));
        })
        .map(projectWorkOrder_)
        .concat(
          maintenance
            .filter(function (row) {
              return isOnHold_(rowStatus_(row));
            })
            .map(projectMaintenance_)
        ),
      function (item) {
        return item.reportedAt;
      },
      function (item) {
        return item.entityId;
      }
    ).slice(0, LIST_LIMIT);

    return {
      criticalIncidents: sortByDateDesc_(
        incidents.filter(isCriticalOpenIncident_),
        function (incident) {
          return (
            fieldValue_(incident, "reportedAt") ||
            fieldValue_(incident, "createdAt")
          );
        },
        function (incident) {
          return incident.id;
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
          return (
            fieldValue_(wo, "requestedAt") || fieldValue_(wo, "createdAt")
          );
        },
        function (wo) {
          return wo.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectWorkOrder_),
      latestActiveMaintenance: sortByDateDesc_(
        maintenance.filter(isMaintenanceBacklog_),
        function (row) {
          return (
            fieldValue_(row, "reportedAt") || fieldValue_(row, "createdAt")
          );
        },
        function (row) {
          return row.id;
        }
      )
        .slice(0, LIST_LIMIT)
        .map(projectMaintenance_),
    };
  }

  function filterByFacilityId_(rows, facilityId) {
    if (!facilityId) return rows || [];
    return (rows || []).filter(function (row) {
      var rowFacilityId = fieldValue_(row, "facilityId");
      if (rowFacilityId && String(rowFacilityId) === String(facilityId)) {
        return true;
      }
      var rowFacility = fieldValue_(row, "facility");
      if (rowFacility && String(rowFacility) === String(facilityId)) {
        return true;
      }
      return false;
    });
  }

  function assembleSnapshot_(parts, facilityId) {
    var asOf = toIsoUtc_(
      (parts.meta && parts.meta.asOf) || new Date().toISOString()
    );
    var generatedAt = toIsoUtc_(
      (parts.meta && parts.meta.generatedAt) || asOf,
      asOf
    );
    var version =
      (parts.meta && (parts.meta.snapshotVersion || parts.meta.version)) ||
      generatedAt;

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

    var scopedRows = {
      users: users,
      facilities: facilities,
      assets: assets,
      incidents: incidents,
      maintenance: maintenance,
      workOrders: workOrders,
    };

    // Facility-scoped views must recompute. Portfolio prefers sheet-stored
    // derived fields (already refreshed on notifyModuleChanged / rebuild).
    var kpis;
    var projections;
    var health;
    if (facilityId || !parts.kpis || !parts.projections || !parts.health) {
      kpis = computeKpis_(asOf, scopedRows);
      projections = computeProjections_(asOf, scopedRows);
      health = computeHealth_(kpis);
    } else {
      kpis = parts.kpis;
      projections = parts.projections;
      health = parts.health;
    }

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
        generatedAt: generatedAt,
        ageInSeconds: ageInSeconds_(generatedAt),
        snapshotVersion: version,
        scope: ReportingSnapshotRepository.SCOPE_PORTFOLIO,
      },
    };
  }

  function persistAssembled_(snapshot, version) {
    if (!snapshot || snapshot.facilityId) return;
    try {
      ReportingSnapshotRepository.writeAssembled(
        snapshot,
        version || Date.now()
      );
    } catch (err) {
      Logger.log("[REPORTING_SNAPSHOT] writeAssembled failed: " + err);
    }
  }

  function touchAssembledMeta_(snapshot) {
    if (!snapshot) return null;
    if (snapshot._snapshotMeta) {
      snapshot._snapshotMeta.ageInSeconds = ageInSeconds_(
        snapshot._snapshotMeta.generatedAt || snapshot.asOf
      );
      snapshot._snapshotMeta.source =
        snapshot._snapshotMeta.source || "REPORTING_SNAPSHOT";
    }
    return snapshot;
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
        snapshotVersion: version,
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
            snapshotVersion: version,
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

      invalidateSnapshotCache_();
      // Skip assembled section — it is stale until we rewrite it below.
      var snapshot = getSnapshotFromSheetUnlocked_({}, { skipAssembled: true });
      if (snapshot) {
        persistAssembled_(snapshot, version);
        writeCachedSnapshot_(undefined, snapshot);
      }

      Logger.log(
        "[REPORTING_SNAPSHOT] full rebuild done " +
          (Date.now() - started) +
          "ms"
      );
      return snapshot;
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
      invalidateSnapshotCache_();

      // Skip assembled section — it is stale until we rewrite it below.
      var snapshot = getSnapshotFromSheetUnlocked_({}, { skipAssembled: true });
      if (snapshot) {
        persistAssembled_(snapshot, version);
        writeCachedSnapshot_(undefined, snapshot);
      }

      Logger.log(
        "[REPORTING_SNAPSHOT] partial refresh done module=" +
          section +
          " " +
          (Date.now() - started) +
          "ms"
      );
      return snapshot;
    });
  }

  /** Sheet-backed assemble — used on cache miss / after rebuild. */
  function getSnapshotFromSheetUnlocked_(payload, options) {
    payload = payload || {};
    options = options || {};
    var facilityId = payload.facilityId;

    // Prefer pre-serialized portfolio JSON (one section) over multi-section assemble.
    if (!facilityId && !options.skipAssembled) {
      var assembled = touchAssembledMeta_(
        ReportingSnapshotRepository.readAssembled()
      );
      if (assembled && assembled.kpis) {
        return assembled;
      }
    }

    var parts = ReportingSnapshotRepository.readFull();
    if (!parts || !parts.meta || !parts.kpis) {
      return null;
    }
    // Sheet assemble only — do NOT write assembled/cache here.
    // GET must stay read-only aside from CacheService.put in getSnapshot().
    return assembleSnapshot_(parts, facilityId);
  }

  function getSnapshot(payload) {
    payload = payload || {};
    var facilityId = payload.facilityId;

    // 1) CacheService — constant key, no sheet I/O
    var cached = readCachedSnapshot_(facilityId);
    if (cached) {
      return markCacheStatus_(cached, "HIT");
    }

    // 2) Pre-serialized assembled section, else single-pass sheet assemble
    var existing = getSnapshotFromSheetUnlocked_(payload);
    if (existing) {
      writeCachedSnapshot_(facilityId, existing);
      return markCacheStatus_(existing, "MISS");
    }

    Logger.log("[REPORTING_SNAPSHOT] sheet miss — rebuilding");
    var rebuilt = rebuildAll();
    return markCacheStatus_(rebuilt, "MISS");
  }

  /**
   * Read-only operational diagnostics.
   * Does NOT rebuild, does NOT invalidate cache, does NOT write CacheService.
   */
  function diagnostics(payload) {
    payload = payload || {};
    var facilityId = payload.facilityId;
    var started = Date.now();

    var cacheReadStarted = Date.now();
    var cached = readCachedSnapshot_(facilityId);
    var cacheReadMs = Date.now() - cacheReadStarted;

    var snapshot = null;
    var cacheStatus = "MISS";
    var snapshotReadMs = 0;

    if (cached) {
      snapshot = cached;
      cacheStatus = "HIT";
    } else {
      var sheetReadStarted = Date.now();
      // Read-only sheet path — never put cache / never rebuild.
      snapshot = getSnapshotFromSheetUnlocked_(payload);
      snapshotReadMs = Date.now() - sheetReadStarted;
    }

    var meta = (snapshot && snapshot._snapshotMeta) || {};
    var generatedAt =
      (meta && meta.generatedAt) || (snapshot && snapshot.asOf) || null;

    return {
      snapshotVersion:
        meta.snapshotVersion != null ? meta.snapshotVersion : null,
      generatedAt: generatedAt,
      snapshotAgeSeconds: generatedAt ? ageInSeconds_(generatedAt) : null,
      cacheStatus: cacheStatus,
      snapshotSource: meta.source || (snapshot ? "REPORTING_SNAPSHOT" : null),
      users: snapshot && snapshot.users ? snapshot.users.length : 0,
      facilities:
        snapshot && snapshot.facilities ? snapshot.facilities.length : 0,
      assets: snapshot && snapshot.assets ? snapshot.assets.length : 0,
      incidents:
        snapshot && snapshot.incidents ? snapshot.incidents.length : 0,
      maintenance:
        snapshot && snapshot.maintenance ? snapshot.maintenance.length : 0,
      workOrders:
        snapshot && snapshot.workOrders ? snapshot.workOrders.length : 0,
      appsScriptExecutionMs: Date.now() - started,
      cacheReadMs: cacheReadMs,
      snapshotReadMs: snapshotReadMs,
    };
  }

  /**
   * Fire-and-forget style wrapper for domain service hooks.
   * Never throws into CRUD paths.
   */
  function notifyModuleChanged(module) {
    try {
      // refreshModule invalidates + repopulates CacheService.
      refreshModule(module);
    } catch (err) {
      try {
        invalidateSnapshotCache_();
      } catch (ignore) {}
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
    diagnostics: diagnostics,
    notifyModuleChanged: notifyModuleChanged,
  };
})();
