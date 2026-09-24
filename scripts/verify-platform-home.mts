/**
 * Platform Home redesign verification (pure / static).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-home.mts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FM_FINANCE_HOME,
  PLATFORM_WORKSPACES,
  getWorkspace,
  listEnterableWorkspaces,
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
    home.includes("/platform/hero-connected-enterprise.jpg"),
    "connected-enterprise hero visual integrated"
  );

  assert(existsSync("public/platform/hero-connected-enterprise.jpg"), "hero asset stored locally");

  // Workspace switcher: authorised entries only (Platform Home no longer duplicates them in the sidebar).
  const financeOnly = listEnterableWorkspaces({
    enabledModules: [],
    sessionLoading: false,
    isSuperAdmin: false,
    workspaceAccess: { facilityManagement: false, eccOperations: false, platformFinance: true },
  });
  assert(financeOnly.length === 1 && financeOnly[0].href === "/platform-finance",
    "sidebar list excludes denied and planned environments");
  assert(listEnterableWorkspaces({ enabledModules: null, sessionLoading: true }).length === 0,
    "sidebar list exposes no unresolved entry links");
  const denied = listEnterableWorkspaces({
    enabledModules: [], sessionLoading: false, isSuperAdmin: true,
    workspaceAccess: { facilityManagement: false, eccOperations: false, platformFinance: false },
  });
  assert(denied.length === 0, "admin status alone does not override resolved workspace denial");

  // Platform Home corrections: integrated hero, minimal sidebar, IAM-gated Executive Office, "Platform" label.
  const phCss = readSrc("src/styles/sentracore-os.css");
  const heroVisual = phCss.slice(phCss.indexOf(".sc-ph-hero-visual {"), phCss.indexOf("}", phCss.indexOf(".sc-ph-hero-visual {")));
  assert(/mask-image:\s*radial-gradient/.test(heroVisual), "hero image fades into the hero background");
  assert(!/border-radius|border:|box-shadow|background:/.test(heroVisual), "hero image has no card treatment");
  const homeCompass = readSrc("src/components/platform/OrganisationalCompass.tsx");
  const homeBranch = homeCompass.slice(homeCompass.indexOf(") : isPlatformHome ? ("), homeCompass.indexOf(") : showPlatformDirectory ? ("));
  assert(homeBranch.includes("PLATFORM_HOME.href") && !/listEnterableWorkspaces|workspace\.href|COMMAND_CENTRE_HOME/.test(homeBranch),
    "Platform Home sidebar: Home only — no FM / ECC / Finance / Executive entries");
  assert(/\{isSuperAdmin \? \(\s*<div className="os-compass-control-plane">/.test(homeCompass), "Admin Console still only when authorised");
  assert(/\{canUseCommandCentre \? \(\s*<div className="os-compass-group os-compass-group-active">\s*<p className="os-compass-workspace-caption">Executive Office<\/p>/.test(homeCompass) && !/Executive Office[\s\S]{0,400}No access/.test(homeCompass),
    "sidebar Executive Office navigation only with IAM access (never a No access entry)");
  const phSwitcher = readSrc("src/components/platform/WorkspaceSwitcher.tsx");
  assert(phSwitcher.includes("{onCommandCentre || canUseCommandCentre ? (") && phSwitcher.includes("const canUseCommandCentre = Boolean(workspaceAccess?.commandCentre);"),
    "switcher lists Executive Office only for users with workspaceAccess.commandCentre");
  // The selector establishes Platform as the environment; the sidebar destination within it is simply Home.
  assert(/onHome\s*\?\s*"Platform"/.test(phSwitcher) && phSwitcher.includes('?.label ?? "Platform"') && !phSwitcher.includes('{onHome ? "Platform" : "Home"}'),
    "selector identifies the Platform environment (never a bare Home workspace)");
  assert(homeBranch.includes("<span>Home</span>") && !homeBranch.includes("PLATFORM_HOME.label") && !homeBranch.includes("os-compass-group-label"),
    "Platform Home sidebar: Home destination with no redundant PLATFORM section heading");
  assert(!/bode/i.test(homeCompass + phSwitcher + home), "no hard-coded individual");

  const commandBar = readSrc("src/components/platform/GlobalCommandBar.tsx");
  assert(
    commandBar.includes("isPlatformSurface"),
    "command bar detects platform surface"
  );

  const compass = readSrc("src/components/platform/OrganisationalCompass.tsx");
  assert(
    compass.includes("workspaceAccess"),
    "compass uses shared workspace access chrome"
  );
  assert(compass.includes("Loading navigation"), "loading nav state");
  assert(
    compass.includes("Facility Management"),
    "FM sidebar caption preserved"
  );
  assert(
    compass.includes("canUseEcc"),
    "ECC sidebar gated on workspace access chrome"
  );
  assert(
    compass.includes("canUsePlatformFinance"),
    "Platform Finance sidebar gated on workspace access chrome"
  );
  assert(
    compass.includes("canUseCommandCentre"),
    "Command Centre gated on workspace access chrome"
  );
  assert(
    compass.includes("@/modules/platform-finance/nav"),
    "compass uses platform-finance nav IA only when inside Finance"
  );
  assert(
    !compass.includes("@/modules/platform-finance/server"),
    "compass must not import platform-finance server authority"
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
  assert(platformFinance?.href === "/platform-finance", "platform finance route");
  assert(platformFinance?.status === "active", "finance is live");
  assert(FM_FINANCE_HOME.href === "/finance", "FM finance route preserved");

  const financeLoading = resolveWorkspaceDirectoryState(platformFinance!, {
    enabledModules: [{ slug: "platform_finance", status: "enabled" }],
    sessionLoading: false,
    isSuperAdmin: false,
  });
  assert(financeLoading.kind === "loading", "finance waits for access chrome");

  const financeNoAccess = resolveWorkspaceDirectoryState(platformFinance!, {
    enabledModules: [{ slug: "platform_finance", status: "enabled" }],
    sessionLoading: false,
    isSuperAdmin: false,
    workspaceAccess: { platformFinance: false },
  });
  assert(financeNoAccess.kind === "no_access", "finance requires genuine authority");

  const financeEnter = resolveWorkspaceDirectoryState(platformFinance!, {
    enabledModules: [{ slug: "platform_finance", status: "enabled" }],
    sessionLoading: false,
    isSuperAdmin: false,
    workspaceAccess: { platformFinance: true },
  });
  assert(
    financeEnter.kind === "enter" && financeEnter.href === "/platform-finance",
    "authorised Finance user can enter the live workspace"
  );

  const financeSuperAdminWithoutGrant = resolveWorkspaceDirectoryState(
    platformFinance!,
    {
      enabledModules: [],
      sessionLoading: false,
      isSuperAdmin: true,
      workspaceAccess: { platformFinance: false },
    }
  );
  assert(
    financeSuperAdminWithoutGrant.kind === "no_access",
    "super admin does not receive blanket Finance operating access"
  );

  const eccLoading = resolveWorkspaceDirectoryState(
    getWorkspace("ecc-operations")!,
    {
      enabledModules: [
        { slug: "facility_management", status: "enabled" },
        { slug: "ecc_operations", status: "enabled" },
      ],
      sessionLoading: false,
      isSuperAdmin: false,
    }
  );
  assert(
    eccLoading.kind === "loading",
    "ECC waits for workspace access chrome (grant ∩ module)"
  );

  const eccNoAccess = resolveWorkspaceDirectoryState(
    getWorkspace("ecc-operations")!,
    {
      enabledModules: [
        { slug: "facility_management", status: "enabled" },
        { slug: "ecc_operations", status: "enabled" },
      ],
      sessionLoading: false,
      isSuperAdmin: false,
      workspaceAccess: { eccOperations: false },
    }
  );
  assert(
    eccNoAccess.kind === "no_access",
    "ECC no access when org module on but user grant missing"
  );

  const eccEnter = resolveWorkspaceDirectoryState(
    getWorkspace("ecc-operations")!,
    {
      enabledModules: [
        { slug: "facility_management", status: "enabled" },
        { slug: "ecc_operations", status: "enabled" },
      ],
      sessionLoading: false,
      workspaceAccess: { eccOperations: true },
    }
  );
  assert(
    eccEnter.kind === "enter",
    "ECC enterable when module enabled and user granted"
  );

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
  assert(live.length === 3, "three live environments");
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
  console.log("  directory access states; FM/ECC/Finance gating; AEDC FM ownership removed");
}

main();
