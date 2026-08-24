import {
  actionOutcomeSucceeded,
  type ActionOutcome,
} from "./outcome";
import type { OperationalEventConsumer } from "./types";

/**
 * Demo / verification consumer for Action Engine v1.1.
 * Returns the standard ActionOutcome contract (no AI).
 */
export const acknowledgeEventConsumer: OperationalEventConsumer = async (
  ctx
) => {
  const { event, actionKey, organisationId, moduleId, actorProfileId, run } =
    ctx;

  const outcome: ActionOutcome = actionOutcomeSucceeded(
    `Acknowledged operational event ${event.eventType} for ${event.entityType ?? "entity"} ${event.entityId ?? "(none)"}.`,
    {
      acknowledged: true,
      interpreted: true,
      actionKey,
      eventId: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      organisationId,
      moduleId,
      actorProfileId,
      source: event.source,
      occurredAt: event.occurredAt,
      runStartedAt: run.startedAt,
      message:
        "Event received and interpreted by Action Engine v1.1 acknowledge consumer.",
    }
  );

  return outcome;
};
