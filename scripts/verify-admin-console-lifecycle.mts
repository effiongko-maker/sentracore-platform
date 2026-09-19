/**
 * Admin Console — organisation-context lifecycle regression.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-admin-console-lifecycle.mts
 *
 * Renders every Admin Console surface (server render, no network) while the
 * organisation context is: resolving, failed, empty, and ready. A surface must
 * never dereference the organisation, or start a data request, before it exists.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}

const fetchCalls: string[] = [];
(globalThis as { fetch: unknown }).fetch = async (input: unknown) => {
  fetchCalls.push(String(input));
  return new Response(JSON.stringify({ success: false, message: "offline" }), { status: 503 });
};

// next/navigation hooks need an app-router mount; stub them for a server render.
const nav = await import("next/navigation");
void nav;

async function main() {
  const dir = "src/modules/platform-admin/client";
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));
  const src = Object.fromEntries(files.map((f) => [f, strip(readFileSync(resolve(join(dir, f)), "utf8"))]));

  await check("no non-null assertion on organisation / context anywhere in the Admin client", () => {
    for (const [f, s] of Object.entries(src)) {
      assert(!/organisation!/.test(s) && !/organisations!/.test(s), `${f}: non-null assertion on organisation`);
      assert(!/organisation\?\.id\]/.test(s), `${f}: loader keyed on a possibly-null organisation`);
    }
  });
  await check("every surface renders behind OrgGate and its body receives a real organisation", () => {
    for (const v of ["OverviewView", "PeopleView", "PersonView", "AccessView", "ModulesView", "AuditView"]) {
      const s = src[`${v}.tsx`];
      assert(s.includes("<OrgGate") && /organisation: OrganisationAdminRecord/.test(s), `${v} not gated`);
      assert(!/useAdminConsole\(\)[^;]*organisation\b/.test(s.replace(/actorProfileId/g, "")), `${v} reads a nullable organisation from context`);
    }
  });
  await check("OrgGate has explicit resolving / failed / none states and never renders children early", () => {
    const ui = src["ui.tsx"];
    const gate = ui.slice(ui.indexOf("export function OrgGate"), ui.indexOf("Renders loading / failure"));
    assert(gate.includes("Loading organisation…") && gate.includes("Couldn’t load organisations") && gate.includes("No organisation to administer"), "states");
    assert(gate.lastIndexOf("children(organisation)") > gate.indexOf("No organisation to administer"), "children only after every guard");
  });
  await check("data hook loads only after its caller exists (surface bodies own the loader)", () => {
    for (const v of ["OverviewView", "PeopleView", "PersonView", "AccessView", "ModulesView", "AuditView"]) {
      const s = src[`${v}.tsx`];
      const outer = s.slice(s.indexOf(`export function ${v}`), s.indexOf("function ", s.indexOf(`export function ${v}`) + 10));
      assert(!/useAdminData/.test(outer), `${v}: the outer component starts a loader before the organisation exists`);
    }
  });

  // Behavioural: render each state.
  const { AdminConsoleStateContext } = await import("../src/modules/platform-admin/client/AdminConsoleContext");
  const { OrgGate } = await import("../src/modules/platform-admin/client/ui");
  type State = import("../src/modules/platform-admin/client/AdminConsoleContext").AdminConsoleState;
  const org = { id: "00000000-0000-4000-8000-0000000000c1", name: "Test Org", slug: "test-org", status: "active", modules: [] };
  const base = { actorProfileId: "00000000-0000-4000-8000-0000000000d1", reload: () => {}, selectOrganisation: () => {} };
  const states: Record<string, State> = {
    resolving: { ...base, organisations: null, organisation: null, loading: true, error: null },
    failed: { ...base, organisations: null, organisation: null, loading: false, error: "Unable to load organisations." },
    none: { ...base, organisations: [], organisation: null, loading: false, error: null },
    ready: { ...base, organisations: [org], organisation: org, loading: false, error: null },
  };
  const render = (state: State, el: ReactElement) => renderToStaticMarkup(createElement(AdminConsoleStateContext.Provider, { value: state }, el));

  await check("OrgGate: resolving → loading (children not invoked); failed → error; none → truthful empty; ready → children", () => {
    const calls = { n: 0 };
    const count = () => calls.n;
    const child = (o: typeof org) => {
      calls.n += 1;
      return createElement("p", null, `ready:${o.id}`);
    };
    const gate = () => createElement(OrgGate as never, { title: "T" }, child as never);
    assert(/Loading organisation/.test(render(states.resolving, gate())) && count() === 0, "resolving");
    assert(/Couldn’t load organisations/.test(render(states.failed, gate())) && count() === 0, "failed");
    assert(/No organisation to administer/.test(render(states.none, gate())) && count() === 0, "none");
    assert(new RegExp(`ready:${org.id}`).test(render(states.ready, gate())) && count() === 1, "ready");
  });

  const views: Array<[string, string, Record<string, unknown>]> = [
    ["OverviewView", "Overview", {}],
    ["PeopleView", "People", {}],
    ["PersonView", "Person", { profileId: "00000000-0000-4000-8000-0000000000e1" }],
    ["AccessView", "Access", {}],
    ["ModulesView", "Modules", {}],
    ["AuditView", "Audit", {}],
  ];
  for (const [name, , props] of views) {
    await check(`${name}: renders without throwing and without any request while the organisation is unresolved / failed / absent`, async () => {
      const mod = (await import(`../src/modules/platform-admin/client/${name}`)) as Record<string, (p: Record<string, unknown>) => ReactElement>;
      for (const key of ["resolving", "failed", "none"] as const) {
        fetchCalls.length = 0;
        let html = "";
        try {
          html = render(states[key], createElement(mod[name] as never, props));
        } catch (e) {
          throw new Error(`${key}: threw ${e instanceof Error ? e.message : e}`);
        }
        assert(fetchCalls.length === 0, `${key}: a request fired before the organisation existed (${fetchCalls[0]})`);
        const expected = { resolving: /Loading organisation/, failed: /Couldn’t load organisations/, none: /No organisation to administer/ }[key];
        assert(expected.test(html), `${key}: expected an explicit state, got: ${html.replace(/<[^>]+>/g, " ").slice(0, 120)}`);
      }
    });
  }

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed += 1;
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "ADMIN_CONSOLE_LIFECYCLE: PASS" : "ADMIN_CONSOLE_LIFECYCLE: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main();
