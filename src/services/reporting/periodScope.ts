import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import { organisationLocalDate } from "@/lib/time/organisationTime";
import { computeReportingHealth, computeReportingKpis } from "./kpis";
import { computeReportingProjections } from "./projections";
import type { ReportingPeriodCoverage, ReportingSnapshot } from "./types";

/** The selectable period of a report (wizard `ReportPeriodSelection` / document `DocumentPeriod`, structurally). */
export type ScopePeriod = {
  kind?: string;
  year?: number;
  month?: number;
  quarter?: number;
  /** ISO date the week ends on (week kind). */
  weekEnding?: string;
  start?: string;
  end?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Inclusive calendar-date range of the period, or null when the period does not define one (current-state view). */
export function resolvePeriodRange(period: ScopePeriod | null | undefined): { start: string; end: string } | null {
  if (!period) return null;
  const { kind, year, month, quarter } = period;
  if (kind === "month" && year && month && month >= 1 && month <= 12) {
    return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay(year, month))}` };
  }
  if (kind === "quarter" && year && quarter && quarter >= 1 && quarter <= 4) {
    const first = (quarter - 1) * 3 + 1;
    const last = first + 2;
    return { start: `${year}-${pad(first)}-01`, end: `${year}-${pad(last)}-${pad(lastDay(year, last))}` };
  }
  if (kind === "year" && year) return { start: `${year}-01-01`, end: `${year}-12-31` };
  if (kind === "week" && period.weekEnding && ISO_DATE.test(period.weekEnding.slice(0, 10))) {
    const end = period.weekEnding.slice(0, 10);
    const startMs = Date.parse(`${end}T00:00:00Z`) - 6 * 86_400_000;
    return { start: new Date(startMs).toISOString().slice(0, 10), end };
  }
  if (period.start && period.end && ISO_DATE.test(period.start.slice(0, 10)) && ISO_DATE.test(period.end.slice(0, 10))) {
    return { start: period.start.slice(0, 10), end: period.end.slice(0, 10) };
  }
  return null;
}

/**
 * The date a record BELONGS to for period purposes, or null when it has none.
 * A migrated historical record with no recorded business date has NO date: `createdAt` is the import time, so it
 * is never a fallback — an undated record cannot be assigned to any period.
 */
export function incidentDate(row: Incident): string | null {
  return row.reportedAt || null;
}
export function workDate(row: Maintenance): string | null {
  return row.reportedAt || null;
}
export function workOrderDate(row: WorkOrder): string | null {
  if (row.requestedAt) return row.requestedAt;
  return row.recordOrigin === "migrated_historical" ? null : row.createdAt || null;
}

function bucket<T>(rows: T[], dateOf: (row: T) => string | null, range: { start: string; end: string }, timeZone: string) {
  const inPeriod: T[] = [];
  let undated = 0;
  let outside = 0;
  for (const row of rows) {
    const iso = dateOf(row);
    if (!iso) { undated += 1; continue; }
    let local: string;
    try { local = organisationLocalDate(iso, timeZone); } catch { undated += 1; continue; }
    if (local >= range.start && local <= range.end) inPeriod.push(row);
    else outside += 1;
  }
  return { inPeriod, undated, outside };
}

/**
 * Restrict the snapshot's dated records (incidents, Work, Work Instructions) to the selected period and recompute
 * KPIs / projections / health from them. Assets, facilities and people are not date-scoped.
 *
 * - Records dated inside the period are kept; records dated elsewhere are excluded.
 * - Records with NO recorded date are excluded from EVERY period and counted in `periodCoverage.undated`, so the
 *   report can say so instead of silently folding them in (or out).
 * - Status figures describe the CURRENT recorded status of those records: no status history exists, so a past
 *   period's point-in-time state cannot be reconstructed.
 * - A period that defines no date range (e.g. "current period") leaves the snapshot untouched.
 */
export function scopeSnapshotToPeriod(
  snapshot: ReportingSnapshot,
  period: ScopePeriod | null | undefined,
  options: { timeZone?: string } = {}
): ReportingSnapshot {
  const range = resolvePeriodRange(period);
  if (!range) return snapshot;
  const timeZone = options.timeZone ?? "UTC";
  const incidents = bucket(snapshot.incidents, incidentDate, range, timeZone);
  const maintenance = bucket(snapshot.maintenance, workDate, range, timeZone);
  const workOrders = bucket(snapshot.workOrders, workOrderDate, range, timeZone);

  const kpis = computeReportingKpis({
    asOf: snapshot.asOf,
    facilities: snapshot.facilities,
    assets: snapshot.assets,
    incidents: incidents.inPeriod,
    maintenance: maintenance.inPeriod,
    workOrders: workOrders.inPeriod,
    users: snapshot.users,
  });
  const projections = computeReportingProjections({
    asOf: snapshot.asOf,
    incidents: incidents.inPeriod,
    maintenance: maintenance.inPeriod,
    workOrders: workOrders.inPeriod,
  });
  const periodCoverage: ReportingPeriodCoverage = {
    start: range.start,
    end: range.end,
    timeZone,
    inPeriod: { incidents: incidents.inPeriod.length, maintenance: maintenance.inPeriod.length, workOrders: workOrders.inPeriod.length },
    undated: { incidents: incidents.undated, maintenance: maintenance.undated, workOrders: workOrders.undated },
    outsidePeriod: { incidents: incidents.outside, maintenance: maintenance.outside, workOrders: workOrders.outside },
  };
  return {
    ...snapshot,
    incidents: incidents.inPeriod,
    maintenance: maintenance.inPeriod,
    workOrders: workOrders.inPeriod,
    kpis,
    projections,
    health: computeReportingHealth(kpis),
    periodCoverage,
  };
}

/** Plain-language disclosure of what a period-scoped snapshot covers and cannot cover. */
export function periodCoverageNotes(snapshot: Pick<ReportingSnapshot, "periodCoverage">): string[] {
  const c = snapshot.periodCoverage;
  if (!c) return [];
  const notes = [
    `Period ${c.start} to ${c.end} (${c.timeZone} dates): ${c.inPeriod.maintenance} Work, ${c.inPeriod.workOrders} Work Instruction and ${c.inPeriod.incidents} incident record(s) are dated within it. Status figures show each record's current recorded status — no status history exists.`,
  ];
  const undated = c.undated.maintenance + c.undated.workOrders + c.undated.incidents;
  if (undated > 0) {
    notes.push(
      `${c.undated.maintenance} Work, ${c.undated.workOrders} Work Instruction and ${c.undated.incidents} incident record(s) carry no recorded date, cannot be assigned to any period and are excluded from these figures.`
    );
  }
  return notes;
}
