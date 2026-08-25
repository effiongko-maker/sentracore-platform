/**
 * UserService.gs
 *
 * Business rules for Users.
 * Never talks to the spreadsheet directly — only UserRepository.
 */

var UserService = (function () {
  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var status = payload.status;
    var role = payload.role;
    var facility = payload.facility;

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.name || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.email || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.phone || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.role || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.specialization || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.facility || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status || "")
          .toLowerCase() === String(status).toLowerCase();

      var matchesRole =
        !role ||
        role === "all" ||
        String(row.role || "")
          .toLowerCase() === String(role).toLowerCase();

      var rowFacility = String(row.facility || "");
      var matchesFacility =
        !facility ||
        facility === "all" ||
        rowFacility === String(facility) ||
        (rowFacility && rowFacility !== "-" &&
          String(rowFacility).toLowerCase() === String(facility).toLowerCase());

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
              (rowFacility === fid ||
                rowFacility === fname ||
                String(rowFacility).toLowerCase() ===
                  String(fname).toLowerCase())
            ) {
              matchesFacility = true;
              break;
            }
          }
        } catch (ignore) {}
      }

      return (
        matchesSearch && matchesStatus && matchesRole && matchesFacility
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
    var rows = UserRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    return paginate_(filtered, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("User id is required.");
    var user = UserRepository.getById(id);
    if (!user) throw new Error("User " + id + " not found.");
    return user;
  }

  function create(payload) {
    if (!payload || !payload.name) throw new Error("User name is required.");
    if (!payload.email) throw new Error("User email is required.");
    var created = UserRepository.create(payload);
    if (!created || !created.id) {
      throw new Error(
        "User create failed: repository returned no record. Check USERS sheet headers."
      );
    }
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
    }
    return created;
  }

  function update(payload) {
    if (!payload || !payload.id) throw new Error("User id is required.");
    var updated = UserRepository.update(payload.id, payload);
    if (!updated) throw new Error("User " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
    }
    return updated;
  }

  function deactivate(payload) {
    if (!payload || !payload.id) throw new Error("User id is required.");
    var updated = UserRepository.deactivate(payload.id);
    if (!updated) throw new Error("User " + payload.id + " not found.");
    if (typeof ReportingSnapshotService !== "undefined") {
      ReportingSnapshotService.notifyModuleChanged("users");
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
