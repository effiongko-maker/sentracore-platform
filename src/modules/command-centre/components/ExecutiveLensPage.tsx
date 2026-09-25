import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Clock3,
  FileText,
  HardHat,
  Headphones,
  Landmark,
  Lock,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ExecutiveLens } from "../nav";
import { EXECUTIVE_OFFICE_BASE } from "../nav";
import type {
  CommandCentreAttentionItem,
  CommandCentreFigure,
  CommandCentrePulseDomain,
  CommandCentreSnapshot,
} from "../presentationTypes";
import { presentFigure, presentLine } from "../metricPresentation";
import { CommitmentsPanel } from "./CommitmentsPanel";

/**
 * Executive Office lens. Every figure comes from the same Executive Office projection the Overview uses (one read of
 * each operating environment through its own domain rules and permissions). Unknown, no-access and zero stay
 * distinct; each item links to its source record or environment. This component only lays that data out.
 */
export function ExecutiveLensPage({ lens, snapshot }: { lens: ExecutiveLens; snapshot?: CommandCentreSnapshot }) {
  const Icon = lens.icon;
  if (!snapshot) {
    return (
      <div className="scc scc--app eox">
        <Hero lens={lens} rail={[]} />
        <section className="eo-foundation" aria-label={`${lens.label} foundation`}>
          <span className="eo-foundation-icon" aria-hidden>
            <Icon className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div className="eo-foundation-body">
            <p className="eo-foundation-text">{lens.foundation}</p>
            {lens.overviewSection ? (
              <Link href={`${EXECUTIVE_OFFICE_BASE}#${lens.overviewSection.anchor}`} className="eo-foundation-link">
                Current view: {lens.overviewSection.label} on the Overview
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className="scc scc--app eox" data-lens={lens.id}>
      <LensBody lens={lens} snapshot={snapshot} />
    </div>
  );
}

// ── Shared executive primitives ─────────────────────────────────────────────────────────────────────────────

type RailCell = { label: string; value: string; tone?: "critical" | "warning" | "success" | "muted" | "accent"; note?: string };

function Hero({ lens, rail, caption }: { lens: ExecutiveLens; rail: RailCell[]; caption?: string | null }) {
  const Icon = lens.icon;
  return (
    <header className="eox-hero">
      <div className="eox-hero-top">
        <span className="eox-hero-icon" aria-hidden><Icon className="h-5 w-5" strokeWidth={1.6} /></span>
        <div className="eox-hero-copy">
          <Link href={EXECUTIVE_OFFICE_BASE} className="eox-hero-eyebrow">Executive Office</Link>
          <h1 className="eox-hero-title">{lens.label}</h1>
          <p className="eox-hero-sub">{lens.purpose}</p>
        </div>
        {caption ? <p className="eox-hero-caption">{caption}</p> : null}
      </div>
      {rail.length ? (
        <dl className="eox-rail" style={{ ["--eox-cells" as string]: rail.length }}>
          {rail.map((cell) => (
            <div key={cell.label} className="eox-rail-cell" data-tone={cell.tone ?? "default"}>
              <dt>{cell.label}</dt>
              <dd>{cell.value}</dd>
              {cell.note ? <span className="eox-rail-note">{cell.note}</span> : null}
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}

function SectionHead({ icon: Icon, title, meta, action }: { icon: LucideIcon; title: string; meta?: string | null; action?: React.ReactNode }) {
  return (
    <div className="eox-section-head">
      <span className="eox-section-icon" aria-hidden><Icon className="h-4 w-4" strokeWidth={1.7} /></span>
      <div className="eox-section-copy">
        <h2>{title}</h2>
        {meta ? <p>{meta}</p> : null}
      </div>
      {action}
    </div>
  );
}

function Empty({ icon: Icon, title, text, tone = "calm" }: { icon: LucideIcon; title: string; text?: string | null; tone?: "calm" | "muted" }) {
  return (
    <div className="eox-empty" data-tone={tone}>
      <span className="eox-empty-icon" aria-hidden><Icon className="h-5 w-5" strokeWidth={1.7} /></span>
      <p className="eox-empty-title">{title}</p>
      {text ? <p className="eox-empty-text">{text}</p> : null}
    </div>
  );
}

const ENV_ICON: Record<CommandCentrePulseDomain, LucideIcon> = {
  finance: Landmark,
  facility_management: Building2,
  ecc: Headphones,
  projects_construction: HardHat,
};

const TONE_LABEL: Record<CommandCentreAttentionItem["tone"], string> = { critical: "Critical", high: "High", medium: "Medium", info: "Info" };

function dateLabel(iso: string | null, timeZone: string | null): string {
  if (!iso) return "Not recorded";
  try {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: timeZone ?? "UTC" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Whole days between two instants (presentation of recorded dates; never a stored value). */
function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000));
}
function ageLabel(fromIso: string | null, asOf: string): string | null {
  if (!fromIso) return null;
  const d = daysBetween(fromIso, asOf);
  return d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`;
}

function stateTone(state: string, statusLabel: string): "attention" | "ok" | "muted" | "partial" {
  if (state === "restricted" || state === "unavailable" || state === "error") return "muted";
  if (/needs attention/i.test(statusLabel)) return "attention";
  if (state === "partial" || /partial/i.test(statusLabel)) return "partial";
  return "ok";
}

function Metrics({ lines, size = "md" }: { lines: string[]; size?: "md" | "lg" }) {
  return (
    <div className="eox-metric-lines" data-size={size}>
      {lines.map((line) => {
        const p = presentLine(line);
        if (p.kind === "text") return <p key={line} className="eox-metric-prose">{line}</p>;
        return (
          <div key={line} className="eox-metric-group">
            {p.group ? <span className="eox-metric-group-label">{p.group}</span> : null}
            <div className="eox-metric-row">
              {p.metrics.map((m) => (
                <span key={`${m.value}-${m.label}`} className="eox-metric">
                  <span className="eox-metric-value">{m.value}</span>
                  {m.label ? <span className="eox-metric-label">{m.label}</span> : null}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FinancialFigure({ label, figure, emphasis }: { label: string; figure: CommandCentreFigure; emphasis?: "primary" | "negative" }) {
  if (figure.state !== "known") {
    return (
      <div className="eox-figure" data-state={figure.state}>
        <span className="eox-figure-label">{label}</span>
        <span className="eox-figure-unknown">
          {figure.state === "no_access" ? <Lock className="h-3 w-3" aria-hidden /> : <CircleSlash className="h-3 w-3" aria-hidden />}
          {figure.label}
        </span>
      </div>
    );
  }
  const { value, detail } = presentFigure(figure.label);
  // A known zero is calm; only a real amount takes the negative (overdue) emphasis.
  const shown = emphasis === "negative" && !(figure.count && figure.count > 0) ? "default" : emphasis ?? "default";
  return (
    <div className="eox-figure" data-state="known" data-emphasis={shown}>
      <span className="eox-figure-label">{label}</span>
      <span className="eox-figure-value">{value}</span>
      {detail ? <span className="eox-figure-detail">{detail}</span> : null}
    </div>
  );
}

// ── Lenses ──────────────────────────────────────────────────────────────────────────────────────────────────

function LensBody({ lens, snapshot }: { lens: ExecutiveLens; snapshot: CommandCentreSnapshot }) {
  switch (lens.id) {
    case "decisions":
      return <DecisionsLens lens={lens} snapshot={snapshot} />;
    case "performance":
      return <PerformanceLens lens={lens} snapshot={snapshot} />;
    case "financial-position":
      return <FinancialPositionLens lens={lens} snapshot={snapshot} />;
    case "commitments":
      return <CommitmentsLens lens={lens} snapshot={snapshot} />;
    case "risk-attention":
      return <RiskLens lens={lens} snapshot={snapshot} />;
  }
}

function DecisionsLens({ lens, snapshot }: { lens: ExecutiveLens; snapshot: CommandCentreSnapshot }) {
  const { decisions } = snapshot;
  const visible = (decisions.state === "healthy" || decisions.state === "partial") && decisions.items.length > 0;
  const known = decisions.state === "healthy" || decisions.state === "empty" || decisions.state === "partial";
  const oldest = decisions.items
    .map((i) => i.submittedAt)
    .filter((d): d is string => Boolean(d))
    .sort()[0] ?? null;
  const rail: RailCell[] = [
    { label: "Awaiting your decision", value: known ? String(decisions.items.length) : "—", tone: decisions.items.length ? "accent" : undefined },
    { label: "Longest waiting", value: oldest ? ageLabel(oldest, snapshot.asOf)! : "—", tone: oldest && daysBetween(oldest, snapshot.asOf) >= 7 ? "warning" : undefined },
    { label: "Originating environment", value: "Finance" },
  ];
  return (
    <>
      <Hero lens={lens} rail={rail} caption={decisions.scopeNote} />
      <section className="eox-surface" aria-label="Decision queue">
        <SectionHead icon={FileText} title="Decision queue" meta={visible ? "Oldest first · each links to its source record" : null} />
        {visible ? (
          <ol className="eox-queue">
            {decisions.items.map((item) => {
              const age = ageLabel(item.submittedAt, snapshot.asOf);
              return (
                <li key={item.id}>
                  <Link href={item.href} className="eox-queue-row">
                    <span className="eox-queue-rail" aria-hidden />
                    <span className="eox-queue-main">
                      <span className="eox-queue-provenance">
                        <span className="eox-env-chip" data-env="finance"><Landmark className="h-3 w-3" aria-hidden />{item.environment}</span>
                        <span>{item.decisionLabel}</span>
                        {item.reference ? <span className="eox-mono">{item.reference}</span> : null}
                        {item.categoryLabel ? <span>{item.categoryLabel}</span> : null}
                      </span>
                      <span className="eox-queue-title">{item.title}</span>
                      <span className="eox-queue-reason">{item.reason}</span>
                    </span>
                    <span className="eox-queue-side">
                      <span className="eox-queue-amount">{item.amountLabel}</span>
                      <span className="eox-queue-meta">
                        <span className="eox-pill" data-tone="accent">{item.stateLabel}</span>
                        <span className="eox-queue-age"><Clock3 className="h-3 w-3" aria-hidden />{age ? `${age} · submitted ${dateLabel(item.submittedAt, snapshot.timeZone)}` : "Submitted date not recorded"}</span>
                      </span>
                      <span className="eox-cta">Review <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : decisions.state === "empty" ? (
          <Empty icon={CheckCircle2} title="You're all caught up." text="No decisions are currently awaiting your action." />
        ) : decisions.state === "partial" ? (
          <Empty icon={ShieldCheck} tone="muted" title="None visible within your access." text={decisions.scopeNote} />
        ) : (
          <Empty icon={Lock} tone="muted" title="Decisions are not available." text={decisions.reason} />
        )}
      </section>
    </>
  );
}

function PerformanceLens({ lens, snapshot }: { lens: ExecutiveLens; snapshot: CommandCentreSnapshot }) {
  const live = snapshot.performance.filter((e) => e.domain !== "projects_construction");
  const planned = snapshot.performance.filter((e) => e.domain === "projects_construction");
  const reporting = live.filter((e) => e.state === "healthy" || e.state === "partial").length;
  const attention = live.filter((e) => stateTone(e.state, e.statusLabel) === "attention").length;
  const restricted = live.filter((e) => e.state === "restricted").length;
  const rail: RailCell[] = [
    { label: "Environments reporting", value: `${reporting} of ${live.length}`, tone: reporting === live.length ? "success" : "warning" },
    { label: "Needing attention", value: String(attention), tone: attention ? "warning" : undefined },
    { label: "Restricted for you", value: String(restricted), tone: restricted ? "muted" : undefined },
  ];
  return (
    <>
      <Hero lens={lens} rail={rail} />
      <div className="eox-scoreboard">
        {live.map((env) => {
          const Icon = ENV_ICON[env.domain];
          const tone = stateTone(env.state, env.statusLabel);
          const established = env.throughput.filter((t) => !/not established/i.test(t));
          const notEstablished = env.throughput.some((t) => /not established/i.test(t));
          return (
            <article key={env.domain} className="eox-score" data-env={env.domain} data-tone={tone}>
              <header className="eox-score-head">
                <span className="eox-env-tile" aria-hidden><Icon className="h-4.5 w-4.5" strokeWidth={1.6} /></span>
                <div>
                  <h2>{env.label}</h2>
                  <span className="eox-pill" data-tone={tone}>{env.statusLabel}</span>
                </div>
              </header>
              <div className="eox-score-body">
                {tone === "muted" ? (
                  <Empty icon={Lock} tone="muted" title={env.position[0] ?? "Not available."} />
                ) : (
                  <Metrics lines={env.position} size="lg" />
                )}
              </div>
              {tone !== "muted" && (established.length || notEstablished) ? (
                <footer className="eox-score-foot">
                  <span className="eox-score-foot-label">Throughput</span>
                  {established.map((t) => <p key={t}>{t}</p>)}
                  {notEstablished ? <p className="eox-quiet">Not established yet — needs recorded operational history.</p> : null}
                </footer>
              ) : null}
              {env.href ? (
                <Link href={env.href} className="eox-score-link">Open {env.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
              ) : null}
            </article>
          );
        })}
      </div>
      {planned.map((env) => (
        <div key={env.domain} className="eox-planned">
          <HardHat className="h-4 w-4" aria-hidden />
          <span className="eox-planned-name">{env.label}</span>
          <span className="eox-pill" data-tone="muted">Planned</span>
          <span className="eox-quiet">{env.position[0]}</span>
        </div>
      ))}
    </>
  );
}

function FinancialPositionLens({ lens, snapshot }: { lens: ExecutiveLens; snapshot: CommandCentreSnapshot }) {
  const { finance, facilityManagement: fm } = snapshot.financialPosition;
  const rail: RailCell[] = [
    { label: "Accounting period", value: finance.periodLabel ?? "—", note: finance.periodStatus && finance.periodStatus !== "none" ? (finance.periodStatus === "open" ? "Open" : "Closed") : undefined },
    { label: "Finance scope", value: finance.state === "healthy" || finance.state === "partial" ? "All companies" : "Not available", tone: finance.state === "healthy" || finance.state === "partial" ? undefined : "muted" },
    { label: "Not yet posted", value: finance.unpostedItems.state === "known" ? finance.unpostedItems.label : "—", tone: finance.unpostedItems.state === "known" && (finance.unpostedItems.count ?? 0) > 0 ? "warning" : undefined },
  ];
  return (
    <>
      <Hero lens={lens} rail={rail} />
      <div className="eox-fp">
        <section className="eox-surface eox-fp-primary" aria-label="Platform Finance position">
          <SectionHead
            icon={Landmark}
            title="Platform Finance"
            meta={[finance.scope, finance.reason].filter(Boolean).join(" ") || null}
            action={finance.href ? <Link href={finance.href} className="eox-link">Open Finance <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link> : null}
          />
          <div className="eox-fp-groups">
            <div className="eox-fp-group">
              <p className="eox-fp-group-label">Receivables</p>
              <FinancialFigure label="Outstanding" figure={finance.receivablesOpen} emphasis="primary" />
              <FinancialFigure label="Overdue" figure={finance.receivablesOverdue} emphasis="negative" />
            </div>
            <div className="eox-fp-group">
              <p className="eox-fp-group-label">Payables</p>
              <FinancialFigure label="Outstanding" figure={finance.payablesOpen} emphasis="primary" />
              <FinancialFigure label="Overdue" figure={finance.payablesOverdue} emphasis="negative" />
            </div>
            <div className="eox-fp-group eox-fp-group--wide">
              <p className="eox-fp-group-label">Posted results{finance.periodLabel ? ` · ${finance.periodLabel}` : ""}</p>
              {[finance.postedRevenue, finance.postedExpenses, finance.postedNet].every((f) => f.state !== "known" && f.label === finance.postedRevenue.label) ? (
                <span className="eox-figure-unknown"><CircleSlash className="h-3 w-3" aria-hidden />{finance.postedRevenue.label}</span>
              ) : (
                <div className="eox-fp-results">
                  <FinancialFigure label="Revenue" figure={finance.postedRevenue} />
                  <FinancialFigure label="Expenses" figure={finance.postedExpenses} />
                  <FinancialFigure label="Net result" figure={finance.postedNet} emphasis="primary" />
                </div>
              )}
            </div>
          </div>
          <p className="eox-footnote">Cash and bank balances are not part of this view.</p>
        </section>

        <section className="eox-surface eox-fp-client" aria-label="Facility Management client payments">
          <SectionHead icon={Building2} title="Facility Management" meta="Client payments" />
          <span className="eox-separate-tag">Client-side position · excluded from Platform Finance totals</span>
          <FinancialFigure label="Pending payments outstanding" figure={fm.pendingPaymentsOutstanding} emphasis="primary" />
          {fm.reason ? <p className="eox-footnote">{fm.reason}</p> : null}
          {fm.href ? <Link href={fm.href} className="eox-link eox-link--block">Open Pending Payments <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link> : null}
        </section>
      </div>
    </>
  );
}

function CommitmentsLens({ lens, snapshot }: { lens: ExecutiveLens; snapshot: CommandCentreSnapshot }) {
  const { obligations, commitments } = snapshot;
  const commitmentsKnown = commitments.state === "healthy" || commitments.state === "empty";
  const obligationsListed = obligations.state === "healthy" || obligations.state === "empty";
  const overdueObligations = obligations.items.filter((i) => i.overdue).length;
  const rail: RailCell[] = [
    { label: "Overdue commitments", value: commitmentsKnown ? String(commitments.overdue.length) : "—", tone: commitmentsKnown && commitments.overdue.length ? "critical" : commitmentsKnown ? undefined : "muted" },
    { label: "Open commitments", value: commitmentsKnown ? String(commitments.open.length) : "—", tone: commitmentsKnown ? undefined : "muted" },
    { label: "Finance obligations due", value: obligationsListed ? String(obligations.items.length) : "—", tone: obligationsListed ? undefined : "muted" },
    { label: "Obligations overdue", value: obligationsListed ? String(overdueObligations) : "—", tone: obligationsListed && overdueObligations ? "critical" : obligationsListed ? undefined : "muted" },
  ];
  return (
    <>
      <Hero lens={lens} rail={rail} />
      <div className="eox-commitments">
        {commitments.state !== "restricted" ? <CommitmentsPanel commitments={commitments} /> : null}
        <section className="eox-surface" aria-label="Finance obligations due">
          <SectionHead icon={CalendarClock} title="Finance obligations due" meta={obligations.summary} />
          {obligations.items.length ? (
            <ol className="eox-obligations">
              {obligations.items.map((item) => {
                const d = new Date(`${item.dueDate}T00:00:00Z`);
                return (
                  <li key={item.id}>
                    <Link href={item.href} className="eox-obligation" data-overdue={item.overdue}>
                      <span className="eox-date-block" aria-hidden>
                        <span className="eox-date-day">{d.getUTCDate()}</span>
                        <span className="eox-date-month">{d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}</span>
                      </span>
                      <span className="eox-obligation-main">
                        <span className="eox-obligation-title">{item.title}</span>
                        <span className="eox-obligation-meta">
                          <span className="eox-env-chip" data-env="finance"><Landmark className="h-3 w-3" aria-hidden />{item.environment}</span>
                          <span>Payable · {item.statusLabel}</span>
                        </span>
                      </span>
                      <span className="eox-obligation-amount">{item.amountLabel}</span>
                      <span className="eox-pill" data-tone={item.overdue ? "critical" : "accent"}>{item.overdue ? "Overdue" : `Due ${dateLabel(item.dueDate, snapshot.timeZone)}`}</span>
                      <ChevronRight className="eox-go h-4 w-4" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : obligations.state === "empty" ? (
            <Empty icon={CheckCircle2} title="No Finance obligations due." text="Approved payables with a due date will appear here." />
          ) : (
            <Empty icon={Lock} tone="muted" title={obligations.summary ? "Individual obligations are not shown to you." : "Finance obligations are not available."} text={obligations.reason} />
          )}
          {obligations.items.length && obligations.reason ? <p className="eox-footnote">{obligations.reason}</p> : null}
        </section>
        <p className="eox-footnote">Facility Management and ECC do not yet record commitments with a committed date.</p>
      </div>
    </>
  );
}

function RiskLens({ lens, snapshot }: { lens: ExecutiveLens; snapshot: CommandCentreSnapshot }) {
  const { attention } = snapshot;
  const count = (tone: CommandCentreAttentionItem["tone"]) => attention.allItems.filter((i) => i.tone === tone).length;
  const evaluated = attention.coverage.filter((c) => c.status === "loaded").length;
  const applicable = attention.coverage.filter((c) => c.status !== "not_enabled").length;
  const rail: RailCell[] = [
    { label: "Critical", value: String(count("critical")), tone: count("critical") ? "critical" : undefined },
    { label: "High", value: String(count("high")), tone: count("high") ? "warning" : undefined },
    { label: "Other", value: String(count("medium") + count("info")) },
    { label: "Sources evaluated", value: applicable ? `${evaluated} of ${applicable}` : "—", tone: !applicable ? "muted" : evaluated === applicable ? "success" : "warning" },
  ];
  const gaps = attention.coverage.filter((c) => c.status !== "loaded" && c.status !== "not_enabled" && c.note);
  const tones: CommandCentreAttentionItem["tone"][] = ["critical", "high", "medium", "info"];
  return (
    <>
      <Hero lens={lens} rail={rail} caption={attention.complete ? null : "Partial coverage"} />
      <section className="eox-surface" aria-label="Priority register">
        <SectionHead icon={AlertTriangle} title="Priority register" meta={attention.allItems.length ? attention.summary : null} />
        {attention.allItems.length ? (
          tones.map((tone) => {
            const items = attention.allItems.filter((i) => i.tone === tone);
            if (!items.length) return null;
            return (
              <div key={tone} className="eox-register-group" data-tone={tone}>
                <p className="eox-register-label"><span className="eox-severity-dot" aria-hidden />{TONE_LABEL[tone]} · {items.length}</p>
                <ul className="eox-register">
                  {items.map((item) => {
                    const inner = (
                      <>
                        <span className="eox-severity" data-tone={item.tone}>{TONE_LABEL[item.tone]}</span>
                        <span className="eox-register-main">
                          <span className="eox-register-title">{item.title}</span>
                          {item.detail ? <span className="eox-register-detail">{item.detail}</span> : null}
                        </span>
                        <span className="eox-env-chip" data-env={item.sourceLabel === "Finance" ? "finance" : item.sourceLabel === "ECC" ? "ecc" : item.sourceLabel === "Facility Management" ? "facility_management" : "other"}>{item.sourceLabel}</span>
                        <ChevronRight className="eox-go h-4 w-4" aria-hidden />
                      </>
                    );
                    return (
                      <li key={item.id}>
                        {item.href ? <Link href={item.href} className="eox-register-row">{inner}</Link> : <div className="eox-register-row">{inner}</div>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        ) : attention.state === "empty" ? (
          <Empty icon={ShieldCheck} title="Nothing needs your attention." text={attention.summary} />
        ) : (
          <Empty icon={CircleSlash} tone="muted" title="Attention could not be fully evaluated." text={attention.summary} />
        )}
        {gaps.length ? (
          <ul className="eox-coverage" aria-label="Attention coverage">
            {gaps.map((c) => (
              <li key={c.domain} data-status={c.status}>
                <strong>{c.label}</strong> · {c.status === "restricted" ? "Restricted" : c.status === "partial" ? "Partial" : "Unavailable"} — {c.note}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </>
  );
}
