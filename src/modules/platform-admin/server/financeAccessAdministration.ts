import "server-only";
import { ActionError } from "@/lib/actions/errors";
import { PLATFORM_FINANCE_CAPABILITIES } from "@/modules/platform-finance/types";
import type { createAdminClient } from "@/utils/supabase/admin";
import {
  PLATFORM_FINANCE_ACCESS_MANAGE,
  type FinanceAccessEditor,
  type FinanceAccessUpdateResult,
} from "../types";

export type { FinanceAccessEditor, FinanceAccessUpdateResult };

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Admin Console administration of another person's Platform Finance access.
 *
 * Authority: the actor's explicit control-plane grant platform_finance.access.manage (platform_capability_grants).
 * It is never inferred from Super Admin, platform.admin_override or Finance company membership, and it gives the
 * administrator no Platform Finance entry or Finance data — this module reads only the target's access rows and the
 * organisation's company names, and writes only through the audited finance_iam_* database functions.
 */

/** The ordinary Platform Finance capabilities offered for a person (access.manage is control-plane, never here). */
export const FINANCE_ACCESS_ASSIGNABLE_CAPABILITIES: readonly string[] = Object.values(PLATFORM_FINANCE_CAPABILITIES);

/** Explicit grant only — read directly from platform_capability_grants (no accessCan / override shortcut). */
export async function actorCanAdministerFinanceAccess(
  admin: AdminClient,
  organisationId: string,
  actorProfileId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from("platform_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", actorProfileId)
    .eq("capability", PLATFORM_FINANCE_ACCESS_MANAGE)
    .maybeSingle();
  if (error) throw new ActionError("INTERNAL_ERROR", "Unable to verify Finance access administration authority.");
  return Boolean(data);
}

async function readTargetAccess(admin: AdminClient, organisationId: string, profileId: string) {
  const [caps, companies] = await Promise.all([
    admin.from("finance_capability_grants").select("capability").eq("organisation_id", organisationId).eq("profile_id", profileId),
    admin.from("finance_company_access").select("company_id").eq("organisation_id", organisationId).eq("profile_id", profileId),
  ]);
  if (caps.error || companies.error) throw new ActionError("INTERNAL_ERROR", "Unable to read the person's Finance access.");
  return {
    capabilities: (caps.data ?? []).map((r) => String((r as { capability: string }).capability)),
    companyIds: (companies.data ?? []).map((r) => String((r as { company_id: string }).company_id)),
  };
}

async function readOrganisationCompanies(admin: AdminClient, organisationId: string) {
  const { data, error } = await admin
    .from("finance_companies")
    .select("id, name")
    .eq("organisation_id", organisationId)
    .order("name", { ascending: true });
  if (error) throw new ActionError("INTERNAL_ERROR", "Unable to read Finance companies.");
  return (data ?? []).map((r) => ({ id: String((r as { id: string }).id), name: String((r as { name: string }).name) }));
}

/** Target must be an active member of the organisation, and never the administrator themselves. */
function targetRefusal(
  target: { organisation_id: string | null; status: string } | null,
  organisationId: string,
  actorProfileId: string,
  profileId: string
): string | null {
  if (profileId === actorProfileId) return "You cannot change your own Finance access.";
  if (!target || target.organisation_id !== organisationId) return "This person is not a member of the organisation.";
  if (target.status !== "active") return "Finance access can only be changed for active accounts.";
  return null;
}

export async function loadFinanceAccessEditor(
  admin: AdminClient,
  input: {
    organisationId: string;
    profileId: string;
    actorProfileId: string;
    target: { organisation_id: string | null; status: string } | null;
  }
): Promise<FinanceAccessEditor> {
  if (!(await actorCanAdministerFinanceAccess(admin, input.organisationId, input.actorProfileId))) {
    // Not an administrator of Finance access: the read-only summary stays; no editor data is exposed.
    return { canManage: false, reason: null };
  }
  const refusal = targetRefusal(input.target, input.organisationId, input.actorProfileId, input.profileId);
  if (refusal) return { canManage: false, reason: refusal };
  const [companies, current] = await Promise.all([
    readOrganisationCompanies(admin, input.organisationId),
    readTargetAccess(admin, input.organisationId, input.profileId),
  ]);
  return {
    canManage: true,
    companies,
    selectedCompanyIds: current.companyIds,
    selectedCapabilities: current.capabilities.filter((c) => FINANCE_ACCESS_ASSIGNABLE_CAPABILITIES.includes(c)),
    assignableCapabilities: [...FINANCE_ACCESS_ASSIGNABLE_CAPABILITIES],
  };
}

