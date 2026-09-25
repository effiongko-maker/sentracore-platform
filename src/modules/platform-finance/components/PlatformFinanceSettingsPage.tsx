"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Building2, CalendarDays, CheckCircle2, CircleDashed, Cog, Hash, ShieldCheck, Workflow, XCircle } from "lucide-react";
import styles from "./PlatformFinanceSettingsPage.module.css";
import { PlatformFinanceSettingsService } from "@/services/platform-finance/PlatformFinanceSettingsService";
import type { FinanceReadinessState, FinanceSettingsSnapshot } from "@/modules/platform-finance/settings";

const STATE_LABEL: Record<FinanceReadinessState, string> = {
  configured: "Configured",
  system_managed: "System managed",
  requires_configuration: "Requires configuration",
  not_available: "Not available",
};
const STATE_ICON = { configured: CheckCircle2, system_managed: Cog, requires_configuration: CircleDashed, not_available: XCircle };

/** Document references as the code generates them — none is configurable today. */
const NUMBERING: Array<{ document: string; format: string; note: string }> = [
  { document: "Invoices", format: "INV-YYYYMMDD-XXXXXX", note: "Generated on creation; unique per company." },
  { document: "Manual journals", format: "MJ-YYYYMMDD-XXXXXX", note: "Generated when the journal is posted." },
  { document: "Receipts", format: "RCPT-YYYYMMDD-XXXXXX", note: "Generated when the receipt is recorded." },
  { document: "Vendor bills", format: "VB- + record ID", note: "The supplier's own invoice number is kept as entered." },
  { document: "Payments", format: "PAY- + record ID", note: "Display reference derived from the record." },
  { document: "Financial requests", format: "No system number", note: "An optional external reference is recorded as entered." },
];

