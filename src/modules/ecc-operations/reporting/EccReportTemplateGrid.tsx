"use client";

import { ECC_REPORT_TYPES } from "./constants";
import type { EccReportTypeId } from "./types";
import { EccReportTemplateCard } from "./EccReportTemplateCard";

export function EccReportTemplateGrid({
  selected,
  onSelect,
}: {
  selected: EccReportTypeId | null;
  onSelect: (id: EccReportTypeId) => void;
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
          {ECC_REPORT_TYPES.length} report templates available
        </p>
      </div>

      <div className="rp-type-grid">
        {ECC_REPORT_TYPES.map((item) => (
          <EccReportTemplateCard
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
