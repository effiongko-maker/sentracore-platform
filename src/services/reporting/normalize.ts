/**
 * Centralized token normalization for reporting KPI / projection logic.
 * Sheet values often arrive as "Active", "Operational", etc.
 */

export function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Facility / user “active” postures from live sheets. */
const ACTIVE_ENTITY = new Set([
  "active",
  "operational",
  "in_service",
  "online",
  "open",
]);

/** Explicitly inactive / offline postures. */
const INACTIVE_ENTITY = new Set([
  "inactive",
  "deactivated",
  "decommissioned",
  "offline",
  "archived",
  "closed",
  "cancelled",
  "canceled",
  "suspended",
]);

/** Asset counts as operational / available. */
const OPERATIONAL_ASSET = new Set([
  "active",
  "operational",
  "in_service",
  "online",
  "available",
]);

const OPEN_WORK_ORDER = new Set([
  "draft",
  "open",
  "assigned",
  "in_progress",
  "on_hold",
]);

const CLOSED_WORK_ORDER = new Set([
  "completed",
  "closed",
  "cancelled",
  "canceled",
]);

const MAINTENANCE_BACKLOG = new Set([
  "requested",
  "triaged",
  "scheduled",
  "in_progress",
  "on_hold",
]);

const CLOSED_INCIDENT = new Set([
  "resolved",
  "closed",
  "cancelled",
  "canceled",
]);

export function isActiveEntityStatus(status: unknown): boolean {
  const token = normalizeToken(status);
  if (!token) return false;
  if (INACTIVE_ENTITY.has(token)) return false;
  return ACTIVE_ENTITY.has(token);
}

export function isInactiveEntityStatus(status: unknown): boolean {
  const token = normalizeToken(status);
  return INACTIVE_ENTITY.has(token);
}

export function isOperationalAssetStatus(status: unknown): boolean {
  const token = normalizeToken(status);
  if (!token) return false;
  if (INACTIVE_ENTITY.has(token)) return false;
  return OPERATIONAL_ASSET.has(token) || ACTIVE_ENTITY.has(token);
}

export function isOpenWorkOrderStatus(status: unknown): boolean {
  return OPEN_WORK_ORDER.has(normalizeToken(status));
}

export function isClosedWorkOrderStatus(status: unknown): boolean {
  return CLOSED_WORK_ORDER.has(normalizeToken(status));
}

export function isMaintenanceBacklogStatus(status: unknown): boolean {
  return MAINTENANCE_BACKLOG.has(normalizeToken(status));
}

export function isClosedIncidentStatus(status: unknown): boolean {
  return CLOSED_INCIDENT.has(normalizeToken(status));
}

export function isCriticalSeverity(severity: unknown): boolean {
  return normalizeToken(severity) === "critical";
}

export function isHighOrCriticalPriority(priority: unknown): boolean {
  const token = normalizeToken(priority);
  return token === "high" || token === "critical";
}

export function isOnHoldStatus(status: unknown): boolean {
  return normalizeToken(status) === "on_hold";
}

export function isPoorCondition(condition: unknown): boolean {
  return normalizeToken(condition) === "poor";
}

/**
 * Coerce sheet/Date/string values to ISO-8601 UTC.
 * Invalid values fall back to `fallback` (default: now).
 */
export function toIsoUtc(
  value: unknown,
  fallback: string = new Date().toISOString()
): string {
  if (value == null || value === "") return fallback;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber.toISOString();
  }

  const text = String(value).trim();
  if (!text) return fallback;

  // Already ISO-like — normalize via Date for UTC Z form.
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();

  return fallback;
}

export function ageInSeconds(generatedAt: string, now = Date.now()): number {
  const ms = Date.parse(generatedAt);
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.floor((now - ms) / 1000));
}
