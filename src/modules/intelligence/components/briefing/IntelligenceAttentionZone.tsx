import type { IntelligencePriority } from "@/lib/intelligence";
import {
  formatEvidenceFigure,
  priorityEvidenceValue,
} from "../../utils/evidenceDisplay";

function AttentionItem({
  priority,
  index,
}: {
  priority: IntelligencePriority;
  index: number;
}) {
  const isCritical = priority.severity === "critical";
  const isHigh = priority.severity === "high";
  const evidence = priorityEvidenceValue(priority);
  const displayIndex = (index + 1).toString().padStart(2, "0");

  return (
    <article
      className={`sc-intel-attention-item${
        isCritical ? " sc-intel-attention-item-critical" : ""
      }`}
    >
      <div>
        {evidence !== null ? (
          <p
            className={`sc-intel-evidence${
              isCritical
                ? " sc-intel-evidence-critical"
                : isHigh
                  ? " sc-intel-evidence-high"
                  : ""
            }`}
            aria-hidden
          >
            {formatEvidenceFigure(evidence)}
          </p>
        ) : (
          <p className="sc-intel-evidence-index" aria-hidden>
            {displayIndex}
          </p>
        )}
        {evidence !== null ? (
          <p className="sc-intel-evidence-index">{displayIndex}</p>
        ) : null}
      </div>

      <div>
        {isCritical ? (
          <span className="sc-intel-severity-mark sc-intel-severity-mark-critical">
            Critical
          </span>
        ) : isHigh ? (
          <span className="sc-intel-severity-mark sc-intel-severity-mark-high">
            High priority
          </span>
        ) : null}
        <h2 className="sc-intel-finding-title">{priority.title}</h2>
        <p className="sc-intel-finding-summary">{priority.summary}</p>
      </div>
    </article>
  );
}

export function IntelligenceAttentionZone({
  critical,
  high,
}: {
  critical: IntelligencePriority[];
  high: IntelligencePriority[];
}) {
  const items = [...critical, ...high];
  if (items.length === 0) return null;

  const hasCritical = critical.length > 0;

  return (
    <section className="sc-intel-zone" aria-labelledby="intel-attention-heading">
      <p
        id="intel-attention-heading"
        className={`sc-intel-zone-label${
          hasCritical ? " sc-intel-zone-label-critical" : ""
        }`}
      >
        {hasCritical ? "Critical attention" : "Needs attention"}
      </p>

      <div className="sc-intel-attention-stack">
        {items.map((priority, index) => (
          <AttentionItem key={priority.id} priority={priority} index={index} />
        ))}
      </div>
    </section>
  );
}
