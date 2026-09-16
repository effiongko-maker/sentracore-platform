/**
 * Idempotent Platform developer / QA access grants.
 *
 * Explicit capability + company grants via the existing tables:
 *   - finance_capability_grants
 *   - finance_company_access
 *   - platform_capability_grants
 *
 * Does NOT:
 *   - hard-code emails into application authorization
 *   - bypass server capability / company checks
 *   - redefine Super Admin / CEO semantics
 *   - invent capability strings
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/grant-platform-developer-access.mts
 *   npx tsx --tsconfig tsconfig.json scripts/grant-platform-developer-access.mts --org=paychex
 *   npx tsx --tsconfig tsconfig.json scripts/grant-platform-developer-access.mts --email=you@example.com
 *   npx tsx --tsconfig tsconfig.json scripts/grant-platform-developer-access.mts --profile-id=<uuid>
 *
 * Default recipients (when no --email / --profile-id):
 *   PayChex organisation_owner + platform_super_admin profiles
 *   (same eligibility model as the prior Finance-only grant script).
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PLATFORM_DEVELOPER_ACCESS_ORG_SLUG,
  PLATFORM_DEVELOPER_ACCESS_ROLE_SLUGS,
  PLATFORM_DEVELOPER_COMMAND_CENTRE_CAPABILITIES,
  PLATFORM_DEVELOPER_FINANCE_CAPABILITIES,
  PLATFORM_DEVELOPER_ACCESS_NOTES,
} from "./lib/platform-developer-access-bundle";

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

function parseArgs(argv: string[]) {
  let orgSlug = PLATFORM_DEVELOPER_ACCESS_ORG_SLUG;
  let email: string | null = null;
  let profileId: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith("--org=")) orgSlug = arg.slice("--org=".length).trim();
    else if (arg.startsWith("--email="))
      email = arg.slice("--email=".length).trim().toLowerCase();
    else if (arg.startsWith("--profile-id="))
      profileId = arg.slice("--profile-id=".length).trim();
  }
  return { orgSlug, email, profileId };
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { orgSlug, email, profileId } = parseArgs(process.argv.slice(2));

async function resolveTargetProfiles(organisationId: string): Promise<
  Array<{ id: string; full_name: string | null }>
> {
  if (profileId) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, organisation_id")
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.organisation_id !== organisationId) {
      throw new Error(
        `Profile ${profileId} not found in organisation ${orgSlug}`
      );
    }
    return [{ id: data.id, full_name: data.full_name }];
  }

  if (email) {
    const { data: usersData, error: usersErr } =
      await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersErr) throw usersErr;
    const authUser = (usersData?.users ?? []).find(
      (u) => u.email?.toLowerCase() === email
    );
    if (!authUser) {
      throw new Error(`No auth user with email=${email}`);
    }
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("id, full_name, organisation_id")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!profile || profile.organisation_id !== organisationId) {
      throw new Error(
        `Profile for ${email} not found in organisation ${orgSlug}`
      );
    }
    return [{ id: profile.id, full_name: profile.full_name }];
  }

  const { data: roles, error: rolesErr } = await admin
    .from("roles")
    .select("id, slug")
    .in("slug", [...PLATFORM_DEVELOPER_ACCESS_ROLE_SLUGS]);
  if (rolesErr) throw rolesErr;
  const roleIds = (roles ?? []).map((r) => r.id);
  if (roleIds.length === 0) {
    throw new Error("No matching developer-access roles found");
  }
  const roleById = new Map((roles ?? []).map((r) => [r.id, r.slug]));

  const { data: profilesInOrg, error: profilesErr } = await admin
    .from("profiles")
    .select("id, full_name, organisation_id")
    .eq("organisation_id", organisationId);
  if (profilesErr) throw profilesErr;
  const candidateIds = (profilesInOrg ?? []).map((p) => p.id);
  if (candidateIds.length === 0) {
    throw new Error(`No profiles in org ${orgSlug}`);
  }

  const { data: assignments, error: assignErr } = await admin
    .from("user_role_assignments")
    .select("profile_id, organisation_id, role_id")
    .in("profile_id", candidateIds)
    .in("role_id", roleIds);
  if (assignErr) throw assignErr;

  const eligible = new Set<string>();
  for (const a of assignments ?? []) {
    const slug = roleById.get(a.role_id);
    if (slug === "organisation_owner" && a.organisation_id === organisationId) {
      eligible.add(a.profile_id);
    }
    if (slug === "platform_super_admin" && a.organisation_id == null) {
      eligible.add(a.profile_id);
    }
  }

  const profiles = (profilesInOrg ?? []).filter((p) => eligible.has(p.id));
  if (profiles.length === 0) {
    throw new Error(
      `No profiles with roles ${PLATFORM_DEVELOPER_ACCESS_ROLE_SLUGS.join(", ")} in org ${orgSlug}. Pass --email= or --profile-id=.`
    );
  }
  return profiles.map((p) => ({ id: p.id, full_name: p.full_name }));
}

async function main() {
  const { data: org, error: orgErr } = await admin
    .from("organisations")
    .select("id, slug, name")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) {
    console.error(`Organisation slug=${orgSlug} not found`);
    process.exit(1);
  }

  const profiles = await resolveTargetProfiles(org.id);

  const { data: companies, error: companiesErr } = await admin
    .from("finance_companies")
    .select("id, code, name, status")
    .eq("organisation_id", org.id)
    .eq("status", "active");
  if (companiesErr) throw companiesErr;
  if (!companies?.length) {
    console.error("No active finance companies for org");
    process.exit(1);
  }

  let financeCapUpserts = 0;
  let companyUpserts = 0;
  let ccCapUpserts = 0;

  for (const profile of profiles) {
    for (const capability of PLATFORM_DEVELOPER_FINANCE_CAPABILITIES) {
      const { error } = await admin.from("finance_capability_grants").upsert(
        {
          organisation_id: org.id,
          profile_id: profile.id,
          capability,
        },
        {
          onConflict: "profile_id,organisation_id,capability",
          ignoreDuplicates: true,
        }
      );
      if (error) throw error;
      financeCapUpserts += 1;
    }

    for (const capability of PLATFORM_DEVELOPER_COMMAND_CENTRE_CAPABILITIES) {
      const { error } = await admin.from("platform_capability_grants").upsert(
        {
          organisation_id: org.id,
          profile_id: profile.id,
          capability,
        },
        {
          onConflict: "profile_id,organisation_id,capability",
          ignoreDuplicates: true,
        }
      );
      if (error) throw error;
      ccCapUpserts += 1;
    }

    for (const company of companies) {
      const { error } = await admin.from("finance_company_access").upsert(
        {
          organisation_id: org.id,
          profile_id: profile.id,
          company_id: company.id,
        },
        {
          onConflict: "profile_id,company_id",
          ignoreDuplicates: true,
        }
      );
      if (error) throw error;
      companyUpserts += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        mechanism: "platform-developer-access-bundle",
        org: { id: org.id, slug: org.slug, name: org.name },
        selection: email
          ? { mode: "email", email }
          : profileId
            ? { mode: "profile-id", profileId }
            : {
                mode: "role-based",
                roles: PLATFORM_DEVELOPER_ACCESS_ROLE_SLUGS,
              },
        profiles: profiles.map((p) => ({
          id: p.id,
          full_name: p.full_name,
        })),
        financeCapabilities: PLATFORM_DEVELOPER_FINANCE_CAPABILITIES,
        commandCentreCapabilities:
          PLATFORM_DEVELOPER_COMMAND_CENTRE_CAPABILITIES,
        companyCount: companies.length,
        companyCodes: companies.map((c) => c.code),
        upsertAttempts: {
          financeCapabilityRows: financeCapUpserts,
          commandCentreCapabilityRows: ccCapUpserts,
          companyAccessRows: companyUpserts,
        },
        notes: PLATFORM_DEVELOPER_ACCESS_NOTES,
      },
      null,
      2
    )
  );

  for (const profile of profiles) {
    const { data: financeGrants, error: fgErr } = await admin
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", org.id)
      .eq("profile_id", profile.id);
    if (fgErr) throw fgErr;
    const financeGranted = new Set(
      (financeGrants ?? []).map((g) => String(g.capability))
    );

    const { data: ccGrants, error: ccErr } = await admin
      .from("platform_capability_grants")
      .select("capability")
      .eq("organisation_id", org.id)
      .eq("profile_id", profile.id);
    if (ccErr) throw ccErr;
    const ccGranted = new Set(
      (ccGrants ?? []).map((g) => String(g.capability))
    );

    const missingFinance = PLATFORM_DEVELOPER_FINANCE_CAPABILITIES.filter(
      (c) => !financeGranted.has(c)
    );
    const missingCc = PLATFORM_DEVELOPER_COMMAND_CENTRE_CAPABILITIES.filter(
      (c) => !ccGranted.has(c)
    );

    const { count: companyAccessCount } = await admin
      .from("finance_company_access")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", org.id)
      .eq("profile_id", profile.id);

    const ok =
      missingFinance.length === 0 &&
      missingCc.length === 0 &&
      (companyAccessCount ?? 0) >= companies.length;

    console.log(
      `verify profile=${profile.id} name=${profile.full_name ?? "?"}: financeMissing=${missingFinance.length} ccMissing=${missingCc.length} companies=${companyAccessCount ?? 0}/${companies.length} ok=${ok}`
    );
    if (!ok) {
      throw new Error(
        `profile ${profile.id} missing developer access: finance=${missingFinance.join(",")} cc=${missingCc.join(",")}`
      );
    }
  }

  console.log("Developer / QA access grant complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
