import type { OrganisationIntelligence } from "@/lib/intelligence";
import { IntelligenceAttentionZone } from "./briefing/IntelligenceAttentionZone";
import { IntelligenceFooterZone } from "./briefing/IntelligenceFooterZone";
import { IntelligenceMovementZone } from "./briefing/IntelligenceMovementZone";
import { IntelligenceObservationZone } from "./briefing/IntelligenceObservationZone";
import { IntelligenceOpening } from "./briefing/IntelligenceOpening";

function isUrgentPriority(
  severity: OrganisationIntelligence["priorities"][number]["severity"]
) {
  return severity === "critical" || severity === "high";
}

export function IntelligenceBriefingView({
  data,
}: {
  data: OrganisationIntelligence;
}) {
  const {
    status,
    priorities,
    patterns,
    changes,
    recommendationHealth,
    operationalContext,
    window,
  } = data;

  const urgentPriorities = priorities.filter((p) => isUrgentPriority(p.severity));
  const criticalPriorities = urgentPriorities.filter(
    (p) => p.severity === "critical"
  );
  const highPriorities = urgentPriorities.filter((p) => p.severity === "high");
  const attentionPriorities = priorities.filter(
    (p) => !isUrgentPriority(p.severity)
  );
  const noticingPatterns = patterns.filter(
    (p) => p.category !== "recommendation_response"
  );

  const showProcessing = status.state === "processing";
  const showPartial = status.state === "partial";
  const hasOperationalActivity =
    operationalContext.recentIncidentCount30d > 0 ||
    recommendationHealth.totalDecisions > 0;

  return (
    <div className="sc-intel-briefing-wide pb-12">
      <IntelligenceOpening
        urgentCount={urgentPriorities.length}
        windowDays={window.primaryDays}
        processing={showProcessing}
        hasOperationalActivity={hasOperationalActivity}
        partial={showPartial}
      />

      {!showProcessing ? (
        <>
          <IntelligenceAttentionZone
            critical={criticalPriorities}
            high={highPriorities}
          />

          {urgentPriorities.length === 0 && hasOperationalActivity ? (
            <section className="sc-intel-zone">
              <p className="sc-intel-zone-label">Needs attention</p>
              <p className="sc-intel-finding-summary mt-4">
                Nothing requires action right now.
              </p>
            </section>
          ) : null}
        </>
      ) : null}

      <IntelligenceMovementZone changes={changes} processing={showProcessing} />

      {!showProcessing ? (
        <IntelligenceObservationZone
          attention={attentionPriorities}
          observations={noticingPatterns}
        />
      ) : null}

      <IntelligenceFooterZone
        health={recommendationHealth}
        context={operationalContext}
        windowDays={window.primaryDays}
      />
    </div>
  );
}
