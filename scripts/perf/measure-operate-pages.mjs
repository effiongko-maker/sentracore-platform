#!/usr/bin/env node
/**
 * Live operate-page latency probe.
 *
 * Mirrors the exact Apps Script fan-out fired when opening:
 *   /work-orders, /maintenance, /incidents
 *
 * Also measures:
 *   - single-resource getAll timings (cold vs warm)
 *   - reporting-snapshot getSnapshot
 *   - optional Next.js /api/* proxy overhead
 *   - loadAllPages-style sequential paging (workload path; NOT on page open)
 *
 * Usage:
 *   node scripts/perf/measure-operate-pages.mjs
 *   PERF_BASE_URL=http://127.0.0.1:3000 node scripts/perf/measure-operate-pages.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const APPS_SCRIPT_URL =
  process.env.APPS_SCRIPT_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "https://script.google.com/macros/s/AKfycbz8DUM4MS2NTlEAeHsMVw9sGY0CyCdJwu_24mYJCpUwJWQb9FKEGABO2TEZhzKO-5Xm/exec";

const BASE_URL = process.env.PERF_BASE_URL ?? "";
const OUT_PATH =
  process.env.PERF_OUT ??
  "/opt/cursor/artifacts/perf/operate-page-measurements.json";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rowHint(payload) {
  if (payload == null) return null;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload !== "object") return null;
  if (typeof payload.total === "number") return payload.total;
  if (Array.isArray(payload.data)) return payload.data.length;
  if (payload.data && typeof payload.data === "object") {
    if (typeof payload.data.total === "number") return payload.data.total;
    if (Array.isArray(payload.data.data)) return payload.data.data.length;
  }
  return null;
}

function pageMeta(payload) {
  const root =
    payload && typeof payload === "object" && payload.data && !Array.isArray(payload.data)
      ? payload.data
      : payload;
  if (!root || typeof root !== "object") {
    return { total: rowHint(payload), totalPages: 1, pageSize: null, returned: rowHint(payload) };
  }
  return {
    total: typeof root.total === "number" ? root.total : rowHint(payload),
    totalPages: typeof root.totalPages === "number" ? root.totalPages : 1,
    pageSize: typeof root.pageSize === "number" ? root.pageSize : null,
    returned: Array.isArray(root.data) ? root.data.length : rowHint(payload),
  };
}

async function postDirect(resource, action, payload = {}) {
  const body = JSON.stringify({ resource, action, payload });
  const started = performance.now();
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
    redirect: "follow",
  });
  const text = await res.text();
  const durationMs = Math.round(performance.now() - started);
  let json = null;
  let parseError = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }
  return {
    channel: "direct_apps_script",
    resource,
    action,
    ok: res.ok && !parseError && json?.success !== false,
    status: res.status,
    durationMs,
    requestBytes: body.length,
    responseBytes: text.length,
    rowHint: rowHint(json),
    pageMeta: pageMeta(json),
    message: json?.message ?? parseError ?? null,
  };
}

async function postProxy(resource, action, payload = {}) {
  if (!BASE_URL) {
    return {
      channel: "next_proxy",
      resource,
      action,
      skipped: true,
      reason: "PERF_BASE_URL not set",
    };
  }
  const pathByResource = {
    "work-orders": "/api/work-orders",
    maintenance: "/api/maintenance",
    incidents: "/api/incidents",
    facilities: "/api/facilities",
    users: "/api/users",
    assets: "/api/assets",
    "reporting-snapshot": "/api/reporting-snapshot",
  };
  const path = pathByResource[resource];
  if (!path) {
    return {
      channel: "next_proxy",
      resource,
      action,
      skipped: true,
      reason: `no route for ${resource}`,
    };
  }
  const body = JSON.stringify({ resource, action, payload });
  const started = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  const durationMs = Math.round(performance.now() - started);
  let json = null;
  let parseError = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }
  return {
    channel: "next_proxy",
    resource,
    action,
    ok: res.ok && !parseError && json?.success !== false,
    status: res.status,
    durationMs,
    requestBytes: body.length,
    responseBytes: text.length,
    rowHint: rowHint(json),
    pageMeta: pageMeta(json),
    message: json?.message ?? parseError ?? null,
  };
}

async function timedParallel(label, calls) {
  const wallStart = performance.now();
  const results = await Promise.all(calls.map((fn) => fn()));
  const wallMs = Math.round(performance.now() - wallStart);
  const sumMs = results.reduce((acc, r) => acc + (r.durationMs || 0), 0);
  const maxMs = Math.max(0, ...results.map((r) => r.durationMs || 0));
  return {
    label,
    wallMs,
    sumMs,
    maxMs,
    requestCount: results.length,
    getAllCount: results.filter((r) => r.action === "getAll").length,
    results,
  };
}

/** Exact wave-1 fan-out when opening each operate page (from module code). */
function pageOpenPlans() {
  return {
    workOrders: {
      route: "/work-orders",
      notes: [
        "useWorkOrders → WorkOrderService.listWorkOrders pageSize 8",
        "useFacilityOptions → FacilityService.listFacilities pageSize 200",
        "UserService.listUsersCatalog → users getAll(pageSize 500) + facilities getAll(pageSize 500)",
        "AssetService.listAssetsCatalog → assets getAll(pageSize 500 loop) + facilities getAll(pageSize 500)",
        "MaintenanceService.listMaintenance pageSize 200 (filter dropdown)",
        "No loadAllPages on open",
        "Shell also hits /api/auth/me twice (Supabase, not sheets)",
      ],
      // Represent distinct Apps Script POSTs after sharedRequest coalescing for
      // identical keys. Different pageSizes do NOT coalesce.
      requests: [
        { resource: "work-orders", action: "getAll", payload: { page: 1, pageSize: 8 } },
        { resource: "facilities", action: "getAll", payload: { page: 1, pageSize: 200 } },
        { resource: "users", action: "getAll", payload: { page: 1, pageSize: 500 } },
        { resource: "facilities", action: "getAll", payload: { page: 1, pageSize: 500 } },
        { resource: "assets", action: "getAll", payload: { page: 1, pageSize: 500 } },
        // second facilities(500) from assets catalog coalesces with users' facilities(500) if concurrent
        { resource: "maintenance", action: "getAll", payload: { page: 1, pageSize: 200 } },
      ],
      // Concurrent-identical keys coalesce to one network call in the browser.
      // facilities pageSize 500 appears twice in code but is one sharedRequest.
      uniqueConcurrentKeys: 6,
    },
    maintenance: {
      route: "/maintenance",
      notes: [
        "useMaintenance → listMaintenance pageSize 8",
        "useFacilityOptions → facilities pageSize 200",
        "UserService.listUsersCatalog → users getAll + facilities getAll(500)",
        "No loadAllPages on open",
      ],
      requests: [
        { resource: "maintenance", action: "getAll", payload: { page: 1, pageSize: 8 } },
        { resource: "facilities", action: "getAll", payload: { page: 1, pageSize: 200 } },
        { resource: "users", action: "getAll", payload: { page: 1, pageSize: 500 } },
        { resource: "facilities", action: "getAll", payload: { page: 1, pageSize: 500 } },
      ],
      uniqueConcurrentKeys: 4,
    },
    incidents: {
      route: "/incidents",
      notes: [
        "useIncidents → listIncidents pageSize 8",
        "IncidentsToolbar Promise.all: facilities 200 + users catalog",
        "users catalog → users getAll + facilities 500",
        "No loadAllPages on open",
      ],
      requests: [
        { resource: "incidents", action: "getAll", payload: { page: 1, pageSize: 8 } },
        { resource: "facilities", action: "getAll", payload: { page: 1, pageSize: 200 } },
        { resource: "users", action: "getAll", payload: { page: 1, pageSize: 500 } },
        { resource: "facilities", action: "getAll", payload: { page: 1, pageSize: 500 } },
      ],
      uniqueConcurrentKeys: 4,
    },
  };
}

