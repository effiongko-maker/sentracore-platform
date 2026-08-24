import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  critical: "op-tone-critical",
  high: "op-tone-high",
  medium: "op-tone-medium",
  low: "op-tone-low",
};

export function OperationalTone({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <span className={cn("op-tone", TONE_CLASS[value] ?? "op-tone-info")}>
      {label}
    </span>
  );
}
