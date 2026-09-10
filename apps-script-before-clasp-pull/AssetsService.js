/**
 * AssetService.gs
 *
 * Business rules for Assets. Mirrors FacilityService.gs / WorkOrderService.gs.
 * Never talks to the spreadsheet directly — only AssetRepository.
 *
 * List pipeline: all → sort by id → search/filters → paginate
 */

var AssetService = (function () {
  function parseAssetSeq_(id) {
    var match = String(id || "").match(/AST-(\d+)/i);
    return match ? parseInt(match[1], 10) : 0;
  }

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
        String(row.id || "")
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
        String(row.model || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.assignedTo || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.oemId || "")
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

      var rowFacility = String(row.facility || "");
      var matchesFacility =
        !facility ||
        facility === "all" ||
        rowFacility === String(facility);

      if (
        !matchesFacility &&
        facility &&
        facility !== "all" &&
        typeof FacilityRepository !== "undefined"
      ) {
        try {
          var facilities = FacilityRepository.getAll() || [];
          var i;
          for (i = 0; i < facilities.length; i++) {
            var f = facilities[i];
            var fid = String(f.id || "");
            var fname = String(f.name || "");
            if (
              (fid === String(facility) || fname === String(facility)) &&
              (rowFacility === fid || rowFacility === fname)
            ) {
              matchesFacility = true;
              break;
            }
          }
        } catch (ignore) {}
      }

      return (
        matchesSearch && matchesStatus && matchesCategory && matchesFacility
      );
    });
  }

  function compareName_(a, b) {
    var byName = String(a.name || "").localeCompare(String(b.name || ""), undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;
    return String(a.id || "").localeCompare(String(b.id || ""));
  }

  function sortRows_(rows, payload) {
    var sort = String((payload && payload.sort) || "newest").toLowerCase();
    var next = rows.slice();
    if (sort === "oldest") {
      return next.sort(function (a, b) {
        var aSeq = parseAssetSeq_(a.id);
        var bSeq = parseAssetSeq_(b.id);
        if (aSeq === bSeq) {
          return String(a.id || "").localeCompare(String(b.id || ""));
        }
        return aSeq - bSeq;
      });
    }
    if (sort === "name_asc") {
      return next.sort(function (a, b) {
        return compareName_(a, b);
      });
    }
    if (sort === "name_desc") {
      return next.sort(function (a, b) {
        return compareName_(b, a);
      });
    }
    return next.sort(function (a, b) {
      var aSeq = parseAssetSeq_(a.id);
      var bSeq = parseAssetSeq_(b.id);
      if (aSeq === bSeq) {
        return String(b.id || "").localeCompare(String(a.id || ""));
      }
      return bSeq - aSeq;
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
    if (page > totalPages) page = totalPages;
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
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
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
    var created = AssetRepository.create(payload);
    if (!created || !created.id) {
      throw new Error(
        "Asset create failed: repository returned no record. Check the Assets sheet headers."
      );
    }
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("assets");
    }
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
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
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
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
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateWoFilterCatalog();
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
