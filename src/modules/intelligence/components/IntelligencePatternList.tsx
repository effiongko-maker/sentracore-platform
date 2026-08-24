import { BriefingSection } from "@/components/experience";
import type {
  IntelligencePattern,
  IntelligencePriority,
} from "@/lib/intelligence";

type NoticingRow = {
  id: string;
  title: string;
  summary: string;
  emphasis: "attention" | "observation";
};

export function IntelligencePatternList({
  attention = [],
  observations = [],
}: {
  attention?: IntelligencePriority[];
  observations?: IntelligencePattern[];
}) {
  const rows: NoticingRow[] = [
    ...attention.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      emphasis: "attention" as const,
    })),
    ...observations.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      emphasis: "observation" as const,
    })),
  ];

  if (rows.length === 0) return null;

  return (
    <BriefingSection
      emphasis="observation"
      title="What we're noticing"
      description="Patterns worth understanding that may not need action right now."
    >
      <ul className="sc-briefing-divider-list">
        {rows.map((row) => (
          <li key={row.id} className="py-2.5 first:pt-0">
            <div className="flex items-baseline gap-2">
              {row.emphasis === "attention" ? (
                <span className="shrink-0 text-[11px] font-medium text-amber-800/90">
                  Attention
                </span>
              ) : null}
              <p className="sc-text-item-title">{row.title}</p>
            </div>
            <p className="sc-text-supporting mt-0.5">{row.summary}</p>
          </li>
        ))}
      </ul>
    </BriefingSection>
  );
}
