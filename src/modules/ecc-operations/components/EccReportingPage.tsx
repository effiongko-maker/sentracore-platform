"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronRight,
  FileText,
  Inbox,
  MoreHorizontal,
  Settings2,
  Download,
} from "lucide-react";
import { EccOperationsService } from "../services/EccOperationsService";
import type {
  EccReportingSnapshot,
  EccReportingStatusHistoryRow,
} from "../types";
import { formatEccWhen } from "./eccUi";

type ReportTab =
  | "overview"
  | "generate"
  | "history"
  | "scheduled";

type QuickReportType = "weekly" | "monthly" | "management" | "custom";

type SessionReport = {
  id: string;
  name: string;
  type: string;
  typeKey: QuickReportType;
  periodLabel: string;
  generatedBy: string;
  generatedOn: string;
  status: "completed" | "ready";
};

const TAB_ITEMS: Array<{ id: ReportTab; label: string }> = [
  { id: "overview", label: "Report overview" },
  { id: "generate", label: "Generate report" },
  { id: "history", label: "Report history" },
  { id: "scheduled", label: "Scheduled reports" },
];

const QUICK_TYPES: Array<{
  id: QuickReportType;
  title: string;
  description: string;
  icon: typeof CalendarDays;
}> = [
  {
    id: "weekly",
    title: "Weekly Report",
    description: "Operational summary for the selected week",
    icon: CalendarDays,
  },
  {
    id: "monthly",
    title: "Monthly Report",
    description: "Detailed operational report for the selected month",
    icon: CalendarDays,
  },
  {
    id: "management",
    title: "Management Report",
    description: "Executive summary and key insights",
    icon: BarChart3,
  },
  {
    id: "custom",
    title: "Custom Report",
    description: "Select metrics and date range",
    icon: Settings2,
  },
];

function toDateInputValue(isoOrDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
  try {
    return new Date(isoOrDate).toISOString().slice(0, 10);
  } catch {
    return isoOrDate.slice(0, 10);
  }
}

