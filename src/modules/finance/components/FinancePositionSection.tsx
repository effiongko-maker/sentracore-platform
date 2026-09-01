import type { FinancePositionMetric } from "../types";

function HeroMetric({
  metric,
  primary = false,
}: {
  metric: FinancePositionMetric;
  primary?: boolean;
}) {
  return (
    <article className={primary ? "fin-hero-primary" : "fin-hero-secondary"}>
      <p className="fin-metric-kicker">{metric.label}</p>
      <p className="fin-metric-value">{metric.value ?? "—"}</p>
      {metric.detail ? <p className="fin-metric-detail">{metric.detail}</p> : null}
    </article>
  );
}

function MetricSkeleton({ primary = false }: { primary?: boolean }) {
  return (
    <div
      className={
        primary
          ? "fin-hero-primary h-[8.5rem] animate-pulse bg-muted/20"
          : "fin-hero-secondary h-[8.5rem] animate-pulse bg-muted/15"
      }
    />
  );
}

export function FinancePositionSection({
  metrics,
  loading,
}: {
  metrics: FinancePositionMetric[];
  loading: boolean;
}) {
  const ordered = [
    metrics.find((m) => m.id === "awaiting_client_decision"),
    metrics.find((m) => m.id === "client_auth_approved"),
    metrics.find((m) => m.id === "client_auth_draft"),
  ].filter((m): m is FinancePositionMetric => Boolean(m));

  return (
    <section>
      <h2 className="fin-section-title">Client authorisation position</h2>
      <p className="fin-section-lede">
        Client authorisations show permission to proceed with work. They are not
        operational cost, reimbursement, or payment.
      </p>

      <div className="fin-hero">
        {loading ? (
          <>
            <MetricSkeleton primary />
            <MetricSkeleton primary />
            <MetricSkeleton />
          </>
        ) : (
          ordered.map((metric, index) => (
            <HeroMetric
              key={metric.id}
              metric={metric}
              primary={index < 2}
            />
          ))
        )}
      </div>
    </section>
  );
}
