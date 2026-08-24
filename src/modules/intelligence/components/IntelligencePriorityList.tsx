import { BriefingSection } from "@/components/experience";
import type { IntelligencePriority } from "@/lib/intelligence";
import { IntelligencePriorityCard } from "./IntelligencePriorityCard";
import { cn } from "@/lib/utils";

export function IntelligencePriorityList({
  priorities,
}: {
  priorities: IntelligencePriority[];
}) {
  if (priorities.length === 0) {
    return (
      <BriefingSection
        emphasis="action"
        title="Needs attention"
        description="Things requiring action now."
      >
        <p className="sc-text-supporting max-w-xl">
          Nothing needs action right now.
        </p>
      </BriefingSection>
    );
  }

  return (
    <BriefingSection
      emphasis="action"
      title="Needs attention"
      description="Things requiring action now."
    >
      <ul className="space-y-1">
        {priorities.map((priority) => (
          <li
            key={priority.id}
            className={cn(
              "sc-briefing-priority rounded-r-[var(--sc-radius-sm)]",
              priority.severity === "critical" && "sc-briefing-priority-critical",
              priority.severity === "high" && "sc-briefing-priority-high"
            )}
          >
            <IntelligencePriorityCard priority={priority} />
          </li>
        ))}
      </ul>
    </BriefingSection>
  );
}
