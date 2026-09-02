#!/usr/bin/env node
/**
 * Regenerates Apps Script deployment artifacts from the repo source of truth.
 *
 * Outputs (always overwritten):
 *   apps-script/deployment/DEPLOYMENT_PACK.md
 *   apps-script/deployment/DEPLOYMENT_CHECKLIST.md
 *   apps-script/deployment/VERSION.md
 *
 * Run:
 *   npm run apps-script:pack
 *
 * Policy:
 *   Whenever any apps-script .gs file changes, regenerate before completing
 *   the task / commit. These artifacts are build output, not optional docs.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APPS_SCRIPT = path.join(ROOT, "apps-script");
const DEPLOY_DIR = path.join(APPS_SCRIPT, "deployment");
const META_PATH = path.join(DEPLOY_DIR, "release-meta.json");

const EXCLUDE_BASENAMES = new Set([
  "ROUTER_UPDATE.gs",
  "UsersService.snapshotHooks.gs",
]);

function walkGsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip nested non-source folders if any appear later.
      if (entry.name === "node_modules") continue;
      walkGsFiles(full, acc);
      continue;
    }
    if (!entry.name.endsWith(".gs")) continue;
    if (EXCLUDE_BASENAMES.has(entry.name)) continue;
    acc.push(full);
  }
  return acc;
}

function deployLabel(absPath) {
  const rel = path.relative(APPS_SCRIPT, absPath).split(path.sep).join("/");
  // deployment/ROUTER.gs copies into Apps Script as ROUTER.gs
  if (rel === "deployment/ROUTER.gs") return "ROUTER.gs";
  return path.basename(absPath);
}

/** Prefer Repository → Service → Controller so deploy checklists match runtime deps. */
function deployLayer(label) {
  if (label === "ROUTER.gs") return 0;
  if (/Repository\.gs$/i.test(label)) return 1;
  if (/Service\.gs$/i.test(label)) return 2;
  if (/Controller\.gs$/i.test(label)) return 3;
  return 4;
}

