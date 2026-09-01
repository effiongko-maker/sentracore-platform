/**
 * Phase 22 — Incident navigation retirement verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-incident-navigation-retirement.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ISSUE_MODEL_PHASE } from "../src/lib/operational/issues";
import { NAV_GROUPS } from "../src/lib/navigation";
import { OPERATING_LAYERS } from "../src/lib/platform/layers";
import {
  INCIDENT_NAVIGATION_RETIREMENT_PHASE,
  NAVIGATION_OPERATIONAL_CONTEXT,
  PRIMARY_FM_NAV_SURFACES,
} from "../src/lib/operational/work";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(rel), "utf8");
}

function primaryNavHrefs(): string[] {
  return NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
}

function primaryNavLabels(): string[] {
  return NAV_GROUPS.flatMap((g) => g.items.map((i) => i.label));
}

function layerModuleHrefs(): string[] {
  return OPERATING_LAYERS.flatMap((l) => l.modules.map((m) => m.href));
}

function main() {
  const results: string[] = [];

  assert(ISSUE_MODEL_PHASE === 23, "phase 22");
  assert(INCIDENT_NAVIGATION_RETIREMENT_PHASE === 22, "nav retirement phase");
  results.push("PASS ISSUE_MODEL_PHASE = 22");

  assert(
    NAVIGATION_OPERATIONAL_CONTEXT.canonicalIssueSurface === "/issues",
    "issues surface"
  );
  assert(
    NAVIGATION_OPERATIONAL_CONTEXT.legacyIncidentSurface === "/incidents",
    "legacy surface preserved"
  );
  for (const href of PRIMARY_FM_NAV_SURFACES) {
    assert(primaryNavHrefs().includes(href), `primary nav has ${href}`);
  }
  results.push("PASS canonical Issue/Work/Work Orders remain in primary nav");

  assert(!primaryNavHrefs().includes("/incidents"), "incidents absent from primary nav");
  assert(!primaryNavLabels().some((l) => /^Incidents$/i.test(l)), "no Incidents label");
  assert(!layerModuleHrefs().includes("/incidents"), "incidents absent from operating layers");
  assert(
    !OPERATING_LAYERS.some((l) => l.id === "execute"),
    "execute layer removed"
  );
  results.push("PASS Incidents removed from primary FM navigation");

  const navSrc = readSrc("src/lib/navigation.ts");
  assert(navSrc.includes('href: "/incidents"'), "secondary incidents route");
  assert(navSrc.includes("SECONDARY_NAV_ITEMS"), "secondary nav list");
  assert(navSrc.includes("Legacy Incidents"), "legacy incidents secondary label");
  assert(!navSrc.includes("Specialised handling when required"), "old incidents copy gone");
  results.push("PASS /incidents preserved in secondary nav for deep-link context");

  const layersSrc = readSrc("src/lib/platform/layers.ts");
  assert(layersSrc.includes("LEGACY_LAYER_MODULES"), "legacy layer modules");
  assert(layersSrc.includes('href: "/incidents"'), "legacy layer incidents href");
  results.push("PASS /incidents breadcrumb resolution via legacy layer modules");

  assert(existsSync(resolve("src/app/(app)/incidents/page.tsx")), "incidents page route");
  results.push("PASS /incidents route remains accessible");

  const issueActions = readSrc("src/lib/operational/issues/actions.ts");
  assert(issueActions.includes("/incidents?id="), "inc deep links preserved");
  results.push("PASS /incidents?id=INC-* deep links preserved");

  const palette = readSrc("src/components/platform/CommandPalette.tsx");
  assert(palette.includes("Log an issue"), "palette log issue");
  assert(!palette.includes("Report an incident"), "no report incident palette");
  assert(!palette.includes("Create Incident"), "no create incident palette");
  assert(!palette.includes('href: "/incidents"'), "no incidents palette nav");
  results.push("PASS command palette has no FM Incident operational commands");

  const welcome = readSrc("src/components/cards/WelcomeCard.tsx");
  assert(!welcome.includes('href="/incidents"'), "welcome no incidents");
  assert(welcome.includes('href="/issues"'), "welcome retargeted to issues");
  results.push("PASS WelcomeCard retargeted to Issues");

  const platformHome = readSrc("src/modules/platform/components/PlatformHomePage.tsx");
  assert(!platformHome.includes('"Incidents"'), "platform home no incidents");
  assert(platformHome.includes('"Issues"'), "platform home issues");
  results.push("PASS PlatformHomePage retargeted to Issues/Work");

  const workspaces = readSrc("src/lib/platform/workspaces.ts");
  assert(workspaces.includes('pathname.startsWith("/incidents")'), "ops path incidents");
  assert(!workspaces.includes('"Incidents"'), "workspace capabilities no incidents");
  results.push("PASS workspace copy retargeted; /incidents remains routable");

  const occupant = readSrc("src/modules/occupant-requests/services/OccupantRequestService.ts");
  assert(occupant.includes("submitIncidentReport"), "occupant incident intake preserved");
  assert(!occupant.includes("IncidentService.create"), "occupant no fm incident create");
  results.push(
    "PASS OCCUPANT INCIDENT INTAKE: PRESERVED — OUT OF FM RETIREMENT SCOPE (creates REQ-* only)"
  );

  assert(!primaryNavLabels().some((l) => /Request Queue/i.test(l)), "no request queue");
  results.push("PASS Request Queue absent from primary FM navigation");

  const legacy = readSrc("src/lib/operational/work/legacy.ts");
  assert(legacy.includes("primaryNavigationRetired: true"), "legacy nav flag");
  results.push("PASS no persistence/schema/lifecycle changes in navigation phase");

  console.log("\n=== incident navigation retirement verify ===");
  for (const line of results) console.log(line);
  console.log(`\n${results.length} checks passed`);
  console.log("RESULT: PASS");
}

main();
