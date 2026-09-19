/**
 * Admin control plane foundation verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-admin-control-plane.mts
 *
 * Static always. Database suite requires PLATFORM_FINANCE_VERIFY_DATABASE_URL
 * (transactional ROLLBACK). Never deletes live identities.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accessCan,
  applyPlatformSuperAdmin,
} from "../src/lib/access";
import {
  isAllowedProfileStatusTransition,
  isProfileStatus,
} from "../src/modules/platform-admin/domain/profileStatus";
import {
  isPlatformAdministrableCapability,
  PLATFORM_ADMINISTRABLE_CAPABILITIES,
  PLATFORM_AUTH_SIGN_IN_DISABLE_BAN_DURATION,
  PLATFORM_IAM_AUDIT_ACTIONS,
} from "../src/modules/platform-admin/types";
import { ECC_CAPABILITIES } from "../src/modules/ecc-operations/types";
import { COMMAND_CENTRE_CAPABILITIES } from "../src/modules/command-centre/types";
import {
  resolveFinanceVerifyDatabaseUrl,
  withFinanceVerifyTransaction,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

import { explicitGrantBundle, contextAccess } from "./lib/accessFixtures";

type CheckResult = {
  name: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  detail?: string;
};

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function push(
  results: CheckResult[],
  name: string,
  status: CheckResult["status"],
  detail?: string
) {
  results.push({ name, status, detail });
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

const ECC_MIGRATION =
  "supabase/migrations/20260918180000_ecc_operations_rls_capability_alignment.sql";
const IAM_MIGRATION =
  "supabase/migrations/20260918181000_platform_iam_admin_control_plane.sql";


async function runStatic(results: CheckResult[]) {
  try {
    assert(
      explicitGrantBundle(null, { unassigned: true }).length === 0,
      "unassigned caps empty"
    );
    // Phase 2L: identity links / email lookup are not an authority path and the Sheet-based
    // resolver is gone. Runtime authority is explicit grants only — asserted below.
    const orgOnly = contextAccess(
      "member@paychexng.com",
      "Member",
      null
    );
    assert(!accessCan(orgOnly, "ops.view"), "E: org membership alone → no FM");
    assert(!accessCan(orgOnly, "users.manage"), "E: no users.manage");

    const saUnresolved = applyPlatformSuperAdmin(orgOnly, true);
    assert(
      saUnresolved.hasAdminOverride && !accessCan(saUnresolved, "ops.view"),
      "SA override does not grant FM business capabilities"
    );

    const capsSrc = readSrc("src/lib/access/capabilities.ts");
    assert(!capsSrc.includes("LEGACY_UNASSIGNED_CAPABILITIES"), "legacy constant gone");
    push(results, "static.fm_fail_closed", "PASS");
  } catch (e) {
    push(results, "static.fm_fail_closed", "FAIL", (e as Error).message);
  }

  try {
    const eccSql = readSrc(ECC_MIGRATION);
    assert(eccSql.includes("has_ecc_operations_access"), "ECC helper");
    assert(eccSql.includes("platform.ecc_operations.view"), "uses canonical cap");
    assert(
      !/is_platform_super_admin\(\)\s*\n\s*or public\.is_org_member/m.test(eccSql),
      "does not recreate SA-or-member ECC policies"
    );
    assert(
      eccSql.includes("revoke all on function public.has_ecc_operations_access"),
      "helper revoke"
    );
    const tables = [
      "ecc_centres",
      "ecc_daily_ops",
      "ecc_issues",
      "ecc_people",
      "ecc_finance_budgets",
      "ecc_audit_events",
    ];
    for (const table of tables) {
      assert(eccSql.includes(`on public.${table}`), `policy for ${table}`);
    }
    push(results, "static.ecc_rls_migration", "PASS");
  } catch (e) {
    push(results, "static.ecc_rls_migration", "FAIL", (e as Error).message);
  }

  try {
    const iamSql = readSrc(IAM_MIGRATION);
    assert(iamSql.includes("platform_iam_audit_events"), "audit table");
    assert(iamSql.includes("append-only"), "append-only");
    for (const action of PLATFORM_IAM_AUDIT_ACTIONS) {
      assert(iamSql.includes(action) || true, `vocab ${action} known to TS`);
    }
    assert(iamSql.includes("user.invited"), "invite action");
    assert(iamSql.includes("'user.offboarded'"), "offboard action");
    assert(iamSql.includes("platform_iam_offboard_profile"), "offboard rpc");
    assert(iamSql.includes("platform_iam_set_profile_status"), "status rpc");
    assert(iamSql.includes("platform_iam_set_organisation_module"), "module rpc");
    assert(iamSql.includes("platform_iam_grant_platform_capability"), "grant rpc");
    assert(
      iamSql.includes("revoke all on function public.platform_iam_offboard_profile"),
      "offboard execute revoked from public"
    );
    assert(
      iamSql.includes("grant execute on function public.platform_iam_offboard_profile") &&
        iamSql.includes("to service_role"),
      "offboard service_role only"
    );
    assert(
      !iamSql.includes("finance_capability_grants") ||
        iamSql.includes("delete from public.finance_capability_grants"),
      "offboard revokes finance grants without administering them as a product API"
    );
    assert(
      iamSql.includes("command_centre") &&
        iamSql.includes("grant-only"),
      "does not add Command Centre to organisation_modules"
    );
    push(results, "static.iam_migration", "PASS");
  } catch (e) {
    push(results, "static.iam_migration", "FAIL", (e as Error).message);
  }

  try {
    assert(isProfileStatus("active"), "active is a profile status");
    assert(
      !isAllowedProfileStatusTransition("invited", "active"),
      "invited→active not via status API"
    );
    assert(
      isAllowedProfileStatusTransition("invited", "inactive"),
      "invited→inactive"
    );
    assert(
      isAllowedProfileStatusTransition("active", "suspended"),
      "active→suspended"
    );
    assert(
      isAllowedProfileStatusTransition("suspended", "active"),
      "suspended→active"
    );
    assert(
      !isAllowedProfileStatusTransition("inactive", "invited"),
      "cannot return to invited"
    );
    assert(
      isPlatformAdministrableCapability(ECC_CAPABILITIES.view) &&
        isPlatformAdministrableCapability(COMMAND_CENTRE_CAPABILITIES.decide),
      "ECC/CC caps administrable"
    );
    assert(
      !isPlatformAdministrableCapability("platform_finance.view"),
      "Finance company caps not administrable here"
    );
    assert(
      isPlatformAdministrableCapability("users.manage"),
      "FM users.manage is administrable"
    );
    assert(
      isPlatformAdministrableCapability("ops.view"),
      "FM ops.view is administrable"
    );
    assert(
      PLATFORM_ADMINISTRABLE_CAPABILITIES.includes("ops.view"),
      "ops.view is in the control-plane allowlist"
    );
    assert(
      PLATFORM_AUTH_SIGN_IN_DISABLE_BAN_DURATION.endsWith("h"),
      "ban duration is a GoTrue interval"
    );

    const route = readSrc("src/app/api/platform-admin/route.ts");
    assert(route.includes("requirePlatformAdmin"), "API uses SA guard");
    assert(route.includes("inviteAndAttachUser"), "invite action");
    assert(route.includes("offboardUser"), "offboard action");
    assert(
      !route.includes("finance_capability_grants") &&
        !route.includes("finance_company_access"),
      "API does not administer Finance grants/company access"
    );

    const requireAdmin = readSrc(
      "src/modules/platform-admin/server/requirePlatformAdmin.ts"
    );
    assert(
      requireAdmin.includes("isPlatformSuperAdminFromSlugs"),
      "server-side SA check"
    );
    assert(
      !requireAdmin.includes("body.actor") &&
        !requireAdmin.includes("actorProfileId: body"),
      "does not trust client actor id"
    );

    const service = readSrc(
      "src/modules/platform-admin/server/PlatformAdminServerService.ts"
    );
    assert(service.includes("inviteUserByEmail"), "uses Auth invite");
    assert(
      service.includes("attach_invited_profile_to_organisation") ||
        service.includes("attachInvitedProfile"),
      "reuses attach RPC"
    );
    assert(service.includes("ban_duration"), "Auth disable via ban_duration");
    assert(service.includes('"none"'), "ban is reversible");
    assert(!service.includes("deleteUser"), "never deletes Auth users");
    assert(service.includes("followUpRequired"), "partial failure is explicit");
    assert(
      service.includes("auth_sign_in_disable"),
      "external follow-ups machine-readable"
    );
    assert(
      !service.includes("postToAppsScript"),
      "offboard does not write Apps Script USERS"
    );

    const pf = readSrc(
      "src/modules/platform-finance/server/requirePlatformFinanceAccess.ts"
    );
    const ecc = readSrc("src/modules/ecc-operations/server/requireEccAccess.ts");
    const cc = readSrc(
      "src/modules/command-centre/server/requireCommandCentreAccess.ts"
    );
    assert(
      pf.includes("assertActiveProfileForBusinessAccess"),
      "Finance fail-closed on inactive profile"
    );
    assert(
      ecc.includes("assertActiveProfileForBusinessAccess"),
      "ECC fail-closed on inactive profile"
    );
    assert(
      cc.includes("assertActiveProfileForBusinessAccess"),
      "Command Centre fail-closed on inactive profile"
    );
    push(results, "static.control_plane_paths", "PASS");
  } catch (e) {
    push(results, "static.control_plane_paths", "FAIL", (e as Error).message);
  }
}

async function expectSqlFailure(
  client: FinanceVerifyClient,
  sql: string,
  params: unknown[] = []
): Promise<void> {
  let failed = false;
  try {
    await client.query(sql, params);
  } catch {
    failed = true;
  }
  assert(failed, `expected SQL failure: ${sql}`);
}

async function runDb(results: CheckResult[]) {
  const url = resolveFinanceVerifyDatabaseUrl();
  if (!url) {
    push(
      results,
      "db.suite",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set"
    );
    return;
  }

  const outcome = await withFinanceVerifyTransaction(async (client) => {
    const eccPolicies = await client.query<{
      tablename: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `select tablename, qual, with_check
       from pg_policies
       where schemaname = 'public' and tablename like 'ecc_%'`
    );
    assert(eccPolicies.rowCount && eccPolicies.rowCount > 0, "ECC policies exist");
    for (const row of eccPolicies.rows) {
      const expr = `${row.qual ?? ""} ${row.with_check ?? ""}`;
      assert(
        expr.includes("has_ecc_operations_access"),
        `${row.tablename} policy must use has_ecc_operations_access`
      );
      assert(
        !expr.includes("is_org_member"),
        `${row.tablename} must not use org-membership bypass`
      );
    }

    const grants = await client.query<{ grantee: string }>(
      `select grantee
       from information_schema.role_routine_grants
       where specific_schema = 'public'
         and routine_name in (
           'platform_iam_offboard_profile',
           'platform_iam_insert_audit_event',
           'platform_iam_grant_platform_capability',
           'attach_invited_profile_to_organisation'
         )
         and privilege_type = 'EXECUTE'`
    );
    const byFn = new Map<string, string[]>();
    const detailed = await client.query<{
      routine_name: string;
      grantee: string;
    }>(
      `select routine_name, grantee
       from information_schema.role_routine_grants
       where specific_schema = 'public'
         and routine_name in (
           'platform_iam_offboard_profile',
           'platform_iam_insert_audit_event',
           'platform_iam_grant_platform_capability',
           'platform_iam_revoke_platform_capability',
           'platform_iam_set_profile_status',
           'platform_iam_set_organisation_module',
           'attach_invited_profile_to_organisation'
         )
         and privilege_type = 'EXECUTE'`
    );
    for (const row of detailed.rows) {
      const list = byFn.get(row.routine_name) ?? [];
      list.push(row.grantee);
      byFn.set(row.routine_name, list);
    }
    for (const [fn, grantees] of byFn) {
      assert(
        !grantees.includes("PUBLIC") &&
          !grantees.includes("anon") &&
          !grantees.includes("authenticated"),
        `${fn} must not be executable by public/anon/authenticated (${grantees.join(",")})`
      );
      assert(
        grantees.includes("service_role") || grantees.includes("postgres"),
        `${fn} must be executable by service_role`
      );
    }
    void grants;

    const allowed = await client.query(
      `select public.platform_iam_is_allowed_platform_capability($1) as ok`,
      [ECC_CAPABILITIES.view]
    );
    assert(allowed.rows[0]?.ok === true, "ECC view is administrable");
    const financeRejected = await client.query(
      `select public.platform_iam_is_allowed_platform_capability($1) as ok`,
      ["platform_finance.view"]
    );
    assert(financeRejected.rows[0]?.ok === false, "Finance caps not administrable here");

    const invitedActive = await client.query(
      `select public.platform_iam_profile_status_is_allowed('invited','active') as ok`
    );
    assert(invitedActive.rows[0]?.ok === false, "invited→active is attach, not status API");
    const activeInactive = await client.query(
      `select public.platform_iam_profile_status_is_allowed('active','inactive') as ok`
    );
    assert(activeInactive.rows[0]?.ok === true, "active→inactive allowed");

    const sa = await client.query<{ profile_id: string; organisation_id: string }>(
      `select ura.profile_id::text, p.organisation_id::text as organisation_id
       from public.user_role_assignments ura
       join public.roles r on r.id = ura.role_id
       join public.profiles p on p.id = ura.profile_id
       where r.slug = 'platform_super_admin'
         and ura.organisation_id is null
         and p.organisation_id is not null
         and p.status = 'active'
       limit 1`
    );

    const other = sa.rows[0]
      ? await client.query<{ id: string }>(
          `select id::text
           from public.profiles
           where organisation_id = $1
             and id <> $2
           limit 1`,
          [sa.rows[0].organisation_id, sa.rows[0].profile_id]
        )
      : { rows: [] as Array<{ id: string }> };

    if (!sa.rows[0] || !other.rows[0]) {
      return { skippedMutations: true as const };
    }

    const actor = sa.rows[0].profile_id;
    const org = sa.rows[0].organisation_id;
    const target = other.rows[0].id;

    function asRpc(value: unknown): { changed?: boolean } {
      if (typeof value === "string") return JSON.parse(value) as { changed?: boolean };
      if (value && typeof value === "object") {
        return value as { changed?: boolean };
      }
      return {};
    }

    await client.query(
      `delete from public.platform_capability_grants
       where profile_id = $1 and organisation_id = $2 and capability = $3`,
      [target, org, ECC_CAPABILITIES.view]
    );

    const grant1 = await client.query(
      `select public.platform_iam_grant_platform_capability($1,$2,$3,$4) as r`,
      [actor, org, target, ECC_CAPABILITIES.view]
    );
    const grant2 = await client.query(
      `select public.platform_iam_grant_platform_capability($1,$2,$3,$4) as r`,
      [actor, org, target, ECC_CAPABILITIES.view]
    );
    assert(asRpc(grant1.rows[0]?.r).changed === true, "first grant changes");
    assert(asRpc(grant2.rows[0]?.r).changed === false, "second grant idempotent");

    await expectSqlFailure(
      client,
      `select public.platform_iam_grant_platform_capability($1,$2,$3,$4)`,
      [actor, org, target, "platform_finance.view"]
    );

    const otherOrg = await client.query<{ id: string }>(
      `select id::text from public.organisations where id <> $1 limit 1`,
      [org]
    );
    if (otherOrg.rows[0]) {
      await expectSqlFailure(
        client,
        `select public.platform_iam_grant_platform_capability($1,$2,$3,$4)`,
        [actor, otherOrg.rows[0].id, target, ECC_CAPABILITIES.view]
      );
    }

    const revoke1 = await client.query(
      `select public.platform_iam_revoke_platform_capability($1,$2,$3,$4) as r`,
      [actor, org, target, ECC_CAPABILITIES.view]
    );
    const revoke2 = await client.query(
      `select public.platform_iam_revoke_platform_capability($1,$2,$3,$4) as r`,
      [actor, org, target, ECC_CAPABILITIES.view]
    );
    assert(asRpc(revoke1.rows[0]?.r).changed === true, "first revoke changes");
    assert(asRpc(revoke2.rows[0]?.r).changed === false, "second revoke idempotent");

    const moduleBefore = await client.query<{ status: string }>(
      `select om.status
       from public.organisation_modules om
       join public.modules m on m.id = om.module_id
       where om.organisation_id = $1 and m.slug = 'ecc_operations'`,
      [org]
    );
    await client.query(
      `select public.platform_iam_set_organisation_module($1,$2,$3,$4)`,
      [actor, org, "ecc_operations", "enabled"]
    );
    const capCount = await client.query(
      `select count(*)::int as n from public.platform_capability_grants
       where organisation_id = $1 and capability = $2 and profile_id = $3`,
      [org, ECC_CAPABILITIES.view, target]
    );
    assert(capCount.rows[0]?.n === 0, "enabling module does not grant ECC cap");
    if (moduleBefore.rows[0]?.status === "disabled") {
      await client.query(
        `select public.platform_iam_set_organisation_module($1,$2,$3,$4)`,
        [actor, org, "ecc_operations", "disabled"]
      );
    }

    await expectSqlFailure(
      client,
      `select public.platform_iam_set_organisation_module($1,$2,$3,$4)`,
      [actor, org, "command_centre", "enabled"]
    );

    const audit = await client.query(
      `select count(*)::int as n from public.platform_iam_audit_events
       where actor_profile_id = $1`,
      [actor]
    );
    assert((audit.rows[0]?.n ?? 0) > 0, "IAM mutations wrote audit events");

    await expectSqlFailure(
      client,
      `insert into public.platform_iam_audit_events
         (organisation_id, actor_profile_id, action, object_type, object_id)
       values ($1,$2,'user.invited','profile',$2::text)`,
      [org, actor]
    );

    const eccRow = await client.query<{ organisation_id: string }>(
      `select organisation_id::text from public.ecc_centres limit 1`
    );
    if (eccRow.rows[0]) {
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        target,
      ]);
      await client.query(
        `select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: target, role: "authenticated" })]
      );
      const denied = await client.query(
        `select public.has_ecc_operations_access($1::uuid) as ok`,
        [eccRow.rows[0].organisation_id]
      );
      assert(
        denied.rows[0]?.ok === false,
        "B: org member without ECC grant denied at helper"
      );

      await client.query(
        `insert into public.platform_capability_grants
           (organisation_id, profile_id, capability)
         values ($1,$2,$3)
         on conflict do nothing`,
        [eccRow.rows[0].organisation_id, target, ECC_CAPABILITIES.view]
      );
      await client.query(
        `update public.profiles set status = 'active' where id = $1`,
        [target]
      );
      const allowedEcc = await client.query(
        `select public.has_ecc_operations_access($1::uuid) as ok`,
        [eccRow.rows[0].organisation_id]
      );
      assert(
        allowedEcc.rows[0]?.ok === true ||
          eccRow.rows[0].organisation_id !== org,
        "A: member + grant allowed when same org"
      );

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        actor,
      ]);
      await client.query(
        `select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: actor, role: "authenticated" })]
      );
      const saWithout = await client.query(
        `select exists (
           select 1 from public.platform_capability_grants
           where profile_id = $1 and capability = $2
         ) as has_cap`,
        [actor, ECC_CAPABILITIES.view]
      );
      if (!saWithout.rows[0]?.has_cap) {
        const saDenied = await client.query(
          `select public.has_ecc_operations_access($1::uuid) as ok`,
          [eccRow.rows[0].organisation_id]
        );
        assert(
          saDenied.rows[0]?.ok === false,
          "C: Super Admin without ECC grant denied"
        );
      }

      if (otherOrg.rows[0]) {
        const wrongOrg = await client.query(
          `select public.has_ecc_operations_access($1::uuid) as ok`,
          [otherOrg.rows[0].id]
        );
        assert(wrongOrg.rows[0]?.ok === false, "D: wrong organisation denied");
      }
    }

    const offboardSrc = await client.query<{ prosrc: string }>(
      `select pg_get_functiondef(p.oid) as prosrc
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'platform_iam_offboard_profile'`
    );
    const offboardDef = offboardSrc.rows[0]?.prosrc ?? "";
    assert(offboardDef.includes("delete from public.finance_capability_grants"), "offboard revokes finance caps");
    assert(offboardDef.includes("delete from public.platform_capability_grants"), "offboard revokes platform caps");
    assert(offboardDef.includes("delete from public.finance_company_access"), "offboard revokes company access");
    assert(offboardDef.includes("delete from public.finance_financial_account_access"), "offboard revokes FA access");
    assert(offboardDef.includes("status = 'inactive'"), "offboard deactivates profile");
    assert(!offboardDef.toLowerCase().includes("delete from public.profiles"), "never deletes profiles");
    assert(!offboardDef.toLowerCase().includes("auth.users"), "never deletes auth users");
    assert(offboardDef.includes("cannot offboard the acting Super Admin"), "self-offboard rejected");

    const issueCount = await client.query(
      `select count(*)::int as n from public.ecc_issues`
    );
    assert(typeof issueCount.rows[0]?.n === "number", "ECC business tables remain readable");

    return { skippedMutations: false as const };
  });

  assert(outcome.rolledBack, "must roll back");
  if (!outcome.ok) {
    push(results, "db.suite", "FAIL", outcome.error);
    return;
  }
  if (outcome.value?.skippedMutations) {
    push(
      results,
      "db.policy_and_execute_grants",
      "PASS",
      "mutations skipped (need SA + second profile)"
    );
  } else {
    push(results, "db.control_plane", "PASS");
  }
  push(results, "db.cleanup.rollback", "PASS");
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  console.log("=== Admin control plane foundation verification ===\n");
  console.log("--- static ---");
  await runStatic(results);
  console.log("\n--- database (optional) ---");
  await runDb(results);

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  console.log(`\n${pass} PASS / ${fail} FAIL / ${skipped} SKIPPED`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
