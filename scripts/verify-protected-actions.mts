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
  capabilitiesForRole,
  resolveOperatingAccessFromSheetUser,
  resolveProtectedActionAuthority,
} from "../src/lib/access";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function sheet(roleLabel: string, email: string) {
  return resolveOperatingAccessFromSheetUser(email, email, {
    id: `USR-${email}`,
    name: email,
    email,
    role: roleLabel,
    status: "active",
    facility: "NCC Annex",
  });
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
  assert(accessCan(sa, "finance.authorize"), "SA can attempt finance via override");
  assert(accessCan(sa, "approvals.manage"), "SA can attempt approvals via override");

  // Infrastructure wiring
  const execute = readSrc("src/lib/actions/execute.ts");
  assert(execute.includes("authorizeProtectedAction"), "executeAction protected gate");
  assert(execute.includes("getStepUpPassword"), "step-up from input");

  const verify = readSrc("src/lib/access/verifyFmStepUp.ts");
  assert(verify.includes("signInWithPassword"), "Supabase step-up");
  assert(!verify.includes("spreadsheet"), "no sheet passwords");

  const authRoute = readSrc(
    "src/app/api/reimbursement-authorizations/route.ts"
  );
  assert(
    authRoute.includes("finance.authorization.revise"),
    "auth revise gated"
  );
  const payRoute = readSrc("src/app/api/reimbursement-payments/route.ts");
  assert(payRoute.includes("finance.payment.correct"), "payment correct gated");

  const claimRoute = readSrc("src/app/api/cost-submissions/route.ts");
  assert(
    claimRoute.includes("finance.claim.edit_submitted"),
    "claim edit protected id"
  );
  assert(
    claimRoute.includes("loadExistingSubmissionStatus") ||
      claimRoute.includes("status-check"),
    "claim edit forced via existing status lookup"
  );
  assert(
    claimRoute.includes("gateProtectedActionOrResponse"),
    "claim edit uses protected gate"
  );
  assert(
    claimRoute.includes("503") &&
      claimRoute.includes("Fail closed"),
    "claim edit fails closed when status lookup fails"
  );

  const approvalsRoute = readSrc("src/app/api/approvals/route.ts");
  assert(
    approvalsRoute.includes("approval.record_decision") ||
      approvalsRoute.includes("decisions must be recorded"),
    "approvals proxy blocks unprotected decisions"
  );

  const costGs = readSrc("apps-script/CostRecordService.gs");
  assert(costGs.includes("allowsProtectedCostUnlock_"), "GS unlock path");
  assert(costGs.includes("finance.cost.unlock_edit"), "GS action id");
  assert(costGs.includes("platform_override"), "GS accepts SA mode");

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

  // First-auth / first-pay remain capability-only (create not requireProtected)
  assert(
    !authRoute.includes("requireProtectedForActions: {\n      create"),
    "create auth not protected"
  );
  assert(
    capabilitiesForRole("finance").includes("finance.authorize") &&
      !capabilitiesForRole("finance").includes("fm.authorize_protected"),
    "Finance role matrix unchanged for protected FM cap"
  );

  console.log("PASS verify-protected-actions");
  console.log("  actions:", PROTECTED_ACTION_IDS.join(", "));
  console.log(
    "  FM step-up: Supabase signInWithPassword; SA: platform_override without password"
  );
}

main();
