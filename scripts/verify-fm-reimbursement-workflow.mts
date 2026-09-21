/**
 * FM Costs & Claims — client-reimbursement workflow (forward path). Pure: a fake repository stands in for the database.
 * Database invariants (state guards, cumulative authorization/payment ceilings, Work / Work Instruction FKs,
 * cross-tenant refusal) are proven separately by the rollback-only probe scripts/verify-fm-phase-2g-rollback.sql, which
 * leaves nothing behind.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-fm-reimbursement-workflow.mts
 */
import { readFileSync, readdirSync } from "node:fs";
import { FmCostServerService } from "../src/modules/finance/server/FmCostServerService";
import { FmCostProtectedRequiredError, FmCostValidationError } from "../src/modules/finance/server/fmCostDomain";
import { FACILITY_MANAGER_EXCLUDED, FACILITY_MANAGER_OPERATING_PACKAGE } from "../src/lib/access/facilityManagerPackage";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const out: string[] = [];
const pass = (m: string) => out.push(`PASS ${m}`);
const read = (f: string) => readFileSync(f, "utf8");
async function refuses(fn: () => Promise<unknown>, cls?: new (...a: never[]) => Error): Promise<boolean> {
  try { await fn(); return false; } catch (e) { return cls ? e instanceof cls : true; }
}

type Sub = { id: string; code: string; status: string; costs: string[] };
function fakeRepo() {
  const costs = new Map<string, { id: string; code: string; work_id?: string | null; work_instruction_id?: string | null }>();
  const subs = new Map<string, Sub>();
  const log: string[] = [];
  return {
    log, costs, subs,
    createCost: async (input: { workRef?: string | null; workInstructionRef?: string | null }) => { const id = `c${costs.size + 1}`; const row = { id, code: `COST-2099-00000${costs.size + 1}`, work_id: input.workRef ?? null, work_instruction_id: input.workInstructionRef ?? null }; costs.set(id, row); log.push("cost.create"); return row; },
    getCost: async (id: string) => costs.get(id) ?? null,
    lockingSubmissionCode: async (id: string) => [...subs.values()].find((s) => s.costs.includes(id) && s.status !== "cancelled")?.code ?? null,
    updateCost: async () => { log.push("cost.update"); return { id: "c1", code: "COST-2099-000001" }; },
    createSubmission: async (input: { status: string; costRefs: string[] }) => { const id = `s${subs.size + 1}`; const s = { id, code: `SUB-2099-00000${subs.size + 1}`, status: input.status, costs: input.costRefs }; subs.set(id, s); log.push("claim.create"); return s; },
    getSubmission: async (id: string) => subs.get(id) ?? null,
    submissionCostCount: async (id: string) => subs.get(id)?.costs.length ?? 0,
    updateSubmission: async (input: { id: string; status?: string }) => { const s = subs.get(input.id)!; if (input.status) s.status = input.status; log.push(`claim.update:${s.status}`); return s; },
    createAuthorization: async () => { log.push("auth.create"); return { row: { id: "a1", code: "AUTH-2099-000001", submission_id: "s1", authorized_amount: 100, currency: "NGN", authorized_at: new Date().toISOString() }, submissionCode: "SUB-2099-000001" }; },
    updateAuthorization: async () => { log.push("auth.revise"); return { row: { id: "a1", code: "AUTH-2099-000001", submission_id: "s1", authorized_amount: 90, currency: "NGN", authorized_at: new Date().toISOString() }, submissionCode: "SUB-2099-000001" }; },
    createPayment: async () => { log.push("payment.create"); return { row: { id: "p1", code: "PAY-2099-000001", submission_id: "s1", received_amount: 50, currency: "NGN", received_at: new Date().toISOString() }, submissionCode: "SUB-2099-000001" }; },
    updatePayment: async () => { log.push("payment.correct"); return { row: { id: "p1", code: "PAY-2099-000001", submission_id: "s1", received_amount: 40, currency: "NGN", received_at: new Date().toISOString() }, submissionCode: "SUB-2099-000001" }; },
  };
}

