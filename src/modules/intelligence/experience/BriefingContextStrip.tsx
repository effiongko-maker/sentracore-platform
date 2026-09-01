import type { BriefingViewModel } from "../view-model/buildBriefingViewModel";

export function BriefingContextStrip({ vm }: { vm: BriefingViewModel }) {
  const { recommendationHealth, operationalContext, windowDays } = vm;
  const showActivity =
    operationalContext.recentWorkCount30d > 0 ||
    operationalContext.recentIncidentCount30d > 0;
  const showResponse = recommendationHealth.totalDecisions > 0;

  if (!showActivity && !showResponse) return null;

  return (
    <footer className="ix-context-strip">
      {showResponse ? (
        <section>
          <h2 className="ix-context-block-title">
            How recommendations are being handled
          </h2>
          <div className="ix-context-stats">
            <div>
              <p className="ix-context-stat-value">
                {recommendationHealth.accepted}
              </p>
              <p className="ix-context-stat-label">Accepted</p>
            </div>
            <div>
              <p className="ix-context-stat-value">
                {recommendationHealth.deferred}
              </p>
              <p className="ix-context-stat-label">Deferred</p>
            </div>
            <div>
              <p className="ix-context-stat-value">
                {recommendationHealth.dismissed}
              </p>
              <p className="ix-context-stat-label">Dismissed</p>
            </div>
          </div>
        </section>
      ) : null}

      {showActivity ? (
        <section>
          <h2 className="ix-context-block-title">Recent activity</h2>
          <div className="ix-context-stats">
            <div>
              <p className="ix-context-stat-value">
                {operationalContext.recentWorkCount30d}
              </p>
              <p className="ix-context-stat-label">Work</p>
            </div>
            {operationalContext.recentIncidentCount30d > 0 ? (
            <div>
              <p className="ix-context-stat-value">
                {operationalContext.recentIncidentCount30d}
              </p>
              <p className="ix-context-stat-label">Legacy incidents</p>
            </div>
            ) : null}
            <div>
              <p className="ix-context-stat-value">
                {operationalContext.highOrCriticalRiskCount}
              </p>
              <p className="ix-context-stat-label">Higher risk</p>
            </div>
            <div>
              <p className="ix-context-stat-value">
                {operationalContext.facilitiesWithRecentActivity}
              </p>
              <p className="ix-context-stat-label">Active sites</p>
            </div>
          </div>
          <p className="ix-signal-summary mt-3">Last {windowDays} days</p>
        </section>
      ) : null}
    </footer>
  );
}
