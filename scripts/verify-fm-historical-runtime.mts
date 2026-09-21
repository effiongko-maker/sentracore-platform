/**
 * Runtime compatibility of the historical-migration schema evolution: unknown lifecycle facts must
 * render/sort/count truthfully, and the product must still be unable to CREATE them.
 * Pure (no database). Run with: npx tsx --tsconfig tsconfig.json scripts/verify-fm-historical-runtime.mts
 */
import {
  filterWorkRows, mapFmWorkRowToMaintenance, parseCreateWorkInput, parseUpdateWorkInput, sortWorkRows, summarizeWorkOperationalPicture, WORK_STATUSES,
} from "../src/modules/maintenance/server/fmWorkDomain";
import { INSTRUCTION_STATUS_VALUES, mapFmWorkInstructionRowToWorkOrder, parseInstructionStatus } from "../src/modules/work-orders/server/fmWorkInstructionDomain";
import { ASSET_CONDITION_VALUES } from "../src/modules/assets/server/fmAssetDomain";
import { ASSET_CONDITIONS } from "../src/modules/assets/constants";
import { isPoorCondition } from "../src/services/reporting/normalize";
import { GENERATOR_SPEC } from "../src/modules/operational-logs/server/fmLogDomain";
import { normalizeReportingEntities } from "../src/services/reporting/normalizeEntities";
import { MAINTENANCE_STATUS_VARIANT } from "../src/modules/maintenance/constants";
import { WORK_ORDER_STATUS_VARIANT, WORK_ORDER_STATUSES } from "../src/modules/work-orders/constants";
import { WORK_STATUS_LABELS } from "../src/lib/operational/work/types";
import { mapFmIncidentRowToIncident, parseCreateIncidentInput, parseUpdateIncidentInput, parseIncidentListParams, INCIDENT_STATUS_VALUES, INCIDENT_SEVERITY_VALUES } from "../src/modules/incidents/server/fmIncidentDomain";
import { INCIDENT_SEVERITY_VARIANT, INCIDENT_STATUS_VARIANT } from "../src/modules/incidents/constants";
import { MAINTENANCE_PRIORITY_VARIANT } from "../src/modules/maintenance/constants";
import { WORK_ORDER_PRIORITY_VARIANT, WORK_ORDER_PRIORITIES } from "../src/modules/work-orders/constants";
import { INSTRUCTION_PRIORITY_VALUES } from "../src/modules/work-orders/server/fmWorkInstructionDomain";
import { mapIncidentStatusToIssueStatus, mapMaintenanceStatusToIssueStatus, mapSeverityToIssuePriority } from "../src/lib/operational/issues/status";
import { deriveIssueOutcome } from "../src/lib/operational/issues/outcome";
import { deriveIssueActions } from "../src/lib/operational/issues/actions";
import { computeReportingKpis, isCriticalOpenIncident, isCriticalOpenWork } from "../src/services/reporting/kpis";
import { isHighOrCriticalPriority, isOpenIncidentStatus, isMaintenanceBacklogStatus } from "../src/services/reporting/normalize";
import { ATTENTION_CRITICAL_SEVERITY, ATTENTION_OPEN_INCIDENT } from "../src/modules/workspace/attention";
import { readFileSync } from "node:fs";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const out: string[] = [];
const pass = (m: string) => out.push(`PASS ${m}`);

const workRow = (over: Record<string, unknown>) => ({
  id: "w", organisation_id: "o", code: "WRK-1", facility_id: "f", title: "t", description: null, work_kind: null, source: "manual", priority: "high",
  status: "requested", asset_id: null, source_request_id: null, incident_id: null, assigned_to_profile_id: null, reported_by_profile_id: null,
  hold_reason: null, requires_work_instruction: false, operational_event_id: null, reported_at: "2026-09-01T00:00:00Z", record_origin: "operational",
  due_at: null, scheduled_start_at: null, scheduled_end_at: null, started_at: null, completed_at: null, completion_notes: null, category_id: null,
  department: null, created_by_profile_id: null, updated_by_profile_id: null, created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z",
  incident_code: null, source_request_code: null, work_instruction_codes: [], ...over,
}) as never;

