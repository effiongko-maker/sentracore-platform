"use client";

import { Inbox } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModeFrame, StreamSurface } from "@/components/platform";
import { OperationalPageHeader } from "@/components/operational";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { useQueryRecordId } from "@/hooks/useQueryRecordId";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import {
  buildIssueOperationalView,
  composeIssueFromIncident,
  composeIssueFromMaintenance,
  composeOperationalViewFromTreatmentDetail,
  type Issue,
  type IssueOperationalView,
} from "@/lib/operational/issues";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { RequestService } from "@/services/requests/RequestService";
import { getRequestTreatmentDetail } from "@/modules/requests/actions/treatRequest";
import {
  onIncidentMutation,
  onMaintenanceMutation,
} from "@/services/cache/domainCache";
import type { LogIssueResult } from "../actions/logIssue";
import {
  buildUnifiedIssueList,
  originLabel,
  type UnifiedIssueListItem,
} from "../lib/buildUnifiedIssueList";
import { IssueOperationalPanel } from "./IssueOperationalPanel";
import { LogIssueModal } from "./LogIssueModal";

/** Issues list page size — presentation only. */
export const ISSUES_PAGE_SIZE = 10;

function matchesOpenId(issue: Issue, openId: string | null): boolean {
  if (!openId) return false;
  return (
    issue.id === openId ||
    issue.reference === openId ||
    issue.relatedRequestId === openId ||
    issue.rootMaintenanceId === openId ||
    issue.rootIncidentId === openId ||
    issue.id === `issue:request:${openId}` ||
    issue.id === `issue:maintenance:${openId}` ||
    issue.id === `issue:incident:${openId}`
  );
}

function pageNumbers(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, current]);
  for (const n of [current - 1, current + 1]) {
    if (n >= 1 && n <= totalPages) pages.add(n);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]!;
    if (i > 0 && n - sorted[i - 1]! > 1) out.push("…");
    out.push(n);
  }
  return out;
}

/**
 * Unified Issue operational lens (Phase 8).
 * Request-backed + FM-rooted Issues (Maintenance / Incident). No Issue sheet.
 */
