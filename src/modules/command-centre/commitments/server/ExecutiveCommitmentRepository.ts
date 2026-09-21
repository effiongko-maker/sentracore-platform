import "server-only";
import { ActionError } from "@/lib/actions/errors";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  CommitmentRecord,
  CommitmentStatus,
} from "@/modules/command-centre/commitments/domain";

type Row = {
  id: string;
  title: string;
  description: string | null;
  created_by_profile_id: string;
  assignee_profile_id: string;
  due_date: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
};

const COLUMNS =
  "id, title, description, created_by_profile_id, assignee_profile_id, due_date, status, completed_at, created_at";

function toRecord(row: Row): CommitmentRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    createdByProfileId: row.created_by_profile_id,
    assigneeProfileId: row.assignee_profile_id,
    dueDate: row.due_date,
    status: row.status as CommitmentStatus,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

function mapRpcError(error: { code?: string; message?: string }): never {
  const message = (error.message ?? "").replace(/^executive_commitments:\s*/, "").trim();
  if (error.code === "42501") throw new ActionError("FORBIDDEN", message || "Not permitted.");
  if (error.code === "22023" || error.code === "P0002") {
    throw new ActionError("VALIDATION_ERROR", message || "Invalid commitment.");
  }
  throw new ActionError("INTERNAL_ERROR", "The commitment could not be saved.");
}

/**
 * Executive Commitments persistence. Reads are organisation-scoped and limited to commitments
 * the actor created or owns. Every mutation goes through the atomic SQL RPCs (mutation + audit
 * event); the tables accept no direct writes, not even from the service role.
 */
export class ExecutiveCommitmentRepository {
  constructor(private readonly organisationId: string) {}

  async listForProfile(
    profileId: string,
    options: { completedSince: string; completedLimit: number }
  ): Promise<CommitmentRecord[]> {
    const db = createAdminClient();
    const party = `created_by_profile_id.eq.${profileId},assignee_profile_id.eq.${profileId}`;
    const [open, completed] = await Promise.all([
      db
        .from("executive_commitments")
        .select(COLUMNS)
        .eq("organisation_id", this.organisationId)
        .eq("status", "open")
        .or(party)
        .limit(200),
      db
        .from("executive_commitments")
        .select(COLUMNS)
        .eq("organisation_id", this.organisationId)
        .eq("status", "completed")
        .gte("completed_at", options.completedSince)
        .or(party)
        .order("completed_at", { ascending: false })
        .limit(options.completedLimit),
    ]);
    if (open.error) throw new Error("Failed to read commitments.");
    if (completed.error) throw new Error("Failed to read completed commitments.");
    return [...(open.data as Row[]), ...(completed.data as Row[])].map(toRecord);
  }

  async profileNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    const names = new Map<string, string>();
    if (unique.length === 0) return names;
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .eq("organisation_id", this.organisationId)
      .in("id", unique);
    if (error) throw new Error("Failed to read people.");
    for (const p of data ?? []) {
      const name =
        (p.full_name as string | null)?.trim() ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      names.set(String(p.id), name || "Unnamed person");
    }
    return names;
  }

  /** Active members of this organisation only — the canonical assignee pool. */
  async listAssignablePeople(): Promise<Array<{ profileId: string; name: string }>> {
    const { data, error } = await createAdminClient()
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .eq("organisation_id", this.organisationId)
      .eq("status", "active");
    if (error) throw new Error("Failed to read people.");
    return (data ?? [])
      .map((p) => ({
        profileId: String(p.id),
        name:
          (p.full_name as string | null)?.trim() ||
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
          "Unnamed person",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async rpc(name: string, args: Record<string, unknown>): Promise<CommitmentRecord & { changed: boolean }> {
    const { data, error } = await createAdminClient().rpc(name, args);
    if (error) mapRpcError(error);
    const payload = data as { commitment: Row; changed: boolean } | null;
    if (!payload?.commitment) throw new ActionError("INTERNAL_ERROR", "The commitment could not be saved.");
    return { ...toRecord(payload.commitment), changed: Boolean(payload.changed) };
  }

  create(actorProfileId: string, input: { title: string; description: string | null; assigneeProfileId: string; dueDate: string | null }) {
    return this.rpc("executive_commitment_create", {
      p_actor_profile_id: actorProfileId,
      p_organisation_id: this.organisationId,
      p_title: input.title,
      p_description: input.description,
      p_assignee_profile_id: input.assigneeProfileId,
      p_due_date: input.dueDate,
    });
  }

  update(actorProfileId: string, id: string, changes: Record<string, unknown>) {
    return this.rpc("executive_commitment_update", {
      p_actor_profile_id: actorProfileId,
      p_organisation_id: this.organisationId,
      p_commitment_id: id,
      p_changes: changes,
    });
  }

  close(actorProfileId: string, id: string, outcome: "completed" | "cancelled") {
    return this.rpc("executive_commitment_close", {
      p_actor_profile_id: actorProfileId,
      p_organisation_id: this.organisationId,
      p_commitment_id: id,
      p_outcome: outcome,
    });
  }
}
