"use client";

import { cn } from "@/lib/utils";
import { REPORT_WIZARD_STEPS } from "../constants";
import type { ReportWizardStep } from "../types";

export function ReportWorkflow({
  step,
  onStepClick,
}: {
  step: ReportWizardStep;
  onStepClick: (step: ReportWizardStep) => void;
}) {
  const currentIndex = REPORT_WIZARD_STEPS.findIndex((s) => s.id === step);

  return (
    <ol className="rp-workflow" aria-label="Report generation steps">
      {REPORT_WIZARD_STEPS.map((item, index) => {
        const active = item.id === step;
        const complete = index < currentIndex;
        const reachable = index <= currentIndex;

        return (
          <li
            key={item.id}
            className={cn(
              "rp-workflow-item",
              active && "rp-workflow-item-active",
              complete && "rp-workflow-item-complete"
            )}
          >
            {index > 0 ? (
              <span className="rp-workflow-connector" aria-hidden />
            ) : null}
            <button
              type="button"
              className="rp-workflow-btn"
              onClick={() => {
                if (reachable) onStepClick(item.id);
              }}
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
            >
              <span className="rp-workflow-num">
                {String(item.number).padStart(2, "0")}
              </span>
              <span className="rp-workflow-label">{item.label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
