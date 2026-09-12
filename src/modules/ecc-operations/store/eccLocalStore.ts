import type {
  EccCallOperationsSection,
  EccCentre,
  EccCentreOperationsSection,
  EccCentreOverallStatus,
  EccDailyOpsRecord,
  EccFacilitySection,
  EccIssue,
  EccIssueHistoryEntry,
  EccRequest,
  EccRequestHistoryEntry,
  EccSectionCondition,
  EccStaffingStatus,
  EccTechnicalSection,
} from "../types";
import { DEFAULT_ECC_CENTRE } from "../types";

export const ECC_LOCAL_STORAGE_KEY = "sentracore.ecc.ops.v3";
export const ECC_LOCAL_MIGRATED_KEY = "sentracore.ecc.ops.migrated.v1";
const STORAGE_KEY = ECC_LOCAL_STORAGE_KEY;
const LEGACY_KEYS = ["sentracore.ecc.ops.v2", "sentracore.ecc.ops.v1"] as const;

export type EccLocalState = {
  version: 3;
  centre: EccCentre;
  dailyOps: EccDailyOpsRecord[];
  issues: EccIssue[];
  requests: EccRequest[];
};

function emptyState(): EccLocalState {
  return {
    version: 3,
    centre: { ...DEFAULT_ECC_CENTRE },
    dailyOps: [],
    issues: [],
    requests: [],
  };
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function mapLegacyOverall(raw: string): EccCentreOverallStatus {
  switch (raw) {
    case "operational":
    case "operational_with_issues":
    case "disrupted":
    case "down":
      return raw;
    case "normal":
      return "operational";
    case "attention":
      return "operational_with_issues";
    case "unknown":
    default:
      return "operational";
  }
}

function mapLegacySection(raw: string): EccSectionCondition {
  switch (raw) {
    case "normal":
    case "issue":
    case "disrupted":
      return raw;
    case "attention":
      return "issue";
    case "unknown":
    default:
      return "normal";
  }
}

function normalizeCentreOps(raw: unknown, legacy?: Record<string, unknown>): EccCentreOperationsSection {
  const row = { ...legacy, ...asRecord(raw) };
  const status = mapLegacySection(str(row.status, str(legacy?.centreStatus, "normal")));
  return {
    status,
    staffingStatus: (str(row.staffingStatus, "unknown") ||
      "unknown") as EccStaffingStatus,
    staffingReadiness: str(row.staffingReadiness),
    observations: str(row.observations),
    disruptionNotes: str(row.disruptionNotes) || str(row.issuesNotes),
    noIssuesToReport: status === "normal",
  };
}

function normalizeCallOps(raw: unknown): EccCallOperationsSection {
  const row = asRecord(raw);
  // Legacy callActivity shape
  const legacyCall = asRecord(row);
  const metrics = asRecord(row.metrics);
  const additional = asRecord(row.additionalMetrics);
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...metrics, ...additional })) {
    if (typeof value === "string" && value.trim()) merged[key] = value;
  }
  const status = mapLegacySection(str(row.status, "normal"));
  return {
    status,
    callsReceived: str(row.callsReceived) || undefined,
    callsHandled: str(row.callsHandled) || undefined,
    waiting: str(row.waiting) || undefined,
    missed: str(row.missed) || undefined,
    escalated: str(row.escalated) || undefined,
    additionalMetrics: merged,
    notes: str(row.notes) || str(legacyCall.notes),
    noIssuesToReport: status === "normal",
  };
}

function normalizeFacility(raw: unknown, legacyStatus?: unknown): EccFacilitySection {
  const row = asRecord(raw);
  const status = mapLegacySection(str(row.status, str(legacyStatus, "normal")));
  return {
    status,
    condition: str(row.condition) || str(row.facilityCondition),
    power: str(row.power),
    environment: str(row.environment),
    issues: str(row.issues) || str(row.nonTechnicalIssues),
    observations: str(row.observations),
    noIssuesToReport: status === "normal",
  };
}

function normalizeTechnical(
  raw: unknown,
  legacyStatus?: unknown,
  legacyCondition?: unknown
): EccTechnicalSection {
  const row = asRecord(raw);
  const status = mapLegacySection(str(row.status, str(legacyStatus, "normal")));
  return {
    status,
    equipment: str(row.equipment) || str(legacyCondition),
    network: str(row.network),
    servers: str(row.servers),
    software: str(row.software),
    callTakingSystems: str(row.callTakingSystems),
    incidents: str(row.incidents) || str(row.technicalIssues),
    observations: str(row.observations) || str(row.powerSystems),
    noIssuesToReport: status === "normal",
  };
}

function isoToDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function normalizeDailyOps(raw: unknown): EccDailyOpsRecord | null {
  const row = asRecord(raw);
  if (!str(row.id)) return null;

  const recordedAt =
    str(row.recordedAt) || str(row.createdAt) || new Date().toISOString();

  const centreOperations =
    row.centreOperations != null
      ? normalizeCentreOps(row.centreOperations)
      : normalizeCentreOps(
          {},
          {
            centreStatus: row.centreStatus,
            staffingStatus: row.staffingStatus,
            staffingReadiness: row.staffingReadiness,
            observations: row.observations,
            issuesNotes: row.issuesNotes,
            disruptionNotes: row.escalationsNotes,
          }
        );

  const callOperations =
    row.callOperations != null
      ? normalizeCallOps(row.callOperations)
      : normalizeCallOps(row.callActivity ?? {});

  const facility =
    row.facility != null
      ? normalizeFacility(row.facility)
      : normalizeFacility(
          {
            condition: row.facilityCondition,
            status: row.facilityStatus,
          },
          row.facilityStatus
        );

  const technical =
    row.technical != null
      ? normalizeTechnical(row.technical)
      : normalizeTechnical({}, row.technicalStatus, row.technicalCondition);

  const overallRaw = str(row.overallStatus) || str(row.centreStatus, "operational");

  const linked = Array.isArray(row.linkedIssueIds)
    ? row.linkedIssueIds.filter((id): id is string => typeof id === "string")
    : [];
  const linkedRequests = Array.isArray(row.linkedRequestIds)
    ? row.linkedRequestIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    id: str(row.id),
    centreId: str(row.centreId, DEFAULT_ECC_CENTRE.id),
    period: (str(row.period, "ad_hoc") ||
      "ad_hoc") as EccDailyOpsRecord["period"],
    reportingDate: str(row.reportingDate) || isoToDate(recordedAt),
    recordedAt,
    recordedByName: str(row.recordedByName),
    overallStatus: mapLegacyOverall(overallRaw),
    centreOperations,
    callOperations,
    facility,
    technical,
    linkedIssueIds: linked,
    linkedRequestIds: linkedRequests,
    createdAt: str(row.createdAt) || recordedAt,
  };
}

function normalizeIssueHistory(raw: unknown): EccIssueHistoryEntry {
  const row = asRecord(raw);
  const toStatus = str(row.toStatus) || null;
  const fromStatus = str(row.fromStatus) || null;
  const kind =
    (str(row.kind) as EccIssueHistoryEntry["kind"]) ||
    (toStatus === "escalated"
      ? "escalation"
      : toStatus === "resolved"
        ? "resolution"
        : toStatus === "closed"
          ? "closure"
          : "status_change");
  return {
    id: str(row.id) || `ECC-IH-${Math.random().toString(36).slice(2, 8)}`,
    at: str(row.at) || new Date().toISOString(),
    byName: str(row.byName),
    kind,
    fromStatus: fromStatus as EccIssueHistoryEntry["fromStatus"],
    toStatus: toStatus as EccIssueHistoryEntry["toStatus"],
    note: str(row.note) || undefined,
  };
}

export function normalizeIssue(raw: unknown): EccIssue | null {
  const row = asRecord(raw);
  if (!str(row.id)) return null;
  const history = Array.isArray(row.history)
    ? row.history.map(normalizeIssueHistory)
    : [];
  return {
    id: str(row.id),
    centreId: str(row.centreId, DEFAULT_ECC_CENTRE.id),
    occurredAt:
      str(row.occurredAt) || str(row.createdAt) || new Date().toISOString(),
    classification: (str(row.classification, "operational") ||
      "operational") as EccIssue["classification"],
    severity: (str(row.severity, "medium") || "medium") as EccIssue["severity"],
    title: str(row.title),
    description: str(row.description),
    status: (str(row.status, "identified") ||
      "identified") as EccIssue["status"],
    reporterName: str(row.reporterName) || str(row.createdByName),
    currentOwnerName:
      str(row.currentOwnerName) || str(row.treatedByName) || undefined,
    history,
    resolutionNotes: str(row.resolutionNotes) || undefined,
    closedAt: str(row.closedAt) || undefined,
    closedByName: str(row.closedByName) || undefined,
    relatedEccRequestId:
      str(row.relatedEccRequestId) || str(row.relatedRequestId) || undefined,
    sourceDailyOpsId: str(row.sourceDailyOpsId) || undefined,
    sourceDailyOpsSection: (str(row.sourceDailyOpsSection) ||
      undefined) as EccIssue["sourceDailyOpsSection"],
    facilityId: str(row.facilityId) || undefined,
    assetId: str(row.assetId) || undefined,
    createdAt: str(row.createdAt) || new Date().toISOString(),
    updatedAt: str(row.updatedAt) || str(row.createdAt),
  };
}

function normalizeRequestHistory(raw: unknown): EccRequestHistoryEntry {
  const row = asRecord(raw);
  const toStatus = str(row.toStatus) || null;
  const fromStatus = str(row.fromStatus) || null;
  const kind =
    (str(row.kind) as EccRequestHistoryEntry["kind"]) ||
    (toStatus === "resolved"
      ? "resolution"
      : toStatus === "closed"
        ? "closure"
        : "status_change");
  return {
    id: str(row.id) || `ECC-RH-${Math.random().toString(36).slice(2, 8)}`,
    at: str(row.at) || new Date().toISOString(),
    byName: str(row.byName),
    kind,
    fromStatus: fromStatus as EccRequestHistoryEntry["fromStatus"],
    toStatus: toStatus as EccRequestHistoryEntry["toStatus"],
    note: str(row.note) || undefined,
  };
}

