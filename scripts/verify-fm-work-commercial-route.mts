/**
 * FM Work — commercial route ("Execution basis") foundation. No database access.
 *
 * Proves: the schema allows only work_order | job_order | NULL and backfills nothing; legacy NULL Work reads normally;
 * new Work requires an explicit basis at the Work create boundary (every creation path); both routes round-trip;
 * nothing infers the basis from an amount; historical Work stays untouched; the basis cannot change once a Work
 * Instruction exists for the Work.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-work-commercial-route.mts
 */
import { readFileSync } from "node:fs";
import {
  assertCommercialRouteChangeAllowed,
  FM_WORK_SELECT,
  mapFmWorkRowToMaintenance,
  parseCreateWorkInput,
  parseUpdateWorkInput,
  type FmWorkRow,
} from "../src/modules/maintenance/server/fmWorkDomain";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");
function throwsWith(fn: () => unknown, pattern: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (error) {
    return pattern.test(error instanceof Error ? error.message : String(error));
  }
}

function row(overrides: Partial<FmWorkRow> = {}): FmWorkRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "22222222-2222-4222-8222-222222222222",
    code: "WRK-2026-000001",
    facility_id: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
    title: "Replace filter",
    description: null,
    work_kind: null,
    source: "manual",
    priority: "high",
    status: "requested",
    asset_id: null,
    source_request_id: null,
    source_request_code: null,
    incident_id: null,
    incident_code: null,
    work_instruction_codes: [],
    job_order_codes: [],
    client_approval_code: null,
    client_approval_status: null,
    assigned_to_profile_id: null,
    reported_by_profile_id: null,
    hold_reason: null,
    requires_work_instruction: false,
    commercial_route: null,
    operational_event_id: null,
    reported_at: "2026-09-18T00:00:00.000Z",
    record_origin: "operational",
    due_at: null,
    scheduled_start_at: null,
    scheduled_end_at: null,
    started_at: null,
    completed_at: null,
    completion_notes: null,
    category_id: null,
    department: null,
    created_by_profile_id: null,
    updated_by_profile_id: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

const baseCreate = {
  title: "Chiller leak",
  facilityId: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
  priority: "medium",
  status: "requested",
};

