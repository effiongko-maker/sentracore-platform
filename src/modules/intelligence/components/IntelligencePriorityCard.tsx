import { Badge } from "@/components/ui/Badge";
import type { IntelligencePriority } from "@/lib/intelligence";
import type { StatusVariant } from "@/types";

function severityVariant(
  severity: IntelligencePriority["severity"]
): StatusVariant {
  switch (severity) {
    case "critical":
      return "danger";
    case "high":
      return "warning";
    default:
      return "neutral";
  }
}

function severityLabel(severity: IntelligencePriority["severity"]): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    default:
      return "Attention";
  }
}

export function IntelligencePriorityCard({
  priority,
}: {
  priority: IntelligencePriority;
}) {
  return (
    <article className="py-0.5 pr-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Badge
          variant={severityVariant(priority.severity)}
          className="normal-case"
        >
          {severityLabel(priority.severity)}
        </Badge>
        <h3 className="sc-text-item-title">{priority.title}</h3>
      </div>
      <p className="sc-text-supporting mt-1">{priority.summary}</p>
    </article>
  );
}
