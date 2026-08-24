import type { RecordedOperationalEvent } from "../recordOperationalEvent";
import type { ActionOutcome } from "./outcome";

/**
 * Consistent context passed to every operational-event consumer.
 * Derived from the recorded event — consumers should not rebuild this manually.
 */
export type OperationalEventConsumerContext = {
  event: RecordedOperationalEvent;
  actionKey: string;
  organisationId: string;
  moduleId: string;
  departmentId: string | null;
  actorProfileId: string | null;
  /** Pre-insert run metadata (id is assigned when action_runs row is written). */
  run: {
    actionKey: string;
    startedAt: string;
  };
};

export type OperationalEventConsumer = (
  ctx: OperationalEventConsumerContext
) => Promise<ActionOutcome>;

export type ConsumerRegistration = {
  /** Stable key written to action_runs.action_key */
  actionKey: string;
  /** Event types this consumer subscribes to */
  eventTypes: readonly string[];
  handler: OperationalEventConsumer;
  /**
   * Lightweight dependency: these action_keys (for the same event) must run first.
   * Dispatcher resolves order; not a workflow engine.
   */
  dependsOn?: readonly string[];
};

const registrations: ConsumerRegistration[] = [];

/**
 * Register a downstream consumer. Prefer module init / registry bootstrap —
 * avoid giant switch statements in the dispatcher.
 */
export function registerOperationalEventConsumer(
  registration: ConsumerRegistration
): void {
  const existing = registrations.find(
    (r) => r.actionKey === registration.actionKey
  );
  if (existing) {
    throw new Error(
      `Consumer already registered for action_key=${registration.actionKey}`
    );
  }
  registrations.push(registration);
}

export function getConsumersForEventType(
  eventType: string
): ConsumerRegistration[] {
  return orderConsumersByDependency(
    registrations.filter((r) => r.eventTypes.includes(eventType))
  );
}

/** Test/introspection helper */
export function listRegisteredConsumers(): readonly ConsumerRegistration[] {
  return registrations;
}

/**
 * Stable topological order: dependents after dependencies.
 * Unknown/missing deps are ignored (consumer still runs; it handles missing input).
 * Cycles fall back to remaining registration order (never hangs).
 */
export function orderConsumersByDependency(
  consumers: ConsumerRegistration[]
): ConsumerRegistration[] {
  if (consumers.length <= 1) return [...consumers];

  const byKey = new Map(consumers.map((c) => [c.actionKey, c]));
  const remaining = new Set(consumers.map((c) => c.actionKey));
  const ordered: ConsumerRegistration[] = [];

  while (remaining.size > 0) {
    const readyKeys = [...remaining].filter((key) => {
      const deps = byKey.get(key)?.dependsOn ?? [];
      return deps.every(
        (dep) => !byKey.has(dep) || ordered.some((o) => o.actionKey === dep)
      );
    });

    if (readyKeys.length === 0) {
      for (const c of consumers) {
        if (remaining.has(c.actionKey)) ordered.push(c);
      }
      break;
    }

    const readySet = new Set(readyKeys);
    for (const c of consumers) {
      if (readySet.has(c.actionKey) && remaining.has(c.actionKey)) {
        ordered.push(c);
        remaining.delete(c.actionKey);
      }
    }
  }

  return ordered;
}

export function buildConsumerContext(options: {
  event: RecordedOperationalEvent;
  actionKey: string;
  startedAt: string;
}): OperationalEventConsumerContext {
  const { event, actionKey, startedAt } = options;
  return {
    event,
    actionKey,
    organisationId: event.organisationId,
    moduleId: event.moduleId,
    departmentId: event.departmentId,
    actorProfileId: event.actorProfileId,
    run: {
      actionKey,
      startedAt,
    },
  };
}
