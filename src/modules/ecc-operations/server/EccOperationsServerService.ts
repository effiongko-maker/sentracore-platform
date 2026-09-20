import { ECC_DAILY_OPS_SECTION_LABELS } from "@/modules/ecc-operations/constants";
import {
  assertIssueTransition,
  assertRequestTransition,
  issueHistoryKind,
  normalizeSectionInput,
  nowIso,
  requestHistoryKind,
} from "@/modules/ecc-operations/domain/rules";
import {
  deriveOverview,
  deriveReportingSnapshot,
} from "@/modules/ecc-operations/domain/deriveSnapshots";
import { deriveStaffingFromPeople } from "@/modules/ecc-operations/domain/deriveStaffingFromPeople";
import { newEccId } from "@/modules/ecc-operations/ids";
import type {
  EccActorContext,
  EccAppendIssueActionInput,
  EccAppendRequestActionInput,
  EccAuditEntityType,
  EccAuditEvent,
  EccAuditListFilter,
  EccCreateDailyOpsInput,
  EccCreateIssueInput,
  EccCreatePersonInput,
  EccCreateRequestInput,
  EccDailyOpsRecord,
  EccEnsureCurrentShiftInput,
  EccIssue,
  EccIssueHistoryEntry,
  EccLinkIssueRequestInput,
  EccOverviewSnapshot,
  EccPeopleSnapshot,
  EccRaiseIssueFromDailyOpsInput,
  EccRaiseRequestFromDailyOpsInput,
  EccReportingDimension,
  EccReportingSnapshot,
  EccRequest,
  EccRequestHistoryEntry,
  EccSetCurrentShiftAssignmentsInput,
  EccSignInInput,
  EccSignOutInput,
  EccCreateFinanceBudgetInput,
  EccCreateFinanceCommitmentInput,
  EccCreateFinanceTransactionInput,
  EccFinanceCommitmentStatus,
  EccTransitionIssueInput,
  EccTransitionRequestInput,
} from "@/modules/ecc-operations/types";
import { DEFAULT_ECC_CENTRE } from "@/modules/ecc-operations/types";
import { ActionError } from "@/lib/actions/errors";
import {
  assertIanaTimeZone,
  organisationLocalDate,
} from "@/lib/time/organisationTime";
import { EccOperationsRepository } from "./EccOperationsRepository";
import { EccPeopleRepository } from "./EccPeopleRepository";
import { EccFinanceRepository } from "./EccFinanceRepository";
import { EccAuditRepository } from "./EccAuditRepository";
import {
  dailyOpsAlreadySubmittedMessage,
  isDailyOpsPeriodUniqueViolation,
  mapUniqueViolation,
  requireNonEmpty,
  EccConflictError,
} from "./validation";

/**
 * Server-side ECC operations. Enforces transitions, immutability, and org scope.
 * Audit events are recorded only after successful mutations.
 */
export class EccOperationsServerService {
  private readonly repo: EccOperationsRepository;
  private readonly peopleRepo: EccPeopleRepository;
  private readonly financeRepo: EccFinanceRepository;
  private readonly auditRepo: EccAuditRepository;

  constructor(
    private readonly organisationId: string,
    private readonly actor: EccActorContext | null = null,
    /**
     * Authoritative organisation IANA timezone, taken from the authenticated
     * session (no extra query). Null ⇒ operational date semantics fail explicitly.
     */
    private readonly organisationTimeZone: string | null = null,
    /** Clock seam (tests). Production always uses the real instant. */
    private readonly now: () => Date = () => new Date()
  ) {
    this.repo = new EccOperationsRepository(organisationId);
    this.peopleRepo = new EccPeopleRepository(organisationId, organisationTimeZone);
    this.financeRepo = new EccFinanceRepository(organisationId);
    this.auditRepo = new EccAuditRepository(organisationId);
  }

  /**
   * Canonical actor for every ECC write: the authenticated platform profile
   * (UUID) and its current display name. The client never establishes identity.
   */
  private requireActor(): { profileId: string; name: string } {
    const profileId = this.actor?.userId?.trim();
    const name = this.actor?.name?.trim();
    if (!profileId || !name) {
      throw new ActionError(
        "UNAUTHENTICATED",
        "An authenticated actor is required for ECC writes."
      );
    }
    return { profileId, name };
  }

  /** Organisation-local operational date for `instant`. Explicit failure without a valid timezone. */
  private operationalDate(instant: Date = this.now()): string {
    return organisationLocalDate(instant, assertIanaTimeZone(this.organisationTimeZone));
  }

  /** Server-authoritative "today" for the organisation (the browser never decides this). */
  async getOperationalDate(): Promise<{ date: string; timeZone: string }> {
    const timeZone = assertIanaTimeZone(this.organisationTimeZone);
    return { date: organisationLocalDate(this.now(), timeZone), timeZone };
  }

