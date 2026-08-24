import type { BriefingLayer } from "../view-model/buildBriefingViewModel";

const LAYER_LABEL: Record<BriefingLayer, string> = {
  attention: "Now",
  change: "What's changed",
  patterns: "Patterns",
};

export function BriefingLayerRail({
  active,
  counts,
  windowDays,
  onSelect,
}: {
  active: BriefingLayer;
  counts: Record<BriefingLayer, number>;
  windowDays: number;
  onSelect: (layer: BriefingLayer) => void;
}) {
  const layers: BriefingLayer[] = ["attention", "change", "patterns"];

  return (
    <nav className="ix-rail" aria-label="Intelligence views">
      <div className="ix-rail-layers" role="tablist" aria-orientation="vertical">
        {layers.map((layer, index) => (
          <button
            key={layer}
            type="button"
            role="tab"
            aria-selected={active === layer}
            aria-controls={`ix-layer-${layer}`}
            id={`ix-tab-${layer}`}
            className={`ix-rail-layer${active === layer ? " ix-rail-layer-active" : ""}`}
            onClick={() => onSelect(layer)}
            title={`${index + 1} — ${LAYER_LABEL[layer]}`}
          >
            <span className="ix-rail-layer-name">{LAYER_LABEL[layer]}</span>
            {counts[layer] > 0 ? (
              <span className="ix-rail-layer-count">{counts[layer]}</span>
            ) : null}
          </button>
        ))}
      </div>
      <p className="ix-rail-meta">{windowDays}-day view</p>
    </nav>
  );
}
