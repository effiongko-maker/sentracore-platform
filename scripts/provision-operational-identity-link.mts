/**
 * Service-controlled provisioning for profile -> FM People identity links.
 * Validates the profile/org in Supabase and the USR id in the Sheets register
 * before invoking the service-role-only RPC. It grants no authorization.
 *
 * npx tsx --tsconfig tsconfig.json scripts/provision-operational-identity-link.mts \
 *   --profile-email person@example.com --org paychex --fm-user-id USR-0002 [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const value = line.trim();
    if (!value || value.startsWith("#") || !value.includes("=")) continue;
    const separator = value.indexOf("=");
    const key = value.slice(0, separator).trim();
    const envValue = value
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) process.env[key] = envValue;
  }
}

loadEnvLocal();

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

function extractUserRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (!payload || typeof payload !== "object") return [];
  const page = payload as Record<string, unknown>;
  if (Array.isArray(page.data)) {
    return page.data as Array<Record<string, unknown>>;
  }
  if (page.data && typeof page.data === "object") {
    const inner = page.data as Record<string, unknown>;
    if (Array.isArray(inner.data)) {
      return inner.data as Array<Record<string, unknown>>;
    }
  }
  return [];
}

async function main() {
  const profileEmail = (arg("--profile-email") ?? "").trim().toLowerCase();
  const organisationSlug = (arg("--org") ?? "").trim().toLowerCase();
  const externalIdentityId = (arg("--fm-user-id") ?? "").trim().toUpperCase();
  const linkedByEmail = arg("--linked-by-email")?.trim().toLowerCase() ?? null;
  const dryRun = process.argv.includes("--dry-run");
  if (!profileEmail || !organisationSlug || !/^USR-\d{4,}$/.test(externalIdentityId)) {
    throw new Error("--profile-email, --org and a valid --fm-user-id (USR-####) are required");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  const { postToAppsScriptData } = await import("../src/services/api/appsScriptProxy");
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: organisation, error: organisationError } = await admin
    .from("organisations").select("id, slug").eq("slug", organisationSlug).single();
  if (organisationError || !organisation) throw new Error("Organisation not found");

  const findProfile = async (email: string) => {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = data.users.find((user) => user.email?.toLowerCase() === email);
    if (!authUser) return null;
    const { data: profile } = await admin.from("profiles")
      .select("id, organisation_id").eq("id", authUser.id).maybeSingle();
    return profile;
  };
  const profile = await findProfile(profileEmail);
  if (!profile || profile.organisation_id !== organisation.id) {
    throw new Error("Profile is not attached to the requested organisation");
  }
  const linkedBy = linkedByEmail ? await findProfile(linkedByEmail) : null;
  if (linkedByEmail && (!linkedBy || linkedBy.organisation_id !== organisation.id)) {
    throw new Error("Linking profile is not attached to the requested organisation");
  }

  const usersPage = await postToAppsScriptData(
    {
      resource: "users",
      action: "getAll",
      payload: {
        page: 1,
        pageSize: 500,
        search: externalIdentityId,
        status: "all",
      },
    },
    { resource: "users", action: "getAll" },
    "provision-operational-identity"
  );
  const sheetUser = extractUserRows(usersPage).find((row) => {
    const returnedId = String(row.id ?? row["User ID"] ?? "")
      .trim()
      .toUpperCase();
    return returnedId === externalIdentityId;
  });
  if (!sheetUser) throw new Error("FM People identity was not found");

  const validatedExternalIdentityId = String(
    sheetUser.id ?? sheetUser["User ID"] ?? ""
  )
    .trim()
    .toUpperCase();
  if (validatedExternalIdentityId !== externalIdentityId) {
    throw new Error("FM People identity validation returned a different record");
  }

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          dryRun: true,
          profileId: profile.id,
          organisationId: organisation.id,
          identityDomain: "facility_management",
          externalIdentityId: validatedExternalIdentityId,
          peopleStatus: sheetUser.status ?? sheetUser.Status ?? null,
          rpcInvoked: false,
        },
        null,
        2
      )
    );
    return;
  }

  const { data, error } = await admin.rpc("provision_operational_identity_link", {
    p_profile_id: profile.id,
    p_organisation_id: organisation.id,
    p_identity_domain: "facility_management",
    p_external_identity_id: validatedExternalIdentityId,
    p_linked_by_profile_id: linkedBy?.id ?? null,
    p_status: "active",
  });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({ ok: true, link: data }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
