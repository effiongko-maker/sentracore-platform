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
      <div className="ix-experience">
        <div className="ix-experience-main">
          <header className="ix-header">
            <div className="ix-header-copy">
              <p className="ix-header-mark">SentraCore Intelligence</p>
              <h1 className="ix-header-headline">Not available right now</h1>
              <p className="ix-header-support">
                SentraCore Intelligence is preparing organisational analysis for
                this context. Enter Facility Management to continue working, or
                try again shortly.
              </p>
            </div>
          </header>
        </div>
      </div>
    );
  }

  return <IntelligenceExperience data={data} />;
}
