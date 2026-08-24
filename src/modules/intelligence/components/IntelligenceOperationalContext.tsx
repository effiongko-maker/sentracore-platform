import { BriefingSection } from "@/components/experience";
import type { OrganisationOperationalContext } from "@/lib/intelligence";

export function IntelligenceOperationalContext({
  context,
  windowDays,
}: {
  context: OrganisationOperationalContext;
  windowDays: number;
}) {
  if (context.recentIncidentCount30d === 0) {
    return null;
  }

  const metrics = [
    {
      value: context.recentIncidentCount30d,
      label: "Incidents reported",
    },
    {
      value: context.highOrCriticalRiskCount,
      label: "Higher-risk incidents",
    },
    {
      value: context.facilitiesWithRecentActivity,
      label: "Locations with activity",
    },
  ];

  return (
    <BriefingSection
      emphasis="context"
      title="The bigger picture"
      description={`Supporting numbers for the last ${windowDays} days.`}
    >
      <dl className="grid max-w-md grid-cols-3 gap-x-5">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dd className="sc-text-stat">{metric.value}</dd>
            <dt className="sc-text-stat-label mt-0.5">{metric.label}</dt>
          </div>
        ))}
      </dl>
    </BriefingSection>
  );
}
