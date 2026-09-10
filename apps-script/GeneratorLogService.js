/**
 * GeneratorLogService.gs
 *
 * Business rules for Generator Log. Mirrors FacilityService.gs pattern.
 * Never talks to the spreadsheet directly — only GeneratorLogRepository.
 *
 * Hours are always calculated from startedAt / endedAt.
 * Create/update never accept manually supplied hours.
 */

var GeneratorLogService = (function () {
  function calculateHours_(startedAt, endedAt) {
    var startMs = Date.parse(String(startedAt || ""));
    var endMs = Date.parse(String(endedAt || ""));
    if (!isFinite(startMs) || !isFinite(endMs)) return 0;
    var hours = Math.max(0, (endMs - startMs) / 36e5);
    return Math.round(hours * 100) / 100;
  }

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

  function stripManualHours_(payload) {
    payload = payload || {};
    var copy = {};
    var key;
    for (key in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      if (key === "hours") continue;
      copy[key] = payload[key];
    }
    return copy;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var generator = payload.generator;
    var dateFrom = payload.dateFrom ? normalizeDate_(payload.dateFrom) : "";
    var dateTo = payload.dateTo ? normalizeDate_(payload.dateTo) : "";

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.generator || "")
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

      var matchesGenerator =
        !generator ||
        generator === "all" ||
        String(row.generator) === String(generator);

      var rowDate = normalizeDate_(row.date);
      var matchesFrom = !dateFrom || rowDate >= dateFrom;
      var matchesTo = !dateTo || rowDate <= dateTo;

      return matchesSearch && matchesGenerator && matchesFrom && matchesTo;
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
    var rows = GeneratorLogRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Generator log id is required.");
    var row = GeneratorLogRepository.getById(id);
    if (!row) throw new Error("Generator log " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = stripManualHours_(payload);
    if (!payload.date) throw new Error("Date is required.");
    if (!payload.generator || !String(payload.generator).trim()) {
      throw new Error("Generator is required.");
    }
    if (!payload.startedAt) throw new Error("Start is required.");
    if (!payload.endedAt) throw new Error("End is required.");
    if (payload.fuelUsed == null || payload.fuelUsed === "") {
      throw new Error("Fuel used is required.");
    }
    var fuelUsed = Number(payload.fuelUsed);
    if (!isFinite(fuelUsed)) throw new Error("Fuel used must be a number.");

    var startedAt = String(payload.startedAt).trim();
    var endedAt = String(payload.endedAt).trim();
    var hours = calculateHours_(startedAt, endedAt);

    return GeneratorLogRepository.create({
      date: normalizeDate_(payload.date),
      generator: String(payload.generator).trim(),
      startedAt: startedAt,
      endedAt: endedAt,
      hours: hours,
      fuelUsed: fuelUsed,
      remarks: payload.remarks != null ? String(payload.remarks).trim() : "",
      createdByUserId: payload.createdByUserId || "",
      updatedByUserId: payload.updatedByUserId || payload.createdByUserId || "",
    });
  }

  function update(payload) {
    payload = stripManualHours_(payload);
    if (!payload || !payload.id) throw new Error("Generator log id is required.");

    var current = GeneratorLogRepository.getById(payload.id);
    if (!current) throw new Error("Generator log " + payload.id + " not found.");

    var startedAt =
      payload.startedAt != null
        ? String(payload.startedAt).trim()
        : current.startedAt;
    var endedAt =
      payload.endedAt != null ? String(payload.endedAt).trim() : current.endedAt;

    if (payload.generator != null && !String(payload.generator).trim()) {
      throw new Error("Generator is required.");
    }
    if (payload.date != null && !String(payload.date).trim()) {
      throw new Error("Date is required.");
    }
    if (payload.startedAt != null && !startedAt) {
      throw new Error("Start is required.");
    }
    if (payload.endedAt != null && !endedAt) {
      throw new Error("End is required.");
    }

    var fuelUsed = current.fuelUsed;
    if (payload.fuelUsed != null && payload.fuelUsed !== "") {
      fuelUsed = Number(payload.fuelUsed);
      if (!isFinite(fuelUsed)) throw new Error("Fuel used must be a number.");
    }

    var hours = calculateHours_(startedAt, endedAt);

    var updated = GeneratorLogRepository.update(payload.id, {
      date:
        payload.date != null ? normalizeDate_(payload.date) : current.date,
      generator:
        payload.generator != null
          ? String(payload.generator).trim()
          : current.generator,
      startedAt: startedAt,
      endedAt: endedAt,
      hours: hours,
      fuelUsed: fuelUsed,
      remarks:
        payload.remarks != null
          ? String(payload.remarks).trim()
          : current.remarks,
      updatedByUserId: payload.updatedByUserId || current.updatedByUserId || "",
    });
    if (!updated) throw new Error("Generator log " + payload.id + " not found.");
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