async function main() {
  // A. capability boundaries
  {
    const cap = (f: string) => ({ write: read(f).match(/writeCapability: "([a-z.]+)"/)?.[1], submit: read(f).match(/submitCapability: "([a-z.]+)"/)?.[1] });
    assert(cap("src/app/api/cost-records/route.ts").write === "finance.create", "record/edit a cost = finance.create");
    assert(cap("src/app/api/cost-submissions/route.ts").write === "finance.create" && cap("src/app/api/cost-submissions/route.ts").submit === "finance.submit", "draft a claim = finance.create; moving to submitted escalates to finance.submit");
    assert(cap("src/app/api/reimbursement-authorizations/route.ts").write === "finance.authorize", "record the client's authorization = finance.authorize");
    assert(cap("src/app/api/reimbursement-payments/route.ts").write === "finance.pay", "record a payment reference = finance.pay");
    const pkg = FACILITY_MANAGER_OPERATING_PACKAGE as readonly string[];
    assert(["finance.view", "finance.create", "finance.submit"].every((c) => pkg.includes(c)) && !pkg.includes("finance.authorize") && !pkg.includes("finance.pay"), "the Facility Manager package can record costs and claim, but holds NO authorization or payment authority");
    assert(["finance.authorize", "finance.pay", "fm.authorize_protected"].every((c) => FACILITY_MANAGER_EXCLUDED.some((e) => e.capability === c)), "authorize / pay / protected authority stay explicitly excluded (no permanent grant is needed to test)");
    pass("A capability boundaries: FM records + claims + submits; authorization and payment reference need their own explicit grants");
  }

  // B. forward workflow + state transitions + protected step-up + failure semantics (service layer, fake repo)
  {
    const repo = fakeRepo();
    const svc = new FmCostServerService({ organisationId: "o", profileId: "p" } as never);
    (svc as never as { repo: () => unknown }).repo = () => repo;
    (svc as never as { hydrateCosts: (r: unknown[]) => Promise<unknown[]> }).hydrateCosts = async (r) => r;
    (svc as never as { hydrateSubmissions: (r: unknown[]) => Promise<unknown[]> }).hydrateSubmissions = async (r) => r;
    const cost = { facilityId: "FAC-0001", location: "Annex", description: "Fuel filter", category: "spare_parts", actualAmount: 235000, reimbursability: "reimbursable", evidence: { reference: "INV-1" }, workId: "WRK-2026-000073", workOrderId: "WO-2026-000073" };
    const c = (await svc.createCost(cost)) as unknown as { id: string };
    assert(c.id === "c1" && repo.costs.get("c1")!.work_id === "WRK-2026-000073" && repo.costs.get("c1")!.work_instruction_id === "WO-2026-000073", "1 Cost → recorded with its Work / Work Instruction context carried through");
    assert(await refuses(() => svc.createCost({ ...cost, evidence: { reference: "" } }), FmCostValidationError) && await refuses(() => svc.createCost({ ...cost, actualAmount: -1 }), FmCostValidationError) && await refuses(() => svc.createCost({ ...cost, category: "bogus" }), FmCostValidationError), "failure semantics: blank evidence, negative amount and unknown category are refused with a validation error");
    const draft = (await svc.createSubmission({ costRecordIds: ["c1"], status: "draft" })) as { id: string };
    assert(repo.subs.get(draft.id)!.status === "draft", "2 Claim → created as a draft over the recorded cost");
    assert(await refuses(() => svc.createSubmission({ costRecordIds: [], status: "submitted" }), FmCostValidationError), "a claim with no costs cannot be submitted");
    await svc.updateSubmission({ id: draft.id, status: "submitted" });
    assert(repo.subs.get(draft.id)!.status === "submitted", "3 Submit → draft → submitted");
    assert(await refuses(() => svc.updateSubmission({ id: draft.id, status: "draft" }), FmCostValidationError), "a submitted claim cannot go back to draft");
    assert(await refuses(() => svc.updateSubmission({ id: draft.id, notes: "edit" }), FmCostProtectedRequiredError), "editing a submitted claim requires the protected step-up");
    await svc.updateSubmission({ id: draft.id, notes: "edit" }, { authorizedProtectedAction: "finance.claim.edit_submitted" });
    assert(await refuses(() => svc.updateCost({ id: "c1", description: "changed" }), FmCostProtectedRequiredError), "a cost locked by a claim cannot be edited without the protected step-up");
    await svc.updateCost({ id: "c1", description: "changed" }, { authorizedProtectedAction: "finance.cost.unlock_edit" });
    await svc.createAuthorization({ submissionId: "SUB-2099-000001", authorizedAmount: 100, authorityReference: "NCC/REF/1" });
    assert(await refuses(() => svc.createAuthorization({ submissionId: "s1", authorizedAmount: 0 }), FmCostValidationError), "4 Authorization → a zero / non-positive authorized amount is refused");
    assert(await refuses(() => svc.updateAuthorization({ id: "a1", authorizedAmount: 90 }), FmCostProtectedRequiredError), "revising an authorization requires the protected step-up");
    await svc.createPayment({ submissionId: "SUB-2099-000001", receivedAmount: 50, reference: "NCC-PAY-1" });
    assert(await refuses(() => svc.createPayment({ submissionId: "s1", receivedAmount: 0 }), FmCostValidationError), "5 Payment reference → zero is refused");
    assert(await refuses(() => svc.updatePayment({ id: "p1", receivedAmount: 40 }), FmCostProtectedRequiredError), "correcting a payment reference requires the protected step-up");
    assert(await refuses(() => svc.dispatch("cost-records", "delete", {}), undefined), "unknown actions are refused");
    assert(repo.log.join() === "cost.create,claim.create,claim.update:submitted,claim.update:submitted,cost.update,auth.create,payment.create", `expected write order, got ${repo.log.join()}`);
    pass("B workflow: Cost → Claim → Submit → Authorization → Payment reference; transitions, protected step-up and validation failures behave; Work/WI context carried");
  }

  // C. the database guards this workflow relies on
  {
    const mig = read("supabase/migrations/20260919200000_fm_costs.sql");
    assert(mig.includes("Payment exceeds outstanding authorized amount") && /received_amount > 0/.test(mig) && /authorized_amount > 0/.test(mig), "cumulative payment ≤ authorized (DB trigger) and positive-only amounts");
    assert(/unique[^;]*\(organisation_id, submission_id\)/.test(mig) && mig.includes("validate_fm_authorization_submission"), "one authorization per claim, only for a submitted claim (DB)");
    assert(/fm_cost_records_work_fk[\s\S]{0,200}fm_work/.test(mig) && /fm_cost_records_work_instruction_fk[\s\S]{0,220}fm_work_instructions/.test(mig), "Work / Work Instruction linkage is a tenant- and facility-scoped FK");
    assert(read("scripts/verify-fm-phase-2g-rollback.sql").includes("rollback;"), "the integrity probe is rollback-only (nothing left in production)");
    pass("C DB guards: ceilings, one-authorization-per-claim, submitted-only authorization, Work/WI FKs — proven by the rollback-only probe");
  }

  // D. payment-reference semantics: FM's operational reference; Platform Finance owns the receipt/accounting transaction
  {
    const mig = read("supabase/migrations/20260919200000_fm_costs.sql");
    const payments = mig.slice(mig.indexOf("create table public.fm_reimbursement_payments"), mig.indexOf(");", mig.indexOf("create table public.fm_reimbursement_payments")));
    assert(!/references public\.finance_/.test(payments) && !/(account|journal|ledger|posting|transaction)_?(id|ref)/i.test(payments), "the FM payment record holds no ledger / account / posting linkage");
    assert(/Not a treasury\/ledger posting/.test(mig), "documented as not a treasury / ledger posting");
    const detail = read("src/modules/finance/components/SubmissionDetailPage.tsx");
    assert(/recorded in Platform Finance/.test(detail) && /Record payment reference/.test(detail) && !/>\s*Record payment\s*</.test(detail), "the UI presents the payment as a reference and points to Platform Finance for the actual receipt");
    const financeSrc = ["src/modules/finance/server/FmCostServerService.ts", "src/modules/finance/server/FmCostRepository.ts"].map(read).join("\n");
    assert(!/platform-finance|platform_finance/.test(financeSrc), "the FM cost service has no Platform Finance dependency (no new integration)");
    pass("D payment reference: the existing model is valid — an operational reference with no accounting linkage; Platform Finance untouched");
  }

  // E. terminology + zero-state truthfulness in the live UI
  {
    const dir = "src/modules/finance/components/";
    const live = ["CostRecordFormModal", "FinanceHeader", "FinancePositionSection", "FinanceOperationalCostSection", "FinanceSubmissionsSection", "CostRecordsPage", "SubmissionsPage", "SubmissionDetailPage", "FinanceFlowRail"].map((n) => read(`${dir}${n}.tsx`)).join("\n");
    const form = read(`${dir}CostRecordFormModal.tsx`);
    assert(/Reimbursement eligibility/.test(form) && /Related Work \/ Work Instruction/.test(form) && !/Cost category \(reimbursement\)|work classification/.test(form), "cost form: eligibility and Work / Work Instruction wording");
    assert(!/employee|vendor|staff reimbursement/i.test(live), "no wording suggests employee / vendor reimbursement");
    assert(/Work Order approvals/.test(read(`${dir}FinanceHeader.tsx`)) && /Work Order approvals/.test(read(`${dir}FinancePositionSection.tsx`)) && !/Client authorisations<|>Client authorisations/.test(read(`${dir}FinancePositionSection.tsx`)), "Work Order approvals are no longer called client authorisations");
    assert(/reimbursement authorisation|Reimbursement authorisation/i.test(read(`${dir}SubmissionDetailPage.tsx`) + read(`${dir}FinanceFlowRail.tsx`)), "'authorisation' now means the client's authorisation of a claim");
    for (const n of ["FinanceHeader", "FinanceOperationalCostSection", "FinanceSubmissionsSection", "CostRecordsPage", "SubmissionsPage"]) assert(/SentraCore™/.test(read(`${dir}${n}.tsx`)), `${n}: empty/zero state says it is the SentraCore™ record`);
    assert(/not that none were incurred/.test(read(`${dir}FinanceHeader.tsx`)) && /Historical costs are not loaded/.test(read(`${dir}FinanceOperationalCostSection.tsx`)), "zero never implies no historical costs exist");
    assert(/earlier history is not loaded/.test(read("src/modules/workspace/components/FinancialPositionSection.tsx")), "FM Home financial position carries the same disclosure");
    void readdirSync;
    pass("E UI truthfulness: client-reimbursement terminology; zero = 'none recorded in SentraCore™ yet', never 'none incurred'");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}
main().catch((e) => { process.stderr.write("FAIL " + (e instanceof Error ? e.stack : String(e)) + "\n"); process.exit(1); });
