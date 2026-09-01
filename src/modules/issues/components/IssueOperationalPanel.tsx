"use client";

import type { IssueAction, IssueOperationalView } from "@/lib/operational/issues";
import { originLabel } from "../lib/buildUnifiedIssueList";

function StatusPill({ label }: { label: string }) {
  return <span className="op-pill">{label.replace(/_/g, " ")}</span>;
}

function treatmentLabel(kind: string): string {
  if (kind === "work" || kind === "maintenance") return "Work";
  if (kind === "incident_handling") return "Legacy investigation";
  if (kind === "work_order") return "Work order";
  return kind.replace(/_/g, " ");
}

export function IssueOperationalPanel({
  view,
  loading,
}: {
  view: IssueOperationalView | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="op-panel rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface)] p-5">
        <p className="text-sm text-[var(--sc-muted)]">Loading Issue…</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="op-panel rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface)] p-5">
        <p className="text-sm text-[var(--sc-muted)]">
          Select an Issue to review details and next steps.
        </p>
      </div>
    );
  }

  const { issue, outcome, executions, actions } = view;
  const primaryActions = actions.filter(
    (a) =>
      a.available &&
      a.href &&
      (a.id === "treat" ||
        a.id === "create_work" ||
        a.id === "view_treatment" ||
        a.id === "cancel")
  );

  return (
    <div className="space-y-4 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface)] p-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[var(--sc-muted)]">
          Issue
        </p>
        <h2 className="text-lg font-semibold text-[var(--sc-fg)]">{issue.title}</h2>
        <p className="text-sm text-[var(--sc-muted)]">
          {issue.reference} · {originLabel(issue)}
        </p>
      </header>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--sc-muted)]">Status</dt>
          <dd>
            <StatusPill label={issue.status} />
          </dd>
        </div>
        <div>
          <dt className="text-[var(--sc-muted)]">Outcome</dt>
          <dd>
            <StatusPill label={outcome.kind} />
            {outcome.summary ? (
              <p className="mt-1 text-[var(--sc-muted)]">{outcome.summary}</p>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--sc-muted)]">Facility</dt>
          <dd>{issue.facilityId}</dd>
        </div>
        <div>
          <dt className="text-[var(--sc-muted)]">Location</dt>
          <dd>{issue.locationDetail || "—"}</dd>
        </div>
        <div>
          <dt className="text-[var(--sc-muted)]">Reported by</dt>
          <dd>
            {issue.reportedBy?.name || "—"}
            {issue.reportedBy?.contact
              ? ` · ${issue.reportedBy.contact}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--sc-muted)]">Type</dt>
          <dd>
            {issue.classification
              ? issue.classification.replace(/_/g, " ")
              : "—"}
          </dd>
        </div>
      </dl>

      {issue.description ? (
        <p className="text-sm text-[var(--sc-fg)]">{issue.description}</p>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-medium">Treatment</h3>
        {issue.treatments.length === 0 ? (
          <p className="text-sm text-[var(--sc-muted)]">No treatment yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {issue.treatments.map((t) => (
              <li key={`${t.kind}:${t.id}`}>
                <span className="font-medium">{treatmentLabel(t.kind)}</span>{" "}
                {t.id} — {t.status.replace(/_/g, " ")}
                {t.title ? ` · ${t.title}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Work</h3>
        {executions.length === 0 ? (
          <p className="text-sm text-[var(--sc-muted)]">
            No formal Work Orders linked.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {executions
              .filter((e) => e.kind === "work_order")
              .map((e) => (
                <li key={`${e.kind}:${e.id}`}>
                  Work Order {e.id} — {e.status.replace(/_/g, " ")}
                  {e.title ? ` · ${e.title}` : ""}
                </li>
              ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Actions</h3>
        {primaryActions.length === 0 ? (
          <p className="text-sm text-[var(--sc-muted)]">No actions available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {primaryActions.map((action: IssueAction) => (
              <a
                key={action.id}
                href={action.href}
                className="inline-flex items-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-bg)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--sc-surface-hover,rgba(0,0,0,0.04))]"
                title={action.description}
              >
                {action.label}
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
