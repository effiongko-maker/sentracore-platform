import type { ReactNode } from "react";
import {
  ECC_CENTRE_OVERALL_STATUS_LABELS,
  ECC_ISSUE_STATUS_LABELS,
  ECC_REQUEST_STATUS_LABELS,
  ECC_SECTION_CONDITION_LABELS,
  ECC_STAFFING_STATUS_LABELS,
} from "../constants";
import type {
  EccCentreOverallStatus,
  EccIssueStatus,
  EccRequestStatus,
  EccSectionCondition,
  EccStaffingStatus,
} from "../types";

function statusTone(status: string): "ok" | "attention" | "disrupted" | "neutral" {
  if (
    status === "normal" ||
    status === "ready" ||
    status === "operational"
  ) {
    return "ok";
  }
  if (
    status === "issue" ||
    status === "attention" ||
    status === "constrained" ||
    status === "operational_with_issues"
  ) {
    return "attention";
  }
  if (
    status === "disrupted" ||
    status === "unavailable" ||
    status === "down"
  ) {
    return "disrupted";
  }
  return "neutral";
}

export function EccStatusPill({
  status,
  label,
  withDot = false,
}: {
  status: string;
  label?: string;
  withDot?: boolean;
}) {
  const tone = statusTone(status);

  const text =
    label ??
    ECC_CENTRE_OVERALL_STATUS_LABELS[status as EccCentreOverallStatus] ??
    ECC_SECTION_CONDITION_LABELS[status as EccSectionCondition] ??
    ECC_STAFFING_STATUS_LABELS[status as EccStaffingStatus] ??
    status.replace(/_/g, " ");

  return (
    <span
      className={
        tone === "ok"
          ? "ecc-pill ecc-pill--ok"
          : tone === "attention"
            ? "ecc-pill ecc-pill--attention"
            : tone === "disrupted"
              ? "ecc-pill ecc-pill--disrupted"
              : "ecc-pill"
      }
    >
      {withDot ? <span className="ecc-pill-dot" aria-hidden /> : null}
      {text}
    </span>
  );
}

export function formatEccWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function EccSection({
  title,
  lede,
  action,
  children,
}: {
  title: string;
  lede?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="ecc-section">
      <div className="ecc-section-head">
        <div>
          <h2 className="ecc-section-title">{title}</h2>
          {lede ? <p className="ecc-section-lede">{lede}</p> : null}
        </div>
        {action ? <div className="ecc-section-action">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

const ISSUE_LIFECYCLE: readonly EccIssueStatus[] = [
  "identified",
  "recorded",
  "assessed",
  "in_treatment",
  "escalated",
  "resolved",
  "closed",
];

const REQUEST_LIFECYCLE: readonly EccRequestStatus[] = [
  "submitted",
  "with_relationship_manager",
  "with_downstream",
  "in_follow_up",
  "resolved",
  "closed",
];

export function EccIssueLifecycleRail({ status }: { status: EccIssueStatus }) {
  const current = ISSUE_LIFECYCLE.indexOf(status);
  return (
    <ol className="ecc-lifecycle" aria-label="Issue lifecycle">
      {ISSUE_LIFECYCLE.map((step, index) => {
        const visual =
          status === "escalated"
            ? step === "escalated"
              ? "current"
              : step === "resolved" || step === "closed"
                ? "upcoming"
                : "done"
            : index < current
              ? "done"
              : index === current
                ? "current"
                : "upcoming";
        return (
          <li key={step} className={`ecc-lifecycle-step is-${visual}`}>
            <span className="ecc-lifecycle-dot" aria-hidden />
            <span className="ecc-lifecycle-label">
              {ECC_ISSUE_STATUS_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function EccRequestLifecycleRail({
  status,
}: {
  status: EccRequestStatus;
}) {
  if (status === "cancelled") {
    return (
      <p className="ecc-muted" style={{ margin: 0 }}>
        Cancelled — flow ended without resolution.
      </p>
    );
  }
  const current = REQUEST_LIFECYCLE.indexOf(status);
  return (
    <ol className="ecc-lifecycle" aria-label="Request lifecycle">
      {REQUEST_LIFECYCLE.map((step, index) => {
        const visual =
          index < current ? "done" : index === current ? "current" : "upcoming";
        return (
          <li key={step} className={`ecc-lifecycle-step is-${visual}`}>
            <span className="ecc-lifecycle-dot" aria-hidden />
            <span className="ecc-lifecycle-label">
              {ECC_REQUEST_STATUS_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function EccFactRow({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <dl className="ecc-fact-row">
      {items.map((item) => (
        <div key={item.label} className="ecc-fact">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EccDetailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="ecc-detail-block">
      <h3 className="ecc-detail-block-title">{title}</h3>
      <div className="ecc-detail-block-body">{children}</div>
    </div>
  );
}
