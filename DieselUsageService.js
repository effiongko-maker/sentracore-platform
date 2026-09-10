/**
 * DieselUsageService.gs
 *
 * Business rules for Diesel Usage. Mirrors GeneratorLogService.gs pattern.
 * Never talks to the spreadsheet directly — only DieselUsageRepository.
 *
 * Consumption (L) = Opening + Added − Closing.
 * Create/update never accept manually supplied consumption.
 */

var DieselUsageService = (function () {
  var HIGH_USAGE_THRESHOLD_L = 100;

  function calculateConsumption_(openingLevel, closingLevel, added) {
    var opening = Number(openingLevel);
    var closing = Number(closingLevel);
    var add =
      added == null || added === "" ? 0 : Number(added);
    if (!isFinite(opening) || !isFinite(closing)) return 0;
    if (!isFinite(add)) add = 0;
    var consumption = opening + add - closing;
    return Math.round(consumption * 100) / 100;
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

  function stripManualConsumption_(payload) {
    payload = payload || {};
    var copy = {};
    var key;
    for (key in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      if (key === "consumption") continue;
      copy[key] = payload[key];
    }
    return copy;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var facilityId = payload.facilityId;
    var generatorId = payload.generatorId;
    var dateFrom = payload.dateFrom ? normalizeDate_(payload.dateFrom) : "";
    var dateTo = payload.dateTo ? normalizeDate_(payload.dateTo) : "";

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.generatorId || "")
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

      var matchesGenerator =
        !generatorId ||
        generatorId === "all" ||
        String(row.generatorId) === String(generatorId);

      var rowDate = normalizeDate_(row.date);
      var matchesFrom = !dateFrom || rowDate >= dateFrom;
      var matchesTo = !dateTo || rowDate <= dateTo;

      return (
        matchesSearch &&
        matchesFacility &&
        matchesGenerator &&
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
    var rows = DieselUsageRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Diesel usage id is required.");
    var row = DieselUsageRepository.getById(id);
    if (!row) throw new Error("Diesel usage " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = stripManualConsumption_(payload);
    if (!payload.date) throw new Error("Date is required.");
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (!payload.generatorId || !String(payload.generatorId).trim()) {
      throw new Error("Generator ID is required.");
    }
    if (payload.openingLevel == null || payload.openingLevel === "") {
      throw new Error("Opening Level is required.");
    }
    if (payload.closingLevel == null || payload.closingLevel === "") {
      throw new Error("Closing Level is required.");
    }

    var openingLevel = Number(payload.openingLevel);
    var closingLevel = Number(payload.closingLevel);
    if (!isFinite(openingLevel)) {
      throw new Error("Opening Level must be a number.");
    }
    if (!isFinite(closingLevel)) {
      throw new Error("Closing Level must be a number.");
    }

    var added = null;
    if (payload.added != null && payload.added !== "") {
      added = Number(payload.added);
      if (!isFinite(added)) throw new Error("Added must be a number.");
    }

    var consumption = calculateConsumption_(openingLevel, closingLevel, added);
    // Spec flags are presentation-only; negative / high usage still persist.

    return DieselUsageRepository.create({
      date: normalizeDate_(payload.date),
      facilityId: String(payload.facilityId).trim(),
      generatorId: String(payload.generatorId).trim(),
      openingLevel: openingLevel,
      added: added,
      closingLevel: closingLevel,
      consumption: consumption,
      createdByUserId: payload.createdByUserId || "",
      updatedByUserId: payload.updatedByUserId || payload.createdByUserId || "",
    });
  }

  function update(payload) {
    payload = stripManualConsumption_(payload);
    if (!payload || !payload.id) throw new Error("Diesel usage id is required.");

    var current = DieselUsageRepository.getById(payload.id);
    if (!current) throw new Error("Diesel usage " + payload.id + " not found.");

    if (payload.facilityId != null && !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (payload.generatorId != null && !String(payload.generatorId).trim()) {
      throw new Error("Generator ID is required.");
    }
    if (payload.date != null && !String(payload.date).trim()) {
      throw new Error("Date is required.");
    }

    var openingLevel = current.openingLevel;
    if (payload.openingLevel != null && payload.openingLevel !== "") {
      openingLevel = Number(payload.openingLevel);
      if (!isFinite(openingLevel)) {
        throw new Error("Opening Level must be a number.");
      }
    }

    var closingLevel = current.closingLevel;
    if (payload.closingLevel != null && payload.closingLevel !== "") {
      closingLevel = Number(payload.closingLevel);
      if (!isFinite(closingLevel)) {
        throw new Error("Closing Level must be a number.");
      }
    }

    var added = current.added;
    if (Object.prototype.hasOwnProperty.call(payload, "added")) {
      if (payload.added == null || payload.added === "") {
        added = null;
      } else {
        added = Number(payload.added);
        if (!isFinite(added)) throw new Error("Added must be a number.");
      }
    }

    var consumption = calculateConsumption_(openingLevel, closingLevel, added);

    var updated = DieselUsageRepository.update(payload.id, {
      date:
        payload.date != null ? normalizeDate_(payload.date) : current.date,
      facilityId:
        payload.facilityId != null
          ? String(payload.facilityId).trim()
          : current.facilityId,
      generatorId:
        payload.generatorId != null
          ? String(payload.generatorId).trim()
          : current.generatorId,
      openingLevel: openingLevel,
      added: added,
      closingLevel: closingLevel,
      consumption: consumption,
      updatedByUserId: payload.updatedByUserId || current.updatedByUserId || "",
    });
    if (!updated) throw new Error("Diesel usage " + payload.id + " not found.");
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
    HIGH_USAGE_THRESHOLD_L: HIGH_USAGE_THRESHOLD_L,
  };
})();
