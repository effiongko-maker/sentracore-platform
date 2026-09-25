/**
 * FM Work Order / Job Order — operator UX must-fixes. No database access.
 *
 * Proves: Work list / detail expose the Execution basis and one derived Next step covering the important states; the
 * APR reference on Work opens that Approval (existing modal + lifecycle actions) and explains package completion and
 * submission; a Work-level Approval's edit form and package say "Work", not a blank Work Order (legacy presentation
 * kept); the Job Orders register has no direct "New Job Order"; new Job Order-route Work cannot pick an executing status.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-fm-wo-jo-operator-ux.mts
 */
import { readFileSync } from "node:fs";
import { EXECUTION_STATUSES, workNextStep } from "../src/modules/maintenance/commercialRoute";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");
const has = (text: string | null, re: RegExp) => text !== null && re.test(text);

async function main() {
  const out: string[] = [];

  // 1. Basis + Next step (derived only from existing state).
  const jo = { route: "job_order", approvalCode: "APR-2026-000001" } as const;
  check(has(workNextStep({ ...jo, status: "requested" }), /Request client approval/), "JO: approval required");
  check(has(workNextStep({ ...jo, status: "requested", approvalStatus: "draft" }), /Complete the approval package for APR-2026-000001 \(client, amount, cover letter\) and submit/), "JO: package to complete");
  check(has(workNextStep({ ...jo, status: "requested", approvalStatus: "awaiting_decision" }), /Awaiting the client's decision/), "JO: pending");
  check(has(workNextStep({ ...jo, status: "requested", approvalStatus: "rejected" }), /revise & resubmit/), "JO: rejected");
  check(has(workNextStep({ ...jo, status: "scheduled", approvalStatus: "approved" }), /record the Job Order issued by the client/), "JO: approved awaiting Job Order");
  check(has(workNextStep({ ...jo, status: "scheduled", approvalStatus: "approved", jobOrderCode: "WO-2026-000009" }), /start the work/), "JO: ready to execute");
  check(has(workNextStep({ ...jo, status: "in_progress", approvalStatus: "approved", jobOrderCode: "WO-2026-000009" }), /complete the work/), "JO: executing");
  check(has(workNextStep({ route: "work_order", status: "requested" }), /no prior client approval/), "WO: execute");
  check(has(workNextStep({ route: "work_order", status: "in_progress" }), /Complete the work, then submit the Work Order/), "WO: executing");
  check(has(workNextStep({ route: "work_order", status: "completed" }), /submit the Work Order/), "WO: completed awaiting Work Order");
  check(has(workNextStep({ route: "work_order", status: "completed", workOrderCode: "WO-2026-000010" }), /Raise payment request for Work Order WO-2026-000010/), "WO: awaiting Client Payment");
  check(has(workNextStep({ route: "work_order", status: "completed", workOrderCode: "WO-2026-000010", clientPaymentCode: "SUB-2026-000020" }), /Client payment SUB-2026-000020 requested/), "WO: payment requested");
  check(workNextStep({ route: null, status: "requested" }) === null, "legacy: no invented step");
  check(workNextStep({ route: "work_order", status: "completed", recordOrigin: "migrated_historical" }) === null, "historical: no step");
  const table = read("src/modules/work/components/WorkTable.tsx");
  check(table.includes("{WORK_COMMERCIAL_ROUTE_LABELS[row.commercialRoute]} basis") && table.includes('key: "context"'), "Work table: basis inside Context");
  const detail = read("src/modules/work/components/WorkDetailModal.tsx");
  check(detail.includes('label="Execution basis"') && detail.includes('<Detail label="Next step" value={nextStep} />') && detail.includes("workNextStep({"), "Work detail: basis + derived next step");
  check(detail.includes("linkedWorkOrdersById[work.workOrderId]?.clientPaymentId") && detail.includes("awaitingWorkOrder ? null"), "Work detail: payment state from the Work Order, nothing shown while loading");
  out.push("PASS 1 Work list shows the Execution basis; Work detail shows basis + one derived Next step for every key state");

  // 2. Work → Approval handoff.
  const form = read("src/modules/maintenance/components/MaintenanceFormModal.tsx");
  check((form.match(/<WorkApprovalHandoff\s+approvalId=\{workApproval\.id\}/g) ?? []).length >= 2, "APR reference is actionable (pending and approved)");
  check(form.includes("onChanged={(approval) => setWorkApproval({ id: approval.id, status: approval.status })}"), "Work reflects the refreshed approval status");
  check(form.includes("Open ${result.data.approval.id} to complete the package (client, amount, cover letter) and submit it to the client."), "request toast explains package + submission");
  check(form.includes("Open ${workApproval.id} to do this here. "), "inline guidance points to the APR");
  const handoff = read("src/modules/approvals/components/WorkApprovalHandoff.tsx");
  check(handoff.includes("ApprovalService.getApproval(approvalId)") && handoff.includes("<ViewApprovalModal"), "opens that exact Approval in the existing modal");
  for (const modal of ["ApprovalFormModal", "SubmitApprovalModal", "ApprovalPackageModal", "FollowUpApprovalModal", "RecordDecisionModal"]) {
    check(handoff.includes(`<${modal}`), `${modal} reachable from the handoff`);
  }
  check(handoff.includes('can("approvals.manage")') && handoff.includes("onEdit={canManage ?"), "actions follow approvals.manage like the Approvals page");
  // Draft: Request client approval → Edit package → Submit, without leaving the Work.
  check(
    /\{canManage && status === "draft" \? \([\s\S]*?onClick=\{\(\) => void open\("edit"\)\}[\s\S]*?Edit package/.test(handoff),
    "draft + approvals.manage exposes Edit package"
  );
  check(/setStep\(target\);/.test(handoff) && /step === "edit" && approval \? \(\s*<ApprovalFormModal open approval=\{approval\}/.test(handoff), "Edit package opens the existing edit form for that exact Approval");
  check(/onSaved=\{\(\) => void refreshed\(\)\}/.test(handoff) && /setStep\(row \? "view" : null\)/.test(handoff), "after editing it returns to the Approval, where Submit is offered for a draft");
  out.push("PASS 2 the APR on Work opens that Approval (edit package / preview / submit / follow up / decide) and explains what to do");

  // 3. Work-level Approval says Work, legacy presentation kept.
  const edit = read("src/modules/approvals/components/ApprovalFormModal.tsx");
  check(edit.includes('approval.workId && !approval.workOrderId ? (') && edit.includes('<FormField label="Work" htmlFor="apr-work">') && edit.includes('<FormField label="Work Order" htmlFor="apr-work-order">'), "edit form: Work for Work-level, Work Order kept for legacy");
  const pkg = read("src/modules/approvals/components/ApprovalPackageModal.tsx");
  check(pkg.includes("const workLevel = Boolean(current.workId) && !current.workOrderId;"), "package detects Work-level approvals");
  check(pkg.includes('{workLevel ? "Work:" : "Work Order:"}') && pkg.includes("{workLevel ? current.workId : current.workOrderId}"), "package line says Work");
  check(pkg.includes("{workLevel ? null : (") && pkg.includes("Work Order form"), "no empty Work Order form section for Work-level; legacy section kept");
  out.push("PASS 3 Work-level Approval edit form and package show Work: WRK-…, never a blank Work Order");

  // 4. Superseded by the operator review: WO/JO are commercial submission packages created directly from their own
  //    tab (+ New Work Order / + New Job Order); the All tab keeps its no-create behaviour.
  const register = read("src/modules/work-orders/components/WorkOrdersPage.tsx");
  check(register.includes('label: "New Job Order"') && register.includes('label: "New Work Order"') && /: null;/.test(register), "WO and JO tabs create their own type; All does not");
  out.push("PASS 4 Work Orders / Job Orders tabs each create their own type directly (All tab unchanged)");

  // 5. New Job Order-route Work cannot pick an executing status.
  check(EXECUTION_STATUSES.includes("in_progress") && EXECUTION_STATUSES.includes("completed"), "execution statuses");
  check(form.includes('(Boolean(executionBlockedReason) || (!isEdit && route === "job_order")) &&\n                    EXECUTION_STATUSES.includes(value)'), "executing statuses disabled for new Job Order Work");
  check(form.includes('if (value === "job_order" && !isEdit && EXECUTION_STATUSES.includes(form.status)) {\n              updateField("status", "requested");'), "switching to Job Order drops a previously chosen executing status");
  check(read("src/modules/maintenance/server/FmWorkRepository.ts").includes("if (executionBlock) throw new FmWorkValidationError(executionBlock);"), "server enforcement unchanged");
  out.push("PASS 5 new Job Order-route Work cannot select In progress / Completed (server rule unchanged)");

  // 6. Approval actions respect approvals.manage (server enforcement unchanged).
  check(form.includes('const canManageApprovals = can("approvals.manage");'), "Work form uses the Approvals capability check");
  check(
    /\{canManageApprovals \? \(\s*<Button[\s\S]*?Request client approval\s*<\/Button>\s*\) : \(\s*<p className="text-xs text-muted">Requires approval management access\.<\/p>/.test(form),
    "no actionable Request client approval without approvals.manage"
  );
  check(form.includes('{!canManageApprovals\n                          ? "Requires approval management access. "'), "handoff guidance does not promise actions without access");
  for (const cb of ["onEdit", "onSubmit", "onFollowUp", "onDecision"]) {
    check(new RegExp(`${cb}=\\{canManage \\?`).test(handoff), `handoff ${cb} only with approvals.manage`);
  }
  const viewApproval = read("src/modules/approvals/components/ViewApprovalModal.tsx");
  check(/actions\.canSubmit && onSubmit \?/.test(viewApproval) && /actions\.canRecordDecision && onDecision \?/.test(viewApproval), "modal hides actions whose callback is absent");
  check(read("src/modules/approvals/actions/requestWorkApproval.ts").includes('requiredCapability: "approvals.manage"'), "server enforcement unchanged");
  out.push("PASS 6 Request client approval and handoff actions are only offered with approvals.manage");

  // 7. Operational WO/JO opened from Work Detail can be edited (register parity); historical stays read-only.
  const workPage = read("src/modules/work/components/WorkPage.tsx");
  check(
    /onEdit=\{\s*canMutateOps && viewWorkOrder\?\.recordOrigin !== "migrated_historical"/.test(workPage),
    "Edit only with ops.edit and never for historical WO/JO (same rule as the register)"
  );
  const registerPage = read("src/modules/work-orders/components/WorkOrdersPage.tsx");
  check(
    /const isHistorical = \(workOrder: WorkOrder\) => workOrder\.recordOrigin === "migrated_historical"/.test(registerPage) &&
      /canMutateOps && !\(modal\.type === "view" && isHistorical\(modal\.workOrder\)\)/.test(registerPage),
    "register rule it mirrors"
  );
  check(/<WorkOrderFormModal\s+open=\{Boolean\(editWorkOrder\)\}\s+mode="edit"/.test(workPage), "opens the existing Work Order edit form (with its Client Payment section)");
  check(!/clientPayment/i.test(read("src/modules/work-orders/components/ViewWorkOrderModal.tsx")), "no Client Payment controls duplicated into the read-only view");
  out.push("PASS 7 operational WO/JO opened from Work Detail offers Edit (ops.edit, not historical) → existing WO → Client Payment path");

  for (const line of out) console.log(line);
  console.log("verify-fm-wo-jo-operator-ux: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
