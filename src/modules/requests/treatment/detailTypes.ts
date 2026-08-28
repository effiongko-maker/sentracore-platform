import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { RequestRecord } from "../types";
import type { WorkOrder } from "@/modules/work-orders/types";

/** Client-safe detail shape returned by getRequestTreatmentDetail. */

export type DerivedWorkOrderLink = {
  workOrder: WorkOrder;
  via: "maintenance" | "incident";
  viaId: string;
};

export type RequestTreatmentDetail = {
  request: RequestRecord;
  maintenance: Maintenance[];
  incidents: Incident[];
  derivedWorkOrders: DerivedWorkOrderLink[];
};
