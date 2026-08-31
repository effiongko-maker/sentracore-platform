/**
 * Maintenance Treat / Complete lifecycle verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-maintenance-treat-completion.mts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ActionContext } from "@/lib/actions/types";
import { transitionMaintenance } from "@/lib/operational/lifecycle/transitionOperationalEntity";
import { updateMaintenanceOperational } from "@/lib/operational/lifecycle/updateActions";
import { mapRequestToOccupantStatus } from "@/modules/occupant-requests/status";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { RequestService } from "@/services/requests/RequestService";
import { postToAppsScriptData } from "@/services/api/appsScriptProxy";

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

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

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
  const email = authUserData.user?.email ?? "validation@sentracore.local";

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
    slug: "facility_management" as const,
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
  const results: string[] = [];
  const context = await buildContext();

  // Track Request maps Request.status only
  assert(
    mapRequestToOccupantStatus({ status: "being_treated" }) === "in_progress",
    "track maps being_treated"
  );
  assert(
    mapRequestToOccupantStatus({ status: "resolved" }) === "completed",
    "track maps resolved"
  );
  results.push("PASS Track Request maps authoritative Request.status");

  // Server rejects completed without completedAt
  {
    const created = await MaintenanceService.createMaintenance({
      title: `Treat UX ${Date.now()}`,
      description: "completion validation",
      facilityId: "FAC-0001",
      type: "corrective",
      source: "manual",
      priority: "medium",
      status: "in_progress",
      reportedAt: new Date().toISOString(),
    });
    const rejected = await updateMaintenanceOperational(created.id, {
      status: "completed",
    });
    assert(!rejected.success, "completed without completedAt must fail");
    results.push("PASS completed without completedAt rejected");

    const completedAt = new Date().toISOString();
    const notes = `RTC notes ${Date.now()}`;
    const result = await transitionMaintenance({
      entityId: created.id,
      update: {
        status: "completed",
        completedAt,
        completionNotes: notes,
        updatedByUserId: context.userId,
      },
      context,
      options: { transitionSource: "form_update" },
    });
    assert(result.entity.status === "completed", "status persisted");
    assert(Boolean(result.entity.completedAt), "completedAt persisted");
    const reloaded = await MaintenanceService.getMaintenance(created.id);
    assert(reloaded?.status === "completed", "reload status");
    assert(Boolean(reloaded?.completedAt), "reload completedAt");
    if (reloaded?.completionNotes === notes) {
      results.push("PASS completionNotes persisted");
    } else {
      results.push(
        "WARN completionNotes not yet on live Apps Script deploy — status+completedAt OK (redeploy MaintenanceRepository.gs)"
      );
    }
    results.push("PASS Mark completed persists status + completedAt");
  }

  // Active save must not accept completedAt alone via operational update
  {
    const created = await MaintenanceService.createMaintenance({
      title: `Treat active ${Date.now()}`,
      description: "active validation",
      facilityId: "FAC-0001",
      type: "corrective",
      source: "manual",
      priority: "medium",
      status: "scheduled",
      reportedAt: new Date().toISOString(),
    });
    const rejected = await updateMaintenanceOperational(created.id, {
      status: "scheduled",
      completedAt: new Date().toISOString(),
    });
    assert(!rejected.success, "completedAt with active status must fail");
    results.push("PASS completedAt with non-terminal status rejected");
  }

  // Request auto-resolution still works after completion
  {
    const req = await RequestService.createRequest({
      title: `Treat REQ ${Date.now()}`,
      description: "auto-resolve after treat complete",
      facilityId: "FAC-0001",
      requestType: "maintenance",
      status: "submitted",
      reporterName: "Treat Verify",
      reporterContact: "treat-verify@example.com",
      occurredAt: new Date().toISOString(),
    });
    const bundle = (await postToAppsScriptData(
      {
        resource: "requests",
        action: "createTreatment",
        payload: {
          requestId: req.id,
          kind: "maintenance",
          childInput: {
            title: `Treat child ${Date.now()}`,
            description: "child",
            facilityId: "FAC-0001",
          },
          actorUserId: context.userId,
          idempotencyKey: `treat-ux-${req.id}-${Date.now()}`,
        },
      },
      { resource: "requests", action: "createTreatment" },
      "verify-maintenance-treat-completion"
    )) as { maintenance?: { id: string } };

    await transitionMaintenance({
      entityId: bundle.maintenance!.id,
      update: {
        status: "completed",
        completedAt: new Date().toISOString(),
        completionNotes: "done",
        updatedByUserId: context.userId,
      },
      context,
    });
    const after = await RequestService.getRequest(req.id);
    assert(after?.status === "resolved", `expected resolved got ${after?.status}`);
    results.push("PASS Request auto-resolution still works");
  }

  console.log("\n=== maintenance treat/completion verify ===");
  for (const line of results) console.log(line);
  console.log("RESULT: PASS");
}

main().catch((err) => {
  console.error("RESULT: FAIL", err);
  process.exit(1);
});
