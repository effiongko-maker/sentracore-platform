/**
 * Present-tense truth for ECC shifts and attendance.
 *
 * `is_current` is an administrative flag, not a fact about "now". A shift is
 * operationally current only while `startsAt <= now < endsAt` (absolute
 * timestamps, so overnight shifts work naturally). Open attendance is "on duty"
 * only while it reconciles to that effective shift. Historical rows are never
 * mutated — they simply stop being presented as live.
 */

export type ShiftWindow = { startsAt: string; endsAt: string };

export function isShiftEffective(shift: ShiftWindow, now: Date = new Date()): boolean {
  const start = Date.parse(shift.startsAt);
  const end = Date.parse(shift.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  const t = now.getTime();
  return start <= t && t < end;
}

export type OpenAttendanceLike = {
  shiftId?: string | null;
  signedInAt?: string | null;
  signedOutAt?: string | null;
};

/**
 * An attendance row counts as currently on duty only when it is still open AND
 * the centre has an effective shift AND the sign-in belongs to that shift
 * (same shift id, or signed in inside its window).
 */
export function isAttendanceLive(
  row: OpenAttendanceLike,
  shift: (ShiftWindow & { id: string }) | null,
  now: Date = new Date()
): boolean {
  if (row.signedOutAt || !row.signedInAt) return false;
  if (!shift || !isShiftEffective(shift, now)) return false;
  if (row.shiftId && row.shiftId === shift.id) return true;
  const signedIn = Date.parse(row.signedInAt);
  return (
    Number.isFinite(signedIn) &&
    signedIn >= Date.parse(shift.startsAt) &&
    signedIn < Date.parse(shift.endsAt)
  );
}