async function main() {
  const out: string[] = [];

  // 1. Schema: nullable, only work_order | job_order, no default, no backfill.
  const sql = read("supabase/migrations/20260923150000_fm_work_commercial_route.sql");
  const code = sql.replace(/--.*$/gm, "");
  check(/add column if not exists commercial_route text;/.test(code), "nullable text column (no NOT NULL / DEFAULT)");
  check(!/not null|default/i.test(code), "no NOT NULL and no default");
  check(
    code.includes("check (commercial_route is null or commercial_route in ('work_order', 'job_order'))"),
    "check constraint allows only work_order | job_order | NULL"
  );
  check(!/\b(update|insert|delete)\b/i.test(code), "no data rewrite / backfill");
  out.push("PASS 1 schema: nullable; only work_order | job_order | NULL; no default; no backfill");

  // 2. Legacy NULL Work stays readable (and an unexpected stored value is never surfaced as a route).
  check(FM_WORK_SELECT.includes("commercial_route"), "select reads the column");
  const legacy = mapFmWorkRowToMaintenance(row());
  check(legacy.commercialRoute === undefined && legacy.title === "Replace filter", "NULL → unclassified, row reads normally");
  check(mapFmWorkRowToMaintenance(row({ commercial_route: "other" })).commercialRoute === undefined, "unknown stored value not surfaced");
  const historical = mapFmWorkRowToMaintenance(row({ record_origin: "migrated_historical", status: "unknown" }));
  check(historical.commercialRoute === undefined && historical.recordOrigin === "migrated_historical", "historical Work reads unclassified");
  const clientMapper = read("src/services/maintenance/MaintenanceService.ts");
  check(
    /function readCommercialRoute[\s\S]*?value === "work_order" \|\| value === "job_order" \? value : undefined/.test(clientMapper),
    "client mapper passes the stored value only (absent stays undefined)"
  );
  out.push("PASS 2 legacy NULL Work reads normally as unclassified (server + client mappers)");

  // 3. New Work requires an explicit basis at the Work create boundary — every creation path goes through it.
  check(throwsWith(() => parseCreateWorkInput(baseCreate), /Execution basis is required/), "missing basis rejected");
  check(throwsWith(() => parseCreateWorkInput({ ...baseCreate, commercialRoute: "" }), /Execution basis is required/), "blank basis rejected");
  check(throwsWith(() => parseCreateWorkInput({ ...baseCreate, commercialRoute: "both" }), /Invalid execution basis/), "invalid basis rejected");
  const service = read("src/modules/maintenance/server/FmWorkServerService.ts");
  check(/async create\(payload: unknown\)[\s\S]{0,120}parseCreateWorkInput\(payload\)/.test(service), "Work create always parses via parseCreateWorkInput");
  const forms: Array<[string, string]> = [
    ["src/modules/maintenance/components/MaintenanceFormModal.tsx", "Work form"],
    ["src/modules/requests/components/CreateMaintenanceFromRequestModal.tsx", "Request → Work"],
    ["src/modules/issues/components/LogIssueModal.tsx", "Log Issue"],
    ["src/modules/incidents/components/ViewIncidentModal.tsx", "Incident triage"],
  ];
  for (const [path, label] of forms) {
    check(read(path).includes("<ExecutionBasisField"), `${label} renders Execution basis`);
  }
  const field = read("src/modules/maintenance/components/ExecutionBasisField.tsx");
  check(field.includes('label="Execution basis"') && field.includes('<option value="" disabled>'), "field label + unselected start");
  const constants = read("src/modules/maintenance/constants.ts");
  check(
    constants.includes('label: "Work Order",\n    description: "No prior client approval required"') &&
      constants.includes('label: "Job Order",\n    description: "Client approval required before execution"'),
    "operator-facing option wording"
  );
  check(read("src/modules/maintenance/utils.ts").includes('commercialRoute: maintenance?.commercialRoute ?? "",'), "form starts unselected (no default)");
  const orchestration = read("src/lib/operational/orchestration/index.ts");
  const triageGuard = orchestration.indexOf('throw new ActionError("VALIDATION_ERROR", "Execution basis is required.")');
  check(triageGuard > 0 && triageGuard < orchestration.indexOf("// Idempotent resolve: do not re-triage"), "triage validates the basis before any write");
  out.push("PASS 3 new Work requires an explicit basis (domain boundary + Work form, Request → Work, Log Issue, Incident triage)");

  // 4. Both routes persist / read.
  for (const route of ["work_order", "job_order"] as const) {
    check(parseCreateWorkInput({ ...baseCreate, commercialRoute: route }).commercialRoute === route, `${route} parsed`);
    check(mapFmWorkRowToMaintenance(row({ commercial_route: route })).commercialRoute === route, `${route} read back`);
    check(parseUpdateWorkInput({ id: "WRK-2026-000001", commercialRoute: route }).commercialRoute === route, `${route} correctable`);
  }
  const repo = read("src/modules/maintenance/server/FmWorkRepository.ts");
  check(repo.includes("commercial_route: input.commercialRoute,"), "create persists the parsed basis");
  check(repo.includes("if (input.commercialRoute !== undefined) patch.commercial_route = input.commercialRoute;"), "update persists a correction");
  out.push("PASS 4 work_order and job_order parse, persist and read back");

  // 5. No amount-based (or any other) inference.
  check(
    throwsWith(() => parseCreateWorkInput({ ...baseCreate, estimatedCost: 5_000_000, actualCost: 2_000_000 }), /Execution basis is required/),
    "a large amount never supplies a basis"
  );
  check(parseCreateWorkInput({ ...baseCreate, commercialRoute: "work_order", estimatedCost: 50_000_000 }).commercialRoute === "work_order", "amount never changes the chosen basis");
  const domain = read("src/modules/maintenance/server/fmWorkDomain.ts");
  const parser = domain.slice(domain.indexOf("function parseCommercialRoute"), domain.indexOf("function rejectUsrIdentity"));
  check(parser.length > 0 && !/cost|amount|1_?000_?000|approval_amount|order_type|status|facility/i.test(parser.replace(/\/\*[\s\S]*?\*\//g, "")), "parser consults nothing but the selection");
  out.push("PASS 5 no inference from amount, Approval, WO/JO, status or facility");

  // 6. Historical data untouched: no backfill (1), and historical Work stays read-only BEFORE the route guard runs.
  const readOnly = repo.indexOf('if (existing.record_origin === "migrated_historical") throw new FmWorkReadOnlyError();');
  const guard = repo.indexOf("assertCommercialRouteChangeAllowed(existing, input.commercialRoute);");
  check(readOnly > 0 && guard > readOnly, "historical Work refused before any route change");
  check(throwsWith(() => parseUpdateWorkInput({ id: "WRK-2026-000001", commercialRoute: "" }), /Execution basis is required/), "a basis cannot be cleared");
  out.push("PASS 6 historical Work / WO / JO untouched: no backfill, historical Work stays read-only");

  // 7. Route correction refused once downstream workflow exists (Approvals reach Work only via a Work Instruction).
  const withInstruction = row({ commercial_route: "work_order", work_instruction_codes: ["WO-2026-000010"] });
  check(throwsWith(() => assertCommercialRouteChangeAllowed(withInstruction, "job_order"), /cannot be changed: WO-2026-000010/), "change refused with a WO/JO");
  check(throwsWith(() => assertCommercialRouteChangeAllowed(row({ work_instruction_codes: ["WO-2026-000011"] }), "job_order"), /cannot be changed/), "legacy Work with a WO/JO cannot be classified");
  assertCommercialRouteChangeAllowed(withInstruction, "work_order");
  assertCommercialRouteChangeAllowed(withInstruction, undefined);
  assertCommercialRouteChangeAllowed(row({ commercial_route: "work_order" }), "job_order");
  check(read("src/modules/maintenance/components/MaintenanceFormModal.tsx").includes("lockedReason={executionBasisLockedReason}"), "UI locks the basis when a WO/JO exists");
  check(read("supabase/migrations/20260923100000_fm_approvals_source_register_support.sql").includes("work_instruction_id"), "Approval ↔ Work only through work_instruction_id");
  out.push("PASS 7 correction allowed without downstream records; refused once a WO/JO (and so any Approval) exists");

  for (const line of out) console.log(line);
  console.log("verify-fm-work-commercial-route: PASS");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
