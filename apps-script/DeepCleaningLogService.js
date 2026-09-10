/**
 * DeepCleaningLogService.gs
 *
 * Business rules for Deep Cleaning Log.
 * Never talks to the spreadsheet directly — only DeepCleaningLogRepository.
 * Server assigns id / createdAt / updatedAt — never trusts client copies.
 * No derived thresholds or scoring (source does not define them).
 */

var DeepCleaningLogService = (function () {
  function normalizeDate_(value) {
    var text = String(value || "").trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    var parsed = Date.parse(text);
    if (!isFinite(parsed)) return text;
    var dt = new Date(parsed);
    var y = dt.getUTCFullYear();
    var m = ("0" + (dt.getUTCMonth() + 1)).slice(-2);
    var d = ("0" + dt.getUTCDate()).slice(-2);
    return y + "-" + m + "-" + d;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var facilityId = payload.facilityId;
    var status = payload.status;
    var dateFrom = payload.dateFrom ? normalizeDate_(payload.dateFrom) : "";
    var dateTo = payload.dateTo ? normalizeDate_(payload.dateTo) : "";

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.area || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.vendorTeam || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.status || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.remarks || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.id || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.date || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var matchesStatus =
        !status ||
        status === "all" ||
        String(row.status || "")
          .toLowerCase()
          .indexOf(String(status).toLowerCase()) !== -1;

      var rowDate = normalizeDate_(row.date);
      var matchesFrom = !dateFrom || rowDate >= dateFrom;
      var matchesTo = !dateTo || rowDate <= dateTo;

      return (
        matchesSearch &&
        matchesFacility &&
        matchesStatus &&
        matchesFrom &&
        matchesTo
      );
    });
  }

  function sortRows_(rows, payload) {
    payload = payload || {};
    var sort = String(payload.sort || "newest");
    var copy = rows.slice();
    copy.sort(function (a, b) {
      if (sort === "oldest") {
        return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
      }
      if (sort === "date_asc") {
        return String(a.date || "").localeCompare(String(b.date || ""));
      }
      if (sort === "date_desc") {
        return String(b.date || "").localeCompare(String(a.date || ""));
      }
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
    return copy;
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
    var rows = DeepCleaningLogRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Deep cleaning log id is required.");
    var row = DeepCleaningLogRepository.getById(id);
    if (!row) throw new Error("Deep cleaning log " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    if (!payload.date) throw new Error("Date is required.");
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (!payload.area || !String(payload.area).trim()) {
      throw new Error("Area is required.");
    }
    if (!payload.vendorTeam || !String(payload.vendorTeam).trim()) {
      throw new Error("Vendor/Team is required.");
    }
    if (!payload.status || !String(payload.status).trim()) {
      throw new Error("Status is required.");
    }

    return DeepCleaningLogRepository.create({
      date: normalizeDate_(payload.date),
      facilityId: String(payload.facilityId).trim(),
      area: String(payload.area).trim(),
      vendorTeam: String(payload.vendorTeam).trim(),
      status: String(payload.status).trim(),
      remarks: payload.remarks != null ? String(payload.remarks).trim() : "",
      createdByUserId: payload.createdByUserId || "",
      updatedByUserId: payload.updatedByUserId || payload.createdByUserId || "",
    });
  }

  function update(payload) {
    payload = payload || {};
    if (!payload.id) throw new Error("Deep cleaning log id is required.");

    var current = DeepCleaningLogRepository.getById(payload.id);
    if (!current) {
      throw new Error("Deep cleaning log " + payload.id + " not found.");
    }

    if (payload.facilityId != null && !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (payload.area != null && !String(payload.area).trim()) {
      throw new Error("Area is required.");
    }
    if (payload.vendorTeam != null && !String(payload.vendorTeam).trim()) {
      throw new Error("Vendor/Team is required.");
    }
    if (payload.status != null && !String(payload.status).trim()) {
      throw new Error("Status is required.");
    }
    if (payload.date != null && !String(payload.date).trim()) {
      throw new Error("Date is required.");
    }

    var updated = DeepCleaningLogRepository.update(payload.id, {
      date:
        payload.date != null ? normalizeDate_(payload.date) : current.date,
      facilityId:
        payload.facilityId != null
          ? String(payload.facilityId).trim()
          : current.facilityId,
      area:
        payload.area != null ? String(payload.area).trim() : current.area,
      vendorTeam:
        payload.vendorTeam != null
          ? String(payload.vendorTeam).trim()
          : current.vendorTeam,
      status:
        payload.status != null
          ? String(payload.status).trim()
          : current.status,
      remarks:
        payload.remarks != null
          ? String(payload.remarks).trim()
          : current.remarks,
      updatedByUserId: payload.updatedByUserId || current.updatedByUserId || "",
    });
    if (!updated) {
      throw new Error("Deep cleaning log " + payload.id + " not found.");
    }
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
