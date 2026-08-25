"use client";

import Link from "next/link";
import type {
  AttentionModel,
  WorkspaceActivityItem,
  WorkspaceQuickAction,
  WorkspaceScheduleItem,
  WorkspaceSnapshot,
  WorkspaceWorkSummary,
  OperationalState,
} from "../types";
import { CommandStatement, ModeFrame } from "@/components/platform";
import { cn, formatRelativeTime } from "@/lib/utils";

/** Split operational statement into signal count + phrase for industrial hierarchy. */
function parseOperationalSignal(state: OperationalState): {
  value?: string;
  phrase?: string;
} {
  const text = state.statement.replace(/\.$/, "");
  const numeric = text.match(/^(\d+)\s+(.+)$/i);
  if (numeric) {
    return {
      value: numeric[1],
      phrase: numeric[2].toUpperCase(),
    };
  }
  const one = text.match(/^one\s+(.+)$/i);
  if (one) {
    return {
      value: "1",
      phrase: one[1].toUpperCase(),
    };
  }
  return {};
}

function RequiresAttention({ attention }: { attention: AttentionModel }) {
  if (attention.total === 0) return null;

  return (
    <section className="os-attention" aria-labelledby="os-attention-heading">
      <div className="os-attention-header">
        <h2 id="os-attention-heading" className="os-section-title">
          Requires attention
        </h2>
        <p className="os-attention-lede">Items requiring action now.</p>
      </div>

      <div className="os-attention-list">
        {attention.visible.map((matter) => (
          <Link
            key={matter.id}
            href={matter.href}
            className="os-attention-item"
          >
            <div className="os-attention-item-main">
              <p
                className={cn(
                  "os-attention-severity",
                  matter.severity === "critical"
                    ? "os-attention-severity-critical"
                    : "os-attention-severity-high"
                )}
              >
                <span className="os-attention-dot" aria-hidden />
                {matter.severity === "critical" ? "Critical" : "High"}
              </p>
              <p className="os-attention-title">{matter.title}</p>
              <p className="os-attention-context">
                {matter.location} · {matter.entityLabel}
              </p>
              <p className="os-attention-reason">{matter.reason}</p>
            </div>
            <span className="os-attention-action">{matter.actionLabel}</span>
          </Link>
        ))}
      </div>

      {attention.viewAllHref && attention.viewAllLabel ? (
        <Link href={attention.viewAllHref} className="os-attention-view-all">
          {attention.viewAllLabel}
        </Link>
      ) : null}
    </section>
  );
}

