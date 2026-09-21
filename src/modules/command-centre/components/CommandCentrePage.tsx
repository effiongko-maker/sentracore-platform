import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
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

function PulseCard({ card }: { card: CommandCentrePulseCard }) {
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
        {card.lines.slice(0, 4).map((line) => (
          <p key={line} className="scc-pulse-line">
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
      <Link href={card.href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

function AttentionBlock({
  attention,
}: {
  attention: CommandCentreSnapshot["attention"];
}) {
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
        <p className="scc-attn-summary">{attention.summary}</p>
        <ul className="scc-attn-list">
          {attention.items.map((item) => {
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
              <li key={item.id}>
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
  if (decisions.state === "healthy" && decisions.items.length > 0) {
    return (
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
              </span>
            </Link>
          </li>
        ))}
      </ul>
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

  return (
    <div className="scc">
      <header className="scc-hero">
        <div className="scc-hero-media" aria-hidden>
          <Image
            src="/command-centre/hero-city-sunset.png"
            alt=""
            fill
            priority
            className="scc-hero-image"
            sizes="100vw"
          />
        </div>
        <div className="scc-hero-veil" aria-hidden />
        <div className="scc-hero-inner">
          <div className="scc-hero-copy">
            <p className="scc-eyebrow">Command Centre</p>
            <h1 className="scc-greeting">{snapshot.greeting}</h1>
            <p className="scc-lede">{snapshot.lede}</p>
          </div>
          <div className="scc-hero-centre">
            <span className="scc-hero-rule" aria-hidden />
            <p className="scc-hero-quote">
              Clarity today.
              <br />
              A stronger tomorrow.
            </p>
          </div>
        </div>
      </header>

      <section className="scc-pulse" aria-labelledby="scc-pulse-heading">
        <div className="scc-section-head">
          <div>
            <h2 id="scc-pulse-heading" className="scc-section-title">
              Organisational Pulse
            </h2>
            <p className="scc-section-lede">
              Where the organisation stands, by domain.
            </p>
          </div>
          {dateLabel || checkedLabel ? (
            <p className="scc-pulse-meta">
              <span>
                {checkedLabel ? `Checked ${checkedLabel}` : ""}
                {checkedLabel && dateLabel ? " · " : ""}
                {dateLabel}
              </span>
            </p>
          ) : null}
        </div>
        <div className="scc-pulse-grid">
          {snapshot.pulse.map((card) => (
            <PulseCard key={card.domain} card={card} />
          ))}
        </div>
      </section>

      <section className="scc-board" aria-label="Command surfaces">
        <div className="scc-col">
          <article
            className="scc-panel scc-panel--attention"
            aria-labelledby="scc-attention"
          >
            <PanelHead id="scc-attention" title="Needs Your Attention" />
            <AttentionBlock attention={attention} />
          </article>
        </div>

        <div className="scc-col">
          <article
            className="scc-panel scc-panel--decisions"
            aria-labelledby="scc-decisions"
          >
            <PanelHead
              id="scc-decisions"
              title="Your Decisions"
              actionHref={decisions.viewAllHref}
              actionLabel="View all"
            />
            <DecisionsBlock decisions={decisions} />
          </article>

          <CommitmentsPanel commitments={snapshot.commitments} />
        </div>

        <div className="scc-col">
          <article className="scc-panel scc-panel--feed" aria-labelledby="scc-last-visit">
            <PanelHead
              id="scc-last-visit"
              title="Since Your Last Visit"
              actionHref={null}
            />
            <LastVisitBlock lastVisit={snapshot.lastVisit} />
          </article>

          {/* Editorial brand copy and imagery — carries no data, status or claim. */}
          <aside className="scc-editorial" aria-label="SentraCore™ brand">
            <div className="scc-editorial-media" aria-hidden>
              <Image
                src="/command-centre/editorial-mountain-sunset.png"
                alt=""
                fill
                className="scc-editorial-image"
                sizes="(max-width: 900px) 100vw, 28vw"
              />
            </div>
            <div className="scc-editorial-veil" aria-hidden />
            <p className="scc-editorial-quote">
              Extraordinary organisations aren&apos;t found.
              <br />
              They&apos;re built.
            </p>
            <p className="scc-editorial-mark">SentraCore™</p>
          </aside>
        </div>
      </section>
      {footer}
    </div>
  );
}
