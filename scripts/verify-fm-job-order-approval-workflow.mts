/**
 * FM Job Order route — the client Approval precedes the Job Order, and execution waits for both. No database access.
 *
 *   Issue → Job Order route → Request Approval → Approval Granted → Job Order Issued → Execute
 *
 * Proves: an Approval can exist for Work with no Job Order; pending / rejected approval blocks execution; approval never
 * fabricates a Job Order or client reference; granted approval without a Job Order still blocks execution; granted
 * approval + Job Order permits it; Work Order route needs no approval; classified Work derives the Order Type and a
 * mismatch is refused; legacy (NULL route) Work keeps its behaviour; the imported Approvals are not touched. Each rule
 * is also shown to be enforced in the server repositories, not only the UI.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-fm-job-order-approval-workflow.mts
 */
import { readFileSync } from "node:fs";
import {
  EXECUTION_STATUSES,
  instructionApprovalBlock,
  jobOrderExecutionBlock,
  jobOrderIssueBlock,
  resolveInstructionOrderType,
  workApprovalBlock,
} from "../src/modules/maintenance/commercialRoute";
import { parseCreateApprovalInput } from "../src/modules/approvals/server/fmApprovalDomain";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/--.*$/gm, "");
const PENDING = ["draft", "awaiting_decision", "returned", "expired", "cancelled", "closed"];