  private actorName(fallback?: string): string {
    return (
      this.actor?.name?.trim() ||
      fallback?.trim() ||
      "Unknown actor"
    );
  }

  /**
   * Best-effort append-only audit write after a successful mutation.
   * Failures are logged and do not roll back the domain write.
   */
  private async audit(input: {
    centreId?: string;
    action: string;
    entityType: EccAuditEntityType;
    entityId: string;
    description: string;
    metadata?: Record<string, unknown>;
    actorNameFallback?: string;
  }): Promise<void> {
    try {
      await this.auditRepo.record({
        centreId: input.centreId,
        actorUserId: this.actor?.userId,
        actorName: this.actorName(input.actorNameFallback),
        actorEmail: this.actor?.email,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        description: input.description,
        metadata: input.metadata,
      });
    } catch (error) {
      console.error("[ecc-audit] failed to record event", {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        error,
      });
    }
  }

  async listAuditEvents(filter: EccAuditListFilter = {}): Promise<EccAuditEvent[]> {
    return this.auditRepo.list(filter);
  }

  async getEntityAuditTrail(
    entityType: EccAuditEntityType,
    entityId: string
  ): Promise<EccAuditEvent[]> {
    return this.auditRepo.listForEntity(entityType, entityId);
  }

  async getFoundationStatus() {
    await this.repo.ensureDefaultCentre();
    return {
      module: "ecc_operations" as const,
      ready: true as const,
      persistence: "supabase" as const,
    };
  }

  async getOverview(centreId = DEFAULT_ECC_CENTRE.id): Promise<EccOverviewSnapshot> {
    const state = await this.repo.loadAggregate(centreId);
    const overview = deriveOverview(state, centreId);
    try {
      const people = await this.peopleRepo.getPeopleSnapshot(centreId);
      const staffing = deriveStaffingFromPeople(people);
      if (staffing) {
        return {
          ...overview,
          staffingStatus: staffing.staffingStatus,
          staffingReadiness: staffing.staffingReadiness,
        };
      }
    } catch (error) {
      // FAILURE IS NOT ZERO: staffing must not silently fall back to (possibly
      // stale) Daily Ops text. Other Overview domains still render.
      console.error("[ecc-overview] people snapshot unavailable", error);
      return {
        ...overview,
        staffingStatus: "unknown",
        staffingReadiness: "Staffing data could not be loaded.",
        staffingSourceUnavailable: true,
      };
    }
    return overview;
  }

  async getPeopleSnapshot(
    centreId = DEFAULT_ECC_CENTRE.id
  ): Promise<EccPeopleSnapshot> {
    await this.repo.ensureDefaultCentre();
    return this.peopleRepo.getPeopleSnapshot(centreId);
  }

  async createPerson(input: EccCreatePersonInput) {
    await this.repo.ensureDefaultCentre();
    requireNonEmpty(input.name, "Name");
    const person = await this.peopleRepo.createPerson(input);
    const roleLabel =
      person.role === "ecc_manager"
        ? "ECC Manager"
        : person.role === "relationship_officer"
          ? "Relationship Officer"
          : "Agent";
    await this.audit({
      centreId: person.centreId,
      action: "person.created",
      entityType: "person",
      entityId: person.id,
      description: `Created ${roleLabel} ${person.name}`,
      metadata: {
        role: person.role,
        name: person.name,
        managementChange:
          person.role === "ecc_manager" ||
          person.role === "relationship_officer",
      },
    });
    return person;
  }

  async setPersonActive(input: { personId: string; active: boolean }) {
    requireNonEmpty(input.personId, "Person");
    const { person, changed } = await this.peopleRepo.setPersonActive(input.personId, Boolean(input.active));
    if (changed) {
      await this.audit({
        centreId: person.centreId,
        action: input.active ? "person.reactivated" : "person.deactivated",
        entityType: "person",
        entityId: person.id,
        description: `${input.active ? "Reactivated" : "Deactivated"} ${person.name}`,
        metadata: { role: person.role, name: person.name, status: person.status },
      });
    }
    return person;
  }

  async ensureCurrentShift(input: EccEnsureCurrentShiftInput) {
    await this.repo.ensureDefaultCentre();
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const previous = await this.peopleRepo.getCurrentShift(centreId);
    const shift = await this.peopleRepo.ensureCurrentShift(input);
    await this.audit({
      centreId: shift.centreId,
      action: previous ? "shift.changed" : "shift.created",
      entityType: "shift",
      entityId: shift.id,
      description: previous
        ? `Replaced current shift with ${shift.label}`
        : `Set current shift ${shift.label}`,
      metadata: {
        previousShiftId: previous?.id ?? null,
        previousLabel: previous?.label ?? null,
        previousAssignedPersonIds: previous?.assignedPersonIds ?? [],
        assignedPersonIds: shift.assignedPersonIds,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
      },
    });
    return shift;
  }

