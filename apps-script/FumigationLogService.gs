/**
 * FumigationLogService.gs
 *
 * Business rules for Fumigation Log.
 * Never talks to the spreadsheet directly — only FumigationLogRepository.
 * Server assigns id / createdAt / updatedAt — never trusts client copies.
 * Due display states are client-derived only; nextDueDate is the source of truth.
 */

var FumigationLogService = (function () {
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
    var dateFrom = payload.dateFrom ? normalizeDate_(payload.dateFrom) : "";
    var dateTo = payload.dateTo ? normalizeDate_(payload.dateTo) : "";
    var nextDueFrom = payload.nextDueFrom
      ? normalizeDate_(payload.nextDueFrom)
      : "";
    var nextDueTo = payload.nextDueTo
      ? normalizeDate_(payload.nextDueTo)
      : "";

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.areaTreated || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.pestType || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.vendor || "")
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
          .indexOf(search) !== -1 ||
        String(row.nextDueDate || "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesFacility =
        !facilityId ||
        facilityId === "all" ||
        String(row.facilityId) === String(facilityId);

      var rowDate = normalizeDate_(row.date);
      var matchesFrom = !dateFrom || rowDate >= dateFrom;
      var matchesTo = !dateTo || rowDate <= dateTo;

      var rowDue = normalizeDate_(row.nextDueDate);
      var matchesDueFrom = !nextDueFrom || rowDue >= nextDueFrom;
      var matchesDueTo = !nextDueTo || rowDue <= nextDueTo;

      return (
        matchesSearch &&
        matchesFacility &&
        matchesFrom &&
        matchesTo &&
        matchesDueFrom &&
        matchesDueTo
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
      if (sort === "next_due_asc") {
        return String(a.nextDueDate || "").localeCompare(
          String(b.nextDueDate || "")
        );
      }
      if (sort === "next_due_desc") {
        return String(b.nextDueDate || "").localeCompare(
          String(a.nextDueDate || "")
        );
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
    var rows = FumigationLogRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Fumigation log id is required.");
    var row = FumigationLogRepository.getById(id);
    if (!row) throw new Error("Fumigation log " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    if (!payload.date) throw new Error("Date is required.");
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (!payload.areaTreated || !String(payload.areaTreated).trim()) {
      throw new Error("Area Treated is required.");
    }
    if (!payload.pestType || !String(payload.pestType).trim()) {
      throw new Error("Pest Type is required.");
    }
    if (!payload.vendor || !String(payload.vendor).trim()) {
      throw new Error("Vendor is required.");
    }
    if (!payload.nextDueDate || !String(payload.nextDueDate).trim()) {
      throw new Error("Next Due Date is required.");
    }

    return FumigationLogRepository.create({
      date: normalizeDate_(payload.date),
      facilityId: String(payload.facilityId).trim(),
      areaTreated: String(payload.areaTreated).trim(),
      pestType: String(payload.pestType).trim(),
      vendor: String(payload.vendor).trim(),
      nextDueDate: normalizeDate_(payload.nextDueDate),
      remarks: payload.remarks != null ? String(payload.remarks).trim() : "",
      createdByUserId: payload.createdByUserId || "",
      updatedByUserId: payload.updatedByUserId || payload.createdByUserId || "",
    });
  }

  function update(payload) {
    payload = payload || {};
    if (!payload.id) throw new Error("Fumigation log id is required.");

    var current = FumigationLogRepository.getById(payload.id);
    if (!current) {
      throw new Error("Fumigation log " + payload.id + " not found.");
    }

    if (payload.facilityId != null && !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (payload.areaTreated != null && !String(payload.areaTreated).trim()) {
      throw new Error("Area Treated is required.");
    }
    if (payload.pestType != null && !String(payload.pestType).trim()) {
      throw new Error("Pest Type is required.");
    }
    if (payload.vendor != null && !String(payload.vendor).trim()) {
      throw new Error("Vendor is required.");
    }
    if (payload.date != null && !String(payload.date).trim()) {
      throw new Error("Date is required.");
    }
    if (payload.nextDueDate != null && !String(payload.nextDueDate).trim()) {
      throw new Error("Next Due Date is required.");
    }

    var updated = FumigationLogRepository.update(payload.id, {
      date:
        payload.date != null ? normalizeDate_(payload.date) : current.date,
      facilityId:
        payload.facilityId != null
          ? String(payload.facilityId).trim()
          : current.facilityId,
      areaTreated:
        payload.areaTreated != null
          ? String(payload.areaTreated).trim()
          : current.areaTreated,
      pestType:
        payload.pestType != null
          ? String(payload.pestType).trim()
          : current.pestType,
      vendor:
        payload.vendor != null
          ? String(payload.vendor).trim()
          : current.vendor,
      nextDueDate:
        payload.nextDueDate != null
          ? normalizeDate_(payload.nextDueDate)
          : current.nextDueDate,
      remarks:
        payload.remarks != null
          ? String(payload.remarks).trim()
          : current.remarks,
      updatedByUserId: payload.updatedByUserId || current.updatedByUserId || "",
    });
    if (!updated) {
      throw new Error("Fumigation log " + payload.id + " not found.");
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
