import "server-only";
import { ActionError } from "@/lib/actions/errors";
import type { ProfileStatus } from "@/lib/auth/types";
import { createAdminClient } from "@/utils/supabase/admin";
import { CAPABILITY_DOMAINS } from "../capabilityCatalog";
import {
  AUDIT_ACTIONS_BY_CATEGORY,
  describeAuditEvent,
  type AuditCategory,
} from "../auditDescribe";
import type {
  AdminAuditEntry,
  AdminAuditPage,
  AdminFacilityAssignment,
  AdminModuleRecord,
  AdminOverview,
  AdminPersonDetail,
  AdminPersonSummary,
  OrganisationModuleAdminStatus,
} from "../types";

type AdminClient = ReturnType<typeof createAdminClient>;

const PROFILE_STATUSES: ProfileStatus[] = ["active", "invited", "inactive", "suspended"];
const AUDIT_PAGE = 30;

function fail(message: string): never {
  // A failed read is an error — never an empty result.
  throw new ActionError("INTERNAL_ERROR", message);
}
function must<T>(result: { data: T | null; error: { message?: string } | null }, message: string): T {
  if (result.error) {
    console.error("[AdminConsoleReader]", message, result.error.message);
    fail(message);
  }
  return (result.data ?? ([] as unknown)) as T;
}
const asRec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const one = (v: unknown): Record<string, unknown> => (Array.isArray(v) ? asRec(v[0]) : asRec(v));

async function authEmails(admin: AdminClient, ids: string[]): Promise<Map<string, string | null>> {
  const emails = new Map<string, string | null>();
  await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) fail("Unable to resolve identity email addresses.");
      emails.set(id, data.user?.email ?? null);
    })
  );
  return emails;
}

export class AdminConsoleReader {
  constructor(private readonly admin: AdminClient = createAdminClient()) {}

  private async organisation(organisationId: string) {
    const { data, error } = await this.admin.from("organisations").select("id, name, slug, status").eq("id", organisationId).maybeSingle();
    if (error) fail("Unable to load the organisation.");
    if (!data) throw new ActionError("VALIDATION_ERROR", "Organisation not found.");
    return data as { id: string; name: string; slug: string; status: string };
  }

  // -------------------------------------------------------------- people

