import { BriefingSection } from "@/components/experience";
import type { OrganisationRecommendationHealth } from "@/lib/intelligence";

export function IntelligenceRecommendationHealth({
  health,
}: {
  health: OrganisationRecommendationHealth;
}) {
  return (
    <BriefingSection
      emphasis="supporting"
      title="How the organisation responds"
      description="How guidance from SentraCore is being handled."
    >
      {health.totalDecisions === 0 ? (
        <p className="sc-text-supporting">
          No recommendation responses have been recorded yet.
        </p>
      ) : (
        <dl className="grid max-w-md grid-cols-3 gap-x-5 gap-y-1">
          <div>
            <dt className="sc-text-stat-label">Accepted</dt>
            <dd className="sc-text-stat mt-0.5">{health.accepted}</dd>
          </div>
          <div>
            <dt className="sc-text-stat-label">Deferred</dt>
            <dd className="sc-text-stat mt-0.5">{health.deferred}</dd>
          </div>
          <div>
            <dt className="sc-text-stat-label">Dismissed</dt>
            <dd className="sc-text-stat mt-0.5">{health.dismissed}</dd>
          </div>
        </dl>
      )}

      {health.responsePatterns.length > 0 ? (
        <ul className="space-y-1 pt-1">
          {health.responsePatterns.map((pattern) => (
            <li key={pattern.id} className="sc-text-supporting">
              {pattern.title}
            </li>
          ))}
        </ul>
      ) : null}
    </BriefingSection>
  );
}
