/**
 * Reconcile every ACTIVE Facility Manager with the canonical Facility Manager operating package
 * (src/lib/access/facilityManagerPackage.ts) through the canonical IAM mechanism: the audited, idempotent
 * platform_iam_grant_platform_capability RPC, via PlatformAdminServerService — the same path as the Admin Console.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/reconcile-facility-manager-package.mts \
 *     --actor=<super-admin profile uuid>            # read-only report (default)
 *   ... --actor=<uuid> --apply                      # grant the missing package capabilities (audited)
 *
 * Only capabilities the package defines are ever granted; protected authority is never touched. Nothing is revoked.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const p = resolve(".env.local");
  if (!existsSync(p)) return;
  for (const l of readFileSync(p, "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

async function main() {
  loadEnvLocal();
  const actor = arg("actor");
  if (!actor) throw new Error("--actor=<super-admin profile uuid> is required (the audit actor)");
  const apply = process.argv.includes("--apply");
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const { PlatformAdminServerService } = await import("../src/modules/platform-admin/server/PlatformAdminServerService");
  const { FACILITY_MANAGER_OPERATING_PACKAGE } = await import("../src/lib/access/facilityManagerPackage");
  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organisations").select("id, slug").eq("status", "active");
  const organisationId = arg("organisation") ?? ((orgs ?? []).length === 1 ? String((orgs![0] as { id: string }).id) : undefined);
  if (!organisationId) throw new Error("--organisation=<uuid> is required when there is more than one active organisation");
  const service = new PlatformAdminServerService();
  const report = await service.reconcileFacilityManagerPackages({ actorProfileId: actor } as never, { organisationId, apply });
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "REPORT (read-only)", package: FACILITY_MANAGER_OPERATING_PACKAGE, facilityManagers: report.map((r) => ({ profile: r.profileId.slice(0, 8), missing: r.missing, granted: r.granted })) }, null, 2));
}
main().catch((e) => { console.error("FAIL", e instanceof Error ? e.message : e); process.exit(1); });
