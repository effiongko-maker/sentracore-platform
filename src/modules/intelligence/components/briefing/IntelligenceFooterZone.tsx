import type {
  OrganisationOperationalContext,
  OrganisationRecommendationHealth,
} from "@/lib/intelligence";

export function IntelligenceFooterZone({
  health,
  context,
  windowDays,
}: {
  health: OrganisationRecommendationHealth;
  context: OrganisationOperationalContext;
  windowDays: number;
}) {
  const showContext = context.recentIncidentCount30d > 0;

  if (health.totalDecisions === 0 && !showContext) {
    return null;
  }

  return (
    <footer className="sc-intel-footer-grid">
      <section aria-labelledby="intel-response-heading">
        <h2 id="intel-response-heading" className="sc-intel-footer-block-title">
          How the organisation responds
        </h2>
        {health.totalDecisions === 0 ? (
          <p className="sc-intel-observation-summary mt-3">
            No recommendation responses recorded yet.
          </p>
        ) : (
          <>
            <div className="sc-intel-response-bar">
              <div className="sc-intel-response-stat">
                <span className="sc-intel-response-stat-value">
                  {health.accepted}
                </span>
                <span className="sc-intel-response-stat-label">Accepted</span>
              </div>
              <div className="sc-intel-response-stat">
                <span className="sc-intel-response-stat-value">
                  {health.deferred}
                </span>
                <span className="sc-intel-response-stat-label">Deferred</span>
              </div>
              <div className="sc-intel-response-stat">
                <span className="sc-intel-response-stat-value">
                  {health.dismissed}
                </span>
                <span className="sc-intel-response-stat-label">Dismissed</span>
              </div>
            </div>
            {health.responsePatterns.length > 0 ? (
              <ul className="mt-4 space-y-1">
                {health.responsePatterns.map((pattern) => (
                  <li
                    key={pattern.id}
                    className="sc-intel-observation-summary"
                  >
                    {pattern.title}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </section>

      {showContext ? (
        <section aria-labelledby="intel-context-heading">
          <h2 id="intel-context-heading" className="sc-intel-footer-block-title">
            The bigger picture
          </h2>
          <p className="sc-intel-observation-summary mt-2">
            Last {windowDays} days
          </p>
          <dl className="sc-intel-context-metrics">
            <div>
              <dd className="sc-intel-response-stat-value">
                {context.recentWorkCount30d}
              </dd>
              <dt className="sc-intel-response-stat-label mt-1">
                Work
              </dt>
            </div>
            <div>
              <dd className="sc-intel-response-stat-value">
                {context.highOrCriticalRiskCount}
              </dd>
              <dt className="sc-intel-response-stat-label mt-1">
                Higher risk
              </dt>
            </div>
            <div>
              <dd className="sc-intel-response-stat-value">
                {context.facilitiesWithRecentActivity}
              </dd>
              <dt className="sc-intel-response-stat-label mt-1">
                Active locations
              </dt>
            </div>
          </dl>
        </section>
      ) : null}
    </footer>
  );
}
