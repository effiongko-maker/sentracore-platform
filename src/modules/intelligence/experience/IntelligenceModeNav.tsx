"use client";

import type { BriefingLayer } from "../view-model/buildBriefingViewModel";

export type IntelligenceMode = {
  id: BriefingLayer;
  label: string;
  intent: string;
  signal: string;
};

export function IntelligenceModeNav({
  modes,
  active,
  onSelect,
}: {
  modes: IntelligenceMode[];
  active: BriefingLayer;
  onSelect: (layer: BriefingLayer) => void;
}) {
  return (
    <nav className="ix-lenses" aria-label="Intelligence modes">
      <div className="ix-lenses-row">
        {modes.map((mode) => {
          const isActive = mode.id === active;
          return (
            <button
              key={mode.id}
              type="button"
              className={`ix-lens${isActive ? " ix-lens-active" : ""}`}
              onClick={() => onSelect(mode.id)}
              aria-current={isActive ? "true" : undefined}
            >
              <span className="ix-lens-label">{mode.label}</span>
              <span className="ix-lens-intent">{mode.intent}</span>
              <span className="ix-lens-signal">{mode.signal}</span>
              {isActive ? <span className="ix-lens-beam" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
