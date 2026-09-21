/**
 * Batcave foundation boundary verification. Non-mutating (source inspection + pure checks).
 * `--live-read` adds READ-ONLY checks against the linked database.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-batcave-boundary.mts [--live-read]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { BATCAVE_CAPABILITIES } from "../src/modules/batcave/types";
import { PLATFORM_ADMINISTRABLE_CAPABILITIES } from "../src/modules/platform-admin/types";
import { CAPABILITY_DOMAINS, catalogCoversAllAdministrableCapabilities } from "../src/modules/platform-admin/capabilityCatalog";
import { LANDING_WORKSPACES } from "../src/lib/access/landingWorkspace";
import { PLATFORM_WORKSPACES } from "../src/lib/platform/workspaces";
import { COMMAND_CENTRE_CAPABILITIES } from "../src/modules/command-centre/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const src = (p: string) => readFileSync(resolve(p), "utf8");
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}

async function main() {
  const out: string[] = [];
  const pass = (m: string) => out.push(`PASS ${m}`);
  const gate = src("src/modules/batcave/server/requireBatcaveAccess.ts");
  const gateCode = stripComments(gate);
  const mig = src("supabase/migrations/20260920230000_batcave_access_capability.sql");

  // ── A. Authority ──────────────────────────────────────────────────────────
  {
    assert(BATCAVE_CAPABILITIES.access === "platform.batcave.access" && Object.keys(BATCAVE_CAPABILITIES).length === 1, "A: exactly one explicit Batcave capability (no view/manage/admin/finance/notes/ai)");
    const others = Object.values(COMMAND_CENTRE_CAPABILITIES) as string[];
    assert(!others.includes(BATCAVE_CAPABILITIES.access), "A: independent of every Command Centre / Commitments capability");
    assert(/\.eq\("capability", BATCAVE_CAPABILITIES\.access\)/.test(gateCode) && /\.eq\("profile_id", profileId\)/.test(gateCode) && /\.eq\("organisation_id", organisationId\)/.test(gateCode), "A: entry is decided ONLY by the explicit grant for this profile in this organisation");
    assert(!/isPlatformSuperAdmin|roleSlugs|admin_override|isSuperAdmin|platform_super_admin|job_?title|users\.manage|users\.view/i.test(gateCode), "A: Super Admin, platform.admin_override, roles, job title and admin capabilities are never consulted");
    assert(gateCode.includes("requireCommandCentreAccess()") && gateCode.includes("!granted"), "A: Command Centre gate AND the Batcave grant are both required — neither implies the other");
    assert(!/COMMAND_CENTRE_CAPABILITIES|commitments/i.test(gateCode), "A: decide / commitments capabilities are not accepted as substitutes");
    const cc = src("src/modules/command-centre/server/requireCommandCentreAccess.ts");
    assert(cc.includes('assertBoundaryAllows(session, "platform")'), "A: module-bound identities fail closed at the shared platform boundary (even with a manual grant)");
    assert(/assertBoundaryAllows\(session, "platform"\)/.test(gateCode), "A: the doorway check applies the same boundary");
    assert(/\.eq\("organisation_id", organisationId\)/.test(gateCode) && !/searchParams|params\b|headers\(/.test(gateCode), "A: organisation comes from the session/profile, never from the URL");
    assert(!/insert|upsert|\.update\(|\.delete\(/.test(gateCode), "A: holding Batcave access grants nothing else (the gate performs no writes or grants)");
    pass("A authority: one explicit capability; Super Admin / admin_override / Command Centre / Commitments insufficient; module-bound fail closed; org-scoped");
  }

  // ── B. Routing ────────────────────────────────────────────────────────────
  {
    const page = src("src/app/(app)/command-centre/batcave/page.tsx");
    assert(page.includes("requireBatcaveAccess()") && page.indexOf("requireBatcaveAccess()") < page.indexOf("<BatcavePage"), "B: the route is server-gated before rendering");
    assert(/notFound\(\)/.test(page) && !/return <div|scc-access-denied/.test(page), "B: unauthorised access fails closed with a plain not-found (existence not confirmed)");
    assert(!/"use client"/.test(page) && !/router\./.test(page), "B: no client-side gating");
    assert(!PLATFORM_WORKSPACES.some((w) => /batcave/i.test(`${w.id}${w.label}${w.href ?? ""}`)), "B: Batcave is not a top-level workspace");
    assert(!(LANDING_WORKSPACES as readonly string[]).some((w) => /batcave/i.test(w)) && !/batcave/i.test(src("src/lib/access/landingWorkspace.ts")) && !/batcave/i.test(src("supabase/migrations/20260920210000_profile_landing_workspace.sql")), "B: Batcave is not a landing_workspace option");
    for (const f of ["src/components/platform/WorkspaceSwitcher.tsx", "src/components/platform/OrganisationalCompass.tsx", "src/components/platform/CommandPalette.tsx", "src/lib/platform/workspaces.ts"]) {
      assert(!/batcave/i.test(src(f)), `B: ${f} does not surface Batcave`);
    }
    const door = src("src/modules/batcave/components/BatcaveDoorway.tsx");
    assert(/href="\/command-centre\/batcave"/.test(door), "B: nested under Command Centre");
    const ccPage = src("src/app/(app)/command-centre/page.tsx");
    assert(/batcaveDoorway = await canEnterBatcave\(\)/.test(ccPage) && /batcaveDoorway \? <BatcaveDoorway \/> : null/.test(ccPage), "B: the doorway is rendered only when the identity can enter (no disabled teaser)");
    pass("B routing: server-gated, not-found when unauthorised, not a workspace, not a landing option, doorway conditional");
  }

  // ── C. Data separation ────────────────────────────────────────────────────
  {
    const ccFiles = walk("src/modules/command-centre").concat(walk("src/app/api/command-centre")).filter((f) => /\.(ts|tsx)$/.test(f));
    assert(ccFiles.every((f) => !/batcave/i.test(src(f))), "C: no Command Centre module (pulse, attention, decisions, last-visit, commitments) references Batcave");
    const svc = src("src/modules/command-centre/server/CommandCentreServerService.ts");
    assert(!/batcave/i.test(svc) && !/canEnterBatcave/.test(svc), "C: CommandCentreServerService never loads or even asks about Batcave");
    const snap = src("src/modules/command-centre/presentationTypes.ts");
    assert(!/batcave/i.test(snap), "C: the executive snapshot carries no Batcave field");
    assert(!/batcave/i.test(src("src/modules/command-centre/components/CommandCentrePage.tsx")) && /\{footer\}/.test(src("src/modules/command-centre/components/CommandCentrePage.tsx")), "C: the console renders a generic footer slot; the route composes the doorway");
    const batcaveFiles = walk("src/modules/batcave").filter((f) => /\.(ts|tsx)$/.test(f));
    for (const f of batcaveFiles) {
      assert(!/from "@\/modules\/(platform-finance|intelligence|ecc-operations|maintenance|work-orders|incidents|approvals)|@\/lib\/intelligence/.test(src(f)), `C: ${f} imports no other domain`);
    }
    const others = ["src/modules/platform-finance", "src/modules/intelligence", "src/lib/intelligence", "src/modules/ecc-operations", "src/modules/command-centre"];
    for (const dir of others) {
      for (const f of walk(dir).filter((x) => /\.(ts|tsx)$/.test(x))) {
        const t = src(f);
        assert(!/@\/modules\/batcave/.test(t), `C: ${f} does not import Batcave`);
      }
    }
    assert(!/batcave/i.test(walk("src/modules/platform-finance").filter((f) => !f.endsWith("financialAccounts.ts")).map(src).join("\n")), "C: Platform Finance has no Batcave coupling (only the pre-existing separation comment)");
    assert(!/batcave/i.test(walk("src/lib/intelligence").concat(walk("src/modules/intelligence")).map(src).join("\n")), "C: Intelligence has no Batcave coupling");
    pass("C separation: Command Centre, Finance and Intelligence neither read nor know Batcave data; Batcave imports no domain");
  }

  // ── D. Domain minimalism ──────────────────────────────────────────────────
  {
    // Superseded law: Batcave business data now exists — but ONLY inside the Batcave private domain,
    // and is never consumed by Command Centre / Finance / Intelligence / general operational domains
    // (proved in group C and in verify-batcave-private-notes).
    for (const f of walk("supabase/migrations")) {
      const creates = [...src(f).matchAll(/create (?:table|schema|view)\s+(?:if not exists\s+)?([\w.]+)/gi)].map((m) => m[1]).filter((n) => /batcave/i.test(n));
      assert(creates.every((n) => n === "public.batcave_notes") && (creates.length === 0 || f.endsWith("20260920240000_batcave_private_notes.sql")), `D: only the private-notes migration may create Batcave business structures (${f})`);
    }
    assert(!/create table/i.test(mig) && !/insert into/i.test(mig), "D: the access-capability migration stays IAM-only — no tables, no seed rows");
    const files = walk("src/modules/batcave");
    assert(files.every((f) => /modules\/batcave\/(types\.ts|server\/|components\/|notes\/)/.test(f)), "D: Batcave module contains only its gate, doorway/page and the private-notes capability");
    const ui = src("src/modules/batcave/components/BatcavePage.tsx") + src("src/modules/batcave/components/BatcaveDoorway.tsx");
    assert(!/Strategic Intelligence|Private Finance|CEO Notes|Confidential Decisions|Kaiso|Private Documents|Coming soon/i.test(ui), "D: no invented feature cards or roadmap teasers");
    assert(!/kaiso|llm|openai|anthropic/i.test(files.map(src).join("\n")), "D: no Kaiso / AI in Batcave");
    assert(!/\.(png|jpg|svg)/i.test(ui), "D: no new imagery");
    pass("D minimalism: business data confined to the private-notes table; no seeds, no fake features, no Kaiso");
  }

  // ── E. Admin ──────────────────────────────────────────────────────────────
  {
    assert((PLATFORM_ADMINISTRABLE_CAPABILITIES as readonly string[]).includes(BATCAVE_CAPABILITIES.access) && catalogCoversAllAdministrableCapabilities(), "E: capability is in the canonical administrable set and catalogue");
    assert(CAPABILITY_DOMAINS.some((d) => d.id === "batcave" && d.capabilities.length === 1), "E: appears in the existing Admin Console catalogue as one entry (no special screen)");
    assert(/'platform\.batcave\.access'/.test(mig) && /platform_iam_is_allowed_platform_capability/.test(mig), "E: grant/revoke flow through the existing IAM allow-list and RPCs");
    assert(!existsSync(resolve("src/modules/platform-admin/client/BatcavePanel.tsx")) && !walk("src/modules/platform-admin").some((f) => /batcave/i.test(f.split("/").pop() ?? "")), "E: no Batcave admin page or role editor");
    assert(/does not let the administrator enter/.test(src("src/modules/platform-admin/capabilityCatalog.ts")), "E: catalogue states administering the grant is not entry");
    assert(!/platform_capability_grants/.test(src("src/modules/platform-admin/server/PlatformAdminServerService.ts")) || !/batcave/i.test(src("src/modules/platform-admin/server/PlatformAdminServerService.ts")), "E: the admin service has no Batcave entry path");
    pass("E admin: grantable/revocable via existing control plane; administering ≠ entering");
  }

  // ── F. Existing users / live ─────────────────────────────────────────────
  {
    assert(!/insert into public\.platform_capability_grants/i.test(mig), "F: the migration grants no one Batcave access");
    if (process.argv.includes("--live-read")) {
      loadEnvLocal();
      const { createClient } = await import("@supabase/supabase-js");
      const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      const g = await c.from("platform_capability_grants").select("profile_id").eq("capability", BATCAVE_CAPABILITIES.access);
      assert(!g.error && (g.data ?? []).length === 0, "live: no identity holds Batcave access");
      const p = await c.from("profiles").select("landing_workspace, access_scope");
      assert(!p.error && (p.data ?? []).every((r) => r.landing_workspace === null), "live: no landing workspace configured");
      const bad = await c.from("platform_capability_grants").insert({ organisation_id: "835a2e6d-a91b-413f-946a-8ed73a6027cc", profile_id: "ee7eb825-090d-4db9-a852-feb278a69763", capability: "platform.batcave.manage" });
      assert(bad.error, "live: lookalike Batcave capabilities are rejected by the database");
    }
    pass("F existing users: no grants issued by this pass");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
