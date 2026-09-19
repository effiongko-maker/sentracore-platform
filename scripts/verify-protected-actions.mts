/**
 * Protected Actions V1 verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-protected-actions.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROTECTED_ACTION_IDS,
  PROTECTED_ACTIONS,
  accessCan,
  applyPlatformSuperAdmin,
  resolveProtectedActionAuthority,
} from "../src/lib/access";

import { parseV1OperatingRole } from "../src/lib/access/roles";
import { explicitGrantBundle, contextAccess } from "./lib/accessFixtures";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

/** Operating CONTEXT (role label / facility) — confers NO capability by itself. */
function contextOnly(roleLabel: string, email: string) {
  return contextAccess(email, email, {
    id: `USR-${email}`,
    name: email,
    email,
    role: roleLabel,
    status: "active",
    facility: "NCC Annex",
  });
}

/** The same person after an administrator EXPLICITLY granted the matching capability bundle. */
function sheet(roleLabel: string, email: string) {
  const base = contextOnly(roleLabel, email);
  const parsed = parseV1OperatingRole(roleLabel);
  return { ...base, capabilities: parsed ? explicitGrantBundle(parsed) : [] };
}

function main() {
  assert(PROTECTED_ACTION_IDS.length === 5, "exactly five protected actions");
  assert(
    PROTECTED_ACTIONS["finance.cost.unlock_edit"].baseCapability ===
      "finance.create",
    "cost unlock base cap"
  );
  assert(
    PROTECTED_ACTIONS["finance.authorization.revise"].baseCapability ===
      "finance.authorize",
    "revise base cap"
  );
  assert(
    PROTECTED_ACTIONS["finance.payment.correct"].baseCapability ===
      "finance.pay",
    "correct base cap"
  );
  assert(
    PROTECTED_ACTIONS["approval.record_decision"].baseCapability ===
      "approvals.manage",
    "decision base cap"
  );

  // A role label alone confers no protected authority — only an explicit grant does.
  assert(
    resolveProtectedActionAuthority(contextOnly("Facility Manager", "label@example.com")) === null,
    "Facility Manager label without an explicit grant has no protected authority"
  );

  const fm = sheet("Facility Manager", "fm@example.com");
  assert(
    resolveProtectedActionAuthority(fm)?.mode === "facility_manager",
    "FM authority mode"
  );
  assert(
    resolveProtectedActionAuthority(fm)?.label ===
      "Facility Manager authorization",
    "FM authority label"
  );
  assert(accessCan(fm, "fm.authorize_protected"), "FM has fm.authorize_protected");
  assert(
    !accessCan(fm, "platform.admin_override"),
    "FM does not have platform override"
  );

  const staff = sheet("FM Staff", "staff@example.com");
  assert(
    resolveProtectedActionAuthority(staff) == null,
    "FM Staff cannot authorize protected"
  );
  assert(accessCan(staff, "finance.create"), "FM Staff keeps finance.create");
  assert(
    !accessCan(staff, "finance.authorize"),
    "FM Staff no finance.authorize"
  );

  const finance = sheet("Finance", "fin@example.com");
  assert(accessCan(finance, "finance.authorize"), "Finance can first-authorize");
  assert(accessCan(finance, "finance.pay"), "Finance can first-pay");
  assert(
    resolveProtectedActionAuthority(finance) == null,
    "Finance cannot FM-protect revise/correct alone"
  );

  const liaison = sheet("Liaison Officer", "lo@example.com");
  assert(!accessCan(liaison, "finance.authorize"), "Liaison denied finance.authorize");
  assert(
    resolveProtectedActionAuthority(liaison) == null,
    "Liaison no protected authority"
  );

  const ncc = sheet("NCC / Client", "ncc@example.com");
  assert(!accessCan(ncc, "approvals.manage"), "NCC denied approvals.manage");
  assert(resolveProtectedActionAuthority(ncc) == null, "NCC no protected authority");

  const sa = applyPlatformSuperAdmin(ncc, true);
  assert(sa.role === "ncc_client", "SA keeps operating role");
  assert(sa.authorityKind === "platform_override", "SA authority kind");
  assert(
    resolveProtectedActionAuthority(sa)?.mode === "platform_override",
    "SA protected mode"
  );
  assert(
    resolveProtectedActionAuthority(sa)?.label ===
      "System Administrator override",
    "SA label"
  );
  assert(accessCan(sa, "platform.admin_override"), "SA override cap");
  assert(
    !accessCan(sa, "fm.authorize_protected"),
    "SA override ≠ fm.authorize_protected"
  );
  // Current law: override never substitutes for the base business capability.
  assert(!accessCan(sa, "finance.authorize"), "SA override does not satisfy the base capability");
  const saWithGrant = applyPlatformSuperAdmin({ ...ncc, capabilities: ["finance.authorize"] }, true);
  assert(accessCan(saWithGrant, "finance.authorize"), "an explicit base grant still applies to a Super Admin");
  assert(resolveProtectedActionAuthority(saWithGrant)?.mode === "platform_override", "override authority applies on top of the explicit base grant");
  assert(!accessCan(sa, "approvals.manage"), "SA override does not satisfy approvals.manage (base capability required)");

  // Infrastructure wiring
  const execute = readSrc("src/lib/actions/execute.ts");
  assert(execute.includes("authorizeProtectedAction"), "executeAction protected gate");
  assert(execute.includes("getStepUpPassword"), "step-up from input");

  const verify = readSrc("src/lib/access/verifyFmStepUp.ts");
  assert(verify.includes("signInWithPassword"), "Supabase step-up");
  assert(!verify.includes("spreadsheet"), "no sheet passwords");

  // Phase 2G/2L: protected finance decisions are enforced by the Supabase FM cost handler + service.
  const costRoute = readSrc("src/modules/finance/server/fmCostRoute.ts");
  const costService = readSrc("src/modules/finance/server/FmCostServerService.ts");
  for (const id of ["finance.authorization.revise", "finance.payment.correct", "finance.claim.edit_submitted", "finance.cost.unlock_edit"]) {
    assert(costRoute.includes(id) && costService.includes(id), `${id} is enforced server-side`);
  }
  assert(costRoute.includes("gateProtectedActionOrResponse") && costRoute.includes("extractProtectedProof"), "protected proof is verified by the shared gate");
  assert(costService.includes("requireProtected"), "service refuses a protected mutation without the grant");
  assert(costRoute.includes("is not valid for"), "a proof for the wrong action is rejected");
  assert(costRoute.includes('action !== "update"'), "protected proof only applies to updates — first authorization / payment stay capability-only");

  const approvalsRoute = readSrc("src/app/api/approvals/route.ts");
  assert(
    approvalsRoute.includes("approval.record_decision") ||
      approvalsRoute.includes("decisions must be recorded"),
    "approvals proxy blocks unprotected decisions"
  );

  const decision = readSrc(
    "src/modules/approvals/actions/approvalLifecycleActions.ts"
  );
  assert(decision.includes('protectedActionId: "approval.record_decision"'), "decision protected");
  assert(decision.includes("authorityMode"), "decision audits authorityMode");

  const detail = readSrc(
    "src/modules/finance/components/SubmissionDetailPage.tsx"
  );
  assert(detail.includes("finance.authorization.revise"), "UI revise protect");
  assert(detail.includes("finance.payment.correct"), "UI correct protect");
  assert(detail.includes("createAuthorization"), "first auth still normal");

  // First-auth / first-pay remain capability-only (asserted above: proof applies to updates only)
  assert(
    explicitGrantBundle("finance").includes("finance.authorize") &&
      !explicitGrantBundle("finance").includes("fm.authorize_protected"),
    "Finance role matrix unchanged for protected FM cap"
  );

  console.log("PASS verify-protected-actions");
  console.log("  actions:", PROTECTED_ACTION_IDS.join(", "));
  console.log(
    "  FM step-up: Supabase signInWithPassword; SA: platform_override without password"
  );
}

main();
