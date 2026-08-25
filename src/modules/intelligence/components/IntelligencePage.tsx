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
      <div className="ix-stage" style={{ minHeight: "60vh", padding: "3rem 2rem" }}>
        <p className="ix-rail-mark">Intelligence</p>
        <h1 className="ix-statement-headline ix-statement-headline-calm mt-4">
          Not available right now
        </h1>
        <p className="ix-statement-support">
          SentraCore Intelligence is preparing organisational analysis for this
          context. Enter Operations to continue working, or try again shortly.
        </p>
      </div>
    );
  }

  return <IntelligenceExperience data={data} />;
}