export function normalizeRequest(raw: unknown): EccRequest | null {
  const row = asRecord(raw);
  if (!str(row.id)) return null;
  const history = Array.isArray(row.history)
    ? row.history.map(normalizeRequestHistory)
    : [];
  return {
    id: str(row.id),
    centreId: str(row.centreId, DEFAULT_ECC_CENTRE.id),
    title: str(row.title),
    reason: str(row.reason) || str(row.description),
    description: str(row.description),
    origin: (str(row.origin, "operational") ||
      "operational") as EccRequest["origin"],
    responsibility: (str(row.responsibility, "company") ||
      "company") as EccRequest["responsibility"],
    priority: (str(row.priority, "medium") || "medium") as EccRequest["priority"],
    status: (str(row.status, "submitted") ||
      "submitted") as EccRequest["status"],
    requestingManagerName:
      str(row.requestingManagerName) || str(row.createdByName),
    currentOwnerName:
      str(row.currentOwnerName) || str(row.currentHandlerName) || undefined,
    history,
    evidenceNotes: str(row.evidenceNotes) || undefined,
    resolutionNotes: str(row.resolutionNotes) || undefined,
    closedAt: str(row.closedAt) || undefined,
    closedByName: str(row.closedByName) || undefined,
    relatedEccIssueId:
      str(row.relatedEccIssueId) || str(row.relatedIssueId) || undefined,
    sourceDailyOpsId: str(row.sourceDailyOpsId) || undefined,
    sourceDailyOpsSection: (str(row.sourceDailyOpsSection) ||
      undefined) as EccRequest["sourceDailyOpsSection"],
    facilityId: str(row.facilityId) || undefined,
    assetId: str(row.assetId) || undefined,
    createdAt: str(row.createdAt) || new Date().toISOString(),
    updatedAt: str(row.updatedAt) || str(row.createdAt),
  };
}

function hydrateState(
  parsed: Partial<EccLocalState> & Record<string, unknown>
): EccLocalState {
  return {
    version: 3,
    centre: (parsed.centre as EccCentre) ?? { ...DEFAULT_ECC_CENTRE },
    dailyOps: Array.isArray(parsed.dailyOps)
      ? parsed.dailyOps
          .map(normalizeDailyOps)
          .filter((row): row is EccDailyOpsRecord => Boolean(row))
      : [],
    issues: Array.isArray(parsed.issues)
      ? parsed.issues
          .map(normalizeIssue)
          .filter((row): row is EccIssue => Boolean(row))
      : [],
    requests: Array.isArray(parsed.requests)
      ? parsed.requests
          .map(normalizeRequest)
          .filter((row): row is EccRequest => Boolean(row))
      : [],
  };
}

/** Shared hydrate for API import + local reads. */
export function hydrateEccLocalStateFromUnknown(raw: unknown): EccLocalState {
  if (!raw || typeof raw !== "object") return emptyState();
  return hydrateState(raw as Partial<EccLocalState> & Record<string, unknown>);
}

export function hasEccLocalDomainData(): boolean {
  if (!canUseStorage()) return false;
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ??
      null;
    if (!raw) return false;
    const state = hydrateEccLocalStateFromUnknown(JSON.parse(raw));
    return (
      state.dailyOps.length > 0 ||
      state.issues.length > 0 ||
      state.requests.length > 0
    );
  } catch {
    return false;
  }
}

export function peekEccLocalDomainState(): EccLocalState | null {
  if (!canUseStorage()) return null;
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      LEGACY_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ??
      null;
    if (!raw) return null;
    return hydrateEccLocalStateFromUnknown(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function isEccLocalMigrated(): boolean {
  if (!canUseStorage()) return false;
  return Boolean(localStorage.getItem(ECC_LOCAL_MIGRATED_KEY));
}

export function markEccLocalMigrated(organisationId?: string): void {
  if (!canUseStorage()) return;
  localStorage.setItem(
    ECC_LOCAL_MIGRATED_KEY,
    JSON.stringify({
      at: new Date().toISOString(),
      organisationId: organisationId ?? null,
    })
  );
}

/** Removes domain blob only — keeps `sentracore.ecc.actingAs` UI preference. */
export function clearEccLocalDomainData(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(STORAGE_KEY);
  for (const key of LEGACY_KEYS) localStorage.removeItem(key);
}

export function readEccLocalState(): EccLocalState {
  if (!canUseStorage()) return emptyState();
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<EccLocalState> &
      Record<string, unknown>;
    const state = hydrateState(parsed);
    if (!localStorage.getItem(STORAGE_KEY)) {
      writeEccLocalState(state);
    }
    return state;
  } catch {
    return emptyState();
  }
}

export function writeEccLocalState(state: EccLocalState): void {
  if (!canUseStorage()) return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...state, version: 3 satisfies 3 })
  );
}

export { newEccId } from "@/modules/ecc-operations/ids";
