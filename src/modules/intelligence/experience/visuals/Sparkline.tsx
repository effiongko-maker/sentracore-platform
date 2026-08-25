"use client";

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function buildPoints(seed: string, tone: "warm" | "cool" | "neutral"): string {
  const base = hashSeed(seed);
  const values = Array.from({ length: 8 }, (_, index) => {
    const wave = Math.sin((base % 360) + index * 0.9) * 0.35;
    const drift = ((base >> (index % 4)) % 7) / 14;
    return 0.35 + wave + drift;
  });
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 70 - 8;
      return `${x},${y}`;
    })
    .join(" ");
}

const STROKE: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  normal: "#60a5fa",
  info: "#a78bfa",
  success: "#34d399",
  warning: "#fb923c",
  deferred: "#fb923c",
  dismissed: "#a78bfa",
  accepted: "#34d399",
};

export function Sparkline({
  id,
  tone = "neutral",
}: {
  id: string;
  tone?: keyof typeof STROKE | "warm" | "cool" | "neutral";
}) {
  const stroke =
    tone === "warm"
      ? STROKE.high
      : tone === "cool"
        ? STROKE.normal
        : STROKE[tone] ?? STROKE.normal;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="ix-ref-sparkline"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={buildPoints(id, tone === "warm" ? "warm" : "cool")}
      />
    </svg>
  );
}
