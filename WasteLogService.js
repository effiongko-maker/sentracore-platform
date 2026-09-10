/**
 * WasteLogService.gs
 *
 * Business rules for Waste Log. Mirrors EnergyReadingService.gs pattern.
 * Never talks to the spreadsheet directly — only WasteLogRepository.
 * No calculated fields.
 */

var WasteLogService = (function () {
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
    var wasteType = payload.wasteType;
    var dateFrom = payload.dateFrom ? normalizeDate_(payload.dateFrom) : "";
    var dateTo = payload.dateTo ? normalizeDate_(payload.dateTo) : "";

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.wasteType || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.disposalMethod || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.unit || "")
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

      var matchesWasteType =
        !wasteType ||
        wasteType === "all" ||
        String(row.wasteType || "")
          .toLowerCase()
          .indexOf(String(wasteType).toLowerCase()) !== -1;

      var rowDate = normalizeDate_(row.date);
      var matchesFrom = !dateFrom || rowDate >= dateFrom;
      var matchesTo = !dateTo || rowDate <= dateTo;

      return (
        matchesSearch &&
        matchesFacility &&
        matchesWasteType &&
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
    var rows = WasteLogRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Waste log id is required.");
    var row = WasteLogRepository.getById(id);
    if (!row) throw new Error("Waste log " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = payload || {};
    if (!payload.date) throw new Error("Date is required.");
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (!payload.wasteType || !String(payload.wasteType).trim()) {
      throw new Error("Waste Type is required.");
    }
    if (payload.quantity == null || payload.quantity === "") {
      throw new Error("Quantity is required.");
    }
    var quantity = Number(payload.quantity);
    if (!isFinite(quantity)) throw new Error("Quantity must be a number.");
    if (!payload.unit || !String(payload.unit).trim()) {
      throw new Error("Unit is required.");
    }
    if (!payload.disposalMethod || !String(payload.disposalMethod).trim()) {
      throw new Error("Disposal Method is required.");
    }

    return WasteLogRepository.create({
      date: normalizeDate_(payload.date),
      facilityId: String(payload.facilityId).trim(),
      wasteType: String(payload.wasteType).trim(),
      quantity: quantity,
      unit: String(payload.unit).trim(),
      disposalMethod: String(payload.disposalMethod).trim(),
      remarks: payload.remarks != null ? String(payload.remarks).trim() : "",
      createdByUserId: payload.createdByUserId || "",
      updatedByUserId: payload.updatedByUserId || payload.createdByUserId || "",
    });
  }

  function update(payload) {
    payload = payload || {};
    if (!payload.id) throw new Error("Waste log id is required.");

    var current = WasteLogRepository.getById(payload.id);
    if (!current) throw new Error("Waste log " + payload.id + " not found.");

    if (payload.facilityId != null && !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (payload.wasteType != null && !String(payload.wasteType).trim()) {
      throw new Error("Waste Type is required.");
    }
    if (payload.date != null && !String(payload.date).trim()) {
      throw new Error("Date is required.");
    }
    if (payload.unit != null && !String(payload.unit).trim()) {
      throw new Error("Unit is required.");
    }
    if (
      payload.disposalMethod != null &&
      !String(payload.disposalMethod).trim()
    ) {
      throw new Error("Disposal Method is required.");
    }

    var quantity = current.quantity;
    if (payload.quantity != null && payload.quantity !== "") {
      quantity = Number(payload.quantity);
      if (!isFinite(quantity)) throw new Error("Quantity must be a number.");
    }

    var updated = WasteLogRepository.update(payload.id, {
      date:
        payload.date != null ? normalizeDate_(payload.date) : current.date,
      facilityId:
        payload.facilityId != null
          ? String(payload.facilityId).trim()
          : current.facilityId,
      wasteType:
        payload.wasteType != null
          ? String(payload.wasteType).trim()
          : current.wasteType,
      quantity: quantity,
      unit:
        payload.unit != null ? String(payload.unit).trim() : current.unit,
      disposalMethod:
        payload.disposalMethod != null
          ? String(payload.disposalMethod).trim()
          : current.disposalMethod,
      remarks:
        payload.remarks != null
          ? String(payload.remarks).trim()
          : current.remarks,
      updatedByUserId: payload.updatedByUserId || current.updatedByUserId || "",
    });
    if (!updated) throw new Error("Waste log " + payload.id + " not found.");
    return updated;
  }

  return {
    getAll: getAll,
    getById: getById,
    create: create,
    update: update,
  };
})();
