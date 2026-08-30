import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { RequestRecord } from "../types";

/** Result of create/link treatment mutations — safe for client consumption. */
export type RequestTreatmentResult = {
  request: RequestRecord;
  maintenance?: Maintenance;
  incident?: Incident;
  /** Dev/measure only — Apps Script round-trips inside link orchestration. */
  _appsScriptCalls?: number;
};