  async setCurrentShiftAssignments(input: EccSetCurrentShiftAssignmentsInput) {
    await this.repo.ensureDefaultCentre();
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const previous = await this.peopleRepo.getCurrentShift(centreId);
    const shift = await this.peopleRepo.setCurrentShiftAssignments(input);
    await this.audit({
      centreId: shift.centreId,
      action: "shift.assignments_changed",
      entityType: "shift",
      entityId: shift.id,
      description: "Updated shift agent assignments",
      metadata: {
        previousAssignedPersonIds: previous?.assignedPersonIds ?? [],
        assignedPersonIds: shift.assignedPersonIds,
      },
    });
    return shift;
  }

  async signInPerson(input: EccSignInInput) {
    const person = await this.peopleRepo.getPerson(input.personId);
    const record = await this.peopleRepo.signIn(input);
    await this.audit({
      centreId: record.centreId,
      action: "attendance.signed_in",
      entityType: "attendance",
      entityId: record.id,
      description: `Signed in ${person?.name ?? input.personId}`,
      metadata: {
        personId: record.personId,
        personName: record.personName,
        shiftId: record.shiftId ?? null,
        status: record.status,
      },
    });
    return record;
  }

  async signOutPerson(input: EccSignOutInput) {
    const person = await this.peopleRepo.getPerson(input.personId);
    const record = await this.peopleRepo.signOut(input);
    await this.audit({
      centreId: record.centreId,
      action: "attendance.signed_out",
      entityType: "attendance",
      entityId: record.id,
      description: `Signed out ${person?.name ?? input.personId}`,
      metadata: {
        personId: record.personId,
        personName: record.personName,
        shiftId: record.shiftId ?? null,
        status: record.status,
      },
    });
    return record;
  }

  async getFinanceSnapshot(centreId = DEFAULT_ECC_CENTRE.id) {
    await this.repo.ensureDefaultCentre();
    return this.financeRepo.getFinanceSnapshot(centreId);
  }

  async setFinanceBudget(input: EccCreateFinanceBudgetInput) {
    await this.repo.ensureDefaultCentre();
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const previous = await this.financeRepo.getActiveBudget(centreId);
    const actor = this.requireActor();
    const budget = await this.financeRepo.setBudget({ ...input, createdBy: actor.name });
    await this.audit({
      centreId: budget.centreId,
      action: previous ? "finance.budget_changed" : "finance.budget_created",
      entityType: "finance_budget",
      entityId: budget.id,
      description: previous
        ? `Changed operational budget for ${budget.periodLabel}`
        : `Created operational budget for ${budget.periodLabel}`,
      metadata: {
        previousBudgetId: previous?.id ?? null,
        previousAmount: previous?.amount ?? null,
        previousCurrency: previous?.currency ?? null,
        amount: budget.amount,
        currency: budget.currency,
        periodLabel: budget.periodLabel,
      },
      actorNameFallback: input.createdBy,
    });
    return budget;
  }

  async createFinanceTransaction(input: EccCreateFinanceTransactionInput) {
    await this.repo.ensureDefaultCentre();
    const actor = this.requireActor();
    const row = await this.financeRepo.createTransaction({ ...input, recordedBy: actor.name });
    await this.audit({
      centreId: row.centreId,
      action: "finance.transaction_recorded",
      entityType: "finance_transaction",
      entityId: row.id,
      description: `Recorded transaction: ${row.description}`,
      metadata: {
        amount: row.amount,
        currency: row.currency,
        category: row.category,
        status: row.status,
        date: row.date,
        reference: row.reference || null,
      },
      actorNameFallback: input.recordedBy,
    });
    return row;
  }

  async createFinanceCommitment(input: EccCreateFinanceCommitmentInput) {
    await this.repo.ensureDefaultCentre();
    const actor = this.requireActor();
    const row = await this.financeRepo.createCommitment({ ...input, recordedBy: actor.name });
    await this.audit({
      centreId: row.centreId,
      action: "finance.commitment_created",
      entityType: "finance_commitment",
      entityId: row.id,
      description: `Created commitment: ${row.description}`,
      metadata: {
        expectedAmount: row.expectedAmount,
        currency: row.currency,
        category: row.category,
        status: row.status,
        dueDate: row.dueDate ?? null,
      },
      actorNameFallback: input.recordedBy,
    });
    return row;
  }

  async updateFinanceCommitmentStatus(input: {
    id: string;
    status: EccFinanceCommitmentStatus;
  }) {
    await this.repo.ensureDefaultCentre();
    const { previous, commitment } =
      await this.financeRepo.updateCommitmentStatus(input.id, input.status);
    await this.audit({
      centreId: commitment.centreId,
      action: "finance.commitment_status_changed",
      entityType: "finance_commitment",
      entityId: commitment.id,
      description: `Commitment status ${previous} → ${commitment.status}`,
      metadata: {
        previousStatus: previous,
        status: commitment.status,
        description: commitment.description,
      },
    });
    return commitment;
  }

