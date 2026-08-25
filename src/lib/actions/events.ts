import type {
  RecordOperationalEventInput,
  RecordedOperationalEvent,
} from "@/lib/events";
import {
  recordOperationalEvent,
  recordSystemOperationalEvent,
} from "@/lib/events";
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

function isOutsideNextRequestScope(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("cookies") &&
    (message.includes("outside a request scope") ||
      message.includes("next-dynamic-api-wrong-context"))
  );
}

/**
 * Record an operational event, then dispatch registered consumers.
 *
 * - Event insert failure → throws (domain action may catch and keep domain success).
 * - Consumer failure → logged / action_runs failed row; does not throw.
 * - Outside a Next.js request scope (scripts / background), falls back to the
 *   service-role writer while still attributing actor_profile_id from context.
 */
export async function emitActionEvent(
  context: ActionContext,
  input: ActionEventInput
): Promise<RecordedOperationalEvent> {
  const payload = buildEventFromContext(context, input);
  let event: RecordedOperationalEvent;

  try {
    event = await recordOperationalEvent(payload);
  } catch (error) {
    if (!isOutsideNextRequestScope(error)) {
      throw error;
    }
    event = await recordSystemOperationalEvent({
      ...payload,
      actorProfileId: context.profile.id,
      source: "user",
    });
  }

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
