/**
 * EnergyReadingService.gs
 *
 * Business rules for Energy Reading. Mirrors GeneratorLogService.gs pattern.
 * Never talks to the spreadsheet directly — only EnergyReadingRepository.
 *
 * Reading is the observed meter value — no consumption calculation.
 */

var EnergyReadingService = (function () {
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
    var meter = payload.meter;
    var dateFrom = payload.dateFrom ? normalizeDate_(payload.dateFrom) : "";
    var dateTo = payload.dateTo ? normalizeDate_(payload.dateTo) : "";

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.meter || "")
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
        String(row.reading != null ? row.reading : "")
          .toLowerCase()
          .indexOf(search) !== -1;

      var matchesMeter =
        !meter || meter === "all" || String(row.meter) === String(meter);

      var rowDate = normalizeDate_(row.date);
      var matchesFrom = !dateFrom || rowDate >= dateFrom;
      var matchesTo = !dateTo || rowDate <= dateTo;

      return matchesSearch && matchesMeter && matchesFrom && matchesTo;
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
      // newest (default)
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
    var rows = EnergyReadingRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Energy reading id is required.");
    var row = EnergyReadingRepository.getById(id);
    if (!row) throw new Error("Energy reading " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    if (!payload.date) throw new Error("Date is required.");
    if (payload.reading == null || payload.reading === "") {
      throw new Error("Reading is required.");
    }
    var reading = Number(payload.reading);
    if (!isFinite(reading)) throw new Error("Reading must be a number.");

    return EnergyReadingRepository.create({
      date: normalizeDate_(payload.date),
      meter: payload.meter != null ? String(payload.meter).trim() : "",
      reading: reading,
      remarks: payload.remarks != null ? String(payload.remarks).trim() : "",
      createdByUserId: payload.createdByUserId || "",
      updatedByUserId: payload.updatedByUserId || payload.createdByUserId || "",
    });
  }

  function update(payload) {
    payload = payload || {};
    if (!payload.id) throw new Error("Energy reading id is required.");

    var current = EnergyReadingRepository.getById(payload.id);
    if (!current) throw new Error("Energy reading " + payload.id + " not found.");

    if (payload.date != null && !String(payload.date).trim()) {
      throw new Error("Date is required.");
    }

    var reading = current.reading;
    if (payload.reading != null && payload.reading !== "") {
      reading = Number(payload.reading);
      if (!isFinite(reading)) throw new Error("Reading must be a number.");
    }

    var updated = EnergyReadingRepository.update(payload.id, {
      date:
        payload.date != null ? normalizeDate_(payload.date) : current.date,
      meter:
        payload.meter != null ? String(payload.meter).trim() : current.meter,
      reading: reading,
      remarks:
        payload.remarks != null
          ? String(payload.remarks).trim()
          : current.remarks,
      updatedByUserId: payload.updatedByUserId || current.updatedByUserId || "",
    });
    if (!updated) throw new Error("Energy reading " + payload.id + " not found.");
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
