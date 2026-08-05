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
    // Facility code is system-generated when omitted.
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
