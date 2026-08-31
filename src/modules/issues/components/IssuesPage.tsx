"use client";

import { Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { ModeFrame, StreamSurface } from "@/components/platform";
import { OperationalPageHeader } from "@/components/operational";
import { EmptyState } from "@/components/ui/EmptyState";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import {
  buildIssueOperationalView,
  composeIssueFromRequest,
  composeOperationalViewFromTreatmentDetail,
  type IssueOperationalView,
} from "@/lib/operational/issues";
import { getRequestTreatmentDetail } from "@/modules/requests/actions/treatRequest";
import { RequestService } from "@/services/requests/RequestService";
import type { RequestRecord } from "@/modules/requests/types";
import { IssueOperationalPanel } from "./IssueOperationalPanel";

/**
 * Thin Issue operational lens (Phase 4 validation UI).
 * Composes Request-backed Issues only — no new persistence.
 * Treat / resolve / work actions route into existing modules.
 */
export function IssuesPage() {
  const openId = useQueryRecordId();
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null
  );
  const [view, setView] = useState<IssueOperationalView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void RequestService.listRequests({ page: 1, pageSize: 50, status: "all" })
      .then((result) => {
        if (cancelled) return;
        setRequests(result.data);
        setError(null);
        const initial =
          openId && result.data.some((r) => r.id === openId)
            ? openId
            : result.data[0]?.id ?? null;
        setSelectedRequestId(initial);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId]);

  useEffect(() => {
    if (!selectedRequestId) {
      setView(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);

    const listRow = requests.find((r) => r.id === selectedRequestId);
    if (listRow) {
      setView(
        buildIssueOperationalView(
          composeIssueFromRequest({
            request: {
              id: listRow.id,
              title: listRow.title,
              description: listRow.description,
              facilityId: listRow.facilityId,
              locationDetail: listRow.locationDetail,
              reporterName: listRow.reporterName,
              reporterContact: listRow.reporterContact,
              reportedByUserId: listRow.reportedByUserId,
              status: listRow.status,
              requestType: listRow.requestType,
              maintenanceIds: listRow.maintenanceIds ?? [],
              incidentIds: listRow.incidentIds ?? [],
              workOrderIds: listRow.workOrderIds ?? [],
              createdAt: listRow.createdAt,
              updatedAt: listRow.updatedAt,
            },
          })
        )
      );
    }

    void getRequestTreatmentDetail({ requestId: selectedRequestId })
      .then((result) => {
        if (cancelled) return;
        if (!result.success || !result.data) return;
        setView(composeOperationalViewFromTreatmentDetail(result.data));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRequestId, requests]);

  return (
    <ModeFrame mode="execute">
      <div className="op-page">
        <OperationalPageHeader
          title="Issues"
          description="Operational problem lens over Request intake and existing treatments. Ordinary problems → Maintenance; significant events → Incident. Work Orders are optional formal execution."
          countValue={requests.length}
          countLabel="In view"
          loading={loading}
        />

        {error ? (
          <EmptyState
            icon={Inbox}
            title="Couldn’t load Issues"
            description={error}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <StreamSurface>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--sc-border)] text-[var(--sc-muted)]">
                      <th className="px-3 py-2 font-medium">Reference</th>
                      <th className="px-3 py-2 font-medium">Title</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-6 text-[var(--sc-muted)]"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : requests.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-6 text-[var(--sc-muted)]"
                        >
                          No Request-backed Issues yet. Staff Submit Request
                          creates intake.
                        </td>
                      </tr>
                    ) : (
                      requests.map((row) => {
                        const lens = composeIssueFromRequest({
                          request: {
                            id: row.id,
                            title: row.title,
                            facilityId: row.facilityId,
                            status: row.status,
                            requestType: row.requestType,
                            maintenanceIds: row.maintenanceIds ?? [],
                            incidentIds: row.incidentIds ?? [],
                            workOrderIds: row.workOrderIds ?? [],
                            createdAt: row.createdAt,
                            updatedAt: row.updatedAt,
                          },
                        });
                        const selected = row.id === selectedRequestId;
                        return (
                          <tr
                            key={row.id}
                            className={`cursor-pointer border-b border-[var(--sc-border)] ${
                              selected ? "bg-[var(--sc-surface)]" : ""
                            }`}
                            onClick={() => setSelectedRequestId(row.id)}
                          >
                            <td className="px-3 py-2 font-mono text-xs">
                              {lens.reference}
                            </td>
                            <td className="px-3 py-2">{lens.title}</td>
                            <td className="px-3 py-2">
                              {lens.status.replace(/_/g, " ")}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </StreamSurface>

            <IssueOperationalPanel view={view} loading={detailLoading && !view} />
          </div>
        )}
      </div>
    </ModeFrame>
  );
}
