import { Badge } from "@/components/ui/Badge";
import type { IntelligenceStatusState } from "@/lib/intelligence";
import type { StatusVariant } from "@/types";

const COPY: Partial<
  Record<
    IntelligenceStatusState,
    { title: string; description: string; variant: StatusVariant }
  >
> = {
  partial: {
    title: "Still completing",
    description:
      "Some of this picture is still coming together. Available findings are shown.",
    variant: "warning",
  },
  processing: {
    title: "Still processing",
    description:
      "SentraCore is still processing recent operational activity.",
    variant: "info",
  },
};

export function IntelligenceStatusBanner({
  state,
}: {
  state: IntelligenceStatusState;
}) {
  const copy = COPY[state];
  if (!copy) return null;

  return (
    <div className="flex flex-col gap-2 rounded-sc border border-border/70 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
      <Badge variant={copy.variant} className="w-fit shrink-0 normal-case">
        {copy.title}
      </Badge>
      <p className="text-sm leading-relaxed text-muted">{copy.description}</p>
    </div>
  );
}
