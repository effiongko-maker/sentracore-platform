/**
 * FM live-data migration — DRY RUN (phase 1). Pure, deterministic and READ-ONLY:
 * reads immutable source workbooks, classifies every populated row exactly once, normalises
 * dates with explicit evidence, proposes target records with deterministic identities, and
 * reports relationships by confidence. It never connects to a database and writes no business data.
 */
import { createHash } from "node:crypto";
import { readWorkbook, sheetByName, type Sheet, type Workbook } from "./xlsx";
import {
  embeddedReferenceDate,
  resolveDateColumn,
  serialToIso,
  type DateInput,
  type DateResolution,
} from "./dates";
import { RULES_VERSION, importedId, sha256File, sha256Text } from "./ids";

export type Classification =
  | "IMPORT"
  | "TRANSFORM_IMPORT"
  | "BOOTSTRAP"
  | "PRESERVE_HISTORY"
  | "QUARANTINE"
  | "REJECT"
  | "MODEL_GAP";

export type WorkbookCode = "LETTERS" | "FM_PACK" | "MBORA";

export type LedgerRow = {
  workbook: WorkbookCode;
  sheet: string;
  row: number;
  kind: "business" | "structural";
  classification: Classification;
  reasonCode: string;
  reason: string;
  sourceRef: string | null;
  fingerprint: string;
  proposed: string[];
};

export type ProposedRecord = {
  id: string;
  target: string;
  naturalKey: string;
  values: Record<string, unknown>;
  provenance: { workbook: WorkbookCode; workbookSha256: string; sheet: string; row: number; sourceRef: string | null; fingerprint: string };
  transformations: string[];
  /** NOT NULL schema defaults that assert something the source does not say (owner-visible). */
  schemaForcedDefaults: string[];
};

export type DateException = { workbook: WorkbookCode; sheet: string; row: number; raw: string | null; normalized: string | null; status: string; rule: string; alternatives: string[] };
export type Link = { from: string; to: string; confidence: "CERTAIN" | "PROBABLE" | "POSSIBLE" | "UNSUPPORTED"; basis: string };

export type Manifest = {
  rulesVersion: string;
  asOf: string;
  batchId: string;
  organisationTimeZone: string;
  facility: { code: string; id: string | null };
  sources: Array<{ workbook: WorkbookCode; file: string; sha256: string; ignoredDuplicateOf?: string }>;
  ignoredDuplicates: Array<{ file: string; sha256: string; duplicateOf: string }>;
  ledger: LedgerRow[];
  records: ProposedRecord[];
  deferred: Array<{ id: string; target: string; reasonCode: string; row: string; values: Record<string, unknown> }>;
  /** Evidence preserved in the manifest ONLY (e.g. historical direct cost — deferred, never imported). */
  deferredEvidence: Array<{ row: string; kind: string; values: Record<string, unknown> }>;
  /** One provenance row per proposed record (central fm_migration_provenance ledger). */
  provenancePlan: Array<{ batchKey: string; workbook: WorkbookCode; workbookSha256: string; sheet: string; row: number; sourceReference: string | null; fingerprint: string; targetTable: string; targetId: string; classification: string; transformations: string[] }>;
  dateExceptions: DateException[];
  links: Link[];
  assetAliases: Array<{ asset: string; alias: string }>;
  exceptions: {
    duplicateLookingReferences: Array<{ suffix: string; references: string[] }>;
    invalidFormulas: Array<{ sheet: string; row: number; detail: string }>;
    incompleteRows: string[];
    unknownUnits: string[];
    unresolvedLocations: string[];
    unresolvedActors: string[];
    platformFinanceExcluded: string[];
    modelGaps: Array<{ code: string; description: string; affected: number }>;
    schemaForcedDefaults: Array<{ target: string; field: string; forced: string; asserts: string }>;
  };
  summary: Record<string, unknown>;
};

export type DryRunInput = {
  files: { LETTERS: string; FM_PACK: string; MBORA: string };
  /** Byte-identical duplicates of the canonical files (ignored, never ingested). */
  duplicateFiles?: Array<{ file: string; duplicateOf: WorkbookCode }>;
  asOf?: string;
  facility: { code: string; id: string | null };
  timeZone: string;
};

const FILE_LABEL: Record<WorkbookCode, string> = { LETTERS: "2026 LETTERS (4).xlsx", FM_PACK: "Facility Management Operations System Pack.xlsx", MBORA: "MBORA INCOME STATEMENT.xlsx" };

// ── small cell helpers ────────────────────────────────────────────────────────
const clean = (v: string | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
};
const isPlaceholder = (v: string | null) => v === null || /^-+$/.test(v);

function cellText(sheet: Sheet, row: number, col: string): string | null {
  return clean(sheet.rows.get(row)?.get(col)?.value ?? null);
}
function num(sheet: Sheet, row: number, col: string): number | null {
  const v = cellText(sheet, row, col);
  if (v === null || !/^-?\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}
function populatedRows(sheet: Sheet): number[] {
  return [...sheet.rows.keys()].sort((a, b) => a - b);
}
function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}
function dateInput(sheet: Sheet, row: number, col: string): DateInput {
  const cell = sheet.rows.get(row)?.get(col);
  const text = clean(cell?.value ?? null);
  if (!cell || text === null) return { kind: "blank" };
  if (cell.kind === "number" && cell.dateFormatted && /^-?\d+(\.\d+)?$/.test(text)) return { kind: "serial", serial: Number(text), text };
  if (cell.kind === "string" || cell.kind === "formula-string") return { kind: "text", text };
  return { kind: "other", text };
}

