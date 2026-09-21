"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CommandCentreSnapshot } from "@/modules/command-centre/presentationTypes";
import {
  commitmentDateLabel,
  type CommitmentView,
} from "@/modules/command-centre/commitments/domain";

type Person = { profileId: string; name: string };
type Draft = { title: string; description: string; assigneeProfileId: string; dueDate: string };
const EMPTY: Draft = { title: "", description: "", assigneeProfileId: "", dueDate: "" };

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("/api/command-centre/commitments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; data?: T; message?: string } | null;
  if (!res.ok || !json?.success) throw new Error(json?.message || "The request could not be completed.");
  return json.data as T;
}

function direction(item: CommitmentView, me: string): string {
  if (item.assigneeProfileId === me && item.createdByProfileId === me) return "Yours";
  if (item.assigneeProfileId === me) return `From ${item.createdByName}`;
  if (item.createdByProfileId === me) return `Delegated to ${item.assigneeName}`;
  return item.assigneeName;
}

function dueLabel(item: CommitmentView): string {
  if (!item.dueDate) return "No due date";
  return item.overdue
    ? `Overdue · was due ${commitmentDateLabel(item.dueDate)}`
    : `Due ${commitmentDateLabel(item.dueDate)}`;
}

/**
 * Executive Commitments — the acting executive's register (delegated + owned). Restrained,
 * data-only surface: no priority, tags or subtasks. Mutations are authorised on the server;
 * the buttons here are only conveniences.
 */
export function CommitmentsPanel({ commitments }: { commitments: CommandCentreSnapshot["commitments"] }) {
  const router = useRouter();
  const [form, setForm] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Not offered to this identity — a restriction, not a failure and not an empty register.
  if (commitments.state === "restricted") return null;

  async function openForm(id: string | null, draft: Draft) {
    setError(null);
    setForm({ id, draft });
    if (!people) {
      try {
        setPeople(await call<Person[]>("listAssignees"));
      } catch (e) {
        setError(e instanceof Error ? e.message : "People could not be loaded.");
      }
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setForm(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form || busy) return;
    const d = form.draft;
    void run(() =>
      form.id
        ? call("update", { id: form.id, input: { title: d.title, description: d.description, assigneeProfileId: d.assigneeProfileId, dueDate: d.dueDate || null } })
        : call("create", { input: { title: d.title, description: d.description, assigneeProfileId: d.assigneeProfileId, dueDate: d.dueDate || null } })
    );
  }

  const row = (item: CommitmentView) => (
    <li key={item.id} className="scc-commit-row">
      <div className="scc-commit-main">
        <span className="scc-commit-title">{item.title}</span>
        <span className={item.overdue ? "scc-commit-meta scc-commit-meta--overdue" : "scc-commit-meta"}>
          {direction(item, commitments.currentProfileId)} · {item.status === "completed" ? "Completed" : dueLabel(item)}
        </span>
      </div>
      {commitments.canManage && item.status === "open" ? (
        <div className="scc-commit-actions">
          <button type="button" className="scc-commit-btn" disabled={busy} onClick={() => void run(() => call("complete", { id: item.id }))}>
            Complete
          </button>
          <button
            type="button"
            className="scc-commit-btn"
            disabled={busy}
            onClick={() => void openForm(item.id, { title: item.title, description: item.description ?? "", assigneeProfileId: item.assigneeProfileId, dueDate: item.dueDate ?? "" })}
          >
            Edit
          </button>
          <button
            type="button"
            className="scc-commit-btn scc-commit-btn--quiet"
            disabled={busy}
            onClick={() => {
              if (window.confirm("Cancel this commitment? It stays in the record as cancelled.")) void run(() => call("cancel", { id: item.id }));
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </li>
  );

  const outstanding = commitments.overdue.length + commitments.open.length;

  return (
    <article className="scc-panel scc-panel--commitments" id="commitments" aria-labelledby="scc-commitments">
      <div className="scc-panel-head">
        <h2 id="scc-commitments" className="scc-panel-title">
          Commitments
        </h2>
        {commitments.canManage && !form ? (
          <button type="button" className="scc-commit-new" onClick={() => void openForm(null, EMPTY)}>
            + New Commitment
          </button>
        ) : null}
      </div>

      {form ? (
        <form className="scc-commit-form" onSubmit={submit}>
          <label>
            <span>Commitment</span>
            <input
              required
              maxLength={200}
              value={form.draft.title}
              onChange={(e) => setForm({ ...form, draft: { ...form.draft, title: e.target.value } })}
              placeholder="What is being committed?"
            />
          </label>
          <label>
            <span>Context (optional)</span>
            <textarea
              rows={2}
              maxLength={2000}
              value={form.draft.description}
              onChange={(e) => setForm({ ...form, draft: { ...form.draft, description: e.target.value } })}
            />
          </label>
          <div className="scc-commit-form-row">
            <label>
              <span>Owner</span>
              <select
                required
                value={form.draft.assigneeProfileId}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, assigneeProfileId: e.target.value } })}
                disabled={!people}
              >
                <option value="">{people ? "Select a person" : "Loading people…"}</option>
                {(people ?? []).map((p) => (
                  <option key={p.profileId} value={p.profileId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Due date (optional)</span>
              <input
                type="date"
                value={form.draft.dueDate}
                onChange={(e) => setForm({ ...form, draft: { ...form.draft, dueDate: e.target.value } })}
              />
            </label>
          </div>
          {error ? <p className="scc-commit-error" role="alert">{error}</p> : null}
          <div className="scc-commit-form-actions">
            <button type="submit" className="scc-commit-btn scc-commit-btn--primary" disabled={busy}>
              {busy ? "Saving…" : form.id ? "Save changes" : "Add commitment"}
            </button>
            <button type="button" className="scc-commit-btn scc-commit-btn--quiet" disabled={busy} onClick={() => { setForm(null); setError(null); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : error ? (
        <p className="scc-commit-error" role="alert">{error}</p>
      ) : null}

      {commitments.state === "error" ? (
        <div className="scc-quiet-empty">
          <p>{commitments.reason ?? "Commitments could not be loaded."}</p>
        </div>
      ) : (
        <>
          {outstanding === 0 ? (
            <div className="scc-quiet-empty">
              <p>No outstanding commitments.</p>
            </div>
          ) : (
            <>
              {commitments.overdue.length > 0 ? (
                <>
                  <p className="scc-commit-group">Overdue</p>
                  <ul className="scc-commit-list">{commitments.overdue.map(row)}</ul>
                </>
              ) : null}
              {commitments.open.length > 0 ? (
                <>
                  <p className="scc-commit-group">Open</p>
                  <ul className="scc-commit-list">{commitments.open.map(row)}</ul>
                </>
              ) : null}
            </>
          )}
          {commitments.completed.length > 0 ? (
            <>
              <p className="scc-commit-group">Recently completed</p>
              <ul className="scc-commit-list">{commitments.completed.map(row)}</ul>
            </>
          ) : null}
        </>
      )}
    </article>
  );
}