// Work
{
  const historical = mapFmWorkRowToMaintenance(workRow({ code: "WRK-H", status: "unknown", reported_at: null, record_origin: "migrated_historical" }));
  const normal = mapFmWorkRowToMaintenance(workRow({ code: "WRK-N" }));
  assert(historical.reportedAt === undefined && historical.status === "unknown" && historical.recordOrigin === "migrated_historical", "Work mapper: unknown reporting date stays undefined (never '' or now), origin exposed");
  assert(normal.recordOrigin === "operational" && normal.reportedAt === "2026-09-01T00:00:00Z", "Work mapper: operational rows unchanged");
  assert(sortWorkRows([historical, normal], "newest")[0]!.id === normal.id && sortWorkRows([historical, normal], "oldest")[0]!.id === normal.id, "unknown-dated Work sorts LAST in both directions");
  const summary = summarizeWorkOperationalPicture([historical, mapFmWorkRowToMaintenance(workRow({ code: "WRK-C", priority: "critical", status: "unknown", reported_at: null, record_origin: "migrated_historical" }))], "2026-09-21T00:00:00Z");
  assert(summary.critical === 0 && summary.inProgress === 0 && summary.awaitingAction === 0 && summary.overdue === 0, "unknown-status Work never counts as critical / in-progress / awaiting / overdue");
  assert(filterWorkRows([historical, normal], { status: "active" } as never).every((r) => r.status !== "unknown"), "the 'active' filter excludes unknown-status Work");
  assert(!WORK_STATUSES.includes("unknown" as never), "'unknown' is not a status the product can write");
  const valid = { title: "x", facilityId: "f", priority: "high", source: "manual" };
  parseCreateWorkInput(valid); // the base payload is valid, so the rejections below are caused by 'unknown' alone
  let reason = "";
  try { parseCreateWorkInput({ ...valid, status: "unknown" }); } catch (e) { reason = (e as Error).message; }
  assert(/Invalid Work status/.test(reason), "creating Work with status 'unknown' through the product is rejected");
  reason = "";
  try { parseUpdateWorkInput({ id: "11111111-1111-4111-8111-111111111111", status: "unknown" }); } catch (e) { reason = (e as Error).message; }
  assert(/Invalid Work status/.test(reason), "updating Work to status 'unknown' through the product is rejected");
  const created = parseCreateWorkInput({ ...valid, recordOrigin: "migrated_historical", reportedAt: null } as never) as unknown as Record<string, unknown>;
  assert(!("recordOrigin" in created) && !("record_origin" in created) && typeof created.reportedAt === "string", "a client can neither set record_origin nor an unknown reportedAt on create");
  assert(MAINTENANCE_STATUS_VARIANT.unknown === "neutral" && WORK_STATUS_LABELS.unknown === "Status not recorded", "unknown Work status renders neutral and explicit");
  const repo = readFileSync("src/modules/maintenance/server/FmWorkRepository.ts", "utf8");
  assert(/nullsFirst: false/.test(repo) && !/reported_at: String\(rec\.reported_at \?\? ""\)/.test(repo), "repository never coerces NULL reported_at to '' and lists unknown dates last");
  const report = normalizeReportingEntities({ asOf: "2026-09-21T00:00:00Z", users: [], facilities: [], assets: [], incidents: [], maintenance: [historical], workOrders: [] } as never) as unknown as { maintenance: Array<{ reportedAt?: string }> };
  assert(report.maintenance[0]!.reportedAt === undefined, "reporting normalisation never turns an unknown reporting date into 'now'");
  pass("Work: unknown date/status render, sort, filter and count truthfully; the product still cannot create them");
}

