/**
 * FM Job Order route — a REJECTED Work-level client Approval is revised and resubmitted as the SAME Approval process.
 * No database access.
 *
 *   awaiting_decision → rejected → (revise) draft → (submit) awaiting_decision → approved → Job Order → execute
 *
 * Proves: rejected can be revised/resubmitted; the prior rejection stays in the append-only history (snapshotted before
 * the row is reopened); resubmission returns the same row to awaiting decision; no second Approval is created;
 * execution stays blocked until the resubmitted Approval is granted and the Job Order exists; decided statuses cannot
 * be left by any other path; imported (Work-less) Approvals cannot be revised; classified Work writes no legacy
 * requires_work_instruction.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-fm-approval-revise-resubmit.mts
 */
import { readFileSync } from "node:fs";
import {
  approvalStatusChangeBlock,
  DECISION_KEYS,
  parseUpdateApprovalInput,
} from "../src/modules/approvals/server/fmApprovalDomain";
import { getApprovalLifecycleActions, isAwaitingSubmission, normalizeApprovalStatus } from "../src/modules/approvals/lifecycle";
import { jobOrderExecutionBlock, jobOrderIssueBlock } from "../src/modules/maintenance/commercialRoute";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function main() {
  const out: string[] = [];
  const actions = read("src/modules/approvals/actions/approvalLifecycleActions.ts");
  const revise = read("src/modules/approvals/actions/reviseRejectedApproval.ts");
  const service = read("src/modules/approvals/server/FmApprovalServerService.ts");
  const repo = read("src/modules/approvals/server/FmApprovalRepository.ts");

  // 1. A rejected Work-level Approval can be revised / resubmitted.
  check(approvalStatusChangeBlock({ from: "rejected", to: "draft", reopenRejected: true, isWorkLevel: true }) === null, "rejected → draft via revise");
  check(getApprovalLifecycleActions("rejected").canReviseAfterRejection, "UI lifecycle offers revise on rejected");
  check(revise.includes('name: "approval.revise_rejected"') && revise.includes('requiredCapability: "approvals.manage"'), "revise is a capability-checked server action");
  check(revise.includes('normalizeApprovalStatus(existing.status) !== "rejected"') && revise.includes("!existing.workId"), "only rejected Work-level approvals");
  check(/approvalStatusChangeBlock\(\{[\s\S]*?reopenRejected: options\.reopenRejected === true,/.test(repo), "repository enforces the transition rule");
  const rowActions = read("src/modules/approvals/components/ApprovalRowActions.tsx");
  check(rowActions.includes("actions.canReviseAfterRejection && approval.workId") && rowActions.includes("Revise &amp; resubmit"), "Approvals row action");
  check(read("src/modules/approvals/components/ApprovalsPage.tsx").includes("reviseRejectedApproval(modal.approval.id)"), "Approvals page wires the action");
  out.push("PASS 1 a rejected Work-level Approval can be revised and resubmitted (server action + repository rule + UI)");

  // 2. The prior rejection stays in history.
  check(revise.includes('action: "approval_updated"') && revise.includes("revision: true"), "revision recorded with an existing activity action (no migration)");
  for (const field of ["outcome", "decisionAt", "decisionNotes", "decisionReference", "decidedByProfileId", "decisionDocumentFileName"]) {
    check(new RegExp(`previousDecision: \\{[\\s\\S]*?${field}:`).test(revise), `previous decision snapshot keeps ${field}`);
  }
  for (const field of ["submittedAt", "submissionMethod", "submittedTo", "submissionReference", "approvalAmount"]) {
    check(new RegExp(`previousSubmission: \\{[\\s\\S]*?${field}:`).test(revise), `previous submission snapshot keeps ${field}`);
  }
  const reopenBranch = service.slice(service.indexOf("if (options.reopenRejected === true) {"));
  check(
    reopenBranch.indexOf("await this.recordActivity(existing.id, options.activity)") > 0 &&
      reopenBranch.indexOf("await this.recordActivity(existing.id, options.activity)") < reopenBranch.indexOf("await repo.update(input"),
    "snapshot is written BEFORE the row is reopened"
  );
  check(!/from\("fm_approval_activities"\)\s*\.(update|delete)/.test(stripComments(repo)), "activity history is append-only (never updated or deleted)");
  check(actions.includes('action = "approval_rejected"'), "the original approval_rejected entry is recorded at decision time and kept");
  out.push("PASS 2 the prior rejection and submission stay in append-only history (snapshot written first)");

  // 3. Resubmission returns the same Approval process to awaiting decision.
  check(normalizeApprovalStatus("draft", null) === "draft" && isAwaitingSubmission("draft"), "reopened row is a clean draft (submittedAt cleared, not healed)");
  for (const key of ["submittedAt", "submissionMethod", "submittedTo", "submissionReference", "lastFollowUpAt"]) {
    check(new RegExp(`\\b${key}: null,`).test(revise), `revise clears ${key}`);
  }
  for (const key of DECISION_KEYS) {
    check(new RegExp(`\\b${key}: null,`).test(revise), `revise clears decision field ${key}`);
  }
  check(getApprovalLifecycleActions("draft").canSubmit && getApprovalLifecycleActions("awaiting_decision").canRecordDecision, "draft → submit → decision");
  check(/status: "awaiting_decision",\s*submittedAt: payload\.submittedAt/.test(actions), "submit moves the same row to awaiting_decision");
  const approvalsSql = read("supabase/migrations/20260919180000_fm_approvals.sql");
  check(approvalsSql.includes("check (status not in ('awaiting_decision', 'approved', 'rejected') or submitted_at is not null)"), "DB permits a draft without submission");
  check(approvalsSql.includes("status not in ('approved', 'rejected')\n      or (decision_at is not null"), "DB permits a draft without decision fields");
  // Clearing is not deciding: the revise path may only NULL decision fields; record_decision stays the sole writer.
  const cleared = parseUpdateApprovalInput(
    { id: "APR-2026-000001", status: "draft", decisionOutcome: null, decisionAt: null, approvedByUserId: null },
    { allowDecision: false, clearDecision: true }
  );
  check(cleared.decisionOutcome === null && cleared.decisionAt === null && cleared.decidedByProfileId === null, "decision cleared to null");
  let wrote = true;
  try {
    parseUpdateApprovalInput({ id: "APR-2026-000001", decisionOutcome: "approved" }, { allowDecision: false, clearDecision: true });
  } catch {
    wrote = false;
  }
  check(!wrote, "the revise path cannot write a decision value");
  check(!/allowDecision:\s*true/.test(stripComments(revise)), "revise never uses the protected decision flag");
  out.push("PASS 3 revise → clean draft → submit returns the same Approval to awaiting decision → decided again");

  // 4. No second Approval is created.
  check(!/createApproval\(/.test(revise), "revise never creates an Approval");
  check(/updateApproval\(\s*id,/.test(revise), "revise updates the existing row");
  check(read("supabase/migrations/20260923160000_fm_job_order_approval_before_issue.sql").includes("fm_approvals_org_work_uidx"), "one Approval per Work (unique index retained)");
  check(read("src/modules/approvals/actions/requestWorkApproval.ts").includes("if (existing) return { approval: existing, created: false };"), "requesting again returns the same process");
  out.push("PASS 4 no second Approval: revise updates the one Work-level row; one-per-Work index retained");

  // 5. Execution stays blocked until the resubmitted Approval is granted and the Job Order exists.
  for (const status of ["rejected", "draft", "awaiting_decision", "returned"]) {
    for (const hasJobOrder of [false, true]) {
      check(jobOrderExecutionBlock({ route: "job_order", status: "in_progress", approvalStatus: status, hasJobOrder }) !== null, `${status} blocks execution`);
      check(jobOrderExecutionBlock({ route: "job_order", status: "completed", approvalStatus: status, hasJobOrder }) !== null, `${status} blocks completion`);
    }
    check(jobOrderIssueBlock({ route: "job_order", orderType: "job_order", approvalStatus: status }) !== null, `${status} blocks the Job Order`);
  }
  check(jobOrderExecutionBlock({ route: "job_order", status: "in_progress", approvalStatus: "approved", hasJobOrder: false }) !== null, "granted without Job Order still blocked");
  check(jobOrderExecutionBlock({ route: "job_order", status: "in_progress", approvalStatus: "approved", hasJobOrder: true }) === null, "granted + Job Order permits");
  out.push("PASS 5 during revision / resubmission execution and the Job Order stay blocked; granted + Job Order permits");

  // 6. Decided statuses cannot be left any other way; imported Approvals cannot be revised.
  check(approvalStatusChangeBlock({ from: "rejected", to: "draft", reopenRejected: false, isWorkLevel: true }) !== null, "generic edit cannot reopen a rejection");
  check(approvalStatusChangeBlock({ from: "rejected", to: "awaiting_decision", reopenRejected: true, isWorkLevel: true }) !== null, "reopen goes to draft only");
  check(approvalStatusChangeBlock({ from: "rejected", to: "rejected", reopenRejected: true, isWorkLevel: true }) !== null, "reopen must change the status");
  check(approvalStatusChangeBlock({ from: "approved", to: "draft", reopenRejected: true, isWorkLevel: true }) !== null, "approved is final");
  check(approvalStatusChangeBlock({ from: "approved", to: "awaiting_decision", reopenRejected: false, isWorkLevel: true }) !== null, "approved is final (generic)");
  check(approvalStatusChangeBlock({ from: "rejected", to: "cancelled", reopenRejected: false, isWorkLevel: true }) === null, "cancel after rejection unchanged");
  check(approvalStatusChangeBlock({ from: "awaiting_decision", to: "draft", reopenRejected: false, isWorkLevel: false }) === null, "undecided transitions unchanged");
  check(approvalStatusChangeBlock({ from: "rejected", to: "draft", reopenRejected: true, isWorkLevel: false }) !== null, "Work-less (imported / legacy) approvals are not revised here");
  out.push("PASS 6 only revise reopens a rejection; approved is final; Work-less (incl. the 27 imported) cannot be revised");

  // 7. requires_work_instruction: legacy only — never written for classified Work.
  const workRepo = read("src/modules/maintenance/server/FmWorkRepository.ts");
  check(workRepo.includes("...(input.commercialRoute ? {} : { requires_work_instruction: input.requiresWorkInstruction }),"), "create: not written for classified Work");
  check(workRepo.includes("if (input.requiresWorkInstruction !== undefined && !(input.commercialRoute ?? existing.commercial_route)) {"), "update: not written for classified Work");
  check(read("src/lib/operational/orchestration/index.ts").includes("const updated = maintenance.commercialRoute\n        ? maintenance"), "Work Instruction create no longer flips it on classified Work");
  check(!/requires_work_instruction|requiresWorkOrder|requiresWorkInstruction/.test(stripComments(read("src/modules/maintenance/commercialRoute.ts"))), "no workflow rule reads it");
  out.push("PASS 7 requires_work_instruction is legacy-only: no workflow rule reads it; classified Work never writes it");

  for (const line of out) console.log(line);
  console.log("verify-fm-approval-revise-resubmit: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
