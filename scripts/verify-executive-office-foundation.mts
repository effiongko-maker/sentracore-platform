/**
 * Executive Office foundation — navigation, route gating, lens foundations and truthful Overview signals.
 * No database access.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-executive-office-foundation.mts
 */
import { existsSync, readFileSync } from "node:fs";
import {
  EXECUTIVE_OFFICE_BASE,
  EXECUTIVE_OFFICE_LENSES,
  EXECUTIVE_OFFICE_NAV_ITEMS,
  executiveOfficeSectionLabel,
  isExecutiveNavItemActive,
} from "../src/modules/command-centre/nav";
import {
  attentionSignal,
  commitmentsSignal,
  decisionsSignal,
  financialPositionSignal,
} from "../src/modules/command-centre/executiveSignals";
import { resolveBreadcrumbSegments } from "../src/lib/platform/layers";
import type { CommandCentreSnapshot } from "../src/modules/command-centre/presentationTypes";

function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function main() {
  const out: string[] = [];

  // 1. Navigation structure.
  check(
    EXECUTIVE_OFFICE_NAV_ITEMS.map((i) => i.label).join("|") ===
      "Overview|Decisions|Performance|Financial Position|Commitments|Risk & Attention",
    "Executive Office navigation order"
  );
  check(EXECUTIVE_OFFICE_NAV_ITEMS[0].href === EXECUTIVE_OFFICE_BASE && EXECUTIVE_OFFICE_BASE === "/command-centre", "Overview is the landing route (established /command-centre base)");
  check(isExecutiveNavItemActive(EXECUTIVE_OFFICE_NAV_ITEMS[0], "/command-centre") && !isExecutiveNavItemActive(EXECUTIVE_OFFICE_NAV_ITEMS[0], "/command-centre/decisions"), "Overview active only on the landing route");
  check(executiveOfficeSectionLabel("/command-centre/financial-position") === "Financial Position", "lens active state");
  check(resolveBreadcrumbSegments("/command-centre").join(" › ") === "Executive Office" && resolveBreadcrumbSegments("/command-centre/decisions").join(" › ") === "Executive Office › Decisions", "breadcrumbs");
  out.push("PASS 1 navigation: Overview · Decisions · Performance · Financial Position · Commitments · Risk & Attention");

  // 2. Every route is gated server-side by the same authority (not UI hiding).
  const guard = read("src/modules/command-centre/server/guardExecutiveOffice.tsx");
  const gate = read("src/modules/command-centre/server/requireCommandCentreAccess.ts");
  check(guard.includes("requireCommandCentreAccess()") && guard.includes('redirect("/login")'), "shared guard reuses the existing gate");
  check(gate.includes('assertBoundaryAllows(session, "platform")') && gate.includes("platform_capability_grants") && gate.includes("COMMAND_CENTRE_CAPABILITIES.view"), "gate = platform boundary + explicit platform.command_centre.view grant");
  const routes = ["", ...EXECUTIVE_OFFICE_LENSES.map((l) => `/${l.id}`)];
  for (const r of routes) {
    const file = `src/app/(app)/command-centre${r}/page.tsx`;
    check(existsSync(file), `${file} exists`);
    const page = read(file);
    check(/const gate = await guardExecutiveOffice\(\);\s*if \(!gate\.ok\) return gate\.node;/.test(page), `${file} is gated before rendering`);
  }
  for (const f of [guard, gate, read("src/components/platform/OrganisationalCompass.tsx"), read("src/components/platform/WorkspaceSwitcher.tsx"), read("src/modules/command-centre/nav.ts")]) {
    check(!/bode|full_?name\s*===|displayName\s*===|jobTitle\s*===/i.test(strip(f)), "no identity-specific access logic");
  }
  out.push("PASS 2 Overview and every lens route enforce the platform boundary + platform.command_centre.view server-side");

  // 3. Visibility: only identities with the grant see Executive Office in navigation.
  const compass = read("src/components/platform/OrganisationalCompass.tsx");
  check(/\{canUseCommandCentre \? \(\s*<div className="os-compass-group os-compass-group-active">\s*<p className="os-compass-workspace-caption">Executive Office<\/p>/.test(compass), "sidebar Executive Office navigation only with the grant");
  const homeBranch = compass.slice(compass.indexOf(") : isPlatformHome ? ("), compass.indexOf(") : showPlatformDirectory ? ("));
  check(!/EXECUTIVE_OFFICE|command-centre|Executive/.test(homeBranch), "Platform Home sidebar stays minimal (no Executive Office duplicate)");
  const switcher = read("src/components/platform/WorkspaceSwitcher.tsx");
  check(switcher.includes("{onCommandCentre || canUseCommandCentre ? ("), "workspace selector lists Executive Office only with the grant");
  check(/commandCentre:\s*\n?\s*boundaryAllows\(input\.boundary, "platform"\) && hasCommandCentreGrant/.test(read("src/lib/access/workspaceAccessChrome.ts")), "chrome flag derives from the same grant");
  out.push("PASS 3 sidebar / selector expose Executive Office only with the grant; Platform Home sidebar unchanged");

  // 4. Lenses render the shared Executive Office projection only — no own data access, no duplicated registers.
  //    (Superseded: lenses were data-free foundations; they now present the same projection as the Overview.)
  const lensPage = read("src/modules/command-centre/components/ExecutiveLensPage.tsx");
  check(!/Service|Repository|fetch\(|await |createAdminClient|\.from\(/.test(strip(lensPage)), "lens component performs no data access of its own");
  check(/snapshot\?: CommandCentreSnapshot/.test(lensPage), "lens content comes from the shared Executive Office snapshot");
  for (const lens of EXECUTIVE_OFFICE_LENSES) {
    check(/will appear here as Executive Office capabilities are introduced\.$/.test(lens.foundation), `${lens.label}: restrained foundation statement`);
  }
  check(read("src/modules/command-centre/components/CommandCentrePage.tsx").includes("EXECUTIVE_OFFICE_LENSES.map"), "Overview links every lens");
  out.push("PASS 4 lenses present the shared projection (foundation copy kept as fallback); no own data access or duplicated registers");

  // 5. Overview signals never turn restricted / unavailable / partial into zero.
  const attention = (over: Partial<CommandCentreSnapshot["attention"]>) =>
    ({ state: "healthy", items: [], hiddenCount: 0, complete: true, summary: "", coverage: [], ...over }) as CommandCentreSnapshot["attention"];
  check(attentionSignal(attention({ state: "unavailable" })).text === "Not available right now", "attention unavailable ≠ zero");
  check(attentionSignal(attention({ state: "restricted" })).tone === "muted", "attention restricted");
  check(/partial coverage/.test(attentionSignal(attention({ items: [{ id: "a" } as never], hiddenCount: 4, complete: false })).text) && /^5 /.test(attentionSignal(attention({ items: [{ id: "a" } as never], hiddenCount: 4, complete: false })).text), "attention counts shown + hidden, flags partial coverage");
  check(!/^0|Nothing/.test(attentionSignal(attention({ complete: false })).text), "incomplete attention never claims nothing");
  const decisions = (state: CommandCentreSnapshot["decisions"]["state"], n = 0) =>
    ({ state, items: Array.from({ length: n }, () => ({})), viewAllHref: null, reason: null, scopeNote: null }) as unknown as CommandCentreSnapshot["decisions"];
  check(decisionsSignal(decisions("healthy", 2)).text === "2 decisions awaiting you", "decisions count");
  check(decisionsSignal(decisions("partial", 0)).text.includes("limited company access"), "partial decision scope is stated, not zero");
  check(decisionsSignal(decisions("restricted")).tone === "muted" && decisionsSignal(decisions("error")).text === "Not available right now", "decisions restricted / failed");
  const commitments = (state: CommandCentreSnapshot["commitments"]["state"], overdue = 0) =>
    ({ state, reason: null, canManage: false, currentProfileId: "p", today: null, overdue: Array.from({ length: overdue }, () => ({})), open: [], completed: [] }) as unknown as CommandCentreSnapshot["commitments"];
  check(commitmentsSignal(commitments("healthy", 1)).text === "1 commitment overdue", "overdue commitments");
  check(commitmentsSignal(commitments("error")).text === "Not available right now" && commitmentsSignal(commitments("restricted")).tone === "muted", "commitments failure / restricted");
  check(financialPositionSignal([]).text === "Not available right now", "no finance pulse ⇒ not available");
  const card = (domain: "finance" | "facility_management", financialLine: string | null, state: "healthy" | "restricted" = "healthy") =>
    ({ domain, label: domain, state, statusLabel: "", lines: financialLine ? [financialLine] : [], href: null, disabledNavigationLabel: null, financialLine });
  const both = financialPositionSignal([card("finance", "2 pending CEO decisions"), card("facility_management", "Pending payments outstanding ₦67,644,404 · 8 requests")]);
  check(/^Finance: .*Facility Management: Pending payments outstanding/.test(both.text) && !/not included/.test(both.text), "financial position includes Facility Management");
  const fmRestricted = financialPositionSignal([card("finance", "2 pending CEO decisions"), card("facility_management", null, "restricted")]);
  check(/\(Facility Management not included\)$/.test(fmRestricted.text), "an environment the actor cannot see is named as not included — never implied");
  check(decisionsSignal(decisions("empty", 0)).text === "No Finance decisions waiting", "empty decisions claim is scoped to Finance");
  out.push("PASS 5 Overview signals come only from the existing snapshot; restricted / unavailable / partial are never shown as zero");

  for (const line of out) console.log(line);
  console.log("verify-executive-office-foundation: PASS");
}

try {
  main();
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
}
