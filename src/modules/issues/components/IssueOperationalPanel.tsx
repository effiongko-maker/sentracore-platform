"use client";

import type { ReactNode } from "react";
import type { Issue, IssueAction, IssueOperationalView } from "@/lib/operational/issues";
import { useFacilityName } from "@/hooks/useEntityLabel";
import { formatDate } from "@/lib/utils";
import { originLabel } from "../lib/buildUnifiedIssueList";

function treatmentLabel(kind: string): string {
  if (kind === "work" || kind === "maintenance") return "Work";
  if (kind === "incident_handling") return "Legacy investigation";
  if (kind === "work_order") return "Work order";
  return kind.replace(/_/g, " ");
}

/** Presentation only: an imported record reads as "Historical"; every other origin keeps its existing label. */
export function issueOriginDisplay(issue: Issue): string {
  return issue.recordOrigin === "migrated_historical" ? "Historical" : originLabel(issue);
}

/** Presentation only: a stored "unknown" (historical source did not record it) reads as "Not recorded". */
export function issueStateDisplay(value: string | undefined | null): string | null {
  if (!value) return null;
  if (value === "unknown") return "Not recorded";
  return value.replace(/_/g, " ");
}

const LONG_TITLE = 140;

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--sc-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-[var(--sc-fg)]">{children}</dd>
    </div>
  );
}

function Empty() {
  return <span className="text-[var(--sc-muted)]">—</span>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--sc-muted)]">{children}</h3>
  );
}

export function IssueOperationalPanel({
  view,
  loading,
  canCreate = true,
  canMutate = true,
}: {
  view: IssueOperationalView | null;
  loading?: boolean;
  /** ops.create — log / create work style actions */
  canCreate?: boolean;
  /** ops.edit — treat / cancel style actions */
  canMutate?: boolean;
}) {
  const facilityName = useFacilityName(view?.issue.facilityId);
  const frame =
    "rounded-xl border border-[var(--sc-border)] bg-[var(--sc-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

  if (loading) {
    return (
      <div className={`op-panel ${frame} p-6`}>
        <p className="text-sm text-[var(--sc-muted)]">Loading Issue…</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className={`op-panel ${frame} p-6`}>
        <p className="text-sm text-[var(--sc-muted)]">
          Select an Issue to review details and next steps.
        </p>
      </div>
    );
  }

  const { issue, outcome, executions, actions } = view;
  const primaryActions = actions.filter((a) => {
    if (!a.available || !a.href) return false;
    if (a.id === "view_treatment") return true;
    if (a.id === "create_work") return canCreate;
    if (a.id === "treat" || a.id === "cancel") return canMutate;
    return false;
  });

  const status = issueStateDisplay(issue.status);
  const outcomeKind = issueStateDisplay(outcome.kind);
  const title = issue.title.trim();
  const description = issue.description?.trim() ?? "";
  // The header clamps the title; the full text stays readable once under Details — never repeated verbatim.
  const detailsText =
    description && description !== title ? description : title.length > LONG_TITLE ? title : "";
  const workOrders = executions.filter((e) => e.kind === "work_order");
  const identity = [issueOriginDisplay(issue), facilityName].filter(Boolean).join(" · ");

  return (
    <article className={`${frame} divide-y divide-[var(--sc-border)]`} aria-label={`Issue ${issue.reference}`}>
      <header className="px-6 pb-4 pt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--sc-muted)]">
          Issue · <span className="font-mono normal-case tracking-normal">{issue.reference}</span>
        </p>
        <h2 className="mt-1.5 line-clamp-3 text-base font-semibold leading-snug text-[var(--sc-fg)]" title={title}>
          {title}
        </h2>
        {identity ? <p className="mt-1 text-xs text-[var(--sc-muted)]">{identity}</p> : null}
      </header>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-6 py-4 sm:grid-cols-3">
        <Meta label="Status">
          {status ? (
            <span className={issue.status === "unknown" ? "text-[var(--sc-muted)]" : "font-medium capitalize"}>{status}</span>
          ) : (
            <Empty />
          )}
        </Meta>
        <Meta label="Outcome">
          {outcomeKind ? (
            <span className={outcome.kind === "unknown" ? "text-[var(--sc-muted)]" : "capitalize"}>{outcomeKind}</span>
          ) : (
            <Empty />
          )}
          {outcome.summary ? (
            <span className="mt-0.5 block text-xs text-[var(--sc-muted)]">{outcome.summary}</span>
          ) : null}
        </Meta>
        <Meta label="Facility">{facilityName || <Empty />}</Meta>
        <Meta label="Location">{issue.locationDetail || <Empty />}</Meta>
        <Meta label="Reported by">
          {issue.reportedBy?.name ? (
            <>
              {issue.reportedBy.name}
              {issue.reportedBy.contact ? (
                <span className="block text-xs text-[var(--sc-muted)]">{issue.reportedBy.contact}</span>
              ) : null}
            </>
          ) : (
            <Empty />
          )}
        </Meta>
        <Meta label="Type">
          {issue.classification ? <span className="capitalize">{issue.classification.replace(/_/g, " ")}</span> : <Empty />}
        </Meta>
      </dl>

      {detailsText ? (
        <section className="px-6 py-4">
          <SectionTitle>Details</SectionTitle>
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--sc-fg)]">{detailsText}</p>
        </section>
      ) : null}

      {issue.historicalSource ? (
        <section aria-label="Source record" className="px-6 py-4">
          <SectionTitle>Source record</SectionTitle>
          <p className="mb-3 text-xs text-[var(--sc-muted)]">
            Imported historical incident {issue.historicalSource.reference} — read-only source evidence. It was not
            treated in SentraCore and cannot be changed.
          </p>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <Meta label="Reported">
              {issue.historicalSource.reportedAt ? formatDate(issue.historicalSource.reportedAt) : <Empty />}
            </Meta>
            <Meta label="Root cause">{issue.historicalSource.rootCause || <Empty />}</Meta>
            <Meta label="Corrective action">{issue.historicalSource.correctiveActions || <Empty />}</Meta>
          </dl>
        </section>
      ) : null}

      <section className="px-6 py-4">
        <SectionTitle>Treatment</SectionTitle>
        {issue.treatments.length === 0 ? (
          <p className="text-sm text-[var(--sc-muted)]">No treatment yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {issue.treatments.map((t) => (
              <li key={`${t.kind}:${t.id}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{treatmentLabel(t.kind)}</span>
                <span className="font-mono text-xs text-[var(--sc-muted)]">{t.id}</span>
                <span className="text-[var(--sc-muted)]">· {issueStateDisplay(t.status)}</span>
                {t.title && t.title.trim() !== title ? (
                  <span className="basis-full truncate text-xs text-[var(--sc-muted)]" title={t.title}>
                    {t.title}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <p className="text-xs font-medium text-[var(--sc-muted)]">Work Orders</p>
          {workOrders.length === 0 ? (
            <p className="mt-0.5 text-sm text-[var(--sc-muted)]">No formal Work Orders linked.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {workOrders.map((e) => (
                <li key={`${e.kind}:${e.id}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-xs">{e.id}</span>
                  <span className="text-[var(--sc-muted)]">· {issueStateDisplay(e.status)}</span>
                  {e.title && e.title.trim() !== title ? (
                    <span className="basis-full truncate text-xs text-[var(--sc-muted)]" title={e.title}>
                      {e.title}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <footer className="px-6 py-4">
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
      </footer>
    </article>
  );
}
