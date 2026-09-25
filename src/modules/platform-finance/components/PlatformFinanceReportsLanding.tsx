"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Lock } from "lucide-react";
import { PlatformFinanceReportsService } from "@/services/platform-finance/PlatformFinanceReportsService";
import type { FinanceReportCatalogueEntry } from "@/modules/platform-finance/reports/types";
import type { FinanceReportFamily } from "@/modules/platform-finance/reports/catalogue";

const SECTIONS: Array<{ family: FinanceReportFamily; title: string; lead: string }> = [
  {
    family: "statement",
    title: "Financial statements",
    lead: "Formal statements prepared only from posted journals. Suitable for management, accountants and auditors.",
  },
  {
    family: "accounting",
    title: "Accounting reports",
    lead: "Ledger detail behind the statements, and the accounting not yet posted to them.",
  },
  {
    family: "operational",
    title: "Management reports",
    lead: "Operational positions from Finance workflows. These are not general-ledger figures.",
  },
  {
    family: "historical",
    title: "Historical context",
    lead: "Imported evidence from before SentraCore™. Never part of any statement.",
  },
];

function EntryRow({ entry }: { entry: FinanceReportCatalogueEntry }) {
  const body = (
    <>
      <div className="pf-reports-entry-main">
        <p className="pf-reports-entry-title">
          {entry.title}
          {entry.availability === "unavailable" ? <span className="pf-reports-tag is-muted">Not available</span> : null}
          {entry.availability === "restricted" ? (
            <span className="pf-reports-tag is-muted">
              <Lock className="h-3 w-3" aria-hidden /> No access
            </span>
          ) : null}
        </p>
        <p className="pf-reports-entry-summary">{entry.note && entry.availability !== "available" ? entry.note : entry.summary}</p>
      </div>
      <dl className="pf-reports-entry-meta">
        <div>
          <dt>Basis</dt>
          <dd>{entry.basis}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{entry.source}</dd>
        </div>
      </dl>
      <span className="pf-reports-entry-go" aria-hidden>
        {entry.href ? <ChevronRight className="h-4 w-4" /> : null}
      </span>
    </>
  );
  return entry.href ? (
    <li>
      <Link href={entry.href} className="pf-reports-entry is-link">
        {body}
      </Link>
    </li>
  ) : (
    <li>
      <div className="pf-reports-entry is-disabled" aria-disabled="true">
        {body}
      </div>
    </li>
  );
}

export function PlatformFinanceReportsLanding() {
  const [entries, setEntries] = useState<FinanceReportCatalogueEntry[] | null>(null);
  const [companyCount, setCompanyCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    PlatformFinanceReportsService.getCatalogue()
      .then((data) => {
        if (cancelled) return;
        setEntries(data.entries);
        setCompanyCount(data.companies.length);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Unable to load reports.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pf-reports">
      <header className="pf-reports-header">
        <p className="pf-ov-eyebrow">Platform Finance</p>
        <h1 className="pf-reports-title">Reports</h1>
        <p className="pf-reports-desc">
          Statements and reports you can produce for a period and hand on. Each one states its source and date basis:
          financial statements come only from posted accounting; management reports come from operational records.
        </p>
      </header>

      {error ? (
        <div className="pf-vb-alert is-danger" role="alert">
          {error}
        </div>
      ) : null}
      {!entries && !error ? <p className="pf-state-message">Loading reports…</p> : null}
      {companyCount === 0 ? (
        <div className="pf-vb-alert" role="status">
          No finance company is assigned to you, so no report can be run. Company access is granted by a Finance
          administrator.
        </div>
      ) : null}

      {entries
        ? SECTIONS.map((section) => {
            const list = entries.filter((e) => e.family === section.family);
            if (!list.length) return null;
            return (
              <section key={section.family} className="pf-reports-section" aria-labelledby={`pf-reports-${section.family}`}>
                <div className="pf-reports-section-head">
                  <h2 id={`pf-reports-${section.family}`}>{section.title}</h2>
                  <p>{section.lead}</p>
                </div>
                <ul className="pf-reports-list">
                  {list.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              </section>
            );
          })
        : null}
    </div>
  );
}
