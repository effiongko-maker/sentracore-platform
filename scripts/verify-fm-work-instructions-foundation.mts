/**
 * FM Phase 2E — Work Instructions foundation & cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-work-instructions-foundation.mts
 *
 * Static + pure-domain always. Linked DB integrity is proven by
 * scripts/verify-fm-phase-2e-rollback.sql (rollback-only) and
 * scripts/verify-fm-work-instructions-live-read.mts (read-only).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  generateNextInstructionCode,
  mapFmWorkInstructionRowToWorkOrder,
  parseCreateInstructionInput,
  parseInstructionListParams,
  parseOrderType,
  parseUpdateInstructionInput,
  summarizeInstructionOperationalPicture,
  type FmWorkInstructionRow,
} from "../src/modules/work-orders/server/fmWorkInstructionDomain";
import { composeWorkloadSummary } from "../src/lib/operational/workload/composeWorkloadSummary";
import { resolveWorkInstructionKind, validateOrderTypeSelection } from "../src/modules/work-orders/instructionKind";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail?: string };

const MIGRATION = "supabase/migrations/20260919160000_fm_work_instructions.sql";
const FAC = "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0";
const PROFILE = "33333333-3333-4333-8333-333333333333";

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

function sampleRow(overrides: Partial<FmWorkInstructionRow> = {}): FmWorkInstructionRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "22222222-2222-4222-8222-222222222222",
    code: "WO-2026-000001",
    order_type: "job_order",
    work_id: "44444444-4444-4444-8444-444444444444",
    facility_id: FAC,
    title: "Replace pump",
    description: null,
    instruction_text: null,
    work_category: "corrective",
    maintenance_type: null,
    source: "manual",
    category_id: null,
    asset_ref: null,
    parent_instruction_id: null,
    reported_by_profile_id: null,
    assigned_to_profile_id: null,
    status: "open",
    priority: "medium",
    hold_reason: null,
    requested_at: "2026-09-19T00:00:00.000Z",
    scheduled_start_at: null,
    scheduled_end_at: null,
    due_at: null,
    sla_due_at: null,
    started_at: null,
    completed_at: null,
    estimated_hours: null,
    actual_hours: null,
    estimated_cost: null,
    actual_cost: null,
    downtime_minutes: null,
    completion_notes: null,
    work_performed: null,
    requires_approval: false,
    approval_ref: null,
    operational_event_id: null,
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
    assert(code.includes("create table public.fm_work_instructions"), "fm_work_instructions");
    assert(!/create table public\.fm_(job_orders|work_orders)/i.test(code), "NO separate Work Order / Job Order tables");
    assert(!/insert into public\.fm_work_instructions/i.test(code), "no seed rows");
    assert(!/(work_order_ids|maintenance_ids|incident_ids|child_ids)/i.test(code), "no child-id arrays");
    assert(/order_type text not null,/.test(code), "order_type NOT NULL with no default");
    assert(/check \(order_type in \('work_order', 'job_order'\)\)/.test(code), "order_type constrained to the two kinds");
    assert(/work_id uuid not null/.test(code), "work_id NOT NULL — downstream of Work");
    assert(code.includes("foreign key (organisation_id, work_id, facility_id)"), "facility inherited via composite Work FK");
    assert(/fm_work \(organisation_id, id, facility_id\)/.test(code), "FK targets the Work facility tuple");
    assert(!/estimated_cost[^,]*order_type|order_type[^,]*estimated_cost/.test(code.replace(/comment on[\s\S]*?;/gi, "")), "cost never participates in order_type");
    assert(!/incident_id uuid/.test(code.split("create table public.fm_work_instructions")[1]!.split(");")[0]!), "Incident is derived through Work, not stored");
    assert(code.includes("enable row level security"), "RLS");
    assert(code.includes("revoke all on table public.fm_work_instructions from public, anon, authenticated"), "anon/auth revoked");
    assert(code.includes("grant all on table public.fm_work_instructions to service_role"), "service_role");
    assert(!/create policy/i.test(code), "no broad JWT policies");
    assert(!code.includes("is_platform_super_admin()"), "no Super Admin bypass");
    assert(code.includes("drop column work_order_ref") && /refusing to drop/.test(code), "opaque Incident WO ref retired, guarded");
    assert(!/references public\.(assets|fm_assets|approvals|vendors|cost)/i.test(code), "no FK to unmigrated Asset/Approval/Vendor/Cost");
    assert(/asset_ref text/.test(code) && /approval_ref text/.test(code), "transitional refs are opaque text");
  });

  check(results, "no cost-threshold classifier is active", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/platform-finance/i.test(file)) continue;
      // Any code that derives an order type from an amount.
      if (/(orderType|order_type|OrderType)[^\n;]{0,80}(estimatedCost|actualCost|estimated_cost)[^\n;]{0,40}[<>]=?\s*1_?000_?000/.test(text)) offenders.push(file);
      if (/(estimatedCost|actualCost)[^\n;]{0,40}[<>]=?\s*1_?000_?000[^\n;]{0,80}(job_order|work_order)/.test(text)) offenders.push(file);
      if (/(≥|>=)\s*₦\s*1m/i.test(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""))) offenders.push(file);
    }
    assert(offenders.length === 0, `cost classifier: ${offenders.join(", ")}`);
    assert(!/≥ ₦1m|below ₦1m/.test(readSrc("src/lib/operational/issues/model.ts")), "Issue model no longer documents a ₦1m rule");
    assert(!/estimated_cost[^;]{0,120}order_type/i.test(readSrc("src/modules/work-orders/server/FmWorkInstructionRepository.ts")), "repository never derives order_type from cost");
    assert(resolveWorkInstructionKind({ orderType: "work_order", estimatedCost: 999_999_999 }) === "work_order", "high cost stays Work Order");
    assert(resolveWorkInstructionKind({ orderType: "job_order", estimatedCost: 1 }) === "job_order", "low cost stays Job Order");
  });

  check(results, "order_type is explicit and mandatory everywhere", () => {
    assert(throws(() => parseOrderType(undefined)), "missing rejected");
    assert(throws(() => parseOrderType("undetermined")), "undetermined rejected");
    assert(parseOrderType("Job Order") === "job_order" && parseOrderType("work_order") === "work_order", "both accepted");
    assert(throws(() => parseCreateInstructionInput({ title: "x", maintenanceId: "WRK-1", estimatedCost: 5_000_000 })), "cost does NOT supply a missing order type");
    assert(validateOrderTypeSelection("").ok === false, "UI selection validator requires a choice");
    const action = readSrc("src/modules/work-orders/actions/createWorkOrderFromMaintenance.ts");
    assert(action.includes("validateOrderTypeSelection") && !/orderType:\s*"work_order"/.test(action), "one-click create requires a manual choice");
    const orch = readSrc("src/lib/operational/orchestration/index.ts");
    assert(!/orderType:\s*"work_order"/.test(orch), "orchestration never hardcodes an Order Type");
    for (const ui of [
      "src/modules/work/components/WorkDetailModal.tsx",
      "src/modules/maintenance/components/ViewMaintenanceModal.tsx",
      "src/modules/maintenance/components/MaintenanceFormModal.tsx",
      "src/modules/incidents/components/ViewIncidentModal.tsx",
    ]) {
      assert(readSrc(ui).includes("OrderTypePicker"), `${ui} asks for Order Type`);
    }
    const picker = readSrc("src/modules/work-orders/components/OrderTypePicker.tsx");
    assert(picker.includes('<option value="">'), "picker has no default selection");
  });

  check(results, "API cutover: /api/work-orders is Supabase-only", () => {
    const route = readSrc("src/app/api/work-orders/route.ts");
    assert(!route.includes("postToAppsScript(") && !route.includes("postGatedOperationalProxy"), "no Apps Script");
    assert(route.includes("FmWorkInstructionServerService"), "Supabase service");
    assert(route.includes('capabilityForOperationalProxyAction("work-orders"'), "capability gate preserved");
    assert(route.includes("SERVED_ACTIONS"), "retired actions fail closed");
    const client = readSrc("src/services/workOrders/WorkOrderService.ts");
    assert(!/typeof window/.test(client) && !client.includes("appsScriptProxy"), "browser client has no server/Apps Script branch");
    assert(!client.includes("createWorkOrderFromMaintenance"), "Apps Script createFromMaintenance client retired");
  });

  check(results, "authorization vocabulary unchanged", () => {
    const gate = readSrc("src/lib/access/operationalApiGate.ts");
    assert(gate.includes('if (READ_ACTIONS.has(normalized)) return "ops.view"'), "reads: ops.view");
    assert(gate.includes('return "ops.create"') && gate.includes('return "ops.edit"'), "writes: ops.create / ops.edit");
    const caps = readSrc("src/lib/access/capabilities.ts");
    assert(
      /SUPER_ADMIN_OVERRIDE_CAPABILITIES[^=]*=\s*\[\s*"users\.view",\s*"users\.manage",\s*"platform\.admin_override",?\s*\]/.test(caps),
      "Super Admin override not widened"
    );
    assert(readSrc("src/modules/work-orders/actions/createWorkOrderFromMaintenance.ts").includes('requiredCapability: "ops.create"'), "one-click create: ops.create");
  });

  check(results, "browser/server boundary", () => {
    for (const f of ["FmWorkInstructionRepository", "FmWorkInstructionServerService", "WorkInstructionServerAccess", "getFmWorkInstructionServerService"]) {
      assert(readSrc(`src/modules/work-orders/server/${f}.ts`).startsWith('import "server-only"'), `${f} is server-only`);
    }
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(text) && /modules\/work-orders\/server\//.test(text)) {
        throw new Error(`client module imports server Work Instruction code: ${file}`);
      }
    }
  });

  check(results, "no live Sheet Work Order reader/writer remains in runtime", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/resource:\s*"work-orders"/.test(text) && /postToAppsScript/.test(text)) offenders.push(file);
      // reporting-snapshot legitimately remains (assets/users/facilities/Work still ride it);
      // its Work Order + Incident domains are REPLACED by Supabase in ReportingService.
      if (/resource:\s*"operational-workload"/.test(text) && /postToAppsScript\(/.test(text)) offenders.push(file);
    }
    assert(offenders.length === 0, `Apps Script Work Order calls: ${offenders.join(", ")}`);
    for (const file of [
      "src/lib/operational/orchestration/index.ts",
      "src/lib/operational/orchestration/requestTreatment.ts",
      "src/lib/operational/lifecycle/transitionOperationalEntity.ts",
      "src/lib/operational/context/loadOperationalContext.ts",
      "src/modules/approvals/actions/approvalLifecycleActions.ts",
      "src/modules/approvals/actions/createApprovalFromWorkOrder.ts",
    ]) {
      const text = readSrc(file);
      assert(!text.includes("services/workOrders/WorkOrderService"), `${file} uses the browser Work Order client`);
      assert(text.includes("WorkInstructionServerAccess"), `${file} uses Supabase Work Instruction access`);
    }
    const workload = readSrc("src/app/api/operational-workload/route.ts");
    assert(!workload.includes("postToAppsScript(") && workload.includes("FmWorkInstructionRepository"), "workload composed from Supabase");
    const cc = readSrc("src/services/workspace/CommandCentreFmSummaryService.ts");
    assert(cc.includes("WorkInstructionServerAccess") && (cc.match(/postToAppsScriptData\(/g) ?? []).length === 1, "Operational Picture: WO from Supabase; Apps Script only for Approvals");
    assert(!cc.includes("loadAssignmentSummary"), "Apps Script Assignment Summary retired");
    const reporting = readSrc("src/services/reporting/ReportingService.ts");
    assert(reporting.includes("loadAuthoritativeWorkOrders") && reporting.includes('"workOrders"'), "reporting uses Supabase Work Instructions with explicit health");
    assert(!/WorkOrderService\.listWorkOrders\([^)]*\)\s*\)\.catch\(\(\) => \[\]\)/.test(reporting), "no silent-zero Work Order catch");
  });

  check(results, "Work ↔ Work Instruction is one relation; no arrays, no opaque refs", () => {
    const work = readSrc("src/modules/maintenance/server/FmWorkRepository.ts");
    assert(work.includes("fm_work_instructions") && work.includes("work_instruction_codes"), "Work.workOrderIds derived");
    const wdomain = readSrc("src/modules/maintenance/server/fmWorkDomain.ts");
    assert(wdomain.includes("workOrderIds: [...row.work_instruction_codes]"), "Work maps derived instructions");
    const incident = readSrc("src/modules/incidents/server/FmIncidentRepository.ts");
    assert(incident.includes("fm_work_instructions") && !incident.includes("work_order_ref"), "Incident WO derived through Work; ref gone");
    const orch = readSrc("src/lib/operational/orchestration/index.ts");
    assert(!/workOrderIds:\s*rel\.workOrderIds/.test(orch), "no WO array written onto Incident");
    assert(orch.includes("A Work Instruction belongs to Work"), "triage WO requires Work");
    const repo = readSrc("src/modules/work-orders/server/FmWorkInstructionRepository.ts");
    assert(repo.includes("assertInherited") && repo.includes("Facility mismatch") && repo.includes("Incident mismatch"), "facility/incident inherited, mismatches rejected");
  });

  check(results, "tenant scoping: every repository statement is organisation-scoped", () => {
    const repo = readSrc("src/modules/work-orders/server/FmWorkInstructionRepository.ts");
    const statements = repo.split("this.admin").slice(1).filter((chunk) => chunk.includes(".from("));
    assert(statements.length >= 10, `expected repository statements, found ${statements.length}`);
    for (const statement of statements) {
      const head = statement.slice(0, statement.indexOf(";") === -1 ? 800 : statement.indexOf(";"));
      assert(/organisation_id/.test(head), `unscoped statement: ${head.slice(0, 80).replace(/\s+/g, " ")}`);
    }
  });

  check(results, "operational_identity_links: no runtime consumer for Work Instructions", () => {
    const remaining = walk("src")
      .filter((file) => readFileSync(file, "utf8").includes("operational_identity_links"))
      .map((file) => file.replace(/\\/g, "/"))
      .sort();
    console.log(`INFO operational_identity_links consumers: ${remaining.join(", ")}`);
    assert(!remaining.some((file) => /command-centre|work-orders|incidents|requests|maintenance/.test(file)), "no FM domain runtime dependency");
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

  check(results, "domain: codes, parsing, mapping", () => {
    assert(generateNextInstructionCode(null, new Date("2026-09-19")) === "WO-2026-000001", "first code");
    assert(generateNextInstructionCode("WO-2026-000009", new Date("2026-09-19")) === "WO-2026-000010", "next code");
    assert(generateNextInstructionCode("WO-2025-000099", new Date("2026-01-02")) === "WO-2026-000001", "year rolls");

    const created = parseCreateInstructionInput({ title: " Fix pump ", orderType: "job_order", maintenanceId: "WRK-2026-000001" });
    assert(created.status === "open" && created.priority === "medium" && created.workCategory === "corrective", "create defaults");
    assert(created.orderType === "job_order", "explicit order type kept");
    assert(parseCreateInstructionInput({ title: "x", orderType: "work_order", maintenanceId: "WRK-1", estimatedCost: 50_000_000 }).orderType === "work_order", "huge cost stays Work Order");
    assert(parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", estimatedCost: 1 }).orderType === "job_order", "tiny cost stays Job Order");
    assert(parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", estimatedCost: 1 }).estimatedCost === 1, "estimated cost is its own field");
    assert(throws(() => parseCreateInstructionInput({ title: "x", orderType: "job_order" })), "Work is required");
    assert(throws(() => parseCreateInstructionInput({ title: "", orderType: "job_order", maintenanceId: "WRK-1" })), "title required");
    assert(throws(() => parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", status: "pending" })), "bad status rejected");
    assert(throws(() => parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", estimatedCost: -5 })), "negative cost rejected");
    assert(throws(() => parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", assignedToUserId: "nope" })), "non-UUID assignee rejected");
    assert(parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", assignedToUserId: "USR-0002" }).assignedToProfileId === null || parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", assignedToUserId: "USR-0002" }).assignedToProfileId === undefined, "USR-* never persisted");
    assert(parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", assignedToUserId: PROFILE }).assignedToProfileId === PROFILE, "profile uuid accepted");
    const inherited = parseCreateInstructionInput({ title: "x", orderType: "job_order", maintenanceId: "WRK-1", facilityId: FAC, incidentId: "INC-1" });
    assert(inherited.assertFacilityRef === FAC && inherited.assertIncidentRef === "INC-1", "facility/incident are consistency checks only");
    assert(parseUpdateInstructionInput({ id: "WO-1", estimatedCost: 5 }).orderType === undefined, "cost update never touches order type");
    assert(parseUpdateInstructionInput({ id: "WO-1", orderType: "work_order" }).orderType === "work_order", "order type editable manually");
    assert(throws(() => parseUpdateInstructionInput({ id: "WO-1", orderType: "" })), "order type cannot be blanked");
    assert(parseUpdateInstructionInput({ id: "WO-1", description: null }).description === null, "explicit clear");

    const params = parseInstructionListParams({ page: "0", pageSize: 9999, status: "open", dueDate: "overdue", sort: "oldest" });
    assert(params.page === 1 && params.pageSize === 500 && params.dueDate === "overdue" && params.sort === "oldest", "list params clamp");
    assert(parseInstructionListParams({}).status === "all" && parseInstructionListParams({}).sort === "newest", "list defaults");

    const mapped = mapFmWorkInstructionRowToWorkOrder(
      sampleRow({ estimated_cost: 25_000_000, order_type: "work_order", asset_ref: "AST-1", approval_ref: "APR-1", requires_approval: true }),
      { workCode: "WRK-2026-000001", incidentCode: "INC-2026-000001", parentCode: "WO-2026-000000" }
    );
    assert(mapped.id === "WO-2026-000001" && mapped.workOrderUuid?.startsWith("1111"), "display id + uuid");
    assert(mapped.orderType === "work_order" && mapped.estimatedCost === 25_000_000, "order type and cost independent in mapping");
    assert(mapped.maintenanceId === "WRK-2026-000001" && mapped.incidentId === "INC-2026-000001", "Work + Incident (through Work) derived");
    assert(mapped.approvalId === "APR-1" && mapped.assetId === "AST-1", "transitional legacy refs carried opaque");
  });

  check(results, "Operational Picture predicates preserved", () => {
    const picture = summarizeInstructionOperationalPicture(
      [
        { status: "on_hold", due_at: null, sla_due_at: null },
        { status: "open", due_at: "2026-09-01T00:00:00.000Z", sla_due_at: null },
        { status: "in_progress", due_at: null, sla_due_at: "2026-09-02T00:00:00.000Z" },
        { status: "completed", due_at: "2026-01-01T00:00:00.000Z", sla_due_at: null },
        { status: "draft", due_at: "2026-01-01T00:00:00.000Z", sla_due_at: null },
      ],
      "2026-09-19T12:00:00.000Z"
    );
    assert(picture.awaitingAction === 1, "awaiting = on_hold");
    assert(picture.overdue === 2, "overdue counts open/in_progress past due (due_at ?? sla_due_at), not completed/draft");
    const empty = summarizeInstructionOperationalPicture([], "2026-09-19T12:00:00.000Z");
    assert(empty.state === "healthy" && empty.awaitingAction === 0 && empty.overdue === 0, "successful empty register is a healthy ZERO");
  });

  check(results, "workload composed from Supabase registers", () => {
    const out = composeWorkloadSummary({
      instructionsByUser: new Map([[PROFILE, ["WO-2026-000001", "WO-2026-000002"]]]),
      instructionsByAsset: new Map([["A1", ["WO-2026-000001"]]]),
      workByAsset: new Map([["A1", ["WRK-2026-000001"]], ["A2", ["WRK-2026-000002"]]]),
      incidentsByAsset: new Map([["A1", ["INC-2026-000001"]]]),
    });
    assert(out.byUserId[PROFILE] === 2 && out.byUserIdEvidence[PROFILE]!.workOrderIds.length === 2, "people workload from Work Instructions");
    assert(out.byAssetId.A1!.activeWorkload === 3 && out.byAssetId.A1!.workloadBreakdown.workOrders === 1, "asset A1 breakdown");
    assert(out.byAssetId.A2!.activeWorkload === 1, "asset with only Work");
    assert(Object.keys(composeWorkloadSummary({ instructionsByUser: new Map(), instructionsByAsset: new Map(), workByAsset: new Map(), incidentsByAsset: new Map() }).byAssetId).length === 0, "empty registers → empty (zero) summary");
  });

  check(results, "rollback probe + live smoke assets present", () => {
    for (const file of [
      "scripts/verify-fm-phase-2e-rollback.sql",
      "scripts/verify-fm-phase-2e-objects.sql",
      "scripts/verify-fm-work-instructions-live-read.mts",
    ]) {
      assert(existsSync(resolve(file)), `${file} missing`);
    }
  });

  for (const r of results) console.log(`${r.status} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\nPhase 2E verify: ${results.length - failed.length} PASS, ${failed.length} FAIL`);
  if (failed.length > 0) process.exit(1);
}

main();
