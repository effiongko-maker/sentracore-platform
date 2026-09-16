/**
 * Legacy entry point — delegates to the central developer/QA access grantor.
 *
 * Prefer:
 *   npx tsx --tsconfig tsconfig.json scripts/grant-platform-developer-access.mts
 *
 * Capability catalog: scripts/lib/platform-developer-access-bundle.ts
 */
import { spawnSync } from "node:child_process";

console.warn(
  "[deprecated] grant-platform-finance-dev-access.mts → use grant-platform-developer-access.mts"
);

const result = spawnSync(
  "npx",
  [
    "tsx",
    "--tsconfig",
    "tsconfig.json",
    "scripts/grant-platform-developer-access.mts",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env, shell: true }
);

process.exit(result.status ?? 1);
