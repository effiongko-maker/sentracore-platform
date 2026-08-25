"use client";

import { X } from "lucide-react";
import type { BriefingFinding } from "../view-model/buildBriefingViewModel";
import { formatEvidenceFigure } from "../utils/evidenceDisplay";

const KIND_LABEL: Record<BriefingFinding["kind"], string> = {
  priority: "Priority",
  change: "Change",
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
            <p className="ix-detail-evidence-label">Related activities</p>
          </div>
        ) : null}

        {finding.basedOn ? (
          <div className="ix-detail-evidence-block">
            <p className="ix-detail-evidence-value ix-detail-evidence-value-text">
              {finding.basedOn}
            </p>
            <p className="ix-detail-evidence-label">Based on</p>
          </div>
        ) : null}

        {finding.confidence ? (
          <div className="ix-detail-evidence-block">
            <p className="ix-detail-evidence-value ix-detail-evidence-value-text">
              {finding.confidence}
            </p>
            <p className="ix-detail-evidence-label">Confidence</p>
          </div>
        ) : null}

        {finding.affectedArea ? (
          <div className="ix-detail-evidence-block">
            <p className="ix-detail-evidence-value ix-detail-evidence-value-text">
              {finding.affectedArea}
            </p>
            <p className="ix-detail-evidence-label">Affected area</p>
          </div>
        ) : null}
        {finding.investigation?.whatItSaw ? (
          <div className="ix-detail-evidence-block">
            <p className="ix-detail-evidence-value ix-detail-evidence-value-text">
              {finding.investigation.whatItSaw}
            </p>
            <p className="ix-detail-evidence-label">What SentraCore observed</p>
          </div>
        ) : null}
        {finding.investigation?.storyStatus ? (
          <div className="ix-detail-evidence-block">
            <p className="ix-detail-evidence-value ix-detail-evidence-value-text">
              {finding.investigation.storyStatus}
            </p>
            <p className="ix-detail-evidence-label">Current picture</p>
          </div>
        ) : null}
        {finding.investigation && finding.investigation.sequence.length > 0 ? (
          <div className="ix-detail-evidence-block">
            <ol className="ix-detail-sequence">
              {finding.investigation.sequence.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="ix-detail-evidence-label">How it developed</p>
          </div>
        ) : null}
        {finding.investigation?.relatedFindings &&
        finding.investigation.relatedFindings.length > 0 ? (
          <div className="ix-detail-evidence-block">
            <ul className="ix-detail-evidence-facts">
              {finding.investigation.relatedFindings.map((item) => (
                <li key={item}>
                  <span>Related finding</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="ix-detail-evidence-label">Related findings</p>
          </div>
        ) : null}
        {finding.investigation?.whyItMatters ? (
          <div className="ix-detail-evidence-block">
            <p className="ix-detail-evidence-value ix-detail-evidence-value-text">
              {finding.investigation.whyItMatters}
            </p>
            <p className="ix-detail-evidence-label">Why this matters</p>
          </div>
        ) : null}
        {finding.investigation?.whatToInvestigate &&
        finding.investigation.whatToInvestigate.length > 0 ? (
          <div className="ix-detail-evidence-block">
            <ol className="ix-detail-sequence">
              {finding.investigation.whatToInvestigate.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <p className="ix-detail-evidence-label">What to look at next</p>
          </div>
        ) : null}
        {finding.investigation &&
        finding.investigation.evidenceItems.length > 0 ? (
          <div className="ix-detail-evidence-block">
            <ul className="ix-detail-evidence-facts">
              {finding.investigation.evidenceItems.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <span>{item.value}</span>
                </li>
              ))}
            </ul>
            <p className="ix-detail-evidence-label">Evidence</p>
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
