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
  assert(
    home.includes("/platform/hero-architecture.jpg"),
    "supplied hero visual asset integrated"
  );
  assert(!home.includes("sc-ph-hero-plane"), "CSS architecture art removed");
  assert(!home.includes("HERO_WORDS"), "baked-in image typography used");

  const commandBar = readSrc("src/components/platform/GlobalCommandBar.tsx");
  assert(
    commandBar.includes("isPlatformSurface"),
    "command bar detects platform surface"
  );
  assert(
    commandBar.includes("GlobalNotificationBell"),
    "notification bell retained for FM"
  );
  assert(
    commandBar.includes("isPlatformSurface ? null : <GlobalNotificationBell"),
    "notification bell hidden on platform"
  );
  assert(
    commandBar.includes("Search or jump"),
    "search retained for FM"
  );
  assert(
    commandBar.includes("isPlatformSurface ? ("),
    "search gated on platform surface"
  );

  const compass = readSrc("src/components/platform/OrganisationalCompass.tsx");
  assert(compass.includes("PLATFORM_NAV"), "platform nav defined");
  assert(compass.includes("Platform Home"), "platform home link");
  assert(
    !compass.includes('href: "/users"'),
    "People not on platform-level sidebar"
  );
  assert(
    !compass.includes('href: "/master-data"'),
    "Master Data not on platform-level sidebar"
  );
  assert(
    compass.includes("Facility Management"),
    "FM sidebar caption preserved"
  );

  const layers = readSrc("src/lib/platform/layers.ts");
  assert(layers.includes('href: "/users"'), "People remains in FM layers");
  assert(
    layers.includes('href: "/master-data"'),
    "Master Data remains in FM layers"
  );
  assert(layers.includes('label: "People"'), "People label in FM layers");
  assert(
    layers.includes('label: "Master Data"'),
    "Master Data label in FM layers"
  );

  // Workspace identity: platform Finance ≠ FM Finance
  const platformFinance = getWorkspace("finance");
  assert(platformFinance?.previewHref === "/workspaces/finance", "platform finance route");
  assert(platformFinance?.href !== "/finance", "platform finance not FM route");
  assert(FM_FINANCE_HOME.href === "/finance", "FM finance route preserved");
  assert(
    resolveCurrentWorkspaceId("/finance") === "operations",
    "FM finance owned by operations workspace"
  );
  assert(
    resolveCurrentWorkspaceId("/workspaces/finance") === "finance",
    "platform finance owned by finance workspace"
  );

  const live = PLATFORM_WORKSPACES.filter((w) => w.status === "active");
  assert(live.length === 1, "exactly one live environment");
  assert(live[0]?.id === "operations", "only FM is live");
  assert(
    !home.includes('href="/finance"') || home.includes("FM_FINANCE"),
    "platform home must not hard-link platform Finance to /finance"
  );

  // Environment cards use catalog data, not invented live claims
  for (const workspace of PLATFORM_WORKSPACES) {
    if (workspace.status === "active") {
      assert(Boolean(workspace.href), `${workspace.id} live has href`);
    } else {
      assert(
        workspace.href !== "/finance" || workspace.id !== "finance",
        "non-live finance must not claim FM finance href"
      );
    }
  }

  console.log("PASS verify-platform-home");
  console.log("  platform chrome without FM search/notifications");
  console.log("  environments grid; FM live; platform Finance distinct");
}

main();
