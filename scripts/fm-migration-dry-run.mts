/**
 * FM live-data migration — DRY RUN CLI (phase 1). Reads the immutable source workbooks and writes a
 * LOCAL manifest + summary to an ignored output directory. Performs ZERO database writes.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/fm-migration-dry-run.mts [--source=<dir>] [--out=<dir>]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { manifestDigest, runDryRun } from "./fm-migration/dryRun";
import { sha256File } from "./fm-migration/ids";

const arg = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const source = arg("source", "/Users/effiongokpo/Developer/sentracore-migration-source");
const out = resolve(arg("out", "migration-output/fm-dry-run"));

const LETTERS = join(source, "2026 LETTERS (4).xlsx");
const FM_PACK = join(source, "Facility Management Operations System Pack.xlsx");
const FM_PACK_DUP = join(source, "Facility Management Operations System Pack (1).xlsx");
const MBORA = join(source, "MBORA INCOME STATEMENT.xlsx");
for (const f of [LETTERS, FM_PACK, MBORA]) if (!existsSync(f)) throw new Error(`Missing source workbook: ${f}`);

const duplicateFiles: Array<{ file: string; duplicateOf: "FM_PACK" }> = [];
if (existsSync(FM_PACK_DUP)) {
  if (sha256File(FM_PACK_DUP) !== sha256File(FM_PACK)) throw new Error("The duplicate FM pack differs from the canonical copy — stop and report the difference.");
  duplicateFiles.push({ file: "Facility Management Operations System Pack (1).xlsx", duplicateOf: "FM_PACK" });
}

// Read-only facts about the existing canonical facility (FAC-0001) — see scripts/fm-migration README in the report.
const facility = { code: "FAC-0001", id: process.env.FM_MIGRATION_FAC0001_ID ?? "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0" };
const manifest = runDryRun({ files: { LETTERS, FM_PACK, MBORA }, duplicateFiles, facility, timeZone: "Africa/Lagos" });
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
const digest = manifestDigest(manifest);
writeFileSync(join(out, "manifest.sha256"), `${digest}\n`);
writeFileSync(join(out, "summary.json"), JSON.stringify({ batchId: manifest.batchId, digest, summary: manifest.summary, exceptions: { ...manifest.exceptions, invalidFormulas: manifest.exceptions.invalidFormulas.length, incompleteRows: manifest.exceptions.incompleteRows.length } }, null, 2));
const lines: string[] = [`# FM live-data migration — dry-run summary`, ``, `Batch ${manifest.batchId} · manifest digest ${digest}`, `Rules ${manifest.rulesVersion} · as of ${manifest.asOf} · ZERO database writes`, ``, `## Sources`, ...manifest.sources.map((x) => `- ${x.file} — ${x.sha256}`), ...manifest.ignoredDuplicates.map((x) => `- ignored duplicate: ${x.file} (identical to ${x.duplicateOf})`), ``, `## Rows by sheet`, `| sheet | business | structural | import | transform | bootstrap | preserve | quarantine | reject | model gap |`, `|---|---|---|---|---|---|---|---|---|---|`];
for (const [sheet, c] of Object.entries(manifest.summary.bySheet as Record<string, Record<string, number>>)) {
  lines.push(`| ${sheet} | ${c.business} | ${c.structural} | ${c.IMPORT} | ${c.TRANSFORM_IMPORT} | ${c.BOOTSTRAP} | ${c.PRESERVE_HISTORY} | ${c.QUARANTINE} | ${c.REJECT} | ${c.MODEL_GAP} |`);
}
lines.push(``, `## Importable now`, "```json", JSON.stringify(manifest.summary.importableNow, null, 2), "```", ``, `## Blocked by model gap`, "```json", JSON.stringify(manifest.summary.blockedByModelGap, null, 2), "```", ``, `## Model gaps`, ...manifest.exceptions.modelGaps.map((g) => `- ${g.code} (${g.affected}): ${g.description}`), ``, `## Schema-forced defaults (owner-visible)`, ...manifest.exceptions.schemaForcedDefaults.map((d) => `- ${d.target}.${d.field} = ${d.forced} — ${d.asserts}`), ``, `## Repaired dates`, ...manifest.dateExceptions.filter((d) => d.status === "repaired").map((d) => `- ${d.sheet} row ${d.row}: ${d.raw} ⇒ ${d.normalized} (${d.rule})`), ``, `## Links`, JSON.stringify(manifest.summary.links));
writeFileSync(join(out, "summary.md"), lines.join("\n"));
console.log(`batch ${manifest.batchId}\nmanifest digest ${digest}\nwritten to ${out}`);
console.log(JSON.stringify(manifest.summary, null, 2));