  async listDailyOps(centreId = DEFAULT_ECC_CENTRE.id) {
    return this.repo.listDailyOps(centreId);
  }

  async getDailyOps(id: string) {
    return this.repo.getDailyOps(id);
  }

  async createDailyOps(input: EccCreateDailyOpsInput): Promise<EccDailyOpsRecord> {
    const actor = this.requireActor();
    await this.repo.ensureDefaultCentre();
    const stamp = nowIso();
    const centreId = input.centreId ?? DEFAULT_ECC_CENTRE.id;
    const period = input.period;
    // An explicitly chosen (historical) date is honoured; only the DEFAULT is the
    // organisation-local date — never the UTC calendar date.
    const reportingDate = input.reportingDate?.trim() || this.operationalDate();

    // Morning/evening: one snapshot per centre per reporting date (DB unique index).
    // Ad hoc remains unconstrained. Existing rows are immutable — reuse, never rewrite.
    if (period === "morning" || period === "evening") {
      const existing = await this.repo.findDailyOpsByPeriodDate(
        centreId,
        period,
        reportingDate
      );
      // Never discard the new input silently, never overwrite the immutable record.
      if (existing) {
        throw new EccConflictError(dailyOpsAlreadySubmittedMessage(period), existing.id);
      }
    }

    const centreOperations = normalizeSectionInput({
      ...input.centreOperations,
      staffingReadiness: input.centreOperations.staffingReadiness.trim(),
      observations: input.centreOperations.observations.trim(),
      disruptionNotes: input.centreOperations.disruptionNotes.trim(),
    });
    const callOperations = normalizeSectionInput({
      ...input.callOperations,
      callsReceived: input.callOperations.callsReceived?.trim() || undefined,
      callsHandled: input.callOperations.callsHandled?.trim() || undefined,
      waiting: input.callOperations.waiting?.trim() || undefined,
      missed: input.callOperations.missed?.trim() || undefined,
      escalated: input.callOperations.escalated?.trim() || undefined,
      additionalMetrics: { ...input.callOperations.additionalMetrics },
      notes: input.callOperations.notes.trim(),
    });
    const facility = normalizeSectionInput({
      ...input.facility,
      condition: input.facility.condition.trim(),
      power: input.facility.power.trim(),
      environment: input.facility.environment.trim(),
      issues: input.facility.issues.trim(),
      observations: input.facility.observations.trim(),
    });
    const technical = normalizeSectionInput({
      ...input.technical,
      equipment: input.technical.equipment.trim(),
      network: input.technical.network.trim(),
      servers: input.technical.servers.trim(),
      software: input.technical.software.trim(),
      callTakingSystems: input.technical.callTakingSystems.trim(),
      incidents: input.technical.incidents.trim(),
      observations: input.technical.observations.trim(),
    });

    const record: EccDailyOpsRecord = {
      id: newEccId("ECC-DOP"),
      centreId,
      period,
      reportingDate,
      recordedAt: input.recordedAt || stamp,
      recordedByName: actor.name,
      recordedByProfileId: actor.profileId,
      overallStatus: input.overallStatus,
      centreOperations,
      callOperations,
      facility,
      technical,
      linkedIssueIds: [],
      linkedRequestIds: [],
      createdAt: stamp,
    };
    try {
      const created = await this.repo.insertDailyOps(record);
      await this.audit({
        centreId: created.centreId,
        action: "daily_ops.created",
        entityType: "daily_ops",
        entityId: created.id,
        description: `Submitted ${created.period} daily operations update`,
        metadata: {
          period: created.period,
          reportingDate: created.reportingDate,
          overallStatus: created.overallStatus,
        },
        actorNameFallback: created.recordedByName,
      });
      return created;
    } catch (error) {
      // Race: another insert won the unique index — load and reuse when possible.
      if (
        (period === "morning" || period === "evening") &&
        isDailyOpsPeriodUniqueViolation(error)
      ) {
        const raced = await this.repo.findDailyOpsByPeriodDate(
          centreId,
          period,
          reportingDate
        );
        throw new EccConflictError(dailyOpsAlreadySubmittedMessage(period), raced?.id);
      }
      throw mapUniqueViolation(
        error as { code?: string; message?: string },
        error instanceof Error ? error.message : "Failed to save daily ops."
      );
    }
  }

