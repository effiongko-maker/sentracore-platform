/**
 * ConsumablesUpdateService.gs
 *
 * Business rules for Consumables Update. Mirrors DieselUsageService.gs.
 * Never talks to the spreadsheet directly — only ConsumablesUpdateRepository.
 *
 * Closing = Opening + Received − Issued (never accept manual Closing).
 * Reorder Level carries forward from the item's most recent prior entry
 * when omitted (matched by facilityId + itemName, or existing itemId).
 */

var ConsumablesUpdateService = (function () {
  function calculateClosing_(opening, issued, received) {
    var open = Number(opening);
    var issue = Number(issued);
    var recv = received == null || received === "" ? 0 : Number(received);
    if (!isFinite(open) || !isFinite(issue)) return 0;
    if (!isFinite(recv)) recv = 0;
    var closing = open + recv - issue;
    return Math.round(closing * 100) / 100;
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

  function normalizeItemName_(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function stripManualClosing_(payload) {
    payload = payload || {};
    var copy = {};
    var key;
    for (key in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
      if (key === "closing") continue;
      copy[key] = payload[key];
    }
    return copy;
  }

  function compareRecency_(a, b) {
    var dateCmp = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateCmp !== 0) return dateCmp;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  }

  /**
   * Most recent prior entry for the same facility + item name.
   * Optionally exclude an entry id (for updates).
   */
  function findPriorItemEntry_(facilityId, itemName, excludeId) {
    var rows = ConsumablesUpdateRepository.getAll();
    var facility = String(facilityId || "").trim();
    var nameKey = normalizeItemName_(itemName);
    var matches = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (excludeId && String(row.id) === String(excludeId)) continue;
      if (String(row.facilityId || "").trim() !== facility) continue;
      if (normalizeItemName_(row.itemName) !== nameKey) continue;
      matches.push(row);
    }
    if (!matches.length) return null;
    matches.sort(compareRecency_);
    return matches[0];
  }

  function resolveItemId_(facilityId, itemName, excludeId) {
    var prior = findPriorItemEntry_(facilityId, itemName, excludeId);
    if (prior && prior.itemId) return String(prior.itemId);
    return ConsumablesUpdateRepository.nextItemId_();
  }

  function resolveReorderLevel_(
    supplied,
    facilityId,
    itemName,
    excludeId
  ) {
    if (supplied != null && supplied !== "") {
      var n = Number(supplied);
      if (!isFinite(n)) throw new Error("Reorder Level must be a number.");
      return n;
    }
    var prior = findPriorItemEntry_(facilityId, itemName, excludeId);
    if (prior && prior.reorderLevel != null && prior.reorderLevel !== "") {
      var carried = Number(prior.reorderLevel);
      return isFinite(carried) ? carried : null;
    }
    return null;
  }

  function applyFilters_(rows, payload) {
    payload = payload || {};
    var search = String(payload.search || "")
      .toLowerCase()
      .trim();
    var facilityId = payload.facilityId;
    var itemName = payload.itemName;
    var itemId = payload.itemId;
    var dateFrom = payload.dateFrom ? normalizeDate_(payload.dateFrom) : "";
    var dateTo = payload.dateTo ? normalizeDate_(payload.dateTo) : "";

    return rows.filter(function (row) {
      var matchesSearch =
        !search ||
        String(row.facilityId || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.itemName || "")
          .toLowerCase()
          .indexOf(search) !== -1 ||
        String(row.itemId || "")
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

      var matchesItemName =
        !itemName ||
        itemName === "all" ||
        normalizeItemName_(row.itemName) === normalizeItemName_(itemName) ||
        String(row.itemName || "")
          .toLowerCase()
          .indexOf(String(itemName).toLowerCase()) !== -1;

      var matchesItemId =
        !itemId || itemId === "all" || String(row.itemId) === String(itemId);

      var rowDate = normalizeDate_(row.date);
      var matchesFrom = !dateFrom || rowDate >= dateFrom;
      var matchesTo = !dateTo || rowDate <= dateTo;

      return (
        matchesSearch &&
        matchesFacility &&
        matchesItemName &&
        matchesItemId &&
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
    var rows = ConsumablesUpdateRepository.getAll();
    var filtered = applyFilters_(rows, payload);
    var sorted = sortRows_(filtered, payload);
    return paginate_(sorted, payload);
  }

  function getById(payload) {
    var id = payload && payload.id;
    if (!id) throw new Error("Consumables update id is required.");
    var row = ConsumablesUpdateRepository.getById(id);
    if (!row) throw new Error("Consumables update " + id + " not found.");
    return row;
  }

  function create(payload) {
    payload = stripManualClosing_(payload);
    if (!payload.date) throw new Error("Date is required.");
    if (!payload.facilityId || !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (!payload.itemName || !String(payload.itemName).trim()) {
      throw new Error("Item Name is required.");
    }
    if (payload.opening == null || payload.opening === "") {
      throw new Error("Opening is required.");
    }
    if (payload.issued == null || payload.issued === "") {
      throw new Error("Issued is required.");
    }

    var opening = Number(payload.opening);
    var issued = Number(payload.issued);
    if (!isFinite(opening)) throw new Error("Opening must be a number.");
    if (!isFinite(issued)) throw new Error("Issued must be a number.");

    var received = null;
    if (payload.received != null && payload.received !== "") {
      received = Number(payload.received);
      if (!isFinite(received)) throw new Error("Received must be a number.");
    }

    var facilityId = String(payload.facilityId).trim();
    var itemName = String(payload.itemName).trim();
    var itemId = resolveItemId_(facilityId, itemName, null);
    var reorderLevel = resolveReorderLevel_(
      payload.reorderLevel,
      facilityId,
      itemName,
      null
    );
    var closing = calculateClosing_(opening, issued, received);

    return ConsumablesUpdateRepository.create({
      itemId: itemId,
      date: normalizeDate_(payload.date),
      facilityId: facilityId,
      itemName: itemName,
      opening: opening,
      received: received,
      issued: issued,
      closing: closing,
      reorderLevel: reorderLevel,
      createdByUserId: payload.createdByUserId || "",
      updatedByUserId: payload.updatedByUserId || payload.createdByUserId || "",
    });
  }

  function update(payload) {
    payload = stripManualClosing_(payload);
    if (!payload || !payload.id) {
      throw new Error("Consumables update id is required.");
    }

    var current = ConsumablesUpdateRepository.getById(payload.id);
    if (!current) {
      throw new Error("Consumables update " + payload.id + " not found.");
    }

    if (payload.facilityId != null && !String(payload.facilityId).trim()) {
      throw new Error("Facility ID is required.");
    }
    if (payload.itemName != null && !String(payload.itemName).trim()) {
      throw new Error("Item Name is required.");
    }
    if (payload.date != null && !String(payload.date).trim()) {
      throw new Error("Date is required.");
    }

    var facilityId =
      payload.facilityId != null
        ? String(payload.facilityId).trim()
        : current.facilityId;
    var itemName =
      payload.itemName != null
        ? String(payload.itemName).trim()
        : current.itemName;

    var opening = current.opening;
    if (payload.opening != null && payload.opening !== "") {
      opening = Number(payload.opening);
      if (!isFinite(opening)) throw new Error("Opening must be a number.");
    }

    var issued = current.issued;
    if (payload.issued != null && payload.issued !== "") {
      issued = Number(payload.issued);
      if (!isFinite(issued)) throw new Error("Issued must be a number.");
    }

    var received = current.received;
    if (Object.prototype.hasOwnProperty.call(payload, "received")) {
      if (payload.received == null || payload.received === "") {
        received = null;
      } else {
        received = Number(payload.received);
        if (!isFinite(received)) throw new Error("Received must be a number.");
      }
    }

    var itemId = current.itemId;
    var facilityOrNameChanged =
      String(facilityId) !== String(current.facilityId) ||
      normalizeItemName_(itemName) !== normalizeItemName_(current.itemName);
    if (facilityOrNameChanged) {
      itemId = resolveItemId_(facilityId, itemName, payload.id);
    }

    var reorderLevel = current.reorderLevel;
    if (Object.prototype.hasOwnProperty.call(payload, "reorderLevel")) {
      reorderLevel = resolveReorderLevel_(
        payload.reorderLevel,
        facilityId,
        itemName,
        payload.id
      );
    }

    var closing = calculateClosing_(opening, issued, received);

    var updated = ConsumablesUpdateRepository.update(payload.id, {
      itemId: itemId,
      date:
        payload.date != null ? normalizeDate_(payload.date) : current.date,
      facilityId: facilityId,
      itemName: itemName,
      opening: opening,
      received: received,
      issued: issued,
      closing: closing,
      reorderLevel: reorderLevel,
      updatedByUserId: payload.updatedByUserId || current.updatedByUserId || "",
    });
    if (!updated) {
      throw new Error("Consumables update " + payload.id + " not found.");
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
