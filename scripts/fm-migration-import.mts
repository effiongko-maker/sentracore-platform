/**
 * FM live-data migration — CONTROLLED IMPORTER CLI.
 *
 *   plan               no database. Validates the approved manifest and prints the ordered plan + blockers.
 *   preflight          read-only DB: schema readiness, census, per-row state, collisions.
 *   execute            WRITES. Refused unless every production gate passes (see importGates.ts).
 *   reconcile          read-only DB: manifest → provenance → domain tables.
 *   verify-idempotency read-only DB: a second execution would insert zero rows.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/fm-migration-import.mts --mode=plan [--manifest=<file>]
 *
 * The importer consumes the committed dry-run manifest; it never re-interprets a spreadsheet. `execute` additionally
 * re-hashes the source workbooks and re-derives the manifest with the committed dry-run code to prove the manifest is
 * exactly what the approved sources produce.
 * Database access: FM_MIGRATION_DATABASE_URL (Postgres URL for the linked project). Nothing is read from the Apps Script.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { manifestDigest, runDryRun, type Manifest } from "./fm-migration/dryRun";
import { sha256File } from "./fm-migration/ids";
import { APPROVED_PROJECT_REF, evaluateProductionGates, projectRefFromDatabaseUrl } from "./fm-migration-import/gates";
import { IMPORT_ORDER, PlanError, buildImportPlan } from "./fm-migration-import/plan";
import { assertSafeToProceed, census, executeImport, readState, reconcile, schemaReadiness, summariseState, verifyIdempotent, type SqlClient } from "./fm-migration-import/executor";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);
const mode = arg("mode") ?? "plan";
const manifestPath = resolve(arg("manifest") ?? "migration-output/fm-dry-run/manifest.json");
const sourceDir = arg("source") ?? "/Users/effiongokpo/Developer/sentracore-migration-source";
const print = (label: string, value: unknown) => console.log(`${label}\n${JSON.stringify(value, null, 2)}`);

function loadManifest(): Manifest {
  if (!existsSync(manifestPath)) throw new Error(`manifest not found: ${manifestPath}`);
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
}

/** Re-hash the immutable workbooks and re-derive the manifest with the committed dry-run code. */
function verifySources(manifest: Manifest): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const files = {
    LETTERS: join(sourceDir, "2026 LETTERS (4).xlsx"),
    FM_PACK: join(sourceDir, "Facility Management Operations System Pack.xlsx"),
    MBORA: join(sourceDir, "MBORA INCOME STATEMENT.xlsx"),
  };
  for (const [code, file] of Object.entries(files)) {
    if (!existsSync(file)) { problems.push(`missing source ${file}`); continue; }
    const want = manifest.sources.find((s) => s.workbook === code)?.sha256;
    if (sha256File(file) !== want) problems.push(`${code} hash ${sha256File(file)} ≠ manifest ${want}`);
  }
  const dup = join(sourceDir, "Facility Management Operations System Pack (1).xlsx");
  const duplicateFiles: Array<{ file: string; duplicateOf: "FM_PACK" }> = [];
  if (existsSync(dup)) {
    if (existsSync(files.FM_PACK) && sha256File(dup) !== sha256File(files.FM_PACK)) problems.push("duplicate FM pack differs from the canonical copy");
    duplicateFiles.push({ file: "Facility Management Operations System Pack (1).xlsx", duplicateOf: "FM_PACK" });
  }
  if (!problems.length) {
    const again = runDryRun({ files, duplicateFiles, facility: { code: manifest.facility.code, id: manifest.facility.id }, timeZone: manifest.organisationTimeZone });
    if (manifestDigest(again) !== manifestDigest(manifest)) problems.push("re-derived manifest digest differs from the supplied manifest");
  }
  return { ok: problems.length === 0, problems };
}

