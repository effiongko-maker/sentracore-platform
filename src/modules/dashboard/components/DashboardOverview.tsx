"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronRight,
  Clock3,
  HardHat,
  Package,
  Users,
  Wrench,
  ClipboardList,
} from "lucide-react";
import type { DashboardOverviewViewModel } from "../view-model/buildDashboardOverview";

function metricIcon(title: string) {
  const key = title.toLowerCase();
  if (key.includes("facilit")) return Building2;
  if (key.includes("asset")) return Package;
  if (key.includes("workforce") || key.includes("user")) return Users;
  if (key.includes("work order")) return ClipboardList;
  if (key.includes("incident")) return AlertTriangle;
  if (key.includes("maintenance")) return Wrench;
  return HardHat;
}

function attentionIcon(severity: string) {
  if (severity === "critical") return AlertTriangle;
  if (severity === "high") return Wrench;
  if (severity === "medium") return Clock3;
  return Building2;
}

function ringColor(band: "healthy" | "watch" | "critical") {
  if (band === "healthy") return "#34d399";
  if (band === "watch") return "#fb923c";
  return "#f87171";
}

export function DashboardOverview({
  overview,
}: {
  overview: DashboardOverviewViewModel;
}) {
  const asOfLabel = new Date(overview.asOf).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="db-page">
      <header className="db-header">
        <div className="db-header-copy">
          <p className="db-eyebrow">Operational overview</p>
          <h1 className="db-title">{overview.title}</h1>
          <p className="db-lede">{overview.subtitle}</p>
        </div>
        <p className="db-asof">As of {asOfLabel}</p>
      </header>

      <section className="db-hero" aria-label="Operational health">
        <div className="db-hero-main">
          <div
            className="db-score-ring"
            style={
              {
                "--db-score-pct": overview.health.score,
                "--db-ring-color": ringColor(overview.health.band),
              } as CSSProperties
            }
          >
            <div className="db-score-core">
              <p className="db-score-value">{overview.health.score}</p>
              <p className="db-score-den">/ 100</p>
            </div>
          </div>
          <div className="db-hero-copy">
            <p className="db-hero-label">Operational Health</p>
            <span
              className={`db-hero-band db-hero-band-${overview.health.band}`}
            >
              {overview.health.bandLabel}
            </span>
            <p className="db-hero-summary">{overview.health.summary}</p>
            <Link href={overview.health.detailHref} className="db-hero-detail">
              View priorities
              <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>

        <aside className="db-hero-side" aria-label="What is driving this score">
          <p className="db-hero-side-title">What&apos;s driving this score</p>
          {overview.drivers.map((driver) => (
            <div key={driver.id} className="db-driver">
              <p className="db-driver-label">{driver.label}</p>
              <p className={`db-driver-value db-driver-value-${driver.tone}`}>
                {driver.value}
              </p>
            </div>
          ))}
          <p className="db-hero-side-note">
            7-day health trend is not available yet. Drivers use live counts that
            feed today&apos;s score.
          </p>
        </aside>
      </section>

      <section className="db-section" aria-labelledby="db-attention-heading">
        <div className="db-section-head">
          <div>
            <h2 id="db-attention-heading" className="db-section-title">
              What needs attention now?
            </h2>
            <p className="db-section-support">
              Top issues based on urgency and impact.
            </p>
          </div>
          <Link href={overview.attentionHref} className="db-section-link">
            View all priorities →
          </Link>
        </div>

        {overview.attention.length === 0 ? (
          <div className="db-empty">
            <p className="db-empty-title">Nothing needs immediate attention</p>
            <p className="db-empty-copy">
              Critical incidents, overdue work, and blocked items will appear
              here.
            </p>
          </div>
        ) : (
          <div className="db-attention">
            {overview.attention.map((row) => {
              const Icon = attentionIcon(row.severity);
              return (
                <Link
                  key={row.id}
                  href={row.href}
                  className="db-attention-row"
                >
                  <span
                    className={`db-attention-icon db-attention-icon-${row.severity}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="db-attention-title">{row.title}</p>
                    <p className="db-attention-context">{row.context}</p>
                  </div>
                  <span className="db-attention-meta">
                    <span className={`db-severity db-severity-${row.severity}`}>
                      {row.severityLabel}
                    </span>
                    <ChevronRight className="db-chevron h-4 w-4" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="db-section" aria-labelledby="db-metrics-heading">
        <div className="db-section-head">
          <div>
            <h2 id="db-metrics-heading" className="db-section-title">
              Operational health
            </h2>
            <p className="db-section-support">Live pulse across the estate.</p>
          </div>
        </div>
        <div className="db-metrics">
          {overview.metrics.map((metric) => {
            const Icon = metricIcon(metric.title);
            const body = (
              <>
                <div className="db-metric-top">
                  <p className="db-metric-name">{metric.title}</p>
                  <span
                    className={`db-metric-icon db-metric-icon-${metric.tone}`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </div>
                <p className="db-metric-value">{metric.value}</p>
                <p className="db-metric-context">{metric.context}</p>
                <p className="db-metric-comparison">No comparison available</p>
              </>
            );
            return metric.href ? (
              <Link key={metric.id} href={metric.href} className="db-metric">
                {body}
              </Link>
            ) : (
              <div key={metric.id} className="db-metric">
                {body}
              </div>
            );
          })}
        </div>
      </section>

      <div className="db-lower">
        <section className="db-panel" aria-labelledby="db-activity-heading">
          <div>
            <h2 id="db-activity-heading" className="db-section-title">
              Recent Activity
            </h2>
            <p className="db-section-support">
              Meaningful operational events in chronological order.
            </p>
          </div>
          {overview.recentActivity.length === 0 ? (
            <div className="db-empty" style={{ borderStyle: "solid" }}>
              <p className="db-empty-title">No recent operational activity</p>
              <p className="db-empty-copy">
                Work order, maintenance, and incident updates will appear here as
                they occur.
              </p>
            </div>
          ) : (
            <div className="db-panel-list">
              {overview.recentActivity.map((row) => (
                <Link
                  key={row.id}
                  href={row.href ?? "#"}
                  className="db-panel-row"
                >
                  <div className="db-panel-row-main">
                    <span
                      className={`db-panel-row-icon db-panel-row-icon-${row.tone}`}
                    >
                      <ClipboardList className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div>
                      <p className="db-panel-row-title">{row.title}</p>
                      <p className="db-panel-row-context">{row.summary}</p>
                    </div>
                  </div>
                  <span className="db-panel-delta db-panel-delta-neutral">
                    {row.atLabel}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="db-panel" aria-labelledby="db-motion-heading">
          <div>
            <h2 id="db-motion-heading" className="db-section-title">
              Work in motion
            </h2>
            <p className="db-section-support">
              Active work across your operations.
            </p>
          </div>
          {overview.motion.length === 0 ? (
            <div className="db-empty" style={{ borderStyle: "solid" }}>
              <p className="db-empty-title">No active work right now</p>
              <p className="db-empty-copy">
                Open maintenance and work orders will appear here as they move.
              </p>
            </div>
          ) : (
            <div className="db-panel-list">
              {overview.motion.map((row) => (
                <Link key={row.id} href={row.href} className="db-panel-row">
                  <div className="db-panel-row-main">
                    <span className="db-panel-row-icon db-panel-row-icon-info">
                      <Wrench className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div>
                      <p className="db-panel-row-title">{row.title}</p>
                    </div>
                  </div>
                  <span className="db-count-pill">{row.count}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