// Work Instructions
{
  const wi = mapFmWorkInstructionRowToWorkOrder({
    id: "i", organisation_id: "o", code: "WI-1", order_type: "job_order", work_id: "w", facility_id: "f", title: "t", status: "unknown", priority: "medium",
    requested_at: null, record_origin: "migrated_historical", created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z",
  } as never, { maintenanceCode: null, incidentCode: null } as never);
  assert(wi.requestedAt === undefined && wi.status === "unknown" && wi.recordOrigin === "migrated_historical", "WI mapper: unknown request date stays undefined; origin exposed");
  assert(JSON.stringify(wi).includes("job_order"), "WI mapper preserves the explicit order_type");
  assert(!INSTRUCTION_STATUS_VALUES.includes("unknown" as never) && !WORK_ORDER_STATUSES.includes("unknown" as never), "'unknown' is not a status the product can write");
  assert(parseInstructionStatus("open") === "open", "a valid WI status still parses");
  let reason = "";
  try { parseInstructionStatus("unknown"); } catch (e) { reason = (e as Error).message; }
  assert(/Invalid work instruction status/.test(reason), "the product rejects status 'unknown' for Work Instructions");
  assert(WORK_ORDER_STATUS_VARIANT.unknown === "neutral", "unknown WI status renders neutral");
  pass("Work Instructions: unknown request date/status preserved and never writable through the product");
}

// Assets
{
  assert(ASSET_CONDITION_VALUES.includes("unknown") && ASSET_CONDITIONS.includes("unknown"), "unknown condition is accepted by validation and offered by the UI list");
  assert(ASSET_CONDITIONS.indexOf("unknown") === ASSET_CONDITIONS.length - 1 && ASSET_CONDITIONS[0] === "excellent", "'unknown' is never first/default; existing options keep their order");
  assert(!isPoorCondition("unknown"), "unknown is not counted as poor");
  assert((ASSET_CONDITIONS as string[]).filter((c) => c === "good").length === 1 && ASSET_CONDITIONS.indexOf("unknown") !== ASSET_CONDITIONS.indexOf("good"), "unknown is a separate value from good");
  const table = readFileSync("src/modules/assets/components/AssetsTable.tsx", "utf8");
  assert(/labelize\(asset\.condition\)/.test(table), "the table renders the stored value (Unknown), not a healthy default");
  pass("Assets: unknown condition is explicit and never rendered or counted as good");
}

// Generator logs
{
  const map = GENERATOR_SPEC.map as (row: Record<string, unknown>) => Record<string, unknown>;
  const historical = map({ id: "u", code: "GENLOG-1", log_date: "2026-08-16", generator: "Gen 1", started_at: null, ended_at: null, hours: 6.4, fuel_used: null, log_basis: "hour_meter", start_meter_reading: 3265.1, end_meter_reading: 3271.5, asset_id: null, record_origin: "migrated_historical" });
  assert(historical.startedAt === null && historical.endedAt === null && historical.fuelUsed === null && historical.hours === 6.4, "hour-meter log: no invented clock times, fuel stays null (never 0), runtime from readings");
  assert(historical.startMeterReading === 3265.1 && historical.endMeterReading === 3271.5 && historical.logBasis === "hour_meter", "hour-meter facts are exposed");
  const clock = map({ id: "u2", code: "GENLOG-2", log_date: "2026-08-16", generator: "Gen 1", started_at: "2026-08-16T08:00:00Z", ended_at: "2026-08-16T10:00:00Z", hours: 2, fuel_used: 0, remarks: null });
  assert(clock.fuelUsed === 0 && clock.logBasis === "clock_times" && clock.recordOrigin === "operational", "a genuine recorded fuel of 0 stays 0; legacy rows default to clock_times/operational");
  const parsed = (GENERATOR_SPEC.parseCreate as (p: unknown) => { columns: Record<string, unknown> })({ date: "2026-08-16", generator: "Gen 1", startedAt: "2026-08-16T08:00:00Z", endedAt: "2026-08-16T09:00:00Z", fuelUsed: 5, logBasis: "hour_meter", recordOrigin: "migrated_historical" });
  assert(!("log_basis" in parsed.columns) && !("record_origin" in parsed.columns) && !("start_meter_reading" in parsed.columns), "the product cannot create hour-meter/historical generator logs");
  pass("Generator logs: unknown fuel/times preserved; forward creation stays strictly clock-based");
}

