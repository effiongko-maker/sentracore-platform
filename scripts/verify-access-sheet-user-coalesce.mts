/**
 * Prove operational capability gates still run authoritatively, and FM
 * authority no longer depends on Apps Script USERS lookups.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-access-sheet-user-coalesce.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
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
  // Phase 2K: the Apps Script ops proxy is retired; the shared Supabase log handler is the ops gate.
  const opsProxySrc = readSrc("src/modules/operational-logs/server/fmLogRoute.ts");
  const usersRoute = readSrc("src/app/api/users/route.ts");

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
    serverSrc.includes("platform_capability_grants"),
    "FM authority uses platform grants"
  );
  assert(
    !serverSrc.includes("loadSheetUserForAccessByEmail"),
    "Apps Script USERS lookup removed from access server"
  );
  assert(
    !usersRoute.includes("postToAppsScript"),
    "/api/users does not call Apps Script"
  );

  invalidateSharedRequests(CacheNamespaces.usersCatalog);
  let loads = 0;
  const loader = async () => {
    loads += 1;
    return { ok: true };
  };
  const key = stableRequestKey(CacheNamespaces.usersCatalog, { probe: "2a" });
  await Promise.all([
    sharedRequest(key, loader),
    sharedRequest(key, loader),
    sharedRequest(key, loader),
  ]);
  assert(loads === 1, "sharedRequest still coalesces concurrent work");
  const diag = sharedRequestDiagnostics();
  assert(diag.inflight >= 0, "diagnostics remain available");

  console.log("Access authority (no USERS lookup) verification passed.");
}

void main();
