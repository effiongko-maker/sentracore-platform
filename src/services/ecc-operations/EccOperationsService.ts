import type {
  EccAppendIssueActionInput,
  EccAppendRequestActionInput,
  EccAttendanceRecord,
  EccCreateDailyOpsInput,
  EccCreateIssueInput,
  EccCreatePersonInput,
  EccCreateRequestInput,
  EccCreateFinanceBudgetInput,
  EccCreateFinanceCommitmentInput,
  EccCreateFinanceTransactionInput,
  EccDailyOpsRecord,
  EccEnsureCurrentShiftInput,
  EccIssue,
  EccLinkIssueRequestInput,
  EccOverviewSnapshot,
  EccPeopleSnapshot,
  EccPerson,
  EccRaiseIssueFromDailyOpsInput,
  EccRaiseRequestFromDailyOpsInput,
  EccReportingDimension,
  EccReportingSnapshot,
  EccRequest,
  EccShift,
  EccSignInInput,
  EccSignOutInput,
  EccSetCurrentShiftAssignmentsInput,
  EccFinanceBudget,
  EccFinanceCommitment,
  EccFinanceCommitmentStatus,
  EccFinanceSnapshot,
  EccFinanceTransaction,
  EccAuditEntityType,
  EccAuditEvent,
  EccAuditListFilter,
  EccTransitionIssueInput,
  EccTransitionRequestInput,
} from "@/modules/ecc-operations/types";
import { DEFAULT_ECC_CENTRE } from "@/modules/ecc-operations/types";

const API_PATH = "/api/ecc-operations";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message?: string; code?: string };

/** Structured API failure so callers can tell a CONFLICT / FORBIDDEN from a generic failure. */
export class EccApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "EccApiError";
  }
}

async function callEccApi<T>(
  payload: Record<string, unknown>
): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new EccApiError(
      ("message" in json && json.message) ||
        `ECC Operations API failed (${response.status}).`,
      response.status,
      "code" in json ? json.code : undefined
    );
  }
  return json.data;
}

/**
 * Canonical ECC Operations service — thin client adapter over `/api/ecc-operations`.
 * Domain persistence is Supabase (server). Browser storage is never imported as domain state.
 */
export type IEccOperationsService = {
  getFoundationStatus(): Promise<{
    module: "ecc_operations";
    ready: true;
    persistence: "supabase";
  }>;
  /** Server-authoritative organisation-local date (never derived in the browser). */
  getOperationalDate(): Promise<{ date: string; timeZone: string }>;
  getOverview(centreId?: string): Promise<EccOverviewSnapshot>;
  listDailyOps(centreId?: string): Promise<EccDailyOpsRecord[]>;
  getDailyOps(id: string): Promise<EccDailyOpsRecord | null>;
  createDailyOps(input: EccCreateDailyOpsInput): Promise<EccDailyOpsRecord>;
  raiseIssueFromDailyOps(
    input: EccRaiseIssueFromDailyOpsInput
  ): Promise<{ issue: EccIssue; dailyOps: EccDailyOpsRecord }>;
  raiseRequestFromDailyOps(
    input: EccRaiseRequestFromDailyOpsInput
  ): Promise<{ request: EccRequest; dailyOps: EccDailyOpsRecord }>;
  linkIssueAndRequest(
    input: EccLinkIssueRequestInput
  ): Promise<{ issue: EccIssue; request: EccRequest }>;
  listIssues(centreId?: string): Promise<EccIssue[]>;
  getIssue(id: string): Promise<EccIssue | null>;
  createIssue(input: EccCreateIssueInput): Promise<EccIssue>;
  transitionIssue(input: EccTransitionIssueInput): Promise<EccIssue>;
  appendIssueAction(input: EccAppendIssueActionInput): Promise<EccIssue>;
  deleteIssue(id: string): Promise<void>;
  listRequests(centreId?: string): Promise<EccRequest[]>;
  getRequest(id: string): Promise<EccRequest | null>;
  createRequest(input: EccCreateRequestInput): Promise<EccRequest>;
  transitionRequest(input: EccTransitionRequestInput): Promise<EccRequest>;
  appendRequestAction(input: EccAppendRequestActionInput): Promise<EccRequest>;
  listReportingDimensions(): Promise<EccReportingDimension[]>;
  getReportingSnapshot(centreId?: string): Promise<EccReportingSnapshot>;
  getPeopleSnapshot(centreId?: string): Promise<EccPeopleSnapshot>;
  createPerson(input: EccCreatePersonInput): Promise<EccPerson>;
  ensureCurrentShift(input: EccEnsureCurrentShiftInput): Promise<EccShift>;
  setCurrentShiftAssignments(
    input: EccSetCurrentShiftAssignmentsInput
  ): Promise<EccShift>;
  signInPerson(input: EccSignInInput): Promise<EccAttendanceRecord>;
  signOutPerson(input: EccSignOutInput): Promise<EccAttendanceRecord>;
  getFinanceSnapshot(centreId?: string): Promise<EccFinanceSnapshot>;
  setFinanceBudget(input: EccCreateFinanceBudgetInput): Promise<EccFinanceBudget>;
  createFinanceTransaction(
    input: EccCreateFinanceTransactionInput
  ): Promise<EccFinanceTransaction>;
  createFinanceCommitment(
    input: EccCreateFinanceCommitmentInput
  ): Promise<EccFinanceCommitment>;
  updateFinanceCommitmentStatus(input: {
    id: string;
    status: EccFinanceCommitmentStatus;
  }): Promise<EccFinanceCommitment>;
  listAuditEvents(filter?: EccAuditListFilter): Promise<EccAuditEvent[]>;
  getEntityAuditTrail(
    entityType: EccAuditEntityType,
    entityId: string
  ): Promise<EccAuditEvent[]>;
};

