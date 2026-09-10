/**
 * OperationalRegisterCache.gs
 *
 * Reusable Apps Script CacheService primitive for operational register
 * canonical row sets (Maintenance, Incidents, Approvals, Work Orders).
 *
 * Caches the mapped canonical array — not raw sheet rows and not
 * filtered/paginated page responses. Mutations invalidate explicitly;
 * TTL is a safety net only.
 *
 * Domain differences are limited to:
 *   - cache key / namespace
 *   - TTL (shared default)
 *   - repository loader (caller-supplied)
 *   - invalidation namespace
 */

var OperationalRegisterCache = (function () {
  var CACHE_VERSION = "v1";
  /** Safety-net TTL — mutations invalidate explicitly; never rely on TTL alone. */
  var TTL_SECONDS = 600;
  /**
   * CacheService ~100KB limit. UTF-8→base64 expands size; leave headroom.
   * Oversized payloads skip put (cold path continues to work).
   */
  var MAX_ENCODED_CHARS = 90000;

  var NAMESPACES = {
    maintenance: "maintenance",
    incidents: "incidents",
    approvals: "approvals",
    workOrders: "work-orders",
  };

  function cacheKey_(namespace) {
    return "opreg:" + CACHE_VERSION + ":" + String(namespace || "");
  }

  function cache_() {
    return CacheService.getScriptCache();
  }

  function getRows(namespace) {
    var key = cacheKey_(namespace);
    var t0 = Date.now();
    var raw = SheetFieldUtils.cacheGetUtf8(cache_(), key);
    var cacheReadMs = Date.now() - t0;
    if (raw == null || raw === "") return null;
    try {
      var value = JSON.parse(raw);
      if (!Array.isArray(value)) return null;
      return { rows: value, cacheReadMs: cacheReadMs };
    } catch (err) {
      try {
        cache_().remove(key);
      } catch (removeErr) {}
      return null;
    }
  }

  function putRows(namespace, rows) {
    var key = cacheKey_(namespace);
    try {
      var text = JSON.stringify(rows || []);
      var encodedLen =
        ("u8b64:").length +
        Math.ceil((Utilities.newBlob(text).getBytes().length * 4) / 3);
      if (encodedLen > MAX_ENCODED_CHARS) {
        Logger.log(
          "[OperationalRegisterCache] skip put " +
            key +
            " — encoded ~" +
            encodedLen +
            " exceeds " +
            MAX_ENCODED_CHARS
        );
        return false;
      }
      SheetFieldUtils.cachePutUtf8(cache_(), key, text, TTL_SECONDS);
      return true;
    } catch (err) {
      Logger.log(
        "[OperationalRegisterCache] put failed " + key + ": " + err
      );
      return false;
    }
  }

  function invalidate(namespace) {
    var key = cacheKey_(namespace);
    try {
      cache_().remove(key);
      Logger.log("[OperationalRegisterCache] invalidated " + key);
    } catch (err) {
      Logger.log(
        "[OperationalRegisterCache] invalidate failed " + key + ": " + err
      );
    }
  }

  /**
   * Load canonical rows from cache, or call loaderFn and populate cache.
   *
   * loaderFn(auditCollector?) → Array
   * options: { skipCache: boolean, auditCollector: object }
   */
  function getCanonicalRows(namespace, loaderFn, options) {
    options = options || {};
    var skipCache = !!options.skipCache;
    var auditCollector = options.auditCollector || null;

    if (!skipCache) {
      var cached = getRows(namespace);
      if (cached && cached.rows) {
        if (auditCollector) {
          auditCollector.cacheHit = true;
          auditCollector.cacheReadMs = cached.cacheReadMs || 0;
          auditCollector.cacheInteraction = "hit";
          auditCollector.rowsMapped = cached.rows.length;
          auditCollector.spreadsheetOpenMs = 0;
          auditCollector.sheetLookupMs = 0;
          auditCollector.sheetReadMs = 0;
          auditCollector.canonicalMappingMs = 0;
        }
        return cached.rows;
      }
    }

    var rows = loaderFn(auditCollector) || [];
    putRows(namespace, rows);
    if (auditCollector) {
      auditCollector.cacheHit = false;
      if (!auditCollector.cacheInteraction) {
        auditCollector.cacheInteraction = skipCache ? "skipped" : "miss";
      }
      if (auditCollector.rowsMapped == null) {
        auditCollector.rowsMapped = rows.length;
      }
    }
    return rows;
  }

  return {
    CACHE_VERSION: CACHE_VERSION,
    TTL_SECONDS: TTL_SECONDS,
    NAMESPACES: NAMESPACES,
    getRows: getRows,
    putRows: putRows,
    invalidate: invalidate,
    getCanonicalRows: getCanonicalRows,
  };
})();