export function IssuesPage() {
  const openId = useQueryRecordId();
  const { can } = useOperatingAccess();
  const canCreateOps = can("ops.create");
  const canMutateOps = can("ops.edit");
  const [items, setItems] = useState<UnifiedIssueListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [view, setView] = useState<IssueOperationalView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [page, setPage] = useState(1);
  /** After FM Log Issue, use the server-returned view — skip redundant root getById. */
  const skipRootFetchForIdRef = useRef<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [requests, maintenances, incidents] = await Promise.all([
        RequestService.listRequests({ page: 1, pageSize: 100, status: "all" }),
        MaintenanceService.listMaintenance({
          page: 1,
          pageSize: 100,
          status: "all",
        }),
        IncidentService.listIncidents({
          page: 1,
          pageSize: 100,
          status: "all",
        }),
      ]);
      const next = buildUnifiedIssueList({
        requests: requests.data,
        maintenances: maintenances.data,
        incidents: incidents.data,
      });
      setItems(next);
      setError(null);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Issues");
      return [] as UnifiedIssueListItem[];
    } finally {
      setLoading(false);
    }
  }, []);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / ISSUES_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * ISSUES_PAGE_SIZE;
    return items.slice(start, start + ISSUES_PAGE_SIZE);
  }, [items, safePage]);

  const rangeLabel = useMemo(() => {
    if (total === 0) return "Showing 0 of 0 issues";
    const from = (safePage - 1) * ISSUES_PAGE_SIZE + 1;
    const to = Math.min(safePage * ISSUES_PAGE_SIZE, total);
    return `Showing ${from}–${to} of ${total} issues`;
  }, [safePage, total]);

  const showPagination = total > ISSUES_PAGE_SIZE;

  useEffect(() => {
    let cancelled = false;
    void reload().then((next) => {
      if (cancelled) return;
      const fromQueryIndex = next.findIndex((row) =>
        matchesOpenId(row.issue, openId)
      );
      if (fromQueryIndex >= 0) {
        setSelectedIssueId(next[fromQueryIndex]!.issue.id);
        setPage(Math.floor(fromQueryIndex / ISSUES_PAGE_SIZE) + 1);
      } else {
        setSelectedIssueId(next[0]?.issue.id ?? null);
        setPage(1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [openId, reload]);

  useEffect(() => {
    if (!selectedIssueId) {
      setView(null);
      return;
    }
    const listItem = items.find((row) => row.issue.id === selectedIssueId);
    if (!listItem) {
      setView(null);
      return;
    }

    let cancelled = false;
    setView(listItem.view);
    setDetailLoading(true);

    const issue = listItem.issue;

    if (skipRootFetchForIdRef.current === issue.id) {
      skipRootFetchForIdRef.current = null;
      setDetailLoading(false);
      return;
    }

    async function loadDetail() {
      try {
        if (issue.relatedRequestId && issue.id.startsWith("issue:request:")) {
          const result = await getRequestTreatmentDetail({
            requestId: issue.relatedRequestId,
          });
          if (cancelled) return;
          if (result.success && result.data) {
            setView(composeOperationalViewFromTreatmentDetail(result.data));
          }
          return;
        }

        if (issue.rootMaintenanceId) {
          const maintenance = await MaintenanceService.getMaintenance(
            issue.rootMaintenanceId
          );
          if (cancelled || !maintenance) return;
          setView(
            buildIssueOperationalView(
              composeIssueFromMaintenance({
                maintenance: {
                  id: maintenance.id,
                  title: maintenance.title,
                  description: maintenance.description,
                  facilityId: maintenance.facilityId,
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
              })
            )
          );
          return;
        }

        if (issue.rootIncidentId) {
          const incident = await IncidentService.getIncident(
            issue.rootIncidentId
          );
          if (cancelled || !incident) return;
          setView(
            buildIssueOperationalView(
              composeIssueFromIncident({
                incident: {
                  id: incident.id,
                  title: incident.title,
                  description: incident.description,
                  facilityId: incident.facilityId,
                  locationDetail: incident.locationDetail,
                  status: incident.status,
                  type: incident.type,
                  severity: incident.severity,
                  assetId: incident.assetId,
                  resolvedAt: incident.resolvedAt,
                  resolutionNotes: incident.resolutionNotes,
                  workOrderId: incident.workOrderId,
                  workOrderIds: incident.workOrderIds,
                  maintenanceIds: incident.maintenanceIds,
                  sourceRequestId: incident.sourceRequestId,
                  createdAt: incident.createdAt,
                  updatedAt: incident.updatedAt,
                  reportedByUserId: incident.reportedByUserId,
                },
              })
            )
          );
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedIssueId, items]);

  function handleLogged(result: LogIssueResult) {
    // Invalidate peer-module caches without forcing a full Issues triple-fetch.
    if (result.rootKind === "work" || result.rootKind === "maintenance") {
      onMaintenanceMutation();
    } else {
      onIncidentMutation();
    }

    skipRootFetchForIdRef.current = result.issueId;
    setView(result.view);
    setSelectedIssueId(result.issueId);
    setPage(1);

    // Server already returned the composed Issue — insert locally.
    setItems((prev) => {
      if (prev.some((p) => p.issue.id === result.issueId)) {
        return prev.map((row) =>
          row.issue.id === result.issueId
            ? { issue: result.view.issue, view: result.view }
            : row
        );
      }
      const next = [
        { issue: result.view.issue, view: result.view },
        ...prev,
      ];
      next.sort(
        (a, b) =>
          Date.parse(b.issue.updatedAt) - Date.parse(a.issue.updatedAt) ||
          a.issue.id.localeCompare(b.issue.id)
      );
      return next;
    });
  }

  return (
    <ModeFrame mode="act">
      <div className="op-page">
        <OperationalPageHeader
          title="Issues"
          description="Manage what needs attention at the facility. Log an Issue, treat it, and follow the outcome."
          countValue={items.length}
          countLabel="In view"
          loading={loading}
          actionLabel={canCreateOps ? "Log Issue" : undefined}
          onAction={canCreateOps ? () => setLogOpen(true) : undefined}
        />

        {error ? (
          <EmptyState
            icon={Inbox}
            title="Couldn’t load Issues"
            description={error}
            actionLabel="Retry"
            onAction={() => void reload()}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)]">
            <StreamSurface>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--sc-border)] text-[var(--sc-muted)]">
                      <th className="px-3 py-2 font-medium">Reference</th>
                      <th className="px-3 py-2 font-medium">What needs attention</th>
                      <th className="px-3 py-2 font-medium">Origin</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-[var(--sc-muted)]"
                        >
                          Loading…
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-[var(--sc-muted)]"
                        >
                          No Issues yet. Log something that needs attention, or
                          wait for a staff request.
                        </td>
                      </tr>
                    ) : (
                      pageItems.map(({ issue }) => {
                        const selected = issue.id === selectedIssueId;
                        return (
                          <tr
                            key={issue.id}
                            className={`cursor-pointer border-b border-[var(--sc-border)] ${
                              selected ? "bg-[var(--sc-surface)]" : ""
                            }`}
                            onClick={() => setSelectedIssueId(issue.id)}
                          >
                            <td className="px-3 py-2 font-mono text-xs">
                              {issue.reference}
                            </td>
                            <td className="px-3 py-2">{issue.title}</td>
                            <td className="px-3 py-2 text-[var(--sc-muted)]">
                              {originLabel(issue)}
                            </td>
                            <td className="px-3 py-2">
                              {issue.status.replace(/_/g, " ")}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {!loading && total > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sc-border)] px-3 py-2.5">
                  <p className="text-xs text-[var(--sc-muted)]">{rangeLabel}</p>
                  {showPagination ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={safePage <= 1}
                        onClick={() => setPage(safePage - 1)}
                      >
                        Previous
                      </Button>
                      {pageNumbers(safePage, totalPages).map((entry, idx) =>
                        entry === "…" ? (
                          <span
                            key={`ellipsis-${idx}`}
                            className="px-1.5 text-xs text-[var(--sc-muted)]"
                          >
                            …
                          </span>
                        ) : (
                          <Button
                            key={entry}
                            type="button"
                            variant={entry === safePage ? "primary" : "outline"}
                            size="sm"
                            aria-current={
                              entry === safePage ? "page" : undefined
                            }
                            onClick={() => setPage(entry)}
                          >
                            {entry}
                          </Button>
                        )
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage(safePage + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </StreamSurface>

            <IssueOperationalPanel
              view={view}
              loading={detailLoading && !view}
              canCreate={canCreateOps}
              canMutate={canMutateOps}
            />
          </div>
        )}
      </div>

      <LogIssueModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onCreated={handleLogged}
      />
    </ModeFrame>
  );
}
