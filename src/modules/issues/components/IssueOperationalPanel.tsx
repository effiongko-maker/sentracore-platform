"use client";

import type { IssueAction, IssueOperationalView } from "@/lib/operational/issues";

function StatusPill({ label }: { label: string }) {
  return <span className="op-pill">{label.replace(/_/g, " ")}</span>;
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
          Select an Issue to inspect the operational lens.
        </p>
      </div>
    );
  }

  const { issue, outcome, executions, actions, limitations } = view;
  const primaryActions = actions.filter(
    (a) =>
      a.available &&
      (a.id === "treat" ||
        a.id === "resolve" ||
        a.id === "investigate" ||
        a.id === "create_work" ||
        a.id === "view_treatment" ||
        a.id === "view_related_work" ||
        a.id === "cancel")
  );

  return (
    <div className="space-y-4 rounded-lg border border-[var(--sc-border)] bg-[var(--sc-surface)] p-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[var(--sc-muted)]">
          Issue lens
        </p>
        <h2 className="text-lg font-semibold text-[var(--sc-fg)]">{issue.title}</h2>
        <p className="text-sm text-[var(--sc-muted)]">
          {issue.reference} · {issue.source.replace(/_/g, " ")}
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
          <dt className="text-[var(--sc-muted)]">Classification</dt>
          <dd>{issue.classification || "—"}</dd>
        </div>
      </dl>

      {issue.description ? (
        <p className="text-sm text-[var(--sc-fg)]">{issue.description}</p>
      ) : null}

      <section>
        <h3 className="mb-2 text-sm font-medium">Treatments</h3>
        {issue.treatments.length === 0 ? (
          <p className="text-sm text-[var(--sc-muted)]">No treatments yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {issue.treatments.map((t) => (
              <li key={`${t.kind}:${t.id}`}>
                <span className="font-medium">{t.kind}</span> {t.id} — {t.status}
                {t.title ? ` · ${t.title}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Execution</h3>
        {executions.length === 0 ? (
          <p className="text-sm text-[var(--sc-muted)]">
            No Work Orders. Job Orders are not implemented.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {executions.map((e) => (
              <li key={`${e.kind}:${e.id}`}>
                {e.kind} {e.id} — {e.status}
                {e.title ? ` · ${e.title}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-medium">Actions</h3>
        <div className="flex flex-wrap gap-2">
          {primaryActions.map((action: IssueAction) =>
            action.href ? (
              <a
                key={action.id}
                href={action.href}
                className="inline-flex items-center rounded-md border border-[var(--sc-border)] bg-[var(--sc-bg)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--sc-surface-hover,rgba(0,0,0,0.04))]"
                title={action.description}
              >
                {action.label}
              </a>
            ) : null
          )}
        </div>
        <ul className="mt-3 space-y-1 text-xs text-[var(--sc-muted)]">
          {actions
            .filter((a) => !a.available)
            .map((a) => (
              <li key={a.id}>
                {a.label}
                {a.future ? " (future)" : ""}: {a.reasonUnavailable}
              </li>
            ))}
        </ul>
      </section>

      {limitations.length > 0 ? (
        <section className="rounded-md border border-dashed border-[var(--sc-border)] p-3 text-xs text-[var(--sc-muted)]">
          {limitations.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      ) : null}
    </div>
  );
}
