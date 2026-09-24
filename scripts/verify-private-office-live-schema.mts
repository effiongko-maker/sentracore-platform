/**
 * Private Office vault foundation — READ-ONLY live check against the linked Supabase project.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-private-office-live-schema.mts
 *
 * Run before and after applying 20260925010000_private_office_vault_foundation.sql. It writes nothing:
 *   - the RPC probe uses the all-zero UUID actor, which the function refuses before reading or writing anything;
 *   - table probes are LIMIT 0 selects that the migration is expected to refuse (no privilege for service_role);
 *   - the access snapshot counts existing Private Office / Executive Office grants (no identities printed), so the
 *     before/after outputs can be compared to show that applying the migration changed no access state.
 * Private Notes (batcave_notes) cannot be read by service_role by design; it is only probed for continued refusal.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0 && !line.trim().startsWith("#")) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ZERO = "00000000-0000-0000-0000-000000000000";

const load = await db.rpc("private_office_load", { p_owner: ZERO, p_org: ZERO, p_session: ZERO, p_with_records: false });
const applied = load.error?.code !== "PGRST202";
console.log(`migration applied: ${applied ? "yes" : "no"}`);
if (applied) {
  console.log(`  private_office_load(zero actor): ${load.error ? `refused (${load.error.code})` : "UNEXPECTED: returned data"}`);
}
let problems = applied && !load.error ? 1 : 0;
for (const table of ["private_office_activations", "private_office_vaults", "private_office_security_state", "private_office_records"]) {
  const r = await db.from(table).select("owner_profile_id").limit(0);
  const state = r.error?.code === "PGRST205" ? "absent" : r.error?.code === "42501" ? "present, service_role refused" : r.error ? `error ${r.error.code}` : "UNEXPECTEDLY READABLE";
  if (applied && state !== "present, service_role refused") problems += 1;
  console.log(`  ${table}: ${state}`);
}
const notes = await db.from("batcave_notes").select("id").limit(0);
console.log(`  batcave_notes: ${notes.error?.code === "42501" ? "service_role refused (unchanged by design)" : `UNEXPECTED ${notes.error?.code ?? "readable"}`}`);
if (notes.error?.code !== "42501") problems += 1;

const grants = await db.from("platform_capability_grants").select("capability").in("capability", ["platform.executive.private_office.access", "platform.command_centre.view"]);
if (grants.error) {
  console.log(`access snapshot unavailable (${grants.error.code})`);
} else {
  const count = (c: string) => grants.data.filter((g) => g.capability === c).length;
  console.log(`access snapshot: private_office.access grants=${count("platform.executive.private_office.access")} command_centre.view grants=${count("platform.command_centre.view")}`);
}
console.log(problems === 0 ? "LIVE SCHEMA CHECK: OK" : `LIVE SCHEMA CHECK: ${problems} problem(s)`);
process.exit(problems === 0 ? 0 : 1);