  async raiseIssueFromDailyOps(
    input: EccRaiseIssueFromDailyOpsInput
  ): Promise<{ issue: EccIssue; dailyOps: EccDailyOpsRecord }> {
    const actor = this.requireActor();
    const snapshot = await this.repo.getDailyOps(input.dailyOpsId);
    if (!snapshot) throw new Error("Daily operations record not found.");

    const existingIssue = await this.repo.findIssueBySourceSection(
      snapshot.id,
      input.section
    );
    if (existingIssue) {
      throw new Error(
        `An ECC Issue has already been raised for ${ECC_DAILY_OPS_SECTION_LABELS[input.section]} on this daily ops submission.`
      );
    }

    const stamp = nowIso();
    const history: EccIssueHistoryEntry = {
      id: newEccId("ECC-IH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: "status_change",
      fromStatus: null,
      toStatus: "identified",
      note: `Raised from daily ops (${ECC_DAILY_OPS_SECTION_LABELS[input.section]}) · ${snapshot.id}`,
    };
    const issue: EccIssue = {
      id: newEccId("ECC-ISS"),
      centreId: snapshot.centreId,
      occurredAt: stamp,
      classification: input.classification,
      severity: input.severity,
      title: input.title.trim(),
      description: input.description.trim(),
      status: "identified",
      reporterName: actor.name,
      reporterProfileId: actor.profileId,
      currentOwnerName: input.currentOwnerName?.trim() || undefined,
      history: [history],
      sourceDailyOpsId: snapshot.id,
      sourceDailyOpsSection: input.section,
      facilityId: DEFAULT_ECC_CENTRE.facilityId,
      createdAt: stamp,
      updatedAt: stamp,
    };

    try {
      await this.repo.insertIssue(issue, [history]);
      await this.repo.linkIssueToDailyOps(snapshot.id, issue.id);
    } catch (error) {
      throw mapUniqueViolation(
        error as { code?: string; message?: string },
        error instanceof Error
          ? error.message
          : "Failed to raise issue from daily ops."
      );
    }
    const dailyOps = await this.repo.getDailyOps(snapshot.id);
    if (!dailyOps) throw new Error("Daily operations record not found.");
    await this.audit({
      centreId: issue.centreId,
      action: "issue.created",
      entityType: "issue",
      entityId: issue.id,
      description: `Created issue “${issue.title}” from daily ops`,
      metadata: {
        status: issue.status,
        severity: issue.severity,
        sourceDailyOpsId: snapshot.id,
        section: input.section,
      },
      actorNameFallback: input.reporterName,
    });
    return { issue, dailyOps };
  }

  async raiseRequestFromDailyOps(
    input: EccRaiseRequestFromDailyOpsInput
  ): Promise<{ request: EccRequest; dailyOps: EccDailyOpsRecord }> {
    const actor = this.requireActor();
    const snapshot = await this.repo.getDailyOps(input.dailyOpsId);
    if (!snapshot) throw new Error("Daily operations record not found.");

    const existingRequest = await this.repo.findRequestBySourceSection(
      snapshot.id,
      input.section
    );
    if (existingRequest) {
      throw new Error(
        `An ECC Request has already been raised for ${ECC_DAILY_OPS_SECTION_LABELS[input.section]} on this daily ops submission.`
      );
    }

    const stamp = nowIso();
    const history: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: "status_change",
      fromStatus: null,
      toStatus: "submitted",
      note: `Raised from daily ops (${ECC_DAILY_OPS_SECTION_LABELS[input.section]}) · ${snapshot.id}`,
    };
    const request: EccRequest = {
      id: newEccId("ECC-REQ"),
      centreId: snapshot.centreId,
      title: input.title.trim(),
      reason: input.reason.trim(),
      description: (input.description ?? "").trim(),
      origin: input.origin,
      responsibility: input.responsibility,
      priority: input.priority,
      status: "submitted",
      requestingManagerName: actor.name,
      requestingProfileId: actor.profileId,
      currentOwnerName: input.currentOwnerName?.trim() || undefined,
      history: [history],
      sourceDailyOpsId: snapshot.id,
      sourceDailyOpsSection: input.section,
      facilityId: DEFAULT_ECC_CENTRE.facilityId,
      createdAt: stamp,
      updatedAt: stamp,
    };

    try {
      await this.repo.insertRequest(request, [history]);
      await this.repo.linkRequestToDailyOps(snapshot.id, request.id);
    } catch (error) {
      throw mapUniqueViolation(
        error as { code?: string; message?: string },
        error instanceof Error
          ? error.message
          : "Failed to raise request from daily ops."
      );
    }
    const dailyOps = await this.repo.getDailyOps(snapshot.id);
    if (!dailyOps) throw new Error("Daily operations record not found.");
    await this.audit({
      centreId: request.centreId,
      action: "request.created",
      entityType: "request",
      entityId: request.id,
      description: `Created request “${request.title}” from daily ops`,
      metadata: {
        status: request.status,
        priority: request.priority,
        sourceDailyOpsId: snapshot.id,
        section: input.section,
      },
      actorNameFallback: input.requestingManagerName,
    });
    return { request, dailyOps };
  }

