import type { OperationalPictureAggregate } from "@/modules/workspace/operationalPicture";

export const OPERATIONAL_PICTURE_CONTRACT_VERSION =
  "operational-picture.v1" as const;

export type OperationalPictureSummary = OperationalPictureAggregate & {
  contractVersion: typeof OPERATIONAL_PICTURE_CONTRACT_VERSION;
  asOf: string;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function count(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value as number;
}

function state(value: unknown, label: string): "healthy" | "unavailable" {
  if (value !== "healthy" && value !== "unavailable") {
    throw new Error(`${label}.state is invalid.`);
  }
  return value;
}

function maintenanceDomain(value: unknown) {
  const domain = record(value, "maintenance");
  if (state(domain.state, "maintenance") === "unavailable") {
    return { state: "unavailable" as const };
  }
  return {
    state: "healthy" as const,
    critical: count(domain.critical, "maintenance.critical"),
    inProgress: count(domain.inProgress, "maintenance.inProgress"),
    awaitingAction: count(
      domain.awaitingAction,
      "maintenance.awaitingAction"
    ),
    overdue: count(domain.overdue, "maintenance.overdue"),
  };
}

function workOrderDomain(value: unknown) {
  const domain = record(value, "workOrders");
  if (state(domain.state, "workOrders") === "unavailable") {
    return { state: "unavailable" as const };
  }
  return {
    state: "healthy" as const,
    awaitingAction: count(domain.awaitingAction, "workOrders.awaitingAction"),
    overdue: count(domain.overdue, "workOrders.overdue"),
  };
}

function approvalDomain(value: unknown) {
  const domain = record(value, "approvals");
  if (state(domain.state, "approvals") === "unavailable") {
    return { state: "unavailable" as const };
  }
  return {
    state: "healthy" as const,
    awaitingAction: count(domain.awaitingAction, "approvals.awaitingAction"),
  };
}

export function parseOperationalPictureSummary(
  value: unknown,
  expectedAsOf: string
): OperationalPictureSummary {
  const payload = record(value, "Operational Picture payload");
  if (payload.contractVersion !== OPERATIONAL_PICTURE_CONTRACT_VERSION) {
    throw new Error("Unsupported Operational Picture contract version.");
  }
  if (payload.asOf !== expectedAsOf) {
    throw new Error("Operational Picture asOf echo mismatch.");
  }
  return {
    contractVersion: OPERATIONAL_PICTURE_CONTRACT_VERSION,
    asOf: expectedAsOf,
    maintenance: maintenanceDomain(payload.maintenance),
    workOrders: workOrderDomain(payload.workOrders),
    approvals: approvalDomain(payload.approvals),
  };
}

/**
 * Operational Picture — every domain is Supabase-authoritative:
 * Maintenance (Work, Phase 2B), Work Orders (Work Instructions, Phase 2E) and
 * Approvals (Phase 2F). There is no Apps Script call. A failed domain is
 * `unavailable`, never zero; a successful empty register is a healthy zero.
 */
export async function loadOperationalPictureSummary(
  asOf: string
): Promise<OperationalPictureSummary> {
  const domain = async <T>(label: string, load: () => Promise<T | undefined>): Promise<T | { state: "unavailable" }> => {
    try {
      const picture = await load();
      if (picture && (picture as { state?: string }).state === "healthy") return picture;
      return { state: "unavailable" };
    } catch (error) {
      console.error(`[CommandCentreFmSummaryService] ${label} picture unavailable`, error);
      return { state: "unavailable" };
    }
  };

  const [maintenance, workOrders, approvals] = await Promise.all([
    domain("Work", async () => {
      const { MaintenanceServerAccess } = await import("@/modules/maintenance/server/MaintenanceServerAccess");
      const page = await MaintenanceServerAccess.listMaintenance({
        page: 1,
        pageSize: 1,
        includeOperationalPictureTotals: true,
        asOf,
      });
      return page.operationalPictureMaintenance as OperationalPictureAggregate["maintenance"] | undefined;
    }),
    domain("Work Instruction", async () => {
      const { WorkInstructionServerAccess } = await import("@/modules/work-orders/server/WorkInstructionServerAccess");
      const page = await WorkInstructionServerAccess.listWorkOrders({
        page: 1,
        pageSize: 1,
        includeOperationalPictureTotals: true,
        asOf,
      });
      return page.operationalPictureWorkOrders as OperationalPictureAggregate["workOrders"] | undefined;
    }),
    domain("Approval", async () => {
      const { getFmApprovalServerService } = await import("@/modules/approvals/server/getFmApprovalServerService");
      return (await getFmApprovalServerService()).operationalPicture() as Promise<OperationalPictureAggregate["approvals"]>;
    }),
  ]);

  return {
    contractVersion: OPERATIONAL_PICTURE_CONTRACT_VERSION,
    asOf,
    maintenance,
    workOrders,
    approvals,
  } as OperationalPictureSummary;
}
