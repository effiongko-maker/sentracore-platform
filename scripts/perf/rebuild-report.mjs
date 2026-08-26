#!/usr/bin/env node
/** Rebuild summary JSON from the completed probe log + structured re-emit. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const log = readFileSync(
  "/opt/cursor/artifacts/perf/measure-operate-pages.log",
  "utf8"
);

function parseSingles(section) {
  const rows = [];
  const re =
    /^\s+([a-z-]+)\s+(\d+)ms\s+rows~(\d+)/gm;
  let m;
  while ((m = re.exec(section))) {
    rows.push({
      resource: m[1],
      durationMs: Number(m[2]),
      total: Number(m[3]),
    });
  }
  return rows;
}

const coldBlock = log.split("[B]")[0].split("[A]")[1] || "";
const warmBlock = log.split("[C]")[0].split("[B]")[1] || "";
const coldSingles = parseSingles(coldBlock);
const warmSingles = parseSingles(warmBlock);

const pageOpen = {
  workOrders: {
    route: "/work-orders",
    wallMs: 4000,
    maxMs: 4000,
    sumMs: 16706,
    uniqueRequestCount: 6,
    results: [
      { resource: "work-orders", durationMs: 2316, total: 23, pageSize: 8 },
      { resource: "facilities", durationMs: 3067, total: 1, pageSize: 200 },
      { resource: "users", durationMs: 1533, total: 6, pageSize: 500 },
      { resource: "facilities", durationMs: 2536, total: 1, pageSize: 500 },
      { resource: "assets", durationMs: 3254, total: 13, pageSize: 500 },
      { resource: "maintenance", durationMs: 4000, total: 37, pageSize: 200 },
    ],
  },
  maintenance: {
    route: "/maintenance",
    wallMs: 3565,
    maxMs: 3565,
    sumMs: 9525,
    uniqueRequestCount: 4,
    results: [
      { resource: "maintenance", durationMs: 1969, total: 37, pageSize: 8 },
      { resource: "facilities", durationMs: 3565, total: 1, pageSize: 200 },
      { resource: "users", durationMs: 1758, total: 6, pageSize: 500 },
      { resource: "facilities", durationMs: 2233, total: 1, pageSize: 500 },
    ],
  },
  incidents: {
    route: "/incidents",
    wallMs: 5576,
    maxMs: 5576,
    sumMs: 12378,
    uniqueRequestCount: 4,
    results: [
      { resource: "incidents", durationMs: 1897, total: 30, pageSize: 8 },
      { resource: "facilities", durationMs: 5576, total: 1, pageSize: 200 },
      { resource: "users", durationMs: 2610, total: 6, pageSize: 500 },
      { resource: "facilities", durationMs: 2295, total: 1, pageSize: 500 },
    ],
  },
};

const report = {
  source: "measure-operate-pages.log (script crashed before write; rebuilt)",
  measuredAt: "2026-08-26T15:33:13Z",
  sheetRowCounts: {
    workOrders: 23,
    maintenance: 37,
    incidents: 30,
    facilities: 1,
    users: 6,
    assets: 13,
  },
  phases: {
    coldSingles,
    warmSingles,
    pageOpenDirect: pageOpen,
    entityResolverWave2: { wallMs: 2496, maxMs: 2496, sumMs: 6605, requestCount: 3 },
    reportingSnapshot: { firstMs: 20917, secondMs: 1429, responseBytes: 49065 },
    loadAllPages: {
      "work-orders": { pagesFetched: 1, wallMs: 6731 },
      maintenance: { pagesFetched: 1, wallMs: 2859 },
      incidents: { pagesFetched: 1, wallMs: 1953 },
      note: "NOT on operate page open",
    },
    afterIdle20s: { resource: "work-orders", durationMs: 27443 },
  },
  verdict: null,
};

const avg = (xs) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

report.summary = {
  pageOpenWallMs: {
    workOrders: pageOpen.workOrders.wallMs,
    maintenance: pageOpen.maintenance.wallMs,
    incidents: pageOpen.incidents.wallMs,
  },
  pageOpenGetAllCount: {
    workOrders: 6,
    maintenance: 4,
    incidents: 4,
  },
  pageOpenSumMs: {
    workOrders: pageOpen.workOrders.sumMs,
    maintenance: pageOpen.maintenance.sumMs,
    incidents: pageOpen.incidents.sumMs,
  },
  avgColdGetAllMs: avg(coldSingles.map((r) => r.durationMs)),
  avgWarmGetAllMs: avg(warmSingles.map((r) => r.durationMs)),
  coldUsersMs: coldSingles.find((r) => r.resource === "users")?.durationMs,
  afterIdleWorkOrdersMs: 27443,
  snapshotColdMs: 20917,
  snapshotWarmMs: 1429,
  loadAllPagesNotOnOpen: true,
  duplicateFacilitiesCalls:
    "Each operate page fires facilities getAll twice (pageSize 200 toolbar + pageSize 500 nested in users/assets catalog) — different cache keys",
};

report.verdict = {
  primary:
    "Apps Script getAll round-trips (full SpreadsheetApp reads + platform overhead), amplified by multi-request fan-out",
  ranked: [
    {
      rank: 1,
      factor: "full-sheet Apps Script reads / GAS execution",
      evidence:
        "Warm getAll still 2.3–4.7s with only 1–37 rows and 0.3–4KB payloads. Page-open wall ≈ max(concurrent getAll) = 3.5–5.6s.",
    },
    {
      rank: 2,
      factor: "Apps Script cold starts",
      evidence:
        "users cold 16796ms; work-orders after 20s idle 27443ms vs warm ~2–4s.",
    },
    {
      rank: 3,
      factor: "repeated client waterfalls / fan-out",
      evidence:
        "WO fires 6 unique concurrent getAlls (sum 16.7s). Duplicate facilities 200+500. Wave-2 EntityResolver can add ~2.5s if directories cold.",
    },
    {
      rank: 4,
      factor: "snapshot reads/writes",
      evidence:
        "Warm snapshot 1429ms but NOT on operate list open. Cold snapshot 20.9s only if dashboards hit it.",
    },
    {
      rank: 5,
      factor: "Next/server proxy latency",
      evidence:
        "Not fully measured (no Supabase auth in env). API routes are thin passthroughs; GAS dominates multi-second timings.",
    },
    {
      rank: 6,
      factor: "rendering",
      evidence:
        "List payloads 3–4KB / 8 rows. Negligible vs multi-second network.",
    },
  ],
};

mkdirSync("/opt/cursor/artifacts/perf", { recursive: true });
writeFileSync(
  "/opt/cursor/artifacts/perf/operate-page-measurements.json",
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report.verdict, null, 2));
