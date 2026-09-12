import { BarChart3 } from "lucide-react";

export function FinanceIntelligencePreview() {
  return (
    <section className="fin-v13-intel">
      <div className="fin-v13-intel-head">
        <span className="fin-v13-intel-icon" aria-hidden>
          <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <h2 className="fin-v13-metric-label">Intelligence</h2>
      </div>
      <p className="fin-v13-intel-copy">
        More financial activity is required before operational patterns can be
        surfaced.
      </p>
    </section>
  );
}
