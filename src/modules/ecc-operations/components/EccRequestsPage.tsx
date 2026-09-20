"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperateHeader } from "@/components/platform";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { EccOperationsService } from "../services/EccOperationsService";
import type {
  EccIssue,
  EccPriority,
  EccRequest,
  EccRequestHistoryEntry,
  EccRequestOrigin,
  EccRequestResponsibility,
  EccRequestStatus,
} from "../types";
import {
  ECC_PRIORITY_LABELS,
  ECC_REQUEST_ORIGIN_LABELS,
  ECC_REQUEST_RESPONSIBILITY_LABELS,
  ECC_REQUEST_STATUS_LABELS,
  ECC_REQUEST_TRANSITIONS,
} from "../constants";
import { DEFAULT_ECC_CENTRE } from "../types";
import {
  applyEccRequestFilters,
  ECC_REQUEST_FILTER_DEFAULTS,
  eccRequestFiltersAreActive,
  type EccRequestFilterState,
} from "../registerFilters";
import {
  EccRequestLifecycleRail,
  EccStatusPill,
  formatEccWhen,
} from "./eccUi";
import { EccEntityAuditTrail } from "./EccAuditTrail";

type RequestPanel = "register" | "detail" | "treat";

function historyHeadline(entry: EccRequestHistoryEntry): string {
  if (entry.kind === "action") return entry.note?.trim() || "Action logged";
  if (entry.kind === "resolution") return "Request resolved";
  if (entry.kind === "closure") return "Request closed";
  if (entry.kind === "note") return entry.note?.trim() || "Note added";
  if (entry.fromStatus == null && entry.toStatus === "submitted") {
    return "Request submitted";
  }
  if (entry.toStatus === "cancelled") return "Request cancelled";
  if (entry.toStatus) {
    return `Moved to ${ECC_REQUEST_STATUS_LABELS[entry.toStatus]}`;
  }
  return "Status updated";
}

function requestStatusTone(
  status: EccRequestStatus
): "operational" | "issue" | "disrupted" | "normal" {
  if (status === "resolved" || status === "closed") return "operational";
  if (status === "cancelled") return "disrupted";
  if (
    status === "with_relationship_manager" ||
    status === "with_downstream"
  ) {
    return "issue";
  }
  if (status === "in_follow_up") return "issue";
  return "normal";
}

