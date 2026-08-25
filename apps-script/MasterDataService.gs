/**
 * MasterDataService.gs
 *
 * Business rules for master lookup entities.
 * Never talks to the spreadsheet directly — only MasterDataRepository.
 *
 * Does not notify ReportingSnapshot (master data is lookup-only for now).
 */

var MasterDataService = (function () {
  function normalizeEntity_(payload) {
    var entity = payload && payload.entity;
    if (!entity) throw new Error("Master-data entity is required.");
    entity = String(entity).toLowerCase().trim();
    var known = MasterDataRepository.listEntities();
    if (known.indexOf(entity) === -1) {
      throw new Error("Unknown master-data entity: " + entity);
    }
    return entity;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var facilityId = payload.facilityId;
    var buildingId = payload.buildingId;
    var floorId = payload.floorId;
    var category = payload.category;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.code || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.category || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.contactName || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.email || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status).toLowerCase() === String(status).toLowerCase();

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId || "") === String(facilityId);

      var matchesBuilding =
        !buildingId ||
        buildingId === "all" ||
        String(row.buildingId || "") === String(buildingId);

      var matchesFloor =
        !floorId ||
        floorId === "all" ||
        String(row.floorId || "") === String(floorId);

      var matchesCategory =
        !category ||
        category === "all" ||
        String(row.category || "")
          .toLowerCase() === String(category).toLowerCase();

      return (
        matchesSearch &&
        matchesStatus &&
        matchesFacility &&
        matchesBuilding &&
        matchesFloor &&
        matchesCategory
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
    var entity = normalizeEntity_(payload);
    var rows = MasterDataRepository.getAll(entity);
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var entity = normalizeEntity_(payload);
    var id = payload && payload.id;
    if (!id) throw new Error("Master-data id is required.");
    var row = MasterDataRepository.getById(entity, id);
    if (!row) throw new Error(entity + " " + id + " not found.");
    return row;
  }

  function create(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.name) {
      throw new Error("Name is required.");
    }
    return MasterDataRepository.create(entity, payload);
  }

  function update(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.update(entity, payload.id, payload);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
    return updated;
  }

  function deactivate(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.deactivate(entity, payload.id);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
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
