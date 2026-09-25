/**
 * FM Work Order route — Issue → Execute → Submit Work Order → Client Payment (payment_request). No database access.
 *
 * Proves: Work Order-route Work executes without Approval / Work Order; the Work Order is refused before the Work is
 * completed and available after; its Order Type derives as work_order (mismatch refused); a Work Order links to at most
 * one active payment request; commercial facts are entered, never invented; receipt state stays on the Client Payment;
 * the Job Order route is unchanged; legacy / historical records and the imported Client Payments are untouched. Each
 * rule is shown to be enforced server-side (repositories / DB), not only in the UI.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-fm-work-order-client-payment.mts
 */
import { readFileSync } from "node:fs";
import {
  jobOrderExecutionBlock,
  jobOrderIssueBlock,
  resolveInstructionOrderType,
  workOrderClientPaymentBlock,
  workOrderSubmissionBlock,
  workReopenBlock,
} from "../src/modules/maintenance/commercialRoute";
import { parseCreateSubmissionInput, parseUpdateSubmissionInput } from "../src/modules/finance/server/fmCostDomain";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");
const stripSql = (s: string) => s.replace(/--.*$/gm, "");
const stripTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const NOT_COMPLETED = ["requested", "triaged", "scheduled", "in_progress", "on_hold", "cancelled"];

