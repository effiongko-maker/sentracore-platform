/**
 * FM Master Data bootstrap — NCC Annex estate structure (owner-confirmed) + source-backed evidence.
 *
 * Creates ONLY: 2 buildings, 8 floors, 17 rooms, 2 departments under FAC-0001, through the existing Master Data service
 * (normal validation + code generation stay authoritative; no codes are supplied). Records provenance in the EXISTING
 * governed ledger as a NEW batch: row-level evidence for every entity that a genuine workbook row supports (28), and a
 * batch-level owner-confirmed decision for "Annex Building" (no workbook row exists for it — none is fabricated).
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/reconstruct-fm-master-data.mts \
 *     --actor=<profile uuid>            # DRY-RUN (default): prints the plan + conflict checks, writes nothing
 *   ... --actor=<uuid> --apply          # create + ledger (idempotent; safe to re-run)
 *
 * Never touches Requests, Work, Work Instructions, Assets, Incidents, inspections, vendors, CSIRT or Head Office, and
 * creates no link from any historical record.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readWorkbook, sheetByName, type Sheet } from "./fm-migration/xlsx";
import { sha256File, sha256Text } from "./fm-migration/ids";

function loadEnvLocal() {
  const p = resolve(".env.local");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const FACILITY_CODE = "FAC-0001";
const BATCH_KEY = "fm-master-data-bootstrap-1";
const RULES_VERSION = "fm-master-data-bootstrap/1";
const FILES = { FM_PACK: "Facility Management Operations System Pack.xlsx", MBORA: "MBORA INCOME STATEMENT.xlsx" } as const;
type WB = keyof typeof FILES;

type Evidence = { wb: WB; sheet: string; row: number; col: string; contains: string; support?: number[] };
type Spec =
  | { target: "fm_buildings"; name: string; evidence: Evidence | null }
  | { target: "fm_floors"; name: string; building: string; evidence: Evidence }
  | { target: "fm_rooms"; name: string; floor: string; evidence: Evidence; variants?: string[] }
  | { target: "fm_departments"; name: string; evidence: Evidence };

const MR = "Maintenance Request";
const EX = "Executed (NO JOB ORDER)";
const ev = (wb: WB, sheet: string, row: number, col: string, contains: string, support: number[] = []): Evidence => ({ wb, sheet, row, col, contains, support });

// Deterministic candidate set. Order = dependency order, floors bottom-up, rooms by floor then code.
const PLAN: Spec[] = [
  { target: "fm_buildings", name: "Annex Building", evidence: null }, // owner-confirmed structural decision; NO source row
  { target: "fm_buildings", name: "Digital Park", evidence: ev("FM_PACK", "Facility Inspection", 4, "A", "digital park") },
  { target: "fm_floors", building: "Annex Building", name: "Basement 2", evidence: ev("MBORA", EX, 5, "B", "basement 2") },
  { target: "fm_floors", building: "Annex Building", name: "Basement 1", evidence: ev("FM_PACK", MR, 14, "E", "basement", [23]) },
  { target: "fm_floors", building: "Annex Building", name: "Ground Floor", evidence: ev("MBORA", EX, 6, "B", "ground floor") },
  { target: "fm_floors", building: "Annex Building", name: "1st Floor", evidence: ev("FM_PACK", MR, 7, "E", "1st floor", [11, 12, 18, 20]) },
  { target: "fm_floors", building: "Annex Building", name: "2nd Floor", evidence: ev("FM_PACK", MR, 8, "E", "2nd floor") },
  { target: "fm_floors", building: "Annex Building", name: "3rd Floor", evidence: ev("FM_PACK", MR, 5, "E", "3rd floor", [6, 13, 28]) },
  { target: "fm_floors", building: "Annex Building", name: "4th Floor", evidence: ev("FM_PACK", MR, 4, "E", "4th floor", [9, 10, 16, 19, 21, 31]) },
  { target: "fm_floors", building: "Annex Building", name: "5th Floor", evidence: ev("FM_PACK", MR, 17, "E", "5th floor", [22, 25, 26]) },
  // Rooms: the source record itself states the floor together with the room code (parent is source-stated, never derived).
  { target: "fm_rooms", floor: "1st Floor", name: "1A 32", evidence: ev("FM_PACK", MR, 7, "E", "1a 32", [11, 12, 15]), variants: ["1A-32", "1A 32"] },
  { target: "fm_rooms", floor: "1st Floor", name: "1A 40", evidence: ev("FM_PACK", MR, 20, "E", "1a 40") },
  { target: "fm_rooms", floor: "1st Floor", name: "1C 28", evidence: ev("FM_PACK", MR, 18, "E", "1c 28") },
  { target: "fm_rooms", floor: "2nd Floor", name: "2C 28", evidence: ev("FM_PACK", MR, 8, "E", "2c 28") },
  { target: "fm_rooms", floor: "3rd Floor", name: "3A 34", evidence: ev("FM_PACK", MR, 28, "E", "3a 34") },
  { target: "fm_rooms", floor: "3rd Floor", name: "3B 12", evidence: ev("FM_PACK", MR, 6, "E", "3b 12") },
  { target: "fm_rooms", floor: "3rd Floor", name: "3B 16", evidence: ev("FM_PACK", MR, 5, "E", "3b 16", [13]) },
  { target: "fm_rooms", floor: "4th Floor", name: "4A 35", evidence: ev("FM_PACK", MR, 31, "E", "4a 35") },
  { target: "fm_rooms", floor: "4th Floor", name: "4B 04", evidence: ev("FM_PACK", MR, 19, "E", "4b 04") },
  { target: "fm_rooms", floor: "4th Floor", name: "4B 06", evidence: ev("FM_PACK", MR, 16, "E", "4b 06") },
  { target: "fm_rooms", floor: "4th Floor", name: "4B 14", evidence: ev("FM_PACK", MR, 32, "E", "4b 14") },
  { target: "fm_rooms", floor: "4th Floor", name: "4B 17", evidence: ev("FM_PACK", MR, 10, "E", "4b -17"), variants: ["4B -17"] },
  { target: "fm_rooms", floor: "4th Floor", name: "4B 18", evidence: ev("FM_PACK", MR, 9, "E", "4b-18"), variants: ["4B-18"] },
  { target: "fm_rooms", floor: "4th Floor", name: "4C 21", evidence: ev("FM_PACK", MR, 4, "E", "4c 21", [21]), variants: ["4c 21"] },
  { target: "fm_rooms", floor: "5th Floor", name: "5B 06", evidence: ev("FM_PACK", MR, 25, "E", "5b 06", [26]), variants: ["5b06"] },
  { target: "fm_rooms", floor: "5th Floor", name: "5B 10", evidence: ev("FM_PACK", MR, 17, "E", "5b 10") },
  { target: "fm_rooms", floor: "5th Floor", name: "5C 26", evidence: ev("FM_PACK", MR, 22, "E", "5c 26") },
  // Departments: exact bare source values only (no expansion, no role-prefixed tokens, no trades).
  { target: "fm_departments", name: "CIG", evidence: ev("FM_PACK", MR, 4, "D", "cig", [16, 22]) },
  { target: "fm_departments", name: "SPAD", evidence: ev("FM_PACK", MR, 28, "D", "spad") },
];

const OWNER_CONFIRMATION = {
  workbook: "OWNER_CONFIRMATION",
  kind: "owner_confirmed_estate_structure",
  confirmedOn: "2026-09-21",
  statements: [
    "FAC-0001 / NCC Annex is one operational facility in Mbora, within the FM team's jurisdiction.",
    "The estate contains a principal Annex building plus Digital Park; Wings A/B/C are internal parts of the principal building, not separate buildings.",
    "The principal building's canonical SentraCore name is 'Annex Building'; Digital Park is a separate building under the same facility.",
    "The principal building has two basement levels below Ground Floor, then floors 1 to 5.",
    "Head Office / Maitama is outside FM jurisdiction and NCC-CSIRT is not part of this bootstrap: neither is created here.",
  ],
  canonicalDecisions: [{ targetTable: "fm_buildings", name: "Annex Building", facility: FACILITY_CODE, rowLevelProvenance: false, basis: "owner_confirmation" }],
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
function rowFingerprint(sheet: Sheet, row: number): string {
  const cells = [...(sheet.rows.get(row)?.values() ?? [])].sort((a, b) => a.col.localeCompare(b.col, "en", { numeric: true }));
  return sha256Text(JSON.stringify(cells.map((c) => [c.col, c.value, c.formula])));
}

async function main() {
  loadEnvLocal();
  const apply = process.argv.includes("--apply");
  const actor = arg("actor");
  if (!actor) throw new Error("--actor=<profile uuid> is required");
  const source = arg("source") ?? resolve(process.env.HOME ?? "", "Developer/sentracore-migration-source");

  // ---- 1. Evidence: read the ORIGINAL workbooks, verify every cell, compute fingerprints ----------------------------
  const shas = { FM_PACK: sha256File(resolve(source, FILES.FM_PACK)), MBORA: sha256File(resolve(source, FILES.MBORA)) };
  const books = { FM_PACK: readWorkbook(resolve(source, FILES.FM_PACK)), MBORA: readWorkbook(resolve(source, FILES.MBORA)) };
  type Resolved = Spec & { key: string; fingerprint: string | null; sha: string | null; sourceReference: string | null; support: number[] };
  const resolved: Resolved[] = PLAN.map((s) => {
    if (!s.evidence) return { ...s, key: `${s.target}:${s.name}`, fingerprint: null, sha: null, sourceReference: null, support: [] } as Resolved;
    const e = s.evidence;
    const sheet = sheetByName(books[e.wb], e.sheet);
    const check = (row: number) => {
      const text = sheet.rows.get(row)?.get(e.col)?.value ?? "";
      if (!norm(text).replace(/[- ]/g, "").includes(norm(e.contains).replace(/[- ]/g, ""))) {
        throw new Error(`evidence mismatch: ${e.wb}/${e.sheet} row ${row} col ${e.col} = ${JSON.stringify(text)} does not contain ${JSON.stringify(e.contains)} (${s.target} ${s.name})`);
      }
      return text;
    };
    const text = check(e.row);
    for (const r of e.support ?? []) check(r);
    return { ...s, key: `${s.target}:${s.name}`, fingerprint: rowFingerprint(sheet, e.row), sha: shas[e.wb], sourceReference: text, support: e.support ?? [] } as Resolved;
  });

  const counts = (t: string) => resolved.filter((r) => r.target === t).length;
  const withRow = resolved.filter((r) => r.fingerprint);
  const plan = { buildings: counts("fm_buildings"), floors: counts("fm_floors"), rooms: counts("fm_rooms"), departments: counts("fm_departments"), total: resolved.length, rowLevel: withRow.length, ownerConfirmedBatchLevel: resolved.length - withRow.length };
  if (plan.buildings !== 2 || plan.floors !== 8 || plan.rooms !== 17 || plan.departments !== 2 || plan.total !== 29 || plan.rowLevel !== 28 || plan.ownerConfirmedBatchLevel !== 1) throw new Error(`candidate set is not the approved 2/8/17/2 = 29 (28 row-level + 1 owner-confirmed): ${JSON.stringify(plan)}`);
  const dupes = resolved.filter((r, i) => resolved.findIndex((x) => x.key === r.key) !== i);
  const rowKeys = withRow.map((r) => `${r.target}|${(r as { evidence: Evidence }).evidence.wb}|${(r as { evidence: Evidence }).evidence.sheet}|${(r as { evidence: Evidence }).evidence.row}`);
  if (dupes.length || new Set(rowKeys).size !== rowKeys.length) throw new Error("duplicate candidate / duplicate (source row, target table) in the plan");

  // ---- 2. Production state + conflict checks (SELECT only) ----------------------------------------------------------
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id").eq("status", "active");
  if ((orgs ?? []).length !== 1) throw new Error("expected exactly one active organisation");
  const organisationId = String((orgs![0] as { id: string }).id);
  const { data: fac } = await admin.from("fm_facilities").select("id, code, name").eq("organisation_id", organisationId).ilike("code", FACILITY_CODE);
  if ((fac ?? []).length !== 1) throw new Error(`${FACILITY_CODE} not uniquely resolved`);
  const facilityId = String((fac![0] as { id: string }).id);
  const q = async (table: string, cols: string) => {
    const { data, error } = await admin.from(table).select(cols).eq("organisation_id", organisationId);
    if (error) throw new Error(`${table}: ${error.message}`);
    return (data ?? []) as unknown as Array<Record<string, string>>;
  };
  const [bRows, fRows, rRows, dRows, vRows] = await Promise.all([q("fm_buildings", "id,name,code,facility_id"), q("fm_floors", "id,name,code,building_id"), q("fm_rooms", "id,name,code,floor_id"), q("fm_departments", "id,name,code,facility_id"), q("fm_vendors", "id")]);
  const existing = { buildings: bRows.length, floors: fRows.length, rooms: rRows.length, departments: dRows.length, vendors: vRows.length };
  const { data: provBefore } = await admin.from("fm_migration_provenance").select("id", { count: "exact", head: true });
  void provBefore;

  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY-RUN (no writes)", facility: { code: FACILITY_CODE, id: facilityId }, plan, productionBefore: existing, workbookShas: shas }, null, 2));
  console.log("\nProposed inserts (codes are assigned by the Master Data service, not supplied):");
  for (const r of resolved) {
    const parent = "building" in r ? ` ← building "${r.building}"` : "floor" in r ? ` ← floor "${r.floor}"` : r.target === "fm_buildings" || r.target === "fm_departments" ? ` ← ${FACILITY_CODE}` : "";
    const evid = r.fingerprint ? `${(r as { evidence: Evidence }).evidence.wb}/${(r as { evidence: Evidence }).evidence.sheet} row ${(r as { evidence: Evidence }).evidence.row}${r.support.length ? ` (+support rows ${r.support.join(",")})` : ""} = ${JSON.stringify(r.sourceReference)}` : "OWNER-CONFIRMED (batch level; no source row)";
    console.log(`  ${r.target.padEnd(14)} ${JSON.stringify(r.name).padEnd(16)}${parent.padEnd(30)} ${evid}`);
  }
  // Conflicts: same parent + same name (case-insensitive) already present; same batch already present.
  const conflicts: string[] = [];
  const bByName = new Map(bRows.map((b) => [b.name.toLowerCase(), b]));
  for (const r of resolved) {
    if (r.target === "fm_buildings" && bByName.has(r.name.toLowerCase())) conflicts.push(`building "${r.name}" already exists (${bByName.get(r.name.toLowerCase())!.code})`);
    if (r.target === "fm_departments" && dRows.some((d) => d.name.toLowerCase() === r.name.toLowerCase())) conflicts.push(`department "${r.name}" already exists`);
  }
  if (existing.vendors !== 0) conflicts.push(`vendors not empty (${existing.vendors})`);
  console.log(`\nConflict check: ${conflicts.length ? conflicts.join("; ") : "none — no duplicate parent/name records exist"}`);
  if (!apply) {
    console.log("\nDRY-RUN complete. Nothing was written.");
    return;
  }

  // ---- 3. APPLY (idempotent) ----------------------------------------------------------------------------------------
  const { FmLocationServerService } = await import("../src/modules/master-data/server/FmLocationServerService");
  const svc = new FmLocationServerService({ organisationId, profileId: actor } as never);
  const sources = [
    { workbook: "FM_PACK", file: FILES.FM_PACK, sha256: shas.FM_PACK },
    { workbook: "MBORA", file: FILES.MBORA, sha256: shas.MBORA },
    OWNER_CONFIRMATION,
  ];
  let { data: batch } = await admin.from("fm_migration_batches").select("id, rules_version").eq("organisation_id", organisationId).eq("batch_key", BATCH_KEY).maybeSingle();
  if (!batch) {
    const ins = await admin.from("fm_migration_batches").insert({ organisation_id: organisationId, batch_key: BATCH_KEY, rules_version: RULES_VERSION, sources }).select("id, rules_version").single();
    if (ins.error) throw new Error(`batch insert: ${ins.error.message}`);
    batch = ins.data;
  }
  const batchId = String((batch as { id: string }).id);

  const idByKey = new Map<string, string>();
  for (const b of bRows) idByKey.set(`fm_buildings:${b.name}`, b.id);
  const floorKey = (building: string, name: string) => `fm_floors:${building}/${name}`;
  const bNameById = new Map(bRows.map((b) => [b.id, b.name]));
  for (const f of fRows) idByKey.set(floorKey(bNameById.get((f as unknown as { building_id: string }).building_id) ?? "?", f.name), f.id);
  const fNameById = new Map(fRows.map((f) => [f.id, f.name]));
  for (const r of rRows) idByKey.set(`fm_rooms:${fNameById.get((r as unknown as { floor_id: string }).floor_id) ?? "?"}/${r.name}`, r.id);
  for (const d of dRows) idByKey.set(`fm_departments:${d.name}`, d.id);

  const created: string[] = [];
  for (const r of resolved) {
    let id: string | undefined;
    if (r.target === "fm_buildings") id = idByKey.get(`fm_buildings:${r.name}`);
    else if (r.target === "fm_floors") id = idByKey.get(floorKey((r as { building: string }).building, r.name));
    else if (r.target === "fm_rooms") id = idByKey.get(`fm_rooms:${(r as { floor: string }).floor}/${r.name}`);
    else id = idByKey.get(`fm_departments:${r.name}`);
    if (!id) {
      const payload =
        r.target === "fm_buildings" ? { entity: "buildings", name: r.name, facilityId: FACILITY_CODE }
        : r.target === "fm_departments" ? { entity: "departments", name: r.name, facilityId: FACILITY_CODE }
        : r.target === "fm_floors" ? { entity: "floors", name: r.name, buildingId: idByKey.get(`fm_buildings:${(r as { building: string }).building}`) }
        : { entity: "rooms", name: r.name, floorId: idByKey.get(floorKey("Annex Building", (r as { floor: string }).floor)) };
      const item = (await svc.create(payload)) as { id: string; code?: string };
      id = item.id;
      created.push(`${r.target} ${r.name} → ${item.code ?? "?"}`);
    }
    if (r.target === "fm_buildings") idByKey.set(`fm_buildings:${r.name}`, id);
    else if (r.target === "fm_floors") idByKey.set(floorKey((r as { building: string }).building, r.name), id);
    else if (r.target === "fm_rooms") idByKey.set(`fm_rooms:${(r as { floor: string }).floor}/${r.name}`, id);
    else idByKey.set(`fm_departments:${r.name}`, id);

    if (r.fingerprint) {
      const e = (r as { evidence: Evidence }).evidence;
      const { data: have } = await admin.from("fm_migration_provenance").select("id").eq("organisation_id", organisationId).eq("target_table", r.target).eq("target_id", id).maybeSingle();
      if (!have) {
        const transformations: string[] = [
          `canonical ${r.target.replace("fm_", "").replace(/s$/, "")} "${r.name}" reconstructed from workbook evidence; source value ${JSON.stringify(r.sourceReference)} (col ${e.col})`,
          ...(r.support.length ? [`further supporting source rows in the same sheet: ${r.support.join(", ")}`] : []),
          ...(("variants" in r && r.variants?.length) ? [`source presentation variants of the same code: ${r.variants.map((v) => JSON.stringify(v)).join(", ")} (case/space/hyphen only)`] : []),
          ...(r.target === "fm_floors" && r.name === "Basement 1" ? ['source labels this level "-1 / Basement (-1)"; the owner-confirmed canonical name is "Basement 1"'] : []),
          ...(r.target === "fm_rooms" ? [`floor "${(r as { floor: string }).floor}" is stated by the source record itself, not derived from the code`] : []),
          "batch-level owner confirmation: see fm_migration_batches.sources (OWNER_CONFIRMATION)",
        ];
        const ins = await admin.from("fm_migration_provenance").insert({
          organisation_id: organisationId, batch_id: batchId, workbook: e.wb, workbook_sha256: r.sha!, source_sheet: e.sheet, source_row: e.row,
          source_reference: r.sourceReference, fingerprint: r.fingerprint, target_table: r.target, target_id: id, classification: "BOOTSTRAP", transformations,
        });
        if (ins.error) throw new Error(`provenance insert (${r.target} ${r.name}): ${ins.error.message}`);
      }
    }
  }
  console.log(`\nAPPLIED. Created ${created.length} record(s) this run:\n  ${created.join("\n  ") || "(none — everything already existed)"}`);
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
