import { createAdminClient } from "@/utils/supabase/admin";

export type OperationalLeaseResultEntityType =
  | "maintenance"
  | "work_order"
  | "incident";

type LeaseRow = {
  id: string;
  organisation_id: string;
  scope_key: string;
  status: "in_progress" | "completed" | "failed";
  result_entity_type: string | null;
  result_entity_id: string | null;
  error_message: string | null;
  updated_at: string;
};

const STALE_MS = 45_000;
const POLL_MS = 200;
const MAX_WAIT_MS = 40_000;

/** Process-local mutex — serialises concurrent callers in the same Node process. */
const localGates = new Map<string, Promise<void>>();

async function withLocalGate<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = localGates.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  localGates.set(
    key,
    previous.then(() => gate)
  );
  await previous;
  try {
    return await run();
  } finally {
    release();
    if (localGates.get(key) === gate) {
      localGates.delete(key);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLease(
  organisationId: string,
  scopeKey: string
): Promise<LeaseRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("operational_action_leases")
    .select(
      "id, organisation_id, scope_key, status, result_entity_type, result_entity_id, error_message, updated_at"
    )
    .eq("organisation_id", organisationId)
    .eq("scope_key", scopeKey)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read operational action lease: ${error.message}`);
  }
  return (data as LeaseRow | null) ?? null;
}

async function tryClaimLease(options: {
  organisationId: string;
  scopeKey: string;
  actorProfileId?: string | null;
}): Promise<"claimed" | "exists"> {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("operational_action_leases").insert({
    organisation_id: options.organisationId,
    scope_key: options.scopeKey,
    status: "in_progress",
    actor_profile_id: options.actorProfileId ?? null,
    created_at: now,
    updated_at: now,
  });

  if (!error) return "claimed";

  // Unique violation → another request owns/owned the scope.
  if (error.code === "23505") return "exists";

  throw new Error(`Failed to claim operational action lease: ${error.message}`);
}

async function tryTakeoverStaleLease(options: {
  organisationId: string;
  scopeKey: string;
  actorProfileId?: string | null;
}): Promise<boolean> {
  const lease = await readLease(options.organisationId, options.scopeKey);
  if (!lease || lease.status !== "in_progress") return false;

  const age = Date.now() - Date.parse(lease.updated_at);
  if (!Number.isFinite(age) || age < STALE_MS) return false;

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("operational_action_leases")
    .update({
      status: "in_progress",
      actor_profile_id: options.actorProfileId ?? null,
      error_message: null,
      updated_at: now,
    })
    .eq("id", lease.id)
    .eq("status", "in_progress")
    .eq("updated_at", lease.updated_at)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to take over stale lease: ${error.message}`);
  }
  return Boolean(data);
}

