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
        String(row.facilityId || row.facility || "") === String(facilityId);

      var matchesBuilding =
        !buildingId ||
        buildingId === "all" ||
        String(row.buildingId || row.building || "") === String(buildingId);

      var matchesFloor =
        !floorId ||
        floorId === "all" ||
        String(row.floorId || row.floor || "") === String(floorId);

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
    var created = MasterDataRepository.create(entity, payload);
    invalidateLocationCatalogCache_();
    return created;
  }

  function update(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.update(entity, payload.id, payload);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
    invalidateLocationCatalogCache_();
    return updated;
  }

  function deactivate(payload) {
    var entity = normalizeEntity_(payload);
    if (!payload || !payload.id) throw new Error("Id is required.");
    var updated = MasterDataRepository.deactivate(entity, payload.id);
    if (!updated) throw new Error(entity + " " + payload.id + " not found.");
    invalidateLocationCatalogCache_();
    return updated;
  }

  function isActiveRow_(row) {
    var status = String((row && row.status) || "active")
      .toLowerCase()
      .replace(/\s+/g, "_");
    return status === "active" || status === "" || status === "pending";
  }

  /** Facility sheet uses FacilityService aliases (Facility ID / Facility Name / Status). */
  function facilityCell_(row, key) {
    if (!row) return "";
    if (row[key] != null && String(row[key]).trim() !== "") {
      return String(row[key]).trim();
    }
    return "";
  }

  function isActiveFacilityRow_(row) {
    var status = String(
      facilityCell_(row, "status") ||
        facilityCell_(row, "Status") ||
        "active"
    )
      .toLowerCase()
      .replace(/\s+/g, "_");
    return status === "active" || status === "" || status === "pending";
  }

  function projectFacilityLocationItem_(row) {
    return {
      id:
        facilityCell_(row, "id") || facilityCell_(row, "Facility ID"),
      name:
        facilityCell_(row, "name") || facilityCell_(row, "Facility Name"),
      status:
        facilityCell_(row, "status") ||
        facilityCell_(row, "Status") ||
        "active",
    };
  }

  function projectLocationItem_(row, relations) {
    relations = relations || {};
    return {
      id: String((row && row.id) || "").trim(),
      name: String((row && row.name) || "").trim(),
      facilityId: relations.facilityId
        ? String(relations.facilityId).trim()
        : undefined,
      buildingId: relations.buildingId
        ? String(relations.buildingId).trim()
        : undefined,
      floorId: relations.floorId
        ? String(relations.floorId).trim()
        : undefined,
    };
  }

  function invalidateLocationCatalogCache_() {
    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.invalidateLocationCatalog();
    }
  }

  /**
   * One-shot location hierarchy for cascading selectors.
   * Flat catalog — client filters locally (Facility → Building → Floor → Room).
   */
  function getLocationCatalog(payload) {
    payload = payload || {};
    var t0 = Date.now();
    var skipCache = payload._skipCache === true;

    if (!skipCache && typeof CatalogCacheService !== "undefined") {
      var cached = CatalogCacheService.getLocationCatalog();
      if (cached && cached.data) {
        var warm = {
          facilities: cached.data.facilities || [],
          buildings: cached.data.buildings || [],
          floors: cached.data.floors || [],
          rooms: cached.data.rooms || [],
        };
        if (payload._auditTiming) {
          warm._serverTimings = {
            cacheHit: true,
            cacheReadMs: cached.cacheReadMs || 0,
            sheetReadMs: 0,
            mapMs: 0,
            totalMs: Date.now() - t0,
            counts: {
              facilities: warm.facilities.length,
              buildings: warm.buildings.length,
              floors: warm.floors.length,
              rooms: warm.rooms.length,
            },
          };
        }
        return warm;
      }
    }

    var facilitiesRaw =
      typeof FacilityRepository !== "undefined"
        ? FacilityRepository.getAll()
        : [];
    var buildingsRaw = MasterDataRepository.getAll("buildings");
    var floorsRaw = MasterDataRepository.getAll("floors");
    var roomsRaw = MasterDataRepository.getAll("rooms");
    var tRead = Date.now();

    var facilities = [];
    var i;
    for (i = 0; i < facilitiesRaw.length; i++) {
      if (!isActiveFacilityRow_(facilitiesRaw[i])) continue;
      var facility = projectFacilityLocationItem_(facilitiesRaw[i]);
      if (facility.id && facility.name) facilities.push(facility);
    }

    var buildings = [];
    for (i = 0; i < buildingsRaw.length; i++) {
      if (!isActiveRow_(buildingsRaw[i])) continue;
      var building = projectLocationItem_(buildingsRaw[i], {
        facilityId: buildingsRaw[i].facilityId || buildingsRaw[i].facility,
      });
      if (building.id && building.name) buildings.push(building);
    }

    var floors = [];
    for (i = 0; i < floorsRaw.length; i++) {
      if (!isActiveRow_(floorsRaw[i])) continue;
      var floor = projectLocationItem_(floorsRaw[i], {
        facilityId: floorsRaw[i].facilityId || floorsRaw[i].facility,
        buildingId: floorsRaw[i].buildingId || floorsRaw[i].building,
      });
      if (floor.id && floor.name) floors.push(floor);
    }

    var rooms = [];
    for (i = 0; i < roomsRaw.length; i++) {
      if (!isActiveRow_(roomsRaw[i])) continue;
      var room = projectLocationItem_(roomsRaw[i], {
        facilityId: roomsRaw[i].facilityId || roomsRaw[i].facility,
        buildingId: roomsRaw[i].buildingId || roomsRaw[i].building,
        floorId: roomsRaw[i].floorId || roomsRaw[i].floor,
      });
      if (room.id && room.name) rooms.push(room);
    }

    var result = {
      facilities: facilities,
      buildings: buildings,
      floors: floors,
      rooms: rooms,
    };

    if (typeof CatalogCacheService !== "undefined") {
      CatalogCacheService.putLocationCatalog(result);
    }

    if (payload._auditTiming) {
      result._serverTimings = {
        cacheHit: false,
        cacheReadMs: 0,
        sheetReadMs: tRead - t0,
        mapMs: Date.now() - tRead,
        totalMs: Date.now() - t0,
        counts: {
          facilities: facilities.length,
          buildings: buildings.length,
          floors: floors.length,
          rooms: rooms.length,
        },
      };
    }

    return result;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    deactivate: deactivate,
    getLocationCatalog: getLocationCatalog,
  };
})();
