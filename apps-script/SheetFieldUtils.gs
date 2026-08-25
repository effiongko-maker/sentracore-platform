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

  function hasHeader_(headerMap, name) {
    return headerMap[name] !== undefined;
  }

  return {
    cellText: cellText_,
    parseIdList: parseIdList_,
    formatIdList: formatIdList_,
    appendUniqueId: appendUniqueId_,
    getHeaderMap: getHeaderMap_,
    rowToSheetObject: rowToSheetObject_,
    buildRowFromFields: buildRowFromFields_,
    hasHeader: hasHeader_,
  };
})();
