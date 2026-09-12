"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock3,
  Headphones,
  Monitor,
  Users,
  Zap,
} from "lucide-react";
import { EccOperationsService } from "../services/EccOperationsService";
import type { EccOverviewSnapshot } from "../types";
import {
  ECC_CENTRE_OVERALL_STATUS_LABELS,
  ECC_DAILY_OPS_PERIOD_LABELS,
  ECC_SECTION_CONDITION_LABELS,
  ECC_STAFFING_STATUS_LABELS,
} from "../constants";
import { EccStatusPill, formatEccWhen } from "./eccUi";

function sectionTone(
  status: string
): "ok" | "attention" | "critical" | "neutral" {
  if (
    status === "normal" ||
    status === "ready" ||
    status === "operational"
  ) {
    return "ok";
  }
  if (
    status === "issue" ||
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
    return "critical";
  }
  return "neutral";
}

function activityKindLabel(kind: string): string {
  if (kind === "daily_ops") return "Daily Ops";
  return kind.replace(/_/g, " ");
}

export function EccOverviewPage() {
  const [snapshot, setSnapshot] = useState<EccOverviewSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void EccOperationsService.getOverview()
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Unable to load overview."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="ecc-empty">{error}</p>;
  }

  if (!snapshot) {
    return <p className="ecc-empty">Loading centre overview…</p>;
  }

  const latest = snapshot.latestDailyOps;
  const call = latest?.callOperations;
  const centreTone = sectionTone(
    snapshot.overallStatus === "unknown" ? "neutral" : snapshot.overallStatus
  );
  const facilityTone = sectionTone(
    snapshot.facilityStatus === "unknown" ? "neutral" : snapshot.facilityStatus
  );
  const technicalTone = sectionTone(
    snapshot.technicalStatus === "unknown"
      ? "neutral"
      : snapshot.technicalStatus
  );
  const staffingTone = sectionTone(snapshot.staffingStatus);

  const callPrimary = call
    ? [
        call.callsHandled ? `${call.callsHandled} handled` : null,
        call.callsReceived ? `${call.callsReceived} received` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const callSecondary = call
    ? [
        call.waiting ? `${call.waiting} waiting` : null,
        call.missed ? `${call.missed} missed` : null,
        call.escalated ? `${call.escalated} escalated` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <div className="ecc-overview">
      <header className="ecc-ov-header">
        <div className="ecc-ov-header-copy">
          <p className="ecc-ov-eyebrow">ECC Operations</p>
          <h1 className="ecc-ov-title">Overview</h1>
          <p className="ecc-ov-desc">
            What is the current state of this ECC, and what needs attention.
          </p>
          <p className="ecc-ov-asof">As of {formatEccWhen(snapshot.asOf)}</p>
        </div>

        {latest ? (
          <Link
            href="/ecc-operations/daily-ops"
            className="ecc-ov-latest"
          >
            <div className="ecc-ov-latest-top">
              <span className="ecc-ov-latest-dot" aria-hidden />
              <span className="ecc-ov-latest-label">Latest update</span>
            </div>
            <p className="ecc-ov-latest-line">
              {ECC_DAILY_OPS_PERIOD_LABELS[latest.period]}
              {" · "}
              {formatEccWhen(latest.recordedAt)}
              {" · "}
              {latest.recordedByName}
            </p>
            <div className="ecc-ov-latest-foot">
              <EccStatusPill status={latest.overallStatus} withDot />
              <ChevronRight className="ecc-ov-chevron" aria-hidden />
            </div>
          </Link>
        ) : (
          <div className="ecc-ov-latest ecc-ov-latest--empty">
            <p className="ecc-ov-latest-label">Latest update</p>
            <p className="ecc-ov-latest-line">No daily operations record yet.</p>
            <Link href="/ecc-operations/daily-ops" className="ecc-link">
              Submit an update
            </Link>
          </div>
        )}
      </header>

      <section className="ecc-ov-state-grid" aria-label="Current state">
        <article className={`ecc-ov-state-card is-${centreTone}`}>
          <div className="ecc-ov-state-icon" aria-hidden>
            <Building2 className="h-4 w-4" />
          </div>
          <p className="ecc-ov-state-label">Centre</p>
          <p className="ecc-ov-state-value">
            {snapshot.overallStatus === "unknown"
              ? "Not stated"
              : ECC_CENTRE_OVERALL_STATUS_LABELS[snapshot.overallStatus]}
          </p>
          <p className="ecc-ov-state-meta">
            Section:{" "}
            {snapshot.centreSectionStatus === "unknown"
              ? "—"
              : ECC_SECTION_CONDITION_LABELS[snapshot.centreSectionStatus]}
          </p>
        </article>

        <article className={`ecc-ov-state-card is-${facilityTone}`}>
          <div className="ecc-ov-state-icon" aria-hidden>
            <Building2 className="h-4 w-4" />
          </div>
          <p className="ecc-ov-state-label">Facility</p>
          <p className="ecc-ov-state-value">
            {snapshot.facilityStatus === "unknown"
              ? "Not stated"
              : ECC_SECTION_CONDITION_LABELS[snapshot.facilityStatus]}
          </p>
          <p className="ecc-ov-state-meta">
            {snapshot.facilityStatus === "normal"
              ? "No issues reported"
              : snapshot.facilityStatus === "unknown"
                ? "—"
                : ECC_SECTION_CONDITION_LABELS[snapshot.facilityStatus]}
          </p>
        </article>

        <article className={`ecc-ov-state-card is-${technicalTone}`}>
          <div className="ecc-ov-state-icon" aria-hidden>
            <Monitor className="h-4 w-4" />
          </div>
          <p className="ecc-ov-state-label">Technical</p>
          <p className="ecc-ov-state-value">
            {snapshot.technicalStatus === "unknown"
              ? "Not stated"
              : ECC_SECTION_CONDITION_LABELS[snapshot.technicalStatus]}
          </p>
          <p className="ecc-ov-state-meta">
            {snapshot.technicalStatus === "normal"
              ? "No issues reported"
              : snapshot.technicalStatus === "unknown"
                ? "—"
                : ECC_SECTION_CONDITION_LABELS[snapshot.technicalStatus]}
          </p>
        </article>

        <article className={`ecc-ov-state-card is-${staffingTone}`}>
          <div className="ecc-ov-state-icon" aria-hidden>
            <Users className="h-4 w-4" />
          </div>
          <p className="ecc-ov-state-label">Staffing</p>
          <p className="ecc-ov-state-value">
            {ECC_STAFFING_STATUS_LABELS[snapshot.staffingStatus]}
          </p>
          {snapshot.staffingReadiness ? (
            <p className="ecc-ov-state-meta">{snapshot.staffingReadiness}</p>
          ) : (
            <p className="ecc-ov-state-meta">—</p>
          )}
          <p className="ecc-ov-state-foot">
            <Link href="/ecc-operations/people" className="ecc-link">
              People
            </Link>
          </p>
        </article>

        <article className="ecc-ov-state-card is-call">
          <div className="ecc-ov-state-icon" aria-hidden>
            <Headphones className="h-4 w-4" />
          </div>
          <p className="ecc-ov-state-label">Call activity</p>
          <p className="ecc-ov-state-value">
            {callPrimary || snapshot.callActivitySummary}
          </p>
          {callSecondary ? (
            <p className="ecc-ov-state-meta">{callSecondary}</p>
          ) : null}
          <p className="ecc-ov-state-foot">Extensible metrics</p>
        </article>
      </section>

      <div className="ecc-ov-mid-grid">
        <section className="ecc-ov-card">
          <header className="ecc-ov-card-head">
            <div className="ecc-ov-card-title-row">
              <span className="ecc-ov-card-icon ecc-ov-card-icon--alert" aria-hidden>
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <h2 className="ecc-ov-card-title">Needs attention</h2>
                <p className="ecc-ov-card-desc">
                  Escalations, open work, disrupted daily-ops state, and issues
                  raised from recent operations.
                </p>
              </div>
            </div>
          </header>

          {snapshot.attentionItems.length === 0 ? (
            <p className="ecc-empty ecc-empty--compact">
              Nothing flagged. Centre registers are clear.
            </p>
          ) : (
            <ul className="ecc-ov-attention-list">
              {snapshot.attentionItems.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link href={item.href} className="ecc-ov-attention-row">
                    <span className="ecc-ov-attention-dot" aria-hidden />
                    <span className="ecc-ov-attention-copy">
                      <span className="ecc-ov-attention-title">
                        {item.title}
                      </span>
                      <span className="ecc-ov-attention-detail">
                        {item.detail}
                      </span>
                    </span>
                    <ChevronRight className="ecc-ov-chevron" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="ecc-ov-card">
          <header className="ecc-ov-card-head">
            <div className="ecc-ov-card-title-row">
              <span className="ecc-ov-card-icon" aria-hidden>
                <ClipboardList className="h-4 w-4" />
              </span>
              <h2 className="ecc-ov-card-title">Open registers</h2>
            </div>
          </header>
          <div className="ecc-ov-registers">
            <div className="ecc-ov-register">
              <p className="ecc-ov-register-value">{snapshot.openIssueCount}</p>
              <p className="ecc-ov-register-label">Open issues</p>
              <Link href="/ecc-operations/issues" className="ecc-link">
                Issues
              </Link>
            </div>
            <div className="ecc-ov-register">
              <p className="ecc-ov-register-value">{snapshot.openRequestCount}</p>
              <p className="ecc-ov-register-label">Open requests</p>
              <Link href="/ecc-operations/requests" className="ecc-link">
                Requests
              </Link>
            </div>
            <div className="ecc-ov-register">
              <p className="ecc-ov-register-value">
                {snapshot.escalatedIssueCount}
              </p>
              <p className="ecc-ov-register-label">Escalations</p>
            </div>
            <div className="ecc-ov-register">
              <p className="ecc-ov-register-value">
                {snapshot.highUrgentOpenCount}
              </p>
              <p className="ecc-ov-register-label">High / urgent</p>
            </div>
            <div className="ecc-ov-register">
              <p className="ecc-ov-register-value">
                {snapshot.waitingOnOthersCount}
              </p>
              <p className="ecc-ov-register-label">Waiting on others</p>
            </div>
          </div>
        </section>
      </div>

      <div className="ecc-ov-bottom-grid">
        <section className="ecc-ov-card">
          <header className="ecc-ov-card-head ecc-ov-card-head--split">
            <div className="ecc-ov-card-title-row">
              <span className="ecc-ov-card-icon" aria-hidden>
                <Clock3 className="h-4 w-4" />
              </span>
              <div>
                <h2 className="ecc-ov-card-title">Recent activity</h2>
                <p className="ecc-ov-card-desc">
                  Latest daily ops, issue and request movements.
                </p>
              </div>
            </div>
            <Link href="/ecc-operations/daily-ops" className="ecc-link">
              View all
            </Link>
          </header>

          {snapshot.recentActivity.length === 0 ? (
            <p className="ecc-empty ecc-empty--compact">
              No ECC activity recorded yet.
            </p>
          ) : (
            <div className="ecc-ov-activity">
              <div className="ecc-ov-activity-head">
                <span>When</span>
                <span>Activity</span>
                <span>Type</span>
              </div>
              <ul className="ecc-ov-activity-list">
                {snapshot.recentActivity.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link href={item.href} className="ecc-ov-activity-row">
                      <span className="ecc-ov-activity-when">
                        {formatEccWhen(item.at)}
                      </span>
                      <span className="ecc-ov-activity-copy">
                        <span className="ecc-ov-activity-title">
                          {item.title}
                        </span>
                        {item.detail ? (
                          <span className="ecc-ov-activity-detail">
                            {item.detail}
                          </span>
                        ) : null}
                      </span>
                      <span className="ecc-pill ecc-ov-type-pill">
                        {activityKindLabel(item.kind)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="ecc-ov-card">
          <header className="ecc-ov-card-head">
            <div className="ecc-ov-card-title-row">
              <span className="ecc-ov-card-icon" aria-hidden>
                <Zap className="h-4 w-4" />
              </span>
              <div>
                <h2 className="ecc-ov-card-title">Quick actions</h2>
                <p className="ecc-ov-card-desc">
                  Common tasks for ECC operations.
                </p>
              </div>
            </div>
          </header>
          <div className="ecc-ov-actions">
            <Link
              href="/ecc-operations/daily-ops"
              className="ecc-btn ecc-btn-primary ecc-ov-action-btn"
            >
              + Submit update
            </Link>
            <Link
              href="/ecc-operations/daily-ops"
              className="ecc-btn ecc-btn-secondary ecc-ov-action-btn"
            >
              <CalendarDays className="h-4 w-4" aria-hidden />
              View daily operations
            </Link>
          </div>
        </section>
      </div>

      {snapshot.issuesFromRecentOps.length > 0 ? (
        <section className="ecc-ov-card">
          <header className="ecc-ov-card-head">
            <div>
              <h2 className="ecc-ov-card-title">Issues from recent operations</h2>
              <p className="ecc-ov-card-desc">
                ECC Issues raised from the latest daily operations snapshots.
              </p>
            </div>
          </header>
          <ul className="ecc-ov-link-list">
            {snapshot.issuesFromRecentOps.map((item) => (
              <li key={item.id}>
                <Link href={item.href} className="ecc-link">
                  {item.title}
                </Link>
                <span className="ecc-muted"> · {item.id}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {snapshot.recentResolutions.length > 0 ? (
        <section className="ecc-ov-card">
          <header className="ecc-ov-card-head">
            <div>
              <h2 className="ecc-ov-card-title">Recent resolutions</h2>
              <p className="ecc-ov-card-desc">
                Recently resolved or closed issues and requests.
              </p>
            </div>
          </header>
          <ul className="ecc-ov-link-list">
            {snapshot.recentResolutions.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <span className="ecc-muted">{formatEccWhen(item.at)} · </span>
                <Link href={item.href} className="ecc-link">
                  {item.title}
                </Link>
                <span className="ecc-pill" style={{ marginLeft: "0.5rem" }}>
                  {item.kind}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
