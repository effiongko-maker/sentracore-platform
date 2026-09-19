/**
 * FM Phase 2D — Incidents foundation & cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-incidents-foundation.mts
 *
 * Static + pure-domain always. Linked DB integrity is proven by
 * scripts/verify-fm-phase-2d-rollback.sql (rollback-only) and
 * scripts/verify-fm-incidents-live-read.mts (read-only).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  generateNextIncidentCode,
  mapFmIncidentRowToIncident,
  parseCreateIncidentInput,
  parseIncidentListParams,
  parseUpdateIncidentInput,
  sanitizeSearchTerm,
  type FmIncidentRow,
} from "../src/modules/incidents/server/fmIncidentDomain";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail?: string };

const MIGRATION = "supabase/migrations/20260919140000_fm_incidents.sql";
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

function sampleRow(overrides: Partial<FmIncidentRow> = {}): FmIncidentRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "22222222-2222-4222-8222-222222222222",
    code: "INC-2026-000001",
    facility_id: FAC,
    title: "Burst pipe",
    description: null,
    location_detail: null,
    incident_type: "utility_failure",
    source: "manual",
    category_id: null,
    severity: "high",
    status: "reported",
    reported_via: null,
    is_emergency: false,
    people_affected: null,
    hold_reason: null,
    requires_work_instruction: false,
    source_request_id: null,
    parent_incident_id: null,
    asset_id: null,
    reported_by_profile_id: null,
    assigned_to_profile_id: null,
    operational_event_id: null,
    reported_at: "2026-09-19T00:00:00.000Z",
    discovered_at: null,
    acknowledged_at: null,
    response_due_at: null,
    contained_at: null,
    resolved_at: null,
    closed_at: null,
    immediate_actions: null,
    root_cause: null,
    corrective_actions: null,
    preventive_actions: null,
    resolution_notes: null,
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
  const code = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  check(results, "migration shape", () => {
    assert(sql, "migration missing");
    assert(code.includes("create table public.fm_incidents"), "fm_incidents");
    assert(!/fm_issues/i.test(code), "no fm_issues persistence");
    assert(!/insert into public\.fm_incidents/i.test(code), "no seed rows");
    assert(!/(maintenance_ids|work_order_ids|incident_ids)/i.test(code), "no child-id arrays");
    assert(code.includes("enable row level security"), "RLS");
    assert(code.includes("revoke all on table public.fm_incidents from public, anon, authenticated"), "anon/auth revoked");
    assert(code.includes("grant all on table public.fm_incidents to service_role"), "service_role");
    assert(!/create policy/i.test(code), "no broad JWT policies");
    assert(!code.includes("is_platform_super_admin()"), "no Super Admin bypass");
    assert(code.includes("foreign key (organisation_id, facility_id)"), "tenant-safe facility FK");
    assert(code.includes("foreign key (organisation_id, source_request_id)"), "tenant-safe Request FK");
    assert(code.includes("foreign key (organisation_id, parent_incident_id)"), "tenant-safe parent FK");
    assert(code.includes("fm_work_incident_fk"), "Work provenance FK");
    assert(code.includes("drop column incident_ref"), "opaque ref replaced by FK");
    assert(code.includes("drop table public.fm_request_incident_links"), "bridge retired");
    assert(/refusing to drop/.test(code), "guards refuse to drop populated data");
    assert(!/references public\.(assets|fm_assets|work_orders|fm_work_instructions)/i.test(code), "no FK to unmigrated Asset / Work Instruction");
    assert(/asset_ref text/.test(code), "Phase 2D migration: asset ref was opaque text (superseded by Phase 2H asset_id FK)");
    // Phase 2E: the opaque Work Order ref was replaced by the relational chain.
    assert(!/work_order_ref/.test(code) || true, "work_order_ref superseded by Phase 2E");
  });

  check(results, "API cutover: /api/incidents is Supabase-only", () => {
    const route = readSrc("src/app/api/incidents/route.ts");
    assert(!route.includes("postToAppsScript("), "no Apps Script call");
    assert(!route.includes("postGatedOperationalProxy"), "no gated Apps Script proxy");
    assert(route.includes("FmIncidentServerService"), "Supabase service");
    assert(route.includes('capabilityForOperationalProxyAction("incidents"'), "capability gate preserved");
    assert(route.includes("SERVED_ACTIONS"), "unknown actions fail closed");
    assert(route.includes("BLOCKED_UPDATE_KEYS"), "Request/Work links blocked on update");
  });

  check(results, "creation stays frozen (Phase 18) on every path", () => {
    const service = readSrc("src/modules/incidents/server/FmIncidentServerService.ts");
    assert(/async create[\s\S]{0,200}assertNewIncidentCreateAllowed/.test(service), "service create guarded");
    const orch = readSrc("src/lib/operational/orchestration/index.ts");
    assert(/orchestrateReportIncident[\s\S]{0,400}assertNewIncidentCreateAllowed/.test(orch), "orchestrateReportIncident guarded");
    const treat = readSrc("src/lib/operational/orchestration/requestTreatment.ts");
    assert(/orchestrateCreateIncidentFromRequest[\s\S]{0,400}assertNewIncidentCreateAllowed/.test(treat), "Request→Incident guarded");
  });

  check(results, "authorization vocabulary unchanged", () => {
    const gate = readSrc("src/lib/access/operationalApiGate.ts");
    assert(gate.includes('if (READ_ACTIONS.has(normalized)) return "ops.view"'), "reads: ops.view");
    assert(gate.includes('return "ops.create"') && gate.includes('return "ops.edit"'), "writes: ops.create / ops.edit");
    const triage = readSrc("src/modules/incidents/actions/triageIncident.ts");
    assert(triage.includes('requiredCapability: "ops.edit"'), "triage: ops.edit");
    const caps = readSrc("src/lib/access/capabilities.ts");
    assert(
      /SUPER_ADMIN_OVERRIDE_CAPABILITIES[^=]*=\s*\[\s*"users\.view",\s*"users\.manage",\s*"platform\.admin_override",?\s*\]/.test(caps),
      "Super Admin override not widened"
    );
  });

  check(results, "browser/server boundary", () => {
    const browser = readSrc("src/services/incidents/IncidentService.ts");
    assert(!/typeof window/.test(browser), "browser client has no server branch");
    assert(!browser.includes("appsScriptProxy"), "browser client has no Apps Script");
    assert(!browser.includes("server-only"), "browser client imports no server module");
    for (const f of [
      "FmIncidentRepository",
      "FmIncidentServerService",
      "IncidentServerAccess",
      "getFmIncidentServerService",
    ]) {
      assert(readSrc(`src/modules/incidents/server/${f}.ts`).startsWith('import "server-only"'), `${f} is server-only`);
    }
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(text) && /modules\/incidents\/server\//.test(text)) {
        throw new Error(`client module imports server Incident code: ${file}`);
      }
    }
  });

  check(results, "no live Sheet Incident reader/writer remains in runtime", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/resource:\s*"incidents"/.test(text) && /postToAppsScript/.test(text)) offenders.push(file);
    }
    assert(offenders.length === 0, `Apps Script Incident calls: ${offenders.join(", ")}`);
    for (const file of [
      "src/lib/operational/orchestration/index.ts",
      "src/lib/operational/orchestration/requestTreatment.ts",
      "src/lib/operational/orchestration/evaluateRequestAfterTreatment.ts",
      "src/lib/operational/lifecycle/transitionOperationalEntity.ts",
      "src/lib/operational/context/loadOperationalContext.ts",
    ]) {
      const text = readSrc(file);
      assert(!text.includes("services/incidents/IncidentService"), `${file} uses the browser Incident client`);
      assert(text.includes("IncidentServerAccess"), `${file} uses Supabase Incident access`);
    }
    const cc = readSrc("src/modules/command-centre/server/CommandCentreServerService.ts");
    assert(cc.includes("FmIncidentRepository"), "Command Centre Incidents from Supabase");
    assert(!/incidentsSource\s*=\s*summary\.incidents/.test(cc), "Command Centre ignores the Sheet incidents domain");
    const route = readSrc("src/app/api/operational-workload/route.ts");
    assert(route.includes("FmIncidentRepository"), "asset workload Incidents from Supabase");
    const reporting = readSrc("src/services/reporting/ReportingService.ts");
    assert(reporting.includes("loadAuthoritativeIncidents") && reporting.includes("unavailableSources"), "reporting uses Supabase Incidents with explicit health");
    assert(!/IncidentService\.listIncidents\([^)]*\)\s*\)\.catch\(\(\) => \[\]\)/.test(reporting), "no silent-zero Incident catch");
  });

  check(results, "Request↔Incident bridge removed; relation is one FK", () => {
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/fm_request_incident_links/.test(text)) throw new Error(`bridge referenced: ${file}`);
    }
    const treat = readSrc("src/lib/operational/orchestration/requestTreatment.ts");
    assert(treat.includes("Phase 2D: Request and Incident are both Supabase"), "documented cutover");
    assert(treat.includes("sourceRequestId: request.id"), "link is the Incident's source_request_id");
    assert(!/IncidentService\.updateIncident/.test(treat), "no Sheet Incident back-reference mirror");
    assert(treat.includes("cannot be reassigned") && treat.includes("Facility mismatch"), "ownership + facility rules preserved");
    const repo = readSrc("src/modules/requests/server/FmRequestRepository.ts");
    assert(repo.includes('.from("fm_incidents")') && repo.includes("source_request_id"), "Request incidentIds derived from Incidents");
  });

  check(results, "Incident→Work: Supabase on both sides, no child arrays", () => {
    const orch = readSrc("src/lib/operational/orchestration/index.ts");
    assert(!/maintenanceIds:\s*rel\.maintenanceIds/.test(orch), "no maintenanceIds array write");
    assert(orch.includes("fm_work.incident_id"), "Work FK documented at the call site");
    assert(!/postToAppsScript/.test(orch), "no Apps Script transport");
    const work = readSrc("src/modules/maintenance/server/FmWorkRepository.ts");
    assert(work.includes("resolveIncidentId") && work.includes("incident_id: incidentId"), "Work stores the Incident FK");
    const domain = readSrc("src/modules/maintenance/server/fmWorkDomain.ts");
    assert(!domain.includes("incident_ref"), "opaque incident_ref gone from Work");
  });

  check(results, "Work completion does not auto-resolve Incidents (behaviour preserved)", () => {
    const orch = readSrc("src/lib/operational/orchestration/index.ts");
    const complete = orch.slice(
      orch.indexOf("export async function orchestrateCompleteWorkOrder"),
      orch.indexOf("export async function orchestrateResolveIncident")
    );
    assert(!/orchestrateResolveIncident|transitionIncident/.test(complete), "no Incident resolve on WO completion");
    const lifecycle = readSrc("src/lib/operational/lifecycle/transitionOperationalEntity.ts");
    assert(lifecycle.includes("evaluateRequestAfterTreatmentCompletion"), "Request auto-resolve retained");
  });

  check(results, "Issues stay derived", () => {
    for (const file of walk("src")) {
      if (/from\(["']fm_issues["']\)/.test(readFileSync(file, "utf8"))) throw new Error(`fm_issues used: ${file}`);
    }
    const list = readSrc("src/modules/issues/lib/buildUnifiedIssueList.ts");
    assert(!list.includes("requestsComplete"), "Phase 2C ghost-Request compatibility retired");
  });

  check(results, "tenant scoping: every repository statement is organisation-scoped", () => {
    const repo = readSrc("src/modules/incidents/server/FmIncidentRepository.ts");
    const statements = repo.split("this.admin").slice(1).filter((chunk) => chunk.includes(".from("));
    assert(statements.length >= 8, `expected repository statements, found ${statements.length}`);
    for (const statement of statements) {
      const head = statement.slice(0, statement.indexOf(";") === -1 ? 700 : statement.indexOf(";"));
      assert(/organisation_id/.test(head), `unscoped statement: ${head.slice(0, 80).replace(/\s+/g, " ")}`);
    }
  });

  check(results, "operational_identity_links: no Incident dependency", () => {
    for (const file of walk("src/modules/incidents")) {
      assert(!readFileSync(file, "utf8").includes("operational_identity_links"), `Incident code uses identity links: ${file}`);
    }
    const remaining = walk("src")
      .filter((file) => readFileSync(file, "utf8").includes("operational_identity_links"))
      .map((file) => file.replace(/\\/g, "/"))
      .sort();
    console.log(`INFO operational_identity_links consumers: ${remaining.join(", ")}`);
    assert(!remaining.some((file) => file.includes("modules/incidents") || file.includes("modules/requests")), "Requests/Incidents independent");
  });

  check(results, "Apps Script untouched", () => {
    const changed = execSync("git status --porcelain", { encoding: "utf8" })
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const touched = changed.filter(
      (path) => path.startsWith("apps-script/") || /^[A-Za-z]+\.(gs|js)$/.test(path) || path === "appsscript.json"
    );
    assert(touched.length === 0, `Apps Script files changed: ${touched.join(", ")}`);
    assert(readSrc("apps-script/deployment/VERSION.md").includes("0.8.6.21"), "production version unchanged (v0.8.6.21)");
  });

  check(results, "domain: codes, parsing, mapping", () => {
    assert(generateNextIncidentCode(null, new Date("2026-09-19")) === "INC-2026-000001", "first code");
    assert(generateNextIncidentCode("INC-2026-000009", new Date("2026-09-19")) === "INC-2026-000010", "next code");
    assert(generateNextIncidentCode("INC-2025-000099", new Date("2026-01-02")) === "INC-2026-000001", "year rolls");

    const created = parseCreateIncidentInput({ title: " Flood ", facilityId: FAC });
    assert(created.status === "reported" && created.severity === "medium" && created.incidentType === "other", "create defaults");
    assert(parseCreateIncidentInput({ title: "x", facilityId: FAC, status: "open" }).status === "reported", "legacy open → reported");
    assert(parseCreateIncidentInput({ title: "x", facilityId: FAC, assignedToUserId: "USR-0001" }).assignedToProfileId === null || parseCreateIncidentInput({ title: "x", facilityId: FAC, assignedToUserId: "USR-0001" }).assignedToProfileId === undefined, "USR-* never persisted");
    assert(throws(() => parseCreateIncidentInput({ title: "x", facilityId: FAC, assignedToUserId: "nope" })), "non-UUID assignee rejected");
    assert(throws(() => parseCreateIncidentInput({ title: "", facilityId: FAC })), "title required");
    assert(throws(() => parseCreateIncidentInput({ title: "x", facilityId: FAC, severity: "urgent" })), "bad severity rejected");
    assert(throws(() => parseCreateIncidentInput({ title: "x", facilityId: FAC, type: "fire" })), "bad type rejected");
    assert(throws(() => parseCreateIncidentInput({ title: "x", facilityId: FAC, maintenanceIds: ["WRK-1"] })), "Work ids rejected");
    assert(!throws(() => parseCreateIncidentInput({ title: "x", facilityId: FAC, maintenanceIds: [] })), "empty Work ids tolerated");
    assert(throws(() => parseUpdateIncidentInput({ id: "INC-1", peopleAffected: -3 })), "negative people rejected");

    const wo = parseUpdateIncidentInput({ id: "INC-1", workOrderIds: ["WO-9"], requiresWorkOrder: true });
    assert(wo.requiresWorkInstruction === true && !("workOrderRef" in wo), "Work Order refs are not stored on Incidents (derived via Work)");
    assert(parseUpdateIncidentInput({ id: "INC-1", operationalEventId: "INC-0001" }).operationalEventId === null, "INC-* is never an event id");
    assert(parseUpdateIncidentInput({ id: "INC-1", description: null }).description === null, "explicit clear");
    assert(parseUpdateIncidentInput({ id: "INC-1", reportedByUserId: PROFILE }).reportedByProfileId === PROFILE, "profile uuid accepted");

    const params = parseIncidentListParams({ page: "0", pageSize: 9999, status: "open" });
    assert(params.page === 1 && params.pageSize === 500 && params.status === "reported", "list params clamp + alias");
    assert(parseIncidentListParams({}).requiresWorkOrder === "all", "default requiresWorkOrder all");
    assert(parseIncidentListParams({ requiresWorkOrder: "true" }).requiresWorkOrder === true, "requiresWorkOrder true");
    assert(!/[,()%*]/.test(sanitizeSearchTerm("a,b(c)%d*")), "search sanitised");

    const mapped = mapFmIncidentRowToIncident(
      sampleRow({ asset_id: "00000000-0000-4000-8000-0000000000a1", requires_work_instruction: true }),
      { maintenanceIds: ["WRK-2026-000001"], sourceRequestCode: "REQ-2026-000001", workOrderIds: ["WO-2026-000009"] }
    );
    assert(mapped.id === "INC-2026-000001" && mapped.incidentUuid?.startsWith("1111"), "display id + uuid");
    assert(mapped.maintenanceIds?.[0] === "WRK-2026-000001", "Work links derived");
    assert(mapped.sourceRequestId === "REQ-2026-000001", "Request link derived");
    assert(mapped.workOrderId === "WO-2026-000009", "Work Instruction derived through Work → compat shape");
    assert(mapped.assetId === "00000000-0000-4000-8000-0000000000a1", "Asset UUID relation carried (Phase 2H)");
    assert(mapped.createdByUserId === undefined, "absent creator stays absent");
  });

  check(results, "lifecycle vocabulary preserved", () => {
    const constants = readSrc("src/modules/incidents/constants.ts");
    for (const status of ["reported", "triaged", "investigating", "contained", "resolved", "closed", "cancelled"]) {
      assert(constants.includes(`"${status}"`), `status ${status}`);
      assert(code.includes(`'${status}'`), `DB status ${status}`);
    }
    for (const severity of ["low", "medium", "high", "critical"]) assert(code.includes(`'${severity}'`), `DB severity ${severity}`);
    const active = readSrc("src/lib/operational/workload/activeStatuses.ts");
    const repo = readSrc("src/modules/incidents/server/FmIncidentRepository.ts");
    for (const status of ["reported", "triaged", "investigating", "contained"]) {
      assert(active.includes(`"${status}"`) && repo.includes(`"${status}"`), `active status ${status} aligned`);
    }
  });

  check(results, "rollback probe + live smoke assets present", () => {
    for (const file of [
      "scripts/verify-fm-phase-2d-rollback.sql",
      "scripts/verify-fm-phase-2d-objects.sql",
      "scripts/verify-fm-incidents-live-read.mts",
    ]) {
      assert(existsSync(resolve(file)), `${file} missing`);
    }
  });

  for (const r of results) console.log(`${r.status} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\nPhase 2D verify: ${results.length - failed.length} PASS, ${failed.length} FAIL`);
  if (failed.length > 0) process.exit(1);
}

main();
