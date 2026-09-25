/**
 * Runtime compatibility of the historical-migration schema evolution: unknown lifecycle facts must
 * render/sort/count truthfully, and the product must still be unable to CREATE them.
 * Pure (no database). Needs the empty `server-only` stub on NODE_PATH (the incident repository imports it):
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-fm-historical-runtime.mts
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
  incident_code: null, source_request_code: null, work_instruction_codes: [], job_order_codes: [], client_approval_code: null, client_approval_status: null, ...over,
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
  const valid = { title: "x", facilityId: "f", priority: "high", source: "manual", commercialRoute: "work_order" };
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
  // Operator review: Start/End are generator hour-meter READINGS, so the product records every new log on the
  // hour-meter basis — but it can never declare a log historical.
  const parsed = (GENERATOR_SPEC.parseCreate as (p: unknown) => { columns: Record<string, unknown> })({ date: "2026-08-16", generator: "Gen 1", startMeterReading: 10, endMeterReading: 12, fuelUsed: 5, logBasis: "clock_times", recordOrigin: "migrated_historical" });
  assert(parsed.columns.log_basis === "hour_meter" && !("record_origin" in parsed.columns) && parsed.columns.started_at === null, "the product creates hour-meter logs and can never mark one historical");
  pass("Generator logs: unknown fuel/times preserved; forward creation records hour-meter readings, never historical origin");
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

// Application consumers of the IMPORTED dataset (Reporting / Home / notifications / reports) — pure regression
{
  const { computeReportingKpis: kpisOf, kpiInsightLabels: labelsOf } = await import("../src/services/reporting/kpis");
  const { closureRateLabel, unrecordedStateNotes, riskBullets: risks } = await import("../src/services/reporting/documents/builders/shared");
  const { composeWorkspaceSnapshot } = await import("../src/services/workspace/WorkspaceService");
  const { deriveOperationalNotifications } = await import("../src/modules/workspace/utils/deriveOperationalNotifications");
  const NOW = "2026-09-21T16:00:00Z";
  const importedAt = "2026-09-21T15:37:16Z";
  const histWi = { id: "WO-H", status: "unknown", priority: "unknown", recordOrigin: "migrated_historical", createdAt: importedAt, updatedAt: importedAt, title: "h" };
  const liveWi = { id: "WO-L", status: "open", priority: "high", recordOrigin: "operational", createdAt: NOW, updatedAt: NOW, title: "l" };
  const histWork = { id: "WRK-H", status: "unknown", priority: "unknown", recordOrigin: "migrated_historical", createdAt: importedAt, updatedAt: importedAt, title: "h" };
  const asset = (over: Record<string, unknown>) => ({ id: "a", status: "unknown", condition: "unknown", ...over });
  const k = kpisOf({ asOf: NOW, facilities: [], users: [], incidents: [], assets: [asset({}), asset({ id: "b" })] as never, maintenance: [histWork] as never, workOrders: [histWi, liveWi] as never });
  assert(k.workOrdersCreatedToday === 1, "KPI: only the LIVE work order is 'created today'; the migrated one (created at import time) is not");
  assert(k.assetsOperationalPercent === null && k.activeAssets === 0, "KPI: assets with no recorded status → availability unknown (null), not 0%");
  const k2 = kpisOf({ asOf: NOW, facilities: [], users: [], incidents: [], assets: [asset({ status: "active", condition: "good" }), asset({ id: "b", status: "inactive", condition: "good" }), asset({ id: "c" })] as never, maintenance: [], workOrders: [] });
  assert(k2.assetsOperationalPercent === 50, "KPI: availability is measured over assessed assets only (1 of 2 = 50%; the unassessed one is excluded)");
  assert(k.workLifecycleUnknown === 2 && k.assetsConditionUnknown === 2, "KPI: unknown lifecycle / condition counts are disclosed");
  const lab = labelsOf({ ...k, openWorkOrders: 0, maintenanceBacklog: 0, criticalWork: 0 });
  assert(lab.activeAssets === "Operational status not recorded" && /None recorded open \(2 with no recorded status\)/.test(lab.openWorkOrders) && /None recorded open/.test(lab.maintenanceBacklog) && /None recorded critical/.test(lab.criticalWork), "labels: zeros over unrecorded records say what they exclude");
  assert(labelsOf({ ...k2, openWorkOrders: 0, maintenanceBacklog: 0, criticalWork: 0 }).maintenanceBacklog === "All clear", "labels: with nothing unrecorded the original wording is unchanged");
  assert(closureRateLabel({ workOrders: [histWi] } as never) === "—" && closureRateLabel({ workOrders: [histWi, { status: "completed" }, { status: "open" }] } as never) === "50%", "reports: closure rate ignores unknown-lifecycle rows and is '—' when none is known");
  const notes = unrecordedStateNotes({ assets: [asset({})], maintenance: [histWork], workOrders: [histWi], incidents: [{ status: "unknown" }] } as never);
  assert(notes.length === 2 && /1 asset\(s\) have no recorded condition/.test(notes[0]!), "reports: unrecorded state is disclosed");
  assert(risks({ kpis: k, projections: { blockedItems: [] }, health: { band: "healthy", score: 100 }, assets: [asset({})], maintenance: [], workOrders: [], incidents: [] } as never)[0] === "No major risks identified in the recorded data.", "reports: 'no risks' is qualified when state is unrecorded");
  const snap = composeWorkspaceSnapshot(NOW, { id: "u", name: "x", operationalUserId: null }, {
    workOrders: { ok: true, data: [histWi, liveWi] as never }, incidents: { ok: true, data: [] }, maintenance: { ok: true, data: [histWork] as never },
    criticalWork: { ok: true, total: 0 }, approvals: { ok: true, data: [] }, facilities: { ok: true, data: [] },
  } as never);
  assert(snap.activity.length === 1 && snap.activity[0]!.entityId === "WO-L", "Home activity: the migrated Work / WI never appear as fresh activity; the live one does");
  // Notifications are recipient-specific: intake Requests have no designated recipient and are never broadcast,
  // and migrated Work / WI never notify even when assigned to the recipient (their createdAt is the import time).
  const recipient = "p-recipient";
  const feed = deriveOperationalNotifications({ asOf: NOW, profileId: recipient, requests: [{ id: "REQ-H", title: "t", status: "submitted", occurredAt: "2026-06-22T00:00:00Z", createdAt: importedAt }], maintenance: [{ ...histWork, assignedToUserId: recipient }], workOrders: [{ ...histWi, assignedToUserId: recipient }], incidents: [] } as never);
  assert(feed.items.length === 0, "notifications: intake is not broadcast; migrated Work / WI notify nothing even when assigned to the recipient");
  const client = readFileSync("src/services/reports/buildClientReport.ts", "utf8");
  assert(/isOpenIncidentStatus\(i\.status\)/.test(client) && !/!\["closed", "resolved", "cancelled"\]\.includes/.test(client), "client report: open incidents require a KNOWN open status (unknown is not open)");
  const modal = readFileSync("src/modules/generator-log/components/ViewGeneratorLogModal.tsx", "utf8");
  assert(/not recorded/.test(modal) && !/Diesel \{entry\.fuelUsed\}/.test(modal), "generator modal: an unrecorded fuel figure is stated, not blank");
  pass("Application consumers: created-today, availability, zero-labels, closure rate, report disclosure, Home activity, notification timestamps, client-report open incidents, generator modal");
}

// Product reconciliation (identity, asset/diesel semantics, Issues origin, registers layout, consumables register,
// genuine report periods) — pure regression
{
  const { assetStatusPresentation } = await import("../src/modules/assets/utils");
  const { getDieselUsageFlagKinds, dieselGeneratorPresentation } = await import("../src/modules/diesel-usage/utils");
  const { originLabel } = await import("../src/modules/issues/lib/buildUnifiedIssueList");
  const { formatRegisterQuantity } = await import("../src/modules/consumables-update/components/ConsumablesRegisterEvidence");
  const { resolvePeriodRange, scopeSnapshotToPeriod, periodCoverageNotes } = await import("../src/services/reporting/periodScope");

  // assets
  assert(assetStatusPresentation({ status: "unknown" }).label === "Status not recorded" && assetStatusPresentation({ status: "unknown" }).variant === "neutral", "asset: status 'unknown' (stored by the database) reads 'Status not recorded'");
  assert(assetStatusPresentation({ status: "pending" }).label === "Pending" && assetStatusPresentation({ status: "active" }).label === "Active", "asset: a genuine Pending, and every recorded status, read as themselves (no origin-based workaround remains)");
  assert(/record_origin: rec\.record_origin != null/.test(readFileSync("src/modules/assets/server/FmAssetRepository.ts", "utf8")) && /record_origin/.test(readFileSync("src/modules/assets/server/fmAssetDomain.ts", "utf8").match(/FM_ASSET_SELECT =[\s\S]*?;/)![0]), "asset reader: record_origin is selected and carried through the repository row (a dropped column reads every asset as operational)");
  assert(!/historicalOrigin|migratedHistoricalIds/.test(readFileSync("src/modules/assets/server/FmAssetServerService.ts", "utf8") + readFileSync("src/modules/operational-logs/server/FmLogRepository.ts", "utf8")), "the provenance-join presentation workaround is gone: origin is read from record_origin");
  const assetsTable = readFileSync("src/modules/assets/components/AssetsTable.tsx", "utf8");
  const assetModal = readFileSync("src/modules/assets/components/ViewAssetModal.tsx", "utf8");
  assert(/\{asset\.code\}/.test(assetsTable) && !/\{asset\.id\}<\/p>/.test(assetsTable) && /description=\{asset\.code\}/.test(assetModal) && /value=\{asset\.code\}/.test(assetModal) && !/value=\{asset\.id\}/.test(assetModal), "asset: the visible identifier is the AST-… code, never the UUID");

  // diesel
  assert(getDieselUsageFlagKinds(1400, "migrated_historical").length === 0 && getDieselUsageFlagKinds(1400, "operational").includes("high_usage") && getDieselUsageFlagKinds(1400).includes("high_usage"), "diesel: the per-generator 100 L threshold is not applied to whole-site tank rows; operational rows keep it");
  assert(getDieselUsageFlagKinds(-5, "migrated_historical").includes("negative_consumption"), "diesel: negative consumption is arithmetic and still flags historical rows");
  const dg = dieselGeneratorPresentation({ generatorId: null, recordOrigin: "migrated_historical" });
  assert(dg.primary === "Whole-site tank" && dg.note === "No generator recorded" && dieselGeneratorPresentation({ generatorId: "Gen 1" }).primary === "Gen 1" && dieselGeneratorPresentation({ generatorId: "Gen 1", recordOrigin: "operational" }).primary === "Gen 1", "diesel: a migrated whole-site row has NO generator (null); operational generators are unchanged");
  for (const f of ["src/modules/diesel-usage/components/DieselUsageTable.tsx", "src/modules/diesel-usage/components/ViewDieselUsageModal.tsx", "src/modules/consumables-update/components/ConsumablesUpdatesTable.tsx", "src/modules/consumables-update/components/ViewConsumablesUpdateModal.tsx"]) {
    const t = readFileSync(f, "utf8");
    assert(/useFacilityName/.test(t) && !/\{entry\.facilityId \|\| "—"\}/.test(t) && !/value=\{entry\.facilityId\}/.test(t), `facility: ${f.split("/").pop()} resolves the facility name (no raw UUID)`);
  }

  // Issues
  assert(originLabel({ recordOrigin: "migrated_historical", source: "facility_manager", rootMaintenanceId: "WRK-1" } as never) === "Imported record" && originLabel({ source: "facility_manager", rootMaintenanceId: "WRK-1" } as never) === "FM logged", "Issues: an imported record is not claimed as 'FM logged'; operational origins are unchanged");
  const issuesPage = readFileSync("src/modules/issues/components/IssuesPage.tsx", "utf8");
  assert(!/pageSize: 100,\s*status: "all",\s*\}\)/.test(issuesPage) && (issuesPage.match(/loadAllPages/g) ?? []).length >= 4, "Issues: every source is read to completion (no silent first-100 cap)");

  // registers layout
  const regs = readFileSync("src/modules/operational-registers/components/OperationalRegistersPage.tsx", "utf8");
  assert(/sm:grid-cols-2 lg:grid-cols-3/.test(regs) && !/col-span-2/.test(regs) && (regs.match(/href: "\//g) ?? []).length === 6, "registers: 6 cards in a 1 / 2×3 / 3×2 grid with no orphan-stretched card");

  // consumables register
  assert(formatRegisterQuantity({ quantity: 19, unit: "gallons", raw: "19 Gallons" }) === "19 gallons" && formatRegisterQuantity({ quantity: null, unit: null, raw: null }) === "Not recorded" && formatRegisterQuantity({ quantity: 0, unit: "pcs", raw: "0pcs" }) === "0 pcs", "register: units stay with their field, blank is 'Not recorded', a recorded 0 stays 0");
  const gate = readFileSync("src/lib/access/operationalApiGate.ts", "utf8");
  assert(/"getRegisterEntries"/.test(gate) && /getRegisterEntries/.test(readFileSync("src/modules/operational-logs/server/fmLogRoute.ts", "utf8")), "register: served as a READ action (ops.view), never a write");

  // report periods
  assert(JSON.stringify(resolvePeriodRange({ kind: "month", year: 2026, month: 2 })) === '{"start":"2026-02-01","end":"2026-02-28"}' && JSON.stringify(resolvePeriodRange({ kind: "quarter", year: 2026, quarter: 3 })) === '{"start":"2026-07-01","end":"2026-09-30"}' && resolvePeriodRange({ kind: "year", year: 2026 })!.end === "2026-12-31" && resolvePeriodRange({ kind: "week", weekEnding: "2026-09-20" })!.start === "2026-09-14" && resolvePeriodRange({ kind: "current" }) === null, "periods: month / quarter / year / week resolve to inclusive ranges; a period with no range is null (current state)");
  const inc = (id: string, reportedAt: string | undefined) => ({ id, reportedAt, status: "unknown", severity: "unknown", createdAt: "2026-09-21T15:37:00Z", updatedAt: "2026-09-21T15:37:00Z" });
  const base = {
    asOf: "2026-09-21T16:00:00Z", users: [], facilities: [], assets: [],
    incidents: [inc("I-AUG", "2026-08-15T00:00:00+01:00"), inc("I-JUL", "2026-07-20T10:00:00Z"), inc("I-NODATE", undefined)],
    maintenance: [{ id: "W-U", status: "unknown", priority: "unknown", recordOrigin: "migrated_historical", createdAt: "2026-09-21T15:37:00Z", updatedAt: "2026-09-21T15:37:00Z" }, { id: "W-LIVE", status: "requested", priority: "high", reportedAt: "2026-08-20T09:00:00Z", createdAt: "2026-08-20T09:00:00Z", updatedAt: "2026-08-20T09:00:00Z" }],
    workOrders: [{ id: "WO-U", status: "unknown", priority: "unknown", recordOrigin: "migrated_historical", createdAt: "2026-09-21T15:37:00Z", updatedAt: "2026-09-21T15:37:00Z" }],
    kpis: {}, projections: {}, health: {},
  } as never;
  const aug = scopeSnapshotToPeriod(base, { kind: "month", year: 2026, month: 8 }, { timeZone: "Africa/Lagos" });
  assert(aug.incidents.map((i) => i.id).join() === "I-AUG" && aug.maintenance.map((m) => m.id).join() === "W-LIVE" && aug.workOrders.length === 0, "periods: only records DATED in August are kept (organisation-local date); July, undated and import-time-only rows are not");
  assert(aug.periodCoverage!.undated.incidents === 1 && aug.periodCoverage!.undated.maintenance === 1 && aug.periodCoverage!.undated.workOrders === 1 && aug.periodCoverage!.outsidePeriod.incidents === 1, "periods: undated records are counted as undated (not silently assigned), outside-period ones are counted apart");
  assert(aug.kpis.criticalWork === 1 && aug.kpis.maintenanceBacklog === 1, "periods: KPIs are recomputed from the in-period records only");
  const sep = scopeSnapshotToPeriod(base, { kind: "month", year: 2026, month: 9 }, { timeZone: "UTC" });
  assert(sep.maintenance.length === 0 && sep.periodCoverage!.undated.maintenance === 1, "periods: the import date (Sep 21) does NOT make undated records part of September");
  const notes = periodCoverageNotes(aug).join(" ");
  assert(/2026-08-01 to 2026-08-31/.test(notes) && /carry no recorded date, cannot be assigned to any period/.test(notes), "periods: the disclosure says what cannot be assigned");
  const noTz = scopeSnapshotToPeriod(base, { kind: "month", year: 2026, month: 8 }, { timeZone: null });
  assert(noTz.periodCoverage!.applied === false && noTz.periodCoverage!.timeZone === null && noTz.incidents.length === (base as unknown as { incidents: unknown[] }).incidents.length && /could not be applied: the organisation timezone is unavailable/.test(periodCoverageNotes(noTz).join(" ")), "periods: an UNKNOWN timezone is never assumed to be UTC — the period is not applied and the report says so");
  assert(aug.periodCoverage!.applied === true, "periods: with a configured timezone the period is applied");
  assert(scopeSnapshotToPeriod(base, { kind: "current" }) === base, "periods: a period with no range leaves the snapshot untouched (current-state)");
  const route = readFileSync("src/app/api/access/me/route.ts", "utf8");
  const reportsSvc = readFileSync("src/services/reports/ReportsService.ts", "utf8");
  assert(/organisationTimeZone: timeZone/.test(route) && /session\?\.organisation\?\.timezone/.test(route) && /loadOrganisationTimeZone\(\)/.test(reportsSvc) && !/resolvedOptions/.test(readFileSync("src/services/reports/organisationTimeZone.ts", "utf8")), "timezone: the organisation's authoritative timezone (organisations.timezone) is served and used; the browser zone is never a substitute");
  pass("Product reconciliation: asset code + status, diesel generator label + threshold, facility names, Issues origin + no cap, registers grid, consumables register read, genuine report periods");
}

// Issue → Incident routing and read-only protection of imported historical incidents (all three source types)
{
  const { composeIssueFromRequest, composeIssueFromMaintenance, composeIssueFromIncident, buildIssueOperationalView } = await import("../src/lib/operational/issues");
  const { deriveIssueActions } = await import("../src/lib/operational/issues/actions");
  const { FmIncidentRepository } = await import("../src/modules/incidents/server/FmIncidentRepository");
  const { FmIncidentReadOnlyError } = await import("../src/modules/incidents/server/fmIncidentDomain");
  const NOW = "2026-09-21T16:00:00Z";
  const ids = (a: Array<{ id: string }>) => a.map((x) => x.id);
  const incidentInput = (over: Record<string, unknown>) => ({ incident: { id: "INC-2026-000001", title: "Bee hive", facilityId: "f", status: "unknown", severity: "unknown", type: "other", createdAt: NOW, updatedAt: NOW, recordOrigin: "migrated_historical", ...over } }) as never;

  // Incident-root, imported historical: read-only source evidence only
  const hist = composeIssueFromIncident(incidentInput({}));
  const histActions = deriveIssueActions(hist);
  assert(hist.treatments.length === 0 && hist.recordOrigin === "migrated_historical", "Incident-root (imported): the incident is NOT listed as its own treatment");
  assert(ids(histActions).join() === "view" && !histActions.some((a) => a.href), `Incident-root (imported): a single non-navigating View — NO link of any kind (got ${JSON.stringify(histActions)})`);
  assert(!histActions.some((a) => ["treat", "create_work", "cancel", "view_treatment", "log_issue"].includes(a.id)), "Incident-root (imported): NO Treat / Create work / Cancel / View treatment / Log Issue");
  assert(hist.historicalSource?.reference === "INC-2026-000001", "Incident-root (imported): the source record is carried INSIDE the Issue as read-only evidence");
  assert(buildIssueOperationalView(hist).outcome.kind === "unknown", "Incident-root (imported): lifecycle stays unknown (not open / in progress / resolved)");
  // Incident-root, operational legacy: existing behaviour unchanged
  const legacy = composeIssueFromIncident(incidentInput({ id: "INC-2026-000500", status: "investigating", severity: "high", recordOrigin: undefined }));
  const legacyIds = ids(deriveIssueActions(legacy));
  assert(legacy.treatments.length === 1 && legacy.treatments[0]!.kind === "incident_handling" && legacyIds.includes("treat") && legacyIds.includes("cancel"), "Incident-root (operational legacy): unchanged — still its own legacy investigation with Treat / Cancel");
  // Work-root: routes to Work, never to Incidents
  const work = composeIssueFromMaintenance({ maintenance: { id: "WRK-2026-000001", title: "w", facilityId: "f", status: "unknown", priority: "unknown", createdAt: NOW, updatedAt: NOW, recordOrigin: "migrated_historical" } } as never);
  const workActions = deriveIssueActions(work);
  assert(workActions.filter((a) => a.href).every((a) => a.href!.startsWith("/work") && !a.href!.startsWith("/incidents")), "Work-root: every action routes to /work — never into the legacy Incidents UI");
  const liveWork = deriveIssueActions(composeIssueFromMaintenance({ maintenance: { id: "WRK-2026-000002", title: "w", facilityId: "f", status: "requested", priority: "high", createdAt: NOW, updatedAt: NOW } } as never));
  assert(liveWork.some((a) => a.id === "treat" && a.href === "/work?id=WRK-2026-000002") && liveWork.some((a) => a.id === "cancel"), "Work-root (operational): Treat / Cancel still route to Work");
  // Request-root: routes to Requests / Work, never to Incidents
  const request = composeIssueFromRequest({ request: { id: "REQ-2026-000001", title: "r", facilityId: "f", status: "submitted", maintenanceIds: [], incidentIds: [], workOrderIds: [], createdAt: NOW, updatedAt: NOW } } as never);
  const reqActions = deriveIssueActions(request);
  assert(reqActions.filter((a) => a.href).every((a) => a.href!.startsWith("/requests") || a.href!.startsWith("/work") || a.href === "/issues") && !reqActions.some((a) => a.href?.startsWith("/incidents")), "Request-root: actions route to Requests / Work / Issues — never into the legacy Incidents UI");

  // Server-side read-only enforcement (repository = the single incident write choke point), proven with a stub
  // client that records every call: an imported historical incident is refused BEFORE any write.
  const makeAdmin = (row: Record<string, unknown>) => {
    const calls: string[] = [];
    const chain: Record<string, unknown> = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") return undefined;
        return (...args: unknown[]) => {
          calls.push(prop);
          if (prop === "maybeSingle" || prop === "single") return Promise.resolve({ data: row, error: null });
          void args;
          return chain;
        };
      },
    });
    return { admin: { from: () => chain } as never, calls };
  };
  const base = { id: "u1", organisation_id: "o", code: "INC-2026-000001", facility_id: "f", title: "t", incident_type: "other", source: "manual", severity: "unknown", status: "unknown", reported_at: "2026-08-15T00:00:00Z", created_at: NOW, updated_at: NOW };
  for (const input of [{ id: "INC-2026-000001", status: "cancelled" }, { id: "INC-2026-000001", title: "edited" }, { id: "INC-2026-000001", status: "resolved", severity: "high" }]) {
    const { admin, calls } = makeAdmin({ ...base, record_origin: "migrated_historical" });
    let err: unknown = null;
    try { await new FmIncidentRepository("o", admin).update(input as never, "profile"); } catch (e) { err = e; }
    assert(err instanceof FmIncidentReadOnlyError, `imported incident: update ${JSON.stringify(input)} is refused with FmIncidentReadOnlyError`);
    assert(!calls.includes("update") && !calls.includes("insert") && !calls.includes("delete"), "imported incident: the refusal happens BEFORE any write reaches the database");
  }
  {
    const { admin, calls } = makeAdmin({ ...base, record_origin: "operational", status: "reported", severity: "medium" });
    let err: unknown = null;
    try { await new FmIncidentRepository("o", admin).update({ id: "INC-2026-000001", title: "edited" } as never, "profile"); } catch (e) { err = e; }
    assert(!(err instanceof FmIncidentReadOnlyError) && calls.includes("update"), "operational legacy incident: still updatable (the guard is origin-scoped)");
  }
  const service = readFileSync("src/modules/incidents/server/FmIncidentServerService.ts", "utf8");
  assert(/async deactivate[\s\S]{0,200}this\.update\(/.test(service) && /assertNewIncidentCreateAllowed\("FmIncidentServerService\.create"\)/.test(service), "deactivate flows through update (guarded); the incident creation freeze is intact");
  const route = readFileSync("src/app/api/incidents/route.ts", "utf8");
  assert(/FmIncidentReadOnlyError[\s\S]{0,120}fail\(403/.test(route), "API: a read-only refusal is a 403, not a 500");

  // UI
  const rowActions = readFileSync("src/modules/incidents/components/IncidentRowActions.tsx", "utf8");
  const page = readFileSync("src/modules/incidents/components/IncidentsPage.tsx", "utf8");
  const modal = readFileSync("src/modules/incidents/components/ViewIncidentModal.tsx", "utf8");
  assert((rowActions.match(/canMutate && !readOnly/g) ?? []).length === 2, "Legacy Incidents: Investigate and Cancel are hidden for imported records");
  assert(!/Log issue|router\.push/.test(page) && /Back to Issues/.test(page) && /href="\/issues"/.test(page), "Legacy Incidents: the create-styled '+ Log issue' is replaced by ordinary navigation ('Back to Issues')");
  assert(/migrated_historical/.test(modal) && (page.match(/migrated_historical/g) ?? []).length >= 3, "Legacy Incidents: edit / cancel entry points are closed for imported records in the modal and the page state");
  const svc = (f: string) => readFileSync(f, "utf8");
  assert(["src/services/incidents/IncidentService.ts", "src/services/maintenance/MaintenanceService.ts", "src/services/workOrders/WorkOrderService.ts", "src/services/dieselUsage/DieselUsageService.ts"].every((f) => /recordOrigin: readRecordOrigin\(raw\)/.test(svc(f))) && /migrated_historical/.test(svc("src/services/recordOrigin.ts")), "client services: every browser-side mapper that rebuilds an object carries recordOrigin (a dropped field made every imported record read as operational in the real UI)");
  assert(!/href=|Link\b|router\./.test(svc("src/modules/issues/components/IssueOperationalPanel.tsx").split("Source record")[1]?.split("Treatment")[0] ?? "x") && /Source record/.test(svc("src/modules/issues/components/IssueOperationalPanel.tsx")), "Issues panel: the source-record section is inline read-only evidence with no link");
  assert(/useFacilityName\(view\?\.issue\.facilityId\)/.test(readFileSync("src/modules/issues/components/IssueOperationalPanel.tsx", "utf8")) && !/<dd>\{issue\.facilityId\}<\/dd>/.test(readFileSync("src/modules/issues/components/IssueOperationalPanel.tsx", "utf8")), "Issues panel: the facility shows its name, not its UUID");
  pass("Issue → Incident routing: imported incident-root rows are read-only evidence; Work / Request roots never route into Legacy Incidents; server refuses any write to an imported incident before touching the database; creation freeze intact");
}

// Issues access-state indication: restricted (no requests.view) is disclosed subtly; ok shows nothing; the
// composition (118 vs 147) is unchanged
{
  const { restrictedRequestsNotice } = await import("../src/modules/issues/lib/requestsAccessNotice");
  const { buildUnifiedIssueList } = await import("../src/modules/issues/lib/buildUnifiedIssueList");
  const note = restrictedRequestsNotice("restricted");
  assert(note !== null && /Request-based Issues/.test(note) && /access scope/.test(note), "restricted: a note says Request-based Issues are excluded because of the operator's access scope");
  assert(!/\d/.test(note) && !/REQ-|\bcount\b|\bexist|hidden|\bsome\b|\bmore\b/i.test(note), "restricted: the note carries no count, title, identifier or hint that any Request exists");
  assert(restrictedRequestsNotice("ok") === null, "operator WITH requests.view: no restriction notice");
  assert(restrictedRequestsNotice("unavailable") === null, "a FAILED load is not 'restricted': it keeps its own distinct notice with Retry");
  const page = readFileSync("src/modules/issues/components/IssuesPage.tsx", "utf8");
  assert(/requests === null \? "restricted"/.test(page) && /const canReadRequests = can\("requests\.view"\)/.test(page), "the restricted state is derived ONLY from the absence of requests.view (not from a failure)");
  assert(/requestsSource === "unavailable"[\s\S]{0,600}Retry/.test(page) && /role="note"/.test(page) && !/onClick[^\n]*restrictedRequestsNotice/.test(page), "unavailable keeps its alert-style notice with Retry; restricted is a plain, non-interactive, non-alarming note");
  const access = readFileSync("src/lib/access/capabilities.ts", "utf8");
  assert(/requests\.view/.test(access) && !/requests\.view[^\n]*\bgrant/i.test(readFileSync("src/modules/issues/lib/requestsAccessNotice.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")), "access control is untouched: nothing here grants or requests requests.view");
  // composition unchanged: 115 Work + 3 incidents = 118 restricted; + 29 Requests = 147
  const at = "2026-09-21T15:37:00Z";
  const works = Array.from({ length: 115 }, (_, i) => ({ id: `WRK-${i}`, title: "w", facilityId: "f", status: "unknown", priority: "unknown", createdAt: at, updatedAt: at, recordOrigin: "migrated_historical" }));
  const incs = Array.from({ length: 3 }, (_, i) => ({ id: `INC-${i}`, title: "i", facilityId: "f", status: "unknown", severity: "unknown", type: "other", createdAt: at, updatedAt: at, recordOrigin: "migrated_historical" }));
  const reqs = Array.from({ length: 29 }, (_, i) => ({ id: `REQ-${i}`, title: "r", facilityId: "f", status: "closed", maintenanceIds: [], incidentIds: [], workOrderIds: [], createdAt: at, updatedAt: at }));
  assert(buildUnifiedIssueList({ requests: [], maintenances: works as never, incidents: incs as never }).length === 118, "composition (restricted): 115 Work + 3 incidents = 118, exactly as before");
  assert(buildUnifiedIssueList({ requests: reqs as never, maintenances: works as never, incidents: incs as never }).length === 147, "composition (with requests.view): 118 + 29 Requests = 147, exactly as before");
  pass("Issues access state: restricted → subtle scope note with no Request metadata; requests.view → no notice; failed load stays distinct; 118 / 147 composition unchanged");
}

console.log(out.join("\n"));
console.log(`\n${out.length} groups passed`);
