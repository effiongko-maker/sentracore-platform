import "server-only";
import { ActionError } from "@/lib/actions/errors";
import { organisationLocalDate } from "@/lib/time/organisationTime";
import {
  isCalendarDate,
  isUuid,
  partitionCommitments,
  validateCommitmentInput,
  type CommitmentInput,
} from "@/modules/command-centre/commitments/domain";
import { ExecutiveCommitmentRepository } from "@/modules/command-centre/commitments/server/ExecutiveCommitmentRepository";

const COMPLETED_WINDOW_DAYS = 14;
const COMPLETED_LIMIT = 3;

export class ExecutiveCommitmentsService {
  private readonly repo: ExecutiveCommitmentRepository;

  constructor(
    organisationId: string,
    private readonly actorProfileId: string,
    private readonly timeZone: string
  ) {
    this.repo = new ExecutiveCommitmentRepository(organisationId);
  }

  /** Register for the acting executive: what they created/delegated and what they own. */
  async loadRegister(now: Date = new Date()) {
    const today = organisationLocalDate(now, this.timeZone);
    const completedSince = new Date(now.getTime() - COMPLETED_WINDOW_DAYS * 86_400_000).toISOString();
    const records = await this.repo.listForProfile(this.actorProfileId, {
      completedSince,
      completedLimit: COMPLETED_LIMIT,
    });
    const names = await this.repo.profileNames(
      records.flatMap((r) => [r.createdByProfileId, r.assigneeProfileId])
    );
    const parts = partitionCommitments(records, names, today);
    return { today, ...parts, completed: parts.completed.slice(0, COMPLETED_LIMIT) };
  }

  listAssignablePeople() {
    return this.repo.listAssignablePeople();
  }

  create(input: Partial<CommitmentInput>) {
    const checked = validateCommitmentInput(input);
    if (!checked.ok) throw new ActionError("VALIDATION_ERROR", checked.message);
    return this.repo.create(this.actorProfileId, checked.value);
  }

  update(id: unknown, changes: Partial<CommitmentInput>) {
    if (!isUuid(id)) throw new ActionError("VALIDATION_ERROR", "Commitment not found.");
    const patch: Record<string, unknown> = {};
    if (changes.title !== undefined) {
      const title = typeof changes.title === "string" ? changes.title.trim() : "";
      if (!title) throw new ActionError("VALIDATION_ERROR", "A title is required.");
      patch.title = title;
    }
    if (changes.description !== undefined) patch.description = changes.description ?? null;
    if (changes.assigneeProfileId !== undefined) {
      if (!isUuid(changes.assigneeProfileId)) throw new ActionError("VALIDATION_ERROR", "Choose who owns this commitment.");
      patch.assigneeProfileId = changes.assigneeProfileId;
    }
    if (changes.dueDate !== undefined) {
      const due = changes.dueDate === "" ? null : changes.dueDate;
      if (due !== null && !isCalendarDate(due)) throw new ActionError("VALIDATION_ERROR", "Due date must be a valid date.");
      patch.dueDate = due;
    }
    if (Object.keys(patch).length === 0) throw new ActionError("VALIDATION_ERROR", "Nothing to change.");
    return this.repo.update(this.actorProfileId, id, patch);
  }

  complete(id: unknown) {
    if (!isUuid(id)) throw new ActionError("VALIDATION_ERROR", "Commitment not found.");
    return this.repo.close(this.actorProfileId, id, "completed");
  }

  cancel(id: unknown) {
    if (!isUuid(id)) throw new ActionError("VALIDATION_ERROR", "Commitment not found.");
    return this.repo.close(this.actorProfileId, id, "cancelled");
  }
}
