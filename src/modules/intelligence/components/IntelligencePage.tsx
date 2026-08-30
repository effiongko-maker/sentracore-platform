import type { OrganisationIntelligence } from "@/lib/intelligence";
import { IntelligenceExperience } from "../experience/IntelligenceExperience";

export function IntelligencePage({
  data,
}: {
  data: OrganisationIntelligence;
}) {
  const { status } = data;

  if (status.state === "unavailable" || !status.supported) {
    return (
      <div className="ix-ref-page" style={{ padding: "3rem 1.5rem" }}>
        <p className="ix-ref-mark">SentraCore Intelligence</p>
        <h1 className="ix-ref-headline ix-ref-headline-sm">
          Not available right now
        </h1>
        <p className="ix-ref-lead">
          SentraCore Intelligence is preparing organisational analysis for this
          context. Continue in Operations, or try again shortly.
        </p>
      </div>
    );
  }

  return <IntelligenceExperience data={data} />;
}
