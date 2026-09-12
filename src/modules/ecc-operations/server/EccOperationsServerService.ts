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
  EccAppendIssueActionInput,
  EccAppendRequestActionInput,
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
  EccTransitionIssueInput,
  EccTransitionRequestInput,
} from "@/modules/ecc-operations/types";
import { DEFAULT_ECC_CENTRE } from "@/modules/ecc-operations/types";
import { EccOperationsRepository } from "./EccOperationsRepository";
import { EccPeopleRepository } from "./EccPeopleRepository";
import type { EccLocalState } from "@/modules/ecc-operations/store/eccLocalStore";

/**
 * Server-side ECC operations. Enforces transitions, immutability, and org scope.
 */
export class EccOperationsServerService {
  private readonly repo: EccOperationsRepository;
  private readonly peopleRepo: EccPeopleRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new EccOperationsRepository(organisationId);
    this.peopleRepo = new EccPeopleRepository(organisationId);
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
    } catch {
      // People tables may not be migrated yet — keep Daily Ops staffing.
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
    return this.peopleRepo.createPerson(input);
  }

  async ensureCurrentShift(input: EccEnsureCurrentShiftInput) {
    await this.repo.ensureDefaultCentre();
    return this.peopleRepo.ensureCurrentShift(input);
  }

  async setCurrentShiftAssignments(input: EccSetCurrentShiftAssignmentsInput) {
    await this.repo.ensureDefaultCentre();
    return this.peopleRepo.setCurrentShiftAssignments(input);
  }

  async signInPerson(input: EccSignInInput) {
    return this.peopleRepo.signIn(input);
  }

  async signOutPerson(input: EccSignOutInput) {
    return this.peopleRepo.signOut(input);
  }

  async listDailyOps(centreId = DEFAULT_ECC_CENTRE.id) {
    return this.repo.listDailyOps(centreId);
  }

  async getDailyOps(id: string) {
    return this.repo.getDailyOps(id);
  }

  async createDailyOps(input: EccCreateDailyOpsInput): Promise<EccDailyOpsRecord> {
    await this.repo.ensureDefaultCentre();
    const stamp = nowIso();
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
      centreId: input.centreId ?? DEFAULT_ECC_CENTRE.id,
      period: input.period,
      reportingDate: input.reportingDate || stamp.slice(0, 10),
      recordedAt: input.recordedAt || stamp,
      recordedByName: input.recordedByName.trim(),
      overallStatus: input.overallStatus,
      centreOperations,
      callOperations,
      facility,
      technical,
      linkedIssueIds: [],
      linkedRequestIds: [],
      createdAt: stamp,
    };
    return this.repo.insertDailyOps(record);
  }

  async raiseIssueFromDailyOps(
    input: EccRaiseIssueFromDailyOpsInput
  ): Promise<{ issue: EccIssue; dailyOps: EccDailyOpsRecord }> {
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
      byName: input.reporterName.trim(),
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
      reporterName: input.reporterName.trim(),
      currentOwnerName: input.currentOwnerName?.trim() || undefined,
      history: [history],
      sourceDailyOpsId: snapshot.id,
      sourceDailyOpsSection: input.section,
      facilityId: DEFAULT_ECC_CENTRE.facilityId,
      createdAt: stamp,
      updatedAt: stamp,
    };

    await this.repo.insertIssue(issue, [history]);
    await this.repo.linkIssueToDailyOps(snapshot.id, issue.id);
    const dailyOps = await this.repo.getDailyOps(snapshot.id);
    if (!dailyOps) throw new Error("Daily operations record not found.");
    return { issue, dailyOps };
  }

  async raiseRequestFromDailyOps(
    input: EccRaiseRequestFromDailyOpsInput
  ): Promise<{ request: EccRequest; dailyOps: EccDailyOpsRecord }> {
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
      byName: input.requestingManagerName.trim(),
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
      requestingManagerName: input.requestingManagerName.trim(),
      currentOwnerName: input.currentOwnerName?.trim() || undefined,
      history: [history],
      sourceDailyOpsId: snapshot.id,
      sourceDailyOpsSection: input.section,
      facilityId: DEFAULT_ECC_CENTRE.facilityId,
      createdAt: stamp,
      updatedAt: stamp,
    };

    await this.repo.insertRequest(request, [history]);
    await this.repo.linkRequestToDailyOps(snapshot.id, request.id);
    const dailyOps = await this.repo.getDailyOps(snapshot.id);
    if (!dailyOps) throw new Error("Daily operations record not found.");
    return { request, dailyOps };
  }

  async linkIssueAndRequest(
    input: EccLinkIssueRequestInput
  ): Promise<{ issue: EccIssue; request: EccRequest }> {
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
      byName: input.byName.trim(),
      kind: "note",
      fromStatus: issue.status,
      toStatus: issue.status,
      note,
    };
    const requestEntry: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: input.byName.trim(),
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
    return { issue: nextIssue, request: nextRequest };
  }

  async listIssues(centreId = DEFAULT_ECC_CENTRE.id) {
    return this.repo.listIssues(centreId);
  }

  async getIssue(id: string) {
    return this.repo.getIssue(id);
  }

  async createIssue(input: EccCreateIssueInput): Promise<EccIssue> {
    const stamp = nowIso();
    const history: EccIssueHistoryEntry = {
      id: newEccId("ECC-IH"),
      at: stamp,
      byName: input.reporterName.trim(),
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
      title: input.title.trim(),
      description: input.description.trim(),
      status: "identified",
      reporterName: input.reporterName.trim(),
      currentOwnerName: input.currentOwnerName?.trim() || undefined,
      history: [history],
      relatedEccRequestId: input.relatedEccRequestId,
      sourceDailyOpsId: input.sourceDailyOpsId,
      sourceDailyOpsSection: input.sourceDailyOpsSection,
      facilityId: input.facilityId ?? DEFAULT_ECC_CENTRE.facilityId,
      assetId: input.assetId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const created = await this.repo.insertIssue(issue, [history]);
    return created;
  }

  async transitionIssue(input: EccTransitionIssueInput): Promise<EccIssue> {
    const current = await this.repo.getIssue(input.id);
    if (!current) throw new Error("Issue not found.");
    assertIssueTransition(current.status, input.toStatus);
    const stamp = nowIso();
    const entry: EccIssueHistoryEntry = {
      id: newEccId("ECC-IH"),
      at: stamp,
      byName: input.byName.trim(),
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
        input.toStatus === "closed"
          ? input.byName.trim()
          : current.closedByName,
      history: [...current.history, entry],
      updatedAt: stamp,
    };
    await this.repo.updateIssue(next);
    await this.repo.appendIssueHistory(next.id, [entry]);
    return next;
  }

  async appendIssueAction(input: EccAppendIssueActionInput): Promise<EccIssue> {
    const current = await this.repo.getIssue(input.id);
    if (!current) throw new Error("Issue not found.");
    const stamp = nowIso();
    const entry: EccIssueHistoryEntry = {
      id: newEccId("ECC-IH"),
      at: stamp,
      byName: input.byName.trim(),
      kind: input.kind ?? "action",
      fromStatus: current.status,
      toStatus: current.status,
      note: input.note.trim(),
    };
    const next: EccIssue = {
      ...current,
      currentOwnerName:
        input.currentOwnerName?.trim() || current.currentOwnerName || undefined,
      history: [...current.history, entry],
      updatedAt: stamp,
    };
    await this.repo.updateIssue(next);
    await this.repo.appendIssueHistory(next.id, [entry]);
    return next;
  }

  async deleteIssue(id: string): Promise<void> {
    const issue = await this.repo.getIssue(id);
    if (!issue) throw new Error("Issue not found.");
    await this.repo.deleteIssue(id);
  }

  async listRequests(centreId = DEFAULT_ECC_CENTRE.id) {
    return this.repo.listRequests(centreId);
  }

  async getRequest(id: string) {
    return this.repo.getRequest(id);
  }

  async createRequest(input: EccCreateRequestInput): Promise<EccRequest> {
    const stamp = nowIso();
    const history: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: input.requestingManagerName.trim(),
      kind: "status_change",
      fromStatus: null,
      toStatus: "submitted",
      note: input.initialNote?.trim() || "Request submitted.",
    };
    const request: EccRequest = {
      id: newEccId("ECC-REQ"),
      centreId: input.centreId ?? DEFAULT_ECC_CENTRE.id,
      title: input.title.trim(),
      reason: input.reason.trim(),
      description: input.description.trim(),
      origin: input.origin,
      responsibility: input.responsibility,
      priority: input.priority,
      status: "submitted",
      requestingManagerName: input.requestingManagerName.trim(),
      currentOwnerName: input.currentOwnerName?.trim() || undefined,
      history: [history],
      evidenceNotes: input.evidenceNotes?.trim() || undefined,
      relatedEccIssueId: input.relatedEccIssueId,
      sourceDailyOpsId: input.sourceDailyOpsId,
      sourceDailyOpsSection: input.sourceDailyOpsSection,
      facilityId: input.facilityId ?? DEFAULT_ECC_CENTRE.facilityId,
      assetId: input.assetId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const created = await this.repo.insertRequest(request, [history]);
    return created;
  }

  async transitionRequest(
    input: EccTransitionRequestInput
  ): Promise<EccRequest> {
    const current = await this.repo.getRequest(input.id);
    if (!current) throw new Error("Request not found.");
    assertRequestTransition(current.status, input.toStatus);
    const stamp = nowIso();
    const entry: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: input.byName.trim(),
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
        input.toStatus === "closed"
          ? input.byName.trim()
          : current.closedByName,
      history: [...current.history, entry],
      updatedAt: stamp,
    };
    await this.repo.updateRequest(next);
    await this.repo.appendRequestHistory(next.id, [entry]);
    return next;
  }

  async appendRequestAction(
    input: EccAppendRequestActionInput
  ): Promise<EccRequest> {
    const current = await this.repo.getRequest(input.id);
    if (!current) throw new Error("Request not found.");
    const stamp = nowIso();
    const entry: EccRequestHistoryEntry = {
      id: newEccId("ECC-RH"),
      at: stamp,
      byName: input.byName.trim(),
      kind: input.kind ?? "action",
      fromStatus: current.status,
      toStatus: current.status,
      note: input.note.trim(),
    };
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

  async importLocalState(state: EccLocalState) {
    return this.repo.importLocalAggregate({
      centre: state.centre,
      dailyOps: state.dailyOps,
      issues: state.issues,
      requests: state.requests,
    });
  }
}
