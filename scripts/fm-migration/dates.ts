/**
 * Deterministic date normalisation for the FM migration.
 *
 * Known source defect: DD/MM/YYYY typed dates were sometimes stored by Excel as MM/DD (a serial
 * whose month and day are swapped). A serial is therefore AMBIGUOUS only when its day-of-month is
 * ≤ 12 (both readings are real dates). Resolution evidence order:
 *   1. explicit source text (dd/mm/yyyy, dd/mm/yy)
 *   2. a date embedded in the row's own reference
 *   3. chronological register context (neighbouring resolved rows) and "not in the future"
 *   4. otherwise: unresolved ⇒ the row is quarantined by the caller (never guessed)
 * Every normalisation returns its raw value, result and rule so nothing is fixed silently.
 */

export type DateResolution = {
  raw: string | null;
  iso: string | null;
  status: "exact" | "repaired" | "unresolved" | "blank" | "invalid";
  rule: string;
  alternatives: string[];
};

export function serialToIso(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function validIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/** dd/mm/yyyy or dd/mm/yy (day first). Returns null when the text is not a real date. */
export function parseDayFirstText(text: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/.exec(text);
  if (!m) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return validIso(year, Number(m[2]), Number(m[1]));
}

/** A leading dd/mm/yyyy date embedded in a reference such as "12/08/2026-NCC-20". */
export function embeddedReferenceDate(reference: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(reference);
  return m ? validIso(Number(m[3]), Number(m[2]), Number(m[1])) : null;
}

export function swapMonthDay(iso: string): string | null {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return validIso(y, d, m);
}

export type DateInput =
  | { kind: "blank" }
  | { kind: "text"; text: string }
  | { kind: "serial"; serial: number; text: string }
  | { kind: "other"; text: string };

export type ResolveOptions = {
  /** Fixed reference date; dates after it are "future". Recorded in the manifest. */
  asOf: string;
  /** Date embedded in the row's own reference, when the sheet has one (evidence rule 2). */
  embeddedReference?: (index: number) => string | null;
};

/**
 * Resolve a whole column in register order so chronology can be used as evidence.
 */
export function resolveDateColumn(inputs: DateInput[], options: ResolveOptions): DateResolution[] {
  const out: DateResolution[] = inputs.map((input) => {
    if (input.kind === "blank") return { raw: null, iso: null, status: "blank", rule: "blank", alternatives: [] };
    if (input.kind === "other") {
      return { raw: input.text, iso: null, status: "invalid", rule: "not_a_date_value", alternatives: [] };
    }
    if (input.kind === "text") {
      const iso = parseDayFirstText(input.text);
      return iso
        ? { raw: input.text, iso, status: "exact", rule: "source_text_day_first", alternatives: [] }
        : { raw: input.text, iso: null, status: "invalid", rule: "unparseable_text_date", alternatives: [] };
    }
    const asParsed = serialToIso(input.serial);
    const day = Number(asParsed.slice(8, 10));
    if (day > 12) {
      return { raw: input.text, iso: asParsed, status: "exact", rule: "serial_day_gt_12_unambiguous", alternatives: [] };
    }
    const swapped = swapMonthDay(asParsed);
    return {
      raw: input.text,
      iso: null,
      status: "unresolved",
      rule: "serial_ambiguous_pending",
      alternatives: swapped && swapped !== asParsed ? [asParsed, swapped] : [asParsed],
    };
  });

  // Evidence 2: embedded reference date.
  out.forEach((res, index) => {
    if (res.status !== "unresolved" || !options.embeddedReference) return;
    const embedded = options.embeddedReference(index);
    if (embedded && res.alternatives.includes(embedded)) {
      const asParsed = res.alternatives[0]!;
      res.iso = embedded;
      res.status = embedded === asParsed ? "exact" : "repaired";
      res.rule = embedded === asParsed ? "embedded_reference_date_confirms_as_parsed" : "embedded_reference_date_day_month_swapped";
    }
  });

  // Evidence 3: chronology + not-in-the-future, iterated until stable.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    out.forEach((res, index) => {
      if (res.status !== "unresolved") return;
      let prev: string | null = null;
      for (let i = index - 1; i >= 0; i--) if (out[i]!.iso) { prev = out[i]!.iso; break; }
      let next: string | null = null;
      for (let i = index + 1; i < out.length; i++) if (out[i]!.iso) { next = out[i]!.iso; break; }
      const candidates = res.alternatives.filter(
        (c) => c <= options.asOf && (prev === null || c >= prev) && (next === null || c <= next)
      );
      if (candidates.length === 1) {
        const asParsed = res.alternatives[0]!;
        res.iso = candidates[0]!;
        res.status = res.iso === asParsed ? "exact" : "repaired";
        res.rule =
          res.iso === asParsed
            ? "chronology_confirms_as_parsed_swapped_reading_rejected"
            : "chronology_and_not_future_select_day_month_swapped";
        changed = true;
      }
    });
    if (!changed) break;
  }
  out.forEach((res) => {
    if (res.status === "unresolved") res.rule = "ambiguous_both_readings_plausible_or_none";
  });
  return out;
}
