/**
 * FM Phase 2C — Requests foundation & cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-requests-foundation.mts
 *
 * Static + pure-domain always. Linked DB integrity is proven by
 * scripts/verify-fm-phase-2c-rollback.sql (rollback-only) and
 * scripts/verify-fm-requests-live-read.mts (read-only).
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  generateNextRequestCode,
  mapFmRequestRowToRecord,
  parseCreateRequestInput,
  parseRequestListParams,
  parseUpdateRequestInput,
  sanitizeSearchTerm,
  type FmRequestRow,
} from "../src/modules/requests/server/fmRequestDomain";
import { buildUnifiedIssueList } from "../src/modules/issues/lib/buildUnifiedIssueList";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail?: string };

const MIGRATION = "supabase/migrations/20260919120000_fm_requests.sql";
const FAC = "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0";

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function check(results: CheckResult[], name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({
      name,
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
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

function sampleRow(overrides: Partial<FmRequestRow> = {}): FmRequestRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "22222222-2222-4222-8222-222222222222",
    code: "REQ-2026-000001",
    facility_id: FAC,
    title: "Leaking pipe",
    description: null,
    location_detail: null,
    request_type: null,
    status: "submitted",
    occurred_at: "2026-09-19T00:00:00.000Z",
    reporter_name: null,
    reporter_contact: null,
    reported_by_profile_id: null,
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
  // Executable statements only — comments explain, they do not create objects.
  const code = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  check(results, "migration shape", () => {
    assert(sql, "migration missing");
    assert(code.includes("create table public.fm_requests"), "fm_requests");
    assert(!/fm_issues/i.test(code), "no fm_issues persistence");
    assert(!/insert into public\.fm_requests/i.test(code), "no seed rows");
    assert(!/(maintenance_ids|incident_ids|work_order_ids)/i.test(code), "no child-id arrays");
    assert(code.includes("enable row level security"), "RLS");
    assert(
      code.includes("revoke all on table public.fm_requests from public, anon, authenticated"),
      "anon/auth revoked"
    );
    assert(code.includes("grant all on table public.fm_requests to service_role"), "service_role");
    assert(!/create policy/i.test(code), "no broad JWT policies");
    assert(!code.includes("is_platform_super_admin()"), "no Super Admin bypass");
    assert(code.includes("foreign key (organisation_id, facility_id)"), "tenant-safe facility FK");
    assert(code.includes("foreign key (organisation_id, request_id)"), "tenant-safe link FK");
    assert(code.includes("fm_work_source_request_fk"), "Work provenance FK");
    assert(code.includes("drop column source_request_ref"), "opaque ref replaced by FK");
    assert(!/references public\.[a-z_]*incident/i.test(code), "no FK to unmigrated incident domain");
  });

  check(results, "API cutover: /api/requests is Supabase-only", () => {
    const route = readSrc("src/app/api/requests/route.ts");
    assert(!route.includes("postToAppsScript"), "no Apps Script call");
    assert(route.includes("FmRequestServerService"), "Supabase service");
    assert(route.includes("capabilityForRequestsProxyAction"), "capability gate preserved");
    assert(route.includes("SERVED_ACTIONS"), "createTreatment/linkTreatment fail closed");
    assert(route.includes("BLOCKED_UPDATE_KEYS"), "status/link keys blocked on update");
  });

  check(results, "authorization vocabulary unchanged", () => {
    const gate = readSrc("src/lib/access/operationalApiGate.ts");
    assert(/READ_ACTIONS\.has\(normalized\)\) return "requests\.view"/.test(gate), "reads: requests.view");
    assert(gate.includes('return "ops.create"'), "creates: ops.create");
    const caps = readSrc("src/lib/access/capabilities.ts");
    assert(
      /SUPER_ADMIN_OVERRIDE_CAPABILITIES[^=]*=\s*\[\s*"users\.view",\s*"users\.manage",\s*"platform\.admin_override",?\s*\]/.test(
        caps
      ),
      "Super Admin override not widened"
    );
    const treat = readSrc("src/modules/requests/actions/treatRequest.ts");
    assert((treat.match(/requiredCapability: "ops\.edit"/g) ?? []).length === 7, "treatment writes: ops.edit");
  });

  check(results, "browser/server boundary", () => {
    const browser = readSrc("src/services/requests/RequestService.ts");
    assert(!/typeof window/.test(browser), "browser client has no server branch");
    assert(!browser.includes("appsScriptProxy"), "browser client has no Apps Script");
    assert(!browser.includes("server-only"), "browser client imports no server module");
    for (const f of [
      "FmRequestRepository",
      "FmRequestServerService",
      "RequestServerAccess",
      "getFmRequestServerService",
      "occupantPortalTarget",
    ]) {
      assert(
        readSrc(`src/modules/requests/server/${f}.ts`).startsWith('import "server-only"'),
        `${f} is server-only`
      );
    }
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      const isClient = /^\s*["']use client["']/.test(text);
      if (isClient && /modules\/requests\/server\//.test(text)) {
        throw new Error(`client module imports server Request code: ${file}`);
      }
    }
  });

  check(results, "no Sheet Request writer remains in runtime", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/resource:\s*"requests"/.test(text) && /postToAppsScript/.test(text)) {
        offenders.push(file);
      }
      if (/action:\s*"(createTreatment|linkTreatment)"/.test(text)) offenders.push(file);
    }
    assert(offenders.length === 0, `Apps Script Request calls: ${offenders.join(", ")}`);
    const treatment = readSrc("src/lib/operational/orchestration/requestTreatment.ts");
    assert(!treatment.includes("services/requests/RequestService"), "orchestration off browser client");
    assert(!treatment.includes("RequestService.createTreatment"), "no createTreatment");
    assert(!treatment.includes("RequestService.linkTreatment"), "no linkTreatment");
    const evalSrc = readSrc("src/lib/operational/orchestration/evaluateRequestAfterTreatment.ts");
    assert(!evalSrc.includes("services/requests/RequestService"), "evaluate off browser client");
  });

  check(results, "no Apps Script Maintenance write reintroduced", () => {
    const treatment = readSrc("src/lib/operational/orchestration/requestTreatment.ts");
    assert(treatment.includes("MaintenanceServerAccess"), "Work via Supabase access");
    assert(!/postToAppsScript/.test(treatment), "no Apps Script transport in treatment");
  });

  check(results, "tenant scoping: every repository statement is organisation-scoped", () => {
    const repo = readSrc("src/modules/requests/server/FmRequestRepository.ts");
    const statements = repo.split("this.admin").slice(1).filter((chunk) => chunk.includes(".from("));
    assert(statements.length >= 10, `expected repository statements, found ${statements.length}`);
    for (const statement of statements) {
      const head = statement.slice(0, statement.indexOf(";") === -1 ? 600 : statement.indexOf(";"));
      assert(/organisation_id/.test(head), `unscoped statement: ${head.slice(0, 80).replace(/\s+/g, " ")}`);
    }
  });

  check(results, "Request→Work uses Supabase Request + Supabase Work", () => {
    const treatment = readSrc("src/lib/operational/orchestration/requestTreatment.ts");
    assert(treatment.includes("Phase 2C: Request and Work are both Supabase"), "documented cutover");
    assert(treatment.includes("sourceRequestId: request.id"), "provenance set at Work create");
    assert(treatment.includes("advanceRequestAfterTreatment"), "idempotent status advance");
    assert(
      /loadByEntityId[\s\S]{0,400}advanceRequestAfterTreatment/.test(treatment),
      "lease recovery repairs status, never duplicates Work"
    );
    assert(treatment.includes("Facility mismatch"), "facility rule preserved");
    assert(treatment.includes("cannot be reassigned"), "ownership conflict preserved");
  });

  check(results, "Issues stay derived (no fm_issues, no stored KPI)", () => {
    for (const file of walk("src")) {
      const text = readFileSync(file, "utf8");
      if (/from\(["']fm_issues["']\)/.test(text)) throw new Error(`fm_issues used: ${file}`);
    }
    assert(!existsSync(resolve("supabase/migrations/20260919120000_fm_issues.sql")), "no issues migration");
  });

  check(results, "occupant portal: real facility UUID, no hardcoded Sheet identity", () => {
    const target = readSrc("src/modules/requests/server/occupantPortalTarget.ts");
    assert(target.includes(FAC), "portal facility is the real UUID");
    for (const file of [
      "src/modules/occupant-requests/hooks/useOccupantFacilities.ts",
      "src/modules/occupant-requests/actions/listOccupantFacilities.ts",
      "src/modules/occupant-requests/components/OccupantRequestPage.tsx",
    ]) {
      assert(!/["']FAC-0001["']/.test(readSrc(file)), `hardcoded FAC-0001 in ${file}`);
    }
    const submit = readSrc("src/modules/occupant-requests/actions/submitOccupantRequest.ts");
    const track = readSrc("src/modules/occupant-requests/actions/trackOccupantRequest.ts");
    assert(!submit.includes("services/requests/RequestService"), "submit off Apps Script client");
    assert(!track.includes("services/requests/RequestService"), "track off Apps Script client");
    assert(submit.includes("assertPortalFacility"), "anonymous intake pinned to portal facility");
    assert(!/organisationId:\s*(input|raw|form)/.test(submit), "tenant never client-supplied");
  });

  check(results, "Apps Script untouched", () => {
    const changed = execSync("git status --porcelain", { encoding: "utf8" })
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const touched = changed.filter(
      (path) =>
        path.startsWith("apps-script/") ||
        /^[A-Za-z]+\.(gs|js)$/.test(path) ||
        path === "appsscript.json"
    );
    assert(touched.length === 0, `Apps Script files changed: ${touched.join(", ")}`);
    const version = readSrc("apps-script/deployment/VERSION.md");
    assert(version.includes("0.8.6.21"), "production version unchanged (v0.8.6.21)");
  });

  check(results, "operational_identity_links not consumed by Requests", () => {
    for (const file of walk("src/modules/requests")) {
      assert(
        !readFileSync(file, "utf8").includes("operational_identity_links"),
        `Request code depends on operational_identity_links: ${file}`
      );
    }
  });

  check(results, "domain: codes, parsing, mapping", () => {
    assert(generateNextRequestCode(null, new Date("2026-09-19")) === "REQ-2026-000001", "first code");
    assert(generateNextRequestCode("REQ-2026-000009", new Date("2026-09-19")) === "REQ-2026-000010", "next code");
    assert(generateNextRequestCode("REQ-2025-000099", new Date("2026-01-02")) === "REQ-2026-000001", "year rolls");

    const created = parseCreateRequestInput({ title: " Broken door ", facilityId: FAC });
    assert(created.status === "submitted" && created.title === "Broken door", "create defaults");
    assert(created.reportedByProfileId === undefined, "anonymous has no reporter profile");
    assert(
      parseCreateRequestInput({ title: "x", facilityId: FAC, reportedByUserId: "USR-0001" })
        .reportedByProfileId === undefined,
      "USR-* never persisted"
    );
    assert(throws(() => parseCreateRequestInput({ title: "x", facilityId: FAC, reportedByUserId: "nope" })), "non-UUID reporter rejected");
    assert(throws(() => parseCreateRequestInput({ title: "", facilityId: FAC })), "title required");
    assert(throws(() => parseCreateRequestInput({ title: "x", facilityId: FAC, status: "open" })), "bad status rejected");
    assert(throws(() => parseCreateRequestInput({ title: "x", facilityId: FAC, requestType: "asset" })), "bad type rejected");
    assert(throws(() => parseCreateRequestInput({ title: "x", facilityId: FAC, maintenanceIds: ["WRK-1"] })), "child ids rejected");
    assert(!throws(() => parseCreateRequestInput({ title: "x", facilityId: FAC, maintenanceIds: [] })), "empty child ids tolerated");
    assert(throws(() => parseUpdateRequestInput({ id: "REQ-1", status: "resolved" })), "status not writable via update");
    assert(throws(() => parseUpdateRequestInput({ id: "REQ-1", incidentIds: ["INC-1"] })), "links not writable via update");
    assert(parseUpdateRequestInput({ id: "REQ-1", description: null }).description === null, "explicit clear");

    const params = parseRequestListParams({ page: "0", pageSize: 9999, status: "under_review" });
    assert(params.page === 1 && params.pageSize === 500 && params.status === "under_review", "list params clamp");
    assert(parseRequestListParams({}).status === "all", "default status all");
    assert(!/[,()%*]/.test(sanitizeSearchTerm("a,b(c)%d*")), "search sanitised");

    const mapped = mapFmRequestRowToRecord(sampleRow(), {
      maintenanceIds: ["WRK-2026-000001"],
      incidentIds: ["INC-0007"],
    });
    assert(mapped.id === "REQ-2026-000001" && mapped.requestUuid?.startsWith("1111"), "display id + uuid");
    assert(mapped.maintenanceIds[0] === "WRK-2026-000001", "Work links derived");
    assert(mapped.workOrderIds.length === 0, "no Work Instruction coupling");
    assert(mapped.createdByUserId === undefined, "anonymous creator absent");
  });

  check(results, "lifecycle vocabulary preserved", () => {
    const constants = readSrc("src/modules/requests/constants.ts");
    for (const status of ["submitted", "under_review", "being_treated", "resolved", "closed", "cancelled"]) {
      assert(constants.includes(`"${status}"`), `status ${status}`);
      assert(code.includes(`'${status}'`), `DB status ${status}`);
    }
    const evalSrc = readSrc("src/lib/operational/orchestration/evaluateRequestAfterTreatment.ts");
    assert(evalSrc.includes("allLinkedTreatmentsSuccessfullyTerminal"), "auto-resolve rule retained");
    assert(evalSrc.includes("viaIncidentId"), "Incident trigger must agree with the Supabase link");
  });

  check(results, "Issues: legacy orphan Incident is standalone, linked Incident is not", () => {
    const req = mapFmRequestRowToRecord(sampleRow(), { maintenanceIds: [], incidentIds: ["INC-LINKED"] });
    const incident = (id: string, sourceRequestId?: string) =>
      ({
        id,
        title: id,
        description: "d",
        facilityId: "FAC-0001",
        status: "reported",
        type: "other",
        severity: "low",
        sourceRequestId,
        createdAt: "2026-09-19T00:00:00.000Z",
        updatedAt: "2026-09-19T00:00:00.000Z",
      }) as never;
    const list = buildUnifiedIssueList({
      requests: [req],
      maintenances: [],
      incidents: [incident("INC-LINKED", "REQ-2026-000001"), incident("INC-GHOST", "REQ-2026-000005")],
      requestsComplete: true,
    });
    const ids = list.map((item) => item.issue.id);
    assert(ids.some((id) => id.includes("REQ-2026-000001")), "Request-backed Issue present");
    assert(ids.some((id) => id.includes("INC-GHOST")), "ghost-linked Incident surfaces as standalone");
    assert(!ids.some((id) => id.includes("INC-LINKED")), "linked Incident not duplicated");
  });

  check(results, "rollback probe + live smoke assets present", () => {
    for (const file of [
      "scripts/verify-fm-phase-2c-rollback.sql",
      "scripts/verify-fm-phase-2c-objects.sql",
      "scripts/verify-fm-requests-live-read.mts",
    ]) {
      assert(existsSync(resolve(file)), `${file} missing`);
    }
  });

  for (const r of results) {
    console.log(`${r.status} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\nPhase 2C verify: ${results.length - failed.length} PASS, ${failed.length} FAIL`);
  if (failed.length > 0) process.exit(1);
}

main();
