/**
 * App access bootstrap hydration — Issue #1 (static / structural).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-access-bootstrap-hydration.mts
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
  const boot = read("src/lib/access/bootstrapAppAccess.ts");
  assert(boot.includes("bootstrapAppAccess"), "bootstrap helper exported");
  assert(boot.includes("getPlatformSession"), "loads platform session");
  assert(boot.includes("resolveOperatingAccess"), "resolves operating access");
  assert(
    !/getOperatingAccess\s*\(/.test(boot),
    "must not call getOperatingAccess (would double-read session)"
  );
  assert(
    boot.includes("await getPlatformSession()") &&
      boot.includes("await resolveOperatingAccess(session)"),
    "session resolved once then passed into resolveOperatingAccess"
  );

  const layout = read("src/app/(app)/layout.tsx");
  assert(layout.includes("bootstrapAppAccess"), "layout bootstraps access");
  assert(layout.includes("async function AppLayout"), "layout is async server");
  assert(
    layout.includes("initialSessionChrome") &&
      layout.includes("initialOperatingAccess"),
    "layout passes hydrate props to ProductShell"
  );

  const shell = read("src/components/platform/ProductShell.tsx");
  assert(
    shell.includes("initialSessionChrome") &&
      shell.includes("initialOperatingAccess"),
    "ProductShell accepts bootstrap props"
  );
  assert(
    shell.includes("PlatformSessionProvider") &&
      shell.includes("OperatingAccessProvider"),
    "ProductShell still mounts both providers"
  );
  assert(shell.includes("AccessSurfaceGate"), "gate still mounted");

  const sessionHook = read("src/hooks/usePlatformSession.tsx");
  assert(
    sessionHook.includes("initialSessionChrome"),
    "session provider accepts hydrate"
  );
  assert(
    sessionHook.includes("if (hydrated) return"),
    "hydrated session skips initial /api/auth/me"
  );
  assert(
    sessionHook.includes('fetch("/api/auth/me"'),
    "unhydrated path still fetches /api/auth/me"
  );

  const accessHook = read("src/hooks/useOperatingAccess.tsx");
  assert(
    accessHook.includes("initialAccess"),
    "operating access provider accepts hydrate"
  );
  assert(
    /hydrated\s*&&\s*tick\s*===\s*0/.test(accessHook),
    "hydrated access skips fetch until reload tick"
  );
  assert(
    accessHook.includes('fetch("/api/access/me"') ||
      accessHook.includes("fetchOperatingAccess"),
    "reload path still fetches /api/access/me"
  );
  assert(accessHook.includes("reload"), "reload preserved");
  assert(
    accessHook.includes("OPERATING_ACCESS_FETCH_TIMEOUT_MS"),
    "TTL/timeout preserved"
  );

  const gate = read("src/components/security/AccessSurfaceGate.tsx");
  assert(
    /if\s*\(\s*loading\s*\)/.test(gate) &&
      !/if\s*\(\s*loading\s*\|\|\s*!access\s*\)/.test(gate),
    "gate loading distinct from settled !access"
  );
  assert(gate.includes("Checking access…"), "loading copy unchanged");
  assert(gate.includes("Unable to verify access"), "failure copy unchanged");
  assert(gate.includes("Access restricted"), "deny copy unchanged");

  // Fail closed: null hydrate must not start as loading=true
  assert(
    sessionHook.includes("initial === null") &&
      sessionHook.includes("loading: false"),
    "null session chrome settles loading false (not fail-open spinner)"
  );
  assert(
    accessHook.includes("hydrated ? initialAccess : null") &&
      accessHook.includes("useState(!hydrated)"),
    "null operating access settles loading false"
  );

  console.log("PASS bootstrap resolves session once + operating access");
  console.log("PASS layout/ProductShell hydrate both providers");
  console.log("PASS hydrated providers skip initial client fetches");
  console.log("PASS reload/timeout paths preserved");
  console.log("PASS AccessSurfaceGate semantics unchanged");
  console.log("PASS bootstrap null fails closed (not loading)");
  console.log("verify-access-bootstrap-hydration: PASS");
}

main();
