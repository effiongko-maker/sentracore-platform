import { BriefingSection } from "@/components/experience";
import type { OrganisationOperationalContext } from "@/lib/intelligence";

export function IntelligenceOperationalContext({
  context,
  windowDays,
}: {
  context: OrganisationOperationalContext;
  windowDays: number;
}) {
  const hasActivity =
    context.recentWorkCount30d > 0 || context.recentIncidentCount30d > 0;

  if (!hasActivity) {
    return null;
  }

  const metrics = [
    {
      value: context.recentWorkCount30d,
      label: "Work logged",
    },
    {
      value: context.highOrCriticalRiskCount,
      label: "Elevated-risk activity",
    },
    {
      value: context.facilitiesWithRecentActivity,
      label: "Locations with activity",
    },
  ];

  if (context.recentIncidentCount30d > 0) {
    metrics.push({
      value: context.recentIncidentCount30d,
      label: "Legacy incidents (historical)",
    });
  }

  return (
    <BriefingSection
      emphasis="context"
      title="The bigger picture"
      description={`Supporting numbers for the last ${windowDays} days.`}
    >
      <dl className="grid max-w-2xl grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
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
