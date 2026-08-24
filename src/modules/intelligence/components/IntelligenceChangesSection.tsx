import { BriefingSection } from "@/components/experience";
import type {
  IntelligenceChange,
  IntelligenceChangeComparisonWindow,
} from "@/lib/intelligence";
import { IntelligenceChangeItem } from "./IntelligenceChangeItem";

const VISIBLE_CHANGE_CAP = 4;

export function IntelligenceChangesSection({
  changes,
  comparisonWindow,
  processing,
}: {
  changes: IntelligenceChange[];
  comparisonWindow: IntelligenceChangeComparisonWindow;
  processing: boolean;
}) {
  if (processing) {
    return (
      <BriefingSection
        emphasis="change"
        title="What's changed"
        description="What is moving in the operation."
      >
        <p className="sc-text-supporting">
          Change analysis is still being prepared.
        </p>
      </BriefingSection>
    );
  }

  const visibleChanges = changes.slice(0, VISIBLE_CHANGE_CAP);
  const hiddenCount = Math.max(0, changes.length - VISIBLE_CHANGE_CAP);
  const showComparisonHint =
    comparisonWindow.recentAnalysisComplete || changes.length > 0;

  return (
    <BriefingSection
      emphasis="change"
      title="What's changed"
      description={
        showComparisonHint
          ? "What is moving in the operation — compared with the previous week."
          : "What is moving in the operation."
      }
    >
      {changes.length === 0 ? (
        <p className="sc-text-supporting">
          No meaningful changes have been detected recently.
        </p>
      ) : (
        <>
          <ul className="sc-briefing-divider-list">
            {visibleChanges.map((change) => (
              <IntelligenceChangeItem key={change.id} change={change} />
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <p className="sc-text-meta">
              {hiddenCount} additional{" "}
              {hiddenCount === 1 ? "change was" : "changes were"} detected.
            </p>
          ) : null}
        </>
      )}
    </BriefingSection>
  );
}
