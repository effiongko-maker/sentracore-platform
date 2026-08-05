"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { BeaconSpinner } from "./BeaconSpinner";
import { REPORT_GENERATION_STEPS } from "./messages";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const STEP_INTERVAL_MS = 2200;
const SHOW_DELAY_MS = 120;

/**
 * Dedicated report-generation progress screen.
 * Steps through messages over time — no fake percentages.
 */
export function ReportGeneratingProgress({
  reportTitle,
}: {
  active?: boolean;
  reportTitle?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [ready, setReady] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setReady(true);
      return;
    }
    const id = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [reducedMotion]);

  useEffect(() => {
    if (!ready || reducedMotion) return;

    const id = window.setInterval(() => {
      setStepIndex((current) =>
        Math.min(current + 1, REPORT_GENERATION_STEPS.length - 1)
      );
    }, STEP_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [ready, reducedMotion]);

  const message =
    REPORT_GENERATION_STEPS[
      Math.min(stepIndex, REPORT_GENERATION_STEPS.length - 1)
    ];

  return (
    <div
      className="flex min-h-[480px] flex-col items-center justify-center rounded-sc border border-border/70 bg-[#f4f5f7] px-6 py-16 text-center animate-[content-fade-in_0.35s_ease-out] motion-reduce:animate-none"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-atomic="true"
    >
      <BeaconSpinner size="lg" label={message} />

      <h2 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
        Preparing report...
      </h2>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        Generating document preview...
      </p>
      {reportTitle ? (
        <p className="mt-1 text-xs text-muted">{reportTitle}</p>
      ) : null}

      <p
        className={cn(
          "mt-5 text-sm font-medium text-slate-700 transition-opacity",
          ready ? "opacity-100" : "opacity-0"
        )}
      >
        {message}
      </p>

      <ol className="mt-8 w-full max-w-sm space-y-1.5 text-left">
        {REPORT_GENERATION_STEPS.map((step, index) => {
          const done = index < stepIndex;
          const current = index === stepIndex;
          return (
            <li
              key={step}
              className={cn(
                "flex items-center gap-3 rounded-sc-sm px-3 py-2 text-sm transition-colors",
                current
                  ? "bg-white text-foreground shadow-sm ring-1 ring-border/80"
                  : done
                    ? "text-slate-600"
                    : "text-muted"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  current
                    ? "bg-accent text-white"
                    : done
                      ? "bg-primary/10 text-primary"
                      : "bg-slate-200/80 text-muted"
                )}
                aria-hidden
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
