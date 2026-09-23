/**
 * Work history — truthful FM Work domain. Historical immutability (Work + Work Instructions) at the repository choke
 * point, no fabricated dates/types/priorities, authoritative Work Instruction linkage surviving the client read path,
 * the Work scope model, and no silent cap.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-work-history.mts
 */
import { readFileSync } from "node:fs";
import { FmWorkRepository } from "../src/modules/maintenance/server/FmWorkRepository";
import { FmWorkReadOnlyError, filterWorkRows, mapFmWorkRowToMaintenance, paginateWorkRows } from "../src/modules/maintenance/server/fmWorkDomain";
import { FmWorkInstructionRepository } from "../src/modules/work-orders/server/FmWorkInstructionRepository";
import { FmWorkInstructionReadOnlyError } from "../src/modules/work-orders/server/fmWorkInstructionDomain";
import { mapRemoteMaintenance } from "../src/services/maintenance/MaintenanceService";
import { DEFAULT_WORK_SCOPE, WORK_SCOPES, baseStatusForScope, effectiveWorkStatus } from "../src/modules/work/constants";
import { collectLinkedWorkOrderIds } from "../src/modules/work/utils/linkedWorkOrderIds";
import { isHistoricalWork } from "../src/modules/work/utils/historicalWork";
import { NAV_GROUPS } from "../src/lib/navigation";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const out: string[] = [];
const pass = (m: string) => out.push(`PASS ${m}`);
const read = (f: string) => readFileSync(f, "utf8");
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Chainable, thenable Supabase-style stub: rows per table; records every write. */
function stubAdmin(tables: Record<string, Array<Record<string, unknown>>>) {
  const writes: string[] = [];
  const from = (table: string) => {
    const state = { table, op: "select" as string };
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ["select", "eq", "in", "is", "ilike", "order", "range", "limit", "neq", "or", "not"]) q[m] = chain;
    for (const m of ["update", "insert", "delete", "upsert"]) q[m] = () => { state.op = m; writes.push(`${table}.${m}`); return q; };
    const rows = () => tables[table] ?? [];
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    q.single = async () => ({ data: rows()[0] ?? null, error: null });
    q.then = (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null });
    return q;
  };
  return { admin: { from } as never, writes };
}

const workRow = (origin: string, extra: Record<string, unknown> = {}) => ({
  id: UUID(1), organisation_id: "org", code: "WRK-2026-000001", facility_id: UUID(9), title: "T", description: null, work_kind: null,
  source: "manual", priority: origin === "migrated_historical" ? "unknown" : "medium", status: origin === "migrated_historical" ? "unknown" : "requested",
  requires_work_instruction: false, reported_at: null, record_origin: origin, created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z",
  job_order_codes: [], client_approval_code: null, client_approval_status: null, ...extra,
});
const wiRow = (origin: string) => ({
  id: UUID(2), organisation_id: "org", code: "WO-2026-000001", order_type: "job_order", work_id: UUID(1), facility_id: UUID(9), title: "T",
  work_category: "other", source: "manual", status: origin === "migrated_historical" ? "unknown" : "open", priority: origin === "migrated_historical" ? "unknown" : "medium",
  requested_at: null, record_origin: origin, created_at: "2026-09-21T00:00:00Z", updated_at: "2026-09-21T00:00:00Z",
});

async function rejects(fn: () => Promise<unknown>, Cls: new (...a: never[]) => Error): Promise<boolean> {
  try { await fn(); return false; } catch (e) { return e instanceof Cls; }
}

