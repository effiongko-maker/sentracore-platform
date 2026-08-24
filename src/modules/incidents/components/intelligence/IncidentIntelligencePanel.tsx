"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BeaconSpinner } from "@/components/loading";
import { Button } from "@/components/ui/Button";
import type { EventIntelligence } from "@/lib/intelligence";
import { fetchIncidentIntelligence } from "@/modules/incidents/actions/fetchIncidentIntelligence";
import { IntelligenceOrganisationalContext } from "./IntelligenceOrganisationalContext";
import { IntelligenceRecommendationList } from "./IntelligenceRecommendationList";
import { IntelligenceRiskSection } from "./IntelligenceRiskSection";
import { IntelligenceStatusBanner } from "./IntelligenceStatusBanner";

type PanelState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; data: EventIntelligence }
  | { phase: "unavailable"; message: string }
  | { phase: "error"; message: string };

const UNAVAILABLE_MESSAGE =
  "Intelligence is not available for this incident.";

function messageForFailure(code: string, message: string): {
  phase: "unavailable" | "error";
  message: string;
} {
  if (
    code === "FORBIDDEN" ||
    code === "MODULE_NOT_ENABLED" ||
    /not found/i.test(message)
  ) {
    return { phase: "unavailable", message: UNAVAILABLE_MESSAGE };
  }

  if (
    code === "UNAUTHENTICATED" ||
    code === "PROFILE_NOT_FOUND" ||
    code === "ORGANISATION_NOT_FOUND" ||
    code === "ORGANISATION_INACTIVE" ||
    code === "DEPARTMENT_ACCESS_DENIED"
  ) {
    return { phase: "error", message };
  }

  return {
    phase: "error",
    message: "Unable to load intelligence. Please try again.",
  };
}

export function IncidentIntelligencePanel({
  incidentId,
  active,
}: {
  incidentId: string;
  /** When false, do not fetch (modal closed / no incident). */
  active: boolean;
}) {
  const [state, setState] = useState<PanelState>({ phase: "idle" });
  const [retryToken, setRetryToken] = useState(0);
  const activeRef = useRef(active);
  const incidentIdRef = useRef(incidentId);

  activeRef.current = active;
  incidentIdRef.current = incidentId;

  useEffect(() => {
    if (!active || !incidentId.trim()) {
      setState({ phase: "idle" });
      return;
    }

    let cancelled = false;
    const requestId = incidentId.trim();

    setState({ phase: "loading" });

    void (async () => {
      const result = await fetchIncidentIntelligence(requestId);
      if (cancelled) return;

      if (!result.success) {
        const mapped = messageForFailure(
          result.error.code,
          result.error.message
        );
        setState(mapped);
        return;
      }

      setState({ phase: "ready", data: result.data });
    })();

    return () => {
      cancelled = true;
    };
  }, [active, incidentId, retryToken]);

  const refreshIntelligence = useCallback(async () => {
    const requestId = incidentIdRef.current.trim();
    if (!activeRef.current || !requestId) return;

    const result = await fetchIncidentIntelligence(requestId);
    if (!activeRef.current || incidentIdRef.current.trim() !== requestId) {
      return;
    }

    if (!result.success) {
      // Decision may already be saved; keep current view and surface retry.
      setState((current) =>
        current.phase === "ready"
          ? current
          : messageForFailure(result.error.code, result.error.message)
      );
      return;
    }

    setState({ phase: "ready", data: result.data });
  }, []);

  return (
    <section
      className="mt-6 space-y-5 border-t border-border/70 pt-6"
      aria-label="SentraCore Intelligence"
    >
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-primary">
          SentraCore Intelligence
        </h2>
        <p className="mt-1 text-xs text-muted">
          What SentraCore Intelligence currently knows about this incident.
        </p>
      </div>

      {state.phase === "loading" || state.phase === "idle" ? (
        <div className="flex items-center gap-3 rounded-sc border border-border/60 bg-slate-50/60 px-4 py-5">
          <BeaconSpinner size="sm" label="Loading intelligence" />
          <p className="text-sm text-muted">Preparing intelligence…</p>
        </div>
      ) : null}

      {state.phase === "unavailable" ? (
        <p className="text-sm leading-relaxed text-muted">{state.message}</p>
      ) : null}

      {state.phase === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sc border border-border/70 bg-slate-50/80 px-4 py-3">
          <p className="text-sm text-muted">{state.message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetryToken((value) => value + 1)}
          >
            Retry
          </Button>
        </div>
      ) : null}

      {state.phase === "ready" ? (
        <div className="space-y-5">
          <IntelligenceStatusBanner state={state.data.status.state} />

          {state.data.status.state === "unavailable" ? (
            <p className="text-sm leading-relaxed text-muted">
              {UNAVAILABLE_MESSAGE}
            </p>
          ) : (
            <ReadyIntelligenceBody
              data={state.data}
              onDecisionRecorded={refreshIntelligence}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}

function ReadyIntelligenceBody({
  data,
  onDecisionRecorded,
}: {
  data: EventIntelligence;
  onDecisionRecorded: () => void | Promise<void>;
}) {
  const { eventSpecific, humanResponse, organisationalContext } =
    data.intelligence;
  const processing = data.status.state === "processing";
  const hasRecommendations =
    eventSpecific.recommendations.length > 0 ||
    humanResponse.recommendations.length > 0;
  const hasRisk =
    eventSpecific.risk != null &&
    (Boolean(eventSpecific.risk.riskLevel) ||
      eventSpecific.risk.riskScore != null ||
      Boolean(eventSpecific.risk.summary));
  const hasSignals = eventSpecific.signals.length > 0;

  return (
    <>
      {hasRisk || hasSignals || !processing ? (
        <IntelligenceRiskSection
          risk={eventSpecific.risk}
          signals={eventSpecific.signals}
        />
      ) : null}
      {hasRecommendations || hasSignals || !processing ? (
        <IntelligenceRecommendationList
          recommendations={eventSpecific.recommendations}
          humanResponse={humanResponse.recommendations}
          risk={eventSpecific.risk}
          signals={eventSpecific.signals}
          operationalEventId={data.event.id}
          recommendationActionRunId={
            eventSpecific.recommendationActionRunId
          }
          onDecisionRecorded={onDecisionRecorded}
        />
      ) : null}
      <IntelligenceOrganisationalContext
        responsePatterns={organisationalContext.responsePatterns}
      />
    </>
  );
}