function rpcMessage(error: { message?: string } | null): string {
  const text = error?.message ?? "";
  const match = text.match(/finance_iam: ([^\n]+)/);
  return match ? match[1]!.replace(/^./, (c) => c.toUpperCase()) : "The Finance access change could not be saved.";
}

/** Persist only the differences, each through its audited database function. */
export async function updateFinanceAccess(
  admin: AdminClient,
  input: {
    organisationId: string;
    profileId: string;
    actorProfileId: string;
    target: { organisation_id: string | null; status: string } | null;
    companyIds: unknown;
    capabilities: unknown;
  }
): Promise<FinanceAccessUpdateResult> {
  if (!(await actorCanAdministerFinanceAccess(admin, input.organisationId, input.actorProfileId))) {
    throw new ActionError("FORBIDDEN", "Administering Platform Finance access requires platform_finance.access.manage.");
  }
  const refusal = targetRefusal(input.target, input.organisationId, input.actorProfileId, input.profileId);
  if (refusal) throw new ActionError("VALIDATION_ERROR", refusal);

  const wantedCompanies = [...new Set(Array.isArray(input.companyIds) ? input.companyIds.map(String) : [])];
  const wantedCapabilities = [...new Set(Array.isArray(input.capabilities) ? input.capabilities.map(String) : [])];
  for (const capability of wantedCapabilities) {
    if (!FINANCE_ACCESS_ASSIGNABLE_CAPABILITIES.includes(capability)) {
      throw new ActionError("VALIDATION_ERROR", "A requested capability is not an assignable Platform Finance capability.");
    }
  }
  const organisationCompanyIds = new Set((await readOrganisationCompanies(admin, input.organisationId)).map((c) => c.id));
  for (const companyId of wantedCompanies) {
    if (!organisationCompanyIds.has(companyId)) {
      throw new ActionError("VALIDATION_ERROR", "A requested company is not a Finance company of this organisation.");
    }
  }

  const current = await readTargetAccess(admin, input.organisationId, input.profileId);
  const companiesToGrant = wantedCompanies.filter((id) => !current.companyIds.includes(id));
  const companiesToRevoke = current.companyIds.filter((id) => !wantedCompanies.includes(id));
  // Only ordinary Finance capabilities are managed here; anything else the person holds is left untouched.
  const managedCurrent = current.capabilities.filter((c) => FINANCE_ACCESS_ASSIGNABLE_CAPABILITIES.includes(c));
  const capabilitiesToGrant = wantedCapabilities.filter((c) => !managedCurrent.includes(c));
  const capabilitiesToRevoke = managedCurrent.filter((c) => !wantedCapabilities.includes(c));

  const base = {
    p_actor_profile_id: input.actorProfileId,
    p_organisation_id: input.organisationId,
    p_target_profile_id: input.profileId,
  };
  let granted = 0;
  let revoked = 0;
  const run = async (fn: string, args: Record<string, unknown>, bucket: "granted" | "revoked") => {
    const { data, error } = await admin.rpc(fn, { ...base, ...args });
    if (error) throw new ActionError("VALIDATION_ERROR", rpcMessage(error));
    if (data === true) {
      if (bucket === "granted") granted += 1;
      else revoked += 1;
    }
  };
  // Grants first (company scope before capabilities), then revokes (capabilities before company scope).
  for (const companyId of companiesToGrant) await run("finance_iam_grant_company_access", { p_company_id: companyId }, "granted");
  for (const capability of capabilitiesToGrant) await run("finance_iam_grant_capability", { p_capability: capability }, "granted");
  for (const capability of capabilitiesToRevoke) await run("finance_iam_revoke_capability", { p_capability: capability }, "revoked");
  for (const companyId of companiesToRevoke) await run("finance_iam_revoke_company_access", { p_company_id: companyId }, "revoked");

  const after = await readTargetAccess(admin, input.organisationId, input.profileId);
  return {
    granted,
    revoked,
    selectedCompanyIds: after.companyIds,
    selectedCapabilities: after.capabilities.filter((c) => FINANCE_ACCESS_ASSIGNABLE_CAPABILITIES.includes(c)),
  };
}