async function main() {
  const out: string[] = [];
  const workRepo = read("src/modules/maintenance/server/FmWorkRepository.ts");
  const wiRepo = read("src/modules/work-orders/server/FmWorkInstructionRepository.ts");
  const approvalRepo = read("src/modules/approvals/server/FmApprovalRepository.ts");
  const migration = read("supabase/migrations/20260923160000_fm_job_order_approval_before_issue.sql");
  const migrationCode = stripComments(migration);

  // 1. An Approval can exist for Work while no Job Order exists.
  const parsed = parseCreateApprovalInput({ workId: "WRK-2026-000123", title: "Client approval" }, { allowDecision: false });
  check(parsed.workRef === "WRK-2026-000123" && parsed.workInstructionRef === undefined, "Work-level approval parses without a Work Instruction");
  check(workApprovalBlock({ route: "job_order", recordOrigin: "operational" }) === null, "Job Order Work may request approval");
  check(workApprovalBlock({ route: "work_order", recordOrigin: "operational" }) !== null, "Work Order Work does not take a prior approval");
  check(workApprovalBlock({ route: null, recordOrigin: "operational" }) !== null, "legacy Work keeps instruction-level approvals");
  check(workApprovalBlock({ route: "job_order", recordOrigin: "migrated_historical" }) !== null, "historical Work stays read-only");
  check(/work_instruction_id: subject\.work_instruction_id,\s*work_id: subject\.work_id,/.test(approvalRepo), "repository inserts the Work link with no Work Instruction");
  check(/add column if not exists work_id uuid;/.test(migrationCode) && migrationCode.includes("fm_approvals_org_work_uidx"), "fm_approvals.work_id (one per Work)");
  check(
    migrationCode.includes("(new.work_instruction_id is null and new.work_id is null) or new.approval_type is null"),
    "DB guard accepts a Work-level Approval without a Work Instruction"
  );
  check(migrationCode.includes("v_route is distinct from 'job_order'"), "DB guard: Work-level Approval only on Job Order Work");
  out.push("PASS 1 an Approval can belong to Job Order Work before any Job Order exists (domain + repository + DB guard)");

  // 2. Pending / rejected approval blocks execution.
  for (const status of EXECUTION_STATUSES) {
    check(jobOrderExecutionBlock({ route: "job_order", status, approvalStatus: null, hasJobOrder: false }) !== null, `no approval blocks ${status}`);
    for (const approvalStatus of [...PENDING, "rejected"]) {
      check(
        jobOrderExecutionBlock({ route: "job_order", status, approvalStatus, hasJobOrder: true }) !== null,
        `${approvalStatus} approval blocks ${status}`
      );
    }
  }
  check(jobOrderExecutionBlock({ route: "job_order", status: "scheduled", approvalStatus: null, hasJobOrder: false }) === null, "planning is not execution");
  check(
    /const executionBlock = jobOrderExecutionBlock\(\{\s*route: input\.commercialRoute \?\? existing\.commercial_route,\s*status: nextStatus,\s*approvalStatus: existing\.client_approval_status,\s*hasJobOrder: existing\.job_order_codes\.length > 0,/.test(workRepo),
    "Work update enforces the execution gate server-side"
  );
  check(/approvalStatus: null,\s*hasJobOrder: false,\s*\}\);\s*if \(executionBlock\) throw new FmWorkValidationError\(executionBlock\);/.test(workRepo), "Work create cannot start as executing Job Order Work");
  out.push("PASS 2 no / pending / rejected approval blocks start and completion (enforced in the Work repository)");

  // 3. Approval never fabricates a Job Order or client reference.
  const requestAction = stripComments(read("src/modules/approvals/actions/requestWorkApproval.ts"));
  const lifecycle = stripComments(read("src/modules/approvals/actions/approvalLifecycleActions.ts"));
  for (const [label, source] of [["requestWorkApproval", requestAction], ["approval lifecycle (incl. record decision)", lifecycle], ["approval repository", stripComments(approvalRepo)]] as const) {
    check(!/createWorkOrder|WorkInstructionServerAccess|fm_work_instructions"\)\s*\.insert|client_reference|clientReference/.test(source), `${label} creates no Job Order / client reference`);
  }
  check(jobOrderIssueBlock({ route: "job_order", orderType: "job_order", approvalStatus: null }) !== null, "no approval → no Job Order");
  for (const approvalStatus of [...PENDING, "rejected"]) {
    check(jobOrderIssueBlock({ route: "job_order", orderType: "job_order", approvalStatus }) !== null, `${approvalStatus} → no Job Order`);
  }
  check(jobOrderIssueBlock({ route: "job_order", orderType: "job_order", approvalStatus: "approved" }) === null, "approved → Job Order may be recorded");
  check(/const issueBlock = jobOrderIssueBlock\(/.test(wiRepo) && /const orderType = await this\.resolveOrderTypeFor\(work, input\.orderType\);/.test(wiRepo), "Work Instruction create enforces the issue gate");
  check(migrationCode.includes("add column if not exists client_reference text;") && !/default/i.test(migrationCode.split("client_reference")[1] ?? ""), "client reference is recorded as supplied, never defaulted");
  out.push("PASS 3 approval creates no Job Order and no client reference; a Job Order is recorded only after approval");

  // 4. Granted approval without the issued Job Order still blocks execution.
  for (const status of EXECUTION_STATUSES) {
    check(
      /record the issued Job Order/.test(jobOrderExecutionBlock({ route: "job_order", status, approvalStatus: "approved", hasJobOrder: false }) ?? ""),
      `approved without Job Order blocks ${status}`
    );
  }
  out.push("PASS 4 granted approval + no Job Order still blocks execution");

  // 5. Granted approval + Job Order permits execution.
  for (const status of EXECUTION_STATUSES) {
    check(jobOrderExecutionBlock({ route: "job_order", status, approvalStatus: "approved", hasJobOrder: true }) === null, `approved + Job Order permits ${status}`);
  }
  check(workRepo.includes('.select("code, work_id, order_type")') && workRepo.includes('if (rec.order_type === "job_order")'), "Job Order presence comes from actual Work Instructions");
  out.push("PASS 5 granted approval + recorded Job Order permits execution");

  // 6. Work Order route requires no approval.
  for (const status of EXECUTION_STATUSES) {
    check(jobOrderExecutionBlock({ route: "work_order", status, approvalStatus: null, hasJobOrder: false }) === null, `Work Order route executes (${status})`);
  }
  check(jobOrderIssueBlock({ route: "work_order", orderType: "work_order", approvalStatus: null }) === null, "Work Order needs no approval");
  check(instructionApprovalBlock("work_order") !== null, "no approval is raised for Work Order Work");
  out.push("PASS 6 Work Order route executes and creates its Work Order without any approval");

  // 7. Classified Work derives the Order Type; a mismatch is refused server-side.
  const derivedJo = resolveInstructionOrderType("job_order", undefined);
  const derivedWo = resolveInstructionOrderType("work_order", undefined);
  check(derivedJo.ok && derivedJo.orderType === "job_order" && derivedWo.ok && derivedWo.orderType === "work_order", "derived from the route");
  check(!resolveInstructionOrderType("work_order", "job_order").ok && !resolveInstructionOrderType("job_order", "work_order").ok, "mismatch refused");
  check(/patch\.order_type = await this\.resolveOrderTypeFor\(target, orderType\);/.test(wiRepo), "update / re-linking re-checks the route");
  const orchestration = read("src/lib/operational/orchestration/index.ts");
  check(orchestration.includes('"Create the Work first: a Job Order is issued only after the client approves."'), "triage cannot create a Job Order alongside new Work");
  for (const ui of ["src/modules/maintenance/components/MaintenanceFormModal.tsx", "src/modules/work/components/WorkDetailModal.tsx", "src/modules/maintenance/components/ViewMaintenanceModal.tsx"]) {
    check(/\{!route \? \(\s*<OrderTypePicker/.test(read(ui)), `${ui} asks for Order Type only on legacy Work`);
  }
  check(read("src/modules/work-orders/components/WorkOrderFormModal.tsx").includes("disabled={Boolean(routeOrderType)}"), "Work Order form fixes the type for classified Work");
  out.push("PASS 7 classified Work derives the Order Type; mismatches refused in the repository; not asked again in the UI");

  // 8. Legacy (NULL route) Work is unchanged.
  check(!resolveInstructionOrderType(null, undefined).ok && resolveInstructionOrderType(null, "job_order").ok, "legacy: explicit Order Type, either value");
  check(jobOrderIssueBlock({ route: null, orderType: "job_order", approvalStatus: null }) === null, "legacy: no issue gate");
  for (const status of EXECUTION_STATUSES) {
    check(jobOrderExecutionBlock({ route: null, status, approvalStatus: null, hasJobOrder: false }) === null, `legacy: no execution gate (${status})`);
  }
  check(instructionApprovalBlock(null) === null, "legacy: instruction-level approvals still allowed");
  out.push("PASS 8 legacy-unclassified Work keeps explicit Order Type, instruction-level approvals and no gates");

  // 9. The imported source-register Approvals are untouched.
  check(!/\bupdate\s+public\.fm_approvals\b|\bdelete\s+from\b|\binsert\s+into\b/i.test(migrationCode), "no data rewrite, no backfill");
  check(/fm_migration_provenance p[\s\S]*target_table = 'fm_approvals'/.test(migrationCode), "provenance still required for an Approval with neither Work nor Work Instruction");
  check(migrationCode.includes("new.source_note is distinct from old.source_note"), "source note stays immutable");
  out.push("PASS 9 imported Approvals untouched: no backfill, provenance requirement and source-note immutability kept");

  for (const line of out) console.log(line);
  console.log("verify-fm-job-order-approval-workflow: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