async function main() {
  const out: string[] = [];
  const migration = stripSql(read("supabase/migrations/20260923170000_fm_work_order_client_payment.sql"));
  const wiRepo = read("src/modules/work-orders/server/FmWorkInstructionRepository.ts");
  const costRepo = read("src/modules/finance/server/FmCostRepository.ts");
  const workRepo = read("src/modules/maintenance/server/FmWorkRepository.ts");

  // 1. Work Order-route Work executes without Approval or Work Order.
  for (const status of ["in_progress", "completed"]) {
    check(jobOrderExecutionBlock({ route: "work_order", status, approvalStatus: null, hasJobOrder: false }) === null, `executes (${status})`);
  }
  check(!/workOrderSubmissionBlock|workOrderClientPaymentBlock/.test(workRepo), "no Work Order / payment gate on Work execution");
  check(workReopenBlock({ route: "work_order", fromStatus: "in_progress", toStatus: "completed", hasWorkOrder: false }) === null, "completing is never blocked");
  out.push("PASS 1 Work Order-route Work starts and completes with no Approval and no Work Order");

  // 2. The Work Order is refused before the Work is completed (server-side).
  for (const workStatus of NOT_COMPLETED) {
    check(workOrderSubmissionBlock({ route: "work_order", orderType: "work_order", workStatus }) !== null, `refused while ${workStatus}`);
  }
  check(
    /const submissionBlock = workOrderSubmissionBlock\(\{\s*route: work\.commercial_route,\s*orderType: resolved\.orderType,\s*workStatus: work\.status,/.test(wiRepo) &&
      wiRepo.includes("if (submissionBlock) throw new FmWorkInstructionValidationError(submissionBlock);"),
    "Work Instruction repository enforces it on create and on re-linking"
  );
  check(wiRepo.includes('.select("id, code, facility_id, incident_id, record_origin, commercial_route, status")'), "reads the Work's live status");
  out.push("PASS 2 a Work Order cannot be submitted before the Work is completed (Work Instruction repository)");

  // 3. Completed Work Order-route Work can submit its Work Order.
  check(workOrderSubmissionBlock({ route: "work_order", orderType: "work_order", workStatus: "completed" }) === null, "allowed once completed");
  const orchestration = read("src/lib/operational/orchestration/index.ts");
  // The Work Order has its OWN lifecycle: it starts "open" (issued / submitted, not closed) and is dated when it is
  // recorded — it never copies the Work's completed status or completion date.
  const createFromWork = orchestration.slice(
    orchestration.indexOf("export async function orchestrateCreateWorkOrderFromMaintenance"),
    orchestration.indexOf("export async function orchestrateTriageIncident")
  );
  check(/orderType: options\.orderType,\s*clientReference: options\.clientReference,[\s\S]{0,400}?status: "open",\s*requestedAt: options\.context\.now,/.test(createFromWork), "Work Order starts open, dated when recorded");
  check(!/completedAt: maintenance\.completedAt|status: "completed"/.test(stripTs(createFromWork)), "no Work completion status / date copied onto the Work Order");
  const form = read("src/modules/maintenance/components/MaintenanceFormModal.tsx");
  check(form.includes('{route === "work_order" ? "Submit Work Order" : "Create new work order"}') && form.includes('(route === "work_order" ? !isCompleted : isTerminalLifecycle)'), "Work form: Submit Work Order once completed");
  out.push("PASS 3 completed Work Order-route Work can submit its Work Order");

  // 4. Order Type derives as work_order; mismatch refused.
  const derived = resolveInstructionOrderType("work_order", undefined);
  check(derived.ok && derived.orderType === "work_order", "derived work_order");
  check(!resolveInstructionOrderType("work_order", "job_order").ok, "a Job Order on Work Order Work is refused");
  check(/const orderType = await this\.resolveOrderTypeFor\(work, input\.orderType\);/.test(wiRepo), "derivation enforced in the repository");
  out.push("PASS 4 Order Type derives as work_order; a mismatch is refused server-side");

  // 5. A Work Order links to exactly one (active) payment request.
  check(/add column if not exists work_instruction_id uuid;/.test(migration), "fm_cost_submissions.work_instruction_id");
  check(migration.includes("check (work_instruction_id is null or submission_kind = 'payment_request')"), "payment requests only (DB)");
  check(
    migration.includes("fm_cost_submissions_org_work_instruction_active_uidx") &&
      migration.includes("where work_instruction_id is not null and status <> 'cancelled'"),
    "one active Client Payment per Work Order (DB)"
  );
  check(migration.includes("i.order_type = 'work_order'") && migration.includes("cannot be changed once set"), "DB guard: Work Order only; link fixed");
  check(workOrderClientPaymentBlock({ kind: "payment_request", orderType: "work_order", route: "work_order", recordOrigin: "operational" }) === null, "allowed");
  for (const kind of ["reimbursement_claim", "contract_instalment"]) {
    check(workOrderClientPaymentBlock({ kind, orderType: "work_order", route: "work_order", recordOrigin: "operational" }) !== null, `${kind} refused`);
  }
  check(workOrderClientPaymentBlock({ kind: "payment_request", orderType: "job_order", route: "job_order", recordOrigin: "operational" }) !== null, "Job Order refused");
  check(/already has payment request \$\{found\.code\}/.test(costRepo) && costRepo.includes('.neq("status", "cancelled").limit(1)'), "repository refuses a duplicate");
  check(costRepo.includes("A payment request's Work Order is set when it is raised and cannot be changed."), "link fixed on update");
  check(parseCreateSubmissionInput({ submissionKind: "payment_request", workOrderId: "WO-2026-000001" }).workOrderRef === "WO-2026-000001", "create carries the Work Order");
  check(parseUpdateSubmissionInput({ submissionId: "SUB-2026-000001" }).workOrderRef === undefined, "updates do not carry it by default");
  out.push("PASS 5 a Work Order produces / links exactly one active payment request (domain + repository + DB)");

  // 6. Missing commercial facts are never invented.
  const cpForm = read("src/modules/finance/components/ClientPaymentFormPage.tsx");
  check(cpForm.includes('const [description, setDescription] = useState("");') && cpForm.includes('const [amount, setAmount] = useState("");') && cpForm.includes('const [submittedOn, setSubmittedOn] = useState("");'), "facts start empty — nothing prefilled from the Work / Work Order");
  check(cpForm.includes("Describe what was requested from the client.") && cpForm.includes("Enter the requested amount.") && cpForm.includes("Enter the date the request was submitted to the client."), "each fact is required from the operator");
  check(read("supabase/migrations/20260923130000_fm_client_payments.sql").includes("fm_cost_submissions_requested_amount_required"), "DB still requires the requested amount");
  check(!/claimAmount|claim_amount|estimated_cost|actual_cost/.test(stripTs(wiRepo.slice(wiRepo.indexOf("clientPayments")))), "no amount copied from the Work Order");
  out.push("PASS 6 requested amount, description, date and reference are entered explicitly — never derived or invented");

  // 7. Receipt state stays owned by Client Payments.
  const woTypes = read("src/modules/work-orders/types.ts");
  check(woTypes.includes("clientPaymentId?: string;") && !/received|settlement|receipt[A-Z]|outstanding/i.test(stripTs(woTypes)), "Work Order holds only the relationship");
  check(
    !/(alter|create|drop)\s+(table|trigger|function|or replace function)\s+(if exists\s+)?public\.(fm_reimbursement_payments|validate_fm_reimbursement_payment)/i.test(migration),
    "receipt mechanics untouched (no DDL on receipts or their validation)"
  );
  out.push("PASS 7 receipt / settlement state stays on the Client Payment; the Work Order carries only the link");

  // 8. Job Order route unchanged.
  check(jobOrderIssueBlock({ route: "job_order", orderType: "job_order", approvalStatus: null }) !== null, "Job Order still needs approval");
  check(jobOrderExecutionBlock({ route: "job_order", status: "in_progress", approvalStatus: "approved", hasJobOrder: false }) !== null, "Job Order execution gate intact");
  check(workOrderSubmissionBlock({ route: "job_order", orderType: "job_order", workStatus: "requested" }) === null, "completion rule does not apply to Job Orders");
  out.push("PASS 8 Job Order route unchanged (approval → Job Order → execute)");

  // 9. Legacy / historical records untouched.
  check(!/\bupdate\s+public\.|\binsert\s+into\b|\bdelete\s+from\b/i.test(migration), "no data rewrite / backfill");
  check(workOrderSubmissionBlock({ route: null, orderType: "work_order", workStatus: "requested" }) === null, "legacy Work keeps its behaviour");
  check(workOrderClientPaymentBlock({ kind: "payment_request", orderType: "work_order", route: null, recordOrigin: "operational" }) !== null, "legacy Work Orders are not linked");
  check(workOrderClientPaymentBlock({ kind: "payment_request", orderType: "work_order", route: "work_order", recordOrigin: "migrated_historical" }) !== null, "historical Work Orders are not linked");
  out.push("PASS 9 legacy / historical Work, Work Orders and Client Payments untouched; no backfill");

  // 10. A submitted Work Order pins its Work at completed (no reopen / reversal workflow in this phase).
  for (const toStatus of ["requested", "triaged", "scheduled", "in_progress", "on_hold", "cancelled"]) {
    check(workReopenBlock({ route: "work_order", fromStatus: "completed", toStatus, hasWorkOrder: true }) !== null, `completed → ${toStatus} refused`);
  }
  check(workReopenBlock({ route: "work_order", fromStatus: "completed", toStatus: "completed", hasWorkOrder: true }) === null, "editing completed Work is fine");
  check(workReopenBlock({ route: "work_order", fromStatus: "completed", toStatus: "in_progress", hasWorkOrder: false }) === null, "no Work Order yet → unchanged");
  check(workReopenBlock({ route: "job_order", fromStatus: "completed", toStatus: "in_progress", hasWorkOrder: true }) === null, "Job Order route unchanged");
  check(workReopenBlock({ route: null, fromStatus: "completed", toStatus: "in_progress", hasWorkOrder: true }) === null, "legacy Work unchanged");
  check(
    /const reopenBlock = workReopenBlock\(\{\s*route: existing\.commercial_route,\s*fromStatus: existing\.status,\s*toStatus: nextStatus,\s*hasWorkOrder: existing\.work_instruction_codes\.length > 0,/.test(workRepo) &&
      workRepo.includes("if (reopenBlock) throw new FmWorkValidationError(reopenBlock);"),
    "enforced in the Work repository (covers edit, status change and cancel)"
  );
  check(/async deactivate\([\s\S]{0,200}this\.update\(/.test(workRepo), "cancel goes through the same guarded update");
  out.push("PASS 10 once its Work Order is submitted, Work Order-route Work cannot leave completed (server-side)");

  for (const line of out) console.log(line);
  console.log("verify-fm-work-order-client-payment: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