// Incidents: unknown status/severity (migrated historical) — mapping, forward strictness
{
  const incRow = (over: Record<string, unknown>) => ({
    id: "u", organisation_id: "o", code: "INC-H1", facility_id: "f", title: "Bee hive", description: null, location_detail: "Mbora", incident_type: "other", source: "manual",
    category_id: null, severity: "unknown", status: "unknown", reported_via: null, is_emergency: false, people_affected: null, hold_reason: null, requires_work_instruction: false,
    source_request_id: null, parent_incident_id: null, asset_id: null, reported_by_profile_id: null, assigned_to_profile_id: null, operational_event_id: null,
    reported_at: "2026-08-15T00:00:00+01:00", record_origin: "migrated_historical", discovered_at: null, acknowledged_at: null, response_due_at: null, contained_at: null,
    resolved_at: null, closed_at: null, immediate_actions: null, root_cause: "rc", corrective_actions: "ca", preventive_actions: null, resolution_notes: null,
    created_by_profile_id: null, updated_by_profile_id: null, created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z", ...over,
  }) as never;
  const hist = mapFmIncidentRowToIncident(incRow({}));
  assert(hist.status === "unknown" && hist.severity === "unknown" && hist.recordOrigin === "migrated_historical", "Incident mapper: unknown status/severity preserved verbatim, origin exposed");
  const legacy = mapFmIncidentRowToIncident(incRow({ status: "reported", severity: "medium", record_origin: undefined }));
  assert(legacy.status === "reported" && legacy.severity === "medium" && legacy.recordOrigin === "operational", "Incident mapper: legacy rows (no origin) stay operational and unchanged");
  assert(!INCIDENT_STATUS_VALUES.includes("unknown" as never) && !INCIDENT_SEVERITY_VALUES.includes("unknown" as never), "'unknown' is not an incident status/severity the product can write");
  for (const bad of [{ status: "unknown" }, { severity: "unknown" }]) {
    let msg = ""; try { parseCreateIncidentInput({ title: "t", facilityId: "11111111-1111-4111-8111-111111111111", ...bad }); } catch (e) { msg = (e as Error).message; }
    assert(/Invalid incident (status|severity)/.test(msg), `product create rejects ${JSON.stringify(bad)}`);
    msg = ""; try { parseUpdateIncidentInput({ id: "11111111-1111-4111-8111-111111111111", ...bad }); } catch (e) { msg = (e as Error).message; }
    assert(/Invalid incident (status|severity)/.test(msg), `product update rejects ${JSON.stringify(bad)}`);
  }
  const created = parseCreateIncidentInput({ title: "t", facilityId: "11111111-1111-4111-8111-111111111111", recordOrigin: "migrated_historical", record_origin: "migrated_historical" }) as unknown as Record<string, unknown>;
  assert(!("recordOrigin" in created) && !("record_origin" in created), "a client cannot set record_origin on an incident");
  assert(INCIDENT_SEVERITY_VARIANT.unknown === "neutral" && INCIDENT_STATUS_VARIANT.unknown === "neutral", "unknown incident status/severity render neutral, not info/warning");
  assert(MAINTENANCE_PRIORITY_VARIANT.unknown === "neutral" && WORK_ORDER_PRIORITY_VARIANT.unknown === "neutral", "unknown priority renders neutral");
  assert(!WORK_ORDER_PRIORITIES.includes("unknown" as never) && !INSTRUCTION_PRIORITY_VALUES.includes("unknown" as never), "'unknown' is not a Work Instruction priority the product can write");
  assert(parseIncidentListParams({ status: "all", severity: "all" }).status === "all", "list filters unchanged");
  const wCreate = () => parseCreateWorkInput({ title: "t", facilityId: "11111111-1111-4111-8111-111111111111", source: "manual", priority: "unknown" } as never);
  let wmsg = ""; try { wCreate(); } catch (e) { wmsg = (e as Error).message; }
  assert(/priority/i.test(wmsg), "product Work create rejects priority=unknown");
  pass("Incidents/Work/WI: unknown status/severity/priority are mapped verbatim, neutral, and NOT writable through the product");
}

