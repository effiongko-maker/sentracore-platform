import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAuthoritySnapshot } from "@/lib/intelligence/authority/loadAuthoritySnapshot";
import {
  reconcileEvents,
  type ReconcilableEvent,
} from "@/lib/intelligence/authority/reconcileEvents";

/**
 * ORPHANED HISTORY IS NOT OPERATIONAL EVIDENCE.
 *
 * Emit-time consumers score a new event against prior ledger history. Only
 * prior events whose subject entity resolves — by canonical UUID, in the same
 * organisation — to a current authoritative FM record may count. This reuses
 * the Intelligence authority reconciler; there is no second reconciler.
 *
 * Returns the ids of the events that reconcile. Source rows are not altered
 * and nothing is deleted. Throws when the authoritative source cannot be read,
 * so a failed check can never silently count (or silently drop) history.
 */
export async function reconciledHistoryEventIds(input: {
  admin: SupabaseClient;
  organisationId: string;
  events: ReconcilableEvent[];
}): Promise<Set<string>> {
  if (input.events.length === 0) return new Set();
  const snapshot = await loadAuthoritySnapshot({
    organisationId: input.organisationId,
    events: input.events,
    admin: input.admin,
  });
  const { kept } = reconcileEvents(input.events, snapshot.index);
  return new Set(kept.map((event) => event.id));
}
