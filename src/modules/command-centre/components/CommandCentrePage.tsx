import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CircleDot,
  Building2,
  ChevronRight,
  FileText,
  Headphones,
  HardHat,
  Landmark,
} from "lucide-react";
import type {
  CommandCentreAttentionItem,
  CommandCentrePulseCard,
  CommandCentreSnapshot,
  CommandCentreSurfaceState,
} from "@/modules/command-centre/presentationTypes";
import { cn } from "@/lib/utils";
import { CommitmentsPanel } from "@/modules/command-centre/components/CommitmentsPanel";
import { EXECUTIVE_OFFICE_LENSES } from "@/modules/command-centre/nav";
import {
  attentionSignal,
  decisionsSignal,
  performanceSignal,
  type ExecutiveSignal,
} from "@/modules/command-centre/executiveSignals";

import { overviewAttention, overviewPulseLines } from "@/modules/command-centre/overviewPresentation";

const PULSE_ICON = {
  finance: Landmark,
  operations: Building2,
  ecc: Headphones,
  projects_construction: HardHat,
} as const;

function formatAsOfDate(iso: string, timeZone: string | null): string {
  // The organisation's timezone comes from the server snapshot. Without it the
  // date is omitted — the browser timezone is never used as a substitute.
  if (!timeZone) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatCheckedTime(iso: string, timeZone: string | null): string {
  try {
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone ?? "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso));
    return timeZone ? time : `${time} UTC`;
  } catch {
    return "";
  }
}

function pulseStatusClass(
  state: CommandCentreSurfaceState,
  label: string
): string {
  if (state === "unavailable" || state === "restricted" || state === "empty") {
    return "scc-pulse-status--muted";
  }
  if (state === "error") return "scc-pulse-status--warn";
  if (/attention|needs|partial/i.test(label)) return "scc-pulse-status--warn";
  return "scc-pulse-status--ok";
}

function attentionToneClass(tone: CommandCentreAttentionItem["tone"]): string {
  if (tone === "critical") return "scc-attn-tone--critical";
  if (tone === "high") return "scc-attn-tone--high";
  if (tone === "medium") return "scc-attn-tone--medium";
  return "scc-attn-tone--info";
}

function attentionToneLabel(tone: CommandCentreAttentionItem["tone"]): string {
  if (tone === "critical") return "Critical";
  if (tone === "high") return "High";
  if (tone === "medium") return "Medium";
  return "Info";
}

function QuietEmpty({ label }: { label: string }) {
  return (
    <div className="scc-quiet-empty">
      <p>{label}</p>
    </div>
  );
}

function PanelHead({
  id,
  title,
  actionHref,
  actionLabel,
  trailing,
}: {
  id: string;
  title: string;
  actionHref?: string | null;
  actionLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="scc-panel-head">
      <h2 id={id} className="scc-panel-title">
        {title}
      </h2>
      {trailing}
      {actionHref ? (
        <Link href={actionHref} className="scc-panel-link">
          {actionLabel ?? "View all"}{" "}
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function PulseCard({ card, decisions }: { card: CommandCentrePulseCard; decisions: CommandCentreSnapshot["decisions"] }) {
  const Icon = PULSE_ICON[card.domain];
  const isSoon = card.state === "unavailable" && card.domain === "projects_construction";
  const body = (
    <>
      <div className="scc-pulse-top">
        <span className="scc-pulse-icon" aria-hidden>
          <Icon strokeWidth={1.5} className="h-4 w-4" />
        </span>
        <div className="scc-pulse-identity">
          <span className="scc-pulse-label">{card.label}</span>
          <span
            className={cn(
              "scc-pulse-status",
              pulseStatusClass(card.state, card.statusLabel)
            )}
          >
            <span className="scc-pulse-dot" aria-hidden />
            {card.statusLabel}
          </span>
        </div>
        {card.href || card.disabledNavigationLabel ? (
          <span
            className={cn(
              "scc-pulse-chevron",
              card.disabledNavigationLabel && "scc-pulse-chevron--disabled"
            )}
            title={card.disabledNavigationLabel ?? undefined}
            aria-label={card.disabledNavigationLabel ?? undefined}
            aria-hidden={card.disabledNavigationLabel ? undefined : true}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <div className="scc-pulse-body">
        {overviewPulseLines(card, decisions).map((line, index) => (
          <p key={line} className={index === 0 ? "scc-pulse-line eo-pulse-headline" : "scc-pulse-line"}>
            {line}
          </p>
        ))}
      </div>
      {isSoon ? <span className="scc-pulse-crane" aria-hidden /> : null}
    </>
  );

  const className = cn(
    "scc-pulse-card",
    isSoon && "scc-pulse-card--soon",
    card.state === "restricted" && "scc-pulse-card--muted"
  );

  if (card.href) {
    return (
      <Link href={card.href} className={className} data-state={card.state} data-partial={card.partial || card.state === "partial"}>
        {body}
      </Link>
    );
  }
  return <div className={className} data-state={card.state} data-partial={card.partial || card.state === "partial"}>{body}</div>;
}

function AttentionBlock({ snapshot }: { snapshot: CommandCentreSnapshot }) {
  const { attention } = snapshot;
  const { items, decisionsElsewhere, commitmentsElsewhere } = overviewAttention(snapshot);
  const referrals = decisionsElsewhere || commitmentsElsewhere ? (
    <p className="scc-panel-scope">
      Also in your agenda: {decisionsElsewhere ? <a href="#scc-decisions">Finance decisions</a> : null}
      {decisionsElsewhere && commitmentsElsewhere ? " · " : null}
      {commitmentsElsewhere ? <a href="#commitments">Overdue commitments</a> : null}.
    </p>
  ) : null;
  const gaps = attention.coverage.filter(
    (c) => c.status !== "loaded" && c.status !== "not_enabled" && c.note
  );
  const coverageNote =
    gaps.length > 0 ? (
      <ul className="scc-attn-coverage" aria-label="Attention coverage">
        {gaps.map((c) => (
          <li key={c.domain} data-status={c.status}>
            <strong>{c.label}</strong> · {c.status === "restricted" ? "Restricted" : c.status === "partial" ? "Partial" : "Unavailable"} — {c.note}
          </li>
        ))}
      </ul>
    ) : null;

  if (attention.items.length > 0) {
    return (
      <>
        <ul className="scc-attn-list">
          {items.map((item) => {
            const inner = (
              <>
                <span
                  className={cn("scc-attn-tone", attentionToneClass(item.tone))}
                >
                  {attentionToneLabel(item.tone)}
                </span>
                <span className="scc-attn-body">
                  <span className="scc-attn-title">{item.title}</span>
                  {item.detail ? (
                    <span className="scc-attn-detail">{item.detail}</span>
                  ) : null}
                  <span className="scc-attn-source">{item.sourceLabel}</span>
                </span>
                <span className="scc-attn-go" aria-hidden>
                  <ChevronRight className="h-4 w-4" />
                </span>
              </>
            );
            return (
              <li key={item.id} data-tone={item.tone}>
                {item.href ? (
                  <Link href={item.href} className="scc-attn-row">
                    {inner}
                  </Link>
                ) : (
                  <div className="scc-attn-row">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
        {attention.hiddenCount > 0 ? (
          <p className="scc-attn-summary">
            and {attention.hiddenCount} more not shown
          </p>
        ) : null}
        {referrals}
        {coverageNote}
      </>
    );
  }

  return (
    <>
      <QuietEmpty label={attention.summary} />
      {coverageNote}
    </>
  );
}

function DecisionsBlock({
  decisions,
}: {
  decisions: CommandCentreSnapshot["decisions"];
}) {
  if ((decisions.state === "healthy" || decisions.state === "partial") && decisions.items.length > 0) {
    return (
      <>
      <ul className="scc-decision-list">
        {decisions.items.map((item) => (
          <li key={item.id}>
            <Link href={item.href} className="scc-decision-row">
              <span className="scc-decision-icon" aria-hidden>
                <FileText strokeWidth={1.5} className="h-4 w-4" />
              </span>
              <span className="scc-decision-main">
                <span className="scc-decision-title">{item.title}</span>
                <span className="scc-decision-meta">
                  {item.reference ? <span>{item.reference}</span> : null}
                  {item.categoryLabel ? <span>{item.categoryLabel}</span> : null}
                </span>
              </span>
              <span className="scc-decision-aside">
                <span className="scc-decision-amount">{item.amountLabel}</span>
                <span className="scc-decision-badge">{item.decisionLabel}</span>
                <span className="eo-decision-action">Review <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {decisions.scopeNote ? <p className="scc-panel-scope">{decisions.scopeNote}</p> : null}
      </>
    );
  }

  if (decisions.state === "empty") {
    return <QuietEmpty label="No Finance decisions are waiting on you." />;
  }
  return <QuietEmpty label={decisions.reason ?? "Decisions are not available."} />;
}

function LastVisitBlock({
  lastVisit,
}: {
  lastVisit: CommandCentreSnapshot["lastVisit"];
}) {
  if (lastVisit.state !== "healthy" || lastVisit.items.length === 0) {
    return (
      <>
        <QuietEmpty label={lastVisit.message} />
        <p className="scc-panel-scope">{lastVisit.scope}</p>
      </>
    );
  }

  return (
    <>
    <ul className="scc-change-list">
      {lastVisit.items.map((item) => {
        const body = (
          <>
            <span className="scc-change-dot" aria-hidden />
            <span className="scc-change-body">
              <span className="scc-change-title">{item.title}</span>
              <span className="scc-change-detail">
                {item.detail}
                <span aria-hidden> · </span>
                <time dateTime={item.occurredAt}>{item.timeLabel}</time>
              </span>
            </span>
          </>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="scc-change-row">
                {body}
              </Link>
            ) : (
              <div className="scc-change-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
    <p className="scc-panel-scope">{lastVisit.scope}</p>
    </>
  );
}

function PictureSignal({ label, signal, href }: { label: string; signal: ExecutiveSignal; href: string }) {
  return (
    <a href={href} className="eo-picture-item" data-tone={signal.tone}>
      <span className="eo-picture-label">
        <span className="eo-signal-dot" aria-hidden />
        {label}
        <ArrowUpRight className="eo-picture-arrow h-4 w-4" aria-hidden />
      </span>
      <span className={cn("eo-picture-text", `eo-tone-${signal.tone}`)}>{signal.text}</span>
      <span className="eo-picture-track" aria-hidden><span /></span>
    </a>
  );
}

export function CommandCentrePage({
  snapshot,
  footer,
}: {
  snapshot: CommandCentreSnapshot;
  /** Generic composition slot supplied by the route; Command Centre knows nothing of its content. */
  footer?: ReactNode;
}) {
  const dateLabel = formatAsOfDate(snapshot.asOf, snapshot.timeZone);
  const { decisions, attention } = snapshot;
  const checkedLabel = formatCheckedTime(snapshot.checkedAt, snapshot.timeZone);
  const headline = attentionSignal(attention);

  return (
    <div className="scc scc--app eo-overview">
      <div className="eo-masthead">
        <header className="eo-header">
          <div className="eo-context-line">
            <p className="eo-eyebrow">{snapshot.greeting}</p>
            {dateLabel ? <p className="eo-date">{dateLabel}</p> : null}
          </div>
          <div className="eo-masthead-main">
            <div className="eo-identity">
              <p className="eo-kicker">Today</p>
              <h1>Executive Office</h1>
              <p className="eo-situation">A current view of what matters across the organisation.</p>
            </div>
            <a href="#eo-agenda-heading" className="eo-headline-state">
              <CircleDot className="eo-state-icon h-5 w-5" strokeWidth={1.5} aria-hidden />
              <span>
                <span className="eo-state-label">Your agenda</span>
                <span className="eo-state-text">Review matters requiring action</span>
              </span>
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden />
            </a>
          </div>
        </header>

        <section className="eo-briefing" aria-labelledby="eo-picture-heading">
          <div className="eo-briefing-head">
            <h2 id="eo-picture-heading">At a glance</h2>
            {checkedLabel ? (
              <p>Snapshot checked <time dateTime={snapshot.checkedAt}>{checkedLabel}</time></p>
            ) : null}
          </div>
          <div className="eo-picture">
            <PictureSignal label="Needs attention" signal={headline} href="#eo-agenda-heading" />
            <PictureSignal label="Operating coverage" signal={performanceSignal(snapshot.pulse)} href="#scc-pulse-heading" />
            {(decisions.state === "healthy" || decisions.state === "partial") && decisions.items.length > 0 ? (
              <PictureSignal label="Awaiting your action" signal={decisionsSignal(decisions)} href="#scc-decisions" />
            ) : null}
          </div>
        </section>
      </div>

      <nav className="eo-perspectives" aria-label="Executive lenses">
        <div className="eo-perspectives-heading">
          <span className="eo-kicker">Executive lenses</span>
          <span>Open a deeper Executive Office view.</span>
        </div>
        <div className="eo-lenses">
          {EXECUTIVE_OFFICE_LENSES.map((lens, index) => {
            const Icon = lens.icon;
            return (
              <Link key={lens.id} href={lens.href} className="eo-lens-link">
                <span className="eo-lens-top">
                  <span className="eo-lens-icon"><Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden /></span>
                  <span className="eo-lens-index" aria-hidden>0{index + 1}</span>
                  <ArrowUpRight className="eo-lens-go h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="eo-lens-label">{lens.label}</span>
                <span className="eo-lens-signal">{lens.purpose}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <section className="scc-pulse" aria-labelledby="scc-pulse-heading">
        <div className="eo-section-heading">
          <span className="eo-section-index" aria-hidden>01</span>
          <div>
            <h2 id="scc-pulse-heading">Organisational Pulse</h2>
            <p>The current position across operating environments.</p>
          </div>
          <span className="eo-section-rule" aria-hidden />
        </div>
        <div className="eo-pulse-surface">
          <div className="eo-pulse-caption"><span>Operating environments</span><span>Current position</span></div>
          <div className="scc-pulse-grid">
            {snapshot.pulse.map((card) => <PulseCard key={card.domain} card={card} decisions={decisions} />)}
          </div>
        </div>
      </section>

      <section className="eo-agenda" aria-labelledby="eo-agenda-heading">
        <div className="eo-section-heading">
          <span className="eo-section-index" aria-hidden>02</span>
          <div>
            <h2 id="eo-agenda-heading">Your agenda</h2>
            <p>Matters to weigh. Decisions to move forward.</p>
          </div>
          <span className="eo-section-rule" aria-hidden />
        </div>
        <div className="eo-agenda-grid">
          <article className="scc-panel scc-panel--attention" aria-labelledby="scc-attention">
            <div className="eo-panel-overline"><span className="eo-priority-mark" aria-hidden />Awareness & priority</div>
            <PanelHead id="scc-attention" title="Needs Your Attention" />
            <AttentionBlock snapshot={snapshot} />
          </article>
          <article className="scc-panel scc-panel--decisions" aria-labelledby="scc-decisions">
            <div className="eo-panel-overline"><ArrowUpRight className="h-3.5 w-3.5" aria-hidden />Action required</div>
            <PanelHead id="scc-decisions" title="Your Decisions" actionHref={decisions.viewAllHref} actionLabel="View all" />
            <DecisionsBlock decisions={decisions} />
          </article>
        </div>
      </section>

      <section className="eo-follow-through" aria-labelledby="eo-follow-heading">
        <div className="eo-section-heading">
          <span className="eo-section-index" aria-hidden>03</span>
          <div>
            <h2 id="eo-follow-heading">{snapshot.commitments.state === "restricted" ? "Recent context" : "Direction & follow-through"}</h2>
            <p>{snapshot.commitments.state === "restricted" ? "Recorded changes since your last visit." : "Executive commitments and recorded changes."}</p>
          </div>
          <span className="eo-section-rule" aria-hidden />
        </div>
        <div className="eo-follow-grid">
          <CommitmentsPanel commitments={snapshot.commitments} />
          <article className="scc-panel scc-panel--feed" aria-labelledby="scc-last-visit">
            <div className="eo-panel-overline">Continuity</div>
            <PanelHead id="scc-last-visit" title="Since Your Last Visit" />
            <LastVisitBlock lastVisit={snapshot.lastVisit} />
          </article>
        </div>
      </section>
      {footer}
    </div>
  );
}
