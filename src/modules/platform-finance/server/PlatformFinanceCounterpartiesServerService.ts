import { ActionError } from "@/lib/actions/errors";
import {
  type CounterpartyPartyKind,
  type CounterpartyRole,
  type CounterpartyStatus,
  type OrganisationCounterparty,
  isCounterpartyRole,
} from "@/modules/platform-finance/domain/counterparties";
import { createAdminClient } from "@/utils/supabase/admin";

type Actor = { organisationId: string; profileId: string };

export type CounterpartyCapabilities = {
  view: boolean;
  manage: boolean;
};

export class PlatformFinanceCounterpartiesServerService {
  constructor(private readonly organisationId: string) {}

  async getMyCapabilities(actor: Actor): Promise<CounterpartyCapabilities> {
    const caps = await this.loadCaps(actor.profileId);
    return {
      view: caps.has("platform_finance.counterparty.view") || caps.has("platform_finance.counterparty.manage"),
      manage: caps.has("platform_finance.counterparty.manage"),
    };
  }

  async list(actor: Actor, opts?: { status?: CounterpartyStatus; role?: CounterpartyRole }): Promise<OrganisationCounterparty[]> {
    await this.assertView(actor);
    const admin = createAdminClient();
    let q = admin
      .from("organisation_counterparties")
      .select("id,organisation_id,display_name,legal_name,party_kind,tax_registration_id,status,created_by_profile_id,created_at,updated_at")
      .eq("organisation_id", this.organisationId)
      .order("display_name", { ascending: true });
    if (opts?.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    const ids = (data ?? []).map((r) => r.id as string);
    const rolesById = await this.loadRoles(ids);
    let rows = (data ?? []).map((r) => this.mapRow(r, rolesById.get(r.id as string) ?? []));
    if (opts?.role) rows = rows.filter((r) => r.roles.includes(opts.role!));
    return rows;
  }

  async get(actor: Actor, id: string): Promise<OrganisationCounterparty> {
    await this.assertView(actor);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organisation_counterparties")
      .select("id,organisation_id,display_name,legal_name,party_kind,tax_registration_id,status,created_by_profile_id,created_at,updated_at")
      .eq("organisation_id", this.organisationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    if (!data) throw new ActionError("VALIDATION_ERROR", "Counterparty not found.");
    const rolesById = await this.loadRoles([id]);
    return this.mapRow(data, rolesById.get(id) ?? []);
  }

  async create(
    actor: Actor,
    input: {
      displayName: string;
      legalName?: string | null;
      partyKind?: CounterpartyPartyKind;
      taxRegistrationId?: string | null;
      roles: CounterpartyRole[];
      status?: CounterpartyStatus;
    }
  ): Promise<OrganisationCounterparty> {
    await this.assertManage(actor);
    const displayName = input.displayName.trim();
    if (!displayName) throw new ActionError("VALIDATION_ERROR", "Display name is required.");
    const roles = this.normalizeRoles(input.roles);
    if (!roles.length) throw new ActionError("VALIDATION_ERROR", "At least one role is required.");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("organisation_counterparty_create", {
      p_actor_profile_id: actor.profileId,
      p_organisation_id: this.organisationId,
      p_display_name: displayName,
      p_legal_name: input.legalName?.trim() || "",
      p_party_kind: input.partyKind ?? "organisation",
      p_tax_registration_id: input.taxRegistrationId?.trim() || "",
      p_status: input.status ?? "active",
      p_roles: roles,
    });
    if (error) {
      if (error.message.toLowerCase().includes("unique")) {
        throw new ActionError("VALIDATION_ERROR", "A counterparty with this display name already exists.");
      }
      throw new ActionError("INTERNAL_ERROR", error.message);
    }
    const id = data as string;
    await this.audit(actor, "finance.counterparty.created", id, { roles });
    return this.get(actor, id);
  }

  async update(
    actor: Actor,
    id: string,
    input: {
      displayName?: string;
      legalName?: string | null;
      partyKind?: CounterpartyPartyKind;
      taxRegistrationId?: string | null;
      status?: CounterpartyStatus;
      roles?: CounterpartyRole[];
    }
  ): Promise<OrganisationCounterparty> {
    await this.assertManage(actor);
    const existing = await this.get(actor, id);
    let displayName = existing.displayName;
    let legalName = existing.legalName;
    let partyKind = existing.partyKind;
    let taxRegistrationId = existing.taxRegistrationId;
    let status = existing.status;
    if (input.displayName !== undefined) {
      const nextDisplayName = input.displayName.trim();
      if (!nextDisplayName) throw new ActionError("VALIDATION_ERROR", "Display name is required.");
      displayName = nextDisplayName;
    }
    if (input.legalName !== undefined) legalName = input.legalName?.trim() || null;
    if (input.partyKind !== undefined) partyKind = input.partyKind;
    if (input.taxRegistrationId !== undefined) {
      taxRegistrationId = input.taxRegistrationId?.trim() || null;
    }
    if (input.status !== undefined) status = input.status;

    const roles = input.roles ? this.normalizeRoles(input.roles) : existing.roles;
    if (!roles.length) throw new ActionError("VALIDATION_ERROR", "At least one role is required.");

    const admin = createAdminClient();
    const { error } = await admin.rpc("organisation_counterparty_update", {
      p_actor_profile_id: actor.profileId,
      p_organisation_id: this.organisationId,
      p_counterparty_id: id,
      p_display_name: displayName,
      p_legal_name: legalName ?? "",
      p_party_kind: partyKind,
      p_tax_registration_id: taxRegistrationId ?? "",
      p_status: status,
      p_roles: roles,
    });
    if (error) {
      if (error.message.toLowerCase().includes("unique")) {
        throw new ActionError("VALIDATION_ERROR", "A counterparty with this display name already exists.");
      }
      throw new ActionError("INTERNAL_ERROR", error.message);
    }

    await this.audit(actor, "finance.counterparty.updated", id, {
      previousDisplayName: existing.displayName,
      status: input.status ?? existing.status,
    });
    return this.get(actor, id);
  }

  private normalizeRoles(roles: CounterpartyRole[]): CounterpartyRole[] {
    const uniq = new Set<CounterpartyRole>();
    for (const role of roles) {
      if (!isCounterpartyRole(role)) throw new ActionError("VALIDATION_ERROR", `Invalid role: ${role}`);
      uniq.add(role);
    }
    return [...uniq];
  }

  private async loadCaps(profileId: string): Promise<Set<string>> {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId)
      .in("capability", [
        "platform_finance.counterparty.view",
        "platform_finance.counterparty.manage",
        "platform_finance.invoice.view",
        "platform_finance.invoice.create",
        "platform_finance.invoice.review",
        "platform_finance.invoice.issue",
      ]);
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    return new Set((data ?? []).map((r) => r.capability as string));
  }

  private async assertView(actor: Actor) {
    const all = await this.loadCaps(actor.profileId);
    const can =
      all.has("platform_finance.counterparty.view") ||
      all.has("platform_finance.counterparty.manage") ||
      all.has("platform_finance.invoice.view") ||
      all.has("platform_finance.invoice.create") ||
      all.has("platform_finance.invoice.review") ||
      all.has("platform_finance.invoice.issue");
    if (!can) throw new ActionError("FORBIDDEN", "Missing counterparty view authority.");
  }

  private async assertManage(actor: Actor) {
    const caps = await this.getMyCapabilities(actor);
    if (!caps.manage) throw new ActionError("FORBIDDEN", "Missing counterparty manage authority.");
  }

  private async loadRoles(ids: string[]): Promise<Map<string, CounterpartyRole[]>> {
    const map = new Map<string, CounterpartyRole[]>();
    if (!ids.length) return map;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("organisation_counterparty_roles")
      .select("counterparty_id,role")
      .eq("organisation_id", this.organisationId)
      .in("counterparty_id", ids);
    if (error) throw new ActionError("INTERNAL_ERROR", error.message);
    for (const row of data ?? []) {
      const id = row.counterparty_id as string;
      const role = row.role as CounterpartyRole;
      const list = map.get(id) ?? [];
      list.push(role);
      map.set(id, list);
    }
    return map;
  }

  private mapRow(
    row: Record<string, unknown>,
    roles: CounterpartyRole[]
  ): OrganisationCounterparty {
    return {
      id: row.id as string,
      organisationId: row.organisation_id as string,
      displayName: row.display_name as string,
      legalName: (row.legal_name as string | null) ?? null,
      partyKind: row.party_kind as CounterpartyPartyKind,
      taxRegistrationId: (row.tax_registration_id as string | null) ?? null,
      status: row.status as CounterpartyStatus,
      roles,
      createdByProfileId: row.created_by_profile_id as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private async audit(
    actor: Actor,
    action: string,
    objectId: string,
    details?: Record<string, unknown>
  ) {
    const admin = createAdminClient();
    await admin.from("finance_audit_events").insert({
      organisation_id: this.organisationId,
      company_id: null,
      actor_profile_id: actor.profileId,
      action,
      object_type: "organisation_counterparty",
      object_id: objectId,
      details: details ?? {},
    });
  }
}
