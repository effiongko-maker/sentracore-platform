/** Client-safe treatment DTOs (no server imports). */

export type LinkableSearchHit = {
  id: string;
  title: string;
  status: string;
  facilityId: string;
  date: string;
  sourceRequestId?: string;
};

export type { RequestTreatmentResult } from "./resultTypes";
