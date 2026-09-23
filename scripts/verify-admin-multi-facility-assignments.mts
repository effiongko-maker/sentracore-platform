/**
 * Admin Console — multi-facility assignments (no database writes).
 *
 * Proves: Create Account supports NCC Annex only, CSIRT only, Both (= two ordinary assignments) and none; duplicates
 * and unknown roles are rejected before anything is created; each assignment goes through the existing audited
 * setFacilityAssignment workflow; the Access page's Operating Context can add / remove assignments and shows every
 * active assignment; the global facility switcher is not reintroduced.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-admin-multi-facility-assignments.mts
 */
import { readFileSync } from "node:fs";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");

async function main() {
  const { normaliseRequestedAssignments } = await import("../src/modules/platform-admin/server/facilityAssignmentRequest");
  const NCC = "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0";
  const CSIRT = "c5c5c5c5-0000-4000-8000-000000000002";
  const out: string[] = [];

  // Route mapping mirrors src/app/api/platform-admin/route.ts: facilityIds[] + one operationalRole.
  const viaRoute = (facilityIds: string[], operationalRole: string) =>
    normaliseRequestedAssignments({ facilityAssignments: facilityIds.map((facilityId) => ({ facilityId, operationalRole })) });

  const annex = viaRoute([NCC], "fm_staff");
  check(annex.length === 1 && annex[0]!.facilityId === NCC, "Annex only ⇒ one assignment");
  const csirt = viaRoute([CSIRT], "fm_staff");
  check(csirt.length === 1 && csirt[0]!.facilityId === CSIRT, "CSIRT only ⇒ one assignment");
  const both = viaRoute([NCC, CSIRT], "facility_manager");
  check(both.length === 2 && both.every((a) => a.operationalRole === "facility_manager") && new Set(both.map((a) => a.facilityId)).size === 2, "Both ⇒ two ordinary assignments, same role");
  check(normaliseRequestedAssignments({}).length === 0, "no facility assignment is permitted");
  check(normaliseRequestedAssignments({ facilityAssignment: { facilityId: NCC, operationalRole: "fm_staff" } }).length === 1, "legacy single assignment still accepted");
  let dup = false;
  try { viaRoute([NCC, NCC], "fm_staff"); } catch { dup = true; }
  check(dup, "duplicate facility rejected before anything is created");
  let badRole = false;
  try { viaRoute([NCC], "super_admin"); } catch { badRole = true; }
  check(badRole, "unknown operating role rejected");
  out.push("PASS creation logic: Annex only (1), CSIRT only (1), Both (2 ordinary rows), none (0); duplicates/unknown roles rejected");

  const service = read("src/modules/platform-admin/server/PlatformAdminServerService.ts");
  check(/for \(const a of assignments\) \{\s*await this\.setFacilityAssignment\(/.test(service), "each assignment uses the audited setFacilityAssignment workflow");
  check(!/both/i.test(read("src/modules/platform-admin/server/facilityAssignmentRequest.ts").replace(/\/\*[\s\S]*?\*\//g, "")), "no persisted 'both' value or synthetic facility");
  const route = read("src/app/api/platform-admin/route.ts");
  check(route.includes("facilityAssignments: Array.isArray(body.facilityIds)"), "route maps facilityIds → facility assignments");
  const people = read("src/modules/platform-admin/client/PeopleView.tsx");
  check(people.includes('"Both facilities"') && people.includes("No facility assignment") && people.includes("facilityIds"), "Create Account offers NCC Annex / CSIRT / Both / none");
  out.push("PASS wiring: route + Create Account UI; every row via the existing audited workflow");

  const access = read("src/modules/platform-admin/client/AccessView.tsx");
  check(access.includes("Add facility") && access.includes("<AssignmentDialog"), "Operating Context can add a facility");
  check(access.includes('status: "inactive"') && access.includes('"setFacilityAssignment"'), "Operating Context removes via audited deactivation");
  check(!/grantPlatformCapability|revokePlatformCapability|batchUpdateCapabilities/.test(access.slice(access.indexOf("removeAssignment"), access.indexOf("removeAssignment") + 1200)), "removing an assignment never touches capability grants");
  check(access.includes("Operates at") && access.includes("active.map((a) => a.facilityName)"), "all active assignments shown");
  const dialog = read("src/modules/platform-admin/client/PersonView.tsx");
  check(dialog.includes("export function AssignmentDialog") && dialog.includes('a.status === "active" && a.facilityId === f.id'), "dialog reused; excludes already-active facilities");
  check(!read("src/components/platform/GlobalCommandBar.tsx").includes("FacilityContextSwitcher"), "global facility switcher not reintroduced");
  out.push("PASS Operating Context: add / remove / all active shown; grants untouched; no switcher");

  for (const line of out) console.log(line);
  console.log("verify-admin-multi-facility-assignments: PASS");
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
