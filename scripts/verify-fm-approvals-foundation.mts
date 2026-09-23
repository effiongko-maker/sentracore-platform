/**
 * FM Phase 2F — Approvals foundation & cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-approvals-foundation.mts
 *
 * Static + pure-domain always. Linked DB integrity is proven by
 * scripts/verify-fm-phase-2f-rollback.sql (rollback-only) and
 * scripts/verify-fm-approvals-live-read.mts (read-only).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  generateNextApprovalCode,
  mapFmApprovalRowToApproval,
  parseApprovalActivity,
  parseApprovalListParams,
  parseApprovalStatus,
  parseCreateApprovalInput,
  parseUpdateApprovalInput,
  summarizeApprovalOperationalPicture,
  type FmApprovalRow,
} from "../src/modules/approvals/server/fmApprovalDomain";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail?: string };

const MIGRATION = "supabase/migrations/20260919180000_fm_approvals.sql";
const PROFILE = "33333333-3333-4333-8333-333333333333";
const FAC = "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0";

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
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function sampleRow(overrides: Partial<FmApprovalRow> = {}): FmApprovalRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "22222222-2222-4222-8222-222222222222",
    code: "APR-2026-000001",
    work_instruction_id: "55555555-5555-4555-8555-555555555555",
    title: "Approval for pump",
    approval_type: "standard_maintenance",
    status: "draft",
    description: null,
    reason: null,
    cover_letter: null,
    template_id: null,
    client_name: null,
    client_address: null,
    approval_amount: null,
    approved_amount: null,
    currency: null,
    requested_by_profile_id: null,
    decided_by_profile_id: null,
    generated_at: null,
    submitted_at: null,
    decision_at: null,
    decision_notes: null,
    decision_outcome: null,
    decision_reference: null,
    expires_at: null,
    submission_method: null,
    submitted_to: null,
    submission_reference: null,
    acknowledgement_file_name: null,
    acknowledgement_file_mime: null,
    acknowledgement_file_size: null,
    decision_document_file_name: null,
    decision_document_file_mime: null,
    decision_document_file_size: null,
    last_follow_up_at: null,
    source_note: null,
    created_by_profile_id: null,
    updated_by_profile_id: null,
    created_at: "2026-09-19T00:00:00.000Z",
    updated_at: "2026-09-19T00:00:00.000Z",
    ...overrides,
  };
}

function main() {
  const results: CheckResult[] = [];
  const sql = existsSync(resolve(MIGRATION)) ? readSrc(MIGRATION) : "";
  const code = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");

  check(results, "migration shape", () => {
    assert(sql, "migration missing");
    assert(code.includes("create table public.fm_approvals"), "fm_approvals");
    assert(!/insert into public\.fm_approvals/i.test(code), "no seed rows");
    assert(!/(child_ids|approval_ids|work_order_ids)/i.test(code), "no child-id arrays");
    assert(/work_instruction_id uuid not null/.test(code), "work_instruction_id NOT NULL");
    assert(code.includes("foreign key (organisation_id, work_instruction_id)"), "tenant-safe Work Instruction FK");
    assert(/fm_approvals_org_work_instruction_uidx/.test(code), "one Approval per Work Instruction (evidence-based)");
    const table = code.split("create table public.fm_approvals")[1]!.split(");")[0]!;
    assert(!/\b(facility_id|asset_id|asset_ref)\b/.test(table), "facility/asset are inherited, not duplicated");
    assert(/decision_complete/.test(code) && /decided_by_profile_id is not null/.test(code), "decision is complete and attributable");
    assert(code.includes("drop column approval_ref") && /refusing to drop/.test(code), "opaque approval_ref retired, guarded");
    assert(!/drop column requires_approval/.test(code), "requires_approval is kept");
    assert(!/references public\.(cost|finance|assets|vendors)/i.test(code), "no FK to legacy Cost/Asset/Vendor");
    assert(code.includes("enable row level security"), "RLS");
    assert(code.includes("revoke all on table public.fm_approvals from public, anon, authenticated"), "anon/auth revoked");
    assert(code.includes("grant all on table public.fm_approvals to service_role"), "service_role");
    assert(!/create policy/i.test(code), "no broad JWT policies");
    assert(!code.includes("is_platform_super_admin()"), "no Super Admin bypass");
    assert(!/create table public\.(fm_approval_rules|fm_approval_steps|fm_approval_chains|approval_engine)/i.test(code), "no speculative approval-engine abstraction");
  });

  check(results, "no code-based Work Order matching", () => {
    const repo = readSrc("src/modules/approvals/server/FmApprovalRepository.ts");
    assert(repo.includes("resolveWorkInstruction") && repo.includes("work_instruction_id"), "Approval relates by UUID");
    const offenders: string[] = [];
    for (const file of ["src/modules/approvals/server/FmApprovalRepository.ts", "src/modules/approvals/server/FmApprovalServerService.ts", "src/modules/work-orders/server/FmWorkInstructionRepository.ts"]) {
      if (/WO-\\?\d|startsWith\(["']WO-|\/\^WO-/.test(readSrc(file))) offenders.push(file);
    }
    assert(offenders.length === 0, `code-shape matching: ${offenders.join(", ")}`);
    assert(!/approval_ref|approvalRef/.test(readSrc("src/modules/work-orders/server/FmWorkInstructionRepository.ts")), "Work Instruction stores no approval ref");
    assert(readSrc("src/modules/work-orders/server/FmWorkInstructionRepository.ts").includes('.from("fm_approvals")'), "Work Instruction approvalId derived from the FK");
    const action = readSrc("src/modules/approvals/actions/createApprovalFromWorkOrder.ts");
    assert(!/updateWorkOrder\([^)]*approvalId/.test(action), "no approvalId written back onto the Work Instruction");
    assert(action.includes("requiresApproval: true"), "declared requirement recorded independently");
  });

  check(results, "API cutover: /api/approvals is Supabase-only", () => {
    const route = readSrc("src/app/api/approvals/route.ts");
    assert(!route.includes("postToAppsScript(") && !route.includes("postGatedOperationalProxy"), "no Apps Script");
    assert(route.includes("FmApprovalServerService"), "Supabase service");
    assert(route.includes('capabilityForOperationalProxyAction("approvals"'), "capability gate preserved");
    assert(route.includes("SERVED_ACTIONS") && route.includes("hasDecisionMutation"), "retired actions fail closed; decisions blocked");
    const client = readSrc("src/services/approvals/ApprovalService.ts");
    assert(!/typeof window/.test(client) && !client.includes("appsScriptProxy"), "browser client has no server/Apps Script branch");
    const service = readSrc("src/modules/approvals/server/FmApprovalServerService.ts");
    assert(service.includes("allowDecision") && /allowDecision:\s*options\.allowDecision === true/.test(service), "decision writes need an explicit server-side flag");
  });

  check(results, "authority preserved exactly (no invented approval authority)", () => {
    const actions = readSrc("src/modules/approvals/actions/approvalLifecycleActions.ts");
    const decision = actions.slice(actions.indexOf("approval.record_decision"), actions.indexOf("export async function cancelApprovalRequest"));
    assert(/protected:\s*true/.test(decision) && /protectedActionId:\s*"approval\.record_decision"/.test(decision), "decision stays a protected action");
    assert(/requiredCapability:\s*"approvals\.manage"/.test(decision), "decision base capability: approvals.manage");
    assert(/allowDecision:\s*true/.test(actions), "only the protected path writes decisions");
    assert((actions.match(/allowDecision:\s*true/g) ?? []).length === 1, "exactly one decision writer");
    for (const name of ["approval.submit", "approval.follow_up", "approval.cancel"]) {
      assert(actions.includes(`name: "${name}"`), name);
    }
    assert((actions.match(/requiredCapability:\s*"approvals\.manage"/g) ?? []).length === 4, "all four lifecycle actions: approvals.manage");
    assert(!/self.?approv|requestedByUserId\s*(===|!==)\s*context/i.test(actions), "no invented requester/approver separation");
    assert(!/(role|jobTitle|isSuperAdmin)\s*===?/.test(actions.replace(/operatingRole|platformRole|isSuperAdmin: context/g, "")), "no role/title-based authority");
    const gate = readSrc("src/lib/access/operationalApiGate.ts");
    assert(/if \(resource === "approvals"\)[\s\S]{0,200}return "approvals\.manage"/.test(gate), "API writes: approvals.manage");
    const caps = readSrc("src/lib/access/capabilities.ts");
    assert(
      /SUPER_ADMIN_OVERRIDE_CAPABILITIES[^=]*=\s*\[\s*"users\.view",\s*"users\.manage",\s*"platform\.admin_override",?\s*\]/.test(caps),
      "Super Admin override not widened"
    );
    const svc = readSrc("src/modules/approvals/server/FmApprovalServerService.ts");
    assert(/acting profile is the session's/.test(svc) && svc.includes("actorProfileId: this.ctx.profileId"), "activity actor is the session profile, never the payload");
  });

  check(results, "browser/server boundary", () => {
    for (const f of ["FmApprovalRepository", "FmApprovalServerService", "ApprovalServerAccess", "getFmApprovalServerService"]) {
      assert(readSrc(`src/modules/approvals/server/${f}.ts`).startsWith('import "server-only"'), `${f} is server-only`);
    }
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(text) && /modules\/approvals\/server\//.test(text)) {
        throw new Error(`client module imports server Approval code: ${file}`);
      }
    }
  });

  check(results, "no live Sheet Approval reader/writer remains in runtime", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/resource:\s*"approvals"/.test(text) && /postToAppsScript/.test(text)) offenders.push(file);
      if (/command-centre-fm/.test(text) && /postToAppsScript/.test(text)) offenders.push(file);
    }
    assert(offenders.length === 0, `Apps Script Approval calls: ${offenders.join(", ")}`);
    for (const file of ["src/modules/approvals/actions/approvalLifecycleActions.ts", "src/modules/approvals/actions/createApprovalFromWorkOrder.ts"]) {
      const text = readSrc(file);
      assert(!text.includes("services/approvals/ApprovalService"), `${file} uses the browser Approval client`);
      assert(text.includes("ApprovalServerAccess"), `${file} uses Supabase Approval access`);
    }
    const cc = readSrc("src/services/workspace/CommandCentreFmSummaryService.ts");
    assert(!cc.includes("postToAppsScriptData") && cc.includes("getFmApprovalServerService"), "Operational Picture: Approvals from Supabase; no Apps Script call remains");
  });

  check(results, "activity is relational (no JSON log cell)", () => {
    assert(readSrc("src/modules/approvals/server/FmApprovalRepository.ts").includes("fm_approval_activities"), "activity rows");
    const actions = readSrc("src/modules/approvals/actions/approvalLifecycleActions.ts");
    assert(!/appendApprovalActivity|activityLog:/.test(actions), "actions no longer rewrite a JSON log");
  });

  check(results, "tenant scoping: every repository statement is organisation-scoped", () => {
    const repo = readSrc("src/modules/approvals/server/FmApprovalRepository.ts");
    const statements = repo.split("this.admin").slice(1).filter((chunk) => chunk.includes(".from("));
    assert(statements.length >= 10, `expected repository statements, found ${statements.length}`);
    for (const statement of statements) {
      const head = statement.slice(0, statement.indexOf(";") === -1 ? 900 : statement.indexOf(";"));
      assert(/organisation_id/.test(head), `unscoped statement: ${head.slice(0, 80).replace(/\s+/g, " ")}`);
    }
  });

  check(results, "operational_identity_links not reintroduced", () => {
    for (const file of walk("src/modules/approvals")) {
      assert(!readFileSync(file, "utf8").includes("operational_identity_links"), `Approval code uses identity links: ${file}`);
    }
  });

  check(results, "FM Cost boundary stays legacy + opaque", () => {
    const costRow = readSrc("src/lib/operational/finance/costSubmissionRow.ts");
    assert(costRow.includes('"Approval ID"'), "cost submission still holds an opaque Approval code");
    assert(!/fm_cost|fm_costs/.test(code), "no cost tables/FKs created");
    for (const file of walk("src/modules/approvals/server")) {
      assert(!/cost_submission|CostSubmission/.test(readFileSync(file, "utf8")), `Approval server couples to Cost: ${file}`);
    }
  });

  check(results, "Apps Script untouched", () => {
    const changed = execSync("git status --porcelain", { encoding: "utf8" })
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const touched = changed.filter((path) => path.startsWith("apps-script/") || /^[A-Za-z]+\.(gs|js)$/.test(path) || path === "appsscript.json");
    assert(touched.length === 0, `Apps Script files changed: ${touched.join(", ")}`);
    assert(readSrc("apps-script/deployment/VERSION.md").includes("0.8.6.21"), "production version unchanged (v0.8.6.21)");
  });

  check(results, "domain: codes, status, parsing, mapping", () => {
    assert(generateNextApprovalCode(null, new Date("2026-09-19")) === "APR-2026-000001", "first code");
    assert(generateNextApprovalCode("APR-2026-000009", new Date("2026-09-19")) === "APR-2026-000010", "next code");
    assert(generateNextApprovalCode("APR-2025-000099", new Date("2026-01-02")) === "APR-2026-000001", "year rolls");

    assert(parseApprovalStatus("submitted") === "awaiting_decision" && parseApprovalStatus("awaiting_response") === "awaiting_decision", "submit aliases");
    assert(parseApprovalStatus("generated") === "draft" && parseApprovalStatus("query") === "returned", "legacy aliases");
    assert(throws(() => parseApprovalStatus("pending")), "unknown status rejected (never silently draft)");

    const opts = { allowDecision: false };
    const created = parseCreateApprovalInput({ title: " Pump ", workOrderId: "WO-2026-000001", approvalAmount: 5_000_000 }, opts);
    assert(created.status === "draft" && created.approvalType === "standard_maintenance" && created.approvalAmount === 5_000_000, "create defaults");
    assert(throws(() => parseCreateApprovalInput({ title: "x" }, opts)), "Work Instruction is required");
    assert(throws(() => parseCreateApprovalInput({ title: "", workOrderId: "WO-1" }, opts)), "title required");
    assert(throws(() => parseCreateApprovalInput({ title: "x", workOrderId: "WO-1", approvalAmount: -1 }, opts)), "negative amount rejected");
    assert(throws(() => parseCreateApprovalInput({ title: "x", workOrderId: "WO-1", type: "bribe" }, opts)), "bad type rejected");
    assert(parseCreateApprovalInput({ title: "x", workOrderId: "WO-1", type: "additional_works" }, opts).approvalType === "variation", "type alias");
    assert(parseCreateApprovalInput({ title: "x", workOrderId: "WO-1", facilityId: FAC, assetId: "AST-1" }, opts).workInstructionRef === "WO-1", "facility/asset inputs are ignored (inherited)");
    assert(!("facilityId" in parseCreateApprovalInput({ title: "x", workOrderId: "WO-1", facilityId: FAC }, opts)), "facility not carried into the write");

    for (const key of ["decisionAt", "decisionOutcome", "decisionNotes", "decisionReference", "approvedAmount", "approvedByUserId", "decisionDocumentFileName"]) {
      assert(throws(() => parseUpdateApprovalInput({ id: "APR-1", [key]: "x" }, opts)), `${key} blocked outside the protected path`);
    }
    const decided = parseUpdateApprovalInput(
      { id: "APR-1", status: "approved", decisionAt: "2026-09-19T00:00:00Z", decisionOutcome: "partially_approved", approvedAmount: 10, approvedByUserId: PROFILE },
      { allowDecision: true }
    );
    assert(decided.decisionOutcome === "partially_approved" && decided.decidedByProfileId === PROFILE, "protected path writes decision + actor");
    assert(parseUpdateApprovalInput({ id: "APR-1", approvedByUserId: "USR-0001" }, { allowDecision: true }).decidedByProfileId === null, "USR-* never becomes an actor");
    assert(throws(() => parseUpdateApprovalInput({ id: "APR-1", approvedByUserId: "nope" }, { allowDecision: true })), "non-UUID actor rejected");
    assert(throws(() => parseUpdateApprovalInput({ id: "APR-1", requestedByUserId: "nope" }, opts)), "non-UUID requester rejected");
    assert(parseUpdateApprovalInput({ id: "APR-1", description: null }, opts).description === null, "explicit clear");

    assert(parseApprovalActivity({ action: "approval_submitted", summary: "sent" }).action === "approval_submitted", "activity accepted");
    assert(throws(() => parseApprovalActivity({ action: "approval_teleported", summary: "x" })), "bad activity action rejected");

    const params = parseApprovalListParams({ page: "0", pageSize: 9999, status: "submitted", sort: "oldest" });
    assert(params.page === 1 && params.pageSize === 500 && params.status === "awaiting_decision" && params.sort === "oldest", "list params");
    assert(parseApprovalListParams({}).sort === "newest" && parseApprovalListParams({}).status === "all", "list defaults");

    const mapped = mapFmApprovalRowToApproval(sampleRow({ status: "awaiting_decision", submitted_at: "2026-09-19T01:00:00.000Z", approval_amount: 5_000_000 }), {
      workInstructionCode: "WO-2026-000001",
      facilityId: FAC,
      assetRef: "AST-1",
      activities: [
        { id: "a2", approval_id: "x", action: "approval_submitted", occurred_at: "2026-09-19T02:00:00.000Z", summary: "submitted", actor_profile_id: PROFILE, data: {} },
        { id: "a1", approval_id: "x", action: "approval_created", occurred_at: "2026-09-19T01:00:00.000Z", summary: "created", actor_profile_id: PROFILE, data: {} },
      ],
    });
    assert(mapped.id === "APR-2026-000001" && mapped.approvalUuid?.startsWith("1111"), "display id + uuid");
    assert(mapped.workOrderId === "WO-2026-000001" && mapped.facilityId === FAC && mapped.assetId === "AST-1", "Work Instruction / facility / asset inherited");
    assert(mapped.lastActivitySummary === "submitted" && mapped.activities?.length === 2 && mapped.activities[0]!.id === "a1", "activity ordered; last derived");
    assert(JSON.parse(mapped.activityLog!).length === 2, "activityLog compat projection");
    assert(mapped.approvalAmount === 5_000_000, "amount carried");
    assert(mapFmApprovalRowToApproval(sampleRow()).lastActivitySummary === "Approval request created", "no activity → honest default, no invention");
  });

  check(results, "Operational Picture predicate + zero semantics", () => {
    const picture = summarizeApprovalOperationalPicture([
      { status: "draft" },
      { status: "awaiting_decision" },
      { status: "awaiting_decision" },
      { status: "approved" },
      { status: "cancelled" },
    ]);
    assert(picture.awaitingAction === 3, "awaiting = draft + awaiting_decision");
    const empty = summarizeApprovalOperationalPicture([]);
    assert(empty.state === "healthy" && empty.awaitingAction === 0, "successful empty register is a healthy ZERO");
    const cc = readSrc("src/services/workspace/CommandCentreFmSummaryService.ts");
    assert(/state:\s*"unavailable"/.test(cc), "failed domain is unavailable, never zero");
  });

  check(results, "rollback probe + live smoke assets present", () => {
    for (const file of ["scripts/verify-fm-phase-2f-rollback.sql", "scripts/verify-fm-phase-2f-objects.sql", "scripts/verify-fm-approvals-live-read.mts"]) {
      assert(existsSync(resolve(file)), `${file} missing`);
    }
  });

  for (const r of results) console.log(`${r.status} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\nPhase 2F verify: ${results.length - failed.length} PASS, ${failed.length} FAIL`);
  if (failed.length > 0) process.exit(1);
}

main();
