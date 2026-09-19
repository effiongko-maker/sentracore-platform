/**
 * Intelligence authority reconciliation (pure — no I/O).
 *
 * Law: authoritative FM domains establish operational reality. The event
 * ledger only describes the history of those records. An event contributes to
 * LIVE intelligence only when its subject resolves — by canonical UUID, inside
 * the same organisation — to an existing authoritative FM record.
 *
 * Identity is never taken from event text: display codes in `entity_id` are
 * NOT accepted as identity (legacy events therefore stay in the ledger but are
 * excluded from live analysis). Facility / asset / relationship references
 * carried in `data` are re-derived from the authoritative record (or dropped);
 * display codes emitted into the projection come from the authoritative row.
 */

export type AuthoritativeKind =
  | "work"
  | "work_instruction"
  | "request"
  | "incident"
  | "approval";

export type AuthoritativeRecord = {
  id: string;
  code: string;
  /** Owning facility UUID when the domain carries one (approvals do not). */
  facilityId: string | null;
};

export type AuthoritativeCounts = {
  work: number;
  workInstructions: number;
  requests: number;
  incidents: number;
  approvals: number;
};

export type AuthorityIndex = {
  organisationId: string;
  facilities: Map<string, { id: string; code: string }>;
  records: Record<AuthoritativeKind, Map<string, AuthoritativeRecord>>;
  assets: Map<string, { id: string; code: string }>;
};

export type AuthoritySnapshot = {
  index: AuthorityIndex;
  counts: AuthoritativeCounts;
};

export type ReconcilableEvent = {
  id: string;
  organisation_id: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown> | null;
};

export type EventExclusionReason =
  | "wrong_organisation"
  | "no_entity"
  | "unsupported_entity"
  | "non_canonical_identity"
  | "entity_not_found";

