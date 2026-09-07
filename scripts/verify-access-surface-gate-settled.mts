/**
 * AccessSurfaceGate settled-failure vs loading — V1 hang fix.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-access-surface-gate-settled.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function read(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function main() {
  const gate = read("src/components/security/AccessSurfaceGate.tsx");
  const hook = read("src/hooks/useOperatingAccess.tsx");

  assert(gate.includes("Checking access…"), "loading copy present");
  assert(
    /if\s*\(\s*loading\s*\)/.test(gate),
    "Checking access only while loading"
  );
  assert(
    !/if\s*\(\s*loading\s*\|\|\s*!access\s*\)/.test(gate),
    "must not combine loading || !access into Checking access"
  );

  assert(gate.includes("Unable to verify access"), "settled failure title");
  assert(gate.includes("error"), "surfaces provider error message");
  assert(gate.includes('actionLabel="Retry"'), "Retry action");
  assert(gate.includes("reload()"), "Retry uses OperatingAccess reload");
  assert(
    gate.includes("Access restricted"),
    "denied-when-visible still separate from load failure"
  );

  assert(
    hook.includes("OPERATING_ACCESS_FETCH_TIMEOUT_MS"),
    "client access timeout constant"
  );
  assert(
    hook.includes("AbortController") && hook.includes("signal"),
    "fetch aborted on timeout"
  );
  assert(
    hook.includes("Access check timed out"),
    "timeout maps to existing error state"
  );
  assert(
    hook.includes("setLoading(false)") && hook.includes("setAccess(null)"),
    "failure clears loading and leaves access null"
  );

  // Gate still applies to mapped surfaces; Platform Home unmapped
  assert(gate.includes("surfaceForHref"), "still surface-mapped");
  assert(
    gate.includes("Paths with no surface mapping") ||
      gate.includes("!surface"),
    "unmapped paths (Platform Home) still bypass gate"
  );

  console.log("PASS AccessSurfaceGate settled-failure distinct from loading");
  console.log("PASS client access fetch timeout → error state");
  console.log("verify-access-surface-gate-settled: PASS");
}

main();
