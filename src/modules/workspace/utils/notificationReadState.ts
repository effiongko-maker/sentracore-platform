/**
 * Client-only read/unread state for operational notifications.
 * Does not mutate Issues, Work, Work Orders, Finance, or other records.
 */

// Legacy unscoped reads cannot safely be attributed to any particular user.
const storageKey = (profileId: string) => `sentracore.operationalNotifications.readIds.v2:${profileId}`;
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

export function loadReadNotificationIds(profileId: string): Set<string> {
  if (!profileId || !canUseStorage()) return new Set();
  try {
    const raw = window.localStorage.getItem(storageKey(profileId));
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

function persistReadIds(profileId: string, ids: Set<string>): void {
  if (!profileId || !canUseStorage()) return;
  try {
    window.localStorage.setItem(storageKey(profileId), JSON.stringify([...ids]));
  } catch {
    // Ignore quota / private-mode failures; in-memory state still applies for the session.
  }
  emitReadStateChanged();
}

export function isNotificationRead(
  id: string,
  readIds: Set<string>
): boolean {
  return readIds.has(id);
}

export function markNotificationRead(profileId: string, id: string, readIds?: Set<string>): Set<string> {
  const next = new Set(readIds ?? loadReadNotificationIds(profileId));
  next.add(id);
  persistReadIds(profileId, next);
  return next;
}

export function markAllNotificationsRead(
  profileId: string,
  ids: string[],
  readIds?: Set<string>
): Set<string> {
  const next = new Set(readIds ?? loadReadNotificationIds(profileId));
  for (const id of ids) {
    if (id) next.add(id);
  }
  persistReadIds(profileId, next);
  return next;
}

export function countUnreadNotifications(
  ids: string[],
  readIds: Set<string>
): number {
  return ids.reduce((count, id) => (readIds.has(id) ? count : count + 1), 0);
}

/** Test helper — clears persisted read state. */
export function clearNotificationReadStateForTests(profileId: string): void {
  if (!profileId || !canUseStorage()) return;
  try {
    window.localStorage.removeItem(storageKey(profileId));
  } catch {
    // ignore
  }
  emitReadStateChanged();
}
