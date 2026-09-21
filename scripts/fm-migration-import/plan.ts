/**
 * FM migration IMPORT PLAN — pure and deterministic. Converts the approved dry-run manifest into an ordered
 * list of database row payloads. It never re-parses a workbook and never re-decides spreadsheet semantics:
 * every value comes from the manifest; this module only maps manifest keys to real columns and REFUSES
 * anything the locked contract excludes. No database access.
 */
import { createHash } from "node:crypto";
import type { Manifest, ProposedRecord } from "../fm-migration/dryRun";

/** Locked dependency order (contract §8). Batch/provenance infra and facility reuse precede these in the executor. */
export const IMPORT_ORDER = [
  "fm_assets",
  "fm_requests",
  "fm_incidents",
  "fm_work",
  "fm_work_instructions",
  "fm_generator_logs",
  "fm_diesel_usage",
  "fm_consumables_items",
  "fm_consumables_register_entries",
] as const;
export type ImportTarget = (typeof IMPORT_ORDER)[number];

type TargetSpec = {
  /** Display-code prefix (PREFIX-YYYY-######); null = the table has no code column. */
  prefix: string | null;
  /** DB column → manifest value key. Anything not listed here or in `nonPersisted` fails the plan. */
  columns: Record<string, string>;
  /** Manifest keys deliberately NOT written to the domain table (verification-only or provenance-only). */
  nonPersisted: string[];
  /** Manifest reference keys that hold another PLANNED record id (must resolve inside the plan). */
  references: Record<string, ImportTarget>;
};

const SAME = (...names: string[]) => Object.fromEntries(names.map((n) => [n, n]));

export const TARGET_SPECS: Record<ImportTarget, TargetSpec> = {
  fm_assets: {
    prefix: "AST",
    columns: SAME("facility_id", "name", "category", "manufacturer", "model", "serial_number", "condition", "status", "criticality"),
    nonPersisted: ["facility_code", "source_only_preserved"],
    references: {},
  },
  fm_requests: {
    prefix: "REQ",
    columns: { ...SAME("facility_id", "title", "location_detail", "request_type", "status", "reporter_name"), occurred_at: "occurred_at_local" },
    nonPersisted: ["facility_code", "occurred_on", "source_reference", "source_only_preserved"],
    references: {},
  },
  fm_incidents: {
    prefix: "INC",
    columns: { ...SAME("facility_id", "title", "location_detail", "root_cause", "corrective_actions", "incident_type", "severity", "source", "status", "record_origin"), reported_at: "reported_at_local" },
    nonPersisted: ["facility_code", "reported_on", "source_only_preserved"],
    references: {},
  },
  fm_work: {
    prefix: "WRK",
    columns: SAME("facility_id", "title", "source", "priority", "status", "reported_at", "completed_at", "record_origin"),
    nonPersisted: ["facility_code", "work_instruction", "source_only_preserved"],
    references: {},
  },
  fm_work_instructions: {
    prefix: "WO",
    columns: { ...SAME("facility_id", "title", "order_type", "work_category", "source", "priority", "status", "requested_at", "completed_at", "record_origin"), work_id: "work_record_id" },
    nonPersisted: ["facility_code"],
    references: { work_record_id: "fm_work" },
  },
  fm_generator_logs: {
    prefix: "GENLOG",
    columns: { ...SAME("log_date", "generator", "log_basis", "start_meter_reading", "end_meter_reading", "fuel_used", "remarks", "record_origin"), asset_id: "asset_record_id" },
    nonPersisted: ["run_hours_derived_by_database", "source_only_preserved"],
    references: { asset_record_id: "fm_assets" },
  },
  fm_diesel_usage: {
    prefix: "DSLU",
    columns: SAME("facility_id", "log_date", "generator_ref", "opening_level", "added", "closing_level"),
    nonPersisted: ["facility_code", "consumption_expected_generated", "source_only_preserved"],
    references: {},
  },
  fm_consumables_items: {
    prefix: "ITEM",
    columns: SAME("facility_id", "name"),
    nonPersisted: ["facility_code"],
    references: {},
  },
  fm_consumables_register_entries: {
    prefix: null,
    columns: {
      ...SAME(
        "facility_id", "record_origin", "snapshot_date",
        "opening_quantity", "opening_unit", "received_quantity", "received_unit", "issued_quantity", "issued_unit",
        "closing_quantity", "closing_unit", "reorder_level_quantity", "reorder_level_unit",
        "raw_opening", "raw_received", "raw_issued", "raw_closing", "raw_reorder_level",
      ),
      item_id: "item_record_id",
    },
    nonPersisted: ["facility_code"],
    references: { item_record_id: "fm_consumables_items" },
  },
};