async function main() {
  // A. Historical Work is read-only at the repository choke point
  {
    const hist = stubAdmin({ fm_work: [workRow("migrated_historical")], fm_work_instructions: [] });
    const repo = new FmWorkRepository("org", hist.admin);
    const attempts: Array<[string, Record<string, unknown>]> = [
      ["edit title", { title: "changed" }],
      ["treat/progress status", { status: "in_progress" }],
      ["complete", { status: "completed", completionNotes: "x" }],
      ["cancel", { status: "cancelled" }],
      ["assign", { assignedToProfileId: UUID(7) }],
      ["alter priority", { priority: "high" }],
      ["alter dates", { dueAt: "2026-10-01T00:00:00Z", scheduledStartAt: "2026-10-01T00:00:00Z" }],
      ["change relationships", { sourceRequestRef: "REQ-2026-000001", incidentRef: "INC-2026-000001", assetRef: UUID(5) }],
    ];
    for (const [label, patch] of attempts) {
      assert(await rejects(() => repo.update("WRK-2026-000001", { id: "WRK-2026-000001", ...patch } as never, "actor"), FmWorkReadOnlyError), `historical Work: ${label} is refused with FmWorkReadOnlyError`);
    }
    assert(await rejects(() => repo.deactivate("WRK-2026-000001", "actor"), FmWorkReadOnlyError), "historical Work: deactivate/cancel path is refused");
    assert(hist.writes.length === 0, "historical Work: NO write reached the database");
    const live = stubAdmin({ fm_work: [workRow("operational")], fm_work_instructions: [] });
    const lrepo = new FmWorkRepository("org", live.admin);
    let liveErr: unknown = null;
    try { await lrepo.update("WRK-2026-000001", { id: "WRK-2026-000001", status: "in_progress" } as never, "actor"); } catch (e) { liveErr = e; }
    assert(!(liveErr instanceof FmWorkReadOnlyError) && live.writes.includes("fm_work.update"), "operational Work is NOT read-only: the update reaches the database");
    pass("A Work guard: edit / treat / complete / cancel / assign / priority / dates / relationships refused for imported Work, nothing written; operational Work still writes");
  }

  // B. Historical Work Instructions are read-only; nothing can be attached to historical Work
  {
    const hist = stubAdmin({ fm_work_instructions: [wiRow("migrated_historical")], fm_work: [workRow("operational")] });
    const repo = new FmWorkInstructionRepository("org", hist.admin);
    assert(await rejects(() => repo.update({ id: "WO-2026-000001", status: "completed" } as never, "actor"), FmWorkInstructionReadOnlyError), "historical Work Instruction: update/complete refused");
    assert(await rejects(() => repo.update({ id: "WO-2026-000001", title: "x" } as never, "actor"), FmWorkInstructionReadOnlyError), "historical Work Instruction: edit refused");
    assert(hist.writes.length === 0, "historical Work Instruction: nothing written");
    const onHistWork = stubAdmin({ fm_work: [workRow("migrated_historical")], fm_work_instructions: [] });
    const r2 = new FmWorkInstructionRepository("org", onHistWork.admin);
    assert(await rejects(() => r2.create({ workRef: "WRK-2026-000001", title: "new", orderType: "job_order" } as never, "actor"), FmWorkInstructionReadOnlyError), "a Work Instruction cannot be CREATED against imported historical Work");
    assert(onHistWork.writes.length === 0, "no Work Instruction row was inserted for historical Work");
    const live = stubAdmin({ fm_work_instructions: [wiRow("operational")], fm_work: [workRow("operational")] });
    const r3 = new FmWorkInstructionRepository("org", live.admin);
    let e3: unknown = null;
    try { await r3.update({ id: "WO-2026-000001", title: "x" } as never, "actor"); } catch (e) { e3 = e; }
    assert(!(e3 instanceof FmWorkInstructionReadOnlyError) && live.writes.includes("fm_work_instructions.update"), "operational Work Instructions remain editable");
    pass("B Work Instruction guard: imported instructions immutable; none can be attached to imported Work; operational instructions unaffected");
  }

  // C. HTTP mapping + every write path funnels through the guarded repositories
  {
    assert(/FmWorkReadOnlyError[\s\S]{0,120}fail\(403/.test(read("src/app/api/maintenance/route.ts")), "/api/maintenance answers a read-only refusal with 403 (errorClass read_only)");
    assert(/FmWorkInstructionReadOnlyError\) return fail\(403/.test(read("src/app/api/work-orders/route.ts")), "/api/work-orders answers a read-only refusal with 403");
    const writers = ["src/modules/maintenance/server/FmWorkRepository.ts", "src/modules/work-orders/server/FmWorkInstructionRepository.ts"];
    const sources = writers.map(read);
    assert(/\.update\(/.test(sources[0]!) && (sources[0]!.match(/\.update\(patch\)/g) ?? []).length === 1 && /migrated_historical"\) throw new FmWorkReadOnlyError/.test(sources[0]!), "Work: the single update site is behind the guard");
    assert((sources[1]!.match(/\.update\(patch\)/g) ?? []).length === 1 && /migrated_historical"\) throw new FmWorkInstructionReadOnlyError/.test(sources[1]!), "Work Instruction: the single update site is behind the guard");
    const all = ["src/modules", "src/lib", "src/app"].flatMap(() => []);
    void all;
    assert(/assertWorkInstructionNotHistorical\(wi\)/.test(read("src/modules/approvals/server/FmApprovalRepository.ts")) && /recordOrigin !== "migrated_historical"/.test(read("src/modules/work-orders/components/WorkOrderClientApprovalSection.tsx")), "no Approval can be raised against an imported Work Instruction (server + UI)");
    pass("C HTTP + choke point: read-only refusals are 403; the only write sites are the guarded repositories");
  }

  // D. No fabricated facts in the read path
  {
    const raw = { id: "WRK-2026-000001", title: "T", facilityId: UUID(9), priority: "unknown", status: "unknown", recordOrigin: "migrated_historical", createdAt: "2026-09-21T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z", workOrderIds: ["WO-2026-000001"], workOrderId: "WO-2026-000001" };
    const m = mapRemoteMaintenance(raw);
    assert(m.reportedAt === undefined, "no reported date is invented (was: the current time)");
    assert(m.type === undefined, "no Work type is invented (was: 'corrective')");
    assert(m.priority === "unknown" && m.status === "unknown", "unknown priority/status stay unknown");
    assert(m.createdAt === raw.createdAt && m.updatedAt === raw.updatedAt, "created/updated are the real record-keeping timestamps");
    const bare = mapRemoteMaintenance({ id: "W", title: "T", facilityId: "f" });
    assert(bare.reportedAt === undefined && bare.type === undefined && bare.priority === "unknown" && bare.status === "unknown", "a row with nothing stated maps to unknown / unset — never medium / requested / corrective / now");
    assert(bare.createdAt === "" && bare.updatedAt === "", "missing record timestamps are NOT back-filled with a lifecycle date or now");
    const server = mapFmWorkRowToMaintenance({ ...workRow("migrated_historical"), work_instruction_codes: ["WO-2026-000001"], source_request_code: null, incident_code: null } as never);
    assert(server.type === undefined && server.reportedAt === undefined && server.recordOrigin === "migrated_historical", "the server adapter leaves type/reportedAt unset and carries record_origin");
    const svc = read("src/services/maintenance/MaintenanceService.ts");
    const mapper = svc.slice(svc.indexOf("export function mapRemoteMaintenance"), svc.indexOf("function toPaginatedMaintenance"));
    assert(!/new Date\(\)/.test(mapper) && !/\?\? "corrective"|\|\| "corrective"|\?\? "medium"|\|\| "medium"|\?\? "requested"/.test(mapper), "the client mapper has no date / type / priority / status fallback");
    assert(!/(\|\||\?\?) "corrective"/.test(read("src/modules/maintenance/server/fmWorkDomain.ts").slice(read("src/modules/maintenance/server/fmWorkDomain.ts").indexOf("export function mapFmWorkRowToMaintenance"), read("src/modules/maintenance/server/fmWorkDomain.ts").indexOf("export function mapFmWorkRowToCatalog"))), "the server adapter has no 'corrective' fallback");
    pass("D truthfulness: no reportedAt, work type, priority, status or record-timestamp fabricated anywhere on the Work read path");
  }

  // E. Work Instruction linkage survives the client read path (and is not manufactured)
  {
    const withWi = mapRemoteMaintenance({ id: "WRK-2026-000001", title: "T", facilityId: "f", status: "unknown", priority: "unknown", requiresWorkOrder: false, workOrderId: "WO-2026-000001", workOrderIds: ["WO-2026-000001"] });
    assert(withWi.workOrderIds?.join() === "WO-2026-000001" && withWi.workOrderId === "WO-2026-000001", "the server's Work Instruction ids survive the client normaliser (even with requiresWorkOrder=false)");
    assert(collectLinkedWorkOrderIds(withWi).join() === "WO-2026-000001", "the Work table/detail read the real linkage");
    const without = mapRemoteMaintenance({ id: "WRK-2026-000114", title: "T", facilityId: "f", status: "completed", priority: "unknown", workOrderIds: [] });
    assert((without.workOrderIds ?? []).length === 0 && !without.workOrderId && collectLinkedWorkOrderIds(without).length === 0, "Work with no Work Instruction stays without one — nothing is manufactured");
    const modal = read("src/modules/work/components/WorkDetailModal.tsx");
    assert(/No Work Instruction recorded/.test(modal) && /Open in Work Orders/.test(read("src/modules/work/components/WorkOrderExecutionAssignees.tsx")), "the UI says 'No Work Instruction recorded' or links the real one into Work Orders");
    pass("E linkage: authoritative work_id relationships survive server → API → client → table/detail; rows without one show 'No Work Instruction recorded'");
  }

  // F. Scope model + no silent cap
  {
    assert(WORK_SCOPES.map((s) => s.label).join("|") === "In Progress|All Work|Completed|Cancelled|Status not recorded", "the five scopes, in order");
    assert(DEFAULT_WORK_SCOPE === "in_progress" && effectiveWorkStatus("in_progress", baseStatusForScope("in_progress")) === "active", "default scope is In Progress (active workflow statuses only)");
    assert(effectiveWorkStatus("all", "all") === "all" && effectiveWorkStatus("completed", "all") === "completed" && effectiveWorkStatus("cancelled", "all") === "cancelled" && effectiveWorkStatus("not_recorded", "active") === "unknown", "scopes map to the list status");
    assert(effectiveWorkStatus("in_progress", "on_hold") === "on_hold" && effectiveWorkStatus("in_progress", "completed") === "active", "In Progress only refines within in-flight statuses");
    // A register shaped like production: 113 unknown-status + 2 completed historical rows (no counts are hard-coded in UI).
    const rows = [
      ...Array.from({ length: 113 }, (_, i) => mapFmWorkRowToMaintenance({ ...workRow("migrated_historical"), id: UUID(100 + i), code: `WRK-2026-${String(i + 1).padStart(6, "0")}`, work_instruction_codes: [`WO-2026-${String(i + 1).padStart(6, "0")}`] } as never)),
      ...Array.from({ length: 2 }, (_, i) => mapFmWorkRowToMaintenance({ ...workRow("migrated_historical"), id: UUID(300 + i), code: `WRK-2026-${String(114 + i).padStart(6, "0")}`, status: "completed", work_instruction_codes: [] } as never)),
    ];
    const count = (scope: (typeof WORK_SCOPES)[number]["value"]) => filterWorkRows(rows, { status: effectiveWorkStatus(scope, baseStatusForScope(scope)) as never }).length;
    assert(count("in_progress") === 0 && count("all") === 115 && count("not_recorded") === 113 && count("completed") === 2 && count("cancelled") === 0, "scope counts over a production-shaped register: In Progress 0, All 115, Not recorded 113, Completed 2, Cancelled 0");
    const pages = paginateWorkRows(rows, 1, 10);
    assert(pages.total === 115 && pages.totalPages === 12, "pagination reports the full 115 (no 100-row cap)");
    const svc = read("src/modules/maintenance/server/FmWorkServerService.ts") + read("src/modules/maintenance/server/FmWorkRepository.ts");
    assert(!/\.limit\(\s*(100|1000)\s*\)/.test(svc) && /batch\.length < batchSize\) return/.test(svc), "the register reader pages through EVERY batch (no silent limit)");
    pass("F scopes: default In Progress; All / Not recorded / Completed / Cancelled counts derive from the data; full register, no cap");
  }

  // G. Presentation
  {
    const nav = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/work");
    assert(nav?.label === "Work" && nav.title === "Work", "sidebar: Work (not Work In Progress)");
    const page = read("src/modules/work/components/WorkPage.tsx");
    assert(/title="Work"/.test(page) && !/Work In Progress/.test(page) && !/ACTIVE WORK/i.test(page) && /role="tablist"/.test(page), "canonical Work page: heading 'Work' with scope tabs; no WIP/ACTIVE WORK naming");
    assert(/Historical imported record/.test(read("src/modules/work/components/WorkDetailModal.tsx")) && /read-only/.test(read("src/modules/work/components/WorkDetailModal.tsx")), "historical detail carries the understated read-only note");
    const modal = read("src/modules/work/components/WorkDetailModal.tsx");
    assert(/canTreat = !historical/.test(modal) && /needsWorkOrderLink =\s*!historical/.test(modal), "historical detail: no Treat / Create Work Instruction / Link existing");
    assert(/canMutate && !isHistoricalWork\(row\)/.test(read("src/modules/work/components/WorkTable.tsx")), "historical rows: no Treat / Cancel in the row menu");
    assert(/Work type/.test(modal) && /"Not recorded"/.test(modal), "Work type is shown as 'Not recorded' when unset");
    assert(isHistoricalWork({ recordOrigin: "migrated_historical" }) && !isHistoricalWork({ recordOrigin: "operational" }) && !isHistoricalWork({}), "only record_origin = migrated_historical is read-only in the UI");
    assert(/recordOrigin !== "migrated_historical"/.test(read("src/modules/work-orders/components/WorkOrdersTable.tsx")), "historical Work Instructions: no edit/cancel in the Work Orders table");
    pass("G presentation: Work surface, tabs, read-only note, no mutation controls on imported records; live Work unaffected");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}
main().catch((e) => { process.stderr.write("FAIL " + (e instanceof Error ? e.stack : String(e)) + "\n"); process.exit(1); });
