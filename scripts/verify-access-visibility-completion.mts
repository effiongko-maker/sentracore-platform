/**
 * V1 visibility completion — mutation UI + route surface gates (pure / static).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-access-visibility-completion.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canSeeHref,
  resolveAccessVisibility,
  resolveOperatingAccessFromSheetUser,
  applyPlatformSuperAdmin,
  accessCan,
  surfaceForHref,
} from "../src/lib/access";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function sheet(role: string, email = "u@example.com") {
  return resolveOperatingAccessFromSheetUser(email, "U", {
    id: "1",
    name: "U",
    email,
    role,
    status: "active",
    facility: "NCC Annex",
  });
}

function main() {
  // Route surface mapping
  assert(surfaceForHref("/finance") === "finance", "FM finance surface");
  assert(surfaceForHref("/finance/costs") === "finance", "FM finance nested");
  assert(surfaceForHref("/workspaces/finance") == null, "platform finance path unmapped");
  assert(surfaceForHref("/work-orders") === "operations", "WO surface");
  assert(surfaceForHref("/approvals") === "approvals", "approvals surface");
  assert(surfaceForHref("/users") === "users", "users surface");
  assert(surfaceForHref("/occupant-requests") === "requests", "requests surface");
  assert(surfaceForHref("/") == null, "platform home open");

  const ncc = sheet("NCC / Client");
  const nccVis = resolveAccessVisibility(ncc);
  assert(!canSeeHref(nccVis, "/finance"), "NCC cannot deep-link finance");
  assert(!canSeeHref(nccVis, "/work-orders"), "NCC cannot deep-link WO");
  assert(canSeeHref(nccVis, "/occupant-requests"), "NCC can requests");

  const boss = sheet("Executive Oversight");
  const bossVis = resolveAccessVisibility(boss);
  assert(canSeeHref(bossVis, "/finance"), "boss can see finance");
  assert(canSeeHref(bossVis, "/work-orders"), "boss can see ops");
  assert(!accessCan(boss, "ops.create"), "boss no ops.create");
  assert(!accessCan(boss, "finance.create"), "boss no finance.create");
  assert(!accessCan(boss, "approvals.manage"), "boss no approvals.manage");

  const liaison = sheet("Liaison Officer");
  assert(!accessCan(liaison, "ops.edit"), "liaison no ops.edit");
  assert(!accessCan(liaison, "finance.create"), "liaison no finance create");

  const sa = applyPlatformSuperAdmin(sheet("NCC / Client", "sa@x.com"), true);
  assert(sa.role === "ncc_client", "SA ≠ FM role");
  assert(accessCan(sa, "platform.admin_override"), "SA override");
  assert(!accessCan(sa, "fm.authorize_protected"), "SA ≠ FM protected");

  // Gate wiring
  const gate = readSrc("src/components/security/AccessSurfaceGate.tsx");
  assert(gate.includes("canSeeHref"), "surface gate uses canSeeHref");
  assert(gate.includes("resolveAccessVisibility"), "surface gate uses visibility");
  assert(!gate.includes("facility_manager"), "no role allowlist in gate");

  const shell = readSrc("src/components/platform/ProductShell.tsx");
  assert(shell.includes("AccessSurfaceGate"), "ProductShell mounts gate");

  const wo = readSrc("src/modules/work-orders/components/WorkOrdersPage.tsx");
  assert(wo.includes('can("ops.create")'), "WO create capability");
  assert(wo.includes('can("ops.edit")'), "WO edit capability");
  assert(wo.includes("canCreate={canCreateOps}"), "WO create UI gate");
  assert(wo.includes("canMutate={canMutateOps}"), "WO mutate UI gate");

  const issues = readSrc("src/modules/issues/components/IssuesPage.tsx");
  assert(issues.includes('can("ops.create")'), "Issues create gate");
  assert(issues.includes('actionLabel={canCreateOps ? "Log Issue"'), "Log Issue hidden");

  const approvals = readSrc("src/modules/approvals/components/ApprovalsPage.tsx");
  assert(approvals.includes('can("approvals.manage")'), "approvals manage");
  assert(approvals.includes("canManage={canManageApprovals}"), "approvals UI");

  const finDetail = readSrc(
    "src/modules/finance/components/SubmissionDetailPage.tsx"
  );
  assert(finDetail.includes("canSubmitFinance"), "submit capability gate");
  assert(finDetail.includes("canCreateFinance"), "edit capability gate");

  const workflow = readSrc(
    "src/modules/finance/components/SubmissionWorkflowPage.tsx"
  );
  assert(workflow.includes("canCreateFinance"), "workflow create gate");
  assert(workflow.includes("Access restricted"), "workflow deny UX");

  // API enforcement untouched markers
  const opsGate = readSrc("src/lib/access/postGatedOperationalProxy.ts");
  assert(opsGate.includes("gateApiCapability"), "ops API gate remains");
  const finProxy = readSrc(
    "src/lib/access/postFinanceProxyWithProtection.ts"
  );
  assert(finProxy.includes("writeCapability"), "finance write gate remains");
  assert(finProxy.includes("finance.view"), "finance read gate remains");

  const protectedSrc = readSrc("src/lib/access/authorizeProtectedAction.ts");
  assert(
    protectedSrc.includes("resolveProtectedActionAuthority") ||
      protectedSrc.includes("fm.authorize_protected"),
    "protected actions unchanged"
  );

  console.log("PASS verify-access-visibility-completion");
  console.log("  route surface gate + mutation UI capability wiring");
  console.log("  SA ≠ FM; API gates preserved");
}

main();