export type ReconciliationSummary = {
  considered: number;
  reconciled: number;
  excluded: number;
  byReason: Record<EventExclusionReason, number>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCanonicalUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

const KIND_BY_ENTITY_TYPE: Record<string, AuthoritativeKind> = {
  maintenance_request: "work",
  maintenance: "work",
  work: "work",
  work_order: "work_instruction",
  work_instruction: "work_instruction",
  request: "request",
  incident: "incident",
  approval: "approval",
};

export function authoritativeKindForEntityType(
  entityType: string | null | undefined
): AuthoritativeKind | null {
  if (!entityType) return null;
  return KIND_BY_ENTITY_TYPE[entityType.trim().toLowerCase()] ?? null;
}

export function emptyAuthorityIndex(organisationId: string): AuthorityIndex {
  return {
    organisationId,
    facilities: new Map(),
    records: {
      work: new Map(),
      work_instruction: new Map(),
      request: new Map(),
      incident: new Map(),
      approval: new Map(),
    },
    assets: new Map(),
  };
}

function normaliseRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Resolve a reference (canonical UUID, or an in-tenant display code) to a record. */
function resolveRecord(
  index: AuthorityIndex,
  kind: AuthoritativeKind,
  ref: unknown
): AuthoritativeRecord | null {
  const value = normaliseRef(ref);
  if (!value) return null;
  const map = index.records[kind];
  if (isCanonicalUuid(value)) return map.get(value.toLowerCase()) ?? null;
  const wanted = value.toLowerCase();
  for (const record of map.values()) {
    if (record.code.toLowerCase() === wanted) return record;
  }
  return null;
}

function resolveFacilityCode(
  index: AuthorityIndex,
  ref: unknown,
  facilityUuid: string | null
): string | null {
  if (facilityUuid) return index.facilities.get(facilityUuid)?.code ?? null;
  const value = normaliseRef(ref);
  if (!value) return null;
  if (isCanonicalUuid(value)) {
    return index.facilities.get(value.toLowerCase())?.code ?? null;
  }
  const wanted = value.toLowerCase();
  for (const facility of index.facilities.values()) {
    if (facility.code.toLowerCase() === wanted) return facility.code;
  }
  return null;
}

function resolveAssetCode(index: AuthorityIndex, ref: unknown): string | null {
  const value = normaliseRef(ref);
  if (!value) return null;
  const hit = index.assets.get(value.toLowerCase());
  return hit?.code ?? null;
}

function emptySummary(considered: number): ReconciliationSummary {
  return {
    considered,
    reconciled: 0,
    excluded: 0,
    byReason: {
      wrong_organisation: 0,
      no_entity: 0,
      unsupported_entity: 0,
      non_canonical_identity: 0,
      entity_not_found: 0,
    },
  };
}

/**
 * Project one reconciled event: identity, facility, asset and relationship
 * references all come from authoritative records. Original event rows are not
 * mutated.
 */
function projectEvent<T extends ReconcilableEvent>(
  event: T,
  kind: AuthoritativeKind,
  record: AuthoritativeRecord,
  index: AuthorityIndex
): T {
  const data = { ...(event.data ?? {}) };

  data.entityUuid = record.id;
  data.facilityId = resolveFacilityCode(index, data.facilityId, record.facilityId);
  data.assetId = resolveAssetCode(index, data.assetId);

  // Relationship references: keep only those that resolve authoritatively,
  // expressed as the authoritative display code (the UI's record identity).
  const work = resolveRecord(index, "work", data.maintenanceId);
  data.maintenanceId = kind === "work" ? record.code : work?.code ?? null;
  const incident = resolveRecord(index, "incident", data.incidentId);
  data.incidentId = kind === "incident" ? record.code : incident?.code ?? null;

  const wiCodes = new Set<string>();
  const ownWorkOrder = resolveRecord(index, "work_instruction", data.workOrderId);
  if (ownWorkOrder) wiCodes.add(ownWorkOrder.code);
  if (kind === "work_instruction") wiCodes.add(record.code);
  const refs = Array.isArray(data.workOrderIds) ? data.workOrderIds : [];
  for (const ref of refs) {
    const resolved = resolveRecord(index, "work_instruction", ref);
    if (resolved) wiCodes.add(resolved.code);
  }
  data.workOrderId = kind === "work_instruction" ? record.code : ownWorkOrder?.code ?? null;
  data.workOrderIds = [...wiCodes];

  return { ...event, entity_id: record.code, data };
}

/**
 * Split events into those that resolve to authoritative FM records (projected)
 * and the rest. Nothing is deleted — exclusion is logical only.
 */
export function reconcileEvents<T extends ReconcilableEvent>(
  events: T[],
  index: AuthorityIndex
): { kept: T[]; summary: ReconciliationSummary } {
  const summary = emptySummary(events.length);
  const kept: T[] = [];

  const exclude = (reason: EventExclusionReason) => {
    summary.excluded += 1;
    summary.byReason[reason] += 1;
  };

  for (const event of events) {
    if (event.organisation_id !== index.organisationId) {
      exclude("wrong_organisation");
      continue;
    }
    if (!event.entity_type || !event.entity_id) {
      exclude("no_entity");
      continue;
    }
    const kind = authoritativeKindForEntityType(event.entity_type);
    if (!kind) {
      exclude("unsupported_entity");
      continue;
    }
    if (!isCanonicalUuid(event.entity_id)) {
      exclude("non_canonical_identity");
      continue;
    }
    const record = index.records[kind].get(event.entity_id.trim().toLowerCase());
    if (!record) {
      exclude("entity_not_found");
      continue;
    }
    kept.push(projectEvent(event, kind, record, index));
    summary.reconciled += 1;
  }

  return { kept, summary };
}

/** Distinct authoritative entities represented by a set of reconciled events. */
export function distinctEntityCount(events: ReconcilableEvent[]): number {
  const ids = new Set<string>();
  for (const event of events) if (event.entity_id) ids.add(event.entity_id);
  return ids.size;
}

/** Distinct authoritative facilities represented by reconciled events. */
export function distinctFacilityCount(events: ReconcilableEvent[]): number {
  const codes = new Set<string>();
  for (const event of events) {
    const value = event.data?.facilityId;
    if (typeof value === "string" && value.trim()) codes.add(value);
  }
  return codes.size;
}

/** Collect the UUID identities and references a loader must resolve. */
export function collectAuthorityLookups(events: ReconcilableEvent[]): {
  uuids: Record<AuthoritativeKind, Set<string>>;
  codes: Record<AuthoritativeKind, Set<string>>;
  assetRefs: Set<string>;
} {
  const uuids: Record<AuthoritativeKind, Set<string>> = {
    work: new Set(),
    work_instruction: new Set(),
    request: new Set(),
    incident: new Set(),
    approval: new Set(),
  };
  const codes: Record<AuthoritativeKind, Set<string>> = {
    work: new Set(),
    work_instruction: new Set(),
    request: new Set(),
    incident: new Set(),
    approval: new Set(),
  };
  const assetRefs = new Set<string>();

  const addRef = (kind: AuthoritativeKind, ref: unknown) => {
    const value = normaliseRef(ref);
    if (!value) return;
    if (isCanonicalUuid(value)) uuids[kind].add(value.toLowerCase());
    else codes[kind].add(value);
  };

  for (const event of events) {
    const kind = authoritativeKindForEntityType(event.entity_type);
    if (kind && event.entity_id && isCanonicalUuid(event.entity_id)) {
      uuids[kind].add(event.entity_id.trim().toLowerCase());
    }
    const data = event.data ?? {};
    addRef("work", data.maintenanceId);
    addRef("incident", data.incidentId);
    addRef("work_instruction", data.workOrderId);
    if (Array.isArray(data.workOrderIds)) {
      for (const ref of data.workOrderIds) addRef("work_instruction", ref);
    }
    const asset = normaliseRef(data.assetId);
    if (asset) assetRefs.add(asset);
  }

  return { uuids, codes, assetRefs };
}