export const EccOperationsService: IEccOperationsService = {
  async getFoundationStatus() {
    return callEccApi({ action: "getFoundationStatus" });
  },

  async getOperationalDate() {
    return callEccApi({ action: "getOperationalDate" });
  },

  async getOverview(centreId = DEFAULT_ECC_CENTRE.id) {
    return callEccApi({ action: "getOverview", centreId });
  },

  async listDailyOps(centreId = DEFAULT_ECC_CENTRE.id) {
    return callEccApi({ action: "listDailyOps", centreId });
  },

  async getDailyOps(id) {
    return callEccApi({ action: "getDailyOps", id });
  },

  async createDailyOps(input) {
    return callEccApi({ action: "createDailyOps", input });
  },

  async raiseIssueFromDailyOps(input) {
    return callEccApi({ action: "raiseIssueFromDailyOps", input });
  },

  async raiseRequestFromDailyOps(input) {
    return callEccApi({ action: "raiseRequestFromDailyOps", input });
  },

  async linkIssueAndRequest(input) {
    return callEccApi({ action: "linkIssueAndRequest", input });
  },

  async listIssues(centreId = DEFAULT_ECC_CENTRE.id) {
    return callEccApi({ action: "listIssues", centreId });
  },

  async getIssue(id) {
    return callEccApi({ action: "getIssue", id });
  },

  async createIssue(input) {
    return callEccApi({ action: "createIssue", input });
  },

  async transitionIssue(input) {
    return callEccApi({ action: "transitionIssue", input });
  },

  async appendIssueAction(input) {
    return callEccApi({ action: "appendIssueAction", input });
  },

  async deleteIssue(id) {
    await callEccApi({ action: "deleteIssue", id });
  },

  async listRequests(centreId = DEFAULT_ECC_CENTRE.id) {
    return callEccApi({ action: "listRequests", centreId });
  },

  async getRequest(id) {
    return callEccApi({ action: "getRequest", id });
  },

  async createRequest(input) {
    return callEccApi({ action: "createRequest", input });
  },

  async transitionRequest(input) {
    return callEccApi({ action: "transitionRequest", input });
  },

  async appendRequestAction(input) {
    return callEccApi({ action: "appendRequestAction", input });
  },

  async listReportingDimensions() {
    return callEccApi({ action: "listReportingDimensions" });
  },

  async getReportingSnapshot(centreId = DEFAULT_ECC_CENTRE.id) {
    return callEccApi({ action: "getReportingSnapshot", centreId });
  },

  async getPeopleSnapshot(centreId = DEFAULT_ECC_CENTRE.id) {
    return callEccApi({ action: "getPeopleSnapshot", centreId });
  },

  async createPerson(input) {
    return callEccApi({ action: "createPerson", input });
  },

  async ensureCurrentShift(input) {
    return callEccApi({ action: "ensureCurrentShift", input });
  },

  async setCurrentShiftAssignments(input) {
    return callEccApi({ action: "setCurrentShiftAssignments", input });
  },

  async signInPerson(input) {
    return callEccApi({ action: "signInPerson", input });
  },

  async signOutPerson(input) {
    return callEccApi({ action: "signOutPerson", input });
  },

  async getFinanceSnapshot(centreId = DEFAULT_ECC_CENTRE.id) {
    return callEccApi({ action: "getFinanceSnapshot", centreId });
  },

  async setFinanceBudget(input) {
    return callEccApi({ action: "setFinanceBudget", input });
  },

  async createFinanceTransaction(input) {
    return callEccApi({ action: "createFinanceTransaction", input });
  },

  async createFinanceCommitment(input) {
    return callEccApi({ action: "createFinanceCommitment", input });
  },

  async updateFinanceCommitmentStatus(input) {
    return callEccApi({ action: "updateFinanceCommitmentStatus", input });
  },

  async listAuditEvents(filter = {}) {
    return callEccApi({ action: "listAuditEvents", filter });
  },

  async getEntityAuditTrail(entityType, entityId) {
    return callEccApi({
      action: "getEntityAuditTrail",
      entityType,
      id: entityId,
    });
  },
};
