/**
 * RequestTreatmentService.gs
 *
 * Consolidated Create-from-Request treatment mutation (Architecture B).
 *
 * Contract:
 *   resource: "requests"
 *   action:   "createTreatment"
 *   payload: {
 *     kind: "maintenance" | "incident",
 *     requestId: string,
 *     childInput: object,     // validated domain create fields from Next.js
 *     idempotencyKey: string,
 *     actorUserId?: string
 *   }
 *
 * Ordering (required):
 *   Create child (sourceRequestId set)
 *     → appendUnique child id on Request
 *     → status = being_treated (if non-terminal)
 *
 * LockService.getScriptLock() covers the mutation only — not a transaction.
 * Idempotency: PropertiesService ScriptProperties (survives separate invocations).
 * Auth + operational events remain on the Next.js side.
 *
 * BUILD: 2026-08-30-create-treatment-v1
 */

var RequestTreatmentService = (function () {
  var BUILD_MARKER = "2026-08-30-create-treatment-v1";
  var IDEM_PREFIX = "treatIdem:v1:";
  var LOCK_WAIT_MS = 30000;

  var TERMINAL_STATUSES = {
    resolved: true,
    closed: true,
    cancelled: true,
  };

  function nowIso_() {
    return new Date().toISOString();
  }

  function cell_(value) {
    if (value == null) return "";
    return String(value).trim();
  }

  function idempotencyPropertyKey_(kind, requestId, idempotencyKey) {
    return IDEM_PREFIX + kind + ":" + requestId + ":" + idempotencyKey;
  }

  function readIdempotency_(propKey) {
    var raw = PropertiesService.getScriptProperties().getProperty(propKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (ignore) {
      return null;
    }
  }

  function writeIdempotency_(propKey, record) {
    PropertiesService.getScriptProperties().setProperty(
      propKey,
      JSON.stringify(record)
    );
  }

  function isTerminal_(status) {
    return !!TERMINAL_STATUSES[String(status || "").toLowerCase()];
  }

  function statusAfterTreatment_(current) {
    if (isTerminal_(current)) return current;
    return "being_treated";
  }

  function loadAuthoritativeChild_(kind, childId) {
    if (kind === "maintenance") {
      return MaintenanceService.getById({ id: childId });
    }
    return IncidentService.getById({ id: childId });
  }

  /**
   * Prefer validated Next.js childInput; force relationship integrity fields.
   */
  function buildChildPayload_(kind, request, childInput, actorUserId) {
    childInput = childInput || {};
    var payload = {};
    var key;
    for (key in childInput) {
      if (
        childInput.hasOwnProperty(key) &&
        String(key).indexOf("_") !== 0
      ) {
        payload[key] = childInput[key];
      }
    }

    var facilityId = cell_(payload.facilityId) || cell_(request.facilityId);
    var title =
      cell_(payload.title) ||
      cell_(request.title) ||
      "Treatment " + request.id;
    var description =
      cell_(payload.description) || cell_(request.description) || title;
    var actor = cell_(actorUserId) || cell_(payload.updatedByUserId) || cell_(payload.createdByUserId);

    payload.title = title;
    payload.description = description;
    payload.facilityId = facilityId;
    payload.source = "request";
    payload.sourceRequestId = request.id;
    if (!cell_(payload.locationDetail) && cell_(request.locationDetail)) {
      payload.locationDetail = request.locationDetail;
    }
    if (!cell_(payload.reportedByUserId) && cell_(request.reportedByUserId)) {
      payload.reportedByUserId = request.reportedByUserId;
    }
    if (actor) {
      if (!cell_(payload.createdByUserId)) payload.createdByUserId = actor;
      payload.updatedByUserId = actor;
    }

    if (kind === "maintenance") {
      if (!cell_(payload.type)) payload.type = "corrective";
      if (!cell_(payload.priority)) payload.priority = "medium";
      if (!cell_(payload.status)) payload.status = "requested";
      if (!cell_(payload.reportedAt)) {
        payload.reportedAt = request.occurredAt || nowIso_();
      }
    } else {
      if (!cell_(payload.type)) payload.type = "other";
      if (!cell_(payload.severity)) payload.severity = "medium";
      if (!cell_(payload.status)) payload.status = "reported";
      if (!cell_(payload.reportedVia)) payload.reportedVia = "portal";
      if (!cell_(payload.reportedAt)) {
        payload.reportedAt = request.occurredAt || nowIso_();
      }
    }

    return payload;
  }

  function validateFacilityMatch_(request, childPayload) {
    var reqFac = cell_(request.facilityId);
    var childFac = cell_(childPayload.facilityId);
    if (!reqFac) {
      throw new Error("Request facilityId is required for treatment.");
    }
    if (!childFac) {
      throw new Error("Child facilityId is required for treatment.");
    }
    if (childFac !== reqFac) {
      throw new Error(
        "Facility mismatch: child facilityId " +
          childFac +
          " does not match request facilityId " +
          reqFac +
          "."
      );
    }
  }

  function compensateClearSource_(kind, childId, expectedRequestId, actorUserId) {
    var actor = cell_(actorUserId) || "system-compensation";
    if (kind === "maintenance") {
      var mnt = MaintenanceService.getById({ id: childId });
      if (!mnt) return { attempted: true, cleared: false, reason: "not_found" };
      if (cell_(mnt.sourceRequestId) !== expectedRequestId) {
        return {
          attempted: true,
          cleared: false,
          reason: "source_mismatch",
          sourceRequestId: mnt.sourceRequestId,
        };
      }
      MaintenanceService.update({
        id: childId,
        sourceRequestId: "",
        updatedByUserId: actor,
      });
      return { attempted: true, cleared: true };
    }

    var inc = IncidentService.getById({ id: childId });
    if (!inc) return { attempted: true, cleared: false, reason: "not_found" };
    if (cell_(inc.sourceRequestId) !== expectedRequestId) {
      return {
        attempted: true,
        cleared: false,
        reason: "source_mismatch",
        sourceRequestId: inc.sourceRequestId,
      };
    }
    IncidentService.update({
      id: childId,
      sourceRequestId: "",
      updatedByUserId: actor,
    });
    return { attempted: true, cleared: true };
  }

  function appendChildOnRequest_(kind, request, childId, actorUserId) {
    var updatePayload = {
      id: request.id,
      status: statusAfterTreatment_(request.status),
      updatedByUserId: cell_(actorUserId) || request.updatedByUserId || "",
    };
    if (kind === "maintenance") {
      updatePayload.maintenanceIds = SheetFieldUtils.appendUniqueId(
        request.maintenanceIds || [],
        childId
      );
    } else {
      updatePayload.incidentIds = SheetFieldUtils.appendUniqueId(
        request.incidentIds || [],
        childId
      );
    }
    return RequestService.update(updatePayload);
  }

  function createChild_(kind, childPayload) {
    if (kind === "maintenance") {
      return MaintenanceService.create(childPayload);
    }
    return IncidentService.create(childPayload);
  }

  function createTreatment(payload) {
    var tWall0 = Date.now();
    payload = payload || {};

    var kind = cell_(payload.kind).toLowerCase();
    var requestId = cell_(payload.requestId);
    var idempotencyKey = cell_(payload.idempotencyKey);
    var childInput = payload.childInput || {};
    var actorUserId = cell_(payload.actorUserId);

    if (kind !== "maintenance" && kind !== "incident") {
      throw new Error(
        'Invalid kind: expected "maintenance" or "incident", got "' +
          payload.kind +
          '".'
      );
    }
    if (!requestId) throw new Error("requestId is required.");
    if (!idempotencyKey) throw new Error("idempotencyKey is required.");

    var timings = {
      buildMarker: BUILD_MARKER,
      lockAcquireMs: 0,
      idempotencyLookupMs: 0,
      requestReadMs: 0,
      validateMs: 0,
      childCreateMs: 0,
      requestUpdateMs: 0,
      idempotencyWriteMs: 0,
      compensationMs: 0,
      sheetReadMs: 0,
      sheetWriteMs: 0,
      serverTotalMs: 0,
      heldLockMs: 0,
    };

    var propKey = idempotencyPropertyKey_(kind, requestId, idempotencyKey);

    var tLock0 = Date.now();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      throw new Error(
        "createTreatment busy — another treatment mutation holds the script lock."
      );
    }
    timings.lockAcquireMs = Date.now() - tLock0;
    var tHeld0 = Date.now();

    var child = null;
    var createdNewChild = false;

    try {
      var tIdem0 = Date.now();
      var existing = readIdempotency_(propKey);
      timings.idempotencyLookupMs = Date.now() - tIdem0;

      if (existing && existing.childId) {
        var tRead0 = Date.now();
        var requestExisting = RequestService.getById({ id: requestId });
        var childExisting = loadAuthoritativeChild_(kind, existing.childId);
        timings.requestReadMs = Date.now() - tRead0;
        timings.sheetReadMs += timings.requestReadMs;
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;

        var outIdem = {
          buildMarker: BUILD_MARKER,
          kind: kind,
          idempotent: true,
          idempotencyKey: idempotencyKey,
          request: requestExisting,
          timings: timings,
        };
        if (kind === "maintenance") {
          outIdem.maintenance = childExisting;
        } else {
          outIdem.incident = childExisting;
        }
        return outIdem;
      }

      var tReq0 = Date.now();
      var request;
      try {
        request = RequestService.getById({ id: requestId });
      } catch (notFoundErr) {
        timings.requestReadMs = Date.now() - tReq0;
        timings.sheetReadMs += timings.requestReadMs;
        throw new Error("Request " + requestId + " not found.");
      }
      timings.requestReadMs = Date.now() - tReq0;
      timings.sheetReadMs += timings.requestReadMs;

      var tVal0 = Date.now();
      if (isTerminal_(request.status)) {
        throw new Error(
          "Request " +
            requestId +
            " is " +
            request.status +
            " and cannot receive treatment."
        );
      }

      var childPayload = buildChildPayload_(
        kind,
        request,
        childInput,
        actorUserId
      );
      validateFacilityMatch_(request, childPayload);
      timings.validateMs = Date.now() - tVal0;

      var tChild0 = Date.now();
      child = createChild_(kind, childPayload);
      createdNewChild = true;
      timings.childCreateMs = Date.now() - tChild0;
      timings.sheetWriteMs += timings.childCreateMs;

      if (cell_(child.sourceRequestId) !== request.id) {
        throw new Error(
          "Child sourceRequestId integrity failure: expected " +
            request.id +
            ", got " +
            child.sourceRequestId
        );
      }

      var tUpd0 = Date.now();
      var freshReq = RequestService.getById({ id: request.id });
      var updatedRequest = appendChildOnRequest_(
        kind,
        freshReq,
        child.id,
        actorUserId
      );
      timings.requestUpdateMs = Date.now() - tUpd0;
      timings.sheetWriteMs += timings.requestUpdateMs;

      var tIdemW0 = Date.now();
      writeIdempotency_(propKey, {
        kind: kind,
        requestId: request.id,
        childId: child.id,
        completedAt: nowIso_(),
        buildMarker: BUILD_MARKER,
      });
      timings.idempotencyWriteMs = Date.now() - tIdemW0;

      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;

      var out = {
        buildMarker: BUILD_MARKER,
        kind: kind,
        idempotent: false,
        idempotencyKey: idempotencyKey,
        request: updatedRequest,
        timings: timings,
      };
      if (kind === "maintenance") {
        out.maintenance = child;
      } else {
        out.incident = child;
      }
      return out;
    } catch (error) {
      if (createdNewChild && child && child.id) {
        var tComp0 = Date.now();
        var compensation;
        try {
          compensation = compensateClearSource_(
            kind,
            child.id,
            requestId,
            actorUserId
          );
        } catch (compErr) {
          compensation = {
            attempted: true,
            cleared: false,
            reason: "compensation_threw",
            error: (compErr && compErr.message) || String(compErr),
          };
        }
        timings.compensationMs = Date.now() - tComp0;
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;

        throw new Error(
          "Treatment mutation failed after child create. childId=" +
            child.id +
            " compensation=" +
            JSON.stringify(compensation) +
            " timings=" +
            JSON.stringify(timings) +
            " cause=" +
            ((error && error.message) || String(error))
        );
      }
      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;
      throw error;
    } finally {
      try {
        lock.releaseLock();
      } catch (ignoreRelease) {
        // ignore
      }
    }
  }

  // --- Link Treatment (Phase 2.8) — state-based idempotency ---

  var LINK_BUILD_MARKER = "2026-08-30-link-treatment-v1";

  function loadLinkChild_(kind, childId) {
    if (kind === "maintenance") {
      return MaintenanceService.getById({ id: childId });
    }
    return IncidentService.getById({ id: childId });
  }

  function updateLinkChildSource_(kind, childId, sourceRequestId, actorUserId) {
    if (kind === "maintenance") {
      return MaintenanceService.update({
        id: childId,
        sourceRequestId: sourceRequestId,
        updatedByUserId: cell_(actorUserId) || "",
      });
    }
    return IncidentService.update({
      id: childId,
      sourceRequestId: sourceRequestId,
      updatedByUserId: cell_(actorUserId) || "",
    });
  }

  function compensateClearLinkSource_(
    kind,
    childId,
    expectedRequestId,
    actorUserId
  ) {
    var child = loadLinkChild_(kind, childId);
    if (!child) return { attempted: true, cleared: false, reason: "not_found" };
    if (cell_(child.sourceRequestId) !== expectedRequestId) {
      return {
        attempted: true,
        cleared: false,
        reason: "source_mismatch",
        sourceRequestId: child.sourceRequestId,
      };
    }
    updateLinkChildSource_(kind, childId, "", actorUserId);
    return { attempted: true, cleared: true };
  }

  function appendLinkChildOnRequest_(kind, request, childId, actorUserId) {
    var updatePayload = {
      id: request.id,
      status: statusAfterTreatment_(request.status),
      updatedByUserId: cell_(actorUserId) || request.updatedByUserId || "",
    };
    if (kind === "maintenance") {
      updatePayload.maintenanceIds = SheetFieldUtils.appendUniqueId(
        request.maintenanceIds || [],
        childId
      );
    } else {
      updatePayload.incidentIds = SheetFieldUtils.appendUniqueId(
        request.incidentIds || [],
        childId
      );
    }
    return RequestService.update(updatePayload);
  }

  function requestHasLinkChild_(kind, request, childId) {
    var list =
      kind === "maintenance"
        ? request.maintenanceIds || []
        : request.incidentIds || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] === childId) return true;
    }
    return false;
  }

  function classifyLinkOwnership_(child, requestId) {
    var existing = cell_(child.sourceRequestId);
    if (!existing) return "linkable";
    if (existing === requestId) return "already_linked";
    return "conflict";
  }

  /**
   * Consolidated Link-from-Request mutation.
   * State-based idempotency via sourceRequestId + appendUnique.
   */
  function linkTreatment(payload) {
    var tWall0 = Date.now();
    payload = payload || {};

    var kind = cell_(payload.kind).toLowerCase();
    var requestId = cell_(payload.requestId);
    var childId = cell_(payload.childId);
    var actorUserId = cell_(payload.actorUserId);
    var idempotencyKey = cell_(payload.idempotencyKey);

    if (kind !== "maintenance" && kind !== "incident") {
      throw new Error(
        'Invalid kind: expected "maintenance" or "incident", got "' +
          payload.kind +
          '".'
      );
    }
    if (!requestId) throw new Error("requestId is required.");
    if (!childId) throw new Error("childId is required.");

    var timings = {
      buildMarker: LINK_BUILD_MARKER,
      lockAcquireMs: 0,
      requestReadMs: 0,
      childReadMs: 0,
      validateMs: 0,
      childUpdateMs: 0,
      requestUpdateMs: 0,
      compensationMs: 0,
      sheetReadMs: 0,
      sheetWriteMs: 0,
      serverTotalMs: 0,
      heldLockMs: 0,
    };

    var tLock0 = Date.now();
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(LOCK_WAIT_MS)) {
      throw new Error(
        "linkTreatment busy — another treatment mutation holds the script lock."
      );
    }
    timings.lockAcquireMs = Date.now() - tLock0;
    var tHeld0 = Date.now();

    var childWroteSource = false;

    try {
      var tReq0 = Date.now();
      var request;
      try {
        request = RequestService.getById({ id: requestId });
      } catch (notFoundErr) {
        timings.requestReadMs = Date.now() - tReq0;
        timings.sheetReadMs += timings.requestReadMs;
        throw new Error("Request " + requestId + " not found.");
      }
      timings.requestReadMs = Date.now() - tReq0;
      timings.sheetReadMs += timings.requestReadMs;

      var tChild0 = Date.now();
      var child;
      try {
        child = loadLinkChild_(kind, childId);
      } catch (childErr) {
        timings.childReadMs = Date.now() - tChild0;
        timings.sheetReadMs += timings.childReadMs;
        throw new Error(
          (kind === "maintenance" ? "Maintenance " : "Incident ") +
            childId +
            " not found."
        );
      }
      timings.childReadMs = Date.now() - tChild0;
      timings.sheetReadMs += timings.childReadMs;

      var tVal0 = Date.now();
      if (isTerminal_(request.status)) {
        throw new Error(
          "Request " +
            requestId +
            " is " +
            request.status +
            " and cannot receive treatment."
        );
      }

      var reqFac = cell_(request.facilityId);
      var childFac = cell_(child.facilityId);
      if (reqFac && childFac && reqFac !== childFac) {
        throw new Error(
          "Facility mismatch: child facilityId " +
            childFac +
            " does not match request facilityId " +
            reqFac +
            "."
        );
      }

      var ownership = classifyLinkOwnership_(child, requestId);
      if (ownership === "conflict") {
        throw new Error(
          childId +
            " is already linked to " +
            cell_(child.sourceRequestId) +
            " and cannot be reassigned."
        );
      }
      timings.validateMs = Date.now() - tVal0;

      if (
        ownership === "already_linked" &&
        requestHasLinkChild_(kind, request, childId)
      ) {
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;
        var outIdem = {
          buildMarker: LINK_BUILD_MARKER,
          kind: kind,
          idempotent: true,
          idempotencyMode: "state",
          idempotencyKey: idempotencyKey || null,
          request: request,
          timings: timings,
        };
        if (kind === "maintenance") outIdem.maintenance = child;
        else outIdem.incident = child;
        return outIdem;
      }

      var linkedChild = child;
      if (ownership === "linkable") {
        var tUpdC0 = Date.now();
        linkedChild = updateLinkChildSource_(
          kind,
          childId,
          requestId,
          actorUserId
        );
        childWroteSource = true;
        timings.childUpdateMs = Date.now() - tUpdC0;
        timings.sheetWriteMs += timings.childUpdateMs;
      }

      var tFresh0 = Date.now();
      var freshReq = RequestService.getById({ id: requestId });
      timings.requestReadMs += Date.now() - tFresh0;
      timings.sheetReadMs += Date.now() - tFresh0;

      var updatedRequest = freshReq;
      if (!requestHasLinkChild_(kind, freshReq, childId)) {
        var tUpdR0 = Date.now();
        updatedRequest = appendLinkChildOnRequest_(
          kind,
          freshReq,
          childId,
          actorUserId
        );
        timings.requestUpdateMs = Date.now() - tUpdR0;
        timings.sheetWriteMs += timings.requestUpdateMs;
      }

      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;

      var out = {
        buildMarker: LINK_BUILD_MARKER,
        kind: kind,
        idempotent: ownership === "already_linked",
        idempotencyMode: "state",
        idempotencyKey: idempotencyKey || null,
        request: updatedRequest,
        timings: timings,
      };
      if (kind === "maintenance") out.maintenance = linkedChild;
      else out.incident = linkedChild;
      return out;
    } catch (error) {
      if (childWroteSource) {
        var tComp0 = Date.now();
        var compensation;
        try {
          compensation = compensateClearLinkSource_(
            kind,
            childId,
            requestId,
            actorUserId
          );
        } catch (compErr) {
          compensation = {
            attempted: true,
            cleared: false,
            reason: "compensation_threw",
            error: (compErr && compErr.message) || String(compErr),
          };
        }
        timings.compensationMs = Date.now() - tComp0;
        timings.heldLockMs = Date.now() - tHeld0;
        timings.serverTotalMs = Date.now() - tWall0;
        throw new Error(
          "Link mutation failed after child sourceRequestId write. childId=" +
            childId +
            " compensation=" +
            JSON.stringify(compensation) +
            " timings=" +
            JSON.stringify(timings) +
            " cause=" +
            ((error && error.message) || String(error))
        );
      }
      timings.heldLockMs = Date.now() - tHeld0;
      timings.serverTotalMs = Date.now() - tWall0;
      throw error;
    } finally {
      try {
        lock.releaseLock();
      } catch (ignoreRelease) {
        // ignore
      }
    }
  }

  return {
    BUILD_MARKER: BUILD_MARKER,
    LINK_BUILD_MARKER: LINK_BUILD_MARKER,
    createTreatment: createTreatment,
    linkTreatment: linkTreatment,
  };
})();