  async linkIssueAndRequest(
    input: EccLinkIssueRequestInput
  ): Promise<{ issue: EccIssue; request: EccRequest }> {
    const actor = this.requireActor();
    const issue = await this.repo.getIssue(input.issueId);
    const request = await this.repo.getRequest(input.requestId);
    if (!issue) throw new Error("Issue not found.");
    if (!request) throw new Error("Request not found.");

    const stamp = nowIso();
    const note =
      input.note?.trim() ||
      `Linked issue ${issue.id} ↔ request ${request.id}`;

    const issueEntry: EccIssueHistoryEntry = {
      id: newEccId("ECC-IH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: "note",
      fromStatus: issue.status,
      toStatus: issue.status,
      note,
    };
    const requestEntry: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: "note",
      fromStatus: request.status,
      toStatus: request.status,
      note,
    };

    const nextIssue: EccIssue = {
      ...issue,
      relatedEccRequestId: request.id,
      history: [...issue.history, issueEntry],
      updatedAt: stamp,
    };
    const nextRequest: EccRequest = {
      ...request,
      relatedEccIssueId: issue.id,
      history: [...request.history, requestEntry],
      updatedAt: stamp,
    };

    await this.repo.updateIssue(nextIssue);
    await this.repo.appendIssueHistory(nextIssue.id, [issueEntry]);
    await this.repo.updateRequest(nextRequest);
    await this.repo.appendRequestHistory(nextRequest.id, [requestEntry]);
    await this.audit({
      centreId: nextIssue.centreId,
      action: "issue.updated",
      entityType: "issue",
      entityId: nextIssue.id,
      description: `Linked issue to request ${nextRequest.id}`,
      metadata: { relatedRequestId: nextRequest.id },
      actorNameFallback: input.byName,
    });
    await this.audit({
      centreId: nextRequest.centreId,
      action: "request.updated",
      entityType: "request",
      entityId: nextRequest.id,
      description: `Linked request to issue ${nextIssue.id}`,
      metadata: { relatedIssueId: nextIssue.id },
      actorNameFallback: input.byName,
    });
    return { issue: nextIssue, request: nextRequest };
  }

  async listIssues(centreId = DEFAULT_ECC_CENTRE.id) {
    return this.repo.listIssues(centreId);
  }

  async getIssue(id: string) {
    return this.repo.getIssue(id);
  }