async function completeLease(options: {
  organisationId: string;
  scopeKey: string;
  entityType: OperationalLeaseResultEntityType;
  entityId: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("operational_action_leases")
    .update({
      status: "completed",
      result_entity_type: options.entityType,
      result_entity_id: options.entityId,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organisation_id", options.organisationId)
    .eq("scope_key", options.scopeKey)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to complete operational action lease: ${error.message}`
    );
  }
  if (!data) {
    throw new Error(
      `Failed to complete operational action lease: no row for ${options.scopeKey}`
    );
  }
}

async function failLease(options: {
  organisationId: string;
  scopeKey: string;
  message: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("operational_action_leases")
    .update({
      status: "failed",
      error_message: options.message.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("organisation_id", options.organisationId)
    .eq("scope_key", options.scopeKey);

  if (error) {
    console.error("[operational_action_leases] fail mark failed", {
      scopeKey: options.scopeKey,
      error: error.message,
    });
  }
}

async function waitForCompletedLease(
  organisationId: string,
  scopeKey: string
): Promise<LeaseRow | null> {
  const started = Date.now();
  while (Date.now() - started < MAX_WAIT_MS) {
    const lease = await readLease(organisationId, scopeKey);
    if (!lease) return null;
    if (lease.status === "completed") return lease;
    if (lease.status === "failed") return lease;
    if (lease.status === "in_progress") {
      const age = Date.now() - Date.parse(lease.updated_at);
      if (Number.isFinite(age) && age >= STALE_MS) {
        return lease;
      }
    }
    await sleep(POLL_MS);
  }
  return readLease(organisationId, scopeKey);
}

async function recoverWithRetry<T>(options: {
  recoverExisting: () => Promise<{ entityId: string; value: T } | null>;
  loadByEntityId?: (
    entityId: string
  ) => Promise<{ entityId: string; value: T } | null>;
  leaseResultEntityId?: string | null;
  attempts?: number;
}): Promise<{ entityId: string; value: T } | null> {
  const attempts = options.attempts ?? 8;
  for (let i = 0; i < attempts; i++) {
    const recovered = await options.recoverExisting();
    if (recovered) return recovered;

    if (options.leaseResultEntityId && options.loadByEntityId) {
      const byId = await options.loadByEntityId(options.leaseResultEntityId);
      if (byId) return byId;
    }

    if (i < attempts - 1) await sleep(POLL_MS);
  }
  return null;
}

/**
 * Serialise an operational create/link action across concurrent requests.
 *
 * Sheets remains the entity source of truth. Supabase leases only ensure that
 * two first-time creators cannot both decide "no linked record exists".
 *
 * Fallback: if the lease table is unavailable, runs with process-local gating
 * only and re-checks Sheets before create (documented residual multi-instance risk).
 */
export async function runExclusiveOperationalAction<T>(options: {
  organisationId: string;
  scopeKey: string;
  actorProfileId?: string | null;
  entityType: OperationalLeaseResultEntityType;
  /**
   * Re-read authoritative Sheets state. If a linked entity already exists,
   * return it without creating.
   */
  recoverExisting: () => Promise<{ entityId: string; value: T } | null>;
  /**
   * Optional: load by the entity id stored on a completed lease (Sheets lag).
   */
  loadByEntityId?: (
    entityId: string
  ) => Promise<{ entityId: string; value: T } | null>;
  /**
   * Create + link when this caller owns the lease and recoverExisting is null.
   * Must return the durable entity id for lease completion.
   */
  create: () => Promise<{ entityId: string; value: T }>;
}): Promise<T> {
  const gateKey = `${options.organisationId}:${options.scopeKey}`;

  return withLocalGate(gateKey, async () => {
    let leaseAvailable = true;

    try {
      createAdminClient();
    } catch {
      leaseAvailable = false;
    }

    const existingBefore = await options.recoverExisting();
    if (existingBefore) return existingBefore.value;

    if (!leaseAvailable) {
      // Process-local only — another Node instance can still race.
      const created = await options.create();
      return created.value;
    }

    let claim: "claimed" | "exists";
    try {
      claim = await tryClaimLease({
        organisationId: options.organisationId,
        scopeKey: options.scopeKey,
        actorProfileId: options.actorProfileId,
      });
    } catch (leaseError) {
      // Documented fallback: lease table / network unavailable → local gate only.
      console.warn(
        "[runExclusiveOperationalAction] lease unavailable; continuing with process-local gate",
        {
          scopeKey: options.scopeKey,
          error:
            leaseError instanceof Error
              ? leaseError.message
              : String(leaseError),
        }
      );
      const created = await options.create();
      return created.value;
    }

    if (claim === "exists") {
      const waited = await waitForCompletedLease(
        options.organisationId,
        options.scopeKey
      );

      if (waited?.status === "completed") {
        const recovered = await recoverWithRetry({
          recoverExisting: options.recoverExisting,
          loadByEntityId: options.loadByEntityId,
          leaseResultEntityId: waited.result_entity_id,
        });
        if (recovered) return recovered.value;
        throw new Error(
          `Operational action lease completed for ${options.scopeKey} but linked entity is not recoverable`
        );
      }

      if (waited?.status === "in_progress") {
        const tookOver = await tryTakeoverStaleLease({
          organisationId: options.organisationId,
          scopeKey: options.scopeKey,
          actorProfileId: options.actorProfileId,
        });
        if (!tookOver) {
          const recovered = await recoverWithRetry({
            recoverExisting: options.recoverExisting,
            loadByEntityId: options.loadByEntityId,
            leaseResultEntityId: waited.result_entity_id,
            attempts: 4,
          });
          if (recovered) return recovered.value;
          throw new Error(
            `Operational action still in progress for ${options.scopeKey}`
          );
        }
        claim = "claimed";
      } else if (waited?.status === "failed" || !waited) {
        const admin = createAdminClient();
        const now = new Date().toISOString();
        const { data, error } = await admin
          .from("operational_action_leases")
          .update({
            status: "in_progress",
            result_entity_type: null,
            result_entity_id: null,
            error_message: null,
            actor_profile_id: options.actorProfileId ?? null,
            updated_at: now,
          })
          .eq("organisation_id", options.organisationId)
          .eq("scope_key", options.scopeKey)
          .eq("status", "failed")
          .select("id")
          .maybeSingle();

        if (error) {
          throw new Error(`Failed to reclaim failed lease: ${error.message}`);
        }
        if (data) {
          claim = "claimed";
        } else {
          const recovered = await options.recoverExisting();
          if (recovered) return recovered.value;
          claim = await tryClaimLease({
            organisationId: options.organisationId,
            scopeKey: options.scopeKey,
            actorProfileId: options.actorProfileId,
          });
          if (claim === "exists") {
            const recoveredAgain = await recoverWithRetry({
              recoverExisting: options.recoverExisting,
              loadByEntityId: options.loadByEntityId,
              attempts: 4,
            });
            if (recoveredAgain) return recoveredAgain.value;
            throw new Error(
              `Unable to claim operational action lease for ${options.scopeKey}`
            );
          }
        }
      } else {
        // Unexpected lease state — never create without ownership.
        const recovered = await options.recoverExisting();
        if (recovered) return recovered.value;
        throw new Error(
          `Unable to claim operational action lease for ${options.scopeKey}`
        );
      }
    }

    // Hard guard: never create unless this caller owns the lease.
    if (claim !== "claimed") {
      const recovered = await options.recoverExisting();
      if (recovered) return recovered.value;
      throw new Error(
        `Operational action lease not owned for ${options.scopeKey}`
      );
    }

    const existingUnderLease = await options.recoverExisting();
    if (existingUnderLease) {
      await completeLease({
        organisationId: options.organisationId,
        scopeKey: options.scopeKey,
        entityType: options.entityType,
        entityId: existingUnderLease.entityId,
      });
      return existingUnderLease.value;
    }

    try {
      const created = await options.create();
      await completeLease({
        organisationId: options.organisationId,
        scopeKey: options.scopeKey,
        entityType: options.entityType,
        entityId: created.entityId,
      });
      return created.value;
    } catch (error) {
      await failLease({
        organisationId: options.organisationId,
        scopeKey: options.scopeKey,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}

export function incidentMaintenanceLeaseKey(incidentId: string): string {
  return `incident:${incidentId}:link_maintenance`;
}

export function incidentWorkOrderLeaseKey(incidentId: string): string {
  return `incident:${incidentId}:link_work_order`;
}

export function maintenanceWorkOrderLeaseKey(maintenanceId: string): string {
  return `maintenance:${maintenanceId}:link_work_order`;
}

/** Per-submit key — allows multiple treatments over time; blocks double-click. */
export function requestCreateMaintenanceLeaseKey(
  requestId: string,
  idempotencyKey: string
): string {
  return `request:${requestId}:create_maintenance:${idempotencyKey}`;
}

export function requestCreateIncidentLeaseKey(
  requestId: string,
  idempotencyKey: string
): string {
  return `request:${requestId}:create_incident:${idempotencyKey}`;
}

export function requestLinkMaintenanceLeaseKey(
  requestId: string,
  maintenanceId: string
): string {
  return `request:${requestId}:link_maintenance:${maintenanceId}`;
}

export function requestLinkIncidentLeaseKey(
  requestId: string,
  incidentId: string
): string {
  return `request:${requestId}:link_incident:${incidentId}`;
}
