/**
 * CatalogCacheService.gs
 *
 * Apps Script CacheService layer for lightweight reference/catalog projections.
 * Caches finished JSON projections — not raw full-sheet objects.
 */

var CatalogCacheService = (function () {
  var CACHE_VERSION = "v1";
  var KEY_WO_FILTER_CATALOG = "catalog:" + CACHE_VERSION + ":wo-filter";
  var KEY_MAINTENANCE_CATALOG = "catalog:" + CACHE_VERSION + ":mnt-list";
  var KEY_LOCATION_CATALOG = "catalog:" + CACHE_VERSION + ":location";
  /** Safety-net TTL — mutations invalidate explicitly; never rely on TTL alone. */
  var TTL_SECONDS = 600;

  function cache_() {
    return CacheService.getScriptCache();
  }

  function readJson_(key) {
    var t0 = Date.now();
    var raw = SheetFieldUtils.cacheGetUtf8(cache_(), key);
    var cacheReadMs = Date.now() - t0;
    if (raw == null || raw === "") return null;
    try {
      return { value: JSON.parse(raw), cacheReadMs: cacheReadMs };
    } catch (err) {
      try {
        cache_().remove(key);
      } catch (removeErr) {}
      return null;
    }
  }

  function writeJson_(key, value) {
    SheetFieldUtils.cachePutUtf8(
      cache_(),
      key,
      JSON.stringify(value),
      TTL_SECONDS
    );
  }

  function getWoFilterCatalog() {
    var parsed = readJson_(KEY_WO_FILTER_CATALOG);
    if (!parsed) return null;
    return {
      data: parsed.value,
      cacheReadMs: parsed.cacheReadMs,
    };
  }

  function putWoFilterCatalog(data) {
    writeJson_(KEY_WO_FILTER_CATALOG, data);
  }

  function invalidateWoFilterCatalog() {
    try {
      cache_().remove(KEY_WO_FILTER_CATALOG);
      Logger.log("[CatalogCacheService] invalidated " + KEY_WO_FILTER_CATALOG);
    } catch (err) {
      Logger.log("[CatalogCacheService] invalidate wo-filter failed: " + err);
    }
  }

  function getMaintenanceCatalogRows() {
    var parsed = readJson_(KEY_MAINTENANCE_CATALOG);
    if (!parsed) return null;
    return {
      rows: parsed.value,
      cacheReadMs: parsed.cacheReadMs,
    };
  }

  function putMaintenanceCatalogRows(rows) {
    writeJson_(KEY_MAINTENANCE_CATALOG, rows);
  }

  function invalidateMaintenanceCatalog() {
    try {
      cache_().remove(KEY_MAINTENANCE_CATALOG);
      Logger.log(
        "[CatalogCacheService] invalidated " + KEY_MAINTENANCE_CATALOG
      );
    } catch (err) {
      Logger.log("[CatalogCacheService] invalidate mnt-list failed: " + err);
    }
  }

  function getLocationCatalog() {
    var parsed = readJson_(KEY_LOCATION_CATALOG);
    if (!parsed) return null;
    return {
      data: parsed.value,
      cacheReadMs: parsed.cacheReadMs,
    };
  }

  function putLocationCatalog(data) {
    writeJson_(KEY_LOCATION_CATALOG, data);
  }

  function invalidateLocationCatalog() {
    try {
      cache_().remove(KEY_LOCATION_CATALOG);
      Logger.log("[CatalogCacheService] invalidated " + KEY_LOCATION_CATALOG);
    } catch (err) {
      Logger.log(
        "[CatalogCacheService] invalidate location catalog failed: " + err
      );
    }
  }

  return {
    CACHE_VERSION: CACHE_VERSION,
    KEY_WO_FILTER_CATALOG: KEY_WO_FILTER_CATALOG,
    KEY_MAINTENANCE_CATALOG: KEY_MAINTENANCE_CATALOG,
    KEY_LOCATION_CATALOG: KEY_LOCATION_CATALOG,
    getWoFilterCatalog: getWoFilterCatalog,
    putWoFilterCatalog: putWoFilterCatalog,
    invalidateWoFilterCatalog: invalidateWoFilterCatalog,
    getMaintenanceCatalogRows: getMaintenanceCatalogRows,
    putMaintenanceCatalogRows: putMaintenanceCatalogRows,
    invalidateMaintenanceCatalog: invalidateMaintenanceCatalog,
    getLocationCatalog: getLocationCatalog,
    putLocationCatalog: putLocationCatalog,
    invalidateLocationCatalog: invalidateLocationCatalog,
  };
})();
