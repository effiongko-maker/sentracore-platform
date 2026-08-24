import { getPlatformSession } from "@/lib/auth/session";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";
import { ActionError } from "./errors";
import { createActionAuthz } from "./authz";
import type { ActionContext, ActionDepartment, PlatformModuleSlug } from "./types";
import { requireModule } from "./moduleAccess";

/**
 * Resolve authenticated ActionContext from the current session.
 * Never trusts client-supplied userId / organisationId.
 */
export async function resolveActionContext(options: {
  module: PlatformModuleSlug;
  departmentId?: string | null;
}): Promise<ActionContext> {
  const session = await getPlatformSession();

  if (!session) {
    throw new ActionError("UNAUTHENTICATED");
  }

  if (!session.profile) {
    throw new ActionError("PROFILE_NOT_FOUND");
  }

  if (
    session.profile.status === "suspended" ||
    session.profile.status === "inactive"
  ) {
    throw new ActionError("FORBIDDEN");
  }

  if (!session.organisation) {
    throw new ActionError("ORGANISATION_NOT_FOUND");
  }

  if (session.organisation.status !== "active") {
    throw new ActionError("ORGANISATION_INACTIVE");
  }

  const module = requireModule(session.enabledModules, options.module);
  const authz = createActionAuthz(
    session.roleAssignments,
    session.organisation.id
  );

  const department = await resolveDepartmentContext({
    organisationId: session.organisation.id,
    departmentId: options.departmentId ?? null,
  });

  return {
    userId: session.userId,
    email: session.email,
    profile: session.profile,
    organisation: session.organisation,
    roleAssignments: session.roleAssignments,
    roleSlugs: session.roleSlugs,
    enabledModules: session.enabledModules,
    department,
    module,
    authz,
    now: new Date().toISOString(),
  };
}

async function resolveDepartmentContext(options: {
  organisationId: string;
  departmentId: string | null;
}): Promise<ActionDepartment | null> {
  if (!options.departmentId) return null;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data, error } = await supabase
    .from("departments")
    .select("id, organisation_id, name, slug, status")
    .eq("id", options.departmentId)
    .maybeSingle();

  if (error || !data) {
    throw new ActionError("DEPARTMENT_ACCESS_DENIED");
  }

  if (String(data.organisation_id) !== options.organisationId) {
    throw new ActionError("DEPARTMENT_ACCESS_DENIED");
  }

  // Org membership already established via session.organisation.
  // Finer department-scoped ACL can tighten here later via authz.hasDepartmentRole.

  return {
    id: String(data.id),
    organisationId: String(data.organisation_id),
    name: String(data.name),
    slug: String(data.slug),
    status: String(data.status),
  };
}
