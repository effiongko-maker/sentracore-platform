"use client";

import { useRouter } from "next/navigation";
import { BriefingCalmStage } from "../experience/BriefingCalmStage";

export function IntelligenceLoadError() {
  const router = useRouter();

  return (
    <div className="ix-experience">
      <div className="ix-experience-main">
        <header className="ix-header">
          <div className="ix-header-copy">
            <p className="ix-header-mark">SentraCore Intelligence</p>
            <h1 className="ix-header-headline">Briefing unavailable</h1>
            <p className="ix-header-support">
              SentraCore couldn&apos;t load the latest intelligence for this
              workspace.
            </p>
          </div>
        </header>
        <div className="ix-stage">
          <BriefingCalmStage
            headline="Try again shortly"
            copy="The analysis service may be temporarily unavailable or still processing recent activity."
          />
          <button
            type="button"
            className="mt-6 text-sm font-medium text-[var(--ix-ink-soft)] underline underline-offset-4"
            onClick={() => router.refresh()}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
