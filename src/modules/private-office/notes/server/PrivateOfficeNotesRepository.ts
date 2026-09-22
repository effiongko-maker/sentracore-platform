import "server-only";
import { cookies } from "next/headers";
import { ActionError } from "@/lib/actions/errors";
import { createClient } from "@/utils/supabase/server";
import type { PrivateOfficeNote } from "@/modules/private-office/notes/domain";

/**
 * Private Office private notes persistence — deliberately built to make bulk/administrative access hard.
 *
 *  - Uses ONLY the signed-in user's own session client (never the service-role client): the
 *    database's row-level security is what enforces "owner only". service_role and anon have
 *    no privileges on the table at all.
 *  - There is no method that reads by arbitrary owner, lists across owners, or accepts an owner
 *    argument other than the authenticated actor. Every query additionally pins the actor's
 *    organisation and profile (belt and braces on top of RLS).
 *
 * The underlying table is still named batcave_notes — a pure rename/refactor of the Private Office
 * surface does not touch the physical schema; renaming a live table is a separate, unrequested change.
 */

type Row = { id: string; title: string; body: string; created_at: string; updated_at: string };
const COLUMNS = "id, title, body, created_at, updated_at";

function toNote(row: Row): PrivateOfficeNote {
  return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
}

export type NoteActor = { organisationId: string; profileId: string };

export class PrivateOfficeNotesRepository {
  constructor(private readonly actor: NoteActor) {}

  private async db() {
    return createClient(await cookies());
  }

  /** The acting profile's own notes, newest edit first. */
  async listMine(): Promise<PrivateOfficeNote[]> {
    const { data, error } = await (await this.db())
      .from("batcave_notes")
      .select(COLUMNS)
      .eq("organisation_id", this.actor.organisationId)
      .eq("owner_profile_id", this.actor.profileId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error("Failed to read notes.");
    return (data as Row[]).map(toNote);
  }

  async create(input: { title: string; body: string }): Promise<PrivateOfficeNote> {
    const { data, error } = await (await this.db())
      .from("batcave_notes")
      .insert({
        organisation_id: this.actor.organisationId,
        owner_profile_id: this.actor.profileId,
        title: input.title,
        body: input.body,
      })
      .select(COLUMNS)
      .single();
    if (error || !data) throw new ActionError("INTERNAL_ERROR", "The note could not be saved.");
    return toNote(data as Row);
  }

  async update(id: string, changes: { title?: string; body?: string }): Promise<PrivateOfficeNote> {
    const { data, error } = await (await this.db())
      .from("batcave_notes")
      .update(changes)
      .eq("id", id)
      .eq("organisation_id", this.actor.organisationId)
      .eq("owner_profile_id", this.actor.profileId)
      .select(COLUMNS);
    if (error) throw new ActionError("INTERNAL_ERROR", "The note could not be saved.");
    if (!data || data.length !== 1) throw new ActionError("VALIDATION_ERROR", "Note not found.");
    return toNote(data[0] as Row);
  }

  async remove(id: string): Promise<void> {
    const { data, error } = await (await this.db())
      .from("batcave_notes")
      .delete()
      .eq("id", id)
      .eq("organisation_id", this.actor.organisationId)
      .eq("owner_profile_id", this.actor.profileId)
      .select("id");
    if (error) throw new ActionError("INTERNAL_ERROR", "The note could not be deleted.");
    if (!data || data.length !== 1) throw new ActionError("VALIDATION_ERROR", "Note not found.");
  }
}