const WORKFLOW: Array<{ flow: string; steps: string[] }> = [
  { flow: "Financial requests", steps: ["Submitted", "Finance review (query / resubmit)", "CEO approval", "Approved, partly approved or rejected"] },
  { flow: "Vendor bills", steps: ["Submitted", "Finance review (query / resubmit)", "CEO approval", "Payable"] },
  { flow: "Payables", steps: ["Pending approval", "Approved", "Scheduled", "Paid"] },
  { flow: "Accounting", steps: ["Review & Post", "Journal in an open period", "Period close"] },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function Section({ icon: Icon, title, lead, action, children }: { icon: typeof Cog; title: string; lead: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.panelIcon}><Icon size={18} strokeWidth={1.7} aria-hidden="true" /></span>
        <div className={styles.panelCopy}>
          <h2>{title}</h2>
          <p>{lead}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PlatformFinanceSettingsPage() {
  const [data, setData] = useState<FinanceSettingsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    PlatformFinanceSettingsService.get()
      .then((snapshot) => { if (!cancelled) setData(snapshot); })
      .catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load Finance settings."); });
    return () => { cancelled = true; };
  }, []);

  const counts = data
    ? (Object.keys(STATE_LABEL) as FinanceReadinessState[]).map((state) => ({ state, n: data.readiness.filter((r) => r.state === state).length }))
    : [];

  return (
    <div className={`pf-reports ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className="pf-ov-eyebrow">Platform Finance</p>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.intro}>What governs Finance, what is configured, and what still needs configuration before a capability can operate fully.</p>
        </div>
        {data ? (
          <dl className={styles.summary} aria-label="Readiness summary">
            {counts.map(({ state, n }) => (
              <div key={state} data-state={state}><dt>{STATE_LABEL[state]}</dt><dd>{n}</dd></div>
            ))}
          </dl>
        ) : null}
      </header>

      {error ? <div className="pf-vb-alert is-danger" role="alert">{error}</div> : null}
      {!data && !error ? <p className="pf-state-message">Loading Finance settings…</p> : null}

      {data ? (
        <>
          <section className={styles.readiness} aria-labelledby="pf-settings-readiness">
            <h2 id="pf-settings-readiness" className={styles.kicker}>Finance readiness</h2>
            <ul className={styles.readinessGrid}>
              {data.readiness.map((item) => {
                const Icon = STATE_ICON[item.state];
                const body = (
                  <>
                    <span className={styles.state} data-state={item.state}><Icon size={13} aria-hidden="true" />{STATE_LABEL[item.state]}</span>
                    <h3>{item.label}</h3>
                    <p>{item.detail}</p>
                  </>
                );
                return (
                  <li key={item.id}>
                    {item.href ? <Link href={item.href} className={styles.readinessCard}>{body}</Link> : <div className={styles.readinessCard}>{body}</div>}
                  </li>
                );
              })}
            </ul>
          </section>

          <div className={styles.columns}>
            <Section icon={Building2} title="Finance profile" lead="The identity and defaults Finance records are kept under.">
              <dl className={styles.facts}>
                <div><dt>Companies you can access</dt><dd>{data.companies.length ? data.companies.map((c) => `${c.name} (${c.code})`).join(", ") : "None assigned"}</dd></div>
                <div><dt>Currency</dt><dd>NGN by default; every document records its own currency. <em>System managed</em></dd></div>
                <div><dt>Financial year</dt><dd>Calendar year in monthly periods (January–December). <em>System managed</em></dd></div>
                <div><dt>Request categories</dt><dd>{data.requestCategories} active (system provided).</dd></div>
              </dl>
            </Section>

            <Section
              icon={BookOpen}
              title="Accounting & posting"
              lead="Posting only from reviewed, balanced journals into open periods."
              action={<Link className={styles.link} href="/platform-finance/accounting/chart-of-accounts">{data.canManageCoa ? "Manage accounts" : "Chart of Accounts"} <ArrowRight size={13} aria-hidden="true" /></Link>}
            >
              <dl className={styles.facts}>
                <div><dt>Recognition</dt><dd>Supplier bills and payments are recognised through Review & Post; invoices and receipts post to receivables. <em>System managed</em></dd></div>
                <div><dt>Closed periods</dt><dd>Posting into a closed period is refused by the database. Closing needs period authority.</dd></div>
                <div><dt>Chart of Accounts</dt><dd>{data.chartOfAccounts.active} active{data.chartOfAccounts.inactive ? ` · ${data.chartOfAccounts.inactive} inactive` : ""} · {Object.entries(data.chartOfAccounts.byType).map(([t, n]) => `${n} ${t}`).join(" · ")}</dd></div>
                <div><dt>Control accounts</dt><dd>
                  <ul className={styles.inline}>
                    {data.chartOfAccounts.systemAccounts.map((s) => (
                      <li key={s.code} data-ok={s.active}>{s.code} {s.role}{s.active ? "" : " — missing or inactive"}</li>
                    ))}
                  </ul>
                  Fixed by the posting rules, not configurable. Cash and bank accounts post to their own control GL account.
                </dd></div>
              </dl>
            </Section>
          </div>

          <Section
            icon={CalendarDays}
            title="Accounting periods"
            lead="Per company you can access."
            action={<Link className={styles.link} href="/platform-finance/accounting/periods">{data.canManagePeriods ? "Manage periods" : "Periods"} <ArrowRight size={13} aria-hidden="true" /></Link>}
          >
            {data.periods.length === 0 ? (
              <p className={styles.muted}>No finance company is assigned to you.</p>
            ) : (
              <table className={styles.table}>
                <thead><tr><th>Company</th><th>Open</th><th>Closed</th><th>Covers today</th><th>Latest period ends</th></tr></thead>
                <tbody>
                  {data.periods.map((p) => (
                    <tr key={p.companyId}>
                      <td>{p.companyName} <span className={styles.muted}>{p.companyCode}</span></td>
                      <td>{p.open}</td>
                      <td>{p.closed}</td>
                      <td>{p.coversToday ? "Yes" : <span className={styles.warn}>No</span>}</td>
                      <td>{formatDate(p.latestEnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <div className={styles.columns}>
            <Section icon={Hash} title="Document numbering" lead="Generated by the system. Not configurable in this release.">
              <table className={styles.table}>
                <thead><tr><th>Document</th><th>Reference</th><th>Notes</th></tr></thead>
                <tbody>
                  {NUMBERING.map((n) => (
                    <tr key={n.document}><td>{n.document}</td><td><code>{n.format}</code></td><td className={styles.muted}>{n.note}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section icon={Workflow} title="Workflow controls" lead="The lifecycle each Finance record follows. Enforced by the system.">
              <ul className={styles.flows}>
                {WORKFLOW.map((w) => (
                  <li key={w.flow}>
                    <strong>{w.flow}</strong>
                    <span>{w.steps.join(" → ")}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <aside className={styles.access}>
            <ShieldCheck size={17} aria-hidden="true" />
            <p>Who may review, approve, post or close periods — and which companies they can see — is granted in the Admin Console, not here.</p>
            <Link className={styles.link} href="/admin/access">Finance access <ArrowRight size={13} aria-hidden="true" /></Link>
          </aside>
        </>
      ) : null}
    </div>
  );
}
