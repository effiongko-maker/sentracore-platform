/**
 * RequestService.gs
 *
 * Business rules for Requests (intake layer).
 * Never talks to the spreadsheet directly — only RequestRepository.
 *
 * Phase 1: no OperationalRegisterCache — measure list latency first.
 */

var RequestService = (function () {
  var VALID_STATUSES = {
    submitted: true,
    under_review: true,
    being_treated: true,
    resolved: true,
    closed: true,
    cancelled: true,
  };

  var VALID_REQUEST_TYPES = {
    maintenance: true,
    incident: true,
  };

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var facilityId = payload.facilityId;

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
        String(row.reporterName || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.reporterContact || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.locationDetail || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      return matchesSearch && matchesStatus && matchesFacility;
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
      var aAt = String(a.createdAt || a.occurredAt || a.updatedAt || "");
      var bAt = String(b.createdAt || b.occurredAt || b.updatedAt || "");
      if (aAt === bAt) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return aAt < bAt ? 1 : -1;
    });
  }

  function getAll(payload) {
    payload = payload || {};
    if (payload._auditTiming && typeof OperationalListAudit !== "undefined") {
      return OperationalListAudit.instrumentGetAll_(
        payload,
        function (auditCollector) {
          return RequestRepository.getAll(auditCollector);
        },
        applyFilters_,
        sortNewestFirst_,
        paginate_
      );
    }
    var rows = RequestRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortNewestFirst_(filtered);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Request id is required.");
    var row = RequestRepository.getById(id);
    if (!row) throw new Error("Request " + id + " not found.");
    return row;
  }

  function create(payload) {
    var t0 = Date.now();
    payload = payload || {};
    if (!payload.title || !String(payload.title).trim()) {
      throw new Error("Request title is required.");
    }
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility id is required.");
    }
    if (payload.status != null && !VALID_STATUSES[String(payload.status)]) {
      throw new Error("Invalid request status: " + payload.status);
    }
    if (
      payload.requestType != null &&
      String(payload.requestType).trim() !== "" &&
      !VALID_REQUEST_TYPES[String(payload.requestType)]
    ) {
      throw new Error(
        "Invalid request type: " +
          payload.requestType +
          ". Expected maintenance|incident."
      );
    }
    var tValidated = Date.now();
    var created = RequestRepository.create(payload);
    var tRepo = Date.now();
    var timings = {
      validateMs: tValidated - t0,
      repositoryMs: tRepo - tValidated,
      totalMs: tRepo - t0,
    };
    Logger.log("[RequestService.create] timings " + JSON.stringify(timings));
    if (payload._auditTiming) {
      created._serverTimings = timings;
    }
    return created;
  }

  function update(payload) {
    var t0 = Date.now();
    payload = payload || {};
    if (!payload.id) throw new Error("Request id is required.");
    if (payload.status != null && !VALID_STATUSES[String(payload.status)]) {
      throw new Error("Invalid request status: " + payload.status);
    }
    if (
      payload.requestType != null &&
      String(payload.requestType).trim() !== "" &&
      !VALID_REQUEST_TYPES[String(payload.requestType)]
    ) {
      throw new Error(
        "Invalid request type: " +
          payload.requestType +
          ". Expected maintenance|incident."
      );
    }
    var updated = RequestRepository.update(payload.id, payload);
    if (!updated) throw new Error("Request " + payload.id + " not found.");
    var tRepo = Date.now();
    var timings = {
      repositoryMs: tRepo - t0,
      totalMs: tRepo - t0,
    };
    Logger.log("[RequestService.update] timings " + JSON.stringify(timings));
    if (payload._auditTiming) {
      updated._serverTimings = timings;
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("Request id is required.");
    var updated = RequestRepository.deactivate(payload.id);
    if (!updated) throw new Error("Request " + payload.id + " not found.");
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
