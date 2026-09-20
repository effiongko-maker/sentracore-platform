/**
 * ECC form-control affordance + stale-attendance action semantics.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-ecc-form-affordance.mts
 *
 * Semantic checks only (no arbitrary CSS values): controls must not depend on an
 * undefined design token (which silently drops the border), must define
 * hover/focus/disabled/placeholder states, and selects must carry an explicit
 * dropdown affordance. A stale historical sign-in must not offer a normal Sign out.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const read = (p: string) => readFileSync(resolve(p), "utf8");

const os = read("src/styles/sentracore-os.css");
const ecc = read("src/styles/ecc-operations.css").replace(/\/\*[\s\S]*?\*\//g, "");
const defined = new Set([...os.matchAll(/(--os-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

/** Every rule whose selector targets .ecc-field controls (excluding size-only overrides). */
const rules = [...ecc.matchAll(/([^{}]*\.ecc-field[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }))
  // Only rules that target .ecc-field controls exclusively (not shared with other component classes).
  .filter((r) => r.selector.split(",").every((part) => part.includes(".ecc-field")));
assert(rules.length > 0, "ecc-field rules exist");

// 1. No control rule relies on an undefined token.
for (const { selector, body } of rules) {
  for (const [, token] of body.matchAll(/var\((--os-[a-z0-9-]+)/g)) {
    assert(defined.has(token!), `ECC form control rule "${selector}" uses undefined token ${token}`);
  }
}
const base = rules.find((r) => /^\.ecc-field input,\s*\.ecc-field select,\s*\.ecc-field textarea$/.test(r.selector.replace(/\s+/g, " ").replace(/,\s/g, ", ")) && /border:/.test(r.body));
assert(base && /border:\s*1px solid/.test(base.body) && /background-color:/.test(base.body), "controls have an explicit border and neutral surface");

// 2. Interaction states + select affordance.
const has = (re: RegExp) => rules.some((r) => re.test(r.selector));
assert(has(/:hover/), "hover state");
assert(has(/:focus/), "focus state");
assert(has(/:disabled/), "disabled state");
assert(has(/::placeholder/), "placeholder state");
const select = rules.find((r) => /^\.ecc-field select$/.test(r.selector));
assert(select && /appearance:\s*none/.test(select.body) && /background-image:\s*url\(/.test(select.body), "selects carry an explicit dropdown chevron");
assert(!/box-shadow:[^;]*rgba\(0, ?0, ?0/.test(base!.body), "no decorative shadow on resting controls");

// 3. Stale historical attendance is not a normal Sign out.
const people = read("src/modules/ecc-operations/components/EccPeoplePage.tsx");
const staleBranch = people.indexOf("row.staleOpenAttendance ? (");
const signOutButton = people.indexOf("onSignOut(row.person.id)");
assert(staleBranch > 0 && signOutButton > staleBranch, "Sign out is only rendered in the non-stale branch");
assert(/Historical · needs correction/.test(people), "stale sign-in is labelled as historical");
assert(!/onSignOut\(row\.person\.id\)[\s\S]{0,120}staleOpenAttendance/.test(people), "no stale-row sign-out action");

console.log("PASS ECC form controls have a real border, neutral surface, hover/focus/disabled/placeholder states and a select chevron (defined tokens only)");
console.log("PASS stale historical attendance offers no normal Sign out; labelled historical");
console.log("VERIFY_ECC_FORM_AFFORDANCE: PASS");