/**
 * Schema-forced defaults that materially assert something the source never says. Migration 20260921110000 gave
 * historical rows an explicit `unknown`, so the manifest no longer emits any of these. They remain registered as
 * REGRESSION GUARDS: if a manifest ever carries one again, the plan is BLOCKED and the importer will not write it.
 */
export const BLOCKING_FORCED_DEFAULTS: Record<string, string> = {
  "fm_incidents.status=reported": "'reported' is the OPEN lifecycle state; historical incident status is unknown, not open.",
  "fm_incidents.severity=medium": "the source assigns no severity; 'medium' is a risk grade that feeds incident severity analytics.",
  "fm_work.priority=medium": "the source assigns no priority; historical Work priority is unknown, not medium.",
  "fm_work_instructions.priority=medium": "the source assigns no priority; historical Work Instruction priority is unknown, not medium.",
};
export const ACCEPTED_FORCED_DEFAULTS: Record<string, string> = {
  "fm_incidents.incident_type=other": "'other' is the schema's own uncategorised bucket; it asserts no specific type.",
};

export type PlannedRow = {
  order: number;
  target: ImportTarget;
  id: string;
  codePrefix: string | null;
  /** DB columns to write (excluding organisation_id and code, which the executor supplies). Reference columns hold planned ids. */
  columns: Record<string, unknown>;
  provenance: Manifest["provenancePlan"][number];
  forcedDefaults: string[];
};

export type ImportPlan = {
  batchKey: string;
  rulesVersion: string;
  codeYear: number;
  facility: { code: string; id: string };
  sources: Array<{ workbook: string; file: string; sha256: string }>;
  manifestDigest: string;
  rows: PlannedRow[];
  countsByTarget: Record<ImportTarget, number>;
  blockers: Array<{ key: string; recordCount: number; reason: string }>;
  acceptedDisclosures: Array<{ key: string; recordCount: number; reason: string }>;
  /** Manifest data the importer deliberately never reads for writing. */
  ignoredByDesign: { links: number; assetAliases: number; deferredEvidence: number; deferred: number; ledgerRowsNotImported: number };
};

