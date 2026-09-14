import { createAdminClient } from "@/utils/supabase/admin";
import { nowIso } from "@/modules/ecc-operations/domain/rules";
import { newEccId } from "@/modules/ecc-operations/ids";
import type {
  EccAuditEntityType,
  EccAuditEvent,
  EccAuditListFilter,
  EccRecordAuditEventInput,
} from "@/modules/ecc-operations/types";

type AuditRow = {
  organisation_id: string;
  id: string;
  centre_id: string | null;
  actor_user_id: string | null;
  actor_name: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  description: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function db() {
  return createAdminClient();
}

function throwDb(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message?.trim() || fallback);
}

function rowToDto(row: AuditRow): EccAuditEvent {
  return {
    id: row.id,
    centreId: row.centre_id ?? undefined,
    actorUserId: row.actor_user_id ?? undefined,
    actorName: row.actor_name,
    actorEmail: row.actor_email ?? undefined,
    action: row.action,
    entityType: row.entity_type as EccAuditEntityType,
    entityId: row.entity_id,
    description: row.description,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  };
}

/**
 * Append-only ECC audit persistence. Writes occur only from server-side
 * after successful domain mutations — never from client-claimed events alone.
 */
export class EccAuditRepository {
  constructor(private readonly organisationId: string) {}

  async record(input: EccRecordAuditEventInput): Promise<EccAuditEvent> {
    const stamp = nowIso();
    const event: EccAuditEvent = {
      id: newEccId("ECC-AUD"),
      centreId: input.centreId,
      actorUserId: input.actorUserId,
      actorName: input.actorName.trim() || "System",
      actorEmail: input.actorEmail,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      description: input.description.trim(),
      metadata: input.metadata ?? {},
      createdAt: stamp,
    };
    if (!event.description) {
      throw new Error("Audit description is required.");
    }

    const { error } = await db().from("ecc_audit_events").insert({
      organisation_id: this.organisationId,
      id: event.id,
      centre_id: event.centreId ?? null,
      actor_user_id: event.actorUserId ?? null,
      actor_name: event.actorName,
      actor_email: event.actorEmail ?? null,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId,
      description: event.description,
      metadata: event.metadata,
      created_at: event.createdAt,
    });
    if (error) throwDb(error, "Failed to record audit event.");
    return event;
  }

  async listForEntity(
    entityType: EccAuditEntityType,
    entityId: string,
    limit = 50
  ): Promise<EccAuditEvent[]> {
    const { data, error } = await db()
      .from("ecc_audit_events")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throwDb(error, "Failed to load entity audit trail.");
    return ((data as AuditRow[] | null) ?? []).map(rowToDto);
  }

  async list(filter: EccAuditListFilter = {}): Promise<EccAuditEvent[]> {
    const limit = filter.limit ?? 40;
    let query = db()
      .from("ecc_audit_events")
      .select("*")
      .eq("organisation_id", this.organisationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (filter.centreId) {
      query = query.eq("centre_id", filter.centreId);
    }
    if (filter.entityType) {
      query = query.eq("entity_type", filter.entityType);
    }
    if (filter.entityId) {
      query = query.eq("entity_id", filter.entityId);
    }
    if (filter.action) {
      query = query.eq("action", filter.action);
    }

    const { data, error } = await query;
    if (error) throwDb(error, "Failed to list audit events.");
    return ((data as AuditRow[] | null) ?? []).map(rowToDto);
  }
}
