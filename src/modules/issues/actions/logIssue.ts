"use server";

import {
  ActionError,
  executeAction,
  type ActionResult,
} from "@/lib/actions";
import {
  buildIssueOperationalView,
  composeIssueFromMaintenance,
  FM_LOG_ISSUE_SIDE_EFFECT_MODE,
  type IssueOperationalView,
} from "@/lib/operational/issues";
import { orchestrateRequestMaintenance } from "@/lib/operational/orchestration";
import { MAINTENANCE_PRIORITIES } from "@/modules/maintenance/constants";

/**
 * @deprecated Phase 15 — Log Issue no longer classifies Issues.
 * Ignored if provided; Work is always created.
 */
export type LogIssueClassification = "ordinary" | "significant";

export type LogIssueInput = {
  title: string;
  description?: string;
  facilityId: string;
  locationDetail?: string;
  urgency?: "low" | "medium" | "high" | "critical";
  /**
   * @deprecated Ignored. FM Log Issue always creates Work (Maintenance backing).
   */
  classification?: LogIssueClassification;
  /**
   * @deprecated Ignored. Incident is not created from Log Issue.
   */
  incidentType?: string;
};

export type LogIssueResult = {
  issueId: string;
  /**
   * Conceptual root: Work. Physical id is Maintenance (MNT-*).
   * `maintenance` retained as alias for older clients.
   */
  rootKind: "work" | "maintenance";
  rootId: string;
  view: IssueOperationalView;
  /** Always null — FM Log Issue must never invent a Request. */
  requestId: null;
};

function isOneOf<T extends string>(
  value: string,
  allowed: readonly T[]
): value is T {
  return (allowed as readonly string[]).includes(value);
}

/**
 * FM Log Issue — creates Work (Maintenance backing store) and returns Issue view.
 * No Request. No Incident. No Maintenance-vs-Incident taxonomy.
 * Phase 9: deferred side effects via FM_LOG_ISSUE_SIDE_EFFECT_MODE.
 */
export async function logIssue(
  input: LogIssueInput
): Promise<ActionResult<LogIssueResult>> {
  return executeAction({
    name: "issue.log",
    module: "facility_management",
    input,
    handler: async (context, raw) => {
      const title = raw.title?.trim() ?? "";
      const facilityId = raw.facilityId?.trim() ?? "";
      const description = raw.description?.trim() || undefined;
      const locationDetail = raw.locationDetail?.trim() || undefined;
      const urgencyRaw = (raw.urgency ?? "medium").toString();

      if (!title) {
        throw new ActionError("VALIDATION_ERROR", "What happened is required.");
      }
      if (!facilityId) {
        throw new ActionError("VALIDATION_ERROR", "Facility is required.");
      }
      if (!isOneOf(urgencyRaw, MAINTENANCE_PRIORITIES)) {
        throw new ActionError("VALIDATION_ERROR", "Priority is invalid.");
      }

      const locationBlock = locationDetail
        ? `\n\nLocation: ${locationDetail}`
        : "";
      const maintenance = await orchestrateRequestMaintenance({
        intake: "staff",
        context,
        sideEffectMode: FM_LOG_ISSUE_SIDE_EFFECT_MODE,
        input: {
          title,
          description: `${description || title}${locationBlock}`.trim(),
          facilityId,
          type: "corrective",
          source: "manual",
          priority: urgencyRaw,
          status: "requested",
          reportedAt: context.now,
          requiresWorkOrder: false,
          createdByUserId: context.userId,
          updatedByUserId: context.userId,
          reportedByUserId: context.userId,
        },
      });

      if (maintenance.sourceRequestId) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "FM Log Issue must not create a Request."
        );
      }

      const issue = composeIssueFromMaintenance({
        maintenance: {
          id: maintenance.id,
          title: maintenance.title,
          description: maintenance.description,
          facilityId: maintenance.facilityId,
          locationDetail,
          status: maintenance.status,
          priority: maintenance.priority,
          assetId: maintenance.assetId,
          completedAt: maintenance.completedAt,
          completionNotes: maintenance.completionNotes,
          workOrderId: maintenance.workOrderId,
          workOrderIds: maintenance.workOrderIds,
          sourceRequestId: maintenance.sourceRequestId,
          incidentId: maintenance.incidentId,
          createdAt: maintenance.createdAt,
          updatedAt: maintenance.updatedAt,
          createdByUserId: maintenance.createdByUserId,
        },
      });

      return {
        issueId: issue.id,
        rootKind: "work" as const,
        rootId: maintenance.id,
        view: buildIssueOperationalView(issue),
        requestId: null,
      };
    },
  });
}
