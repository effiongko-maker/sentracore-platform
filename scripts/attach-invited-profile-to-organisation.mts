/**
 * Attach an invited SentraCore identity to an organisation (membership only).
 *
 * Does NOT grant FM / ECC / Finance / Command Centre capabilities.
 * FM workspace entry continues to use organisation_modules enablement.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/attach-invited-profile-to-organisation.mts \
 *     --email chiamaka.uzoukwu@paychexng.com --org paychex
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and that migration
 * 20260916124500_attach_invited_profile_to_organisation.sql has been applied.
 */
import { createClient } from "@supabase/supabase-js";

function arg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const email = (arg("--email") ?? "").trim().toLowerCase();
  const orgSlug = (arg("--org") ?? "paychex").trim().toLowerCase();
  const fullName = arg("--full-name");
  const firstName = arg("--first-name");
  const lastName = arg("--last-name");

  if (!email) {
    throw new Error("--email is required");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("attach_invited_profile_to_organisation", {
    p_email: email,
    p_organisation_slug: orgSlug,
    p_full_name: fullName,
    p_first_name: firstName,
    p_last_name: lastName,
  });

  if (error) {
    throw new Error(error.message);
  }

  console.log(JSON.stringify({ ok: true, result: data }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
