/**
 * Breadcrumb / command bar navigation IA verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-breadcrumb-navigation.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveBreadcrumbSegments } from "../src/lib/platform/layers";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function main() {
  const finance = resolveBreadcrumbSegments("/finance");
  assert(finance.length === 1 && finance[0] === "Finance", "Finance standalone");
  assert(!finance.includes("Understand"), "Finance no Understand parent");

  const intelligence = resolveBreadcrumbSegments("/intelligence");
  assert(
    intelligence.length === 1 && intelligence[0] === "Intelligence",
    "Intelligence standalone"
  );

  const reports = resolveBreadcrumbSegments("/reports");
  assert(reports.length === 1 && reports[0] === "Reports", "Reports standalone");

  const facilities = resolveBreadcrumbSegments("/facilities");
  assert(
    facilities.join(" / ") === "Organisation / Facilities",
    "Organisation layer unchanged"
  );

  const work = resolveBreadcrumbSegments("/work");
  assert(work.join(" / ") === "Work / Work", "Work layer unchanged");

  const commandBar = readFileSync(
    resolve("src/components/platform/GlobalCommandBar.tsx"),
    "utf8"
  );
  assert(
    commandBar.includes("resolveBreadcrumbSegments"),
    "GlobalCommandBar uses shared breadcrumb resolver"
  );
  assert(
    !commandBar.includes("LAYER_LABEL[layer]"),
    "GlobalCommandBar no inline layer label hack"
  );

  console.log("PASS breadcrumb IA — Finance / Intelligence / Reports standalone");
  console.log("PASS breadcrumb IA — grouped modules retain layer prefix");
  console.log("VERIFY_BREADCRUMB_NAVIGATION: PASS");
}

main();
