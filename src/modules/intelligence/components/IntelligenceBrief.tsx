import { BriefingLead } from "@/components/experience";

export function IntelligenceBrief({
  urgentCount,
  windowDays,
  processing,
  hasOperationalActivity,
  hasObservations,
}: {
  urgentCount: number;
  windowDays: number;
  processing: boolean;
  hasOperationalActivity: boolean;
  hasObservations: boolean;
}) {
  if (processing) {
    return (
      <BriefingLead>
        SentraCore is still processing recent operational activity.
      </BriefingLead>
    );
  }

  if (!hasOperationalActivity && urgentCount === 0) {
    return (
      <BriefingLead>
        SentraCore needs more operational activity before it can identify
        meaningful patterns.
      </BriefingLead>
    );
  }

  if (urgentCount === 0) {
    return (
      <div className="space-y-1.5">
        <BriefingLead>Nothing urgent needs your attention right now.</BriefingLead>
        {hasObservations ? (
          <p className="sc-text-supporting">
            A few quieter observations are noted below.
          </p>
        ) : (
          <p className="sc-text-supporting">
            Based on activity from the last {windowDays} days.
          </p>
        )}
      </div>
    );
  }

  const findingLabel =
    urgentCount === 1
      ? "1 thing that needs your attention"
      : `${urgentCount} things that need your attention`;

  return (
    <div className="space-y-1.5">
      <BriefingLead>
        SentraCore has identified {findingLabel}.
      </BriefingLead>
      <p className="sc-text-supporting">
        Based on activity from the last {windowDays} days.
      </p>
    </div>
  );
}
