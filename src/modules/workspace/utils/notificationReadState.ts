/**
 * Client-only read/unread state for operational notifications.
 * Does not mutate Issues, Work, Work Orders, Finance, or other records.
 */

const STORAGE_KEY = "sentracore.operationalNotifications.readIds.v1";
export const NOTIFICATION_READ_STATE_EVENT =
  "sentracore:operational-notifications-read";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function emitReadStateChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(NOTIFICATION_READ_STATE_EVENT));
  } catch {
    // ignore
  }
}

export function loadReadNotificationIds(): Set<string> {
  if (!canUseStorage()) return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
    );
  } catch {
    return new Set();
  }
}

function persistReadIds(ids: Set<string>): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Ignore quota / private-mode failures; in-memory state still applies for the session.
  }
  emitReadStateChanged();
}

export function isNotificationRead(
  id: string,
  readIds: Set<string> = loadReadNotificationIds()
): boolean {
  return readIds.has(id);
}

export function markNotificationRead(id: string, readIds?: Set<string>): Set<string> {
  const next = new Set(readIds ?? loadReadNotificationIds());
  next.add(id);
  persistReadIds(next);
  return next;
}

export function markAllNotificationsRead(
  ids: string[],
  readIds?: Set<string>
): Set<string> {
  const next = new Set(readIds ?? loadReadNotificationIds());
  for (const id of ids) {
    if (id) next.add(id);
  }
  persistReadIds(next);
  return next;
}

export function countUnreadNotifications(
  ids: string[],
  readIds: Set<string> = loadReadNotificationIds()
): number {
  return ids.reduce((count, id) => (readIds.has(id) ? count : count + 1), 0);
}

/** Test helper — clears persisted read state. */
export function clearNotificationReadStateForTests(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emitReadStateChanged();
}
