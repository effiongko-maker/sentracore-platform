import type { IntelligenceChange } from "@/lib/intelligence";

const VISIBLE_CAP = 5;

function MovementIcon({ change }: { change: IntelligenceChange }) {
  if (change.direction === "decreasing") {
    return <span className="sc-intel-movement-icon sc-intel-movement-icon-down">↓</span>;
  }
  if (change.direction === "emerging") {
    return <span className="sc-intel-movement-icon sc-intel-movement-icon-emerge">●</span>;
  }
  return <span className="sc-intel-movement-icon sc-intel-movement-icon-up">↑</span>;
}

function directionLabel(direction: IntelligenceChange["direction"]): string {
  switch (direction) {
    case "increasing":
      return "Increasing";
    case "emerging":
      return "Emerging";
    case "decreasing":
      return "Reduced";
    default:
      return "Stable";
  }
}

function directionClass(direction: IntelligenceChange["direction"]): string {
  switch (direction) {
    case "increasing":
      return "sc-intel-movement-direction sc-intel-movement-direction-up";
    case "emerging":
      return "sc-intel-movement-direction sc-intel-movement-direction-emerge";
    default:
      return "sc-intel-movement-direction";
  }
}

export function IntelligenceMovementZone({
  changes,
  processing,
}: {
  changes: IntelligenceChange[];
  processing: boolean;
}) {
  if (processing) {
    return (
      <section
        className="sc-intel-movement-zone"
        aria-labelledby="intel-movement-heading"
      >
        <p id="intel-movement-heading" className="sc-intel-zone-label">
          What&apos;s changed
        </p>
        <p className="sc-intel-finding-summary mt-4">
          Movement analysis is still being prepared.
        </p>
      </section>
    );
  }

  const visible = changes.slice(0, VISIBLE_CAP);
  const hidden = Math.max(0, changes.length - VISIBLE_CAP);

  return (
    <section
      className="sc-intel-movement-zone"
      aria-labelledby="intel-movement-heading"
    >
      <p id="intel-movement-heading" className="sc-intel-zone-label">
        What&apos;s changed
      </p>
      <p className="sc-intel-observation-summary mt-2 max-w-lg">
        Movement across the operation — compared with the previous week.
      </p>

      {visible.length === 0 ? (
        <p className="sc-intel-finding-summary mt-6">
          No meaningful movement detected in this period.
        </p>
      ) : (
        <ul className="sc-intel-movement-list">
          {visible.map((change) => (
            <li key={change.id} className="sc-intel-movement-item">
              <div className="sc-intel-movement-vector">
                <MovementIcon change={change} />
                <span className={directionClass(change.direction)}>
                  {directionLabel(change.direction)}
                </span>
                <span className="sc-intel-movement-counts">
                  <span className="sc-intel-count-recent">{change.recentCount}</span>
                  <span aria-hidden>←</span>
                  <span>{change.previousCount}</span>
                </span>
              </div>
              <div>
                <h3 className="sc-intel-finding-title">{change.title}</h3>
                <p className="sc-intel-finding-summary">{change.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {hidden > 0 ? (
        <p className="sc-intel-observation-summary mt-4">
          {hidden} additional {hidden === 1 ? "change" : "changes"} detected.
        </p>
      ) : null}
    </section>
  );
}
