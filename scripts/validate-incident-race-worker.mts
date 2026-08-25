/**
 * Cross-process race worker for incident→maintenance create.
 * Usage: npx tsx --tsconfig tsconfig.json scripts/validate-incident-race-worker.mts <incidentId>
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ActionContext } from "@/lib/actions/types";
import { orchestrateTriageIncident } from "@/lib/operational/orchestration";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function buildContext(): Promise<ActionContext> {
  const sb = admin();
  const { data: org, error: orgErr } = await sb
    .from("organisations")
    .select("id, name, slug, status")
    .eq("slug", "paychex")
    .maybeSingle();
  if (orgErr || !org) throw new Error(orgErr?.message ?? "org missing");

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select(
      "id, first_name, last_name, full_name, avatar_url, job_title, organisation_id, status"
    )
    .eq("organisation_id", org.id)
    .limit(1)
    .maybeSingle();
  if (profileErr || !profile) {
    throw new Error(profileErr?.message ?? "profile missing");
  }

  const { data: authUserData } = await sb.auth.admin.getUserById(
    String(profile.id)
  );
  const email =
    authUserData.user?.email ?? "validation@sentracore.local";

  const { data: moduleDef, error: moduleErr } = await sb
    .from("modules")
    .select("id, slug")
    .eq("slug", "facility_management")
    .maybeSingle();
  if (moduleErr || !moduleDef) {
    throw new Error(moduleErr?.message ?? "facility_management module missing");
  }

  const { data: orgModule, error: orgModErr } = await sb
    .from("organisation_modules")
    .select("id, organisation_id, module_id, status")
    .eq("organisation_id", org.id)
    .eq("module_id", moduleDef.id)
    .maybeSingle();
  if (orgModErr || !orgModule) {
    throw new Error(orgModErr?.message ?? "org module missing");
  }

  const moduleRow = {
    id: String(orgModule.id),
    moduleId: String(orgModule.module_id),
    slug: "facility_management",
    name: "Facility Management",
    status: "enabled" as const,
  };

  return {
    userId: String(profile.id),
    email,
    profile: {
      id: String(profile.id),
      firstName: profile.first_name ? String(profile.first_name) : null,
      lastName: profile.last_name ? String(profile.last_name) : null,
      fullName: String(profile.full_name ?? "Validation"),
      avatarUrl: profile.avatar_url ? String(profile.avatar_url) : null,
      jobTitle: profile.job_title ? String(profile.job_title) : null,
      organisationId: String(org.id),
      status: String(profile.status) as "active",
    },
    organisation: {
      id: String(org.id),
      name: String(org.name),
      slug: String(org.slug),
      status: String(org.status) as "active",
    },
    roleAssignments: [],
    roleSlugs: ["organisation_owner"],
    enabledModules: [moduleRow as never],
    department: null,
    module: moduleRow as never,
    authz: {
      hasRole: () => true,
      hasPlatformRole: () => true,
      hasOrganisationRole: () => true,
      hasDepartmentRole: () => true,
      isPlatformSuperAdmin: () => true,
    },
    now: new Date().toISOString(),
  };
}

async function main() {
  const incidentId = process.argv[2];
  if (!incidentId) throw new Error("incidentId required");
  const context = await buildContext();
  const started = Date.now();
  const result = await orchestrateTriageIncident({
    input: { incidentId, response: "create_maintenance" },
    context,
  });
  console.log(
    JSON.stringify({
      ok: true,
      maintenanceId: result.maintenance?.id,
      incidentId: result.incident.id,
      incidentMaintenanceIds: result.incident.maintenanceIds ?? [],
      elapsedMs: Date.now() - started,
      pid: process.pid,
    })
  );
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  );
  process.exit(1);
});