function ActiveThreads({
  schedule,
  activity,
}: {
  schedule: WorkspaceScheduleItem[];
  activity: WorkspaceActivityItem[];
}) {
  const threads = [
    ...schedule.map((item) => {
      const status =
        item.module === "incidents"
          ? "Incident"
          : item.module === "maintenance"
            ? "Maintenance"
            : "Work order";
      return {
        id: item.id,
        status,
        title: item.title,
        meta: item.meta,
        href: `/${item.module === "work-orders" ? "work-orders" : item.module}`,
      };
    }),
    ...activity.slice(0, 4).map((item) => {
      const status =
        item.kind === "incident_reported"
          ? "Incident"
          : item.kind === "maintenance_requested"
            ? "Maintenance"
            : "Work order";
      return {
        id: item.id,
        status,
        title: item.title,
        meta: `${item.summary} · ${formatRelativeTime(item.at)}`,
        href: `/${item.module}`,
      };
    }),
  ].slice(0, 6);

  if (!threads.length) return null;

  return (
    <section>
      <h2 className="os-section-title">Recent activity</h2>
      <div className="os-thread">
        {threads.map((thread) => (
          <Link key={thread.id} href={thread.href} className="os-thread-item">
            <span className="os-thread-status">{thread.status}</span>
            <div className="os-thread-body">
              <p className="os-thread-title">{thread.title}</p>
              <p className="os-thread-meta">{thread.meta}</p>
            </div>
            <span className="os-thread-cue" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function NextActions({ actions }: { actions: WorkspaceQuickAction[] }) {
  return (
    <section>
      <h2 className="os-section-title">Next actions</h2>
      <div>
        {actions.slice(0, 5).map((action) => (
          <Link key={action.id} href={action.href} className="os-action-row">
            <div className="os-action-body">
              <p className="os-action-title">{action.title}</p>
              <p className="os-action-desc">{action.description}</p>
            </div>
            <span className="os-action-cue" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MyWork({ items }: { items: WorkspaceWorkSummary[] }) {
  const active = items.filter((item) => item.count > 0);
  if (!active.length) return null;

  return (
    <section>
      <h2 className="os-section-title">My work</h2>
      <div className="os-thread">
        {active.map((item) => (
          <Link key={item.id} href={item.href} className="os-thread-item">
            <span className="os-thread-status">{item.count}</span>
            <div className="os-thread-body">
              <p className="os-thread-title">{item.label}</p>
              <p className="os-thread-meta">{item.count} assigned to you</p>
            </div>
            <span className="os-thread-cue" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function OrganisationalPulse({ pulse }: { pulse: WorkspaceSnapshot["pulse"] }) {
  return (
    <section>
      <h2 className="os-section-title">Operational picture</h2>
      <div className="os-pulse" role="group" aria-label="Operational metrics">
        <div className="os-pulse-cell">
          <p className="os-pulse-value">{pulse.openIncidents}</p>
          <p className="os-pulse-label">Open incidents</p>
        </div>
        <div className="os-pulse-cell">
          <p
            className={`os-pulse-value${
              pulse.criticalIncidents > 0 ? " os-pulse-value-critical" : ""
            }`}
          >
            {pulse.criticalIncidents}
          </p>
          <p className="os-pulse-label">Critical</p>
        </div>
        <div className="os-pulse-cell">
          <p
            className={`os-pulse-value${
              pulse.openMaintenance > 8 ? " os-pulse-value-high" : ""
            }`}
          >
            {pulse.openMaintenance}
          </p>
          <p className="os-pulse-label">Maintenance</p>
        </div>
        <div className="os-pulse-cell">
          <p className="os-pulse-value">{pulse.openWorkOrders}</p>
          <p className="os-pulse-label">Work orders</p>
        </div>
      </div>
    </section>
  );
}

export function CommandSurface({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const { operationalState, pulse, attention } = snapshot;
  const signal = parseOperationalSignal(operationalState);
  const metaParts = [
    operationalState.subtext,
    `Updated ${formatRelativeTime(snapshot.asOf)}`,
  ].filter(Boolean);
  const showAttention = attention.total > 0;

  return (
    <ModeFrame mode="command">
      <CommandStatement
        headline={operationalState.statement}
        tone={
          operationalState.tone === "degraded"
            ? "attention"
            : operationalState.tone
        }
        signalValue={signal.value}
        signalPhrase={signal.phrase}
        meta={metaParts.join(" · ")}
      />

      {showAttention ? (
        <div className="os-composition-grid os-composition-grid-command">
          <RequiresAttention attention={attention} />
          <OrganisationalPulse pulse={pulse} />
        </div>
      ) : (
        <div className="os-composition-grid os-composition-grid-command">
          <div className="os-composition">
            <NextActions actions={snapshot.quickActions} />
            <ActiveThreads
              schedule={snapshot.schedule}
              activity={snapshot.activity}
            />
            <MyWork items={snapshot.myWork} />
          </div>
          <OrganisationalPulse pulse={pulse} />
        </div>
      )}

      {showAttention ? (
        <div className="os-composition">
          <NextActions actions={snapshot.quickActions} />
          <ActiveThreads
            schedule={snapshot.schedule}
            activity={snapshot.activity}
          />
          <MyWork items={snapshot.myWork} />
        </div>
      ) : null}
    </ModeFrame>
  );
}
