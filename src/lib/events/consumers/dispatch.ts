import { createAdminClient } from "@/utils/supabase/admin";
import type { RecordedOperationalEvent } from "../recordOperationalEvent";
import { buildConsumerContext, getConsumersForEventType } from "./types";
import { isActionOutcome } from "./outcome";

/**
 * Run registered consumers for a recorded operational event.
 * Persists one terminal action_runs row per consumer (succeeded | failed).
 * Stores the standard ActionOutcome in action_runs.result.
 * Never throws — domain actions must not depend on consumer success.
 */
export async function runOperationalEventConsumers(
  event: RecordedOperationalEvent
): Promise<void> {
  const consumers = getConsumersForEventType(event.eventType);
  if (consumers.length === 0) return;

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("[runOperationalEventConsumers] admin client unavailable", {
      eventId: event.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  for (const registration of consumers) {
    const startedAt = new Date().toISOString();
    const input = {
      eventId: event.id,
      eventType: event.eventType,
      organisationId: event.organisationId,
      moduleId: event.moduleId,
      departmentId: event.departmentId,
      entityType: event.entityType,
      entityId: event.entityId,
      actorProfileId: event.actorProfileId,
      source: event.source,
      dependsOn: registration.dependsOn ?? [],
    };

    const ctx = buildConsumerContext({
      event,
      actionKey: registration.actionKey,
      startedAt,
    });

    try {
      const outcome = await registration.handler(ctx);

      if (!isActionOutcome(outcome)) {
        throw new Error(
          `Consumer ${registration.actionKey} returned an invalid ActionOutcome`
        );
      }

      // Terminal action_runs statuses are succeeded|failed only.
      // Consumer outcome status (partial/skipped/…) lives in result JSON.
      const runStatus =
        outcome.status === "failed" ? "failed" : "succeeded";

      const { error } = await admin.from("action_runs").insert({
        organisation_id: event.organisationId,
        operational_event_id: event.id,
        action_key: registration.actionKey,
        status: runStatus,
        input,
        result: outcome,
        error: outcome.status === "failed" ? outcome.summary : null,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      });

      if (error) {
        console.error(
          "[runOperationalEventConsumers] outcome insert failed",
          {
            actionKey: registration.actionKey,
            eventId: event.id,
            error: error.message,
            code: error.code,
            details: error.details,
          }
        );
      }
    } catch (handlerError) {
      const message =
        handlerError instanceof Error
          ? handlerError.message
          : "Consumer handler failed";

      console.error("[runOperationalEventConsumers] consumer failed", {
        actionKey: registration.actionKey,
        eventId: event.id,
        error: message,
      });

      const failedOutcome = {
        status: "failed" as const,
        summary: message,
        data: {
          actionKey: registration.actionKey,
          eventId: event.id,
        },
      };

      const { error } = await admin.from("action_runs").insert({
        organisation_id: event.organisationId,
        operational_event_id: event.id,
        action_key: registration.actionKey,
        status: "failed",
        input,
        result: failedOutcome,
        error: message,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
      });

      if (error) {
        console.error(
          "[runOperationalEventConsumers] failed-run insert failed",
          {
            actionKey: registration.actionKey,
            eventId: event.id,
            error: error.message,
          }
        );
      }
    }
  }
}
