import type {
  RecordOperationalEventInput,
  RecordedOperationalEvent,
} from "@/lib/events";
import { recordOperationalEvent } from "@/lib/events";
import {
  bootstrapOperationalEventConsumers,
  runOperationalEventConsumers,
} from "@/lib/events/consumers";
import type { ActionContext } from "./types";

export type ActionEventInput = {
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown>;
  /** Defaults to context.department?.id */
  departmentId?: string | null;
  occurredAt?: string;
};

/**
 * Build a recordOperationalEvent payload from ActionContext.
 * organisation / module / actor come from the authenticated context — not the client.
 */
export function buildEventFromContext(
  context: ActionContext,
  input: ActionEventInput
): RecordOperationalEventInput {
  return {
    organisationId: context.organisation.id,
    moduleId: context.module.moduleId,
    eventType: input.eventType,
    departmentId:
      input.departmentId !== undefined
        ? input.departmentId
        : context.department?.id ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    data: {
      actionAt: context.now,
      ...input.data,
    },
    source: "user",
    occurredAt: input.occurredAt ?? context.now,
  };
}

/**
 * Record an operational event, then dispatch registered consumers.
 *
 * - Event insert failure → throws (domain action may catch and keep domain success).
 * - Consumer failure → logged / action_runs failed row; does not throw.
 */
export async function emitActionEvent(
  context: ActionContext,
  input: ActionEventInput
): Promise<RecordedOperationalEvent> {
  const event = await recordOperationalEvent(
    buildEventFromContext(context, input)
  );

  try {
    bootstrapOperationalEventConsumers();
    await runOperationalEventConsumers(event);
  } catch (dispatchError) {
    console.error("[emitActionEvent] consumer dispatch failed", {
      eventId: event.id,
      eventType: event.eventType,
      error:
        dispatchError instanceof Error
          ? dispatchError.message
          : String(dispatchError),
    });
  }

  return event;
}
