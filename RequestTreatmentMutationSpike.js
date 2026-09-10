/**
 * RequestTreatmentMutationSpike.gs
 *
 * PHASE 2.5 — isolated persistence spike for Architecture B.
 * SPIKE ONLY. Not wired into Next.js / Request Treatment UI / Link.
 *
 * Contract (proposed):
 *   resource: "requests"
 *   action:   "createTreatment"
 *   payload: {
 *     kind: "maintenance" | "incident",
 *     requestId: string,
 *     childInput: object,          // domain create fields (title, facilityId, …)
 *     idempotencyKey: string,      // durable across invocations
 *     // Spike-only failure injectors (never for production):
 *     _spikeForceFailChildCreate?: boolean,
 *     _spikeForceFailReverseLink?: boolean
 *   }
 *
 * Ordering (required):
 *   Create child (sourceRequestId set)
 *     → appendUnique child id on Request
 *     → status = being_treated (if non-terminal)
 *
 * LockService.getScriptLock() covers the mutation only — not a transaction.
 * Idempotency: PropertiesService ScriptProperties (survives separate invocations).
 *
 * BUILD: 2026-08-30-create-treatment-spike-v1
 */

var RequestTreatmentMutationSpike = (function () {
  var BUILD_MARKER = "2026-08-30-create-treatment-spike-v1";
  var IDEM_PREFIX = "spikeTreatIdem:v1:";
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

  function buildChildPayload_(kind, request, childInput) {
    childInput = childInput || {};
    var facilityId = cell_(childInput.facilityId) || cell_(request.facilityId);
    var title =
      cell_(childInput.title) ||
      cell_(request.title) ||
      "Spike treatment " + request.id;
    var description =
      cell_(childInput.description) || cell_(request.description) || title;
    var base = {
      title: title,
      description: description,
      facilityId: facilityId,
      source: "request",
      sourceRequestId: request.id,
      locationDetail: cell_(childInput.locationDetail) || cell_(request.locationDetail),
      reportedByUserId:
        cell_(childInput.reportedByUserId) || cell_(request.reportedByUserId),
      createdByUserId: cell_(childInput.createdByUserId) || "spike-bot",
      updatedByUserId: cell_(childInput.updatedByUserId) || "spike-bot",
    };

    if (kind === "maintenance") {
      return {
        title: base.title,
        description: base.description,
        facilityId: base.facilityId,
        type: cell_(childInput.type) || "corrective",
        source: base.source,
        priority: cell_(childInput.priority) || "medium",
        status: cell_(childInput.status) || "requested",
        reportedAt: cell_(childInput.reportedAt) || request.occurredAt || nowIso_(),
        locationDetail: base.locationDetail,
        department: cell_(childInput.department),
        assetId: cell_(childInput.assetId),
        categoryId: cell_(childInput.categoryId),
        reportedByUserId: base.reportedByUserId,
        assignedToUserId: cell_(childInput.assignedToUserId),
        sourceRequestId: base.sourceRequestId,
        createdByUserId: base.createdByUserId,
        updatedByUserId: base.updatedByUserId,
        requiresWorkOrder: childInput.requiresWorkOrder === true,
      };
    }

    return {
      title: base.title,
      description: base.description,
      facilityId: base.facilityId,
      type: cell_(childInput.type) || "other",
      source: base.source,
      severity: cell_(childInput.severity) || "medium",
      status: cell_(childInput.status) || "reported",
      reportedVia: cell_(childInput.reportedVia) || "portal",
      reportedAt: cell_(childInput.reportedAt) || request.occurredAt || nowIso_(),
      locationDetail: base.locationDetail,
      assetId: cell_(childInput.assetId),
      reportedByUserId: base.reportedByUserId,
      assignedToUserId: cell_(childInput.assignedToUserId),
      sourceRequestId: base.sourceRequestId,
      createdByUserId: base.createdByUserId,
      updatedByUserId: base.updatedByUserId,
      requiresWorkOrder: childInput.requiresWorkOrder === true,
    };
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

  /**
   * Soft requestType check — product Create allows either kind from any request.
   * Spike records advisory mismatch in timings only; does not reject.
   */
  function requestTypeAdvisory_(kind, request) {
    var rt = cell_(request.requestType).toLowerCase();
    if (!rt) return null;
    if (rt !== kind) {
      return "requestType=" + rt + " kind=" + kind + " (allowed; advisory)";
    }
    return null;
  }

  function compensateClearSource_(kind, childId, expectedRequestId) {
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
        updatedByUserId: "spike-compensation",
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
      updatedByUserId: "spike-compensation",
    });
    return { attempted: true, cleared: true };
  }

  function appendChildOnRequest_(kind, request, childId) {
    var updatePayload = {
      id: request.id,
      status: statusAfterTreatment_(request.status),
      updatedByUserId: "spike-bot",
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

  /**
   * Domain mutation entry. Called from RequestsController.createTreatment.
   */
  function createTreatment(payload) {
    var tWall0 = Date.now();
    payload = payload || {};

    var kind = cell_(payload.kind).toLowerCase();
    var requestId = cell_(payload.requestId);
    var idempotencyKey = cell_(payload.idempotencyKey);
    var childInput = payload.childInput || {};

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
      // --- Idempotency (durable) ---
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
          spike: true,
          buildMarker: BUILD_MARKER,
          kind: kind,
          idempotent: true,
          idempotencyKey: idempotencyKey,
          request: requestExisting,
          timings: timings,
          lock: {
            protects:
              "Request read/validation, child create, Request reverse-link/status, idempotency write",
            doesNotProtect:
              "True multi-writer ACID transactions; callers outside this lock; Supabase; UI; other Apps Script projects",
            isTransaction: false,
          },
        };
        if (kind === "maintenance") {
          outIdem.maintenance = childExisting;
        } else {
          outIdem.incident = childExisting;
        }
        return outIdem;
      }

      // --- Request read + validation ---
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

      var childPayload = buildChildPayload_(kind, request, childInput);
      validateFacilityMatch_(request, childPayload);
      var typeAdvisory = requestTypeAdvisory_(kind, request);
      timings.validateMs = Date.now() - tVal0;

      if (payload._spikeForceFailChildCreate === true) {
        throw new Error("SPIKE_FORCE_FAIL_CHILD_CREATE");
      }

      // --- Child create (child-first) ---
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

      if (payload._spikeForceFailReverseLink === true) {
        throw new Error("SPIKE_FORCE_FAIL_REVERSE_LINK");
      }

      // --- Request reverse-link + status ---
      var tUpd0 = Date.now();
      // Re-read Request inside lock before append (concurrent other writes rare but possible).
      var freshReq = RequestService.getById({ id: request.id });
      var updatedRequest = appendChildOnRequest_(kind, freshReq, child.id);
      timings.requestUpdateMs = Date.now() - tUpd0;
      timings.sheetWriteMs += timings.requestUpdateMs;
      timings.sheetReadMs += 0; // getById folded into update path timing above for simplicity

      // --- Durable idempotency record (only after full success) ---
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
        spike: true,
        buildMarker: BUILD_MARKER,
        kind: kind,
        idempotent: false,
        idempotencyKey: idempotencyKey,
        request: updatedRequest,
        requestTypeAdvisory: typeAdvisory,
        timings: timings,
        lock: {
          protects:
            "Request read/validation, child create, Request reverse-link/status, idempotency write",
          doesNotProtect:
            "True multi-writer ACID transactions; callers outside this lock; Supabase; UI; other Apps Script projects",
          isTransaction: false,
        },
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
          compensation = compensateClearSource_(kind, child.id, requestId);
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

  return {
    BUILD_MARKER: BUILD_MARKER,
    createTreatment: createTreatment,
  };
})();
