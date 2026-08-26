/**
 * Perf instrumentation for operate-page latency audits.
 * Append-only JSONL sink — safe for concurrent writes within one Node process.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AppsScriptPerfEvent = {
  ts: string;
  kind: "apps_script_fetch";
  resource: string;
  action: string;
  logPrefix: string;
  ok: boolean;
  status?: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  rowHint?: number | null;
  error?: string;
};

const DEFAULT_SINK =
  process.env.PERF_METRICS_PATH ??
  "/opt/cursor/artifacts/perf/apps-script-metrics.jsonl";

let sinkPath = DEFAULT_SINK;
let enabled =
  process.env.PERF_METRICS === "1" ||
  process.env.PERF_METRICS === "true" ||
  Boolean(process.env.PERF_METRICS_PATH);

export function configurePerfMetrics(options: {
  enabled?: boolean;
  sinkPath?: string;
}) {
  if (options.enabled != null) enabled = options.enabled;
  if (options.sinkPath) sinkPath = options.sinkPath;
}

export function isPerfMetricsEnabled() {
  return enabled;
}

function ensureSink() {
  mkdirSync(dirname(sinkPath), { recursive: true });
}

export function recordAppsScriptPerf(event: AppsScriptPerfEvent) {
  if (!enabled) return;
  try {
    ensureSink();
    appendFileSync(sinkPath, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // Never break product path for metrics I/O.
  }
}

/** Best-effort row count from Apps Script envelopes. */
export function hintRowCount(payload: unknown): number | null {
  if (payload == null) return null;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (typeof obj.total === "number") return obj.total;
  if (Array.isArray(obj.data)) return obj.data.length;
  if (obj.data && typeof obj.data === "object") {
    const inner = obj.data as Record<string, unknown>;
    if (typeof inner.total === "number") return inner.total;
    if (Array.isArray(inner.data)) return inner.data.length;
  }
  return null;
}
