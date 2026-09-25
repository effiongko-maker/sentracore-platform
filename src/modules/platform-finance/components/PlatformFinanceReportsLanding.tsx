"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, BookOpen, ChartNoAxesCombined, FileChartColumn, FileText, Lock, Search, X, Info, Layers, ArrowLeftRight, CreditCard, Clock, Database, CalendarDays, History } from "lucide-react";
import styles from "./PlatformFinanceReportsLanding.module.css";
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

const FAMILY_ICONS = { statement: FileChartColumn, accounting: BookOpen, operational: ChartNoAxesCombined, historical: History };

const REPORT_ICONS = {
  "profit-and-loss": FileText, "balance-sheet": Layers, "trial-balance": ChartNoAxesCombined,
  "cash-flow": FileText, "receivables-ageing": FileText, "payables-outstanding": FileText,
  "vendor-bill-pipeline": FileText, "financial-request-pipeline": FileText,
  "general-ledger": BookOpen, journal: FileText, "accounting-completeness": Clock,
  collections: ArrowLeftRight, "supplier-payments": CreditCard, "historical-commercial-facts": Database,
};

function ReportCard({ entry }: { entry: FinanceReportCatalogueEntry }) {
  const Icon = REPORT_ICONS[entry.id as keyof typeof REPORT_ICONS] ?? FAMILY_ICONS[entry.family];
  const body = (
    <>
      <span className={styles.icon}><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span>
      <div className={styles.cardBody}>
        <h3>{entry.title}</h3>
        <p>{entry.availability === "unavailable" && entry.note ? entry.note : entry.summary}</p>
        {entry.availability === "restricted" && entry.note ? <p className={styles.accessNote}>{entry.note}</p> : null}
      </div>
      {entry.availability === "unavailable" ? (
        <span className={styles.tag}>Not available</span>
      ) : (
        <dl className={styles.meta}>
          <div><dt><Database size={12} aria-hidden="true" />Source</dt><dd>{entry.source}</dd></div>
          <div><dt><CalendarDays size={12} aria-hidden="true" />Basis</dt><dd>{entry.basis}</dd></div>
        </dl>
      )}
      {entry.availability === "restricted" ? <span className={styles.tag}><Lock size={12} aria-hidden="true" />No access</span> : null}
      {entry.href ? <ChevronRight size={15} className={styles.arrow} aria-hidden="true" /> : null}
    </>
  );
  return (
    <li className={styles.item} data-report={entry.id}>
      {entry.href ? (
        <Link href={entry.href} className={styles.card}>{body}</Link>
      ) : (
        <div className={`${styles.card} ${styles.disabled}`} aria-disabled="true">{body}</div>
      )}
    </li>
  );
}

export function PlatformFinanceReportsLanding() {
  const [family, setFamily] = useState<FinanceReportFamily | "all">("all");
  const [query, setQuery] = useState("");
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

  const search = query.trim().toLocaleLowerCase();
  const filtered = entries?.filter((entry) =>
    (family === "all" || entry.family === family) &&
    (!search || `${entry.title} ${entry.summary} ${entry.source} ${entry.basis} ${entry.note ?? ""}`.toLocaleLowerCase().includes(search))
  );

  return (
    <div className={`pf-reports ${styles.catalogue}`}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className="pf-ov-eyebrow">Platform Finance</p>
          <h1 className={styles.title}>Reports</h1>
          <p className={styles.intro}>
            Statements and reports you can produce for a period and hand on. Each one states its source and date basis:
            financial statements come only from posted accounting; management reports come from operational records.
          </p>
        </div>
        <svg className={styles.documents} viewBox="0 0 210 160" fill="none" aria-hidden="true">
          <g transform="translate(47 21) skewX(-10)">
            <rect x="18" y="0" width="116" height="154" rx="6" fill="#fafbfc" stroke="#d9dde3" />
            <path d="M32 17h86M32 24h68M32 43h86M32 50h86M32 57h58" stroke="#e0e3e8" strokeWidth="4" />
          </g>
          <g transform="translate(24 5) skewX(-10)">
            <rect width="116" height="154" rx="6" fill="white" stroke="#d9dde3" />
            <path d="M16 15h84" stroke="#c7cdd5" strokeWidth="6" />
            <path d="M16 25h54M63 42h37M63 49h35M63 56h29" stroke="#eceef1" strokeWidth="3" />
            <circle cx="36" cy="53" r="17" fill="#e3e6eb" />
            <path d="M36 53V36a17 17 0 0 1 14 27Z" fill="#bfc6d0" />
            <path d="M36 53L23 64a17 17 0 0 0 27-1Z" fill="#929cab" />
            <path d="M20 118V99M43 118V88M66 118V91M89 118V70" stroke="#d4d9e1" strokeWidth="12" />
            <path d="M15 130h86M15 137h68" stroke="#e9ecf0" strokeWidth="3" />
          </g>
        </svg>
        <aside className={styles.headerNote}>
          <Info size={18} aria-hidden="true" />
          <div><strong>Choose a report</strong><p>Each report shows its source, date basis and what it includes.</p></div>
        </aside>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.categories} role="group" aria-label="Report categories">
          {[{ family: "all" as const, title: "All" }, ...SECTIONS].map((section) => (
            <button key={section.family} type="button" aria-pressed={family === section.family}
              onClick={() => setFamily(section.family)}>{section.title}</button>
          ))}
        </div>
        <div className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Search reports" placeholder="Search reports" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query ? <button type="button" aria-label="Clear report search" onClick={() => setQuery("")}><X size={14} aria-hidden="true" /></button> : null}
        </div>
      </div>

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

      {filtered ? <p className={styles.results} role="status">{filtered.length} report{filtered.length === 1 ? "" : "s"}{family !== "all" || search ? " matching your selection" : " in the catalogue"}</p> : null}
      {filtered?.length === 0 ? (
        <div className={styles.empty}>
          <h2>No matching reports</h2>
          <p>Try a different report name or category.</p>
          <button type="button" onClick={() => { setFamily("all"); setQuery(""); }}>Clear filters</button>
        </div>
      ) : null}
      {filtered
        ? SECTIONS.map((section) => {
            const list = filtered.filter((e) => e.family === section.family);
            const SectionIcon = FAMILY_ICONS[section.family];
            if (!list.length) return null;
            return (
              <section key={section.family} className={`${styles.section} ${styles[section.family]}`} aria-labelledby={`pf-reports-${section.family}`}>
                <div className={styles.sectionHead}>
                  <span className={styles.sectionIcon}><SectionIcon size={25} strokeWidth={1.6} aria-hidden="true" /></span>
                  <div className={styles.sectionCopy}>
                    <h2 id={`pf-reports-${section.family}`}>{section.title}</h2>
                    <p>{section.lead}</p>
                  </div>
                  <span className={styles.sectionCount}>{list.length} report{list.length === 1 ? "" : "s"}</span>
                  {family === "all" ? <button type="button" className={styles.viewAll} aria-label={`View all ${section.title.toLowerCase()}`} onClick={() => setFamily(section.family)}>View all <ArrowRight size={14} aria-hidden="true" /></button> : null}
                </div>
                <ul className={styles.grid}>
                  {list.map((entry) => (
                    <ReportCard key={entry.id} entry={entry} />
                  ))}
                </ul>
              </section>
            );
          })
        : null}
    </div>
  );
}
