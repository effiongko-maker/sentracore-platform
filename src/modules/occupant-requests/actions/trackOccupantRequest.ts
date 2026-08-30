"use server";

import { executeAction, type ActionResult } from "@/lib/actions";
import { RequestService } from "@/services/requests/RequestService";
import { OCCUPANT_STATUS_LABELS } from "../constants";
import { mapRequestToOccupantStatus } from "../status";
import type { OccupantRequestStatus } from "../types";

export type TrackOccupantRequestInput = {
  reference: string;
  contact: string;
};

export type TrackOccupantRequestResult = {
  id: string;
  title: string;
  status: OccupantRequestStatus;
  statusLabel: string;
  submittedAt: string;
  /** Client-safe location detail when present on the request. */
  location?: string;
};

function normalizeContact(value: string): string {
  return value.trim().toLowerCase().replace(/[\s\-()]/g, "");
}

function contactMatches(
  contact: string,
  record: {
    reporterContact?: string;
    reporterName?: string;
    description?: string;
  }
): boolean {
  const needle = normalizeContact(contact);
  if (!needle) return false;

  const haystacks = [
    record.reporterContact,
    record.reporterName,
    record.description,
  ]
    .filter(Boolean)
    .map((v) => normalizeContact(String(v)));

  return haystacks.some((h) => h.includes(needle) || needle.includes(h));
}

export async function trackOccupantRequest(
  input: TrackOccupantRequestInput
): Promise<ActionResult<TrackOccupantRequestResult>> {
  return executeAction({
    name: "occupant.request.track",
    module: "facility_management",
    input,
    handler: async (_context, raw) => {
      const reference = raw.reference.trim().toUpperCase();
      const contact = raw.contact.trim();
      if (!reference) {
        throw new Error("Enter your request reference.");
      }
      if (!contact) {
        throw new Error("Enter the email or phone used on the request.");
      }

      const request = await RequestService.getRequest(reference);
      if (!request) {
        throw new Error(
          "We couldn’t find that reference. Check the number and try again."
        );
      }

      if (!contactMatches(contact, request)) {
        throw new Error(
          "The email or phone does not match this request. Try again."
        );
      }

      const status = mapRequestToOccupantStatus(request);
      return {
        id: request.id,
        title: request.title,
        status,
        statusLabel: OCCUPANT_STATUS_LABELS[status],
        submittedAt: request.createdAt || request.occurredAt,
        location: request.locationDetail?.trim() || undefined,
      };
    },
  });
}
