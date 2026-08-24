"use client";

import { REPORT_TYPES } from "../constants";
import type { ReportTypeId } from "../types";
import { ReportTemplateCard } from "./ReportTemplateCard";

export function ReportTemplateGrid({
  selected,
  onSelect,
}: {
  selected: ReportTypeId | null;
  onSelect: (id: ReportTypeId) => void;
}) {
  return (
    <div className="rp-type-section">
      <div className="rp-type-header">
        <div>
          <h2 className="rp-step-heading">What are you preparing?</h2>
          <p className="rp-step-lede">
            Choose a starting point. You can refine the scope and content in the
            next steps.
          </p>
        </div>
        <p className="rp-type-cue">
          {REPORT_TYPES.length} report templates available
        </p>
      </div>

      <div className="rp-type-grid">
        {REPORT_TYPES.map((item) => (
          <ReportTemplateCard
            key={item.id}
            item={item}
            selected={selected === item.id}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
