/**
 * SheetFieldUtils.gs — shared sheet helpers for operational repositories.
 */

var SheetFieldUtils = (function () {
  function cellText_(value) {
    if (value == null || value === "") return "";
    if (Object.prototype.toString.call(value) === "[object Date]") {
      return value.toISOString();
    }
    return String(value).trim();
  }

  function parseIdList_(raw) {
    var text = cellText_(raw);
    if (!text) return [];
    var parts = text.split(/[,;|]/);
    var out = [];
    var seen = {};
    for (var i = 0; i < parts.length; i++) {
      var id = String(parts[i]).trim();
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function formatIdList_(ids) {
    if (!ids || !ids.length) return "";
    return ids.join(", ");
  }

  function appendUniqueId_(ids, id) {
    var list = ids ? ids.slice() : [];
    var trimmed = cellText_(id);
    if (!trimmed) return list;
    for (var i = 0; i < list.length; i++) {
      if (list[i] === trimmed) return list;
    }
    list.push(trimmed);
    return list;
  }

  function getHeaderMap_(sheet) {
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return {};
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    return headerMapFromRow_(headers);
  }

  /** Build header map from an already-loaded header row (avoids re-read). */
  function headerMapFromRow_(headers) {
    var map = {};
    for (var i = 0; i < headers.length; i++) {
      map[String(headers[i]).trim()] = i;
    }
    return map;
  }

  function rowToSheetObject_(headers, row) {
    var obj = {};
    for (var i = 0; i < headers.length; i++) {
      obj[String(headers[i]).trim()] = row[i];
    }
    return obj;
  }

  function buildRowFromFields_(headerMap, lastCol, fields) {
    var row = new Array(lastCol);
    for (var i = 0; i < lastCol; i++) row[i] = "";
    for (var header in fields) {
      if (fields.hasOwnProperty(header) && headerMap[header] !== undefined) {
        row[headerMap[header]] = fields[header];
      }
    }
    return row;
  }

  /**
   * Like buildRowFromFields_, but throws when any field with a non-empty value
   * targets a missing header — prevents silent data loss on writes.
   */
  function buildRowFromFieldsStrict_(headerMap, lastCol, fields) {
    var missing = [];
    for (var header in fields) {
      if (!fields.hasOwnProperty(header)) continue;
      if (headerMap[header] !== undefined) continue;
      var value = fields[header];
      if (value == null || String(value).trim() === "") continue;
      missing.push(header);
    }
    if (missing.length) {
      throw new Error(
        "Cannot write sheet fields — missing headers: " + missing.join(", ")
      );
    }
    return buildRowFromFields_(headerMap, lastCol, fields);
  }

  function hasHeader_(headerMap, name) {
    return headerMap[name] !== undefined;
  }

  /**
   * CacheService values are Latin-1 ByteStrings. Arbitrary Unicode (e.g. … — –)
   * must be UTF-8 encoded then base64'd before put().
   */
  var CACHE_UTF8_PREFIX = "u8b64:";

  function cachePutUtf8(cache, key, value, ttlSeconds) {
    var text = value == null ? "" : String(value);
    var encoded =
      CACHE_UTF8_PREFIX +
      Utilities.base64Encode(text, Utilities.Charset.UTF_8);
    if (ttlSeconds == null) {
      cache.put(key, encoded);
    } else {
      cache.put(key, encoded, ttlSeconds);
    }
    return encoded.length;
  }

  function cacheGetUtf8(cache, key) {
    var raw = cache.get(key);
    if (raw == null) return null;
    var text = String(raw);
    if (text.indexOf(CACHE_UTF8_PREFIX) === 0) {
      var bytes = Utilities.base64Decode(
        text.substring(CACHE_UTF8_PREFIX.length)
      );
      return Utilities.newBlob(bytes).getDataAsString("UTF-8");
    }
    // Legacy plain entries (ASCII / previously written Latin-1-safe JSON).
    return text;
  }

  return {
    cellText: cellText_,
    parseIdList: parseIdList_,
    formatIdList: formatIdList_,
    appendUniqueId: appendUniqueId_,
    getHeaderMap: getHeaderMap_,
    headerMapFromRow: headerMapFromRow_,
    rowToSheetObject: rowToSheetObject_,
    buildRowFromFields: buildRowFromFields_,
    buildRowFromFieldsStrict: buildRowFromFieldsStrict_,
    hasHeader: hasHeader_,
    cachePutUtf8: cachePutUtf8,
    cacheGetUtf8: cacheGetUtf8,
  };
})();
