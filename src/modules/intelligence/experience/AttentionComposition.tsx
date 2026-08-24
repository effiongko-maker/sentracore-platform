import type { BriefingFinding } from "../view-model/buildBriefingViewModel";
import { FocalFinding } from "./FocalFinding";
import { OrbitStack } from "./OrbitStack";

export function AttentionComposition({
  focal,
  orbit,
  selectedId,
  onSelect,
}: {
  focal: BriefingFinding;
  orbit: BriefingFinding[];
  selectedId: string | null;
  onSelect: (finding: BriefingFinding) => void;
}) {
  return (
    <div className="ix-composition ix-composition-attention">
      <FocalFinding finding={focal} onExplore={() => onSelect(focal)} />
      {orbit.length > 0 ? (
        <OrbitStack
          findings={orbit}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : null}
    </div>
  );
}
