/**
 * FM Diesel Usage — pure reconciliation planner: source checklist rows vs live fm_diesel_usage rows.
 *
 * Evidence rule (operator clarification): a checklist row is a dated PHYSICAL OBSERVATION. Tank readings vary with
 * temperature and measurement timing, so arithmetic disagreement is NOT evidence that a recorded value is wrong. Every
 * dated row is represented with exactly what it records; nothing is recalculated to make a cycle balance; anything
 * not recorded is NULL (never 0). A "-" consumption is "not recorded".
 *
 * The two checklists record the tank reading at different points (established from the source):
 *   opening_reading (MBORA / NCC Annex)  underground + surface = the reading BEFORE the day's consumption
 *                                        ⇒ opening = underground + surface; closing = the recorded BALANCE.
 *   closing_reading (CSIRT)              underground + surface = the reading AFTER consumption (its BALANCE)
 *                                        ⇒ closing = the recorded BALANCE; opening = the PREVIOUS reading's recorded
 *                                        balance (the level the period started from), NULL for the first reading.
 * added (deliveries) is not a checklist column ⇒ NULL (not recorded). The tank split is always the source's two cells.
 */

import type { Sheet } from "./xlsx";

export type DieselSemantics = "opening_reading" | "closing_reading";

/** The two site checklists of the operator's workbook and the arithmetic each one uses. */
export const DIESEL_SITES = [
  { facilityCode: "FAC-0001", sheet: "MBORA DIESEL Checklist", semantics: "opening_reading" as const },
  { facilityCode: "FAC-0002", sheet: "CSIRT DIESEL Checklist", semantics: "closing_reading" as const },
];

export type DieselSourceRow = {
  sheet: string;
  row: number;
  /** ISO date, or null when the source date is not an exact serial. */
  date: string | null;
  underground: number | null;
  surface: number | null;
  /** Numeric consumption, "-" (not recorded) or null (blank). */
  consumption: number | "-" | null;
  balance: number | null;
};

export type LiveDieselRow = {
  id: string;
  code: string;
  facilityCode: string;
  logDate: string;
  opening: number | null;
  closing: number | null;
  added: number | null;
  consumption: number | null;
  underground: number | null;
  surface: number | null;
  recordOrigin: "operational" | "migrated_historical";
};

/** The stored representation of one observation (NULL = not recorded). */
export type DieselValues = {
  opening: number | null;
  closing: number | null;
  added: number | null;
  consumption: number | null;
  underground: number | null;
  surface: number | null;
};
export const DIESEL_VALUE_FIELDS = ["opening", "closing", "added", "consumption", "underground", "surface"] as const;
export const DIESEL_VALUE_COLUMNS: Record<(typeof DIESEL_VALUE_FIELDS)[number], string> = {
  opening: "opening_level", closing: "closing_level", added: "added", consumption: "consumption",
  underground: "underground_tank_qty", surface: "surface_tank_qty",
};

export type DieselChange = { field: (typeof DIESEL_VALUE_FIELDS)[number]; from: number | null; to: number | null };
export type DieselUpdate = { liveId: string; code: string; facilityCode: string; sheet: string; sourceRow: number; date: string; changes: DieselChange[]; values: DieselValues };
export type DieselInsert = DieselValues & { facilityCode: string; sheet: string; sourceRow: number; date: string; transformations: string[] };
export type DieselException = { facilityCode: string; sheet: string; sourceRow: number; date: string | null; reason: string };
export type DieselUnchanged = { code: string; date: string; sourceRow: number };

export type DieselPlan = {
  updates: DieselUpdate[];
  inserts: DieselInsert[];
  unchanged: DieselUnchanged[];
  /** Genuine exceptions: no exact date, a duplicated source date, or a live operator-entered row on that date. */
  exceptions: DieselException[];
  /** Live rows the source does not mention — left exactly as they are. */
  liveOnly: Array<{ code: string; facilityCode: string; date: string }>;
  /** Observations whose recorded values do not reconcile arithmetically (shown, never corrected). */
  variances: Array<{ facilityCode: string; date: string; variance: number }>;
  coverage: Record<string, { rows: number; first: string | null; last: string | null; dates: string[]; incomplete: number }>;
};

/** Excel day serial → ISO date (1900 date system). */
export function excelSerialToIso(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+(\.0+)?$/.test(value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 40000 || n > 60000 || !Number.isInteger(n)) return null;
  return new Date(Date.UTC(1899, 11, 30) + n * 86_400_000).toISOString().slice(0, 10);
}

export function parseQuantity(value: unknown): number | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parseConsumption(value: unknown): number | "-" | null {
  if (value == null) return null;
  const t = String(value).trim();
  if (!t) return null;
  if (t === "-") return "-";
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const same = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < 0.005);

