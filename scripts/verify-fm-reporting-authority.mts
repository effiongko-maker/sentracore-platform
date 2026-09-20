/**
 * FM Phase 2I — Reporting authority verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-reporting-authority.mts
 *
 * Static checks plus a behavioural check of the real ReportingService with a
 * mocked network layer: a failed authoritative source is UNAVAILABLE (never
 * zero, never a Sheet fallback); a healthy empty source is zero.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail?: string };
const readSrc = (path: string) => readFileSync(resolve(path), "utf8");
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const fetched: string[] = [];
function installFetch(mode: "healthy-empty" | "failing") {
  fetched.length = 0;
  (globalThis as { fetch: unknown }).fetch = async (input: unknown) => {
    const url = String(input);
    fetched.push(url);
    const body =
      mode === "healthy-empty"
        ? {
            success: true,
            message: "",
            // The narrow operational catalog returns a bare array; the registers return pages.
            data: url.includes("assignable-people")
              ? []
              : { data: [], page: 1, pageSize: 500, total: 0, totalPages: 1 },
          }
        : { success: false, message: "source unavailable", data: null };
    return new Response(JSON.stringify(body), { status: mode === "healthy-empty" ? 200 : 400, headers: { "Content-Type": "application/json" } });
  };
}

async function main() {
  const results: CheckResult[] = [];
  const check = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      results.push({ name, status: "PASS" });
    } catch (error) {
      results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
    }
  };

  const rs = stripComments(readSrc("src/services/reporting/ReportingService.ts"));

  await check("the Sheet reporting-snapshot route, client and hydrator are retired", () => {
    assert(!existsSync(resolve("src/app/api/reporting-snapshot/route.ts")), "route still exists");
    assert(!existsSync(resolve("src/services/reporting/sheetsSnapshot.ts")), "sheetsSnapshot still exists");
    const offenders = walk("src").filter((f) => /reporting-snapshot|REPORTING_SNAPSHOT|sheetsSnapshot|tryLoadSheetsReportingSnapshot/.test(stripComments(readFileSync(f, "utf8"))));
    assert(offenders.length === 0, `live references: ${offenders.join(", ")}`);
  });
  await check("no Apps Script call anywhere in the Reporting pipeline", () => {
    const offenders = walk("src/services/reporting").concat(walk("src/services/reports"), walk("src/services/dashboard")).filter((f) =>
      /postToAppsScript|appsScriptProxy/.test(stripComments(readFileSync(f, "utf8")))
    );
    assert(offenders.length === 0, offenders.join(", "));
  });
  await check("all six Reporting sources are authoritative domain readers", () => {
    for (const reader of ["AssignablePeopleService.list", "FacilityService.listFacilities", "AssetService.listAssetsCatalog", "IncidentService.listIncidents", "MaintenanceService.listMaintenance", "WorkOrderService.listWorkOrders"]) {
      assert(rs.includes(reader), `${reader} missing`);
    }
    for (const loader of ["loadAuthoritativeUsers", "loadAuthoritativeFacilities", "loadAuthoritativeAssets", "loadAuthoritativeIncidents", "loadAuthoritativeWork", "loadAuthoritativeWorkOrders"]) {
      assert(rs.includes(loader), `${loader} missing`);
    }
  });
  await check("no failure is swallowed into an empty list", () => {
    assert(!/\.catch\(\(\)\s*=>\s*\[\]\)/.test(rs), "a source failure is turned into []");
    assert(rs.includes("unavailableSources") && rs.includes("withSourceHealth"), "degraded marking");
  });
  await check("facility identity is UUID only (no name / legacy-code matching)", () => {
    assert(/return row\.facilityId === facilityId/.test(rs), "facility filter");
    assert(!/row\.facility\s*===/.test(rs) && !rs.includes("FAC-0001"), "legacy facility matching");
  });

  // Behavioural — the real ReportingService, mocked network.
  installFetch("failing");
  const { ReportingService } = await import("../src/services/reporting/ReportingService");
  await check("failed sources → UNAVAILABLE (never zero-as-healthy), no Sheet fallback", async () => {
    const snap = await ReportingService.getReportingSnapshot({ facilityId: "00000000-0000-4000-8000-0000000000f1" });
    const unavailable = snap._snapshotMeta?.unavailableSources ?? [];
    for (const key of ["users", "facilities", "maintenance", "incidents", "workOrders", "assets"]) {
      assert(unavailable.includes(key as never), `${key} not reported unavailable`);
    }
    assert(snap.health.band !== "healthy" && /unavailable/i.test(snap.health.summary), "health is not 'healthy' while sources are down");
    assert(!fetched.some((u) => /reporting-snapshot/.test(u)), "Sheet snapshot was called");
    assert(fetched.some((u) => u.includes("/api/maintenance")), "Work source was not read from its authoritative route");
  });
  installFetch("healthy-empty");
  await check("healthy empty sources → zero is data, not unavailable", async () => {
    const snap = await ReportingService.getReportingSnapshot({ facilityId: "00000000-0000-4000-8000-0000000000f2" });
    assert((snap._snapshotMeta?.unavailableSources ?? []).length === 0, "healthy empty reported unavailable");
    assert(snap.kpis.totalAssets === 0 && snap.kpis.openWorkOrders === 0 && snap.kpis.maintenanceBacklog === 0, "zero kpis");
    assert(snap._snapshotMeta?.source === "authoritative_domains", "source label");
    assert(!fetched.some((u) => /reporting-snapshot/.test(u)), "Sheet snapshot was called");
  });

  let failed = 0;
  for (const r of results) {
    if (r.status === "FAIL") failed += 1;
    console.log(`${r.status}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "FM_REPORTING_AUTHORITY: PASS" : "FM_REPORTING_AUTHORITY: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("FM_REPORTING_AUTHORITY: FAIL", error);
  process.exit(1);
});
