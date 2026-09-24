import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ExecutiveLens } from "../nav";
import { EXECUTIVE_OFFICE_BASE } from "../nav";

/**
 * Foundation route for an Executive Office lens. It states what the lens is for and, honestly, that its dedicated
 * capability is not built yet — no invented data. Where the lens's live signal already exists on the Overview, it
 * links there.
 */
export function ExecutiveLensPage({ lens }: { lens: ExecutiveLens }) {
  const Icon = lens.icon;
  return (
    <div className="scc scc--app eo-lens">
      <header className="os-module-header eo-header">
        <div className="min-w-0">
          <p className="eo-eyebrow">Executive Office</p>
          <h1 className="os-module-title">{lens.label}</h1>
          <p className="os-module-desc">{lens.purpose}</p>
        </div>
      </header>

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