/** The recorded values of one source row (NULL = not recorded). */
export function observationValues(semantics: DieselSemantics, r: DieselSourceRow, prev: DieselSourceRow | undefined): { values: DieselValues; transformations: string[] } {
  const tanks = r.underground != null && r.surface != null ? r.underground + r.surface : null;
  const consumption = typeof r.consumption === "number" ? r.consumption : null;
  const t: string[] = [];
  t.push(`tank split = source cells: underground ${r.underground ?? "not recorded"}, surface ${r.surface ?? "not recorded"}`);
  t.push(r.consumption === "-" ? 'consumption "-" ⇒ NULL (not recorded), never 0' : consumption == null ? "consumption blank ⇒ NULL (not recorded)" : `consumption = recorded ${consumption}`);
  t.push("added ⇒ NULL: the checklist has no delivery column (not recorded, never assumed 0)");
  t.push("generator_ref NULL: whole-site tank observation, no generator evidenced");
  let opening: number | null;
  const closing = r.balance;
  if (semantics === "opening_reading") {
    opening = tanks;
    t.push(tanks == null ? "opening ⇒ NULL (a tank cell is not recorded)" : `opening = underground + surface = ${tanks} (reading before consumption)`);
    t.push(closing == null ? "closing ⇒ NULL (balance not recorded)" : `closing = recorded balance ${closing}`);
  } else {
    opening = prev?.balance ?? null;
    t.push(opening == null ? "opening ⇒ NULL (no earlier reading in the source)" : `opening = previous reading's recorded balance ${opening} (source row ${prev!.row})`);
    t.push(closing == null ? "closing ⇒ NULL (balance not recorded)" : `closing = recorded balance ${closing} (reading after consumption)`);
  }
  if (opening != null && closing != null && consumption != null && !same(opening - closing, consumption)) {
    t.push(`reading variance ${Math.round((opening - closing - consumption) * 100) / 100} L between (opening − closing) and recorded consumption — preserved, not corrected`);
  }
  return { values: { opening, closing, added: null, consumption, underground: r.underground, surface: r.surface }, transformations: t };
}

export function planDieselReconciliation(input: {
  sites: Array<{ facilityCode: string; sheet: string; semantics: DieselSemantics }>;
  rows: DieselSourceRow[];
  live: LiveDieselRow[];
}): DieselPlan {
  const plan: DieselPlan = { updates: [], inserts: [], unchanged: [], exceptions: [], liveOnly: [], variances: [], coverage: {} };

  for (const site of input.sites) {
    const rows = input.rows.filter((r) => r.sheet === site.sheet).sort((a, b) => a.row - b.row);
    const siteLive = input.live.filter((l) => l.facilityCode === site.facilityCode);
    const liveByDate = new Map(siteLive.map((l) => [l.logDate, l]));
    const dateCount = new Map<string, number>();
    for (const r of rows) if (r.date) dateCount.set(r.date, (dateCount.get(r.date) ?? 0) + 1);
    const exception = (r: DieselSourceRow, reason: string) =>
      plan.exceptions.push({ facilityCode: site.facilityCode, sheet: site.sheet, sourceRow: r.row, date: r.date, reason });
    const seen = new Set<string>();

    rows.forEach((r, i) => {
      if (!r.date) return exception(r, "no exact source date");
      if ((dateCount.get(r.date) ?? 0) > 1) return exception(r, `date ${r.date} appears on ${dateCount.get(r.date)} source rows — which one is authoritative needs a human choice`);
      seen.add(r.date);
      const { values, transformations } = observationValues(site.semantics, r, rows[i - 1]);
      if (values.opening != null && values.closing != null && values.consumption != null) {
        const variance = Math.round((values.opening - values.closing - values.consumption) * 100) / 100;
        if (Math.abs(variance) >= 0.005) plan.variances.push({ facilityCode: site.facilityCode, date: r.date, variance });
      }
      const live = liveByDate.get(r.date);
      if (live) {
        if (live.recordOrigin !== "migrated_historical") return exception(r, `an operator-entered row (${live.code}) already exists on this date — left untouched`);
        const changes: DieselChange[] = DIESEL_VALUE_FIELDS
          .filter((f) => !same(live[f], values[f]))
          .map((f) => ({ field: f, from: live[f], to: values[f] }));
        if (changes.length === 0) plan.unchanged.push({ code: live.code, date: r.date, sourceRow: r.row });
        else plan.updates.push({ liveId: live.id, code: live.code, facilityCode: site.facilityCode, sheet: site.sheet, sourceRow: r.row, date: r.date, changes, values });
        return;
      }
      plan.inserts.push({ ...values, facilityCode: site.facilityCode, sheet: site.sheet, sourceRow: r.row, date: r.date, transformations });
    });

    for (const l of siteLive) if (!seen.has(l.logDate)) plan.liveOnly.push({ code: l.code, facilityCode: site.facilityCode, date: l.logDate });

    const dates = [...new Set([...siteLive.map((l) => l.logDate), ...plan.inserts.filter((x) => x.facilityCode === site.facilityCode).map((x) => x.date)])].sort();
    const incomplete = rows.filter((r, i) => {
      if (!r.date || !seen.has(r.date)) return false;
      const v = observationValues(site.semantics, r, rows[i - 1]).values;
      return v.opening == null || v.closing == null || v.consumption == null;
    }).length;
    plan.coverage[site.facilityCode] = { rows: dates.length, first: dates[0] ?? null, last: dates.at(-1) ?? null, dates, incomplete };
  }
  return plan;
}

/** Source rows of one checklist (header row 1; columns DATE | UNDERGROUND | SURFACE | CONSUMPTION | BALANCE). */
export function readDieselSourceRows(sheet: Sheet): DieselSourceRow[] {
  return [...sheet.rows.keys()]
    .filter((r) => r >= 2)
    .sort((a, b) => a - b)
    .map((r) => {
      const v = (c: string) => sheet.rows.get(r)?.get(c)?.value;
      return {
        sheet: sheet.name,
        row: r,
        date: excelSerialToIso(v("A")),
        underground: parseQuantity(v("B")),
        surface: parseQuantity(v("C")),
        consumption: parseConsumption(v("D")),
        balance: parseQuantity(v("E")),
      };
    })
    // A row is an observation if it carries a date or any value; wholly blank rows are layout, not data.
    .filter((r) => r.date || r.underground != null || r.surface != null || r.consumption != null || r.balance != null);
}
