"use client";

import { Badge } from "@/components/ui/Badge";
import type { IntelligenceStatusState } from "@/lib/intelligence";
import type { StatusVariant } from "@/types";

const STATUS_COPY: Record<
  IntelligenceStatusState,
  { title: string; description: string; variant: StatusVariant }
> = {
  ready: {
    title: "Analysis complete",
    description:
      "Based on the operational information currently available.",
    variant: "success",
  },
  partial: {
    title: "Partial analysis",
    description:
      "Some intelligence could not be fully resolved. Available findings are shown.",
    variant: "warning",
  },
  processing: {
    title: "Analysis in progress",
    description: "Additional analysis is still being prepared.",
    variant: "info",
  },
  unavailable: {
    title: "Intelligence unavailable",
    description: "Intelligence is not available for this incident.",
    variant: "neutral",
  },
};

export function IntelligenceStatusBanner({
  state,
}: {
  state: IntelligenceStatusState;
}) {
  const copy = STATUS_COPY[state];

  return (
    <div className="flex flex-col gap-2 rounded-sc border border-border/70 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-start sm:gap-3">
      <Badge variant={copy.variant} className="w-fit shrink-0 normal-case">
        {copy.title}
      </Badge>
      <p className="text-sm leading-relaxed text-muted">{copy.description}</p>
    </div>
  );
}
