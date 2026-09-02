/**
 * OperationalWorkloadService.gs
 *
 * Bounded workload summary for People / Assets list enrichment.
 * Scans operational sheets once per request; returns counts only for
 * requested entity IDs (no full-catalog fan-out to the client).
 *
 * BUILD: 2026-09-02-phase33-operational-workload-v1
 */

var OperationalWorkloadService = (function () {
  var BUILD_MARKER = "2026-09-02-phase33-operational-workload-v1";

  var ACTIVE_WO = {
    draft: true,
    open: true,
    assigned: true,
    in_progress: true,
    on_hold: true,
  };

  var ACTIVE_MNT = {
    requested: true,
    triaged: true,
    scheduled: true,
    in_progress: true,
    on_hold: true,
  };

  var ACTIVE_INC = {
    reported: true,
    triaged: true,
    investigating: true,
    contained: true,
  };

  function normalizeStatus_(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
  }

  function isActive_(status, map) {
    return !!map[normalizeStatus_(status)];
  }

  function isCanonicalUserId_(id) {
    var value = String(id || "").trim();
    if (!value) return false;
    if (/^USR-/i.test(value)) return true;
    if (/\s/.test(value)) return false;
    if (/^[A-Za-z][A-Za-z.'-]+$/.test(value) && !/^\d/.test(value)) return false;
    return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
  }

  function isCanonicalAssetId_(id) {
    var value = String(id || "").trim();
    if (!value) return false;
    if (/^AST-/i.test(value)) return true;
    if (/\s/.test(value)) return false;
    return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value);
  }

  function toSet_(ids) {
    var set = {};
    var i;
    for (i = 0; i < (ids || []).length; i++) {
      var id = String(ids[i] || "").trim();
      if (id) set[id] = true;
    }
    return set;
  }

  function emptyBreakdown_() {
    return { workOrders: 0, maintenance: 0, incidents: 0 };
  }

  function ensureUserEvidence_(map, evidence, userId) {
    if (!map[userId]) {
      map[userId] = 0;
      evidence[userId] = { count: 0, workOrderIds: [] };
    }
  }

  function ensureAssetEvidence_(map, evidence, assetId) {
    if (!map[assetId]) {
      map[assetId] = {
        activeWorkload: 0,
        workloadBreakdown: emptyBreakdown_(),
      };
      evidence[assetId] = {
        activeWorkload: 0,
        workloadBreakdown: emptyBreakdown_(),
        workOrderIds: [],
        maintenanceIds: [],
        incidentIds: [],
      };
    }
  }

  function bumpUser_(byUserId, byUserIdEvidence, userId, workOrderId) {
    if (!isCanonicalUserId_(userId)) return;
    var id = String(userId).trim();
    ensureUserEvidence_(byUserId, byUserIdEvidence, id);
    byUserId[id] += 1;
    byUserIdEvidence[id].count += 1;
    byUserIdEvidence[id].workOrderIds.push(workOrderId);
  }

  function bumpAssetWo_(byAssetId, byAssetIdEvidence, assetId, workOrderId) {
    if (!isCanonicalAssetId_(assetId)) return;
    var id = String(assetId).trim();
    ensureAssetEvidence_(byAssetId, byAssetIdEvidence, id);
    byAssetId[id].workloadBreakdown.workOrders += 1;
    byAssetId[id].activeWorkload += 1;
    byAssetIdEvidence[id].workloadBreakdown.workOrders += 1;
    byAssetIdEvidence[id].activeWorkload += 1;
    byAssetIdEvidence[id].workOrderIds.push(workOrderId);
  }

  function bumpAssetMnt_(byAssetId, byAssetIdEvidence, assetId, maintenanceId) {
    if (!isCanonicalAssetId_(assetId)) return;
    var id = String(assetId).trim();
    ensureAssetEvidence_(byAssetId, byAssetIdEvidence, id);
    byAssetId[id].workloadBreakdown.maintenance += 1;
    byAssetId[id].activeWorkload += 1;
    byAssetIdEvidence[id].workloadBreakdown.maintenance += 1;
    byAssetIdEvidence[id].activeWorkload += 1;
    byAssetIdEvidence[id].maintenanceIds.push(maintenanceId);
  }

  function bumpAssetInc_(byAssetId, byAssetIdEvidence, assetId, incidentId) {
    if (!isCanonicalAssetId_(assetId)) return;
    var id = String(assetId).trim();
    ensureAssetEvidence_(byAssetId, byAssetIdEvidence, id);
    byAssetId[id].workloadBreakdown.incidents += 1;
    byAssetId[id].activeWorkload += 1;
    byAssetIdEvidence[id].workloadBreakdown.incidents += 1;
    byAssetIdEvidence[id].activeWorkload += 1;
    byAssetIdEvidence[id].incidentIds.push(incidentId);
  }

  /**
   * Return workload summaries for requested People / Asset IDs only.
   * payload: { assetIds?: string[], userIds?: string[] }
   */
  function getEntitySummary(payload) {
    payload = payload || {};
    var assetSet = toSet_(payload.assetIds);
    var userSet = toSet_(payload.userIds);
    var wantAssets = Object.keys(assetSet).length > 0;
    var wantUsers = Object.keys(userSet).length > 0;

    var byUserId = {};
    var byUserIdEvidence = {};
    var byAssetId = {};
    var byAssetIdEvidence = {};

    if (!wantAssets && !wantUsers) {
      return {
        byUserId: byUserId,
        byUserIdEvidence: byUserIdEvidence,
        byAssetId: byAssetId,
        byAssetIdEvidence: byAssetIdEvidence,
        _buildMarker: BUILD_MARKER,
      };
    }

    if (wantUsers && typeof WorkOrderRepository !== "undefined") {
      var workOrders = WorkOrderRepository.getAll() || [];
      var w;
      for (w = 0; w < workOrders.length; w++) {
        var wo = workOrders[w];
        if (!wo || !wo.id) continue;
        if (!isActive_(wo.status, ACTIVE_WO)) continue;
        if (userSet[String(wo.assignedToUserId || "").trim()]) {
          bumpUser_(byUserId, byUserIdEvidence, wo.assignedToUserId, wo.id);
        }
      }
    }

    if (wantAssets) {
      if (typeof WorkOrderRepository !== "undefined") {
        var woRows = WorkOrderRepository.getAll() || [];
        var wi;
        for (wi = 0; wi < woRows.length; wi++) {
          var woRow = woRows[wi];
          if (!woRow || !woRow.id) continue;
          if (!isActive_(woRow.status, ACTIVE_WO)) continue;
          var woAssetId = String(woRow.assetId || "").trim();
          if (assetSet[woAssetId]) {
            bumpAssetWo_(byAssetId, byAssetIdEvidence, woAssetId, woRow.id);
          }
        }
      }

      if (typeof MaintenanceRepository !== "undefined") {
        var mntRows = MaintenanceRepository.getAll() || [];
        var mi;
        for (mi = 0; mi < mntRows.length; mi++) {
          var mnt = mntRows[mi];
          if (!mnt || !mnt.id) continue;
          if (!isActive_(mnt.status, ACTIVE_MNT)) continue;
          var mntAssetId = String(mnt.assetId || "").trim();
          if (assetSet[mntAssetId]) {
            bumpAssetMnt_(byAssetId, byAssetIdEvidence, mntAssetId, mnt.id);
          }
        }
      }

      if (typeof IncidentRepository !== "undefined") {
        var incRows = IncidentRepository.getAll() || [];
        var ii;
        for (ii = 0; ii < incRows.length; ii++) {
          var inc = incRows[ii];
          if (!inc || !inc.id) continue;
          if (!isActive_(inc.status, ACTIVE_INC)) continue;
          var incAssetId = String(inc.assetId || "").trim();
          if (assetSet[incAssetId]) {
            bumpAssetInc_(byAssetId, byAssetIdEvidence, incAssetId, inc.id);
          }
        }
      }
    }

    return {
      byUserId: byUserId,
      byUserIdEvidence: byUserIdEvidence,
      byAssetId: byAssetId,
      byAssetIdEvidence: byAssetIdEvidence,
      _buildMarker: BUILD_MARKER,
    };
  }

  return {
    BUILD_MARKER: BUILD_MARKER,
    getEntitySummary: getEntitySummary,
  };
})();
