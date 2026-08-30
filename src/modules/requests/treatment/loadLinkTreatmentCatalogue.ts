/**
 * Client-side in-flight coalesce for link-treatment catalogue loads.
 * Prevents Strict Mode double-mount from issuing two Apps Script-bound fetches.
 * TTL is intentionally 0 — modal session only; no persistent operational cache.
 */

import type { ActionResult } from "@/lib/actions";
import type { LinkableSearchHit } from "./types";
import {
  searchIncidentsForRequestLink,
  searchMaintenanceForRequestLink,
} from "../actions/treatRequest";

export type LinkTreatmentKind = "maintenance" | "incident";

type CataloguePayload = {
  data: LinkableSearchHit[];
  total: number;
};

const inflight = new Map<
  string,
  Promise<ActionResult<CataloguePayload>>
>();

function catalogueKey(kind: LinkTreatmentKind, requestId: string): string {
  return `link-treatment-catalogue:${kind}:${requestId}`;
}

/**
 * One remote catalogue fetch per (kind, requestId) while in flight.
 * Search text is intentionally not part of the key — filtering is local.
 */
export function loadLinkTreatmentCatalogue(options: {
  kind: LinkTreatmentKind;
  requestId: string;
}): Promise<ActionResult<CataloguePayload>> {
  const key = catalogueKey(options.kind, options.requestId);
  const existing = inflight.get(key);
  if (existing) return existing;

  const runner =
    options.kind === "maintenance"
      ? searchMaintenanceForRequestLink
      : searchIncidentsForRequestLink;

  const run = runner({
    requestId: options.requestId,
    // Empty search → server returns full facility-scoped linkable catalogue.
    search: "",
    page: 1,
    pageSize: 200,
  }).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, run);
  return run;
}