export class PlanError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Import plan refused:\n - ${problems.join("\n - ")}`);
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
const FORBIDDEN_LEDGER = new Set(["QUARANTINE", "MODEL_GAP", "REJECT", "PRESERVE_HISTORY"]);
const IMPORTABLE_CLASSES = new Set(["IMPORT", "TRANSFORM_IMPORT", "BOOTSTRAP"]);

export function manifestDigestOf(manifest: Manifest): string {
  return createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export type BuildOptions = {
  /** Digest the operator approved; the plan is refused if the manifest differs. */
  expectedDigest?: string;
  expectedBatchKey?: string;
};

export function buildImportPlan(manifest: Manifest, options: BuildOptions = {}): ImportPlan {
  const problems: string[] = [];
  const digest = manifestDigestOf(manifest);
  if (options.expectedDigest && options.expectedDigest !== digest) problems.push(`manifest digest ${digest} ≠ approved ${options.expectedDigest}`);
  if (options.expectedBatchKey && options.expectedBatchKey !== manifest.batchId) problems.push(`batch ${manifest.batchId} ≠ approved ${options.expectedBatchKey}`);
  if (!manifest.facility.id || manifest.facility.code !== "FAC-0001") problems.push(`facility must be the existing FAC-0001 (got ${manifest.facility.code}/${manifest.facility.id})`);
  if (manifest.sources.length !== 3 || manifest.sources.some((s) => !HEX64.test(s.sha256))) problems.push("manifest must carry exactly three sources with SHA-256 hashes");
  const codeYear = Number(manifest.asOf.slice(0, 4));
  if (!Number.isInteger(codeYear)) problems.push(`manifest asOf is not a date: ${manifest.asOf}`);
  const facilityId = manifest.facility.id ?? "";

  const ledgerKey = (w: string, s: string, r: number) => `${w}|${s}|${r}`;
  const ledger = new Map(manifest.ledger.map((l) => [ledgerKey(l.workbook, l.sheet, l.row), l]));
  const shaOf = new Map(manifest.sources.map((s) => [s.workbook, s.sha256]));

  const byId = new Map<string, ProposedRecord>();
  for (const r of manifest.records) {
    if (byId.has(r.id)) problems.push(`duplicate record id ${r.id}`);
    byId.set(r.id, r);
  }
  const plannedIds = new Map<string, ImportTarget>();
  const provByTarget = new Map(manifest.provenancePlan.map((p) => [`${p.targetTable}|${p.targetId}`, p]));
  if (manifest.provenancePlan.length !== manifest.records.length) problems.push(`provenance plan (${manifest.provenancePlan.length}) ≠ records (${manifest.records.length})`);
  const sourceKeys = new Set<string>();

  const known = new Set<string>(IMPORT_ORDER);
  for (const r of manifest.records) {
    if (!known.has(r.target)) {
      problems.push(`record ${r.id} targets ${r.target}, which is outside the approved operational domains`);
      continue;
    }
    plannedIds.set(r.id, r.target as ImportTarget);
  }

  const rows: PlannedRow[] = [];
  let order = 0;
  for (const target of IMPORT_ORDER) {
    const spec = TARGET_SPECS[target];
    for (const rec of manifest.records.filter((r) => r.target === target)) {
      const prov = provByTarget.get(`${target}|${rec.id}`);
      if (!prov) { problems.push(`${target} ${rec.id} has no provenance plan row`); continue; }
      if (prov.batchKey !== manifest.batchId) problems.push(`${target} ${rec.id}: provenance batch ${prov.batchKey} ≠ ${manifest.batchId}`);
      if (!IMPORTABLE_CLASSES.has(prov.classification)) problems.push(`${target} ${rec.id}: classification ${prov.classification} is not importable`);
      if (prov.workbookSha256 !== shaOf.get(prov.workbook) || prov.workbookSha256 !== rec.provenance.workbookSha256) problems.push(`${target} ${rec.id}: provenance workbook hash differs from the approved source`);
      if (!HEX64.test(prov.fingerprint) || prov.fingerprint !== rec.provenance.fingerprint) problems.push(`${target} ${rec.id}: fingerprint mismatch`);
      const sk = `${prov.workbookSha256}|${prov.sheet}|${prov.row}|${target}`;
      if (sourceKeys.has(sk)) problems.push(`two records share source row + target: ${sk}`);
      sourceKeys.add(sk);
      const l = ledger.get(ledgerKey(prov.workbook, prov.sheet, prov.row));
      if (!l) problems.push(`${target} ${rec.id}: source row has no ledger entry`);
      else if (FORBIDDEN_LEDGER.has(l.classification) || !IMPORTABLE_CLASSES.has(l.classification)) problems.push(`${target} ${rec.id}: its source row is ${l.classification}/${l.reasonCode} — quarantined / excluded rows never import`);

      // Exclusions on content: CSIRT, another facility, commercial evidence.
      const v = rec.values;
      if (v.facility_code !== undefined && v.facility_code !== "FAC-0001") problems.push(`${target} ${rec.id}: facility_code ${String(v.facility_code)} ≠ FAC-0001`);
      if (v.facility_id !== undefined && v.facility_id !== facilityId) problems.push(`${target} ${rec.id}: facility_id differs from the reused FAC-0001`);
      if (/csirt|FAC-0002/i.test(JSON.stringify(v))) problems.push(`${target} ${rec.id}: CSIRT-dependent content must stay quarantined`);

      // Column coverage: every manifest key is mapped or explicitly non-persisted — nothing is dropped silently.
      const mappedKeys = new Set(Object.values(spec.columns));
      for (const key of Object.keys(v)) if (!mappedKeys.has(key) && !spec.nonPersisted.includes(key)) problems.push(`${target} ${rec.id}: manifest key "${key}" is neither mapped nor declared non-persisted`);

      const columns: Record<string, unknown> = {};
      for (const [col, key] of Object.entries(spec.columns)) {
        let val = v[key];
        if (val === undefined) val = null;
        const refTarget = spec.references[key];
        if (refTarget) {
          if (typeof val !== "string" || plannedIds.get(val) !== refTarget) problems.push(`${target} ${rec.id}: ${key} does not reference a planned ${refTarget}`);
        }
        columns[col] = val;
      }
      rows.push({ order: order++, target, id: rec.id, codePrefix: spec.prefix, columns, provenance: prov, forcedDefaults: rec.schemaForcedDefaults });
    }
  }

  // Historical-only invariants the importer must never violate (mirrors the DB constraints; fails early and readably).
  for (const w of rows.filter((r) => r.target === "fm_work" || r.target === "fm_work_instructions")) {
    if (w.columns.record_origin !== "migrated_historical") problems.push(`${w.target} ${w.id}: record_origin must be migrated_historical`);
  }
  for (const i of rows.filter((r) => r.target === "fm_incidents")) {
    if (i.columns.record_origin !== "migrated_historical") problems.push(`fm_incidents ${i.id}: record_origin must be migrated_historical`);
  }
  for (const a of rows.filter((r) => r.target === "fm_assets")) {
    if (a.columns.condition === "good") problems.push(`fm_assets ${a.id}: condition "good" is not source-evidenced`);
    for (const f of ["manufacturer", "model", "serial_number"]) if (a.columns[f] !== null) problems.push(`fm_assets ${a.id}: ${f} is speculative metadata`);
  }
  const executedNoJo = rows.filter((r) => r.target === "fm_work" && manifest.records.find((x) => x.id === r.id)?.values.work_instruction !== undefined);
  const wiWorkIds = new Set(rows.filter((r) => r.target === "fm_work_instructions").map((r) => r.columns.work_id));
  for (const w of executedNoJo) if (wiWorkIds.has(w.id)) problems.push(`fm_work ${w.id}: executed without Job Order but a Work Instruction references it`);
  if (Number((manifest.summary.importableNow as Record<string, unknown> | undefined)?.approvalsOrProvenanceRelationships ?? 0) !== 0) {
    problems.push("manifest proposes persisted relationships; the approved plan persists none");
  }
  for (const t of ["fm_cost_records", "fm_cost_submissions", "fm_reimbursement_authorizations", "fm_payments", "fm_approvals"]) {
    if (manifest.records.some((r) => r.target === t) || manifest.deferred.some((d) => d.target === t)) problems.push(`nothing may target ${t}`);
  }
  if (manifest.deferred.length !== 0) problems.push(`${manifest.deferred.length} deferred records present; historical cost stays evidence-only`);

  // Blocking forced defaults.
  const forced = new Map<string, number>();
  for (const r of rows) for (const d of r.forcedDefaults) forced.set(d, (forced.get(d) ?? 0) + 1);
  const blockers: ImportPlan["blockers"] = [];
  const acceptedDisclosures: ImportPlan["acceptedDisclosures"] = [];
  for (const [key, count] of forced) {
    if (key in BLOCKING_FORCED_DEFAULTS) {
      blockers.push({ key, recordCount: count, reason: BLOCKING_FORCED_DEFAULTS[key]! });
    } else if (key in ACCEPTED_FORCED_DEFAULTS) acceptedDisclosures.push({ key, recordCount: count, reason: ACCEPTED_FORCED_DEFAULTS[key]! });
    else problems.push(`unreviewed schema-forced default ${key} (${count} records)`);
  }

  if (problems.length) throw new PlanError(problems);

  const countsByTarget = Object.fromEntries(IMPORT_ORDER.map((t) => [t, rows.filter((r) => r.target === t).length])) as Record<ImportTarget, number>;
  return {
    batchKey: manifest.batchId,
    rulesVersion: manifest.rulesVersion,
    codeYear,
    facility: { code: manifest.facility.code, id: facilityId },
    sources: manifest.sources.map((s) => ({ workbook: s.workbook, file: s.file, sha256: s.sha256 })),
    manifestDigest: digest,
    rows,
    countsByTarget,
    blockers,
    acceptedDisclosures,
    ignoredByDesign: {
      links: manifest.links.length,
      assetAliases: manifest.assetAliases.length,
      deferredEvidence: manifest.deferredEvidence.length,
      deferred: manifest.deferred.length,
      ledgerRowsNotImported: manifest.ledger.filter((l) => !IMPORTABLE_CLASSES.has(l.classification)).length,
    },
  };
}

export function assertExecutable(plan: ImportPlan): void {
  if (plan.blockers.length) {
    throw new PlanError(plan.blockers.map((b) => `BLOCKED ${b.key} (${b.recordCount} records): ${b.reason}`));
  }
}