async function connect(): Promise<Client> {
  const url = process.env.FM_MIGRATION_DATABASE_URL;
  if (!url) throw new Error("FM_MIGRATION_DATABASE_URL is not set");
  const ref = projectRefFromDatabaseUrl(url);
  if (ref !== APPROVED_PROJECT_REF) throw new Error(`database URL identifies project ${ref ?? "unknown"}, not ${APPROVED_PROJECT_REF}`);
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function readOnly<T>(fn: (db: SqlClient) => Promise<T>): Promise<T> {
  const client = await connect();
  try {
    await client.query("begin transaction read only");
    const out = await fn(client as unknown as SqlClient);
    await client.query("rollback");
    return out;
  } finally {
    await client.end();
  }
}

async function main() {
  const manifest = loadManifest();
  const approvedDigest = arg("manifest-digest");
  let plan;
  try {
    plan = buildImportPlan(manifest, { expectedDigest: approvedDigest, expectedBatchKey: arg("batch") });
  } catch (e) {
    if (e instanceof PlanError) { console.error(e.message); process.exit(2); }
    throw e;
  }
  const summary = { batch: plan.batchKey, manifestDigest: plan.manifestDigest, countsByTarget: plan.countsByTarget, plannedRows: plan.rows.length, importOrder: ["migration batch + provenance", "facility reuse (FAC-0001)", ...IMPORT_ORDER, "reconciliation"], blockers: plan.blockers, acceptedDisclosures: plan.acceptedDisclosures, ignoredByDesign: plan.ignoredByDesign };

  if (mode === "plan") {
    print("PLAN (no database access)", summary);
    if (plan.blockers.length) console.log(`\nEXECUTION BLOCKED by ${plan.blockers.length} unresolved schema-forced default(s).`);
    return;
  }

  if (mode === "preflight") {
    const report = await readOnly(async (db) => {
      const schema = await schemaReadiness(db);
      const before = await census(db);
      if (schema.length) return { schema, census: before };
      const state = await readState(db, plan);
      return { schema, census: before, state: summariseState(state), conflicts: state.classified.filter((c) => c.state === "conflict").map((c) => c.detail), collisions: state.collisions };
    });
    print("PREFLIGHT (read-only)", { ...summary, ...report });
    return;
  }

  if (mode === "reconcile") {
    const report = await readOnly((db) => reconcile(db, plan));
    print("RECONCILIATION (read-only)", report);
    process.exit(report.ok ? 0 : 1);
  }

  if (mode === "verify-idempotency") {
    const report = await readOnly((db) => verifyIdempotent(db, plan));
    print("IDEMPOTENCY (read-only): a second execution would insert 0 rows", report);
    process.exit(report.ok ? 0 : 1);
  }

  if (mode === "execute") {
    const sources = verifySources(manifest);
    const failures = evaluateProductionGates({
      productionFlag: flag("i-understand-this-writes-production"),
      confirm: arg("confirm"),
      expectedProjectRef: arg("project-ref"),
      linkedProjectRef: existsSync("supabase/.temp/project-ref") ? readFileSync("supabase/.temp/project-ref", "utf8").trim() : undefined,
      databaseUrl: process.env.FM_MIGRATION_DATABASE_URL,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      batchKey: plan.batchKey,
      approvedBatchKey: arg("batch"),
      manifestDigest: plan.manifestDigest,
      approvedDigest,
      sourcesVerified: sources.ok,
      blockers: plan.blockers.length,
    });
    if (failures.length || !sources.ok) {
      console.error(`EXECUTION REFUSED — no connection was opened:\n - ${[...failures, ...sources.problems].join("\n - ")}`);
      process.exit(3);
    }
    // Schema readiness and the pre-write state are re-checked in a read-only transaction before any write.
    const pre = await readOnly(async (db) => ({ schema: await schemaReadiness(db), census: await census(db), state: summariseState(assertStateShape(await readState(db, plan))) }));
    print("PRE-WRITE CHECKPOINT", { ...summary, sourcesVerified: true, schemaProblems: pre.schema, census: pre.census, state: pre.state });
    if (pre.schema.length) { console.error("schema not ready — refusing"); process.exit(4); }
    const client = await connect();
    try {
      const result = await executeImport(client as unknown as SqlClient, plan);
      print("EXECUTION RESULT", result);
      print("POST-WRITE CENSUS", await census(client as unknown as SqlClient));
    } finally {
      await client.end();
    }
    return;
  }
  throw new Error(`unknown --mode=${mode}`);
}

function assertStateShape<T extends Parameters<typeof assertSafeToProceed>[0]>(state: T): T {
  assertSafeToProceed(state);
  return state;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
