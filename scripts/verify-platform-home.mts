/**
 * Platform Home redesign verification (pure / static).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-home.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FM_FINANCE_HOME,
  PLATFORM_WORKSPACES,
  getWorkspace,
  resolveCurrentWorkspaceId,
  resolveWorkspaceDirectoryState,
} from "../src/lib/platform/workspaces";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function main() {
  const home = readSrc("src/modules/platform/components/PlatformHomePage.tsx");
  assert(
    home.includes("One platform. Multiple operating environments."),
    "platform hero headline"
  );
  assert(home.includes("Operating environments"), "environments section");
  assert(home.includes("Built for what"), "outlook banner");
  assert(!home.includes("sc-ph-gate"), "FM gate hero removed");
  assert(!home.includes("ACTIVE_CAPABILITIES"), "FM capability rail removed");
  assert(home.includes("Enter {workspace.title}"), "live enter CTA");
  assert(home.includes("Coming soon"), "non-live coming soon");
  assert(home.includes("No access"), "inaccessible modules labelled");
  assert(home.includes("resolveWorkspaceDirectoryState"), "directory uses access state");
  assert(
    home.includes("/platform/hero-architecture.jpg"),
    "supplied hero visual asset integrated"
  );

  const commandBar = readSrc("src/components/platform/GlobalCommandBar.tsx");
  assert(
    commandBar.includes("isPlatformSurface"),
    "command bar detects platform surface"
  );

  const compass = readSrc("src/components/platform/OrganisationalCompass.tsx");
  assert(compass.includes("listEnterableWorkspaces"), "platform home lists enterable workspaces");
  assert(compass.includes("Loading navigation"), "loading nav state");
  assert(
    compass.includes("Facility Management"),
    "FM sidebar caption preserved"
  );
  assert(
    compass.includes("canUseEcc"),
    "ECC sidebar gated on module access"
  );
  assert(
    !compass.includes("@/modules/platform-finance"),
    "compass must not import platform-finance module"
  );

  const layers = readSrc("src/lib/platform/layers.ts");
  assert(layers.includes('href: "/users"'), "People remains in FM layers");
  assert(
    layers.includes('href: "/master-data"'),
    "Master Data remains in FM layers"
  );
  assert(
    !layers.includes('"/energy-reading"'),
    "AEDC energy-reading removed from FM operational register matching"
  );

  const platformFinance = getWorkspace("finance");
  assert(platformFinance?.previewHref === "/workspaces/finance", "platform finance route");
  assert(platformFinance?.href !== "/finance", "platform finance not FM route");
  assert(platformFinance?.status === "in_development", "finance in development");
  assert(FM_FINANCE_HOME.href === "/finance", "FM finance route preserved");

  const financeState = resolveWorkspaceDirectoryState(platformFinance!, {
    enabledModules: [{ slug: "facility_management", status: "enabled" }],
    sessionLoading: false,
    isSuperAdmin: false,
  });
  assert(financeState.kind === "unavailable", "finance not enterable from directory");

  const eccNoAccess = resolveWorkspaceDirectoryState(
    getWorkspace("ecc-operations")!,
    {
      enabledModules: [{ slug: "facility_management", status: "enabled" }],
      sessionLoading: false,
      isSuperAdmin: false,
    }
  );
  assert(eccNoAccess.kind === "no_access", "ECC no access without module");

  const eccEnter = resolveWorkspaceDirectoryState(
    getWorkspace("ecc-operations")!,
    {
      enabledModules: [
        { slug: "facility_management", status: "enabled" },
        { slug: "ecc_operations", status: "enabled" },
      ],
      sessionLoading: false,
    }
  );
  assert(eccEnter.kind === "enter", "ECC enterable when enabled");

  const loadingState = resolveWorkspaceDirectoryState(
    getWorkspace("operations")!,
    { enabledModules: null, sessionLoading: true }
  );
  assert(loadingState.kind === "loading", "unresolved access is loading not no-access");

  assert(
    resolveCurrentWorkspaceId("/finance") === "operations",
    "FM finance owned by operations workspace"
  );
  assert(
    resolveCurrentWorkspaceId("/workspaces/finance") === "finance",
    "platform finance owned by finance workspace"
  );

  const live = PLATFORM_WORKSPACES.filter((w) => w.status === "active");
  assert(live.length === 2, "two live environments");
  assert(
    /ENVIRONMENT_DISPLAY_ORDER[\s\S]*?"operations",\s*"ecc-operations",\s*"finance"/.test(
      home
    ),
    "ECC positioned next to Facility Management"
  );

  const registers = readSrc(
    "src/modules/operational-registers/components/OperationalRegistersPage.tsx"
  );
  assert(
    !registers.includes('href: "/energy-reading"'),
    "Energy Reading removed from FM registers hub"
  );

  const energyPage = readSrc(
    "src/modules/energy-reading/components/EnergyReadingsPage.tsx"
  );
  assert(
    energyPage.includes("not a Facility Management operational responsibility"),
    "Energy Reading page corrects FM ownership"
  );
  assert(energyPage.includes("canCreate={false}"), "FM cannot create AEDC readings");

  console.log("PASS verify-platform-home");
  console.log("  directory access states; FM/ECC gating; Finance non-enterable; AEDC FM ownership removed");
}

main();