  async createIssue(input: EccCreateIssueInput): Promise<EccIssue> {
    const actor = this.requireActor();
    // Source-integrity: only a verified Daily Ops path (raise*FromDailyOps) may set the Daily
    // Ops source relationship. The generic path never fabricates one.
    if (input.sourceDailyOpsId != null || input.sourceDailyOpsSection != null) {
      throw new Error(
        "A Daily Ops source can only be set by raising from a Daily Ops submission."
      );
    }
    const stamp = nowIso();
    const history: EccIssueHistoryEntry = {
      id: newEccId("ECC-IH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: "status_change",
      fromStatus: null,
      toStatus: "identified",
      note: input.initialNote?.trim() || "Issue identified.",
    };
    const issue: EccIssue = {
      id: newEccId("ECC-ISS"),
      centreId: input.centreId ?? DEFAULT_ECC_CENTRE.id,
      occurredAt: input.occurredAt || stamp,
      classification: input.classification,
      severity: input.severity,
      title: requireNonEmpty(input.title, "Title"),
      description: requireNonEmpty(input.description, "Description"),
      status: "identified",
      reporterName: actor.name,
      reporterProfileId: actor.profileId,
      currentOwnerName: input.currentOwnerName?.trim() || undefined,
      history: [history],
      relatedEccRequestId: input.relatedEccRequestId,
      facilityId: input.facilityId ?? DEFAULT_ECC_CENTRE.facilityId,
      assetId: input.assetId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const created = await this.repo.insertIssue(issue, [history]);
    await this.audit({
      centreId: created.centreId,
      action: "issue.created",
      entityType: "issue",
      entityId: created.id,
      description: `Created issue “${created.title}”`,
      metadata: {
        status: created.status,
        severity: created.severity,
        classification: created.classification,
      },
      actorNameFallback: input.reporterName,
    });
    return created;
  }

  async transitionIssue(input: EccTransitionIssueInput): Promise<EccIssue> {
    const actor = this.requireActor();
    const current = await this.repo.getIssue(input.id);
    if (!current) throw new Error("Issue not found.");
    assertIssueTransition(current.status, input.toStatus);
    if (
      (input.toStatus === "resolved" || input.toStatus === "closed") &&
      !input.resolutionNotes?.trim() &&
      !current.resolutionNotes?.trim()
    ) {
      throw new Error("Resolution notes are required to resolve or close an issue.");
    }
    const stamp = nowIso();
    const entry: EccIssueHistoryEntry = {
      id: newEccId("ECC-IH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: issueHistoryKind(input.toStatus),
      fromStatus: current.status,
      toStatus: input.toStatus,
      note: input.note?.trim() || undefined,
    };
    const next: EccIssue = {
      ...current,
      status: input.toStatus,
      currentOwnerName:
        input.currentOwnerName?.trim() || current.currentOwnerName || undefined,
      resolutionNotes:
        input.resolutionNotes?.trim() ||
        current.resolutionNotes ||
        undefined,
      closedAt: input.toStatus === "closed" ? stamp : current.closedAt,
      closedByName:
        input.toStatus === "closed" ? actor.name : current.closedByName,
      closedByProfileId:
        input.toStatus === "closed"
          ? actor.profileId
          : current.closedByProfileId,
      history: [...current.history, entry],
      updatedAt: stamp,
    };
    await this.repo.updateIssue(next);
    await this.repo.appendIssueHistory(next.id, [entry]);
    await this.audit({
      centreId: next.centreId,
      action: "issue.status_changed",
      entityType: "issue",
      entityId: next.id,
      description: `Issue status ${current.status} → ${next.status}`,
      metadata: {
        previousStatus: current.status,
        status: next.status,
        title: next.title,
      },
      actorNameFallback: input.byName,
    });
    return next;
  }

  async appendIssueAction(input: EccAppendIssueActionInput): Promise<EccIssue> {
    const actor = this.requireActor();
    const current = await this.repo.getIssue(input.id);
    if (!current) throw new Error("Issue not found.");
    const stamp = nowIso();
    const entry: EccIssueHistoryEntry = {
      id: newEccId("ECC-IH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: input.kind ?? "action",
      fromStatus: current.status,
      toStatus: current.status,
      note: input.note.trim(),
    };
    const ownerChanged =
      Boolean(input.currentOwnerName?.trim()) &&
      input.currentOwnerName?.trim() !== current.currentOwnerName;
    const next: EccIssue = {
      ...current,
      currentOwnerName:
        input.currentOwnerName?.trim() || current.currentOwnerName || undefined,
      history: [...current.history, entry],
      updatedAt: stamp,
    };
    await this.repo.updateIssue(next);
    await this.repo.appendIssueHistory(next.id, [entry]);
    await this.audit({
      centreId: next.centreId,
      action: "issue.updated",
      entityType: "issue",
      entityId: next.id,
      description: ownerChanged
        ? `Updated issue owner ${current.currentOwnerName ?? "—"} → ${next.currentOwnerName ?? "—"}`
        : `Updated issue “${next.title}”`,
      metadata: {
        note: input.note.trim(),
        previousOwner: current.currentOwnerName ?? null,
        currentOwner: next.currentOwnerName ?? null,
        kind: entry.kind,
      },
      actorNameFallback: input.byName,
    });
    return next;
  }

  async deleteIssue(id: string): Promise<void> {
    const issue = await this.repo.getIssue(id);
    if (!issue) throw new Error("Issue not found.");
    await this.repo.deleteIssue(id);
    await this.audit({
      centreId: issue.centreId,
      action: "issue.deleted",
      entityType: "issue",
      entityId: issue.id,
      description: `Deleted issue “${issue.title}”`,
      metadata: { title: issue.title, status: issue.status },
    });
  }

  async listRequests(centreId = DEFAULT_ECC_CENTRE.id) {
    return this.repo.listRequests(centreId);
  }

  async getRequest(id: string) {
    return this.repo.getRequest(id);
  }

  async createRequest(input: EccCreateRequestInput): Promise<EccRequest> {
    const actor = this.requireActor();
    // Source-integrity: only a verified Daily Ops path (raise*FromDailyOps) may set the Daily
    // Ops source relationship. The generic path never fabricates one.
    if (input.sourceDailyOpsId != null || input.sourceDailyOpsSection != null) {
      throw new Error(
        "A Daily Ops source can only be set by raising from a Daily Ops submission."
      );
    }
    const stamp = nowIso();
    const requestingManagerName = actor.name;
    const title = requireNonEmpty(input.title, "Title");
    const history: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: requestingManagerName,
      byProfileId: actor.profileId,
      kind: "status_change",
      fromStatus: null,
      toStatus: "submitted",
      note: input.initialNote?.trim() || "Request submitted.",
    };
    const request: EccRequest = {
      id: newEccId("ECC-REQ"),
      centreId: input.centreId ?? DEFAULT_ECC_CENTRE.id,
      title,
      reason: requireNonEmpty(input.reason, "Reason"),
      description: requireNonEmpty(input.description, "Description"),
      origin: input.origin,
      responsibility: input.responsibility,
      priority: input.priority,
      status: "submitted",
      requestingManagerName,
      requestingProfileId: actor.profileId,
      currentOwnerName: input.currentOwnerName?.trim() || undefined,
      history: [history],
      evidenceNotes: input.evidenceNotes?.trim() || undefined,
      relatedEccIssueId: input.relatedEccIssueId,
      facilityId: input.facilityId ?? DEFAULT_ECC_CENTRE.facilityId,
      assetId: input.assetId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const created = await this.repo.insertRequest(request, [history]);
    await this.audit({
      centreId: created.centreId,
      action: "request.created",
      entityType: "request",
      entityId: created.id,
      description: `Created request “${created.title}”`,
      metadata: {
        status: created.status,
        priority: created.priority,
        origin: created.origin,
      },
      actorNameFallback: input.requestingManagerName,
    });
    return created;
  }

  async transitionRequest(
    input: EccTransitionRequestInput
  ): Promise<EccRequest> {
    const actor = this.requireActor();
    const current = await this.repo.getRequest(input.id);
    if (!current) throw new Error("Request not found.");
    assertRequestTransition(current.status, input.toStatus);
    if (
      (input.toStatus === "resolved" || input.toStatus === "closed") &&
      !input.resolutionNotes?.trim() &&
      !current.resolutionNotes?.trim()
    ) {
      throw new Error(
        "Resolution notes are required to resolve or close a request."
      );
    }
    const stamp = nowIso();
    const entry: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: requestHistoryKind(input.toStatus),
      fromStatus: current.status,
      toStatus: input.toStatus,
      note: input.note?.trim() || undefined,
    };
    const next: EccRequest = {
      ...current,
      status: input.toStatus,
      currentOwnerName:
        input.currentOwnerName?.trim() ||
        current.currentOwnerName ||
        undefined,
      resolutionNotes:
        input.resolutionNotes?.trim() ||
        current.resolutionNotes ||
        undefined,
      closedAt: input.toStatus === "closed" ? stamp : current.closedAt,
      closedByName:
        input.toStatus === "closed" ? actor.name : current.closedByName,
      closedByProfileId:
        input.toStatus === "closed"
          ? actor.profileId
          : current.closedByProfileId,
      history: [...current.history, entry],
      updatedAt: stamp,
    };
    await this.repo.updateRequest(next);
    await this.repo.appendRequestHistory(next.id, [entry]);
    await this.audit({
      centreId: next.centreId,
      action: "request.status_changed",
      entityType: "request",
      entityId: next.id,
      description: `Request status ${current.status} → ${next.status}`,
      metadata: {
        previousStatus: current.status,
        status: next.status,
        title: next.title,
      },
      actorNameFallback: input.byName,
    });
    return next;
  }

  async appendRequestAction(
    input: EccAppendRequestActionInput
  ): Promise<EccRequest> {
    const actor = this.requireActor();
    const current = await this.repo.getRequest(input.id);
    if (!current) throw new Error("Request not found.");
    const stamp = nowIso();
    const entry: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: actor.name,
      byProfileId: actor.profileId,
      kind: input.kind ?? "action",
      fromStatus: current.status,
      toStatus: current.status,
      note: input.note.trim(),
    };
    const ownerChanged =
      Boolean(input.currentOwnerName?.trim()) &&
      input.currentOwnerName?.trim() !== current.currentOwnerName;
    const next: EccRequest = {
      ...current,
      currentOwnerName:
        input.currentOwnerName?.trim() ||
        current.currentOwnerName ||
        undefined,
      history: [...current.history, entry],
      updatedAt: stamp,
    };
    await this.repo.updateRequest(next);
    await this.repo.appendRequestHistory(next.id, [entry]);
    await this.audit({
      centreId: next.centreId,
      action: "request.updated",
      entityType: "request",
      entityId: next.id,
      description: ownerChanged
        ? `Updated request owner ${current.currentOwnerName ?? "—"} → ${next.currentOwnerName ?? "—"}`
        : `Updated request “${next.title}”`,
      metadata: {
        note: input.note.trim(),
        previousOwner: current.currentOwnerName ?? null,
        currentOwner: next.currentOwnerName ?? null,
        kind: entry.kind,
      },
      actorNameFallback: input.byName,
    });
    return next;
  }

  async listReportingDimensions(): Promise<EccReportingDimension[]> {
    const snap = await this.getReportingSnapshot();
    return snap.dimensions;
  }

  async getReportingSnapshot(
    centreId = DEFAULT_ECC_CENTRE.id
  ): Promise<EccReportingSnapshot> {
    const state = await this.repo.loadAggregate(centreId);
    return deriveReportingSnapshot(state, centreId);
  }

  /**
   * RETIRED. Browser localStorage is never authoritative ECC domain state, and
   * opening ECC must not write legacy client data into Supabase. Kept only so
   * the retired action fails loudly instead of doing nothing silently.
   */
  async importLocalState(_state: unknown): Promise<never> {
    throw new ActionError(
      "VALIDATION_ERROR",
      "Importing browser-stored ECC data is retired. Records are created on the server."
    );
  }
}
