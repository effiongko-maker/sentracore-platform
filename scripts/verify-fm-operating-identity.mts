/**
 * FM operating-company identity — Trivnet Services Limited must render on FM-scoped presentation surfaces;
 * the underlying tenant organisation (PayChex International Marketing Limited) must remain untouched outside
 * FM and must never leak into the external-facing occupant intake chrome.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-operating-identity.mts
 */
import { readFileSync } from "node:fs";
import { fmOperatingIdentityName, FM_OPERATING_COMPANY_NAME } from "../src/lib/platform/workspaces";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const out: string[] = [];
const pass = (m: string) => out.push(`PASS ${m}`);
const src = (f: string) => readFileSync(f, "utf8");

// 1. Resolution logic: FM paths always resolve to Trivnet, regardless of the underlying name (including null).
{
  for (const p of ["/work", "/finance", "/finance/costs/COST-2026-000104", "/intelligence", "/occupant-requests/track", "/requests", "/issues"]) {
    assert(fmOperatingIdentityName(p, "PayChex International Marketing Limited") === FM_OPERATING_COMPANY_NAME, `${p}: expected Trivnet`);
    assert(fmOperatingIdentityName(p, null) === FM_OPERATING_COMPANY_NAME, `${p}: null underlying still resolves to Trivnet (never falls back)`);
  }
  pass("fmOperatingIdentityName resolves every FM-scoped path to Trivnet Services Limited, never falling back to the underlying name");
}

// 2. Non-FM paths are untouched — the underlying organisation name passes through unchanged.
{
  for (const p of ["/platform-finance/invoices", "/command-centre", "/admin", "/ecc-operations", "/workspaces/finance"]) {
    assert(fmOperatingIdentityName(p, "PayChex International Marketing Limited") === "PayChex International Marketing Limited", `${p}: expected underlying name unchanged`);
  }
  pass("non-FM paths (Platform Finance, Command Centre, Admin, ECC, workspace preview) resolve the underlying organisation name unchanged");
}

// 3. Shared app-wide chrome no longer renders the raw underlying name directly — it goes through the resolver.
{
  for (const f of ["src/components/navigation/TopBar.tsx", "src/components/platform/GlobalCommandBar.tsx"]) {
    const s = src(f);
    const rawUses = (s.match(/user\??\.organisationName/g) ?? []).length;
    // Exactly one legitimate use: feeding the underlying name INTO fmOperatingIdentityName. Any more means a
    // render site still bypasses the resolver.
    assert(rawUses === 1, `${f}: expected exactly 1 use of user.organisationName (feeding the resolver), found ${rawUses}`);
    assert(/const operatingCompanyName = fmOperatingIdentityName\(/.test(s), `${f}: does not resolve operatingCompanyName via fmOperatingIdentityName`);
    assert(!/\{operatingCompanyName\b[\s\S]{0,5}\?\?[\s\S]{0,5}user/.test(s), `${f}: operatingCompanyName render falls back to the raw user object`);
  }
  const ix = src("src/modules/intelligence/experience/IntelligenceChrome.tsx");
  assert(!/user\??\.organisationName/.test(ix), "IntelligenceChrome.tsx: still renders user.organisationName directly");
  assert(/FM_OPERATING_COMPANY_NAME/.test(ix), "IntelligenceChrome.tsx: does not use FM_OPERATING_COMPANY_NAME");
  pass("shared app-wide chrome (TopBar, GlobalCommandBar) and FM Intelligence chrome no longer render the raw underlying organisation name");
}

// 4. Zero-tolerance: the external-facing occupant intake chrome renders no visible PayChex text — the brand
// word-mark, header, and footer/copyright all render Trivnet Services Limited instead. The only remaining
// "paychex" substrings are the CSS class names (sr-paychex-mark/-word — internal, never rendered as text) and
// the support mailto target (a live operational inbox address, not display text) — both deliberately preserved
// and reported as known exceptions, not silently allowed.
{
  const s = src("src/modules/occupant-requests/components/SubmitRequestChrome.tsx");
  assert(!/>\s*PayChex\s*</.test(s), "SubmitRequestChrome.tsx: still renders visible 'PayChex' text");
  assert(!/next\/image/.test(s), "SubmitRequestChrome.tsx: still imports the PayChex logo image");
  const usages = (s.match(/FM_OPERATING_COMPANY_NAME/g) ?? []).length;
  // 1 import + 3 render sites (brand mark, footer <strong>, copyright line).
  assert(usages === 4, `SubmitRequestChrome.tsx: expected FM_OPERATING_COMPANY_NAME imported + used in brand mark, footer, and copyright (4 occurrences), found ${usages}`);
  assert(FM_OPERATING_COMPANY_NAME === "Trivnet Services Limited", "FM_OPERATING_COMPANY_NAME constant drifted from the authoritative name");
  pass("external-facing occupant intake chrome renders Trivnet Services Limited (brand mark, footer, copyright); no visible PayChex text or logo remains");
}

console.log(out.join("\n"));
console.log(`\n${out.length} groups passed`);
