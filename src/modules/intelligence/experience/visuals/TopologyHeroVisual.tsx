"use client";

export function TopologyHeroVisual() {
  return (
    <div className="ix-ref-topology ix-ref-topology-hero" aria-hidden>
      <svg viewBox="0 0 420 220" className="ix-ref-topology-svg">
        <defs>
          <linearGradient id="ix-grid-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(59,130,246,0.15)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0.02)" />
          </linearGradient>
          <radialGradient id="ix-hotspot" cx="50%" cy="42%" r="50%">
            <stop offset="0%" stopColor="rgba(239,68,68,0.95)" />
            <stop offset="45%" stopColor="rgba(239,68,68,0.35)" />
            <stop offset="100%" stopColor="rgba(239,68,68,0)" />
          </radialGradient>
        </defs>
        <rect width="420" height="220" fill="url(#ix-grid-glow)" rx="12" />
        {Array.from({ length: 12 }).map((_, row) =>
          Array.from({ length: 18 }).map((__, col) => {
            const x = 24 + col * 21;
            const y = 24 + row * 15 + (col % 2) * 4;
            return (
              <circle
                key={`${row}-${col}`}
                cx={x}
                cy={y}
                r="1.2"
                fill="rgba(96,165,250,0.35)"
              />
            );
          })
        )}
        <path
          d="M40 170 C 120 120, 180 150, 250 95 S 360 60, 380 48"
          fill="none"
          stroke="rgba(96,165,250,0.25)"
          strokeWidth="1"
        />
        <circle cx="250" cy="95" r="34" fill="url(#ix-hotspot)" />
        <circle cx="250" cy="95" r="5" fill="#ef4444" />
        <path
          d="M250 95 V58"
          stroke="rgba(239,68,68,0.55)"
          strokeWidth="2"
          strokeDasharray="3 4"
        />
      </svg>
    </div>
  );
}

export function TopologyRadarVisual({
  label,
}: {
  label?: string;
}) {
  return (
    <div className="ix-ref-topology ix-ref-topology-radar" aria-hidden>
      <svg viewBox="0 0 200 200" className="ix-ref-topology-svg">
        <defs>
          <radialGradient id="ix-radar-hot" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(239,68,68,0.9)" />
            <stop offset="100%" stopColor="rgba(239,68,68,0)" />
          </radialGradient>
        </defs>
        {[88, 68, 48, 28].map((r) => (
          <circle
            key={r}
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="rgba(148,163,184,0.12)"
          />
        ))}
        <circle cx="100" cy="100" r="18" fill="url(#ix-radar-hot)" />
        <circle cx="100" cy="100" r="4" fill="#ef4444" />
        <circle cx="148" cy="72" r="3" fill="#60a5fa" opacity="0.8" />
        <circle cx="62" cy="118" r="3" fill="#60a5fa" opacity="0.55" />
        <circle cx="132" cy="132" r="2.5" fill="#94a3b8" opacity="0.45" />
      </svg>
      {label ? <p className="ix-ref-topology-label">{label}</p> : null}
    </div>
  );
}