function sortFiles(files) {
  return [...files].sort((a, b) => {
    const la = deployLabel(a);
    const lb = deployLabel(b);
    const layerDiff = deployLayer(la) - deployLayer(lb);
    if (layerDiff !== 0) return layerDiff;
    return la.localeCompare(lb);
  });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildPack(files) {
  const generatedAt = new Date().toISOString();
  const lines = [];
  lines.push("# SentraCore Apps Script Deployment Pack");
  lines.push("");
  lines.push("<!-- GENERATED FILE — do not edit by hand. -->");
  lines.push("<!-- Regenerate with: npm run apps-script:pack -->");
  lines.push("");
  lines.push(`Generated: ${generatedAt}`);
  lines.push("");
  lines.push("This document is the **single source of truth** for copying Apps Script");
  lines.push("source into the Google Apps Script project.");
  lines.push("");
  lines.push("For each file below:");
  lines.push("1. Open or create a script file with the exact `FILE:` name.");
  lines.push("2. Replace the entire contents with the block under that heading.");
  lines.push("3. Save.");
  lines.push("");
  lines.push("Then follow `DEPLOYMENT_CHECKLIST.md`.");
  lines.push("");
  lines.push("## File index");
  lines.push("");
  for (const file of files) {
    lines.push(`- ${deployLabel(file)}`);
  }
  lines.push("");

  for (const file of files) {
    const label = deployLabel(file);
    const contents = fs.readFileSync(file, "utf8").replace(/\s+$/, "");
    lines.push("======================================");
    lines.push(`FILE:`);
    lines.push(label);
    lines.push("======================================");
    lines.push("");
    lines.push("```javascript");
    lines.push(contents);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

function buildChecklist(meta, files) {
  const labels = files.map(deployLabel);
  const replaceExisting = labels.filter((n) => n !== "ROUTER.gs");
  const newLikely = [
    "ReportingSnapshotRepository.gs",
    "ReportingSnapshotService.gs",
    "ReportingSnapshotController.gs",
    "ReportingSnapshotTriggers.gs",
    "UserService.gs",
    "ROUTER.gs",
  ].filter((n) => labels.includes(n));

  const lines = [];
  lines.push("# Apps Script Deployment Checklist");
  lines.push("");
  lines.push("<!-- GENERATED FILE — do not edit by hand. -->");
  lines.push("<!-- Regenerate with: npm run apps-script:pack -->");
  lines.push("");
  lines.push(`Release: **${meta.release}** — ${meta.title || ""}`.trim());
  lines.push("");
  lines.push("Use this checklist with `DEPLOYMENT_PACK.md` open. Someone unfamiliar");
  lines.push("with the project should be able to deploy from these steps alone.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 0. Prerequisites");
  lines.push("");
  lines.push("- Access to the SentraCore Google Apps Script project (bound to the ops spreadsheet).");
  lines.push("- Access to deploy a **new Web App version** (Execute as: Me, Who has access: Anyone).");
  lines.push("- Local Next.js app running (`npm run dev`) for smoke tests against `/api/*`.");
  lines.push("- Confirm `APPS_SCRIPT_URL` / `NEXT_PUBLIC_API_URL` points at the Web App `/exec` URL.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 1. Files that must be copied into Apps Script");
  lines.push("");
  lines.push("Copy **every** file listed in `DEPLOYMENT_PACK.md` (full source is embedded there).");
  lines.push("");
  lines.push("Current pack file list:");
  lines.push("");
  for (const label of labels) {
    lines.push(`- [ ] \`${label}\``);
  }
  lines.push("");
  lines.push("Especially ensure these reporting-snapshot files exist:");
  lines.push("");
  for (const label of newLikely) {
    lines.push(`- [ ] \`${label}\``);
  }
  lines.push("");
  const paymentTriad = [
    "ReimbursementPaymentRepository.gs",
    "ReimbursementPaymentService.gs",
    "ReimbursementPaymentsController.gs",
  ].filter((n) => labels.includes(n));
  if (paymentTriad.length) {
    lines.push(
      "CRITICAL — reimbursement-payments requires **all three** files (Controller alone is not enough):"
    );
    lines.push("");
    for (const label of paymentTriad) {
      lines.push(`- [ ] \`${label}\``);
    }
    lines.push("");
    lines.push(
      "> Live symptom if Service is missing: `ReimbursementPaymentService is not defined`."
    );
    lines.push(
      "> Confirm in the Apps Script project file list that `ReimbursementPaymentService.gs` exists and defines `var ReimbursementPaymentService`."
    );
    lines.push("");
  }
  lines.push("> Note: `UserRepository.gs` may already exist only in the deployed Apps Script");
  lines.push("> project. Do **not** delete it. Replace `UsersController.gs` and `UserService.gs`");
  lines.push("> from this pack when present.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 2. Existing files that must be replaced");
  lines.push("");
  lines.push("For each file that already exists in Apps Script, **replace the entire contents**");
  lines.push("(do not merge by hand):");
  lines.push("");
  for (const label of replaceExisting) {
    lines.push(`- [ ] Replace \`${label}\``);
  }
  lines.push("- [ ] Replace `ROUTER.gs` (or the project file that currently holds `doPost` / `jsonResponse_`)");
  lines.push("");
  lines.push("If your project historically kept `doPost` inside `Code.gs`, either:");
  lines.push("1. Paste `ROUTER.gs` contents into `Code.gs` and remove duplicate `doPost`/`jsonResponse_`, **or**");
  lines.push("2. Add `ROUTER.gs` and delete the old `doPost`/`jsonResponse_` from `Code.gs` so only one definition remains.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 3. Router updates required");
  lines.push("");
  lines.push("- [ ] Ensure `deployment/ROUTER.gs` is deployed as the live router.");
  lines.push("- [ ] Confirm `resource === \"reporting-snapshot\"` routes to `ReportingSnapshotController.handle`.");
  lines.push("- [ ] Confirm all module resources are registered:");
  lines.push("  - `users`");
  lines.push("  - `facilities`");
  lines.push("  - `assets`");
  lines.push("  - `work-orders`");
  lines.push("  - `incidents`");
  lines.push("  - `maintenance`");
  lines.push("  - `master-data`");
  lines.push("  - `reporting-snapshot`");
  lines.push("- [ ] Confirm there is exactly one `doPost` and one `jsonResponse_` in the project.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 4. Trigger installation");
  lines.push("");
  lines.push(meta.triggerRequired ? "Trigger installation is **REQUIRED** for this release." : "Trigger installation is not required for this release.");
  lines.push("");
  lines.push("- [ ] In the Apps Script editor, open `ReportingSnapshotTriggers.gs`.");
  lines.push("- [ ] Run `installReportingSnapshotTrigger()` once (authorize if prompted).");
  lines.push("- [ ] Verify Executions / Triggers shows `rebuildReportingSnapshotScheduled` every 10 minutes.");
  lines.push("- [ ] Optional rollback of triggers only: run `removeReportingSnapshotTriggers()`.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 5. Web App deployment");
  lines.push("");
  lines.push(meta.appsScriptRedeploy ? "A **new Web App version** is REQUIRED." : "Web App redeploy is not required for this release.");
  lines.push("");
  lines.push("- [ ] Deploy → Manage deployments → Edit (pencil) → **New version** → Deploy.");
  lines.push("- [ ] Keep the same `/exec` URL unless intentionally rotating credentials.");
  lines.push("- [ ] Confirm Next.js env still matches the deployed `/exec` URL.");
  lines.push("- [ ] Unpublished editor saves do **not** affect the live Web App URL.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 6. Smoke test commands");
  lines.push("");
  lines.push("With `npm run dev` running:");
  lines.push("");
  for (const test of meta.smokeTests || []) {
    lines.push(`### ${test.name}`);
    lines.push("");
    lines.push("```bash");
    lines.push(test.command);
    lines.push("```");
    lines.push("");
  }
  lines.push("Expected checks:");
  lines.push("");
  lines.push("- [ ] `reporting-snapshot` `getSnapshot` returns `success: true`.");
  lines.push("- [ ] `_snapshotMeta.source` is `REPORTING_SNAPSHOT` (or equivalent).");
  lines.push("- [ ] Facilities with Status `Active` increment `kpis.activeFacilities`.");
  lines.push("- [ ] Assets with Status `Operational` increment `kpis.activeAssets`.");
  lines.push("- [ ] `/dashboards` and `/reports` load without blank KPI strips.");
  lines.push("- [ ] Creating/updating a facility refreshes snapshot KPIs after reload.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 7. Rollback instructions");
  lines.push("");
  lines.push("If production misbehaves after deploy:");
  lines.push("");
  lines.push("1. **Web App rollback**: Deploy → Manage deployments → create a new version from the previous deployment’s code snapshot (or re-paste the prior pack).");
  lines.push("2. **Disable scheduled rebuild**: run `removeReportingSnapshotTriggers()`.");
  lines.push("3. **Router fallback**: temporarily route `reporting-snapshot` to return `jsonResponse_(false, \"disabled\", null)` if the sheet layer is corrupt.");
  lines.push("4. **App safety**: Next.js `ReportingService` already falls back to live domain aggregation when the sheet snapshot is missing/corrupt — blank dashboards should not occur if fallback is intact.");
  lines.push("5. **Data**: Domain sheets remain system of record. `REPORTING_SNAPSHOT` can be rebuilt with action `rebuild` after fixing code.");
  lines.push("");
  lines.push("```bash");
  lines.push(
    (meta.smokeTests || []).find((t) => /rebuild/i.test(t.name))?.command ||
      "curl -sS -X POST http://localhost:3000/api/reporting-snapshot -H 'Content-Type: application/json' -d '{\"resource\":\"reporting-snapshot\",\"action\":\"rebuild\",\"payload\":{}}'"
  );
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Maintainer policy");
  lines.push("");
  lines.push("- Any change to `apps-script/**/*.gs` **must** run `npm run apps-script:pack` before the task is complete.");
  lines.push("- Commit the regenerated `DEPLOYMENT_PACK.md`, `DEPLOYMENT_CHECKLIST.md`, and `VERSION.md` with the `.gs` changes.");
  lines.push("- Update `apps-script/deployment/release-meta.json` when cutting a new release.");
  lines.push("");

  return lines.join("\n");
}

function buildVersion(meta, files) {
  const labels = files.map(deployLabel);
  const lines = [];
  lines.push(`Release:`);
  lines.push(meta.release);
  lines.push("");
  if (meta.title) {
    lines.push(`Title:`);
    lines.push(meta.title);
    lines.push("");
  }
  lines.push(`Generated:`);
  lines.push(new Date().toISOString());
  lines.push("");
  lines.push(`Features`);
  for (const item of meta.features || []) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push(`Performance`);
  for (const item of meta.performance || []) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push(`Files Changed`);
  for (const label of labels) {
    lines.push(`- ${label}`);
  }
  lines.push("");
  lines.push(`Deployment Required`);
  lines.push(meta.deploymentRequired ? "YES" : "NO");
  lines.push("");
  lines.push(`Trigger Required`);
  lines.push(meta.triggerRequired ? "YES" : "NO");
  lines.push("");
  lines.push(`Apps Script Redeploy`);
  lines.push(meta.appsScriptRedeploy ? "YES" : "NO");
  lines.push("");
  lines.push(`Smoke Tests`);
  lines.push("");
  for (const test of meta.smokeTests || []) {
    lines.push(`${test.name}:`);
    lines.push("");
    lines.push("```bash");
    lines.push(test.command);
    lines.push("```");
    lines.push("");
  }
  if (meta.notes?.length) {
    lines.push(`Notes`);
    for (const note of meta.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }
  if (meta.deploymentSemantics && typeof meta.deploymentSemantics === "object") {
    lines.push(`Deployment semantics`);
    for (const [key, value] of Object.entries(meta.deploymentSemantics)) {
      lines.push(`- \`${key}\`: ${value}`);
    }
    lines.push("");
  }
  if (meta.liveVerification && typeof meta.liveVerification === "object") {
    const lv = meta.liveVerification;
    lines.push(`Live verification (read-only audit)`);
    if (lv.verifiedAt) lines.push(`- Verified: ${lv.verifiedAt}`);
    if (lv.method) lines.push(`- Method: ${lv.method}`);
    if (lv.costRecordsStatus) {
      lines.push(`- CostRecord live status: ${lv.costRecordsStatus}`);
    }
    for (const [key, value] of Object.entries(lv)) {
      if (
        key === "verifiedAt" ||
        key === "method" ||
        key === "costRecordsStatus" ||
        key === "notes"
      ) {
        continue;
      }
      if (typeof value === "boolean") {
        lines.push(`- ${key}: ${value ? "yes" : "no"}`);
      }
    }
    if (Array.isArray(lv.notes) && lv.notes.length) {
      lines.push(`- Notes:`);
      for (const note of lv.notes) {
        lines.push(`  - ${note}`);
      }
    }
    lines.push("");
  }
  lines.push(`<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->`);
  lines.push("");
  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(META_PATH)) {
    console.error(`Missing ${META_PATH}`);
    process.exit(1);
  }

  const meta = readJson(META_PATH);
  const files = sortFiles(walkGsFiles(APPS_SCRIPT));

  if (!files.length) {
    console.error("No .gs files found under apps-script/");
    process.exit(1);
  }

  fs.mkdirSync(DEPLOY_DIR, { recursive: true });

  const packPath = path.join(DEPLOY_DIR, "DEPLOYMENT_PACK.md");
  const checklistPath = path.join(DEPLOY_DIR, "DEPLOYMENT_CHECKLIST.md");
  const versionPath = path.join(DEPLOY_DIR, "VERSION.md");

  fs.writeFileSync(packPath, buildPack(files), "utf8");
  fs.writeFileSync(checklistPath, buildChecklist(meta, files), "utf8");
  fs.writeFileSync(versionPath, buildVersion(meta, files), "utf8");

  console.log(`Apps Script deployment pack regenerated (${files.length} files):`);
  for (const file of files) {
    console.log(`  - ${deployLabel(file)}`);
  }
  console.log(`Wrote:`);
  console.log(`  - ${path.relative(ROOT, packPath)}`);
  console.log(`  - ${path.relative(ROOT, checklistPath)}`);
  console.log(`  - ${path.relative(ROOT, versionPath)}`);
}

main();
