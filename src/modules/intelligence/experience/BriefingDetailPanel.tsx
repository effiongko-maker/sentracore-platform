"use client";

import { X } from "lucide-react";
import type { BriefingFinding } from "../view-model/buildBriefingViewModel";
import { formatEvidenceFigure } from "../utils/evidenceDisplay";

const KIND_LABEL: Record<BriefingFinding["kind"], string> = {
  priority: "Priority",
  change: "Movement",
  pattern: "Pattern",
  attention: "Observation",
};

export function BriefingDetailPanel({
  finding,
  onClose,
}: {
  finding: BriefingFinding;
  onClose: () => void;
}) {
  return (
    <aside className="ix-detail-panel" aria-label="Finding detail">
      <div className="ix-detail-panel-inner">
        <button
          type="button"
          className="ix-detail-close"
          onClick={onClose}
          aria-label="Close detail"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="ix-detail-kind">{KIND_LABEL[finding.kind]}</p>
        <h2 className="ix-detail-title">{finding.title}</h2>
        <p className="ix-detail-summary">{finding.summary}</p>

        {finding.evidence !== null ? (
          <div className="ix-detail-evidence-block">
            <p className="ix-detail-evidence-value">
              {formatEvidenceFigure(finding.evidence)}
            </p>
            <p className="ix-detail-evidence-label">Supporting count</p>
          </div>
        ) : null}

        {finding.change ? (
          <div className="ix-detail-evidence-block">
            <p className="ix-detail-evidence-value">
              {finding.change.recent}
              <span className="text-lg text-[var(--ix-ink-faint)]"> ← </span>
              {finding.change.previous}
            </p>
            <p className="ix-detail-evidence-label">
              Recent vs previous period
            </p>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
