/**
 * Executive Office — presentation-only layout of already-composed text into metric form. It never computes, rounds
 * or substitutes a value: it only splits a line the server composed ("Work: 2 critical · 14 in progress") into
 * value/label pairs. Anything it does not recognise is returned as prose, unchanged.
 */
export type PresentedMetric = { value: string; label: string };
export type PresentedLine =
  | { kind: "metrics"; group: string | null; metrics: PresentedMetric[] }
  | { kind: "text"; text: string };

const NUMBER = /^(\d[\d,]*(?:\.\d+)?)\s+(.+)$/;
const MONEY_TAIL = /^(.+?)\s+((?:[A-Z]{3}\s?|[₦$€£])[\d,]+(?:\.\d+)?)$/;
const MONEY_ONLY = /^((?:[A-Z]{3}\s?|[₦$€£])[\d,]+(?:\.\d+)?)$/;

function part(text: string): PresentedMetric | null {
  const t = text.trim();
  const n = NUMBER.exec(t);
  if (n) return { value: n[1]!, label: n[2]! };
  const m = MONEY_TAIL.exec(t);
  if (m) return { value: m[2]!, label: m[1]! };
  const only = MONEY_ONLY.exec(t);
  if (only) return { value: only[1]!, label: "" };
  return null;
}

export function presentLine(line: string): PresentedLine {
  const colon = /^([A-Z][A-Za-z &/]{1,40}):\s+(.+)$/.exec(line);
  const group = colon ? colon[1]! : null;
  const body = colon ? colon[2]! : line;
  const pieces = body.split(" · ").map((p) => p.trim()).filter(Boolean);
  const metrics = pieces.map(part);
  if (pieces.length > 0 && metrics.every((m): m is PresentedMetric => m !== null)) {
    return { kind: "metrics", group, metrics };
  }
  return { kind: "text", text: line };
}

/** A figure label such as "₦48,200,000 · 6 items" → headline value and supporting detail. */
export function presentFigure(label: string): { value: string; detail: string | null } {
  const [head, ...rest] = label.split(" · ");
  return { value: head!.trim(), detail: rest.length ? rest.join(" · ") : null };
}