// Consumers: unknown must never fall into an existing category
{
  assert(mapIncidentStatusToIssueStatus("unknown") === "unknown" && mapMaintenanceStatusToIssueStatus("unknown") === "unknown", "Issue lens: unknown Incident/Work status is 'unknown', NOT being_treated");
  assert(mapIncidentStatusToIssueStatus("reported") === "reported" && mapIncidentStatusToIssueStatus("investigating") === "being_treated" && mapMaintenanceStatusToIssueStatus("requested") === "reported", "Issue lens: known statuses map exactly as before");
  assert(mapSeverityToIssuePriority("unknown") === undefined, "Issue priority: unknown severity/priority yields NO priority (never medium)");
  const issue = { status: "unknown", treatments: [{ id: "t", kind: "work", isSuccessfullyTerminal: false, isCancelled: false }], treatmentState: { hasActiveTreatment: true, hasSuccessfulTreatment: false, treatmentCount: 1 }, workOrders: [] } as never;
  assert(deriveIssueOutcome(issue).kind === "unknown", "Issue outcome: unknown is not open / in progress / resolved even with a 'live' treatment ref");
  assert(!deriveIssueActions({ ...(issue as object), id: "i", rootMaintenanceId: "m" } as never).some((a) => a.id === "treat" || a.id === "create_work"), "Issue actions: no 'Treat' prompt is offered for an unknown-lifecycle record");
  assert(!isOpenIncidentStatus("unknown") && isOpenIncidentStatus("reported") && !isOpenIncidentStatus("resolved"), "Reporting: unknown is neither open nor closed; known open statuses unchanged");
  assert(!isHighOrCriticalPriority("unknown") && !isMaintenanceBacklogStatus("unknown"), "Reporting: unknown priority is not high/critical; unknown Work status is not backlog");
  const inc = (over: Record<string, unknown>) => ({ id: "i", status: "unknown", severity: "unknown", requiresWorkOrder: true, assignedToUserId: "", ...over }) as never;
  assert(!isCriticalOpenIncident(inc({})) && !isCriticalOpenIncident(inc({ severity: "critical" })) && isCriticalOpenIncident(inc({ severity: "critical", status: "reported" })), "Reporting: an unknown-status incident is never a 'critical open incident' (even if severity were critical)");
  assert(!isCriticalOpenWork({ status: "unknown", priority: "unknown" } as never) && !isCriticalOpenWork({ status: "unknown", priority: "critical" } as never), "Reporting: unknown-status Work is never critical open work");
  const kpis = computeReportingKpis({ asOf: "2026-09-21T00:00:00Z", facilities: [], assets: [], users: [], workOrders: [], incidents: [inc({}), inc({ status: "reported", severity: "critical", requiresWorkOrder: false })], maintenance: [{ id: "m", status: "unknown", priority: "unknown", requiresWorkOrder: true }] as never });
  assert(kpis.criticalIncidents === 1 && kpis.incidentsNeedingWorkOrder === 0 && kpis.criticalWork === 0 && kpis.maintenanceBacklog === 0 && kpis.workNeedingWorkOrder === 0 && kpis.overdueMaintenance === 0, "Reporting KPIs: historical unknown rows contribute nothing to critical/backlog/needs-work-order/overdue counts");
  assert(!ATTENTION_OPEN_INCIDENT.has("unknown" as never) && !ATTENTION_CRITICAL_SEVERITY.has("unknown"), "Workspace/Command attention: unknown is not an attention-open status or a critical/high severity");
  const picture = summarizeWorkOperationalPicture([mapFmWorkRowToMaintenance(workRow({ code: "WRK-U", priority: "unknown", status: "unknown", reported_at: null, record_origin: "migrated_historical" }))], "2026-09-21T00:00:00Z");
  assert(picture.state === "healthy" && picture.critical === 0 && picture.inProgress === 0 && picture.awaitingAction === 0 && picture.overdue === 0, "Operational picture: an unknown Work row is not critical, in progress, awaiting action or overdue");
  pass("Consumers: Issue lens/outcome/actions, Reporting KPIs, Workspace attention and Operational Picture never treat unknown as reported/open/medium/critical/resolved/overdue");
}

console.log(out.join("\n"));
console.log(`\n${out.length} groups passed`);