/**
 * Wave 2: table EntityResolver directories when snapshot is NOT primed.
 * facility uses pageSize 100 paging; user/asset reuse catalog TTL if warm.
 */
function wave2EntityResolverCold() {
  return [
    { resource: "facilities", action: "getAll", payload: { page: 1, pageSize: 100 } },
    { resource: "users", action: "getAll", payload: { page: 1, pageSize: 500 } },
    { resource: "assets", action: "getAll", payload: { page: 1, pageSize: 500 } },
  ];
}

async function measureLoadAllPages(resource, pageSize = 100) {
  const calls = [];
  let page = 1;
  let totalPages = 1;
  const wallStart = performance.now();
  do {
    const result = await postDirect(resource, "getAll", { page, pageSize });
    calls.push(result);
    totalPages = Math.max(1, result.pageMeta?.totalPages || 1);
    page += 1;
  } while (page <= totalPages && page <= 50);
  return {
    resource,
    pageSize,
    wallMs: Math.round(performance.now() - wallStart),
    pagesFetched: calls.length,
    sumMs: calls.reduce((a, c) => a + c.durationMs, 0),
    calls,
    note: "Used by loadOperationalWorkload / EntityResolver directories — NOT on operate list open",
  };
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    appsScriptUrlTail: APPS_SCRIPT_URL.slice(-40),
    baseUrl: BASE_URL || null,
    phases: {},
  };

  console.log("=== Operate page latency probe ===");
  console.log("GAS:", APPS_SCRIPT_URL.slice(0, 48) + "..." + APPS_SCRIPT_URL.slice(-12));
  console.log("Proxy base:", BASE_URL || "(direct only)");

  // --- Phase A: cold single getAll per operational sheet ---
  console.log("\n[A] Cold single getAll (sequential, first hits)");
  const coldSingles = [];
  for (const resource of [
    "work-orders",
    "maintenance",
    "incidents",
    "facilities",
    "users",
    "assets",
  ]) {
    const r = await postDirect(resource, "getAll", { page: 1, pageSize: 8 });
    coldSingles.push(r);
    console.log(
      `  ${resource.padEnd(12)} ${String(r.durationMs).padStart(5)}ms  rows~${r.pageMeta?.total ?? "?"}  bytes=${r.responseBytes} ok=${r.ok}`
    );
  }
  report.phases.coldSingles = coldSingles;

  // --- Phase B: warm single getAll (immediate repeat) ---
  console.log("\n[B] Warm single getAll (immediate repeat)");
  const warmSingles = [];
  for (const resource of [
    "work-orders",
    "maintenance",
    "incidents",
    "facilities",
    "users",
    "assets",
  ]) {
    const r = await postDirect(resource, "getAll", { page: 1, pageSize: 8 });
    warmSingles.push(r);
    console.log(
      `  ${resource.padEnd(12)} ${String(r.durationMs).padStart(5)}ms  rows~${r.pageMeta?.total ?? "?"}`
    );
  }
  report.phases.warmSingles = warmSingles;

  // --- Phase C: page-open fan-outs (unique concurrent keys) ---
  console.log("\n[C] Page-open fan-out (unique concurrent Apps Script POSTs)");
  const plans = pageOpenPlans();
  report.phases.pageOpenPlans = plans;
  report.phases.pageOpenDirect = {};

  for (const [key, plan] of Object.entries(plans)) {
    // Deduplicate identical resource+action+payload JSON for concurrent coalesce
    const seen = new Map();
    const unique = [];
    for (const req of plan.requests) {
      const k = JSON.stringify(req);
      if (seen.has(k)) continue;
      seen.set(k, true);
      unique.push(req);
    }
    const fan = await timedParallel(
      `${key}-wave1`,
      unique.map(
        (req) => () => postDirect(req.resource, req.action, req.payload)
      )
    );
    report.phases.pageOpenDirect[key] = {
      route: plan.route,
      uniqueRequestCount: unique.length,
      codedRequestCount: plan.requests.length,
      notes: plan.notes,
      ...fan,
    };
    console.log(
      `  ${plan.route.padEnd(14)} wall=${fan.wallMs}ms max=${fan.maxMs}ms sum=${fan.sumMs}ms reqs=${fan.requestCount}`
    );
    for (const r of fan.results) {
      console.log(
        `    - ${r.resource}/${r.action} pageSize=${r.pageMeta?.pageSize ?? "?"} ${r.durationMs}ms total~${r.pageMeta?.total ?? "?"}`
      );
    }
  }

  // --- Phase D: wave-2 entity labels if catalogs cold ---
  console.log("\n[D] Wave-2 EntityResolver cold directories (after table paint)");
  // Clear warm advantage by waiting? Not possible to clear GAS cache.
  // Measure as additional sequential cost if catalogs weren't shared.
  const wave2 = await timedParallel(
    "entity-resolver-cold",
    wave2EntityResolverCold().map(
      (req) => () => postDirect(req.resource, req.action, req.payload)
    )
  );
  report.phases.entityResolverWave2 = wave2;
  console.log(
    `  wall=${wave2.wallMs}ms max=${wave2.maxMs}ms sum=${wave2.sumMs}ms reqs=${wave2.requestCount}`
  );

  // --- Phase E: reporting snapshot ---
  console.log("\n[E] Reporting snapshot getSnapshot");
  const snap1 = await postDirect("reporting-snapshot", "getSnapshot", {});
  const snap2 = await postDirect("reporting-snapshot", "getSnapshot", {});
  report.phases.reportingSnapshot = { first: snap1, second: snap2 };
  console.log(`  first=${snap1.durationMs}ms bytes=${snap1.responseBytes} ok=${snap1.ok}`);
  console.log(`  second=${snap2.durationMs}ms bytes=${snap2.responseBytes} ok=${snap2.ok}`);

  // --- Phase F: loadAllPages (NOT on open) ---
  console.log("\n[F] loadAllPages simulation (workload path only)");
  report.phases.loadAllPages = {};
  for (const resource of ["work-orders", "maintenance", "incidents"]) {
    const result = await measureLoadAllPages(resource, 100);
    report.phases.loadAllPages[resource] = result;
    console.log(
      `  ${resource.padEnd(12)} pages=${result.pagesFetched} wall=${result.wallMs}ms sum=${result.sumMs}ms`
    );
  }

  // --- Phase G: Next proxy overhead (optional) ---
  if (BASE_URL) {
    console.log("\n[G] Next proxy vs direct (same getAll)");
    report.phases.proxyCompare = [];
    for (const resource of ["work-orders", "maintenance", "incidents"]) {
      const direct = await postDirect(resource, "getAll", {
        page: 1,
        pageSize: 8,
      });
      const proxy = await postProxy(resource, "getAll", {
        page: 1,
        pageSize: 8,
      });
      const overheadMs =
        proxy.durationMs != null && direct.durationMs != null
          ? proxy.durationMs - direct.durationMs
          : null;
      report.phases.proxyCompare.push({ resource, direct, proxy, overheadMs });
      console.log(
        `  ${resource.padEnd(12)} direct=${direct.durationMs}ms proxy=${proxy.durationMs}ms overhead~${overheadMs}ms`
      );
    }
  } else {
    report.phases.proxyCompare = { skipped: true };
  }

  // --- Phase H: cold-ish after idle ---
  console.log("\n[H] Idle 20s then re-hit work-orders (cold-start probe)");
  await sleep(20_000);
  const afterIdle = await postDirect("work-orders", "getAll", {
    page: 1,
    pageSize: 8,
  });
  report.phases.afterIdle20s = afterIdle;
  console.log(`  work-orders after idle: ${afterIdle.durationMs}ms`);

  // --- Summary classification helpers ---
  const wo = report.phases.pageOpenDirect.workOrders;
  const mnt = report.phases.pageOpenDirect.maintenance;
  const inc = report.phases.pageOpenDirect.incidents;
  const warmAvg =
    warmSingles.reduce((a, r) => a + r.durationMs, 0) / warmSingles.length;
  const coldAvg =
    coldSingles.reduce((a, r) => a + r.durationMs, 0) / coldSingles.length;
  const snapMs = snap2.durationMs;
  const proxyCompare = Array.isArray(report.phases.proxyCompare)
    ? report.phases.proxyCompare
    : [];
  const proxyOverheads = proxyCompare
    .filter((x) => typeof x.overheadMs === "number")
    .map((x) => x.overheadMs);

  report.summary = {
    pageOpenWallMs: {
      workOrders: wo?.wallMs,
      maintenance: mnt?.wallMs,
      incidents: inc?.wallMs,
    },
    pageOpenGetAllCount: {
      workOrders: wo?.uniqueRequestCount,
      maintenance: mnt?.uniqueRequestCount,
      incidents: inc?.uniqueRequestCount,
    },
    avgColdGetAllMs: Math.round(coldAvg),
    avgWarmGetAllMs: Math.round(warmAvg),
    coldWarmDeltaMs: Math.round(coldAvg - warmAvg),
    snapshotWarmMs: snapMs,
    avgProxyOverheadMs:
      proxyOverheads.length > 0
        ? Math.round(
            proxyOverheads.reduce((a, b) => a + b, 0) / proxyOverheads.length
          )
        : null,
    loadAllPagesNotOnOpen: true,
    dominantCandidateHints: {
      fullSheetReads:
        "Compare pageOpenWallMs ≈ max(getAll) and sum of getAlls; each getAll is a full sheet read server-side.",
      clientWaterfalls:
        "Wave-1 is parallel; wave-2 EntityResolver may start after list resolves (serial after wave-1).",
      appsScriptColdStart:
        "Compare coldSingles / afterIdle20s vs warmSingles.",
      nextProxy:
        "proxyCompare.overheadMs when PERF_BASE_URL set.",
      snapshot:
        "snapshotWarmMs — not on operate list open path.",
      rendering:
        "Not measured here (needs browser); expected << network if getAll > 500ms.",
    },
  };

  report.finishedAt = new Date().toISOString();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${OUT_PATH}`);
  console.log("\n=== Summary ===");
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
