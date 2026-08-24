"use client";

import { useRouter } from "next/navigation";
import { BriefingCalmStage } from "../experience/BriefingCalmStage";
import { IntelligenceChrome } from "../experience/IntelligenceChrome";

export function IntelligenceLoadError() {
  const router = useRouter();

  return (
    <>
      <IntelligenceChrome />
      <div className="ix-stage" style={{ minHeight: "70vh" }}>
        <BriefingCalmStage
          headline="Briefing unavailable"
          copy="SentraCore couldn't load the latest intelligence for this workspace."
        />
        <button
          type="button"
          className="mt-6 text-sm font-medium text-[var(--ix-ink-soft)] underline underline-offset-4"
          onClick={() => router.refresh()}
        >
          Try again
        </button>
      </div>
    </>
  );
}
