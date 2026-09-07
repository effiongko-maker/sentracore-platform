/**
 * Prove operational capability gates still run authoritatively, but People
 * sheet-user lookup is coalesced/TTL-cached so Home parallel proxies do not
 * each pay a fresh users/getAll.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-access-sheet-user-coalesce.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCESS_SHEET_USER_TTL_MS,
  sharedRequest,
  sharedRequestDiagnostics,
  invalidateSharedRequests,
  stableRequestKey,
} from "../src/services/cache/sharedRequest";
import { CacheNamespaces } from "../src/services/cache/domainCache";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

async function main() {
  const serverSrc = readSrc("src/lib/access/server.ts");
  const gateSrc = readSrc("src/lib/access/gateApi.ts");
  const opsProxySrc = readSrc("src/lib/access/postGatedOperationalProxy.ts");
  const domainCacheSrc = readSrc("src/services/cache/domainCache.ts");
  const sharedSrc = readSrc("src/services/cache/sharedRequest.ts");

  // Gate path unchanged: proxy → gateApiCapability → requireCapability → accessCan
  assert(opsProxySrc.includes("gateApiCapability"), "ops proxy still gated");
  assert(gateSrc.includes("requireCapability"), "gateApi uses requireCapability");
  assert(
    serverSrc.includes("export async function requireCapability"),
    "requireCapability remains"
  );
  assert(
    serverSrc.includes("accessCan(access, capability)"),
    "requireCapability still decides via accessCan"
  );
  assert(
    serverSrc.includes("resolveOperatingAccess(session)"),
    "requireCapability still resolves operating access from session"
  );
  assert(
    serverSrc.includes("loadSheetUserForAccessByEmail"),
    "People email lookup still used for resolution"
  );
  assert(
    /search:\s*target/.test(serverSrc),
    "email search payload preserved"
  );
  assert(
    serverSrc.includes("lookupFailed") &&
      serverSrc.includes("Unavailable"),
    "fail-closed lookup failure preserved"
  );

  // Coalesce + TTL on the Apps Script users lookup only
  assert(
    serverSrc.includes("sharedRequest") &&
      serverSrc.includes("ACCESS_SHEET_USER_TTL_MS") &&
      serverSrc.includes("CacheNamespaces.accessSheetUserByEmail"),
    "sheet-user lookup uses sharedRequest + access namespace"
  );
  assert(
    sharedSrc.includes("ACCESS_SHEET_USER_TTL_MS") &&
      ACCESS_SHEET_USER_TTL_MS > 0 &&
      ACCESS_SHEET_USER_TTL_MS <= 60_000,
    "short positive TTL for access sheet-user cache"
  );
  assert(
    domainCacheSrc.includes("accessSheetUserByEmail") &&
      domainCacheSrc.includes(
        "invalidateSharedRequests(CacheNamespaces.accessSheetUserByEmail)"
      ),
    "user mutations invalidate access sheet-user cache"
  );

  // Must not skip gate / invent client capability trust
  assert(
    !opsProxySrc.includes("x-sentracore-capabilities") &&
      !opsProxySrc.includes("clientCapabilities"),
    "no client-supplied capability bypass on ops proxy"
  );
  assert(
    !serverSrc.includes("trustClientAccess") &&
      !serverSrc.includes("capabilitiesFromHeader"),
    "no client capability trust in access server"
  );

  // Runtime: concurrent loaders share one Promise; second wave hits TTL cache
  invalidateSharedRequests(CacheNamespaces.accessSheetUserByEmail);
  let loads = 0;
  const key = stableRequestKey(CacheNamespaces.accessSheetUserByEmail, {
    email: "probe@example.com",
  });
  const loader = async () => {
    loads += 1;
    await new Promise((r) => setTimeout(r, 40));
    return { id: "USR-1", email: "probe@example.com" };
  };

  const [a, b, c] = await Promise.all([
    sharedRequest(key, loader, { ttlMs: ACCESS_SHEET_USER_TTL_MS }),
    sharedRequest(key, loader, { ttlMs: ACCESS_SHEET_USER_TTL_MS }),
    sharedRequest(key, loader, { ttlMs: ACCESS_SHEET_USER_TTL_MS }),
  ]);
  assert(loads === 1, "concurrent sharedRequest coalesces to one loader");
  assert(a === b && b === c, "coalesced callers share the same result");

  const d = await sharedRequest(key, loader, {
    ttlMs: ACCESS_SHEET_USER_TTL_MS,
  });
  assert(loads === 1, "TTL hit does not re-run loader");
  assert(d === a, "TTL returns prior authoritative result");

  invalidateSharedRequests(CacheNamespaces.accessSheetUserByEmail);
  loads = 0;
  const e = await sharedRequest(key, loader, {
    ttlMs: ACCESS_SHEET_USER_TTL_MS,
  });
  assert(loads === 1, "invalidation forces a fresh authoritative lookup");
  assert(e.id === "USR-1", "fresh lookup still returns People row shape");

  const diag = sharedRequestDiagnostics();
  assert(typeof diag.inflight === "number", "diagnostics available");

  console.log("PASS verify-access-sheet-user-coalesce");
  console.log("  requireCapability + accessCan path preserved");
  console.log("  sheet-user users/getAll coalesced + short TTL; invalidated on user mutation");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
