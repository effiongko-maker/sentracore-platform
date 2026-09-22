"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PrivateOfficeNote } from "@/modules/private-office/notes/domain";

async function call(action: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch("/api/private-office/notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; message?: string } | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || "The request could not be completed.");
}

function when(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: timeZone ?? "UTC" }).format(new Date(iso));
  } catch {
    return "";
  }
}

type Draft = { id: string | null; title: string; body: string };

/** Plain-text private notes: a chronological list and one editor. No search, tags or rich text. */
export function PrivateOfficeNotes({ notes, timeZone }: { notes: PrivateOfficeNote[]; timeZone: string | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDraft(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || busy) return;
    void run(() =>
      draft.id
        ? call("update", { id: draft.id, input: { title: draft.title, body: draft.body } })
        : call("create", { input: { title: draft.title, body: draft.body } })
    );
  }

  return (
    <section className="scc-notes" aria-label="Private notes">
      <div className="scc-notes-list">
        <div className="scc-notes-head">
          <h2 className="scc-panel-title">Private Notes</h2>
          <button type="button" className="scc-commit-new" onClick={() => { setError(null); setDraft({ id: null, title: "", body: "" }); }}>
            + New Note
          </button>
        </div>
        {notes.length === 0 ? (
          <p className="scc-notes-empty">No private notes yet.</p>
        ) : (
          <ul className="scc-notes-items">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={draft?.id === n.id ? "scc-notes-item is-active" : "scc-notes-item"}
                  onClick={() => { setError(null); setDraft({ id: n.id, title: n.title, body: n.body }); }}
                >
                  <span className="scc-notes-item-title">{n.title}</span>
                  <span className="scc-notes-item-date">{when(n.updatedAt, timeZone)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="scc-notes-editor">
        {draft ? (
          <form className="scc-commit-form" onSubmit={save}>
            <label>
              <span>Title</span>
              <input required maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label>
              <span>Note</span>
              <textarea rows={14} maxLength={20000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </label>
            {error ? <p className="scc-commit-error" role="alert">{error}</p> : null}
            <div className="scc-commit-form-actions">
              <button type="submit" className="scc-commit-btn scc-commit-btn--primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className="scc-commit-btn scc-commit-btn--quiet" disabled={busy} onClick={() => setDraft(null)}>
                Close
              </button>
              {draft.id ? (
                <button
                  type="button"
                  className="scc-commit-btn scc-commit-btn--quiet"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm("Permanently delete this note? This cannot be undone.")) void run(() => call("delete", { id: draft.id }));
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="scc-notes-empty">Select a note, or start a new one.</p>
        )}
      </div>
    </section>
  );
}