export function EccRequestsPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("id");
  const [requests, setRequests] = useState<EccRequest[]>([]);
  const [issues, setIssues] = useState<EccIssue[]>([]);
  const [filters, setFilters] = useState<EccRequestFilterState>(
    ECC_REQUEST_FILTER_DEFAULTS
  );
  // "Assigned to me" matches the authenticated user's display name — never a typed identity.
  const { access: eccAccess } = useOperatingAccess();
  const actingAs = eccAccess?.name ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<RequestPanel>("register");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkIssueId, setLinkIssueId] = useState("");
  const [form, setForm] = useState({
    title: "",
    reason: "",
    description: "",
    origin: "operational" as EccRequestOrigin,
    responsibility: "company" as EccRequestResponsibility,
    priority: "medium" as EccPriority,
    requestingManagerName: "",
    currentOwnerName: "",
    evidenceNotes: "",
  });
  const [treat, setTreat] = useState({
    toStatus: "" as EccRequestStatus | "",
    byName: "",
    actionNote: "",
    currentOwnerName: "",
    resolutionNotes: "",
  });

  async function reload() {
    const [requestList, issueList] = await Promise.all([
      EccOperationsService.listRequests(),
      EccOperationsService.listIssues(),
    ]);
    setRequests(requestList);
    setIssues(issueList);
  }

  useEffect(() => {
    void reload()
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Unable to load requests."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!focusId || requests.length === 0) return;
    const focused = requests.find((row) => row.id === focusId);
    if (!focused) return;
    setSelectedId(focusId);
    setPanel("detail");
    setFilters((prev) => ({ ...prev, status: "all" }));
  }, [focusId, requests]);

  const visible = useMemo(
    () => applyEccRequestFilters(requests, filters, actingAs),
    [requests, filters, actingAs]
  );

  const filtersActive = eccRequestFiltersAreActive(filters);
  const selected = requests.find((row) => row.id === selectedId) ?? null;
  const nextStatuses = selected
    ? ECC_REQUEST_TRANSITIONS[selected.status]
    : [];
  const linkableIssues = issues.filter(
    (row) =>
      row.status !== "closed" && row.id !== selected?.relatedEccIssueId
  );
  const canTreat =
    selected != null &&
    selected.status !== "closed" &&
    selected.status !== "cancelled";

  function openDetail(id: string) {
    setSelectedId(id);
    setPanel("detail");
    setError(null);
  }

  function openTreat(id: string) {
    const request = requests.find((row) => row.id === id);
    if (
      !request ||
      request.status === "closed" ||
      request.status === "cancelled"
    ) {
      return;
    }
    setSelectedId(id);
    setPanel("treat");
    setError(null);
    setTreat({
      toStatus: "",
      byName:
        actingAs ||
        request.currentOwnerName ||
        request.requestingManagerName ||
        "",
      actionNote: "",
      currentOwnerName: request.currentOwnerName || "",
      resolutionNotes: "",
    });
  }

  function backToRegister() {
    setPanel("register");
    setSelectedId(null);
    setError(null);
  }

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await EccOperationsService.createRequest({
        title: form.title,
        reason: form.reason,
        description: form.description,
        origin: form.origin,
        responsibility: form.responsibility,
        priority: form.priority,
        requestingManagerName: form.requestingManagerName,
        currentOwnerName: form.currentOwnerName || undefined,
        evidenceNotes: form.evidenceNotes || undefined,
      });
      setForm({
        title: "",
        reason: "",
        description: "",
        origin: "operational",
        responsibility: "company",
        priority: "medium",
        requestingManagerName: "",
        currentOwnerName: "",
        evidenceNotes: "",
      });
      setShowCreate(false);
      await reload();
      openDetail(created.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to create request.");
    } finally {
      setSaving(false);
    }
  }

  async function onTreat(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!treat.toStatus && !treat.actionNote.trim()) {
      setError("Choose a next step or record an action note.");
      return;
    }
    if (
      (treat.toStatus === "resolved" || treat.toStatus === "closed") &&
      !treat.resolutionNotes.trim() &&
      !selected.resolutionNotes?.trim()
    ) {
      setError("Resolution notes are required to resolve or close a request.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (treat.toStatus) {
        await EccOperationsService.transitionRequest({
          id: selected.id,
          toStatus: treat.toStatus,
          byName: treat.byName,
          note: treat.actionNote || undefined,
          currentOwnerName: treat.currentOwnerName || undefined,
          resolutionNotes: treat.resolutionNotes || undefined,
        });
      } else {
        await EccOperationsService.appendRequestAction({
          id: selected.id,
          byName: treat.byName,
          note: treat.actionNote,
          currentOwnerName: treat.currentOwnerName || undefined,
        });
      }
      await reload();
      setPanel("detail");
      setTreat({
        toStatus: "",
        byName: treat.byName,
        actionNote: "",
        currentOwnerName: "",
        resolutionNotes: "",
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to update request.");
    } finally {
      setSaving(false);
    }
  }

  async function onLinkIssue(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !linkIssueId) return;
    setSaving(true);
    setError(null);
    try {
      await EccOperationsService.linkIssueAndRequest({
        issueId: linkIssueId,
        requestId: selected.id,
        byName: actingAs || selected.requestingManagerName || "Manager",
      });
      setLinkIssueId("");
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to link issue.");
    } finally {
      setSaving(false);
    }
  }

  const filterBar = (
    <div className="ecc-filter-bar" aria-label="Request filters">
      <div className="ecc-filter-fields">
        <div className="ecc-filter-field">
          <label htmlFor="ecc-req-f-status">Status</label>
          <select
            id="ecc-req-f-status"
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value as EccRequestFilterState["status"],
              }))
            }
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-req-f-pri">Priority</label>
          <select
            id="ecc-req-f-pri"
            value={filters.priority}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                priority: e.target.value as EccRequestFilterState["priority"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="urgent_high">Urgent / high</option>
            {(Object.keys(ECC_PRIORITY_LABELS) as EccPriority[]).map(
              (priority) => (
                <option key={priority} value={priority}>
                  {ECC_PRIORITY_LABELS[priority]}
                </option>
              )
            )}
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-req-f-assign">Assignment</label>
          <select
            id="ecc-req-f-assign"
            value={filters.assignment}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                assignment: e.target
                  .value as EccRequestFilterState["assignment"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-req-f-hand">Hand-off</label>
          <select
            id="ecc-req-f-hand"
            value={filters.handoff}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                handoff: e.target.value as EccRequestFilterState["handoff"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="with_rm">With RM / downstream</option>
            <option value="not_with_rm">Not with RM</option>
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-req-f-wait">Waiting on</label>
          <select
            id="ecc-req-f-wait"
            value={filters.waiting}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                waiting: e.target.value as EccRequestFilterState["waiting"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="someone_else">Someone else</option>
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-req-f-origin">Classification</label>
          <select
            id="ecc-req-f-origin"
            value={filters.origin}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                origin: e.target.value as EccRequestFilterState["origin"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="operational">
              {ECC_REQUEST_ORIGIN_LABELS.operational}
            </option>
            <option value="technical">
              {ECC_REQUEST_ORIGIN_LABELS.technical}
            </option>
          </select>
        </div>
      </div>
      <div className="ecc-filter-bar-meta">
        <span className="ecc-muted">
          {visible.length} request{visible.length === 1 ? "" : "s"}
          {filtersActive ? " · filters active" : ""}
        </span>
        {filtersActive ? (
          <button
            type="button"
            className="ecc-link ecc-filter-clear"
            onClick={() => setFilters(ECC_REQUEST_FILTER_DEFAULTS)}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="ecc-register ecc-requests">
      <OperateHeader
        title="Requests"
        description="ECC request register. Track hand-offs from manager to relationship manager and downstream — scan the register, then view or treat a request deliberately."
        signalValue={visible.length}
        signalLabel="in view"
        actions={
          panel === "register" ? (
            <button
              type="button"
              className="ecc-btn ecc-btn-primary"
              onClick={() => setShowCreate((value) => !value)}
            >
              {showCreate ? "Close" : "New request"}
            </button>
          ) : (
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={backToRegister}
            >
              Back to register
            </button>
          )
        }
      />

      {error ? <p className="ecc-empty">{error}</p> : null}

      {loading ? <p className="ecc-empty">Loading requests…</p> : null}

      {panel === "register" ? (
        <>
          {filterBar}

          {showCreate ? (
            <form className="ecc-submit-form ecc-form" onSubmit={onCreate}>
              <h3 className="ecc-form-block-title">New request</h3>
              <p className="ecc-form-hint">
                Centre: {DEFAULT_ECC_CENTRE.name}. Date/time is recorded on
                submit. Responsibility is tracked, not auto-approved.
              </p>
              <div className="ecc-form-grid">
                <div className="ecc-field">
                  <label htmlFor="ecc-req-class">Classification</label>
                  <select
                    id="ecc-req-class"
                    value={form.origin}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        origin: e.target.value as EccRequestOrigin,
                      }))
                    }
                  >
                    <option value="operational">Operational</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
                <div className="ecc-field">
                  <label htmlFor="ecc-req-resp">Responsibility</label>
                  <select
                    id="ecc-req-resp"
                    value={form.responsibility}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        responsibility: e.target
                          .value as EccRequestResponsibility,
                      }))
                    }
                  >
                    <option value="company">Company / PayChex</option>
                    <option value="client">Client / NCC</option>
                  </select>
                </div>
                <div className="ecc-field">
                  <label htmlFor="ecc-req-pri">Priority</label>
                  <select
                    id="ecc-req-pri"
                    value={form.priority}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        priority: e.target.value as EccPriority,
                      }))
                    }
                  >
                    {(Object.keys(ECC_PRIORITY_LABELS) as EccPriority[]).map(
                      (priority) => (
                        <option key={priority} value={priority}>
                          {ECC_PRIORITY_LABELS[priority]}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-req-title">Request</label>
                <input
                  id="ecc-req-title"
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-req-reason">Reason</label>
                <textarea
                  id="ecc-req-reason"
                  required
                  value={form.reason}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, reason: e.target.value }))
                  }
                />
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-req-desc">Details</label>
                <textarea
                  id="ecc-req-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="ecc-form-grid">
                <div className="ecc-field">
                  <label htmlFor="ecc-req-owner">Current owner (optional)</label>
                  <input
                    id="ecc-req-owner"
                    value={form.currentOwnerName}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        currentOwnerName: e.target.value,
                      }))
                    }
                    placeholder="Often Relationship Manager next"
                  />
                </div>
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-req-ev">Supporting evidence</label>
                <textarea
                  id="ecc-req-ev"
                  value={form.evidenceNotes}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      evidenceNotes: e.target.value,
                    }))
                  }
                  placeholder="References or notes. File attachments deferred."
                />
              </div>
              <button
                type="submit"
                className="ecc-btn ecc-btn-primary"
                disabled={saving}
              >
                {saving ? "Saving…" : "Submit request"}
              </button>
            </form>
          ) : null}

          {loading ? null : visible.length === 0 ? (
            <div className="ecc-reg-empty">
              <p className="ecc-reg-empty-title">No requests in this view</p>
              <p className="ecc-reg-empty-copy">
                Adjust your filters or submit a new request.
              </p>
              <div className="ecc-actions">
                {filtersActive ? (
                  <button
                    type="button"
                    className="ecc-btn ecc-btn-secondary"
                    onClick={() => setFilters(ECC_REQUEST_FILTER_DEFAULTS)}
                  >
                    Clear filters
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ecc-btn ecc-btn-primary"
                  onClick={() => setShowCreate(true)}
                >
                  New request
                </button>
              </div>
            </div>
          ) : (
            <div className="ecc-reg-table-wrap">
              <table className="ecc-reg-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Classification</th>
                    <th>Responsibility</th>
                    <th>Owner</th>
                    <th>Manager</th>
                    <th>Submitted</th>
                    <th className="ecc-reg-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const treatable =
                      row.status !== "closed" && row.status !== "cancelled";
                    return (
                      <tr key={row.id}>
                        <td>
                          <p className="ecc-reg-title">{row.title}</p>
                          <p className="ecc-reg-sub">{row.id}</p>
                        </td>
                        <td>
                          <EccStatusPill
                            status={requestStatusTone(row.status)}
                            label={ECC_REQUEST_STATUS_LABELS[row.status]}
                            withDot
                          />
                        </td>
                        <td>
                          <span
                            className={
                              row.priority === "urgent" ||
                              row.priority === "high"
                                ? "ecc-pill ecc-pill--attention"
                                : "ecc-pill"
                            }
                          >
                            {ECC_PRIORITY_LABELS[row.priority]}
                          </span>
                        </td>
                        <td className="ecc-reg-cell-muted">
                          {ECC_REQUEST_ORIGIN_LABELS[row.origin]}
                        </td>
                        <td className="ecc-reg-cell-muted">
                          {
                            ECC_REQUEST_RESPONSIBILITY_LABELS[
                              row.responsibility
                            ]
                          }
                        </td>
                        <td className="ecc-reg-cell-muted">
                          {row.currentOwnerName?.trim() || "Not assigned"}
                        </td>
                        <td className="ecc-reg-cell-muted">
                          {row.requestingManagerName}
                        </td>
                        <td className="ecc-reg-cell-muted">
                          {formatEccWhen(row.createdAt)}
                        </td>
                        <td className="ecc-reg-actions">
                          <select
                            className="ecc-reg-action-select"
                            aria-label={`Actions for ${row.title}`}
                            defaultValue=""
                            onChange={(e) => {
                              const value = e.target.value;
                              e.target.value = "";
                              if (value === "view") openDetail(row.id);
                              if (value === "treat") openTreat(row.id);
                            }}
                          >
                            <option value="" disabled>
                              Actions
                            </option>
                            <option value="view">View</option>
                            {treatable ? (
                              <option value="treat">Treat</option>
                            ) : null}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {panel === "detail" && selected ? (
        <section className="ecc-reg-panel" aria-label="Request details">
          <header className="ecc-reg-panel-head">
            <div>
              <p className="ecc-ov-eyebrow">Request details</p>
              <h2 className="ecc-reg-panel-title">{selected.title}</h2>
              <p className="ecc-reg-panel-sub">
                {ECC_REQUEST_ORIGIN_LABELS[selected.origin]}
                {" · "}
                {ECC_PRIORITY_LABELS[selected.priority]}
                {" · "}
                {ECC_REQUEST_STATUS_LABELS[selected.status]}
              </p>
            </div>
            <div className="ecc-actions">
              {canTreat ? (
                <button
                  type="button"
                  className="ecc-btn ecc-btn-primary"
                  onClick={() => openTreat(selected.id)}
                >
                  Treat
                </button>
              ) : null}
            </div>
          </header>

          <dl className="ecc-snap-meta">
            <div className="ecc-snap-meta-item">
              <dt>Classification</dt>
              <dd>{ECC_REQUEST_ORIGIN_LABELS[selected.origin]}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Priority</dt>
              <dd>{ECC_PRIORITY_LABELS[selected.priority]}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Status</dt>
              <dd>{ECC_REQUEST_STATUS_LABELS[selected.status]}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Submitted</dt>
              <dd>{formatEccWhen(selected.createdAt)}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Requesting manager</dt>
              <dd>{selected.requestingManagerName}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Owner</dt>
              <dd>{selected.currentOwnerName || "Not assigned"}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Responsibility</dt>
              <dd>
                {
                  ECC_REQUEST_RESPONSIBILITY_LABELS[
                    selected.responsibility
                  ]
                }
              </dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Centre</dt>
              <dd>{DEFAULT_ECC_CENTRE.name}</dd>
            </div>
          </dl>

          <div className="ecc-reg-panel-block">
            <h3 className="ecc-reg-panel-label">Reason</h3>
            <p className="ecc-prose">{selected.reason}</p>
          </div>

          {selected.description ? (
            <div className="ecc-reg-panel-block">
              <h3 className="ecc-reg-panel-label">Details</h3>
              <p className="ecc-prose">{selected.description}</p>
            </div>
          ) : null}

          {selected.evidenceNotes ? (
            <div className="ecc-reg-panel-block">
              <h3 className="ecc-reg-panel-label">Supporting evidence</h3>
              <p className="ecc-prose">{selected.evidenceNotes}</p>
            </div>
          ) : null}

          {selected.resolutionNotes ? (
            <div className="ecc-reg-panel-block">
              <h3 className="ecc-reg-panel-label">Resolution</h3>
              <p className="ecc-prose">{selected.resolutionNotes}</p>
            </div>
          ) : null}

          <div className="ecc-reg-panel-block">
            <h3 className="ecc-reg-panel-label">Lifecycle</h3>
            <EccRequestLifecycleRail status={selected.status} />
          </div>

          {selected.sourceDailyOpsId ? (
            <p className="ecc-muted">
              Raised from Daily Ops{" "}
              <Link href="/ecc-operations/daily-ops" className="ecc-link">
                {selected.sourceDailyOpsId}
              </Link>
            </p>
          ) : null}

          {selected.relatedEccIssueId ? (
            <p className="ecc-muted">
              Linked issue{" "}
              <Link
                href={`/ecc-operations/issues?id=${encodeURIComponent(selected.relatedEccIssueId)}`}
                className="ecc-link"
              >
                {selected.relatedEccIssueId}
              </Link>
            </p>
          ) : null}

          <div className="ecc-reg-panel-block">
            <h3 className="ecc-reg-panel-label">Activity / audit history</h3>
            <ol className="ecc-reg-timeline">
              {[...selected.history].reverse().map((entry) => (
                <li key={entry.id} className="ecc-reg-timeline-item">
                  <p className="ecc-reg-timeline-when">
                    {formatEccWhen(entry.at)}
                  </p>
                  <p className="ecc-reg-timeline-who">{entry.byName}</p>
                  <p className="ecc-reg-timeline-what">
                    {historyHeadline(entry)}
                  </p>
                  {entry.note && entry.kind !== "action" ? (
                    <p className="ecc-reg-timeline-note">{entry.note}</p>
                  ) : null}
                  {entry.fromStatus &&
                  entry.toStatus &&
                  entry.fromStatus !== entry.toStatus ? (
                    <p className="ecc-muted">
                      {ECC_REQUEST_STATUS_LABELS[entry.fromStatus]} →{" "}
                      {ECC_REQUEST_STATUS_LABELS[entry.toStatus]}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <EccEntityAuditTrail
              entityType="request"
              entityId={selected.id}
              title="Accountability"
            />
          </div>
        </section>
      ) : null}

      {panel === "treat" && selected ? (
        <section className="ecc-reg-panel" aria-label="Treat request">
          <header className="ecc-reg-panel-head">
            <div>
              <p className="ecc-ov-eyebrow">Treat / manage request</p>
              <h2 className="ecc-reg-panel-title">{selected.title}</h2>
              <p className="ecc-reg-panel-sub">
                Record what was done, assign ownership, and advance the request
                flow using the available next steps.
              </p>
            </div>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={() => openDetail(selected.id)}
            >
              View details
            </button>
          </header>

          <div className="ecc-reg-treat-summary">
            <div>
              <p className="ecc-reg-panel-label">Current state</p>
              <p className="ecc-reg-treat-value">
                {ECC_REQUEST_STATUS_LABELS[selected.status]}
              </p>
            </div>
            <div>
              <p className="ecc-reg-panel-label">Current owner</p>
              <p className="ecc-reg-treat-value">
                {selected.currentOwnerName || "Not assigned"}
              </p>
            </div>
            <div>
              <p className="ecc-reg-panel-label">Available next steps</p>
              <p className="ecc-reg-treat-value">
                {nextStatuses.length > 0
                  ? nextStatuses
                      .map((status) => ECC_REQUEST_STATUS_LABELS[status])
                      .join(", ")
                  : "None — request is closed or cancelled"}
              </p>
            </div>
          </div>

          <div className="ecc-reg-panel-block">
            <EccRequestLifecycleRail status={selected.status} />
          </div>

          <form className="ecc-submit-form ecc-form" onSubmit={onTreat}>
            <div className="ecc-form-block">
              <h3 className="ecc-form-block-title">Next step</h3>
              <p className="ecc-form-hint">
                Choose an allowed flow transition, or leave blank to log an
                action without changing status.
              </p>
              <div className="ecc-field">
                <label htmlFor="ecc-req-next">Advance to</label>
                <select
                  id="ecc-req-next"
                  value={treat.toStatus}
                  onChange={(e) =>
                    setTreat((prev) => ({
                      ...prev,
                      toStatus: e.target.value as EccRequestStatus | "",
                    }))
                  }
                  disabled={nextStatuses.length === 0}
                >
                  <option value="">Stay in current state</option>
                  {nextStatuses.map((status) => (
                    <option key={status} value={status}>
                      {ECC_REQUEST_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ecc-form-block">
              <h3 className="ecc-form-block-title">Action</h3>
              <div className="ecc-field">
                <label htmlFor="ecc-req-treat-action">
                  What has been done / is being done
                </label>
                <textarea
                  id="ecc-req-treat-action"
                  value={treat.actionNote}
                  onChange={(e) =>
                    setTreat((prev) => ({
                      ...prev,
                      actionNote: e.target.value,
                    }))
                  }
                  placeholder="Describe the hand-off or follow-up action"
                />
              </div>
            </div>

            <div className="ecc-form-block">
              <h3 className="ecc-form-block-title">Owner</h3>
              <div className="ecc-form-grid">
                <div className="ecc-field">
                  <label htmlFor="ecc-req-treat-owner">
                    Who is responsible
                  </label>
                  <input
                    id="ecc-req-treat-owner"
                    value={treat.currentOwnerName}
                    onChange={(e) =>
                      setTreat((prev) => ({
                        ...prev,
                        currentOwnerName: e.target.value,
                      }))
                    }
                    placeholder={selected.currentOwnerName || "Assign owner"}
                  />
                </div>
              </div>
            </div>

            {treat.toStatus === "resolved" || treat.toStatus === "closed" ? (
              <div className="ecc-form-block">
                <h3 className="ecc-form-block-title">Note</h3>
                <div className="ecc-field">
                  <label htmlFor="ecc-req-treat-res">Resolution notes</label>
                  <textarea
                    id="ecc-req-treat-res"
                    required
                    value={treat.resolutionNotes}
                    onChange={(e) =>
                      setTreat((prev) => ({
                        ...prev,
                        resolutionNotes: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ) : null}

            <div className="ecc-actions">
              <button
                type="submit"
                className="ecc-btn ecc-btn-primary"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save update"}
              </button>
              <button
                type="button"
                className="ecc-btn ecc-btn-secondary"
                onClick={() => openDetail(selected.id)}
              >
                Cancel
              </button>
            </div>
          </form>

          {!selected.relatedEccIssueId && linkableIssues.length > 0 ? (
            <form
              className="ecc-submit-form ecc-form"
              style={{ marginTop: "1rem" }}
              onSubmit={onLinkIssue}
            >
              <h3 className="ecc-form-block-title">Link ECC issue</h3>
              <div className="ecc-field">
                <label htmlFor="ecc-req-link-iss">Issue</label>
                <select
                  id="ecc-req-link-iss"
                  value={linkIssueId}
                  onChange={(e) => setLinkIssueId(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {linkableIssues.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="ecc-btn ecc-btn-secondary"
                disabled={saving}
              >
                Link issue
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
