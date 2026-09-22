/**
 * Admin Console Access → batch capability edit — focused regression guard, static source-analysis (no
 * DB/browser, matching the existing scripts/verify-fm-costs-foundation.mts convention).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-batch-capability-access.mts
 */
import { readFileSync } from "node:fs";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const out: string[] = [];
const pass = (m: string) => out.push(`PASS ${m}`);
const src = (f: string) => readFileSync(f, "utf8");

const SERVICE = "src/modules/platform-admin/server/PlatformAdminServerService.ts";
const ROUTE = "src/app/api/platform-admin/route.ts";
const VIEW = "src/modules/platform-admin/client/AccessView.tsx";

// 1. Server: validated before anything is written; grant/revoke reuse the SAME audited per-capability path as
// a single change (no new write surface, no admin-client insert bypassing the RPC-backed repo methods).
{
  const s = src(SERVICE);
  const m = /async batchUpdateCapabilities\([\s\S]*?\n  \}/.exec(s);
  assert(m, "batchUpdateCapabilities method not found");
  const body = m![0];
  assert(/isPlatformAdministrableCapability\(capability\)/.test(body), "does not validate every capability against the allowlist");
  const validateIdx = body.indexOf("isPlatformAdministrableCapability");
  const firstRepoCallIdx = body.indexOf("this.repo.grantPlatformCapability");
  assert(validateIdx > -1 && firstRepoCallIdx > -1 && validateIdx < firstRepoCallIdx, "allowlist validation does not happen before any write");
  assert(/revokeSet\.has\(capability\)/.test(body), "does not reject a capability present in both grant and revoke");
  assert(/this\.repo\.grantPlatformCapability\(/.test(body) && /this\.repo\.revokePlatformCapability\(/.test(body), "does not reuse the existing single-capability repo methods (same audited RPC path)");
  assert(!/\.from\("platform_capability_grants"\)\.insert/.test(body) && !/\.from\("platform_capability_grants"\)\.delete/.test(body), "writes platform_capability_grants directly instead of going through the audited RPC-backed repo methods");
  assert(/catch \(error\)/.test(body) && /result\.failed\.push/.test(body), "a per-item failure does not appear to be caught and recorded rather than aborting the batch");
  pass("batchUpdateCapabilities validates every capability up front, rejects grant/revoke overlap, and reuses the existing audited per-capability grant/revoke RPC path for every write — no new write surface");
}

// 2. Route: requires organisationId + profileId, same as the existing single-capability actions.
{
  const s = src(ROUTE);
  assert(/case "batchUpdateCapabilities"/.test(s), "route does not expose batchUpdateCapabilities");
  const m = /case "batchUpdateCapabilities": \{[\s\S]*?\n      \}/.exec(s);
  assert(m, "batchUpdateCapabilities case block not found");
  assert(/!body\.organisationId \|\| !body\.profileId/.test(m![0]), "route does not require organisationId and profileId");
  pass("route requires organisationId and profileId for batchUpdateCapabilities, matching the single-capability actions");
}

// 3. Client: Cancel makes no backend call; Save is disabled with no pending changes and while saving; a
// partial failure keeps the failed items staged and does not silently present success.
{
  const s = src(VIEW);
  const cancelFn = /function cancelEdit\(\) \{[\s\S]*?\n  \}/.exec(s);
  assert(cancelFn, "cancelEdit not found");
  assert(!/adminCall/.test(cancelFn![0]), "cancelEdit calls the backend — Cancel must be a pure local discard");
  assert(/disabled=\{saving \|\| pendingCount === 0\}/.test(s), "Save changes is not disabled when there are no pending changes (or while saving)");
  assert(/result\.failed\.length > 0/.test(s), "no branch handles a partial failure result");
  const saveFn = /async function saveChanges\(\) \{[\s\S]*?\n  \}/.exec(s);
  assert(saveFn, "saveChanges not found");
  assert(/await person\.reload\(\)/.test(saveFn![0]), "saveChanges does not reload/revalidate access after the operation completes");
  assert(/setEditing\(false\)/.test(saveFn![0]) && /result\.failed\.length > 0/.test(saveFn![0]), "does not distinguish full success (exit edit mode) from partial failure (stay in edit mode)");
  assert(/if \(saving \|\| pendingCount === 0\) return;/.test(saveFn![0]), "does not guard against duplicate submission while saving or with nothing to save");
  pass("client: Cancel never calls the backend, Save changes is disabled with nothing pending or while saving, duplicate submission is guarded, and a partial failure reloads/reconciles state and stays in edit mode rather than presenting silent success");
}

// 4. Client: the four-state visual distinction (granted / will grant / will revoke / not granted) is real,
// not collapsed to a binary toggle.
{
  const s = src(VIEW);
  assert(/isStaged \? \(proposed \? "accent" : "warn"\) : proposed \? "ok" : "plain"/.test(s), "capability row tone does not distinguish all four states (granted / will grant / will revoke / not granted)");
  pass("capability rows render four distinct states, not a plain granted/not-granted toggle");
}

console.log(out.join("\n"));
console.log(`\n${out.length} groups passed`);
