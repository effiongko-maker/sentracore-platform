import "server-only";
import { ActionError } from "@/lib/actions/errors";
import { isNoteId, validateNoteInput, type NoteInput } from "@/modules/private-office/notes/domain";
import { PrivateOfficeNotesRepository } from "@/modules/private-office/notes/server/PrivateOfficeNotesRepository";
import type { PrivateOfficeAccessContext } from "@/modules/private-office/server/requirePrivateOfficeAccess";

/**
 * Private notes for the authenticated Private Office user. The actor is always the session behind
 * `requirePrivateOfficeAccess()`; clients never supply an owner or organisation. Note activity and
 * content are deliberately NOT written to any audit, event or reporting stream.
 */
export class PrivateOfficeNotesService {
  private readonly repo: PrivateOfficeNotesRepository;

  constructor(access: Pick<PrivateOfficeAccessContext, "organisationId" | "profileId">) {
    this.repo = new PrivateOfficeNotesRepository({
      organisationId: access.organisationId,
      profileId: access.profileId,
    });
  }

  list() {
    return this.repo.listMine();
  }

  create(input: NoteInput) {
    const checked = validateNoteInput(input, { requireTitle: true });
    if (!checked.ok) throw new ActionError("VALIDATION_ERROR", checked.message);
    return this.repo.create({ title: checked.value.title!, body: checked.value.body ?? "" });
  }

  update(id: unknown, input: NoteInput) {
    if (!isNoteId(id)) throw new ActionError("VALIDATION_ERROR", "Note not found.");
    const checked = validateNoteInput(input, { requireTitle: false });
    if (!checked.ok) throw new ActionError("VALIDATION_ERROR", checked.message);
    return this.repo.update(id, checked.value);
  }

  remove(id: unknown) {
    if (!isNoteId(id)) throw new ActionError("VALIDATION_ERROR", "Note not found.");
    return this.repo.remove(id);
  }
}
