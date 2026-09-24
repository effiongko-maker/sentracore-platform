/**
 * Administrator-created accounts — verification of the provisioning architecture and the temporary-password
 * lifecycle. Pure: stubs the Auth Admin API and the IAM repository; never touches a database or sends anything.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-account-provisioning.mts
 */
import { readFileSync } from "node:fs";
import { CAPABILITY_DOMAINS } from "../src/modules/platform-admin/capabilityCatalog";
import { CHANGE_PASSWORD_PATH, MUST_CHANGE_PASSWORD_KEY, PASSWORD_CHANGE_REQUIRED_CODE, mustChangePassword, passwordChangeGate } from "../src/lib/auth/passwordLifecycle";
import { generateTemporaryPassword } from "../src/modules/platform-admin/server/temporaryPassword";
import { PlatformAdminServerService } from "../src/modules/platform-admin/server/PlatformAdminServerService";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const out: string[] = [];
const pass = (m: string) => out.push(`PASS ${m}`);
const read = (f: string) => readFileSync(f, "utf8");
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

async function main() {
  // A. the mandatory-change state and its enforcement rule
  {
    const pending = { app_metadata: { [MUST_CHANGE_PASSWORD_KEY]: true } };
    assert(mustChangePassword(pending) && !mustChangePassword({}) && !mustChangePassword(null) && !mustChangePassword({ app_metadata: {} }) && !mustChangePassword({ app_metadata: { [MUST_CHANGE_PASSWORD_KEY]: false } }) && !mustChangePassword({ app_metadata: { [MUST_CHANGE_PASSWORD_KEY]: "true" } }), "only an explicit boolean true is pending — existing users (no key) are never affected");
    for (const path of ["/", "/issues", "/work", "/requests", "/admin/people", "/finance", "/incidents"]) {
      const g = passwordChangeGate(path, true);
      assert(g.action === "redirect" && g.to === CHANGE_PASSWORD_PATH, `pending user requesting ${path} is redirected to ${CHANGE_PASSWORD_PATH} (no bypass by direct navigation)`);
    }
    for (const path of ["/api/issues", "/api/requests", "/api/platform-admin", "/api/access/me"]) {
      const g = passwordChangeGate(path, true);
      assert(g.action === "block_api" && g.code === PASSWORD_CHANGE_REQUIRED_CODE, `pending user calling ${path} is refused`);
    }
    assert(passwordChangeGate(CHANGE_PASSWORD_PATH, true).action === "allow" && passwordChangeGate("/auth/callback", true).action === "allow", "only the change page and the auth callback are reachable while pending");
    assert(["/", "/issues", "/api/issues", CHANGE_PASSWORD_PATH].every((p) => passwordChangeGate(p, false).action === "allow"), "a user with no pending change is completely unaffected");
    const proxy = read("src/utils/supabase/middleware.ts");
    assert(/mustChangePassword\(user\)/.test(proxy) && proxy.indexOf("passwordChangeGate") < proxy.indexOf("Recovery sessions must finish"), "the proxy enforces the gate from server-side Auth state, before anything else");
    assert(/getUser\(\)/.test(proxy) && !/sc_password_recovery[\s\S]{0,40}must/i.test(proxy), "enforcement reads Supabase Auth (getUser), not a deletable cookie");
    pass("A mandatory change: server-side flag, every page redirects, every API refused, unaffected for users without the flag");
  }

  // B. temporary password quality
  {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      const p = generateTemporaryPassword();
      assert(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){4}$/.test(p) && /[a-z]/.test(p) && /[A-Z]/.test(p) && /[2-9]/.test(p) && !/[01OIl]/.test(p), `temporary password format: ${p.length} chars, mixed, no look-alikes`);
      seen.add(p);
    }
    assert(seen.size === 300, "300 generated passwords are all distinct (CSPRNG)");
    assert(/randomInt/.test(read("src/modules/platform-admin/server/temporaryPassword.ts")) && !/Math\.random/.test(read("src/modules/platform-admin/server/temporaryPassword.ts")), "generated with node:crypto randomInt, never Math.random");
    pass("B temporary password: 20 random characters in groups, mixed classes, no look-alikes, unique, CSPRNG");
  }

  // C. createAccount: no email, canonical chain, password never leaks
  {
    const audits: unknown[] = [];
    const logged: string[] = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    for (const k of Object.keys(orig) as Array<keyof typeof orig>) console[k] = (...a: unknown[]) => { logged.push(JSON.stringify(a)); };
    const createCalls: Array<Record<string, unknown>> = [];
    let inviteCalled = false;
    const authAdmin = {
      listUsers: async () => ({ data: { users: [] }, error: null }),
      createUser: async (a: Record<string, unknown>) => { createCalls.push(a); return { data: { user: { id: "11111111-1111-4111-8111-111111111111", email: a.email } }, error: null }; },
      inviteUserByEmail: async () => { inviteCalled = true; return { data: {}, error: null }; },
      getUserById: async () => ({ data: { user: { id: "u", email: "x@example.test", banned_until: null } }, error: null }),
      updateUserById: async () => ({ data: {}, error: null }),
    };
    const held: string[] = [];
    const grantCalls: string[] = [];
    const repo = {
      getOrganisationById: async () => ({ id: "org1", slug: "o", status: "active" }),
      attachInvitedProfile: async () => ({ userId: "11111111-1111-4111-8111-111111111111", organisationId: "org1", organisationSlug: "o", changed: true }),
      insertAuditEvent: async (e: unknown) => { audits.push(e); },
      getProfile: async () => ({ id: "11111111-1111-4111-8111-111111111111", organisation_id: "org1", status: "active", access_scope: "platform" }),
      setAccessScope: async () => ({ changed: true }),
      setLandingWorkspace: async () => ({ changed: true }),
      grantPlatformCapability: async (i: { capability: string }) => { grantCalls.push(i.capability); held.push(i.capability); return { changed: true }; },
    };
    const query: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "order", "limit"]) query[m] = () => query;
    query.then = (resolve: (v: unknown) => void) => resolve({ data: held.map((capability) => ({ capability })), error: null });
    const admin = { auth: { admin: authAdmin }, from: () => query };
    const svc = new PlatformAdminServerService(repo as never, admin as never);
    const ctx = { actorProfileId: "actor" } as never;
    const base = { email: "New.Person@Example.test", fullName: "New Person", organisationId: "org1", accessScope: "module", homeModule: "facility_management" };
    const res = await svc.createAccount(ctx, { ...base, capabilities: ["ops.view"] });
    for (const k of Object.keys(orig) as Array<keyof typeof orig>) console[k] = orig[k];

    assert(createCalls.length === 1 && createCalls[0]!.email_confirm === true && !inviteCalled, "the Auth identity is created server-side with a PRE-CONFIRMED email; no invitation call is made");
    assert((createCalls[0]!.app_metadata as Record<string, unknown>)[MUST_CHANGE_PASSWORD_KEY] === true && typeof createCalls[0]!.password === "string", "the identity is created with a temporary password and must_change_password");
    assert(res.authEmailSent === false && res.mustChangePassword === true && res.temporaryPassword === createCalls[0]!.password && res.email === "new.person@example.test", "the temporary password is returned in the result exactly once; no Auth email is sent");
    assert(grantCalls.join() === "ops.view" && res.grantedCapabilities.join() === "ops.view", "explicit capability grants use the canonical audited grant path");
    const blob = JSON.stringify(audits) + logged.join("\n");
    assert(!blob.includes(res.temporaryPassword) && audits.length >= 2 && audits.some((a) => (a as { action: string }).action === "user.account_created"), "the plaintext password appears in NO audit event and NO log output");
    const created = audits.find((a) => (a as { action: string }).action === "user.account_created") as { details: Record<string, unknown> };
    assert(created.details.credentialDelivery === "administrator_one_time" && !("password" in created.details) && !("temporaryPassword" in created.details), "the account-created audit records who/what/how — never the credential");
    // validation happens BEFORE any identity is created
    const before = createCalls.length;
    for (const bad of [
      { ...base, accessScope: "everything" },
      { ...base, accessScope: "platform", homeModule: "facility_management" },
      { ...base, capabilities: ["not.a.capability"] },
      { ...base, capabilityPackage: "facility_manager" },
      { ...base, capabilityPackage: "root" },
      { ...base, email: "not-an-email" },
    ]) {
      let err: unknown = null;
      try { await svc.createAccount(ctx, bad as never); } catch (e) { err = e; }
      assert(err !== null, `invalid request refused: ${JSON.stringify(bad).slice(0, 80)}`);
    }
    assert(createCalls.length === before, "a request that fails validation creates NO identity");
    pass("C createAccount: pre-confirmed Auth identity (no email), canonical chain, credential returned once and absent from audit/logs, invalid input creates nothing");
  }

  // D. issueTemporaryPassword
  {
    const audits: unknown[] = [];
    const updates: Array<Record<string, unknown>> = [];
    const mk = (profile: unknown, banned: string | null) => new PlatformAdminServerService(
      { getProfile: async () => profile, insertAuditEvent: async (e: unknown) => { audits.push(e); } } as never,
      { auth: { admin: { getUserById: async () => ({ data: { user: { id: "p", email: "fm@example.test", banned_until: banned } }, error: null }), updateUserById: async (_id: string, a: Record<string, unknown>) => { updates.push(a); return { data: {}, error: null }; } } } } as never
    );
    const ctx = { actorProfileId: "admin" } as never;
    const active = { id: "p", status: "active", organisation_id: "org1" };
    const ok = await mk(active, null).issueTemporaryPassword(ctx, { profileId: "p" });
    assert(updates.length === 1 && updates[0]!.password === ok.temporaryPassword && (updates[0]!.app_metadata as Record<string, unknown>)[MUST_CHANGE_PASSWORD_KEY] === true, "the credential is replaced through the Admin API and the mandatory change is set again");
    assert(!JSON.stringify(audits).includes(ok.temporaryPassword) && (audits[0] as { action: string }).action === "user.temporary_password_issued", "the reissue is audited without the credential");
    for (const [label, svc, id] of [["own account", mk(active, null), "admin"], ["inactive account", mk({ ...active, status: "inactive" }, null), "p"], ["unattached account", mk({ ...active, organisation_id: null }, null), "p"], ["sign-in disabled account", mk(active, "2999-01-01T00:00:00Z"), "p"]] as const) {
      const n: number = updates.length;
      let err: unknown = null;
      try { await svc.issueTemporaryPassword(ctx, { profileId: id }); } catch (e) { err = e; }
      assert(err !== null && updates.length === n, `reissue refused for ${label} (no credential changed)`);
    }
    pass("D reissue: replaces the credential, re-requires a change, audited without the credential; refused for self, inactive, unattached and sign-in-disabled accounts");
  }

  // E. static controls around the credential
  {
    const svc = strip(read("src/modules/platform-admin/server/PlatformAdminServerService.ts"));
    assert(!/console\.(log|error|warn|info)\([^)]*(temporaryPassword|password)/i.test(svc), "the service never logs a password");
    assert((svc.match(/temporaryPassword/g) ?? []).length <= 24 && !/details:\s*\{[^}]*temporaryPassword/.test(svc), "temporaryPassword is never placed in an audit details object");
    assert(!/inviteUserByEmail|resetPasswordForEmail|generateLink|magiclink/i.test(svc), "no invitation / reset / magic-link email path exists in the provisioning service");
    const route = read("src/app/api/platform-admin/route.ts");
    assert((route.match(/"Cache-Control": "no-store"/g) ?? []).length >= 2 && /requirePlatformAdmin/.test(route), "credential responses are never cacheable and sit behind the Super Admin gate");
    const actions = strip(read("src/lib/auth/actions.ts"));
    const fn = actions.slice(actions.indexOf("completeMandatoryPasswordChange"));
    assert(fn.indexOf("auth.updateUser({ password })") < fn.indexOf("updateUserById") && /app_metadata: \{ \[MUST_CHANGE_PASSWORD_KEY\]: null \}/.test(fn), "the password is replaced FIRST; only then is the flag cleared (service role)");
    assert(![...fn.matchAll(/console\.\w+\(\s*"[^"]*"\s*,([^;]*)\);/g)].some((m) => /\b(password|confirm|next|formData)\b/i.test(m[1]!)), "the change flow logs only error class fields, never the password");
    const ui = read("src/modules/platform-admin/client/TemporaryCredential.tsx") + read("src/modules/platform-admin/client/PeopleView.tsx") + read("src/modules/platform-admin/client/PersonView.tsx");
    assert(!/localStorage|sessionStorage|document\.cookie|console\./.test(read("src/modules/platform-admin/client/TemporaryCredential.tsx")), "the one-time credential is never written to storage or logs by the UI");
    assert(/only time this password will be shown/i.test(ui) && /setResult\(null\); \/\/ discards the one-time credential/.test(ui) && /setResult\(null\);\s*\n\s*onClose\(\)/.test(read("src/modules/platform-admin/client/PeopleView.tsx")), "the UI states the one-time nature and discards the credential on close");
    assert(!/Invite person|Send invitation|Invite a person/.test(ui) && /Create account/.test(ui) && /Issue temporary password/i.test(ui), "the Admin Console says Create account / Issue temporary password — not Invite");
    assert(/mandatory first-login|Choose your password/i.test(read("src/app/(auth)/change-password/page.tsx")) && /mustChangePassword\(user\)\) redirect\("\/"\)/.test(read("src/app/(auth)/change-password/page.tsx")), "a dedicated change page exists and turns away users with no pending change");
    pass("E controls: no credential logging, storage or audit; no invitation email path; password replaced before the flag clears; UI is explicit and discards on close");
  }

  // F. lifecycle reuse + Finance distinction
  {
    const svc = read("src/modules/platform-admin/server/PlatformAdminServerService.ts");
    assert(/async setProfileStatus[\s\S]{0,1600}setAuthSignInDisabled/.test(svc) && !/deleteUser/.test(svc), "deactivate / reactivate stay on the canonical status + sign-in-disable path; no hard deletion");
    assert(/this\.setAccessScope\(ctx/.test(svc) && /this\.setFacilityAssignment\(ctx/.test(svc) && /this\.repo\.grantPlatformCapability/.test(svc) && /attachInvitedProfile/.test(svc), "provisioning reuses the existing attach / scope / assignment / grant mechanisms (no parallel IAM)");
    const fm = CAPABILITY_DOMAINS.find((d) => d.id === "fm_costs")!;
    assert(/NOT Platform Finance/.test(fm.summary) && /platform_finance\./.test(fm.summary) && fm.capabilities.every((c) => /FM/.test(c.label)), "the Admin Console separates FM costs (finance.*) from Platform Finance (platform_finance.*) in copy and labels");
    // Operational platform_finance.* capabilities are never granted as platform capabilities. The only platform_finance.*
    // key here is the control-plane platform_finance.access.manage (administer others' Finance access; no Finance entry).
    assert(
      CAPABILITY_DOMAINS.flatMap((d) => d.capabilities.map((c) => c.key)).filter((k) => k.startsWith("platform_finance.")).join() === "platform_finance.access.manage",
      "only the control-plane platform_finance.access.manage is administrable from this console"
    );
    pass("F lifecycle + Finance: canonical status/sign-in path, no hard delete, no parallel IAM; FM finance.* and Platform Finance are explicitly distinct");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}
main().catch((e) => { process.stderr.write("FAIL " + (e instanceof Error ? e.stack : String(e)) + "\n"); console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