function formatShortDate(isoDate: string): string {
  try {
    const d = new Date(`${isoDate}T12:00:00`);
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

function formatRangeLabel(from: string, to: string): string {
  return `${formatShortDate(from)} – ${formatShortDate(to)}`;
}

function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0;
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function reportTypeLabel(type: QuickReportType): string {
  switch (type) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "management":
      return "Management";
    case "custom":
      return "Custom";
  }
}

function reportName(type: QuickReportType): string {
  switch (type) {
    case "weekly":
      return "ECC Weekly Report";
    case "monthly":
      return "ECC Monthly Report";
    case "management":
      return "ECC Management Report";
    case "custom":
      return "ECC Custom Report";
  }
}

function exportSnapshotCsv(
  snapshot: EccReportingSnapshot,
  rangeFrom: string,
  rangeTo: string,
  rows: EccReportingStatusHistoryRow[],
  type: QuickReportType
) {
  const lines = [
    ["SentraCore ECC Operational Report"],
    ["Type", reportTypeLabel(type)],
    ["Centre", snapshot.centre.name],
    ["Period", `${rangeFrom} to ${rangeTo}`],
    ["As of", snapshot.asOf],
    [],
    ["Metric", "Value"],
    ["Daily operations submissions", String(rows.length)],
    ["Open issues", String(snapshot.openIssues)],
    ["Open requests", String(snapshot.openRequests)],
    ["Escalations", String(snapshot.escalatedIssues)],
    ["Resolved / closed issues", String(snapshot.resolvedIssues)],
    ["Resolved / closed requests", String(snapshot.resolvedRequests)],
    [],
    [
      "Date",
      "Period",
      "Centre",
      "Facility",
      "Technical",
      "Staffing",
      "Submitted by",
    ],
    ...rows.map((row) => [
      row.reportingDate,
      row.period,
      row.overallStatus,
      row.facilityStatus,
      row.technicalStatus,
      row.staffingStatus,
      row.submittedBy,
    ]),
  ];
  const csv = lines
    .map((line) =>
      line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ecc-${type}-report-${rangeFrom}-${rangeTo}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MetricDelta({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const delta = percentDelta(current, previous);
  if (delta == null) {
    return (
      <p className="ecc-rpt-metric-delta ecc-rpt-metric-delta--muted">
        — vs previous period
      </p>
    );
  }
  const tone = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const sign = delta > 0 ? "+" : "";
  return (
    <p className={`ecc-rpt-metric-delta ecc-rpt-metric-delta--${tone}`}>
      {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {sign}
      {delta}% vs previous period
    </p>
  );
}

function StackedActivityChart({
  rows,
  days,
}: {
  rows: EccReportingStatusHistoryRow[];
  days: number;
}) {
  const end = rows.length
    ? rows.reduce(
        (max, row) => (row.reportingDate > max ? row.reportingDate : max),
        rows[0]!.reportingDate
      )
    : new Date().toISOString().slice(0, 10);

  const endDate = new Date(`${end}T12:00:00`);
  const buckets: Array<{
    key: string;
    morning: number;
    evening: number;
    adHoc: number;
    total: number;
  }> = [];
  const map = new Map<
    string,
    { morning: number; evening: number; adHoc: number }
  >();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(endDate);
    d.setDate(endDate.getDate() - i);
    map.set(d.toISOString().slice(0, 10), {
      morning: 0,
      evening: 0,
      adHoc: 0,
    });
  }
  for (const row of rows) {
    const bucket = map.get(row.reportingDate);
    if (!bucket) continue;
    if (row.periodKey === "morning") bucket.morning += 1;
    else if (row.periodKey === "evening") bucket.evening += 1;
    else bucket.adHoc += 1;
  }
  for (const [key, value] of map.entries()) {
    buckets.push({
      key,
      ...value,
      total: value.morning + value.evening + value.adHoc,
    });
  }

  const max = Math.max(...buckets.map((row) => row.total), 1);
  const tickIndexes = [
    0,
    Math.floor((buckets.length - 1) / 2),
    buckets.length - 1,
  ].filter((value, index, arr) => arr.indexOf(value) === index && value >= 0);

  if (buckets.every((row) => row.total === 0)) {
    return (
      <p className="ecc-empty ecc-empty--compact">
        No daily operations submissions in this window.
      </p>
    );
  }

  return (
    <div className="ecc-rpt-activity">
      <div
        className="ecc-rpt-activity-bars"
        role="img"
        aria-label="Submissions by day"
      >
        {buckets.map((row) => (
          <div key={row.key} className="ecc-rpt-activity-col" title={row.key}>
            <div className="ecc-rpt-activity-stack" style={{ height: "7.5rem" }}>
              <span
                className="ecc-rpt-activity-seg ecc-rpt-activity-seg--morning"
                style={{ height: `${(row.morning / max) * 100}%` }}
              />
              <span
                className="ecc-rpt-activity-seg ecc-rpt-activity-seg--evening"
                style={{ height: `${(row.evening / max) * 100}%` }}
              />
              <span
                className="ecc-rpt-activity-seg ecc-rpt-activity-seg--adhoc"
                style={{ height: `${(row.adHoc / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="ecc-rpt-activity-ticks">
        {tickIndexes.map((index) => (
          <span key={buckets[index]!.key}>
            {formatShortDate(buckets[index]!.key)}
          </span>
        ))}
      </div>
      <ul className="ecc-rpt-legend">
        <li>
          <span className="ecc-rpt-legend-dot ecc-rpt-legend-dot--morning" />
          Morning
        </li>
        <li>
          <span className="ecc-rpt-legend-dot ecc-rpt-legend-dot--evening" />
          Evening
        </li>
        <li>
          <span className="ecc-rpt-legend-dot ecc-rpt-legend-dot--adhoc" />
          Ad hoc
        </li>
      </ul>
    </div>
  );
}

function DonutCard({
  title,
  totalLabel,
  total,
  segments,
}: {
  title: string;
  totalLabel: string;
  total: number;
  segments: Array<{ label: string; value: number; tone: string }>;
}) {
  const sum = segments.reduce((acc, row) => acc + row.value, 0) || 1;
  let cumulative = 0;
  const gradient = segments
    .map((row) => {
      const start = (cumulative / sum) * 100;
      cumulative += row.value;
      const end = (cumulative / sum) * 100;
      return `${row.tone} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <article className="ecc-rpt-card ecc-rpt-donut-card">
      <header className="ecc-rpt-card-head">
        <h3 className="ecc-rpt-card-title">{title}</h3>
      </header>
      <div className="ecc-rpt-donut-body">
        <div
          className="ecc-rpt-donut"
          style={{
            background:
              sum === 0 || segments.every((row) => row.value === 0)
                ? "color-mix(in srgb, var(--os-border) 55%, #fff)"
                : `conic-gradient(${gradient})`,
          }}
          aria-hidden
        >
          <div className="ecc-rpt-donut-hole">
            <p className="ecc-rpt-donut-total">{total}</p>
            <p className="ecc-rpt-donut-total-label">{totalLabel}</p>
          </div>
        </div>
        <ul className="ecc-rpt-donut-legend">
          {segments.map((row) => (
            <li key={row.label}>
              <span
                className="ecc-rpt-legend-dot"
                style={{ background: row.tone }}
              />
              <span className="ecc-rpt-donut-legend-label">{row.label}</span>
              <span className="ecc-rpt-donut-legend-value">{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function EccReportingPage() {
  const [snapshot, setSnapshot] = useState<EccReportingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [tab, setTab] = useState<ReportTab>("overview");
  const [trendDays, setTrendDays] = useState(14);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionReports, setSessionReports] = useState<SessionReport[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void EccOperationsService.getReportingSnapshot()
      .then((data) => {
        if (cancelled) return;
        setSnapshot(data);
        setError(null);
        const asOfDay = toDateInputValue(data.asOf);
        const dates = data.centreStatusHistory.map((row) => row.reportingDate);
        if (dates.length === 0) {
          const start = new Date(`${asOfDay}T12:00:00`);
          start.setDate(1);
          setRangeFrom(start.toISOString().slice(0, 10));
          setRangeTo(asOfDay);
        } else {
          const sorted = [...dates].sort();
          const monthStart = `${asOfDay.slice(0, 8)}01`;
          setRangeFrom(sorted[0]! < monthStart ? sorted[0]! : monthStart);
          setRangeTo(asOfDay);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load reporting foundation."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredHistory = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.centreStatusHistory.filter((row) => {
      if (rangeFrom && row.reportingDate < rangeFrom) return false;
      if (rangeTo && row.reportingDate > rangeTo) return false;
      return true;
    });
  }, [snapshot, rangeFrom, rangeTo]);

  const previousHistory = useMemo(() => {
    if (!snapshot || !rangeFrom || !rangeTo) return [];
    const from = new Date(`${rangeFrom}T12:00:00`);
    const to = new Date(`${rangeTo}T12:00:00`);
    const spanDays =
      Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)) + 1;
    const prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo);
    prevFrom.setDate(prevFrom.getDate() - (spanDays - 1));
    const prevFromKey = prevFrom.toISOString().slice(0, 10);
    const prevToKey = prevTo.toISOString().slice(0, 10);
    return snapshot.centreStatusHistory.filter(
      (row) =>
        row.reportingDate >= prevFromKey && row.reportingDate <= prevToKey
    );
  }, [snapshot, rangeFrom, rangeTo]);

  function generateReport(type: QuickReportType) {
    if (!snapshot) return;
    exportSnapshotCsv(snapshot, rangeFrom, rangeTo, filteredHistory, type);
    const generatedBy =
      filteredHistory[0]?.submittedBy ||
      snapshot.centre.name ||
      "ECC Manager";
    const entry: SessionReport = {
      id: `session-${Date.now()}-${type}`,
      name: reportName(type),
      type: reportTypeLabel(type),
      typeKey: type,
      periodLabel: formatRangeLabel(rangeFrom, rangeTo),
      generatedBy,
      generatedOn: new Date().toISOString(),
      status: "completed",
    };
    setSessionReports((prev) => [entry, ...prev]);
    setNotice(`${reportName(type)} generated for ${formatRangeLabel(rangeFrom, rangeTo)}.`);
    setTab(type === "custom" ? "generate" : "history");
    setMenuOpen(false);
  }

  if (error) {
    return <p className="ecc-empty">{error}</p>;
  }

  if (!snapshot || !rangeFrom || !rangeTo) {
    return <p className="ecc-empty">Loading reporting…</p>;
  }

  const issueTotal =
    snapshot.openIssues +
    snapshot.resolvedIssues +
    snapshot.escalatedIssues;
  const requestTotal =
    snapshot.openRequests +
    snapshot.resolvedRequests +
    snapshot.withRmOrDownstream;

  return (
    <div className="ecc-rpt">
      <header className="ecc-rpt-header">
        <div className="ecc-rpt-header-copy">
          <h1 className="ecc-rpt-title">Reporting</h1>
          <p className="ecc-rpt-desc">
            Generate and manage operational reports for management and other
            stakeholders.
          </p>
        </div>
        <div className="ecc-rpt-header-actions">
          <label className="ecc-rpt-range">
            <span className="sr-only">Reporting period</span>
            <span className="ecc-rpt-range-controls">
              <CalendarDays className="h-4 w-4 ecc-rpt-range-icon" aria-hidden />
              <input
                type="date"
                value={rangeFrom}
                max={rangeTo}
                onChange={(e) => setRangeFrom(e.target.value)}
              />
              <span aria-hidden>–</span>
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom}
                onChange={(e) => setRangeTo(e.target.value)}
              />
            </span>
          </label>
          <button
            type="button"
            className="ecc-btn ecc-btn-primary ecc-rpt-generate"
            onClick={() => generateReport("management")}
          >
            <FileText className="h-4 w-4" aria-hidden />
            Generate report
          </button>
          <div className="ecc-rpt-overflow">
            <button
              type="button"
              className="ecc-rpt-overflow-btn"
              aria-label="More reporting actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div className="ecc-rpt-overflow-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => generateReport("weekly")}
                >
                  Generate weekly report
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => generateReport("monthly")}
                >
                  Generate monthly report
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setTab("history");
                    setMenuOpen(false);
                  }}
                >
                  Open report history
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="ecc-rpt-tabs" aria-label="Reporting sections">
        {TAB_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ecc-rpt-tab${tab === item.id ? " is-active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {notice ? (
        <div className="ecc-rpt-notice" role="status">
          <p>{notice}</p>
          <button
            type="button"
            className="ecc-link"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {tab === "overview" || tab === "generate" ? (
        <>
          <section className="ecc-rpt-section">
            <h2 className="ecc-rpt-section-title">Quick report types</h2>
            <div className="ecc-rpt-quick-grid">
              {QUICK_TYPES.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="ecc-rpt-quick-card"
                    onClick={() => generateReport(item.id)}
                  >
                    <span className="ecc-rpt-quick-icon" aria-hidden>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="ecc-rpt-quick-copy">
                      <span className="ecc-rpt-quick-title">{item.title}</span>
                      <span className="ecc-rpt-quick-desc">
                        {item.description}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 ecc-rpt-quick-chevron"
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </section>

          {tab === "overview" ? (
            <>
              <section className="ecc-rpt-section">
                <header className="ecc-rpt-section-head">
                  <h2 className="ecc-rpt-section-title">
                    Key metrics (selected period)
                  </h2>
                  <button
                    type="button"
                    className="ecc-link"
                    onClick={() => setTab("generate")}
                  >
                    View full breakdown →
                  </button>
                </header>
                <div className="ecc-rpt-metric-row">
                  <article className="ecc-rpt-metric-card">
                    <span className="ecc-rpt-metric-icon" aria-hidden>
                      <FileText className="h-4 w-4" />
                    </span>
                    <p className="ecc-rpt-metric-value">
                      {filteredHistory.length}
                    </p>
                    <p className="ecc-rpt-metric-label">
                      Daily operations submissions
                    </p>
                    <MetricDelta
                      current={filteredHistory.length}
                      previous={previousHistory.length}
                    />
                  </article>
                  <article className="ecc-rpt-metric-card">
                    <span
                      className="ecc-rpt-metric-icon ecc-rpt-metric-icon--warn"
                      aria-hidden
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <p className="ecc-rpt-metric-value">{snapshot.openIssues}</p>
                    <p className="ecc-rpt-metric-label">Open issues</p>
                    <p className="ecc-rpt-metric-delta ecc-rpt-metric-delta--muted">
                      Current open register
                    </p>
                  </article>
                  <article className="ecc-rpt-metric-card">
                    <span className="ecc-rpt-metric-icon" aria-hidden>
                      <Inbox className="h-4 w-4" />
                    </span>
                    <p className="ecc-rpt-metric-value">
                      {snapshot.openRequests}
                    </p>
                    <p className="ecc-rpt-metric-label">Open requests</p>
                    <p className="ecc-rpt-metric-delta ecc-rpt-metric-delta--muted">
                      Current open register
                    </p>
                  </article>
                  <article className="ecc-rpt-metric-card">
                    <span className="ecc-rpt-metric-icon" aria-hidden>
                      <BarChart3 className="h-4 w-4" />
                    </span>
                    <p className="ecc-rpt-metric-value">
                      {snapshot.escalatedIssues}
                    </p>
                    <p className="ecc-rpt-metric-label">Escalations</p>
                    <p className="ecc-rpt-metric-delta ecc-rpt-metric-delta--muted">
                      Current escalated issues
                    </p>
                  </article>
                </div>
              </section>

              <section className="ecc-rpt-viz-row">
                <article className="ecc-rpt-card ecc-rpt-card--wide">
                  <header className="ecc-rpt-card-head">
                    <div>
                      <h3 className="ecc-rpt-card-title">Operational activity</h3>
                      <p className="ecc-rpt-card-lede">
                        Daily operations submissions by period.
                      </p>
                    </div>
                    <label className="ecc-rpt-select">
                      <span className="sr-only">Activity window</span>
                      <select
                        value={trendDays}
                        onChange={(e) => setTrendDays(Number(e.target.value))}
                      >
                        <option value={7}>Last 7 days</option>
                        <option value={14}>Last 14 days</option>
                        <option value={30}>Last 30 days</option>
                      </select>
                    </label>
                  </header>
                  <StackedActivityChart
                    rows={filteredHistory}
                    days={trendDays}
                  />
                </article>

                <DonutCard
                  title="Issue status"
                  totalLabel="Total issues"
                  total={Math.max(issueTotal, snapshot.openIssues + snapshot.resolvedIssues)}
                  segments={[
                    {
                      label: "Open",
                      value: snapshot.openIssues,
                      tone: "#ea580c",
                    },
                    {
                      label: "Resolved / Closed",
                      value: snapshot.resolvedIssues,
                      tone: "#16a34a",
                    },
                    {
                      label: "Escalated",
                      value: snapshot.escalatedIssues,
                      tone: "#dc2626",
                    },
                    {
                      label: "Waiting (owned)",
                      value: snapshot.waitingIssues,
                      tone: "#94a3b8",
                    },
                  ]}
                />

                <DonutCard
                  title="Request status"
                  totalLabel="Total requests"
                  total={Math.max(
                    requestTotal,
                    snapshot.openRequests + snapshot.resolvedRequests
                  )}
                  segments={[
                    {
                      label: "Open",
                      value: snapshot.openRequests,
                      tone: "#2563eb",
                    },
                    {
                      label: "Resolved / Closed",
                      value: snapshot.resolvedRequests,
                      tone: "#16a34a",
                    },
                    {
                      label: "With RM / Downstream",
                      value: snapshot.withRmOrDownstream,
                      tone: "#ea580c",
                    },
                    {
                      label: "Waiting (owned)",
                      value: snapshot.waitingRequests,
                      tone: "#94a3b8",
                    },
                  ]}
                />
              </section>
            </>
          ) : (
            <section className="ecc-rpt-card">
              <header className="ecc-rpt-card-head">
                <div>
                  <h3 className="ecc-rpt-card-title">Generate report</h3>
                  <p className="ecc-rpt-card-lede">
                    Reports are assembled from current Daily Operations, Issues,
                    and Requests for {formatRangeLabel(rangeFrom, rangeTo)}. No
                    separate report store is used.
                  </p>
                </div>
              </header>
              <div className="ecc-rpt-generate-grid">
                {QUICK_TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="ecc-btn ecc-btn-secondary"
                    onClick={() => generateReport(item.id)}
                  >
                    Generate {item.title.toLowerCase()}
                  </button>
                ))}
              </div>
              <dl className="ecc-rpt-generate-summary">
                <div>
                  <dt>Submissions in period</dt>
                  <dd>{filteredHistory.length}</dd>
                </div>
                <div>
                  <dt>Open issues</dt>
                  <dd>{snapshot.openIssues}</dd>
                </div>
                <div>
                  <dt>Open requests</dt>
                  <dd>{snapshot.openRequests}</dd>
                </div>
                <div>
                  <dt>Escalations</dt>
                  <dd>{snapshot.escalatedIssues}</dd>
                </div>
              </dl>
            </section>
          )}
        </>
      ) : null}

      {tab === "overview" || tab === "history" ? (
        <section className="ecc-rpt-card">
          <header className="ecc-rpt-card-head">
            <div>
              <h3 className="ecc-rpt-card-title">Recent reports</h3>
              <p className="ecc-rpt-card-lede">
                Previously generated reports in this session. Download again or
                generate a new pack from Quick report types.
              </p>
            </div>
            <button
              type="button"
              className="ecc-link"
              onClick={() => setTab("history")}
            >
              View all reports →
            </button>
          </header>

          {sessionReports.length === 0 ? (
            <div className="ecc-rpt-empty-history">
              <p className="ecc-rpt-empty-title">No reports generated yet</p>
              <p className="ecc-rpt-empty-copy">
                Use Generate report or a Quick report type to create a
                management pack from the selected period. History is kept for
                this browser session only.
              </p>
              <button
                type="button"
                className="ecc-btn ecc-btn-primary"
                onClick={() => generateReport("weekly")}
              >
                Generate weekly report
              </button>
            </div>
          ) : (
            <div className="ecc-rpt-table-wrap">
              <table className="ecc-rpt-table">
                <thead>
                  <tr>
                    <th>Report name</th>
                    <th>Type</th>
                    <th>Period</th>
                    <th>Generated by</th>
                    <th>Generated on</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionReports.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          className="ecc-link"
                          onClick={() => generateReport(row.typeKey)}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td>{row.type}</td>
                      <td>{row.periodLabel}</td>
                      <td>{row.generatedBy}</td>
                      <td>{formatEccWhen(row.generatedOn)}</td>
                      <td>
                        <span className="ecc-rpt-status">
                          <span className="ecc-rpt-status-dot" aria-hidden />
                          Completed
                        </span>
                      </td>
                      <td>
                        <div className="ecc-rpt-row-actions">
                          <button
                            type="button"
                            className="ecc-btn ecc-btn-secondary ecc-btn-sm"
                            onClick={() => generateReport(row.typeKey)}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                            Download
                          </button>
                          <span className="ecc-rpt-more" aria-hidden>
                            <MoreHorizontal className="h-4 w-4" />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "scheduled" ? (
        <section className="ecc-rpt-card">
          <header className="ecc-rpt-card-head">
            <div>
              <h3 className="ecc-rpt-card-title">Scheduled reports</h3>
              <p className="ecc-rpt-card-lede">
                Recurring delivery is not configured yet. Generate reports on
                demand from Report overview until scheduling is available.
              </p>
            </div>
          </header>
          <div className="ecc-rpt-empty-history">
            <p className="ecc-rpt-empty-title">No schedules yet</p>
            <p className="ecc-rpt-empty-copy">
              This tab is ready for future scheduled delivery. It does not
              create backend jobs or persistent schedules.
            </p>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={() => setTab("overview")}
            >
              Back to report overview
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