// ── explicit, reviewable alias map (no fuzzy production linking) ─────────────
const ASSET_MAP: Array<{ label: string; name: string; category: "power" | "vertical_transport"; aliases: string[]; locationText: string; facility: "ANNEX" | "CSIRT" }> = [
  { label: "1000KVA (GEN1)", name: "1000KVA (GEN 1)", category: "power", aliases: ["Gen 1", "GEN1", "GEN 1", "1000KVA Gen 1"], locationText: "GENERATOR HOUSE", facility: "ANNEX" },
  { label: "1000KVA (GEN 2)", name: "1000KVA (GEN 2)", category: "power", aliases: ["Gen 2", "GEN2", "GEN 2", "1000KVA Gen 2"], locationText: "GENERATOR HOUSE", facility: "ANNEX" },
  { label: "800KVA ( GEN 3)", name: "800KVA (GEN 3)", category: "power", aliases: ["Gen 3", "GEN3", "GEN 3", "800KVA Gen 3"], locationText: "GENERATOR HOUSE", facility: "ANNEX" },
  { label: "800KVA (GEN 4)", name: "800KVA (GEN 4)", category: "power", aliases: ["Gen 4", "GEN4", "GEN 4", "800KVA Gen 4"], locationText: "GENERATOR HOUSE", facility: "ANNEX" },
  { label: "800KVA (GEN 5)", name: "800KVA (GEN 5)", category: "power", aliases: ["Gen 5", "GEN5", "GEN 5", "800KVA Gen 5"], locationText: "GENERATOR HOUSE", facility: "ANNEX" },
  { label: "135KVA (DIGITAL PARK)", name: "135KVA (DIGITAL PARK)", category: "power", aliases: ["135KVA Digital Park generator", "Digital Park generator"], locationText: "DIGITAL PARK", facility: "ANNEX" },
  { label: "65KVA (CSIRT GEN)", name: "65KVA (CSIRT GEN)", category: "power", aliases: ["65KVA CSIRT generator", "CSIRT generator"], locationText: "CSIRT OFFICE", facility: "CSIRT" },
  { label: "LIFT A", name: "LIFT A", category: "vertical_transport", aliases: ["Lift A", "Passenger Lift (A)"], locationText: "WING B", facility: "ANNEX" },
  { label: "LIFT B", name: "LIFT B", category: "vertical_transport", aliases: ["Lift B", "Passenger Lift (B)"], locationText: "WING C", facility: "ANNEX" },
  { label: "LIFT D", name: "LIFT D", category: "vertical_transport", aliases: ["Lift D", "Passenger Lift (D)"], locationText: "WING A", facility: "ANNEX" },
];
const normLabel = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// ── link scoring (text similarity is EVIDENCE, never authority) ──────────────
function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/^(urgent:|re:)\s*/g, "")
    .replace(/(request for management approval|request for approval|approval request|payment request|acceptance of job order|request)\s*(for|to|:)?\s*/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|a|an|of|for|to|at|and|in|commission s|commissions|office|annex|mbora|ncc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function jaccard(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export function runDryRun(input: DryRunInput): Manifest {
  const asOf = input.asOf ?? "2026-09-21";
  const shas: Record<WorkbookCode, string> = {
    LETTERS: sha256File(input.files.LETTERS),
    FM_PACK: sha256File(input.files.FM_PACK),
    MBORA: sha256File(input.files.MBORA),
  };
  const books: Record<WorkbookCode, Workbook> = {
    LETTERS: readWorkbook(input.files.LETTERS),
    FM_PACK: readWorkbook(input.files.FM_PACK),
    MBORA: readWorkbook(input.files.MBORA),
  };
  const batchId = `fmmig-${sha256Text(`${RULES_VERSION}|${shas.LETTERS}|${shas.FM_PACK}|${shas.MBORA}`).slice(0, 16)}`;

  const ledger: LedgerRow[] = [];
  const records: ProposedRecord[] = [];
  const deferred: Manifest["deferred"] = [];
  const deferredEvidence: Manifest["deferredEvidence"] = [];
  const dateExceptions: DateException[] = [];
  const links: Link[] = [];
  const incompleteRows: string[] = [];
  const unresolvedLocations: string[] = [];
  const unresolvedActors = new Set<string>();
  const platformFinanceExcluded: string[] = [];
  const invalidFormulas: Manifest["exceptions"]["invalidFormulas"] = [];
  const forcedDefaults = new Map<string, { target: string; field: string; forced: string; asserts: string }>();
  const seen = new Set<string>();

  const facilityId = input.facility.id;
  const orgLocal = (iso: string) => `${iso}T00:00:00+01:00`; // Africa/Lagos, date-only source ⇒ local midnight, flagged

  function sheetOf(code: WorkbookCode, name: string): Sheet {
    return sheetByName(books[code], name);
  }
  function add(code: WorkbookCode, sheet: Sheet, row: number, kind: LedgerRow["kind"], classification: Classification, reasonCode: string, reason: string, sourceRef: string | null = null, proposed: string[] = []) {
    const key = `${code}|${sheet.name}|${row}`;
    if (seen.has(key)) throw new Error(`Row classified twice: ${key}`);
    seen.add(key);
    ledger.push({ workbook: code, sheet: sheet.name, row, kind, classification, reasonCode, reason, sourceRef, fingerprint: rowFingerprint(sheet, row), proposed });
  }
  function propose(code: WorkbookCode, sheet: Sheet, row: number, target: string, naturalKey: string, values: Record<string, unknown>, transformations: string[], defaults: Array<{ field: string; forced: string; asserts: string }> = [], sourceRef: string | null = null): ProposedRecord {
    const rec: ProposedRecord = {
      id: importedId(shas[code], sheet.name, row, target),
      target,
      naturalKey,
      values,
      provenance: { workbook: code, workbookSha256: shas[code], sheet: sheet.name, row, sourceRef, fingerprint: rowFingerprint(sheet, row) },
      transformations,
      schemaForcedDefaults: defaults.map((d) => `${target}.${d.field}=${d.forced}`),
    };
    for (const d of defaults) forcedDefaults.set(`${target}.${d.field}`, { target, field: d.field, forced: d.forced, asserts: d.asserts });
    records.push(rec);
    return rec;
  }
  let chronologyConfirmedDates = 0;
  function recordDate(code: WorkbookCode, sheet: string, row: number, res: DateResolution) {
    if (res.status === "exact" && res.rule.includes("chronology")) chronologyConfirmedDates++;
    if (res.status === "repaired" || res.status === "unresolved" || res.status === "invalid") {
      dateExceptions.push({ workbook: code, sheet, row, raw: res.raw, normalized: res.iso, status: res.status, rule: res.rule, alternatives: res.alternatives });
    }
  }
  function structural(code: WorkbookCode, sheet: Sheet, row: number, reasonCode: string, reason: string) {
    add(code, sheet, row, "structural", "REJECT", reasonCode, reason);
  }
  const derivedFormulaCells: Record<string, number> = {};
  function flagFormulas(sheet: Sheet, row: number) {
    // Every formula result is DERIVED data: never imported; recomputed from authoritative inputs when needed.
    for (const cell of sheet.rows.get(row)?.values() ?? []) {
      if (cell.formula !== null) derivedFormulaCells[sheet.name] = (derivedFormulaCells[sheet.name] ?? 0) + 1;
    }
  }

  // ═════════════════════════ FM OPERATIONS SYSTEM PACK ═══════════════════════
  const pack = (n: string) => sheetOf("FM_PACK", n);

  // Index / Compliance Tracker / title+header rows
  for (const name of ["Index", "Compliance Tracker"]) {
    const s = pack(name);
    for (const r of populatedRows(s)) structural("FM_PACK", s, r, name === "Index" ? "STRUCTURAL_TITLE" : "STRUCTURAL_TITLE_OR_HEADER", "Title/header row of an empty template register.");
  }

  // A. Maintenance Requests → fm_requests
  {
    const s = pack("Maintenance Request");
    const rows = populatedRows(s).filter((r) => r >= 4);
    for (const r of populatedRows(s).filter((r) => r < 4)) structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row.");
    const inputs = rows.map((r) => dateInput(s, r, "B"));
    const resolutions = resolveDateColumn(inputs, { asOf, embeddedReference: (i) => embeddedReferenceDate(cellText(s, rows[i]!, "A") ?? "") });
    const statusMap: Record<string, string> = { open: "submitted", "in progress": "being_treated", closed: "closed" };
    const refSuffix = new Map<string, string[]>();
    rows.forEach((r, i) => {
      const ref = cellText(s, r, "A");
      const res = resolutions[i]!;
      recordDate("FM_PACK", s.name, r, res);
      const suffix = ref ? /-NCC-0*(\d+)\s*$/i.exec(ref)?.[1] : null;
      if (ref && suffix) refSuffix.set(suffix, [...(refSuffix.get(suffix) ?? []), ref]);
      const embedded = embeddedReferenceDate(ref ?? "");
      if (res.status !== "exact" && res.status !== "repaired") {
        incompleteRows.push(`FM_PACK/${s.name}/${r}`);
        return add("FM_PACK", s, r, "business", "QUARANTINE", "AMBIGUOUS_DATE", `Date cannot be resolved with evidence (${res.rule}).`, ref);
      }
      if (embedded && embedded !== res.iso) {
        return add("FM_PACK", s, r, "business", "QUARANTINE", "REFERENCE_DATE_CONFLICT", "The date cell and the date embedded in the Request No disagree.", ref);
      }
      const statusRaw = cellText(s, r, "H");
      const status = statusRaw ? statusMap[statusRaw.toLowerCase()] : undefined;
      const issue = cellText(s, r, "G");
      if (!status || !issue) {
        incompleteRows.push(`FM_PACK/${s.name}/${r}`);
        return add("FM_PACK", s, r, "business", "QUARANTINE", "INCOMPLETE_ROW", "Missing status or issue text.", ref);
      }
      const requester = cellText(s, r, "C");
      if (requester && !isPlaceholder(requester)) unresolvedActors.add(requester);
      const transformations = [`status "${statusRaw}" ⇒ fm_requests.status "${status}" (Request lifecycle only; sets no Work/WI state)`];
      if (res.status === "repaired") transformations.push(`date repaired: raw ${res.raw} ⇒ ${res.iso} (${res.rule})`);
      if (ref && embedded === null) transformations.push(`Request No "${ref}" has an unparseable embedded date; source date cell used`);
      const rec = propose("FM_PACK", s, r, "fm_requests", ref ?? `row-${r}`, {
        facility_code: input.facility.code,
        facility_id: facilityId,
        title: issue,
        location_detail: cellText(s, r, "E"),
        request_type: "maintenance",
        status,
        occurred_on: res.iso,
        occurred_at_local: orgLocal(res.iso!),
        reporter_name: requester && !isPlaceholder(requester) ? requester : null,
        source_reference: ref,
        source_only_preserved: { department: cellText(s, r, "D"), priority: cellText(s, r, "F"), source_status: statusRaw },
      }, transformations, [], ref);
      add("FM_PACK", s, r, "business", "TRANSFORM_IMPORT", "REQUEST_IMPORT", "Maintenance Request ⇒ fm_requests.", ref, [rec.id]);
    });
    (globalThis as { __dupRefs?: Map<string, string[]> }).__dupRefs = refSuffix;
  }

  // B. Incident Report → fm_incidents (historical)
  {
    const s = pack("Incident Report");
    for (const r of populatedRows(s).filter((r) => r < 4)) structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row.");
    const rows = populatedRows(s).filter((r) => r >= 4);
    const usable = rows.filter((r) => (s.rows.get(r)?.size ?? 0) > 1);
    const resolutions = resolveDateColumn(usable.map((r) => dateInput(s, r, "B")), { asOf });
    const byRow = new Map(usable.map((r, i) => [r, resolutions[i]!] as const));
    for (const r of rows) {
      const ref = cellText(s, r, "A");
      if (!usable.includes(r)) {
        add("FM_PACK", s, r, "business", "REJECT", "TEMPLATE_RESIDUE", "Only an incident number; no business content.", ref);
        continue;
      }
      const res = byRow.get(r)!;
      recordDate("FM_PACK", s.name, r, res);
      const location = cellText(s, r, "C");
      if (res.status !== "exact" && res.status !== "repaired") {
        incompleteRows.push(`FM_PACK/${s.name}/${r}`);
        add("FM_PACK", s, r, "business", "QUARANTINE", "AMBIGUOUS_DATE", `Date cannot be resolved (${res.rule}).`, ref);
        continue;
      }
      if (!location || !/^mbora$/i.test(location)) {
        unresolvedLocations.push(`FM_PACK/${s.name}/${r}: "${location}"`);
        add("FM_PACK", s, r, "business", "QUARANTINE", "UNRESOLVED_FACILITY", `Location "${location}" is not the existing NCC Annex facility (FAC-0001); no facility may be invented.`, ref);
        continue;
      }
      const owner = cellText(s, r, "G");
      const transformations = res.status === "repaired" ? [`date repaired: raw ${res.raw} ⇒ ${res.iso} (${res.rule})`] : [];
      const rec = propose("FM_PACK", s, r, "fm_incidents", `incident-${ref}`, {
        facility_code: input.facility.code,
        facility_id: facilityId,
        title: cellText(s, r, "D"),
        location_detail: location,
        reported_on: res.iso,
        reported_at_local: orgLocal(res.iso!),
        root_cause: cellText(s, r, "E"),
        corrective_actions: cellText(s, r, "F"),
        incident_type: "other",
        severity: "medium",
        source: "manual",
        status: "reported",
        source_only_preserved: { owner_text: owner, source_incident_no: ref },
      }, transformations, [
        { field: "status", forced: "reported", asserts: "source has no incident status; every valid value asserts a lifecycle position" },
        { field: "severity", forced: "medium", asserts: "source has no severity" },
        { field: "incident_type", forced: "other", asserts: "source has no type" },
      ], ref);
      add("FM_PACK", s, r, "business", "TRANSFORM_IMPORT", "INCIDENT_HISTORICAL_IMPORT", "Historical incident ⇒ fm_incidents (creation stays frozen in product).", ref, [rec.id]);
    }
  }

  // H. Facility Inspection → preserve / model gap
  {
    const s = pack("Facility Inspection");
    for (const r of populatedRows(s)) {
      if (r < 4) structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row.");
      else add("FM_PACK", s, r, "business", "MODEL_GAP", "NO_INSPECTION_MODEL", "Facility inspection evidence has no domain; not converted to a Request/Issue. Preserved as migration evidence.");
    }
  }

  // C. Asset Register → fm_assets (bootstrap) + explicit aliases
  {
    const s = pack("Asset Register");
    for (const r of populatedRows(s).filter((r) => r < 4)) structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row.");
    for (const r of populatedRows(s).filter((r) => r >= 4)) {
      const label = cellText(s, r, "B");
      const entry = ASSET_MAP.find((a) => normLabel(a.label) === normLabel(label ?? ""));
      if (!entry) {
        add("FM_PACK", s, r, "business", "QUARANTINE", "ASSET_LABEL_NOT_IN_ALIAS_MAP", `Asset label "${label}" has no explicit alias-map entry.`, label);
        continue;
      }
      if (entry.facility !== "ANNEX") {
        unresolvedLocations.push(`FM_PACK/${s.name}/${r}: "${entry.locationText}"`);
        add("FM_PACK", s, r, "business", "QUARANTINE", "UNRESOLVED_FACILITY", `Asset location "${entry.locationText}" is the separate CSIRT office; no CSIRT facility exists and none may be invented.`, label);
        continue;
      }
      const rec = propose("FM_PACK", s, r, "fm_assets", `asset:${entry.name}`, {
        facility_code: input.facility.code,
        facility_id: facilityId,
        name: entry.name,
        category: entry.category,
        manufacturer: null,
        model: null,
        serial_number: null,
        condition: "unknown",
        status: "pending",
        criticality: "unassessed",
        source_only_preserved: { source_label: label, location_text: entry.locationText, oem: null, pm_frequency: null },
      }, [`source label "${label}" ⇒ canonical name "${entry.name}"`, `category "${entry.category}" from the explicit alias map (label evidence), not inference from text`, "condition unknown: the source condition is blank (explicit 'unknown', never 'good')"], [], label);
      add("FM_PACK", s, r, "business", "BOOTSTRAP", "ASSET_BOOTSTRAP", "Asset ⇒ fm_assets with explicit aliases; OEM/model/serial/PM frequency remain unknown.", label, [rec.id]);
    }
  }

  // D. Maintenance Register → quarantine-first
  {
    const s = pack("Maintenance Register");
    for (const r of populatedRows(s)) {
      if (r < 4) structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row.");
      else if ((s.rows.get(r)?.size ?? 0) <= 1) add("FM_PACK", s, r, "business", "REJECT", "TEMPLATE_RESIDUE", "Only a number; no business content.");
      else {
        incompleteRows.push(`FM_PACK/${s.name}/${r}`);
        add("FM_PACK", s, r, "business", "QUARANTINE", "REGISTER_REQUEST_NO_UNPROVEN", "Request No 1.0 is not proven to be a Maintenance Request identifier; WO No blank. No Work/WI history is manufactured.", cellText(s, r, "B"));
      }
    }
  }

  // I. KPI Dashboard → preserved reporting evidence
  {
    const s = pack("KPI Dashboard");
    for (const r of populatedRows(s)) {
      if (r < 4) structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row.");
      else add("FM_PACK", s, r, "business", "PRESERVE_HISTORY", "KPI_REPORTING_EVIDENCE", "Spreadsheet KPI conclusion preserved as historical reporting evidence; not an authoritative metric, not an operational event.");
    }
  }

  // G. Consumables → historical register evidence (explicit units; no dates, zeroes or derived balances)
  {
    const s = pack("Consumables Register");
    const UNIT_ALIASES: Record<string, string> = { pcs: "pcs", pc: "pcs", pcks: "packs", pck: "packs", packs: "packs", pack: "packs", gallons: "gallons", gallon: "gallons" };
    const unknownUnits = new Set<string>();
    // "19 Gallons" / "12pcs" ⇒ { quantity, unit }; "-" and blank ⇒ unknown (null), NEVER zero.
    const parseQty = (raw: string | null): { quantity: number | null; unit: string | null; raw: string | null; ok: boolean } => {
      if (raw === null) return { quantity: null, unit: null, raw: null, ok: true };
      if (isPlaceholder(raw)) return { quantity: null, unit: null, raw, ok: true };
      const m = /^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/.exec(raw);
      if (!m) return { quantity: null, unit: null, raw, ok: false };
      const unit = UNIT_ALIASES[m[2]!.toLowerCase()];
      if (!unit) { unknownUnits.add(m[2]!); return { quantity: null, unit: null, raw, ok: false }; }
      return { quantity: Number(m[1]), unit, raw, ok: true };
    };
    const seenNames = new Set<string>();
    for (const r of populatedRows(s)) {
      if (r < 4) { structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row."); continue; }
      const name = cellText(s, r, "A");
      const fields = { opening: parseQty(cellText(s, r, "B")), received: parseQty(cellText(s, r, "C")), issued: parseQty(cellText(s, r, "D")), closing: parseQty(cellText(s, r, "E")), reorder: parseQty(cellText(s, r, "F")) };
      if (!name) { add("FM_PACK", s, r, "business", "QUARANTINE", "INCOMPLETE_ROW", "Item name missing."); continue; }
      if (Object.values(fields).some((f) => !f.ok)) {
        add("FM_PACK", s, r, "business", "QUARANTINE", "UNKNOWN_UNIT_SEMANTICS", `A quantity cell has an unrecognised unit/format; preserving it as a number would misstate the source.`, name);
        continue;
      }
      if (seenNames.has(name.toLowerCase())) { add("FM_PACK", s, r, "business", "QUARANTINE", "DUPLICATE_ITEM_NAME", "Item name repeats within the register.", name); continue; }
      seenNames.add(name.toLowerCase());
      const item = propose("FM_PACK", s, r, "fm_consumables_items", `item:${name.toLowerCase()}`, {
        facility_code: input.facility.code, facility_id: facilityId, name,
      }, ["facility FAC-0001 from workbook scope (the NCC Annex contract pack); the register carries no per-row location"], [], name);
      const entry = propose("FM_PACK", s, r, "fm_consumables_register_entries", `entry:${name.toLowerCase()}`, {
        facility_code: input.facility.code, facility_id: facilityId, item_record_id: item.id,
        record_origin: "migrated_historical",
        snapshot_date: null,
        opening_quantity: fields.opening.quantity, opening_unit: fields.opening.unit,
        received_quantity: fields.received.quantity, received_unit: fields.received.unit,
        issued_quantity: fields.issued.quantity, issued_unit: fields.issued.unit,
        closing_quantity: fields.closing.quantity, closing_unit: fields.closing.unit,
        reorder_level_quantity: fields.reorder.quantity, reorder_level_unit: fields.reorder.unit,
        raw_opening: fields.opening.raw, raw_received: fields.received.raw, raw_issued: fields.issued.raw, raw_closing: fields.closing.raw, raw_reorder_level: fields.reorder.raw,
      }, ["units are explicit per field (aliases only: pcs/pc⇒pcs, pcks/pck/packs⇒packs, gallons); pcs and packs are never equated", "no snapshot date: the register has none (null = unknown)", "'-' and blank are unknown (null), never 0", "closing is stored only if the source states it — no balance is derived"], [], name);
      add("FM_PACK", s, r, "business", "TRANSFORM_IMPORT", "CONSUMABLES_REGISTER_EVIDENCE", "Register row ⇒ consumables item + historical register evidence (explicit units, no invented date or balance).", name, [item.id, entry.id]);
    }
    (globalThis as { __unknownUnits?: string[] }).__unknownUnits = [...unknownUnits].sort();
  }

  // E. Generator Log
  {
    const s = pack("Generator Log");
    for (const r of populatedRows(s).filter((r) => r < 4)) structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row.");
    const rows = populatedRows(s).filter((r) => r >= 4);
    // Deterministic date carry: only a Gen 2 row immediately after a dated Gen 1 row inherits its date.
    const dated: number[] = [];
    const carryFrom = new Map<number, number>();
    rows.forEach((r, i) => {
      const hasDate = cellText(s, r, "A") !== null;
      if (hasDate) dated.push(r);
      else if (i > 0 && cellText(s, rows[i - 1]!, "A") !== null && /^gen 2$/i.test(cellText(s, r, "B") ?? "") && /^gen 1$/i.test(cellText(s, rows[i - 1]!, "B") ?? "")) carryFrom.set(r, rows[i - 1]!);
    });
    const res = resolveDateColumn(dated.map((r) => dateInput(s, r, "A")), { asOf });
    const dateOf = new Map<number, DateResolution>(dated.map((r, i) => [r, res[i]!]));
    dated.forEach((r, i) => recordDate("FM_PACK", s.name, r, res[i]!));
    const lastEnd = new Map<string, number>();
    let discontinuities = 0;
    for (const r of rows) {
      const gen = cellText(s, r, "B");
      const start = num(s, r, "C");
      const end = num(s, r, "D");
      const runSource = num(s, r, "E");
      const date = dateOf.get(r) ?? dateOf.get(carryFrom.get(r) ?? -1);
      flagFormulas(s, r);
      if (date === undefined && start === null && end === null) {
        add("FM_PACK", s, r, "business", "REJECT", "TEMPLATE_RESIDUE", "Undated template row with only a generator name and a formula result of 0.");
        continue;
      }
      if (start !== null && end === null) {
        incompleteRows.push(`FM_PACK/${s.name}/${r}`);
        invalidFormulas.push({ sheet: s.name, row: r, detail: `E${r} run hours ${runSource} is a broken spreadsheet result (blank end reading); NOT imported as runtime` });
        add("FM_PACK", s, r, "business", "QUARANTINE", "INCOMPLETE_END_READING", "Blank end reading produced a broken negative runtime in the spreadsheet; runtime is not derivable and is not imported.", gen);
        continue;
      }
      if (start === null || end === null || !date) {
        incompleteRows.push(`FM_PACK/${s.name}/${r}`);
        add("FM_PACK", s, r, "business", "QUARANTINE", "INCOMPLETE_ROW", "Missing date or readings.", gen);
        continue;
      }
      if (date.status !== "exact" && date.status !== "repaired") {
        add("FM_PACK", s, r, "business", "QUARANTINE", "AMBIGUOUS_DATE", `Date cannot be resolved (${date.rule}).`, gen);
        continue;
      }
      if (end < start) {
        invalidFormulas.push({ sheet: s.name, row: r, detail: `end reading ${end} < start ${start}; source run hours ${runSource}` });
        add("FM_PACK", s, r, "business", "QUARANTINE", "END_BEFORE_START", "End reading is lower than start reading; negative runtime is not authoritative.", gen);
        continue;
      }
      const prevEnd = gen ? lastEnd.get(gen) : undefined;
      if (prevEnd !== undefined && Math.abs(prevEnd - start) > 0.05) discontinuities++;
      if (gen) lastEnd.set(gen, end);
      const recomputed = Math.round((end - start) * 10) / 10;
      const alias = ASSET_MAP.find((a) => a.aliases.some((x) => normLabel(x) === normLabel(gen ?? "")));
      const assetRecord = alias ? records.find((x) => x.target === "fm_assets" && x.values.name === alias.name) : undefined;
      const fuel = num(s, r, "F");
      const rec = propose("FM_PACK", s, r, "fm_generator_logs", `gen:${date.iso}:${gen}`, {
        log_date: date.iso,
        generator: gen,
        log_basis: "hour_meter",
        start_meter_reading: start,
        end_meter_reading: end,
        fuel_used: fuel,
        remarks: null,
        asset_record_id: assetRecord?.id ?? null,
        record_origin: "migrated_historical",
        run_hours_derived_by_database: recomputed,
        source_only_preserved: { source_run_hours_formula_result: runSource },
      }, [
        ...(date.status === "repaired" ? [`date repaired: raw ${date.raw} ⇒ ${date.iso} (${date.rule})`] : []),
        ...(alias ? [`generator label "${gen}" ⇒ explicit alias of asset "${alias.name}"`] : [`generator label "${gen}" has no explicit alias — no asset link`]),
        `runtime is derived from the meter readings (${recomputed}h); the spreadsheet formula result is not trusted or imported`,
        fuel === null ? "fuel not recorded ⇒ NULL (unknown), never 0" : `fuel ${fuel} as recorded`,
        "no clock start/end time exists in the source and none is invented",
      ], [], gen);
      add("FM_PACK", s, r, "business", "TRANSFORM_IMPORT", "GENERATOR_HOUR_METER_IMPORT", `Valid dated hour-meter reading ⇒ fm_generator_logs (hour_meter basis)${runSource !== null && Math.abs(runSource - recomputed) > 0.05 ? `; source cell ${runSource} disagrees with readings, readings win` : ""}.`, gen, [rec.id]);
    }
    (globalThis as { __genDisc?: number }).__genDisc = discontinuities;
  }

  // F. MBORA diesel → fm_diesel_usage; CSIRT diesel → quarantine
  {
    const s = pack("MBORA DIESEL Checklist");
    const rows = populatedRows(s);
    const dataRows = rows.filter((r) => r >= 2);
    for (const r of rows.filter((r) => r < 2)) structural("FM_PACK", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Header row.");
    const dated = dataRows.filter((r) => cellText(s, r, "A") !== null);
    const res = resolveDateColumn(dated.map((r) => dateInput(s, r, "A")), { asOf });
    const dateOf = new Map<number, DateResolution>(dated.map((r, i) => [r, res[i]!]));
    dated.forEach((r, i) => recordDate("FM_PACK", s.name, r, res[i]!));
    for (const r of dataRows) {
      const d = dateOf.get(r);
      const under = num(s, r, "B");
      const surface = num(s, r, "C");
      const consRaw = cellText(s, r, "D");
      const balance = num(s, r, "E");
      if (!d) {
        add("FM_PACK", s, r, "business", "REJECT", "TEMPLATE_RESIDUE", "Undated residue row (tank quantity only).");
        continue;
      }
      if (d.status !== "exact" && d.status !== "repaired") {
        add("FM_PACK", s, r, "business", "QUARANTINE", "AMBIGUOUS_DATE", `Date cannot be resolved (${d.rule}).`);
        continue;
      }
      if (under === null || surface === null || balance === null || consRaw === null) {
        incompleteRows.push(`FM_PACK/${s.name}/${r}`);
        add("FM_PACK", s, r, "business", "QUARANTINE", "INCOMPLETE_ROW", "Missing surface tank, consumption or balance; blank is not zero.");
        continue;
      }
      if (isPlaceholder(consRaw)) {
        add("FM_PACK", s, r, "business", "QUARANTINE", "CONSUMPTION_NOT_STATED", `Consumption is "${consRaw}" (not numeric zero). Without a stated consumption, deliveries ('added') cannot be proven.`);
        continue;
      }
      const cons = Number(consRaw);
      const total = under + surface;
      if (!Number.isFinite(cons) || Math.abs(total - cons - balance) > 0.005) {
        add("FM_PACK", s, r, "business", "QUARANTINE", "ARITHMETIC_MISMATCH", `Source balance ${balance} ≠ tanks ${total} − consumption ${cons}; the sheet contradicts itself.`);
        continue;
      }
      const rec = propose("FM_PACK", s, r, "fm_diesel_usage", `mbora-diesel:${d.iso}`, {
        facility_code: input.facility.code,
        facility_id: facilityId,
        log_date: d.iso,
        generator_ref: "MBORA DIESEL Checklist",
        opening_level: total,
        added: 0,
        closing_level: balance,
        consumption_expected_generated: cons,
        source_only_preserved: { underground_qty: under, surface_qty: surface, source_consumption: cons, source_balance: balance },
      }, [
        ...(d.status === "repaired" ? [`date repaired: raw ${d.raw} ⇒ ${d.iso} (${d.rule})`] : []),
        "opening_level = underground + surface (both tank measurements preserved in provenance)",
        "added = 0 is PROVEN by the row's own arithmetic (balance = tanks − consumption ⇒ no receipt)",
        "consumption is a generated column (opening + added − closing) and equals the source value",
      ], [], null);
      add("FM_PACK", s, r, "business", "TRANSFORM_IMPORT", "DIESEL_IMPORT", "Dated tank measurements ⇒ fm_diesel_usage.", null, [rec.id]);
    }
    const c = pack("CSIRT DIESEL Checklist");
    const crows = populatedRows(c);
    const cdated = crows.filter((r) => r >= 2);
    const cres = resolveDateColumn(cdated.map((r) => dateInput(c, r, "A")), { asOf });
    cdated.forEach((r, i) => recordDate("FM_PACK", c.name, r, cres[i]!));
    for (const r of crows) {
      if (r < 2) { structural("FM_PACK", c, r, "STRUCTURAL_TITLE_OR_HEADER", "Header row."); continue; }
      unresolvedLocations.push(`FM_PACK/${c.name}/${r}: CSIRT diesel tanks`);
      add("FM_PACK", c, r, "business", "QUARANTINE", "UNRESOLVED_FACILITY_SHEET_OUT_OF_CONTRACT", "CSIRT diesel checklist is not in the locked contract and belongs to the separate CSIRT office; no CSIRT facility exists.");
    }
  }

  // ═══════════════════════════ 2026 LETTERS ═══════════════════════════════════
  const letters = (n: string) => sheetOf("LETTERS", n);
  const letterRows: Array<{ id: string; sheet: string; row: number; title: string; date: string | null; amount: number | null; type: string | null }> = [];
  {
    const s = letters("Inventory");
    for (const r of populatedRows(s).filter((r) => r < 2)) structural("LETTERS", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Header row.");
    const rows = populatedRows(s).filter((r) => r >= 2);
    const res = resolveDateColumn(rows.map((r) => dateInput(s, r, "D")), { asOf });
    rows.forEach((r, i) => {
      recordDate("LETTERS", s.name, r, res[i]!);
      const ref = cellText(s, r, "B");
      add("LETTERS", s, r, "business", "PRESERVE_HISTORY", "CORRESPONDENCE_REFERENCE", `${cellText(s, r, "A") ?? "Letter"} correspondence preserved as provenance (Approval / Acceptance / Payment / Others stay distinct).`, ref);
      letterRows.push({ id: `LETTERS/${s.name}/${r}`, sheet: s.name, row: r, title: cellText(s, r, "C") ?? "", date: res[i]!.iso, amount: num(s, r, "E"), type: cellText(s, r, "A") });
    });
  }
  const approvalRows: typeof letterRows = [];
  {
    const s = letters("Pending Approval");
    for (const r of populatedRows(s)) {
      if (r <= 2) { structural("LETTERS", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row."); continue; }
    }
    const rows = populatedRows(s).filter((r) => r >= 3);
    const res = resolveDateColumn(rows.map((r) => dateInput(s, r, "C")), { asOf });
    rows.forEach((r, i) => {
      recordDate("LETTERS", s.name, r, res[i]!);
      add("LETTERS", s, r, "business", "PRESERVE_HISTORY", "APPROVAL_EVIDENCE", "Pending approval request preserved as approval evidence; no Work/approval object is created from it.");
      approvalRows.push({ id: `LETTERS/${s.name}/${r}`, sheet: s.name, row: r, title: cellText(s, r, "B") ?? "", date: res[i]!.iso, amount: num(s, r, "D"), type: cellText(s, r, "E") });
    });
  }
  {
    const s = letters("Pending Payments");
    flagFormulas(s, 11);
    for (const r of populatedRows(s)) {
      if (r === 2) structural("LETTERS", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Header row.");
      else if (r === 11) structural("LETTERS", s, r, "DERIVED_TOTAL_FORMULA", "SUM total row — derived data.");
      else {
        platformFinanceExcluded.push(`LETTERS/${s.name}/${r}`);
        add("LETTERS", s, r, "business", "REJECT", "PLATFORM_FINANCE_EXCLUDED", "Client-facing payment request / receivable evidence — outside the FM transaction model.");
      }
    }
    const p = letters("Pivot Table 2");
    for (const r of populatedRows(p)) structural("LETTERS", p, r, "PIVOT_DERIVED", "Pivot table output — derived data, never a business record.");
  }

  // ════════════════════════ MBORA INCOME STATEMENT ════════════════════════════
  const mb = (n: string) => sheetOf("MBORA", n);
  const orderSheets: Array<{ name: string; orderType: "job_order" | "work_order"; year: number }> = [
    { name: "2025 JOB ORDERS", orderType: "job_order", year: 2025 },
    { name: "2025 WORK ORDERS", orderType: "work_order", year: 2025 },
    { name: "2026 JOB ORDERS", orderType: "job_order", year: 2026 },
    { name: "2026 WORK ORDER", orderType: "work_order", year: 2026 },
  ];
  for (const def of orderSheets) {
    const s = mb(def.name);
    for (const r of populatedRows(s)) {
      flagFormulas(s, r);
      const sn = cellText(s, r, "A");
      const desc = cellText(s, r, "B");
      if (r === 1) { structural("MBORA", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Header row."); continue; }
      if (sn !== null && /^\d+$/.test(sn) && desc) {
        const ref = `${def.name}#${sn}`;
        if (/csirt/i.test(desc)) {
          unresolvedLocations.push(`MBORA/${s.name}/${r}: CSIRT-dependent order`);
          add("MBORA", s, r, "business", "QUARANTINE", "CSIRT_DEPENDENT", "The order concerns the CSIRT office (alone or together with the Annex). CSIRT has no approved SentraCore facility; the record is held for organisational/location resolution.", ref);
          continue;
        }
        // Historical Work (+ Work Instruction) with UNKNOWN lifecycle: no dates or status are inferred; Paid/Pending is commercial.
        const workRec = propose("MBORA", s, r, "fm_work", `work:${def.name}#${sn}`, {
          facility_code: input.facility.code, facility_id: facilityId,
          title: desc, source: "manual", priority: "medium",
          status: "unknown", reported_at: null, completed_at: null, record_origin: "migrated_historical",
        }, ["lifecycle unknown: reported_at NULL, status 'unknown', no completion — nothing is inferred from Paid/Pending or payment dates", "facility FAC-0001 from workbook scope (MBORA INCOME STATEMENT); the register has no per-row location", `order register: ${def.name}`], [
          { field: "priority", forced: "medium", asserts: "source has no priority and the column has no 'unknown' value" },
        ], ref);
        const wiRec = propose("MBORA", s, r, "fm_work_instructions", `wi:${def.name}#${sn}`, {
          facility_code: input.facility.code, facility_id: facilityId,
          work_record_id: workRec.id, order_type: def.orderType,
          title: desc, work_category: "other", source: "manual", priority: "medium",
          status: "unknown", requested_at: null, completed_at: null, record_origin: "migrated_historical",
        }, [`order_type "${def.orderType}" is explicit from the source sheet (${def.name})`, "requested_at NULL and status 'unknown': no lifecycle fact is inferred", "work_category 'other' (never 'corrective': the source states no category)"], [
          { field: "priority", forced: "medium", asserts: "source has no priority and the column has no 'unknown' value" },
        ], ref);
        // Direct cost is DEFERRED: preserved as migration evidence only (no cost record, claim, authorization or payment).
        const cost = num(s, r, "E");
        if (cost !== null) deferredEvidence.push({ row: `MBORA/${s.name}/${r}`, kind: "historical_direct_cost_deferred", values: { work_record_id: workRec.id, cost_amount: cost, currency: "NGN" } });
        add("MBORA", s, r, "business", "TRANSFORM_IMPORT", def.orderType === "job_order" ? "HISTORICAL_JOB_ORDER_IMPORT" : "HISTORICAL_WORK_ORDER_IMPORT", `Historical ${def.orderType.replace("_", " ")} ⇒ migrated Work + Work Instruction (${def.orderType}); lifecycle unknown; commercial state excluded.`, ref, [workRec.id, wiRec.id]);
        continue;
      }
      if (sn === null && desc && /monthly payment/i.test(desc)) {
        platformFinanceExcluded.push(`MBORA/${s.name}/${r}`);
        add("MBORA", s, r, "business", "REJECT", "PLATFORM_FINANCE_EXCLUDED", "Monthly contract payment — commercial income, outside FM migration.");
        continue;
      }
      structural("MBORA", s, r, "DERIVED_TOTAL_OR_NOTE", "Total / formula / scratch note row — derived data.");
    }
  }
  {
    const s = mb("2026 Monthly Payment");
    for (const r of populatedRows(s)) {
      flagFormulas(s, r);
      const sn = cellText(s, r, "A");
      const desc = cellText(s, r, "B");
      if (r === 1) structural("MBORA", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Header row.");
      else if (desc) { platformFinanceExcluded.push(`MBORA/${s.name}/${r}`); add("MBORA", s, r, "business", "REJECT", "PLATFORM_FINANCE_EXCLUDED", "Monthly FM contract payment — requested amount, payment advice, receipt and deductions belong to Platform Finance."); }
      else if (sn !== null && r < 15) add("MBORA", s, r, "business", "REJECT", "TEMPLATE_RESIDUE", "Numbered empty row with only a formula (=0).");
      else structural("MBORA", s, r, "DERIVED_TOTAL_OR_NOTE", "Total / formula row — derived data.");
    }
  }
  {
    const s = mb("Executed (NO JOB ORDER)");
    const rows = populatedRows(s);
    for (const r of rows) {
      flagFormulas(s, r);
      const sn = cellText(s, r, "A");
      if (r <= 2) { structural("MBORA", s, r, "STRUCTURAL_TITLE_OR_HEADER", "Title/header row."); continue; }
      if (!(sn !== null && /^\d+$/.test(sn))) { structural("MBORA", s, r, "DERIVED_TOTAL_FORMULA", "SUM total row — derived data."); continue; }
      const title = cellText(s, r, "B") ?? "";
      const serial = num(s, r, "C");
      const date = serial !== null ? serialToIso(serial) : null;
      const amount = num(s, r, "E");
      // Two independent corroborating fields (identical date AND amount) plus a similar title.
      const approval = approvalRows.find((a) => a.amount === amount && a.date === date && jaccard(normTitle(a.title), normTitle(title)) >= 0.6);
      const approvalState = approval?.type ?? null;
      if (approval && /ongoing/i.test(approvalState ?? "")) {
        add("MBORA", s, r, "business", "QUARANTINE", "EXECUTION_STATE_CONFLICT", `This sheet says "Executed" but the matching Pending Approval row (${approval.id}) says "${approvalState}". Source contradicts itself; no state is chosen.`, `Executed#${sn}`);
        continue;
      }
      const ref = `Executed#${sn}`;
      if (/csirt/i.test(title)) {
        add("MBORA", s, r, "business", "QUARANTINE", "CSIRT_DEPENDENT", "CSIRT-dependent; no approved CSIRT facility.", ref);
        continue;
      }
      // Explicit evidence that work was executed with NO Job Order ⇒ historical Work and NO Work Instruction.
      const workRec = propose("MBORA", s, r, "fm_work", `work:executed-no-jo#${sn}`, {
        facility_code: input.facility.code, facility_id: facilityId,
        title, source: "manual", priority: "medium",
        status: "completed", reported_at: null, completed_at: null, record_origin: "migrated_historical",
        work_instruction: "NONE — source proves no formal Job Order exists",
        source_only_preserved: { approval_request_submitted_on: date, execution_evidence: "Executed", job_order_absent: true, corroborating_approval_row: approval?.id ?? null },
      }, ["status 'completed' from explicit source evidence \"Executed\"; completion date unknown ⇒ completed_at NULL (migrated_historical only)", "NO Work Instruction and NO Job Order are created: the source states none exists", "reported_at NULL: the approval-request submission date is not the date the work was reported"], [
        { field: "priority", forced: "medium", asserts: "source has no priority and the column has no 'unknown' value" },
      ], ref);
      add("MBORA", s, r, "business", "TRANSFORM_IMPORT", "EXECUTED_NO_JOB_ORDER_HISTORICAL_WORK", "Executed with NO Job Order ⇒ migrated historical Work only (no Work Instruction, no Job Order).", ref, [workRec.id]);
    }
  }

  // ═════════════════════ completeness guard: every populated row exactly once ═════
  for (const [code, book] of Object.entries(books) as Array<[WorkbookCode, Workbook]>) {
    for (const sheet of book.sheets) {
      for (const r of populatedRows(sheet)) {
        if (!seen.has(`${code}|${sheet.name}|${r}`)) throw new Error(`Unclassified populated row: ${code}|${sheet.name}|${r}`);
      }
    }
  }

  // ═══════════════════════════ relationships ═══════════════════════════════════
  const compare = (a: typeof letterRows[number], b: typeof letterRows[number]): Link | null => {
    const ta = normTitle(a.title), tb = normTitle(b.title);
    if (!ta || !tb) return null;
    const sim = jaccard(ta, tb);
    const sameDate = !!a.date && a.date === b.date;
    const sameAmount = a.amount !== null && b.amount !== null && Math.abs(a.amount - b.amount) < 0.005;
    if ((ta === tb || sim >= 0.85) && sameDate && sameAmount) {
      return { from: a.id, to: b.id, confidence: "CERTAIN", basis: `${ta === tb ? "identical" : `near-identical (${sim.toFixed(2)})`} title + identical date + identical amount` };
    }
    if (sim >= 0.8 && (sameDate || sameAmount)) return { from: a.id, to: b.id, confidence: "PROBABLE", basis: `title similarity ${sim.toFixed(2)} + ${sameDate ? "same date" : "same amount"}` };
    if (ta === tb) return { from: a.id, to: b.id, confidence: "PROBABLE", basis: "identical normalised title only (no corroborating date/amount)" };
    if (sim >= 0.6) return { from: a.id, to: b.id, confidence: "POSSIBLE", basis: `title similarity ${sim.toFixed(2)} only` };
    return null;
  };
  const pushBest = (a: typeof letterRows[number], candidates: typeof letterRows) => {
    const found = candidates.map((b) => compare(a, b)).filter((l): l is Link => !!l);
    const order = { CERTAIN: 0, PROBABLE: 1, POSSIBLE: 2, UNSUPPORTED: 3 } as const;
    found.sort((x, y) => order[x.confidence] - order[y.confidence]);
    const certain = found.filter((l) => l.confidence === "CERTAIN");
    // Automatic linkage only when exactly one CERTAIN counterpart exists.
    if (certain.length === 1) links.push(certain[0]!);
    else if (certain.length > 1) for (const l of certain) links.push({ ...l, confidence: "PROBABLE", basis: `${l.basis}; ambiguous — ${certain.length} counterparts qualify` });
    else for (const l of found.slice(0, 3)) links.push(l);
  };
  const inventoryApprovalsAndPayments = letterRows.filter((l) => l.type === "Approval" || l.type === "Payment");
  for (const a of approvalRows) pushBest(a, inventoryApprovalsAndPayments);
  // Executed (NO JOB ORDER) sheet ⇒ Pending Approval
  {
    const s = mb("Executed (NO JOB ORDER)");
    for (const r of populatedRows(s)) {
      const sn = cellText(s, r, "A");
      if (r <= 2 || !(sn && /^\d+$/.test(sn))) continue;
      const serial = num(s, r, "C");
      pushBest({ id: `MBORA/${s.name}/${r}`, sheet: s.name, row: r, title: cellText(s, r, "B") ?? "", date: serial !== null ? serialToIso(serial) : null, amount: num(s, r, "E"), type: null }, approvalRows);
    }
  }
  // MBORA job/work orders ⇒ Inventory acceptance / approval letters (PROBABLE at best; never linked)
  const acceptance = letterRows.filter((l) => l.type === "Acceptance" || l.type === "Approval");
  for (const def of orderSheets) {
    const s = mb(def.name);
    for (const r of populatedRows(s)) {
      const sn = cellText(s, r, "A");
      const desc = cellText(s, r, "B");
      if (!(sn && /^\d+$/.test(sn) && desc)) continue;
      const a = { id: `MBORA/${s.name}/${r}`, sheet: s.name, row: r, title: desc, date: null, amount: null, type: null };
      const found = acceptance.map((b) => compare(a, b)).filter((l): l is Link => !!l && l.confidence !== "CERTAIN");
      found.sort((x, y) => (x.confidence === y.confidence ? 0 : x.confidence === "PROBABLE" ? -1 : 1));
      for (const l of found.slice(0, 2)) links.push({ ...l, confidence: l.confidence === "PROBABLE" ? "POSSIBLE" : l.confidence, basis: `${l.basis}; register row carries no reference, date or amount that can corroborate` });
    }
  }
  links.push({ from: "FM_PACK/Maintenance Register/4", to: "FM_PACK/Incident Report/4", confidence: "PROBABLE", basis: "'65 kva Generator' + 'Leakage' vs incident 'Generator Leakage' (CSIRT); register Request No 1.0 has no proven meaning" });
  links.push({ from: "FM_PACK/Maintenance Register/4", to: "FM_PACK/Maintenance Request/4", confidence: "UNSUPPORTED", basis: "register 'Request No 1.0' vs request NCC-001: a numeric coincidence is not a relationship" });
  links.push({ from: "FM_PACK/Incident Report/11", to: "FM_PACK/Asset Register/14", confidence: "PROBABLE", basis: "incident text 'LIFT (D)' vs asset 'LIFT D'; free text in a description is not an alias-map label" });
  for (const a of ASSET_MAP) for (const al of a.aliases) (globalThis as { __aliases?: Array<{ asset: string; alias: string }> }).__aliases = [...((globalThis as { __aliases?: Array<{ asset: string; alias: string }> }).__aliases ?? []), { asset: a.name, alias: al }];

  // ═══════════════════════════════ summary ═════════════════════════════════════
  const g = globalThis as { __dupRefs?: Map<string, string[]>; __unknownUnits?: string[]; __genDisc?: number; __aliases?: Array<{ asset: string; alias: string }> };
  const bySheet: Record<string, Record<string, number>> = {};
  for (const l of ledger) {
    const key = `${l.workbook} / ${l.sheet}`;
    bySheet[key] ??= { business: 0, structural: 0, IMPORT: 0, TRANSFORM_IMPORT: 0, BOOTSTRAP: 0, PRESERVE_HISTORY: 0, QUARANTINE: 0, REJECT: 0, MODEL_GAP: 0 };
    bySheet[key]![l.kind]!++;
    bySheet[key]![l.classification]!++;
  }
  const targetCount = (t: string) => records.filter((r) => r.target === t).length;
  const linkCount = (c: Link["confidence"]) => links.filter((l) => l.confidence === c).length;
  const count = (code: string) => ledger.filter((l) => l.reasonCode === code).length;
  const gaps: Manifest["exceptions"]["modelGaps"] = [
    { code: "NO_INSPECTION_MODEL", description: "No facility-inspection domain exists; the single inspection row is preserved as migration evidence only.", affected: count("NO_INSPECTION_MODEL") },
    { code: "CSIRT_LOCATION_UNRESOLVED", description: "CSIRT is not an approved SentraCore facility; every CSIRT-dependent record is quarantined for later organisational/location resolution.", affected: ledger.filter((l) => ["UNRESOLVED_FACILITY", "UNRESOLVED_FACILITY_SHEET_OUT_OF_CONTRACT", "CSIRT_DEPENDENT"].includes(l.reasonCode)).length },
    { code: "HISTORICAL_DIRECT_COST_DEFERRED", description: "Historical direct cost is deferred: preserved as migration evidence only; no cost record, claim, authorization or payment is created.", affected: deferredEvidence.length },
    { code: "PRIORITY_HAS_NO_UNKNOWN_VALUE", description: "fm_work / fm_work_instructions priority is NOT NULL with no 'unknown' value; migrated orders carry the disclosed default 'medium'.", affected: targetCount("fm_work") + targetCount("fm_work_instructions") },
  ];
  const batchKey = batchId;
  const provenancePlan: Manifest["provenancePlan"] = records.map((r) => ({
    batchKey,
    workbook: r.provenance.workbook,
    workbookSha256: r.provenance.workbookSha256,
    sheet: r.provenance.sheet,
    row: r.provenance.row,
    sourceReference: r.provenance.sourceRef,
    fingerprint: r.provenance.fingerprint,
    targetTable: r.target,
    targetId: r.id,
    classification: lof(r),
    transformations: r.transformations,
  }));
  function lof(r: ProposedRecord): string {
    return ledger.find((l) => l.workbook === r.provenance.workbook && l.sheet === r.provenance.sheet && l.row === r.provenance.row)!.classification;
  }
  const manifest: Manifest = {
    rulesVersion: RULES_VERSION,
    asOf,
    batchId,
    organisationTimeZone: input.timeZone,
    facility: input.facility,
    sources: (Object.keys(FILE_LABEL) as WorkbookCode[]).map((w) => ({ workbook: w, file: FILE_LABEL[w], sha256: shas[w] })),
    ignoredDuplicates: (input.duplicateFiles ?? []).map((d) => ({ file: d.file, sha256: shas[d.duplicateOf], duplicateOf: FILE_LABEL[d.duplicateOf] })),
    ledger,
    records,
    deferred,
    deferredEvidence,
    provenancePlan,
    dateExceptions,
    links,
    assetAliases: g.__aliases ?? [],
    exceptions: {
      duplicateLookingReferences: [...(g.__dupRefs ?? new Map()).entries()].filter(([, refs]) => refs.length > 1).map(([suffix, references]) => ({ suffix, references })).sort((a, b) => Number(a.suffix) - Number(b.suffix)),
      invalidFormulas,
      incompleteRows,
      unknownUnits: g.__unknownUnits ?? [],
      unresolvedLocations,
      unresolvedActors: [...unresolvedActors].sort(),
      platformFinanceExcluded,
      modelGaps: gaps,
      schemaForcedDefaults: [...forcedDefaults.values()],
    },
    summary: {
      bySheet,
      populatedRows: ledger.length,
      businessRows: ledger.filter((l) => l.kind === "business").length,
      structuralRows: ledger.filter((l) => l.kind === "structural").length,
      proposedTargets: {
        facilitiesReused: records.length ? 1 : 0,
        assets: targetCount("fm_assets"),
        assetAliasesForCreatedAssets: (g.__aliases ?? []).filter((a) => records.some((r) => r.target === "fm_assets" && r.values.name === a.asset)).length,
        requests: targetCount("fm_requests"),
        incidents: targetCount("fm_incidents"),
        works: targetCount("fm_work"),
        worksFromOrders: records.filter((r) => r.target === "fm_work" && r.values.work_instruction === undefined).length,
        worksExecutedWithoutJobOrder: records.filter((r) => r.target === "fm_work" && r.values.work_instruction !== undefined).length,
        workInstructions: {
          job_order: records.filter((r) => r.target === "fm_work_instructions" && r.values.order_type === "job_order").length,
          work_order: records.filter((r) => r.target === "fm_work_instructions" && r.values.order_type === "work_order").length,
        },
        approvalsOrProvenanceRelationships: 0,
        generatorLogs: targetCount("fm_generator_logs"),
        dieselLogs: targetCount("fm_diesel_usage"),
        consumablesItems: targetCount("fm_consumables_items"),
        consumablesRegisterEntries: targetCount("fm_consumables_register_entries"),
        costRecords: 0,
        provenanceRows: provenancePlan.length,
      },
      deferredHistoricalCostEvidence: deferredEvidence.length,
      links: { CERTAIN: linkCount("CERTAIN"), PROBABLE: linkCount("PROBABLE"), POSSIBLE: linkCount("POSSIBLE"), UNSUPPORTED: linkCount("UNSUPPORTED") },
      generatorMeterDiscontinuities: g.__genDisc ?? 0,
      chronologyConfirmedDates,
      derivedFormulaCellsRejected: derivedFormulaCells,
    },
  };
  delete (globalThis as Record<string, unknown>).__dupRefs;
  delete (globalThis as Record<string, unknown>).__unknownUnits;
  delete (globalThis as Record<string, unknown>).__genDisc;
  delete (globalThis as Record<string, unknown>).__aliases;
  return manifest;
}

export function manifestDigest(manifest: Manifest): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}
