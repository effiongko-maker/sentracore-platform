/**
 * Access-control hardening verification (static / executable structure).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-access-workspace-hardening.mts
 *
 * Asserts:
 * - ECC requires platform.ecc_operations.view (not org module alone)
 * - Platform Finance layout gates workspace shell
 * - Command Centre navigation is grant-gated in chrome
 * - Workspace directory resolver is shared for enterability
 * - Command palette uses the same FM enterability resolver
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function main() {
  assert(
    existsSync(
      resolve(
        "supabase/migrations/20260916123000_ecc_operations_capability_authority.sql"
      )
    ),
    "ECC capability authority migration present"
  );
  const migration = readSrc(
    "supabase/migrations/20260916123000_ecc_operations_capability_authority.sql"
  );
  assert(
    migration.includes("platform.ecc_operations") ||
      migration.includes("ecc_operations"),
    "migration allows ECC capability format"
  );
  assert(
    !/insert into public\.organisation_modules[\s\S]*ecc_operations/i.test(
      migration
    ),
    "hardening migration does not re-enable ECC for all orgs"
  );

  const eccRequire = readSrc(
    "src/modules/ecc-operations/server/requireEccAccess.ts"
  );
  assert(
    eccRequire.includes("platform_capability_grants"),
    "requireEccAccess checks platform_capability_grants"
  );
  assert(
    eccRequire.includes("ECC_CAPABILITIES") ||
      eccRequire.includes("platform.ecc_operations.view"),
    "requireEccAccess requires ECC view capability"
  );
  assert(
    eccRequire.includes("MODULE_NOT_ENABLED"),
    "requireEccAccess still checks org module"
  );

  const eccLayout = readSrc(
    "src/app/(app)/ecc-operations/layout.tsx"
  );
  assert(eccLayout.includes("requireEccAccess"), "ECC layout server-gated");
  assert(
    eccLayout.includes("Return to Platform Home") ||
      eccLayout.includes("ECC Operations unavailable"),
    "ECC layout shows access-denied UX"
  );

  const pfLayout = readSrc(
    "src/app/(app)/platform-finance/layout.tsx"
  );
  assert(
    pfLayout.includes("requirePlatformFinanceWorkspaceAccess"),
    "Platform Finance layout server-gated"
  );
  assert(
    pfLayout.includes("Platform Finance unavailable") ||
      pfLayout.includes("Return to Platform Home"),
    "Platform Finance access-denied UX"
  );

  const pfAccess = readSrc(
    "src/modules/platform-finance/server/requirePlatformFinanceAccess.ts"
  );
  assert(
    pfAccess.includes("requirePlatformFinanceWorkspaceAccess"),
    "workspace enter helper exists"
  );
  assert(
    pfAccess.includes("finance_capability_grants"),
    "workspace enter still uses finance grants"
  );

  const workspaces = readSrc("src/lib/platform/workspaces.ts");
  assert(
    workspaces.includes("workspaceAccess"),
    "directory resolver accepts workspaceAccess"
  );
  assert(
    workspaces.includes('workspace.id === "ecc-operations"'),
    "ECC enterability uses user grant chrome"
  );

  const compass = readSrc(
    "src/components/platform/OrganisationalCompass.tsx"
  );
  assert(
    compass.includes("workspaceAccess?.eccOperations"),
    "compass ECC uses grant chrome"
  );
  assert(
    compass.includes("workspaceAccess?.platformFinance"),
    "compass Platform Finance uses grant chrome"
  );
  assert(
    compass.includes("workspaceAccess?.commandCentre") ||
      compass.includes("canUseCommandCentre"),
    "compass Command Centre uses grant chrome"
  );

  const switcher = readSrc(
    "src/components/platform/WorkspaceSwitcher.tsx"
  );
  assert(
    switcher.includes("workspaceAccess"),
    "switcher passes workspaceAccess"
  );
  assert(
    switcher.includes("canUseCommandCentre"),
    "switcher gates Command Centre"
  );

  const palette = readSrc(
    "src/components/platform/CommandPalette.tsx"
  );
  assert(
    palette.includes("resolveWorkspaceDirectoryState"),
    "palette uses shared directory resolver"
  );
  assert(
    palette.includes('getWorkspace("operations")'),
    "palette gates Enter FM via resolver"
  );

  const chrome = readSrc("src/lib/access/workspaceAccessChrome.ts");
  assert(
    chrome.includes("resolveWorkspaceAccessChrome"),
    "workspace access chrome resolver exists"
  );
  assert(chrome.includes("ECC_CAPABILITIES"), "chrome includes ECC grant");
  assert(
    chrome.includes("COMMAND_CENTRE_CAPABILITIES"),
    "chrome includes Command Centre grant"
  );
  assert(
    chrome.includes("finance_capability_grants"),
    "chrome includes any Finance grant"
  );

  const bundle = readSrc(
    "scripts/lib/platform-developer-access-bundle.ts"
  );
  assert(
    bundle.includes("PLATFORM_DEVELOPER_ECC_CAPABILITIES"),
    "developer bundle includes ECC caps"
  );
  assert(
    bundle.includes("module on ≠ user access") ||
      bundle.includes("module on"),
    "developer notes document ECC grant requirement"
  );

  console.log("PASS verify-access-workspace-hardening");
  console.log("  ECC: module + platform.ecc_operations.view");
  console.log("  Platform Finance: layout gated by any finance grant");
  console.log("  Command Centre / palette / directory: shared chrome resolver");
}

main();
