/**
 * Verify PayChex FM workspace entry prerequisites (membership + org module).
 *
 * Confirms the intentional model:
 *   organisation membership + organisation_modules.facility_management enabled
 *   → session.enabledModules includes facility_management
 *   → workspaceAccess.facilityManagement
 *
 * Does NOT require / invent a user-specific FM grant.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-paychex-fm-org-module.mts
 *   VERIFY_FM_EMAIL=chiamaka.uzoukwu@paychexng.com npx tsx ...
 */
import { createClient } from "@supabase/supabase-js";
import { hasModule } from "../src/lib/actions/moduleAccess";
import type { AuthEnabledModule } from "../src/lib/auth/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(url && key, "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");

  const email = (
    process.env.VERIFY_FM_EMAIL ?? "chiamaka.uzoukwu@paychexng.com"
  )
    .trim()
    .toLowerCase();

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: org, error: orgErr } = await admin
    .from("organisations")
    .select("id, name, slug, status")
    .eq("slug", "paychex")
    .maybeSingle();
  assert(!orgErr && org, `PayChex org missing: ${orgErr?.message}`);
  assert(org.status === "active", "PayChex org not active");

  const { data: fmMod, error: fmErr } = await admin
    .from("modules")
    .select("id, slug, status")
    .eq("slug", "facility_management")
    .maybeSingle();
  assert(!fmErr && fmMod, `facility_management catalogue missing: ${fmErr?.message}`);
  assert(fmMod.status === "active", "facility_management catalogue not active");

  const { data: om, error: omErr } = await admin
    .from("organisation_modules")
    .select("id, status, module_id")
    .eq("organisation_id", org.id)
    .eq("module_id", fmMod.id)
    .maybeSingle();
  assert(!omErr && om, `PayChex organisation_modules FM row missing: ${omErr?.message}`);
  assert(om.status === "enabled", "PayChex FM organisation_modules not enabled");

  // Resolve auth user → profile membership (same gate as getPlatformSession).
  let profileId: string | null = null;
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) {
      profileId = match.id;
      break;
    }
    if (data.users.length < 200) break;
  }
  assert(profileId, `Auth user not found for ${email}`);

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, organisation_id, status, full_name")
    .eq("id", profileId)
    .maybeSingle();
  assert(!pErr && profile, `Profile missing for ${email}`);
  assert(
    profile.organisation_id === org.id,
    `${email} organisation_id is ${profile.organisation_id}, expected PayChex ${org.id}`
  );
  assert(profile.status === "active", `${email} profile status is ${profile.status}, expected active`);

  const { data: moduleRows, error: modRowsErr } = await admin
    .from("organisation_modules")
    .select("id, module_id, status, modules(id, name, slug, status)")
    .eq("organisation_id", profile.organisation_id)
    .eq("status", "enabled");
  assert(!modRowsErr, modRowsErr?.message ?? "module query failed");

  const enabledModules: AuthEnabledModule[] = [];
  for (const row of moduleRows ?? []) {
    const modRaw = row.modules as unknown;
    const mod = Array.isArray(modRaw) ? modRaw[0] : modRaw;
    if (!mod || typeof mod !== "object") continue;
    const m = mod as Record<string, unknown>;
    if (String(m.status) !== "active") continue;
    enabledModules.push({
      id: String(row.id),
      moduleId: String(row.module_id),
      slug: String(m.slug),
      name: String(m.name),
      status: "enabled",
    });
  }

  assert(
    hasModule(enabledModules, "facility_management"),
    "enabledModules missing facility_management (session chrome would show No access)"
  );

  console.log("PASS verify-paychex-fm-org-module");
  console.log(`  org=${org.slug} fmCatalogue=active om=enabled`);
  console.log(`  profile=${profile.full_name} status=${profile.status} membership=ok`);
  console.log(
    `  enabledModules=[${enabledModules.map((m) => m.slug).join(", ")}]`
  );
  console.log("  model: FM enterability = org membership + org module (no user FM grant)");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
