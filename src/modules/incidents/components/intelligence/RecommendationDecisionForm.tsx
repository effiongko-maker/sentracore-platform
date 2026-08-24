"use client";

import { Button } from "@/components/ui/Button";
import type { RecommendationDecisionValue } from "@/lib/recommendations/decisions";

const REASON_PROMPTS: Record<
  RecommendationDecisionValue,
  { label: string; placeholder: string }
> = {
  accepted: {
    label: "Reason (optional)",
    placeholder: "Add context if useful",
  },
  deferred: {
    label: "Why is this being deferred? (optional)",
    placeholder: "e.g. waiting on parts, scheduled for later review",
  },
  dismissed: {
    label: "Why is this recommendation not being acted on? (optional)",
    placeholder: "e.g. already addressed, not applicable here",
  },
};

const CONFIRM_LABELS: Record<RecommendationDecisionValue, string> = {
  accepted: "Confirm accept",
  deferred: "Confirm defer",
  dismissed: "Confirm dismiss",
};

export function RecommendationDecisionForm({
  decision,
  reason,
  pending,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  decision: RecommendationDecisionValue;
  reason: string;
  pending: boolean;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const prompt = REASON_PROMPTS[decision];

  return (
    <div className="space-y-3 rounded-sc border border-border/70 bg-slate-50/70 px-3 py-3">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted">{prompt.label}</span>
        <textarea
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          disabled={pending}
          rows={2}
          placeholder={prompt.placeholder}
          className="w-full resize-none rounded-[12px] border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted/70 focus:border-accent/40 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          loading={pending}
          onClick={onConfirm}
        >
          {CONFIRM_LABELS[decision]}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
