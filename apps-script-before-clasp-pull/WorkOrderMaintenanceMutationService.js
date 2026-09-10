/**
 * WorkOrderMaintenanceMutationService.gs
 *
 * Consolidated Create Work Order from Maintenance mutation (Phase 28D).
 *
 * Contract:
 *   resource: "work-orders"
 *   action:   "createFromMaintenance"
 *   payload: {
 *     maintenanceId: string,
 *     title?: string,
 *     requestedAt?: string,
 *     createdByUserId?: string,
 *     updatedByUserId?: string,
 *     actorUserId?: string
 *   }
 *
 * Ordering (single Apps Script invocation):
 *   Load Maintenance
 *     → idempotent return if linked WO exists
 *     → create Work Order (maintenanceId set)
 *     → update Maintenance backlink (workOrderIds merge)
 *     → verify reciprocal references
 *
 * LockService.getScriptLock() covers the mutation only — not a transaction.
 * Supabase operational_action_leases remain on the Next.js side.
 *
 * BUILD: 2026-09-01-phase29-wo-mutation-v1
 */

var WorkOrderMaintenanceMutationService = (function () {
  var BUILD_MARKER = "2026-09-01-phase29-wo-mutation-v1";
  var LOCK_WAIT_MS = 30000;

  function cell_(value) {
    if (value == null) return "";
    return String(value).trim();
  }

  function nowIso_() {
    return new Date().toISOString();
  }

  function parseDescriptionNotes_(description) {
    var text = cell_(description);
    var notes = { body: "", location: "", category: "" };
    if (!text) return notes;

    var blocks = text.split(/\n\n+/);
    var bodyParts = [];
    var i;
    for (i = 0; i < blocks.length; i++) {
      var block = cell_(blocks[i]);
      if (!block) continue;
      var lines = block.split(/\n+/);
      var j;
      var matchedStructured = false;
      for (j = 0; j < lines.length; j++) {
        var line = cell_(lines[j]);
        var match = line.match(
          /^(Location|Category|Attachment|Requested by|Reported by)\s*:\s*(.+)$/i
        );
        if (match) {
          matchedStructured = true;
          var label = String(match[1] || "").toLowerCase();
          var value = cell_(match[2]);
          if (label === "location") notes.location = value;
          if (label === "category") notes.category = value;
        }
      }
      if (!matchedStructured) bodyParts.push(block);
    }
    notes.body = bodyParts.join("\n\n");
    return notes;
  }

  function displayMaintenanceTitle_(maintenance) {
    var rawTitle = cell_(maintenance.title);
    var description = cell_(maintenance.description);
    var notesFromDescription = parseDescriptionNotes_(description);
    var notesFromTitle = parseDescriptionNotes_(rawTitle);

    if (!rawTitle) {
      return notesFromDescription.body || "Untitled";
    }

    var titleLooksLikeDescription =
      Boolean(description) &&
      (rawTitle === description ||
        notesFromTitle.location ||
        notesFromTitle.category);

    if (titleLooksLikeDescription) {
      return (
        notesFromTitle.body ||
        notesFromDescription.body ||
        cell_(rawTitle.split(/\n+/)[0]) ||
        "Untitled"
      );
    }

    if (rawTitle.indexOf("\n") === -1) return rawTitle;
    return cell_(rawTitle.split(/\n+/)[0]) || "Untitled";
  }

  function mapMaintenanceTypeToWoType_(type) {
    var map = {
      preventive: "preventive",
      corrective: "corrective",
      inspection: "inspection",
      predictive: "preventive",
      routine: "preventive",
      other: "other",
    };
    return map[String(type || "").toLowerCase()] || "corrective";
  }

  function mapMaintenanceSourceToWoSource_(source) {
    var s = String(source || "").toLowerCase();
    if (s === "incident") return "incident";
    if (s === "request") return "request";
    return "manual";
  }

  function buildWorkOrderPayload_(maintenance, payload) {
    payload = payload || {};
    var notes = parseDescriptionNotes_(maintenance.description);
    var title = cell_(payload.title) || displayMaintenanceTitle_(maintenance);
    if (title.length > 200) title = title.slice(0, 200);

    var descriptionParts = [];
    if (notes.body) descriptionParts.push(notes.body);
    if (notes.location) descriptionParts.push("Location: " + notes.location);
    if (cell_(maintenance.department)) {
      descriptionParts.push("Department: " + maintenance.department);
    }
    if (notes.category) descriptionParts.push("Category: " + notes.category);
    descriptionParts.push("Source maintenance: " + maintenance.id);

    var maintType = String(maintenance.type || "").toLowerCase();
    var maintenanceType =
      maintType === "preventive" ||
      maintType === "routine" ||
      maintType === "predictive"
        ? "planned"
        : "unplanned";

    var actor =
      cell_(payload.updatedByUserId) ||
      cell_(payload.createdByUserId) ||
      cell_(payload.actorUserId);

    return {
      title: title,
      description: descriptionParts.join("\n\n") || undefined,
      type: mapMaintenanceTypeToWoType_(maintenance.type),
      maintenanceType: maintenanceType,
      source: mapMaintenanceSourceToWoSource_(maintenance.source),
      facilityId: maintenance.facilityId,
      assetId: maintenance.assetId || "",
      maintenanceId: maintenance.id,
      incidentId: maintenance.incidentId || "",
      reportedByUserId: maintenance.reportedByUserId || "",
      assignedToUserId: maintenance.assignedToUserId || "",
      priority: maintenance.priority || "medium",
      status: "open",
      requestedAt: cell_(payload.requestedAt) || nowIso_(),
      createdByUserId: actor,
      updatedByUserId: actor,
    };
  }

  function existingWorkOrderId_(maintenance) {
    if (!maintenance) return "";
    if (cell_(maintenance.workOrderId)) return cell_(maintenance.workOrderId);
    var ids = maintenance.workOrderIds;
    if (ids && ids.length) return cell_(ids[0]);
    return "";
  }

  function invalidateCaches_() {
    if (typeof OperationalRegisterCache !== "undefined") {
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.workOrders
      );
      OperationalRegisterCache.invalidate(
        OperationalRegisterCache.NAMESPACES.maintenance
      );
    }
  }

  function notifySnapshots_() {
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("workOrders");
      ReportingSnapshotService.notifyModuleChanged("maintenance");
    }
  }

  function compensateClearWoMaintenanceLink_(workOrderId) {
    try {
      WorkOrderRepository.update(workOrderId, { maintenanceId: "" });
      return { attempted: true, cleared: true };
    } catch (err) {
      return {
        attempted: true,
        cleared: false,
        error: (err && err.message) || String(err),
      };
    }
  }

  function verifyReciprocalLinks_(maintenance, workOrder) {
    if (cell_(workOrder.maintenanceId) !== cell_(maintenance.id)) {
      throw new Error(
        "Work Order backlink integrity failure: expected maintenanceId " +
          maintenance.id +
          ", got " +
          workOrder.maintenanceId
      );
    }
    var ids = maintenance.workOrderIds || [];
    var primary = cell_(maintenance.workOrderId) || cell_(ids[0]);
    var includes =
      primary === workOrder.id ||
      ids.some(function (id) {
        return cell_(id) === workOrder.id;
      });
    if (!includes) {
      throw new Error(
        "Maintenance backlink integrity failure: workOrderIds missing " +
          workOrder.id
      );
    }
  }

  function createFromMaintenance(payload) {
    var tWall0 = Date.now();
    payload = payload || {};

    var maintenanceId = cell_(payload.maintenanceId);
    if (!maintenanceId) throw new Error("maintenanceId is required.");

    var timings = {
      buildMarker: BUILD_MARKER,
      lockAcquireMs: 0,
      maintenanceReadMs: 0,
      validateMs: 0,
      payloadBuildMs: 0,
      workOrderCreateMs: 0,
      maintenanceUpdateMs: 0,
      verifyMs: 0,
      responseBuildMs: 0,
      compensationMs: 0,
      cacheNotifyMs: 0,
      serverTotalMs: 0,
      heldLockMs: 0,
    };

    var tLock0 = Date.now();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      throw new Error(
        "createFromMaintenance busy — another mutation holds the script lock."
      );
    }
    timings.lockAcquireMs = Date.now() - tLock0;
    var tHeld0 = Date.now();

    var workOrder = null;
    var createdNewWorkOrder = false;

    try {
      var tRead0 = Date.now();
      var maintenance = MaintenanceRepository.getById(maintenanceId);
      timings.maintenanceReadMs = Date.now() - tRead0;
      if (!maintenance) {
        throw new Error("Maintenance " + maintenanceId + " not found.");
      }

      var tVal0 = Date.now();
      var existingId = existingWorkOrderId_(maintenance);
      if (existingId) {
        var existingWo = WorkOrderRepository.getById(existingId);
        if (existingWo) {
          timings.validateMs = Date.now() - tVal0;
          timings.heldLockMs = Date.now() - tHeld0;
          timings.serverTotalMs = Date.now() - tWall0;
          return {
            buildMarker: BUILD_MARKER,
            created: false,
            maintenance: maintenance,
            workOrder: existingWo,
            timings: timings,
          };
        }
      }
      timings.validateMs = Date.now() - tVal0;

      if (!cell_(maintenance.facilityId)) {
        throw new Error("Maintenance facilityId is required to create a Work Order.");
      }

      var tPayload0 = Date.now();
      var woPayload = buildWorkOrderPayload_(maintenance, payload);
      timings.payloadBuildMs = Date.now() - tPayload0;

      var tCreate0 = Date.now();
      workOrder = WorkOrderRepository.create(woPayload);
      createdNewWorkOrder = true;
      timings.workOrderCreateMs = Date.now() - tCreate0;

      if (cell_(workOrder.maintenanceId) !== maintenanceId) {
        throw new Error(
          "Work Order maintenanceId integrity failure during create."
        );
      }

      var tMaintUpd0 = Date.now();
      var maintRepoResult = MaintenanceRepository.update(maintenanceId, {
        workOrderId: workOrder.id,
        workOrderIds: SheetFieldUtils.appendUniqueId(
          maintenance.workOrderIds || [],
          workOrder.id
        ),
        requiresWorkOrder: true,
      });
      var updatedMaintenance = maintRepoResult ? maintRepoResult.canonical : null;
      timings.maintenanceUpdateMs = Date.now() - tMaintUpd0;

      if (!updatedMaintenance) {
        throw new Error(
          "Maintenance backlink update failed for " + maintenanceId + "."
        );
      }

      var tVerify0 = Date.now();
      verifyReciprocalLinks_(updatedMaintenance, workOrder);
      timings.verifyMs = Date.now() - tVerify0;

      var tNotify0 = Date.now();
      invalidateCaches_();
      notifySnapshots_();
      timings.cacheNotifyMs = Date.now() - tNotify0;

      var tResponse0 = Date.now();
      timings.responseBuildMs = Date.now() - tResponse0;
      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;

      Logger.log(
        "[WorkOrderMaintenanceMutationService.createFromMaintenance] timings " +
          JSON.stringify(timings)
      );

      return {
        buildMarker: BUILD_MARKER,
        created: true,
        maintenance: updatedMaintenance,
        workOrder: workOrder,
        timings: timings,
      };
    } catch (error) {
      if (createdNewWorkOrder && workOrder && workOrder.id) {
        var tComp0 = Date.now();
        var compensation = compensateClearWoMaintenanceLink_(workOrder.id);
        timings.compensationMs = Date.now() - tComp0;
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;
        Logger.log(
          "[WorkOrderMaintenanceMutationService.createFromMaintenance] compensation " +
            JSON.stringify(compensation)
        );
        throw new Error(
          (error && error.message) ||
            "createFromMaintenance failed after Work Order create. compensation=" +
              JSON.stringify(compensation)
        );
      }
      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;
      throw error;
    } finally {
      lock.releaseLock();
    }
  }

  return {
    createFromMaintenance: createFromMaintenance,
  };
})();