  private async peopleRows(organisationId: string, profileId?: string) {
    let query = this.admin
      .from("profiles")
      .select("id, first_name, last_name, full_name, job_title, organisation_id, status, created_at")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: true });
    if (profileId) query = query.eq("id", profileId);
    return must(await query, "Unable to load people.") as Array<Record<string, unknown>>;
  }

  private async assemble(organisationId: string, orgName: string, rows: Array<Record<string, unknown>>): Promise<AdminPersonSummary[]> {
    const ids = rows.map((r) => String(r.id));
    if (ids.length === 0) return [];
    const [caps, financeCaps, financeCompanies, roles, assignments, emails] = await Promise.all([
      this.admin.from("platform_capability_grants").select("profile_id, capability").eq("organisation_id", organisationId).in("profile_id", ids),
      this.admin.from("finance_capability_grants").select("profile_id").eq("organisation_id", organisationId).in("profile_id", ids),
      this.admin.from("finance_company_access").select("profile_id").eq("organisation_id", organisationId).in("profile_id", ids),
      this.admin.from("user_role_assignments").select("profile_id, organisation_id, roles ( slug )").in("profile_id", ids),
      this.admin
        .from("fm_facility_assignments")
        .select("id, profile_id, facility_id, operational_role, status, fm_facilities ( name )")
        .eq("organisation_id", organisationId)
        .in("profile_id", ids)
        .order("created_at", { ascending: true }),
      authEmails(this.admin, ids),
    ]);
    const capRows = must(caps, "Unable to resolve access grants.") as Array<Record<string, unknown>>;
    const finRows = must(financeCaps, "Unable to resolve finance access.") as Array<Record<string, unknown>>;
    const finCompanyRows = must(financeCompanies, "Unable to resolve finance access.") as Array<Record<string, unknown>>;
    const roleRows = must(roles, "Unable to resolve platform roles.") as Array<Record<string, unknown>>;
    const asgRows = must(assignments, "Unable to resolve facility assignments.") as Array<Record<string, unknown>>;

    const capsBy = new Map<string, string[]>();
    for (const r of capRows) capsBy.set(String(r.profile_id), [...(capsBy.get(String(r.profile_id)) ?? []), String(r.capability)]);
    const finBy = new Set<string>([...finRows, ...finCompanyRows].map((r) => String(r.profile_id)));
    const superAdmins = new Set<string>();
    for (const r of roleRows) {
      if (r.organisation_id == null && String(one(r.roles).slug) === "platform_super_admin") superAdmins.add(String(r.profile_id));
    }
    const asgBy = new Map<string, AdminFacilityAssignment[]>();
    for (const r of asgRows) {
      const list = asgBy.get(String(r.profile_id)) ?? [];
      list.push({
        assignmentId: String(r.id),
        facilityId: String(r.facility_id),
        facilityName: String(one(r.fm_facilities).name ?? "Unknown facility"),
        operationalRole: String(r.operational_role),
        status: String(r.status) === "active" ? "active" : "inactive",
      });
      asgBy.set(String(r.profile_id), list);
    }

    return rows.map((r) => {
      const id = String(r.id);
      return {
        profileId: id,
        fullName: r.full_name ? String(r.full_name) : ([r.first_name, r.last_name].filter(Boolean).join(" ") || null),
        email: emails.get(id) ?? null,
        jobTitle: r.job_title ? String(r.job_title) : null,
        status: String(r.status) as ProfileStatus,
        organisationId: organisationId,
        organisationName: orgName,
        isPlatformSuperAdmin: superAdmins.has(id),
        capabilities: (capsBy.get(id) ?? []).sort(),
        financeAccessPresent: finBy.has(id),
        facilityAssignments: asgBy.get(id) ?? [],
      };
    });
  }

  async listPeople(organisationId: string): Promise<AdminPersonSummary[]> {
    const org = await this.organisation(organisationId);
    return this.assemble(organisationId, org.name, await this.peopleRows(organisationId));
  }

  async getPerson(organisationId: string, profileId: string): Promise<AdminPersonDetail> {
    const org = await this.organisation(organisationId);
    const rows = await this.peopleRows(organisationId, profileId);
    if (rows.length === 0) throw new ActionError("PROFILE_NOT_FOUND");
    const [summary] = await this.assemble(organisationId, org.name, rows);
    const [roleRows, finCaps, finCompanies, finAccounts, links] = await Promise.all([
      this.admin.from("user_role_assignments").select("organisation_id, roles ( slug, name )").eq("profile_id", profileId),
      this.admin.from("finance_capability_grants").select("capability").eq("organisation_id", organisationId).eq("profile_id", profileId),
      this.admin.from("finance_company_access").select("finance_companies ( name )").eq("organisation_id", organisationId).eq("profile_id", profileId),
      this.admin.from("finance_financial_account_access").select("id", { count: "exact", head: true }).eq("profile_id", profileId),
      this.admin.from("operational_identity_links").select("identity_domain, external_identity_id, status").eq("organisation_id", organisationId).eq("profile_id", profileId).maybeSingle(),
    ]);
    const roles = must(roleRows, "Unable to resolve roles.") as Array<Record<string, unknown>>;
    if (finAccounts.error) fail("Unable to resolve finance access.");
    if (links.error) fail("Unable to resolve identity links.");
    const link = links.data as { identity_domain: string; external_identity_id: string; status: string } | null;
    return {
      ...summary,
      organisationRoles: roles
        .filter((r) => r.organisation_id != null)
        .map((r) => String(one(r.roles).name ?? one(r.roles).slug))
        .sort(),
      financeAccess: {
        capabilities: (must(finCaps, "Unable to resolve finance access.") as Array<Record<string, unknown>>).map((r) => String(r.capability)).sort(),
        companies: (must(finCompanies, "Unable to resolve finance access.") as Array<Record<string, unknown>>).map((r) => String(one(r.finance_companies).name ?? "Company")).sort(),
        financialAccountAccessCount: finAccounts.count ?? 0,
      },
      operationalIdentity: link ? { domain: link.identity_domain, externalIdentityId: link.external_identity_id, status: link.status } : null,
    };
  }

  // ---------------------------------------------------------- facilities

  /** Facility choices for operating-context assignment (read-only reference). */
  async listFacilities(organisationId: string): Promise<Array<{ id: string; name: string; status: string }>> {
    await this.organisation(organisationId);
    const rows = must(
      await this.admin.from("fm_facilities").select("id, name, status").eq("organisation_id", organisationId).order("name"),
      "Unable to load facilities."
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), status: String(r.status) }));
  }

  // ------------------------------------------------------------- modules

  async listModules(organisationId: string): Promise<AdminModuleRecord[]> {
    await this.organisation(organisationId);
    const [catalog, rows, caps] = await Promise.all([
      this.admin.from("modules").select("id, name, slug, description, status").eq("status", "active").order("name"),
      this.admin.from("organisation_modules").select("status, modules ( slug )").eq("organisation_id", organisationId),
      this.admin.from("platform_capability_grants").select("profile_id, capability").eq("organisation_id", organisationId),
    ]);
    const catalogRows = must(catalog, "Unable to load the module catalogue.") as Array<Record<string, unknown>>;
    const orgRows = must(rows, "Unable to load organisation modules.") as Array<Record<string, unknown>>;
    const capRows = must(caps, "Unable to resolve access grants.") as Array<Record<string, unknown>>;
    const statusBy = new Map<string, OrganisationModuleAdminStatus>();
    for (const r of orgRows) statusBy.set(String(one(r.modules).slug), String(r.status) as OrganisationModuleAdminStatus);

    const domainModule = new Map<string, string | null>();
    for (const d of CAPABILITY_DOMAINS) for (const c of d.capabilities) domainModule.set(c.key, d.moduleSlug);
    return catalogRows.map((m) => {
      const slug = String(m.slug);
      const holds = slug === "facility_management" || slug === "ecc_operations";
      const people = new Set(capRows.filter((c) => domainModule.get(String(c.capability)) === slug).map((c) => String(c.profile_id)));
      return {
        slug,
        name: String(m.name),
        description: m.description ? String(m.description) : null,
        status: statusBy.get(slug) ?? "disabled",
        peopleWithGrants: holds ? people.size : null,
      };
    });
  }

  // --------------------------------------------------------------- audit

  private async resolveAuditNames(events: Array<Record<string, unknown>>) {
    const profileIds = new Set<string>();
    const facilityIds = new Set<string>();
    const moduleSlugs = new Set<string>();
    for (const e of events) {
      const d = asRec(e.details);
      profileIds.add(String(e.actor_profile_id));
      if (e.object_type === "profile") profileIds.add(String(e.object_id));
      if (d.profileId) profileIds.add(String(d.profileId));
      if (d.facilityId) facilityIds.add(String(d.facilityId));
      if (d.previousFacilityId) facilityIds.add(String(d.previousFacilityId));
      if (d.moduleSlug) moduleSlugs.add(String(d.moduleSlug));
    }
    const [profiles, facilities, modules] = await Promise.all([
      profileIds.size ? this.admin.from("profiles").select("id, full_name, first_name, last_name").in("id", [...profileIds]) : Promise.resolve({ data: [], error: null }),
      facilityIds.size ? this.admin.from("fm_facilities").select("id, name").in("id", [...facilityIds]) : Promise.resolve({ data: [], error: null }),
      moduleSlugs.size ? this.admin.from("modules").select("slug, name").in("slug", [...moduleSlugs]) : Promise.resolve({ data: [], error: null }),
    ]);
    const pRows = must(profiles as never, "Unable to resolve audit names.") as Array<Record<string, unknown>>;
    const fRows = must(facilities as never, "Unable to resolve audit names.") as Array<Record<string, unknown>>;
    const mRows = must(modules as never, "Unable to resolve audit names.") as Array<Record<string, unknown>>;
    return {
      person: new Map(pRows.map((p) => [String(p.id), (p.full_name ? String(p.full_name) : [p.first_name, p.last_name].filter(Boolean).join(" ")) || "Unnamed person"])),
      facility: new Map(fRows.map((f) => [String(f.id), String(f.name)])),
      module: new Map(mRows.map((m) => [String(m.slug), String(m.name)])),
    };
  }

  private async entries(events: Array<Record<string, unknown>>): Promise<AdminAuditEntry[]> {
    if (events.length === 0) return [];
    const names = await this.resolveAuditNames(events);
    return events.map((e) => {
      const d = asRec(e.details);
      const personId = e.object_type === "profile" ? String(e.object_id) : d.profileId ? String(d.profileId) : null;
      const actorName = names.person.get(String(e.actor_profile_id)) ?? "Unknown actor";
      const personName = personId ? names.person.get(personId) ?? null : null;
      const desc = describeAuditEvent(String(e.action), d, {
        actor: actorName,
        person: personName,
        facility: d.facilityId ? names.facility.get(String(d.facilityId)) ?? null : null,
        previousFacility: d.previousFacilityId ? names.facility.get(String(d.previousFacilityId)) ?? null : null,
        moduleName: d.moduleSlug ? names.module.get(String(d.moduleSlug)) ?? null : null,
      });
      return {
        id: String(e.id),
        at: String(e.created_at),
        action: String(e.action),
        category: desc.category,
        actor: { profileId: String(e.actor_profile_id), name: actorName },
        person: personId ? { profileId: personId, name: personName ?? "Unresolved person" } : null,
        headline: desc.headline,
        detail: desc.detail,
      };
    });
  }

  async listAudit(input: {
    organisationId: string;
    category?: AuditCategory;
    profileId?: string;
    before?: string;
    limit?: number;
  }): Promise<AdminAuditPage> {
    await this.organisation(input.organisationId);
    const limit = Math.min(Math.max(input.limit ?? AUDIT_PAGE, 1), 100);
    let query = this.admin
      .from("platform_iam_audit_events")
      .select("id, organisation_id, actor_profile_id, action, object_type, object_id, details, created_at")
      .eq("organisation_id", input.organisationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (input.category) query = query.in("action", AUDIT_ACTIONS_BY_CATEGORY[input.category]);
    if (input.profileId) {
      query = query.or(`actor_profile_id.eq.${input.profileId},object_id.eq.${input.profileId},details->>profileId.eq.${input.profileId}`);
    }
    if (input.before) query = query.lt("created_at", input.before);
    const rows = must(await query, "Unable to load administrative history.") as Array<Record<string, unknown>>;
    const page = rows.slice(0, limit);
    return {
      events: await this.entries(page),
      nextBefore: rows.length > limit ? String(page[page.length - 1].created_at) : null,
    };
  }

  // ------------------------------------------------------------ overview

  async overview(organisationId: string): Promise<AdminOverview> {
    const org = await this.organisation(organisationId);
    const [modules, people, audit] = await Promise.all([
      this.listModules(organisationId),
      this.listPeople(organisationId),
      this.listAudit({ organisationId, limit: 8 }),
    ]);
    const peopleByStatus = Object.fromEntries(PROFILE_STATUSES.map((s) => [s, 0])) as Record<ProfileStatus, number>;
    for (const p of people) peopleByStatus[p.status] += 1;
    return {
      organisation: org,
      modules: modules.map((m) => ({ slug: m.slug, name: m.name, description: m.description, status: m.status })),
      peopleByStatus,
      peopleTotal: people.length,
      activeWithoutGrants: people.filter((p) => p.status === "active" && !p.isPlatformSuperAdmin && p.capabilities.length === 0).length,
      recentAudit: audit.events,
    };
  }
}
