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
    if (!payload.facility) throw new Error("Facility is required.");
    // Asset tag / number is system-generated when omitted.
    var created = AssetRepository.create(payload);
    if (!created || !created.id) {
      throw new Error(
        "Asset create failed: repository returned no record. Check the Assets sheet headers."
      );
    }
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
