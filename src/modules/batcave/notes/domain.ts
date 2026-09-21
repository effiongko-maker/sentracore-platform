/**
 * Batcave Private Executive Notes — pure domain rules (no I/O).
 * A note is private executive thinking: a title and a plain-text body, owned by one profile.
 * Deliberately tiny — no tags, folders, sharing, reminders, attachments, versions or AI metadata.
 */

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 20000;

export type BatcaveNote = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type NoteInput = { title?: unknown; body?: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isNoteId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Only title and body are ever accepted from a client; anything else (owner, organisation…) is ignored. */
export function validateNoteInput(
  input: NoteInput,
  options: { requireTitle: boolean }
): { ok: true; value: { title?: string; body?: string } } | { ok: false; message: string } {
  const value: { title?: string; body?: string } = {};
  if (input.title !== undefined || options.requireTitle) {
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (!title) return { ok: false, message: "A title is required." };
    if (title.length > NOTE_TITLE_MAX) return { ok: false, message: `Title must be ${NOTE_TITLE_MAX} characters or fewer.` };
    value.title = title;
  }
  if (input.body !== undefined) {
    if (typeof input.body !== "string") return { ok: false, message: "Note text must be plain text." };
    if (input.body.length > NOTE_BODY_MAX) return { ok: false, message: `A note can hold up to ${NOTE_BODY_MAX} characters.` };
    value.body = input.body;
  }
  if (Object.keys(value).length === 0) return { ok: false, message: "Nothing to save." };
  return { ok: true, value };
}
