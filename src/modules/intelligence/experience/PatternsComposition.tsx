import type { BriefingFinding } from "../view-model/buildBriefingViewModel";

export function PatternsComposition({
  findings,
  selectedId,
  onSelect,
}: {
  findings: BriefingFinding[];
  selectedId: string | null;
  onSelect: (finding: BriefingFinding) => void;
}) {
  return (
    <div className="ix-composition-patterns">
      <ul className="ix-signal-stream">
        {findings.map((finding) => (
          <li key={finding.id}>
            <button
              type="button"
              className={`ix-signal-item${
                selectedId === finding.id ? " ix-signal-item-selected" : ""
              }`}
              onClick={() => onSelect(finding)}
            >
              <p className="ix-signal-title">{finding.title}</p>
              <p className="ix-signal-summary">{finding.summary}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
