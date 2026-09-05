/**
 * Platform Finance vs Facility Management Finance identity (pure / static).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-workspace-finance-identity.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FM_FINANCE_HOME,
  getWorkspace,
  isOperationsPath,
  isWorkspacePreviewPath,
  resolveCurrentWorkspaceId,
  type WorkspaceId,
} from "../src/lib/platform/workspaces";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function main() {
  const platformFinance = getWorkspace("finance");
  assert(platformFinance, "platform Finance workspace defined");
  assert(platformFinance.id === "finance", "platform Finance id");
  assert(platformFinance.label === "Finance", "platform Finance label");
  assert(
    platformFinance.previewHref === "/workspaces/finance",
    "platform Finance entry is /workspaces/finance"
  );
  assert(
    platformFinance.href !== "/finance",
    "platform Finance must not use FM Finance href"
  );
  assert(
    !platformFinance.href?.startsWith("/finance"),
    "platform Finance href must not be under /finance"
  );
  assert(
    platformFinance.status !== "active" ||
      platformFinance.href === "/workspaces/finance",
    "if platform Finance is active, entry must still be workspace-scoped"
  );

  assert(FM_FINANCE_HOME.href === "/finance", "FM Finance home preserved");
  assert(FM_FINANCE_HOME.label === "Finance", "FM Finance label");

  // Route ownership
  assert(
    resolveCurrentWorkspaceId("/finance") === "operations",
    "a) /finance is Facility Management workspace"
  );
  assert(
    resolveCurrentWorkspaceId("/finance/costs") === "operations",
    "FM Finance costs under operations"
  );
  assert(
    resolveCurrentWorkspaceId("/finance/submissions") === "operations",
    "FM Finance submissions under operations"
  );
  assert(
    resolveCurrentWorkspaceId("/workspaces/finance") === "finance",
    "b) /workspaces/finance is Platform Finance workspace"
  );
  assert(
    resolveCurrentWorkspaceId("/operations") === "operations",
    "FM home remains operations"
  );
  assert(
    resolveCurrentWorkspaceId("/work-orders") === "operations",
    "FM modules remain operations"
  );

  assert(isOperationsPath("/finance"), "c) FM Finance uses FM shell path");
  assert(
    !isOperationsPath("/workspaces/finance"),
    "platform Finance is not an FM operations path"
  );
  assert(
    isWorkspacePreviewPath("/workspaces/finance"),
    "platform Finance is workspace preview path"
  );

  // Switcher resolution source
  const switcher = readSrc("src/components/platform/WorkspaceSwitcher.tsx");
  assert(
    switcher.includes("workspaceHref"),
    "switcher uses workspaceHref helper"
  );
  assert(
    switcher.includes("PLATFORM_WORKSPACES"),
    "switcher lists platform workspaces"
  );

  const workspacesSrc = readSrc("src/lib/platform/workspaces.ts");
  const platformFinanceBlock = workspacesSrc.slice(
    workspacesSrc.indexOf("id: \"finance\""),
    workspacesSrc.indexOf("id: \"construction\"")
  );
  assert(
    !/href:\s*"\/finance"/.test(platformFinanceBlock),
    "platform Finance definition must not set href: /finance"
  );
  assert(
    platformFinanceBlock.includes('previewHref: "/workspaces/finance"'),
    "platform Finance previewHref set"
  );
  assert(
    workspacesSrc.includes("FM_FINANCE_HOME"),
    "FM Finance constant present"
  );
  assert(
    workspacesSrc.includes('href: "/finance"'),
    "FM Finance home path still defined"
  );

  const layers = readSrc("src/lib/platform/layers.ts");
  assert(layers.includes("FM_FINANCE_HOME"), "FM sidebar uses FM_FINANCE_HOME");
  assert(
    layers.includes("href: FM_FINANCE_HOME.href"),
    "FM Finance module href scoped"
  );

  const previewRoute = readSrc("src/app/(app)/workspaces/[slug]/page.tsx");
  assert(
    previewRoute.includes('"finance"'),
    "workspace preview route allows finance slug"
  );

  const fmHome = readSrc("src/app/(app)/finance/page.tsx");
  assert(
    fmHome.includes("FinancePage"),
    "d) FM Finance Home route still renders FinancePage"
  );

  // No accidental remapping of FM routes
  for (const route of [
    "src/app/(app)/finance/page.tsx",
    "src/app/(app)/finance/costs/page.tsx",
    "src/app/(app)/finance/submissions/page.tsx",
  ] as const) {
    assert(readSrc(route).length > 0, `FM route intact: ${route}`);
  }

  const platformIds: WorkspaceId[] = [
    "operations",
    "ecc-operations",
    "finance",
    "construction",
    "projects-events",
  ];
  for (const id of platformIds) {
    assert(getWorkspace(id), `workspace catalog includes ${id}`);
  }

  console.log("PASS verify-workspace-finance-identity");
  console.log("  Platform Finance → /workspaces/finance (workspace id: finance)");
  console.log("  FM Finance → /finance (workspace id: operations)");
}

main();
