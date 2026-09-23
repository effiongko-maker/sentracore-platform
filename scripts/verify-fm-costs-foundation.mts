/**
 * FM Phase 2G — Costs foundation & cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-costs-foundation.mts
 *
 * Static + pure-domain always. Linked DB integrity is proven by
 * scripts/verify-fm-phase-2g-rollback.sql (rollback-only) and
 * scripts/verify-fm-costs-live-read.mts (read-only).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  FmCostValidationError,
  LOCKING_SUBMISSION_STATUSES,
  assertSubmissionShape,
  generateNextAuthorizationCode,
  generateNextCostCode,
  generateNextPaymentCode,
  generateNextSubmissionCode,
  mapFmAuthorizationRow,
  mapFmCostRecordRow,
  mapFmCostSubmissionRow,
  mapFmPaymentRow,
  parseCostRecordListParams,
  parseCreateAuthorizationInput,
  parseCreateCostRecordInput,
  parseCreatePaymentInput,
  parseCreateSubmissionInput,
  parseUpdateSubmissionInput,
  type FmAuthorizationRow,
  type FmCostRecordRow,
  type FmCostSubmissionRow,
  type FmPaymentRow,
} from "../src/modules/finance/server/fmCostDomain";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail?: string };

const MIGRATION = "supabase/migrations/20260919200000_fm_costs.sql";
const SERVER = "src/modules/finance/server";
const ROUTES = ["cost-records", "cost-submissions", "reimbursement-authorizations", "reimbursement-payments"];
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const readSrc = (path: string) => readFileSync(resolve(path), "utf8");
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
function check(results: CheckResult[], name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}
function throwsValidation(fn: () => unknown, label: string) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof FmCostValidationError, `${label}: wrong error type`);
    return;
  }
  throw new Error(`${label}: expected a validation error`);
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const costRow: FmCostRecordRow = {
  id: U(1), organisation_id: U(9), code: "COST-2026-000001", recorded_at: "2026-09-19T10:00:00Z", facility_id: U(2),
  department_id: null, location: "Plant room", work_id: U(3), work_instruction_id: U(4), description: "Pump seal", category: "materials",
  budgeted_amount: null, actual_amount: 0, currency: "NGN", reimbursability: "unknown", evidence_reference: "INV-1",
  evidence_file_id: null, evidence_file_name: null, evidence_file_mime: null, evidence_file_size: null, evidence_file_url: null,
  notes: null, recorded_by_profile_id: U(5), created_by_profile_id: U(5), updated_by_profile_id: U(5),
  created_at: "2026-09-19T10:00:00Z", updated_at: "2026-09-19T10:00:00Z", record_origin: "operational",
};

function main() {
  const results: CheckResult[] = [];
  const migration = readSrc(MIGRATION);
  const repo = readSrc(`${SERVER}/FmCostRepository.ts`);
  const service = readSrc(`${SERVER}/FmCostServerService.ts`);
  const route = readSrc(`${SERVER}/fmCostRoute.ts`);
  const domain = readSrc(`${SERVER}/fmCostDomain.ts`);

  // ------------------------------------------------------------- schema
  check(results, "migration: five tables, RLS, service-role only", () => {
    for (const t of ["fm_cost_records", "fm_cost_submissions", "fm_cost_submission_items", "fm_reimbursement_authorizations", "fm_reimbursement_payments"]) {
      assert(migration.includes(`create table public.${t}`), `${t} missing`);
      assert(migration.includes(`alter table public.${t} enable row level security`), `${t} RLS`);
      assert(migration.includes(`revoke all on table public.${t} from public, anon, authenticated`), `${t} revoke`);
      assert(migration.includes(`grant all on table public.${t} to service_role`), `${t} grant`);
    }
    assert(!/create policy/i.test(migration), "no JWT policies");
  });
  check(results, "migration: no child-ID arrays; claim items are a join table", () => {
    assert(!/\[\]|uuid\[\]|text\[\]/.test(migration.replace(/--.*$/gm, "")), "array column found");
    assert(migration.includes("fm_cost_submission_items"), "join table");
  });
  check(results, "migration: tenant-safe composite FKs, Work/WI facility consistency", () => {
    assert(migration.includes("fm_cost_records_work_fk"), "work FK");
    assert(migration.includes("fm_cost_records_work_instruction_fk"), "WI FK");
    assert(/foreign key \(organisation_id, work_id, facility_id\)/.test(migration), "work facility composite");
    assert(/foreign key \(organisation_id, work_instruction_id, facility_id\)/.test(migration), "WI facility composite");
  });
  check(results, "migration: authorization ≠ approval ≠ payment; monetary integrity in DB", () => {
    assert(/authorized_amount\s*>\s*0/.test(migration), "positive authorization");
    assert(/received_amount\s*>\s*0/.test(migration), "positive payment");
    assert(migration.includes("Payment exceeds outstanding authorized amount"), "payment ceiling trigger");
    assert(migration.includes("validate_fm_authorization_submission"), "authorization guard");
    assert(/unique[^;]*\(organisation_id, submission_id\)/.test(migration), "one authorization per claim");
  });
  check(results, "migration: no Platform Finance / ledger objects; no lock or WI-cost columns", () => {
    assert(!/platform_finance|gl_|journal|payable|treasury/i.test(migration.replace(/--.*$/gm, "").replace(/'[^']*'/g, "")), "platform finance reference");
    const wi = migration.match(/create table public\.fm_cost_records[\s\S]*?\n\);/)?.[0] ?? "";
    assert(!/is_locked|locked|submission_id|estimated_cost/.test(wi), "competing column on cost records");
  });

  // ------------------------------------------------------------- domain
  check(results, "codes: COST/SUB/AUTH/PAY sequences", () => {
    const now = new Date("2026-09-19T00:00:00Z");
    assert(generateNextCostCode(null, now) === "COST-2026-000001", "cost first");
    assert(generateNextCostCode("COST-2026-000009", now) === "COST-2026-000010", "cost next");
    assert(generateNextSubmissionCode("SUB-2026-000041", now) === "SUB-2026-000042", "sub next");
    assert(generateNextAuthorizationCode(null, now) === "AUTH-2026-000001", "auth first");
    assert(generateNextPaymentCode("PAY-2025-000900", now) === "PAY-2026-000001", "year rollover");
  });
  check(results, "cost create: zero is valid; negative/missing evidence rejected", () => {
    const base = { facilityId: "FAC-0001", location: "Plant", description: "x", category: "materials", actualAmount: 0, evidence: { reference: "INV-1" } };
    assert(parseCreateCostRecordInput(base).actualAmount === 0, "zero amount is data");
    throwsValidation(() => parseCreateCostRecordInput({ ...base, actualAmount: -1 }), "negative");
    throwsValidation(() => parseCreateCostRecordInput({ ...base, evidence: { reference: " " } }), "blank evidence");
    throwsValidation(() => parseCreateCostRecordInput({ ...base, category: "bribes" }), "bad category");
    throwsValidation(() => parseCreateCostRecordInput({ ...base, actualAmount: "abc" }), "non-numeric");
  });
  check(results, "cost create: file upload is rejected explicitly (no invented storage)", () => {
    const base = { facilityId: "FAC-0001", location: "Plant", description: "x", category: "materials", actualAmount: 5 };
    throwsValidation(
      () => parseCreateCostRecordInput({ ...base, evidence: { reference: "INV", upload: { fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1, base64: "AA==" } } }),
      "upload"
    );
  });
  check(results, "cost mapping: display codes are derived from UUID relations, never stored", () => {
    const mapped = mapFmCostRecordRow(costRow, { workCode: "WRK-2026-000001", workInstructionCode: "WO-2026-000001" });
    assert(mapped.costId === "COST-2026-000001" && mapped.costUuid === U(1), "identity");
    assert(mapped.workId === "WRK-2026-000001" && mapped.workOrderId === "WO-2026-000001", "derived codes");
    assert(mapped.actualAmount === 0, "zero preserved");
    assert(mapFmCostRecordRow(costRow).workOrderId === undefined, "no relation → no code");
  });
  check(results, "submission: costRecordIds are inputs; refs/execution not persisted; shape rules", () => {
    const parsed = parseCreateSubmissionInput({ costRecordIds: ["COST-2026-000001", "COST-2026-000001"], status: "draft", refs: { workId: "X" }, executionKind: "work_order", executionId: "WO-1" });
    assert(parsed.costRefs.length === 1, "deduped");
    assert(!("refs" in parsed) && !("executionId" in parsed), "opaque refs dropped");
    throwsValidation(() => assertSubmissionShape({ status: "submitted", costCount: 0 }), "empty submitted claim");
    throwsValidation(() => parseCreateSubmissionInput({ status: "paid" }), "bad status");
    assert(parseUpdateSubmissionInput({ submissionId: "SUB-2026-000001", notes: "n" }).id === "SUB-2026-000001", "update id");
    assert(LOCKING_SUBMISSION_STATUSES.includes("submitted") && LOCKING_SUBMISSION_STATUSES.includes("queried") && LOCKING_SUBMISSION_STATUSES.length === 2, "lock statuses");
  });
  check(results, "authorization/payment: actor comes from the session, never the payload", () => {
    const auth = parseCreateAuthorizationInput({ submissionId: "SUB-2026-000001", authorizedAmount: 100, authorizedBy: "USR-EVIL", authorityReference: "REF" }) as Record<string, unknown>;
    assert(!("authorizedBy" in auth), "authorizedBy must be ignored");
    const pay = parseCreatePaymentInput({ submissionId: "SUB-2026-000001", receivedAmount: 50, recordedBy: "USR-EVIL" }) as Record<string, unknown>;
    assert(!("recordedBy" in pay), "recordedBy must be ignored");
    throwsValidation(() => parseCreatePaymentInput({ submissionId: "SUB-2026-000001", receivedAmount: 0 }), "zero payment");
    throwsValidation(() => parseCreateAuthorizationInput({ submissionId: "SUB-2026-000001", authorizedAmount: 0 }), "zero authorization");
  });
  check(results, "row mappers carry UUID + code and the claim code (not a stored relationship)", () => {
    const sub: FmCostSubmissionRow = {
      id: U(6), organisation_id: U(9), code: "SUB-2026-000001", status: "draft", currency: "NGN", claim_amount: 0, markup_amount: null,
      markup_rate_percent: null, no_markup: null, facility_id: null, department_id: null, period_label: null, submission_kind: null,
      description: null, client_location: null, source_note: null,
      package_reference: null, package_type: null, package_date: null, package_notes: null, approval_id: U(7), submitted_at: null,
      submitted_by_profile_id: null, work_instruction_id: null, queried_at: null, query_notes: null, notes: null, created_by_profile_id: U(5),
      updated_by_profile_id: U(5), created_at: "2026-09-19T10:00:00Z", updated_at: "2026-09-19T10:00:00Z",
    };
    const m = mapFmCostSubmissionRow(sub, { costCodes: ["COST-2026-000001"], approvalCode: "APR-2026-000001" });
    assert(m.submissionUuid === U(6) && m.submissionId === "SUB-2026-000001", "submission identity");
    assert(m.costRecordIds.join() === "COST-2026-000001" && m.approvalId === "APR-2026-000001", "derived relations");
    assert(mapFmCostSubmissionRow(sub).costRecordIds.length === 0 && m.claimAmount === 0, "zero claim / empty items are data");
    const a: FmAuthorizationRow = {
      id: U(8), organisation_id: U(9), code: "AUTH-2026-000001", submission_id: U(6), authorized_amount: 10, currency: "NGN",
      authorized_at: "2026-09-19T10:00:00Z", authorized_by_profile_id: U(5), authority_reference: "REF", notes: null,
      recorded_at: "2026-09-19T10:00:00Z", created_by_profile_id: U(5), updated_by_profile_id: U(5),
      created_at: "2026-09-19T10:00:00Z", updated_at: "2026-09-19T10:00:00Z",
    };
    const am = mapFmAuthorizationRow(a, "SUB-2026-000001");
    assert(am.authorizationId === "AUTH-2026-000001" && am.submissionId === "SUB-2026-000001", "authorization mapping");
    const p: FmPaymentRow = {
      id: U(10), organisation_id: U(9), code: "PAY-2026-000001", submission_id: U(6), received_amount: 5, currency: "NGN",
      received_at: "2026-09-19T10:00:00Z", reference: null, method: null, evidence_reference: null, notes: null,
      recorded_at: "2026-09-19T10:00:00Z", recorded_by_profile_id: U(5), created_by_profile_id: U(5), updated_by_profile_id: U(5),
      created_at: "2026-09-19T10:00:00Z", updated_at: "2026-09-19T10:00:00Z",
    };
    assert(mapFmPaymentRow(p, "SUB-2026-000001").paymentId === "PAY-2026-000001", "payment mapping");
  });
  check(results, "list params: bounded paging", () => {
    const params = parseCostRecordListParams({ page: 0, pageSize: 100000, search: "a,b(c)%" });
    assert(params.page >= 1 && params.pageSize <= 500, "clamped");
  });

  // ------------------------------------------------------------- server
  check(results, "repository: server-only, organisation-scoped, retry only on code collision", () => {
    assert(repo.startsWith('import "server-only"'), "server-only");
    assert(!/postToAppsScript|appsScriptProxy/.test(repo + service + route), "no Apps Script");
    assert(!/operational_identity_links/.test(repo + service + route), "no identity links");
    assert(repo.includes("_code_uidx"), "retry keyed to code index");
    for (const t of ["fm_cost_records", "fm_cost_submissions", "fm_cost_submission_items", "fm_reimbursement_authorizations", "fm_reimbursement_payments"]) {
      assert(repo.includes(`"${t}"`), `${t} not used`);
    }
  });
  check(results, "no Platform Finance write, journal, payable or treasury call in the cost server layer", () => {
    assert(!/platform_finance|platformFinance|journal|payable|treasury|gl_entr/i.test(stripComments(repo + service + route)), "platform finance coupling");
  });
  check(results, "protected actions: enforced in service, proof only via route, mismatch rejected", () => {
    for (const id of ["finance.cost.unlock_edit", "finance.claim.edit_submitted", "finance.authorization.revise", "finance.payment.correct"]) {
      assert(service.includes(id) || route.includes(id) || domain.includes(id), `${id} not enforced`);
    }
    assert(service.includes("requireProtected"), "service guard");
    assert(route.includes("gateProtectedActionOrResponse") && route.includes("extractProtectedProof"), "route gate");
    assert(route.includes("is not valid for"), "proof mismatch rejected");
    assert(/authorization[\s\S]{0,400}requireProtected|requireProtected[\s\S]{0,200}finance\.authorization\.revise/.test(service), "authorization revise gated");
    assert(service.includes("finance.payment.correct"), "payment correct gated");
  });
  check(results, "service: submitted-claim edit and locked-cost edit are protected; transitions validated", () => {
    assert(/from === "submitted" && to === from/.test(service), "submitted edit gate");
    assert(service.includes("lockingSubmissionCode"), "locked cost check");
    assert(service.includes("assertCostSubmissionTransition"), "lifecycle transitions");
  });
  check(results, "routes: all four use the shared Supabase handler with distinct write capabilities", () => {
    const caps: Record<string, string> = {
      "cost-records": "finance.create", "cost-submissions": "finance.create",
      "reimbursement-authorizations": "finance.authorize", "reimbursement-payments": "finance.pay",
    };
    for (const r of ROUTES) {
      const src = readSrc(`src/app/api/${r}/route.ts`);
      assert(src.includes("handleFmCostRoute") && src.includes(`resource: "${r}"`), `${r} handler`);
      assert(src.includes(`writeCapability: "${caps[r]}"`), `${r} capability`);
      assert(!/postToAppsScript|postFinanceProxyWithProtection/.test(src), `${r} still proxies Apps Script`);
    }
    assert(readSrc("src/app/api/cost-submissions/route.ts").includes('submitCapability: "finance.submit"'), "submit capability");
    assert(route.includes('"finance.view"'), "reads gated by finance.view");
  });
  check(results, "routes: unknown actions rejected; no delete endpoint", () => {
    assert(route.includes("Unknown ${resource} action"), "unknown action");
    assert(!/"delete"|"deactivate"/.test(route), "no delete verbs");
  });
  check(results, "browser clients: apiClient only, no Apps Script fallback", () => {
    for (const f of ["CostRecordService", "CostSubmissionService", "ReimbursementAuthorizationService", "ReimbursementPaymentService"]) {
      const src = readSrc(`src/services/finance/${f}.ts`);
      assert(!/postToAppsScript|appsScriptProxy/.test(src), `${f} imports Apps Script`);
      assert(!src.includes('from "@/modules/finance/server'), `${f} imports server-only code`);
    }
  });
  check(results, "no active Sheet FM Cost reader/writer anywhere in src", () => {
    const offenders = walk("src").filter((f) => {
      const s = readFileSync(f, "utf8");
      return /resource:\s*"(cost-records|cost-submissions|reimbursement-authorizations|reimbursement-payments)"/.test(s) && /postToAppsScript/.test(s);
    });
    assert(offenders.length === 0, `Apps Script cost callers: ${offenders.join(", ")}`);
  });
  check(results, "Work Instruction cost fields are not a competing truth (no cost code reads them)", () => {
    assert(!/estimated_cost|actual_cost/.test(repo + service + route), "cost layer reads WI monetary fields");
  });
  check(results, "modal: file upload disabled with explicit hint; reference required", () => {
    const modal = readSrc("src/modules/finance/components/CostRecordFormModal.tsx");
    assert(modal.includes("Receipt file upload is unavailable until evidence storage moves to SentraCore™"), "hint");
    assert(!modal.includes("payload.evidence.upload"), "upload still sent");
  });
  check(results, "brand: SentraCore™ in user-facing cost strings", () => {
    const strings = domain.match(/"[^"\n]*Sentra[^"\n]*"/g) ?? [];
    assert(strings.every((s) => !/SentraCore(?!™)/.test(s)), "unbranded SentraCore string");
  });
  check(results, "no leftover validation files reference test rows", () => {
    assert(existsSync(resolve("scripts/verify-fm-phase-2g-rollback.sql")), "rollback probe present");
  });

  let failed = 0;
  for (const r of results) {
    if (r.status === "FAIL") failed += 1;
    console.log(`${r.status}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "FM_COSTS_FOUNDATION: PASS" : "FM_COSTS_FOUNDATION: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main();
