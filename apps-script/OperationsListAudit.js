/**
 * OperationalListAudit.gs
 *
 * Audit-gated timing helpers for operational register getAll paths.
 * Active only when payload._auditTiming is true — no production behaviour change.
 */

var OperationalListAudit = (function () {
  /**
   * Wraps a domain getAll pipeline with measured phase boundaries.
   * repositoryGetAll(auditCollector) must populate sheet + mapping timings on auditCollector.
   */
  function instrumentGetAll_(payload, repositoryGetAll, applyFilters, sortFn, paginate) {
    var tTotal0 = Date.now();
    var repoAudit = {};

    var rows = repositoryGetAll(repoAudit);

    var tFilter0 = Date.now();
    var filtered = applyFilters(rows, payload);
    var filterMs = Date.now() - tFilter0;

    var tSort0 = Date.now();
    var sorted = sortFn(filtered);
    var sortMs = Date.now() - tSort0;

    var rowsBeforePagination = sorted.length;

    var tPage0 = Date.now();
    var result = paginate(sorted, payload);
    var paginationMs = Date.now() - tPage0;

    var tSer0 = Date.now();
    try {
      JSON.stringify({
        success: true,
        message: "",
        data: result,
      });
    } catch (serErr) {}
    var serializationMs = Date.now() - tSer0;

    var totalServerMs = Date.now() - tTotal0;
    var rowsReturned =
      result && result.data && result.data.length != null
        ? result.data.length
        : 0;

    result._listDiagnostics = {
      totalServerMs: totalServerMs,
      spreadsheetOpenMs: repoAudit.spreadsheetOpenMs || 0,
      sheetLookupMs: repoAudit.sheetLookupMs || 0,
      sheetReadMs: repoAudit.sheetReadMs || 0,
      rawRowCount: repoAudit.rawRowCount || 0,
      rawColumnCount: repoAudit.rawColumnCount || 0,
      canonicalMappingMs: repoAudit.canonicalMappingMs || 0,
      filterMs: filterMs,
      sortMs: sortMs,
      paginationMs: paginationMs,
      serializationMs: serializationMs,
      rowsMapped: repoAudit.rowsMapped || rows.length,
      rowsFiltered: filtered.length,
      rowsSorted: sorted.length,
      rowsBeforePagination: rowsBeforePagination,
      rowsReturned: rowsReturned,
      cacheHit: !!repoAudit.cacheHit,
      cacheReadMs: repoAudit.cacheReadMs || 0,
      cacheInteraction: repoAudit.cacheInteraction || "none",
    };

    Logger.log(
      "[OperationalListAudit] " +
        JSON.stringify({
          totalServerMs: totalServerMs,
          cacheHit: !!repoAudit.cacheHit,
          sheetReadMs: repoAudit.sheetReadMs || 0,
          rowsMapped: repoAudit.rowsMapped || rows.length,
          rowsReturned: rowsReturned,
        })
    );

    return result;
  }

  /**
   * Optional audit collector passed to Repository.getAll(collector).
   * Splits getSheet_ / getDataRange / getValues / mapping into measured phases.
   */
  function beginSheetRead_(getSheetFn, collector) {
    var tOpen0 = Date.now();
    var sheet = getSheetFn();
    collector.spreadsheetOpenMs = Date.now() - tOpen0;

    var tLookup0 = Date.now();
    var dataRange = sheet.getDataRange();
    collector.sheetLookupMs = Date.now() - tLookup0;

    var tRead0 = Date.now();
    var values = dataRange.getValues();
    collector.sheetReadMs = Date.now() - tRead0;
    collector.rawRowCount = values.length;
    collector.rawColumnCount =
      values.length > 0 && values[0] ? values[0].length : 0;

    return { sheet: sheet, values: values };
  }

  function finishMapping_(collector, tMap0, rows) {
    collector.canonicalMappingMs = Date.now() - tMap0;
    collector.rowsMapped = rows.length;
  }

  return {
    instrumentGetAll_: instrumentGetAll_,
    beginSheetRead_: beginSheetRead_,
    finishMapping_: finishMapping_,
  };
})();
