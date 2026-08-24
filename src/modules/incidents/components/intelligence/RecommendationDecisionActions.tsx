"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { decideIncidentRecommendation } from "@/modules/incidents/actions/decideIncidentRecommendation";
import type { RecommendationDecisionValue } from "@/lib/recommendations/decisions";
import { RecommendationDecisionForm } from "./RecommendationDecisionForm";

const SUCCESS_COPY: Record<
  RecommendationDecisionValue,
  { title: string; description: string }
> = {
  accepted: {
    title: "Recommendation accepted",
    description: "Your response has been recorded.",
  },
  deferred: {
    title: "Recommendation deferred",
    description: "Your response has been recorded.",
  },
  dismissed: {
    title: "Recommendation dismissed",
    description: "Your response has been recorded.",
  },
};

export function RecommendationDecisionActions({
  operationalEventId,
  recommendationActionRunId,
  recommendationId,
  onDecided,
}: {
  /** Opaque — required by decideRecommendation; never displayed. */
  operationalEventId: string;
  /** Opaque — required by decideRecommendation; never displayed. */
  recommendationActionRunId: string;
  recommendationId: string;
  onDecided: () => void | Promise<void>;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<RecommendationDecisionValue | null>(
    null
  );
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const reset = () => {
    setSelected(null);
    setReason("");
  };

  const submit = async () => {
    if (!selected || pending) return;

    setPending(true);
    try {
      const result = await decideIncidentRecommendation({
        operationalEventId,
        recommendationActionRunId,
        recommendationId,
        decision: selected,
        reason: reason.trim() || undefined,
      });

      if (!result.success) {
        toast({
          type: "error",
          title: "Unable to record decision",
          description: result.error.message,
        });
        return;
      }

      const copy = SUCCESS_COPY[selected];
      toast({
        type: "success",
        title: copy.title,
        description: copy.description,
      });
      reset();
      await onDecided();
    } catch {
      toast({
        type: "error",
        title: "Unable to record decision",
        description: "Please try again in a moment.",
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() => {
            setSelected("accepted");
            setReason("");
          }}
        >
          Accept
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            setSelected("deferred");
            setReason("");
          }}
        >
          Defer
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          className="text-muted"
          onClick={() => {
            setSelected("dismissed");
            setReason("");
          }}
        >
          Dismiss
        </Button>
        {pending ? (
          <span className="text-xs text-muted">Recording response…</span>
        ) : null}
      </div>

      {selected ? (
        <RecommendationDecisionForm
          decision={selected}
          reason={reason}
          pending={pending}
          onReasonChange={setReason}
          onConfirm={() => {
            void submit();
          }}
          onCancel={reset}
        />
      ) : null}
    </div>
  );
}
