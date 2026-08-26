/**
 * Server-side proxy-path probe using the same postToAppsScript helper
 * the Next.js API routes call. Compares wall time of the helper alone
 * (no HTTP middleware) so we can isolate Apps Script vs Next wrapper cost.
 *
 *   PERF_METRICS=1 npx tsx scripts/perf/measure-proxy-helper.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { postToAppsScript } from "../../src/services/api/appsScriptProxy";
import { configurePerfMetrics } from "../../src/services/api/perfMetrics";

configurePerfMetrics({
  enabled: true,
  sinkPath: "/opt/cursor/artifacts/perf/apps-script-metrics.jsonl",
});

async function timeCall(resource: string, action: string, payload: object) {
  const started = performance.now();
  try {
    const data = await postToAppsScript(
      { resource, action, payload },
      { resource, action },
      `perf-probe/${resource}`
    );
    const durationMs = Math.round(performance.now() - started);
    const serialized = JSON.stringify(data);
    return {
      ok: true,
      resource,
      action,
      durationMs,
      responseBytes: serialized.length,
    };
  } catch (error) {
    return {
      ok: false,
      resource,
      action,
      durationMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const results = [];
  for (const resource of ["work-orders", "maintenance", "incidents"] as const) {
    results.push(
      await timeCall(resource, "getAll", { page: 1, pageSize: 8 })
    );
  }
  // Immediate warm repeats
  for (const resource of ["work-orders", "maintenance", "incidents"] as const) {
    results.push(
      await timeCall(resource, "getAll", { page: 1, pageSize: 8 })
    );
  }

  const out = {
    finishedAt: new Date().toISOString(),
    note: "Direct postToAppsScript calls (identical to API route body work; no browser→Next hop)",
    results,
  };
  mkdirSync("/opt/cursor/artifacts/perf", { recursive: true });
  writeFileSync(
    "/opt/cursor/artifacts/perf/proxy-helper-measurements.json",
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
