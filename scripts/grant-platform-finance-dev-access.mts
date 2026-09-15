/**
 * Idempotent Platform Finance access grants for PayChex org owners / platform
 * super admins — uses existing finance_capability_grants + finance_company_access.
 *
 * Does not hard-code profile UUIDs. Does not alter auth architecture.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/grant-platform-finance-dev-access.mts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";

const ORG_SLUG = "paychex";
const ROLE_SLUGS = ["organisation_owner", "platform_super_admin"] as const;

/** Minimum for Overview; not a blanket grant to every user. */
const CAPABILITIES = [PLATFORM_FINANCE_CAPABILITIES.view] as const;

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

async function main() {
  const { data: org, error: orgErr } = await admin
    .from("organisations")
    .select("id, slug, name")
    .eq("slug", ORG_SLUG)
    .maybeSingle();
  if (orgErr) throw orgErr;
  if (!org) {
    console.error(`Organisation slug=${ORG_SLUG} not found`);
    process.exit(1);
  }

  const { data: roles, error: rolesErr } = await admin
    .from("roles")
    .select("id, slug")
    .in("slug", [...ROLE_SLUGS]);
  if (rolesErr) throw rolesErr;
  const roleIds = (roles ?? []).map((r) => r.id);
  if (roleIds.length === 0) {
    console.error("No matching roles found");
    process.exit(1);
  }

  const roleById = new Map((roles ?? []).map((r) => [r.id, r.slug]));

  const { data: profilesInOrg, error: profilesErr } = await admin
    .from("profiles")
    .select("id, full_name, organisation_id")
    .eq("organisation_id", org.id);
  if (profilesErr) throw profilesErr;

  const candidateIds = (profilesInOrg ?? []).map((p) => p.id);
  if (candidateIds.length === 0) {
    console.error(`No profiles in org ${ORG_SLUG}`);
    process.exit(1);
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
    if (
      slug === "organisation_owner" &&
      a.organisation_id === org.id
    ) {
      eligible.add(a.profile_id);
    }
    if (slug === "platform_super_admin" && a.organisation_id == null) {
      eligible.add(a.profile_id);
    }
  }

  const profileIds = [...eligible];
  if (profileIds.length === 0) {
    console.error(
      `No profiles with roles ${ROLE_SLUGS.join(", ")} in org ${ORG_SLUG}`
    );
    process.exit(1);
  }

  const profiles = (profilesInOrg ?? []).filter((p) =>
    eligible.has(p.id)
  );

  const { data: companies, error: companiesErr } = await admin
    .from("finance_companies")
    .select("id, code, name")
    .eq("organisation_id", org.id)
    .eq("status", "active");
  if (companiesErr) throw companiesErr;
  if (!companies?.length) {
    console.error("No active finance companies for org");
    process.exit(1);
  }

  let capInserted = 0;
  let companyInserted = 0;

  for (const profileId of profileIds) {
    for (const capability of CAPABILITIES) {
      const { error } = await admin.from("finance_capability_grants").upsert(
        {
          organisation_id: org.id,
          profile_id: profileId,
          capability,
        },
        {
          onConflict: "profile_id,organisation_id,capability",
          ignoreDuplicates: true,
        }
      );
      if (error) throw error;
      capInserted += 1;
    }

    for (const company of companies) {
      const { error } = await admin.from("finance_company_access").upsert(
        {
          organisation_id: org.id,
          profile_id: profileId,
          company_id: company.id,
        },
        {
          onConflict: "profile_id,company_id",
          ignoreDuplicates: true,
        }
      );
      if (error) throw error;
      companyInserted += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        org: { id: org.id, slug: org.slug },
        profiles: (profiles ?? []).map((p) => ({
          id: p.id,
          full_name: p.full_name,
        })),
        capabilities: CAPABILITIES,
        companyCount: companies.length,
        companyCodes: companies.map((c) => c.code),
        upsertAttempts: {
          capabilityRows: capInserted,
          companyAccessRows: companyInserted,
        },
      },
      null,
      2
    )
  );

  // Verify intended primary user has view
  for (const profileId of profileIds) {
    const { data: viewGrant } = await admin
      .from("finance_capability_grants")
      .select("id, capability")
      .eq("organisation_id", org.id)
      .eq("profile_id", profileId)
      .eq("capability", PLATFORM_FINANCE_CAPABILITIES.view)
      .maybeSingle();
    const { count: companyAccessCount } = await admin
      .from("finance_company_access")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", org.id)
      .eq("profile_id", profileId);

    console.log(
      `verify profile=${profileId}: view=${Boolean(viewGrant)} companies=${companyAccessCount ?? 0}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
