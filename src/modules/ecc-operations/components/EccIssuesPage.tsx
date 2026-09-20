"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperateHeader } from "@/components/platform";
import { useOperatingAccess } from "@/hooks/useOperatingAccess";
import { EccOperationsService } from "../services/EccOperationsService";
import type {
  EccIssue,
  EccIssueClassification,
  EccIssueHistoryEntry,
  EccIssueStatus,
  EccRequest,
  EccSeverity,
} from "../types";
import {
  ECC_DAILY_OPS_SECTION_LABELS,
  ECC_ISSUE_CLASSIFICATION_LABELS,
  ECC_ISSUE_STATUS_LABELS,
  ECC_ISSUE_TRANSITIONS,
  ECC_SEVERITY_LABELS,
} from "../constants";
import {
  applyEccIssueFilters,
  ECC_ISSUE_FILTER_DEFAULTS,
  eccIssueFiltersAreActive,
  type EccIssueFilterState,
} from "../registerFilters";
import {
  EccIssueLifecycleRail,
  EccStatusPill,
  formatEccWhen,
} from "./eccUi";
import { EccEntityAuditTrail } from "./EccAuditTrail";

type IssuePanel = "register" | "detail" | "treat" | "delete";

function historyHeadline(entry: EccIssueHistoryEntry): string {
  if (entry.kind === "action") return entry.note?.trim() || "Action logged";
  if (entry.kind === "escalation") return "Issue escalated";
  if (entry.kind === "resolution") return "Issue resolved";
  if (entry.kind === "closure") return "Issue closed";
  if (entry.kind === "note") return entry.note?.trim() || "Note added";
  if (entry.fromStatus == null && entry.toStatus === "identified") {
    return "Issue identified";
  }
  if (entry.toStatus) {
    return `Moved to ${ECC_ISSUE_STATUS_LABELS[entry.toStatus]}`;
  }
  return "Status updated";
}

export function EccIssuesPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("id");
  const [issues, setIssues] = useState<EccIssue[]>([]);
  const [requests, setRequests] = useState<EccRequest[]>([]);
  const [filters, setFilters] = useState<EccIssueFilterState>(
    ECC_ISSUE_FILTER_DEFAULTS
  );
  // "Assigned to me" matches the authenticated user's display name — never a typed identity.
  const { access: eccAccess } = useOperatingAccess();
  const actingAs = eccAccess?.name ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<IssuePanel>("register");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [linkRequestId, setLinkRequestId] = useState("");
  const [form, setForm] = useState({
    classification: "operational" as EccIssueClassification,
    severity: "medium" as EccSeverity,
    title: "",
    description: "",
    reporterName: "",
    currentOwnerName: "",
  });
  const [treat, setTreat] = useState({
    toStatus: "" as EccIssueStatus | "",
    byName: "",
    actionNote: "",
    currentOwnerName: "",
    resolutionNotes: "",
  });
  const [saving, setSaving] = useState(false);

  async function reload() {
    const [issueList, requestList] = await Promise.all([
      EccOperationsService.listIssues(),
      EccOperationsService.listRequests(),
    ]);
    setIssues(issueList);
    setRequests(requestList);
  }

  useEffect(() => {
    void reload()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unable to load issues.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!focusId || issues.length === 0) return;
    const focused = issues.find((row) => row.id === focusId);
    if (!focused) return;
    setSelectedId(focusId);
    setPanel("detail");
    setFilters((prev) => ({ ...prev, status: "all" }));
  }, [focusId, issues]);

  const visible = useMemo(
    () => applyEccIssueFilters(issues, filters, actingAs),
    [issues, filters, actingAs]
  );

  const filtersActive = eccIssueFiltersAreActive(filters);
  const selected = issues.find((row) => row.id === selectedId) ?? null;
  const nextStatuses = selected
    ? ECC_ISSUE_TRANSITIONS[selected.status]
    : [];
  const linkableRequests = requests.filter(
    (row) =>
      row.status !== "closed" &&
      row.status !== "cancelled" &&
      row.id !== selected?.relatedEccRequestId
  );

  function openDetail(id: string) {
    setSelectedId(id);
    setPanel("detail");
    setError(null);
  }

  function openTreat(id: string) {
    const issue = issues.find((row) => row.id === id);
    setSelectedId(id);
    setPanel("treat");
    setError(null);
    setTreat({
      toStatus: "",
      byName: actingAs || issue?.currentOwnerName || issue?.reporterName || "",
      actionNote: "",
      currentOwnerName: issue?.currentOwnerName || "",
      resolutionNotes: "",
    });
  }

  function openDelete(id: string) {
    setSelectedId(id);
    setPanel("delete");
    setError(null);
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
      const created = await EccOperationsService.createIssue({
        classification: form.classification,
        severity: form.severity,
        title: form.title,
        description: form.description,
        reporterName: form.reporterName,
        currentOwnerName: form.currentOwnerName || undefined,
      });
      setForm({
        classification: "operational",
        severity: "medium",
        title: "",
        description: "",
        reporterName: "",
        currentOwnerName: "",
      });
      setShowCreate(false);
      await reload();
      openDetail(created.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to create issue.");
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
      setError("Resolution notes are required to resolve or close an issue.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (treat.toStatus) {
        await EccOperationsService.transitionIssue({
          id: selected.id,
          toStatus: treat.toStatus,
          byName: treat.byName,
          note: treat.actionNote || undefined,
          currentOwnerName: treat.currentOwnerName || undefined,
          resolutionNotes: treat.resolutionNotes || undefined,
        });
      } else {
        await EccOperationsService.appendIssueAction({
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
      setError(err instanceof Error ? err.message : "Unable to update issue.");
    } finally {
      setSaving(false);
    }
  }

  async function onLinkRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !linkRequestId) return;
    setSaving(true);
    setError(null);
    try {
      await EccOperationsService.linkIssueAndRequest({
        issueId: selected.id,
        requestId: linkRequestId,
        byName: actingAs || selected.reporterName || "Manager",
      });
      setLinkRequestId("");
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to link request.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteConfirm() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await EccOperationsService.deleteIssue(selected.id);
      await reload();
      backToRegister();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to delete issue.");
    } finally {
      setSaving(false);
    }
  }

  const filterBar = (
    <div className="ecc-filter-bar" aria-label="Issue filters">
      <div className="ecc-filter-fields">
        <div className="ecc-filter-field">
          <label htmlFor="ecc-iss-f-status">Status</label>
          <select
            id="ecc-iss-f-status"
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value as EccIssueFilterState["status"],
              }))
            }
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-iss-f-severity">Severity</label>
          <select
            id="ecc-iss-f-severity"
            value={filters.severity}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                severity: e.target.value as EccIssueFilterState["severity"],
              }))
            }
          >
            <option value="all">All</option>
            {(Object.keys(ECC_SEVERITY_LABELS) as EccSeverity[]).map(
              (severity) => (
                <option key={severity} value={severity}>
                  {ECC_SEVERITY_LABELS[severity]}
                </option>
              )
            )}
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-iss-f-assign">Assignment</label>
          <select
            id="ecc-iss-f-assign"
            value={filters.assignment}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                assignment: e.target.value as EccIssueFilterState["assignment"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-iss-f-esc">Escalation</label>
          <select
            id="ecc-iss-f-esc"
            value={filters.escalation}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                escalation: e.target
                  .value as EccIssueFilterState["escalation"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="escalated">Escalated</option>
            <option value="not_escalated">Not escalated</option>
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-iss-f-wait">Waiting on</label>
          <select
            id="ecc-iss-f-wait"
            value={filters.waiting}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                waiting: e.target.value as EccIssueFilterState["waiting"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="someone_else">Someone else</option>
          </select>
        </div>
        <div className="ecc-filter-field">
          <label htmlFor="ecc-iss-f-class">Classification</label>
          <select
            id="ecc-iss-f-class"
            value={filters.classification}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                classification: e.target
                  .value as EccIssueFilterState["classification"],
              }))
            }
          >
            <option value="all">All</option>
            <option value="operational">
              {ECC_ISSUE_CLASSIFICATION_LABELS.operational}
            </option>
            <option value="technical">
              {ECC_ISSUE_CLASSIFICATION_LABELS.technical}
            </option>
          </select>
        </div>
      </div>
      <div className="ecc-filter-bar-meta">
        <span className="ecc-muted">
          {visible.length} issue{visible.length === 1 ? "" : "s"}
          {filtersActive ? " · filters active" : ""}
        </span>
        {filtersActive ? (
          <button
            type="button"
            className="ecc-link ecc-filter-clear"
            onClick={() => setFilters(ECC_ISSUE_FILTER_DEFAULTS)}
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="ecc-register ecc-issues">
      <OperateHeader
        title="Issues"
        description="ECC problem register. Issues are tracked through their lifecycle — scan the register, then view details or treat an issue deliberately."
        signalValue={visible.length}
        signalLabel="in view"
        actions={
          panel === "register" ? (
            <button
              type="button"
              className="ecc-btn ecc-btn-primary"
              onClick={() => setShowCreate((value) => !value)}
            >
              {showCreate ? "Close" : "Record issue"}
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

      {loading ? <p className="ecc-empty">Loading issues…</p> : null}

      {panel === "register" ? (
        <>
          {filterBar}

          {showCreate ? (
            <form className="ecc-submit-form ecc-form" onSubmit={onCreate}>
              <h3 className="ecc-form-block-title">Record issue</h3>
              <div className="ecc-form-grid">
                <div className="ecc-field">
                  <label htmlFor="ecc-iss-class">Classification</label>
                  <select
                    id="ecc-iss-class"
                    value={form.classification}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        classification: e.target
                          .value as EccIssueClassification,
                      }))
                    }
                  >
                    <option value="operational">Operational</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
                <div className="ecc-field">
                  <label htmlFor="ecc-iss-sev">Severity</label>
                  <select
                    id="ecc-iss-sev"
                    value={form.severity}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        severity: e.target.value as EccSeverity,
                      }))
                    }
                  >
                    {(Object.keys(ECC_SEVERITY_LABELS) as EccSeverity[]).map(
                      (severity) => (
                        <option key={severity} value={severity}>
                          {ECC_SEVERITY_LABELS[severity]}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-iss-title">Title</label>
                <input
                  id="ecc-iss-title"
                  required
                  value={form.title}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-iss-desc">Description</label>
                <textarea
                  id="ecc-iss-desc"
                  required
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
                  <label htmlFor="ecc-iss-owner">Current owner (optional)</label>
                  <input
                    id="ecc-iss-owner"
                    value={form.currentOwnerName}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        currentOwnerName: e.target.value,
                      }))
                    }
                    placeholder="Agreed between managers"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="ecc-btn ecc-btn-primary"
                disabled={saving}
              >
                {saving ? "Saving…" : "Identify issue"}
              </button>
            </form>
          ) : null}

          {loading ? null : visible.length === 0 ? (
            <div className="ecc-reg-empty">
              <p className="ecc-reg-empty-title">No issues in this view</p>
              <p className="ecc-reg-empty-copy">
                Adjust your filters or record a new issue.
              </p>
              <div className="ecc-actions">
                {filtersActive ? (
                  <button
                    type="button"
                    className="ecc-btn ecc-btn-secondary"
                    onClick={() => setFilters(ECC_ISSUE_FILTER_DEFAULTS)}
                  >
                    Clear filters
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ecc-btn ecc-btn-primary"
                  onClick={() => setShowCreate(true)}
                >
                  Record issue
                </button>
              </div>
            </div>
          ) : (
            <div className="ecc-reg-table-wrap">
              <table className="ecc-reg-table">
                <thead>
                  <tr>
                    <th>Issue</th>
                    <th>Status</th>
                    <th>Severity</th>
                    <th>Classification</th>
                    <th>Owner</th>
                    <th>Reporter</th>
                    <th>Occurred</th>
                    <th className="ecc-reg-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <p className="ecc-reg-title">{row.title}</p>
                        <p className="ecc-reg-sub">{row.id}</p>
                      </td>
                      <td>
                        <EccStatusPill
                          status={
                            row.status === "escalated"
                              ? "disrupted"
                              : row.status === "resolved" ||
                                  row.status === "closed"
                                ? "operational"
                                : row.status === "in_treatment" ||
                                    row.status === "assessed"
                                  ? "issue"
                                  : "normal"
                          }
                          label={ECC_ISSUE_STATUS_LABELS[row.status]}
                          withDot
                        />
                      </td>
                      <td>
                        <span
                          className={
                            row.severity === "critical" ||
                            row.severity === "high"
                              ? "ecc-pill ecc-pill--attention"
                              : "ecc-pill"
                          }
                        >
                          {ECC_SEVERITY_LABELS[row.severity]}
                        </span>
                      </td>
                      <td className="ecc-reg-cell-muted">
                        {
                          ECC_ISSUE_CLASSIFICATION_LABELS[
                            row.classification
                          ]
                        }
                      </td>
                      <td className="ecc-reg-cell-muted">
                        {row.currentOwnerName?.trim() || "Not assigned"}
                      </td>
                      <td className="ecc-reg-cell-muted">
                        {row.reporterName}
                      </td>
                      <td className="ecc-reg-cell-muted">
                        {formatEccWhen(row.occurredAt)}
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
                            if (value === "delete") openDelete(row.id);
                          }}
                        >
                          <option value="" disabled>
                            Actions
                          </option>
                          <option value="view">View</option>
                          {row.status !== "closed" ? (
                            <option value="treat">Treat</option>
                          ) : null}
                          <option value="delete">Delete</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {panel === "detail" && selected ? (
        <section className="ecc-iss-panel" aria-label="Issue details">
          <header className="ecc-iss-panel-head">
            <div>
              <p className="ecc-ov-eyebrow">Issue details</p>
              <h2 className="ecc-iss-panel-title">{selected.title}</h2>
              <p className="ecc-iss-panel-sub">
                {ECC_ISSUE_CLASSIFICATION_LABELS[selected.classification]}
                {" · "}
                {ECC_SEVERITY_LABELS[selected.severity]}
                {" · "}
                {ECC_ISSUE_STATUS_LABELS[selected.status]}
              </p>
            </div>
            <div className="ecc-actions">
              {selected.status !== "closed" ? (
                <button
                  type="button"
                  className="ecc-btn ecc-btn-primary"
                  onClick={() => openTreat(selected.id)}
                >
                  Treat
                </button>
              ) : null}
              <button
                type="button"
                className="ecc-btn ecc-btn-danger"
                onClick={() => openDelete(selected.id)}
              >
                Delete
              </button>
            </div>
          </header>

          <dl className="ecc-snap-meta">
            <div className="ecc-snap-meta-item">
              <dt>Classification</dt>
              <dd>
                {ECC_ISSUE_CLASSIFICATION_LABELS[selected.classification]}
              </dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Severity</dt>
              <dd>{ECC_SEVERITY_LABELS[selected.severity]}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Status</dt>
              <dd>{ECC_ISSUE_STATUS_LABELS[selected.status]}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Occurred</dt>
              <dd>{formatEccWhen(selected.occurredAt)}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Reporter</dt>
              <dd>{selected.reporterName}</dd>
            </div>
            <div className="ecc-snap-meta-item">
              <dt>Owner</dt>
              <dd>{selected.currentOwnerName || "Not assigned"}</dd>
            </div>
          </dl>

          <div className="ecc-iss-panel-block">
            <h3 className="ecc-iss-panel-label">Description</h3>
            <p className="ecc-prose">{selected.description}</p>
          </div>

          {selected.resolutionNotes ? (
            <div className="ecc-iss-panel-block">
              <h3 className="ecc-iss-panel-label">Resolution</h3>
              <p className="ecc-prose">{selected.resolutionNotes}</p>
            </div>
          ) : null}

          <div className="ecc-iss-panel-block">
            <h3 className="ecc-iss-panel-label">Lifecycle</h3>
            <EccIssueLifecycleRail status={selected.status} />
          </div>

          {selected.sourceDailyOpsId ? (
            <p className="ecc-muted">
              Raised from Daily Ops
              {selected.sourceDailyOpsSection
                ? ` · ${ECC_DAILY_OPS_SECTION_LABELS[selected.sourceDailyOpsSection]}`
                : ""}
              {" · "}
              <Link href="/ecc-operations/daily-ops" className="ecc-link">
                {selected.sourceDailyOpsId}
              </Link>
            </p>
          ) : null}

          {selected.relatedEccRequestId ? (
            <p className="ecc-muted">
              Linked request{" "}
              <Link
                href={`/ecc-operations/requests?id=${encodeURIComponent(selected.relatedEccRequestId)}`}
                className="ecc-link"
              >
                {selected.relatedEccRequestId}
              </Link>
            </p>
          ) : null}

          <div className="ecc-iss-panel-block">
            <h3 className="ecc-iss-panel-label">Activity / audit history</h3>
            <ol className="ecc-iss-timeline">
              {[...selected.history].reverse().map((entry) => (
                <li key={entry.id} className="ecc-iss-timeline-item">
                  <p className="ecc-iss-timeline-when">
                    {formatEccWhen(entry.at)}
                  </p>
                  <p className="ecc-iss-timeline-who">{entry.byName}</p>
                  <p className="ecc-iss-timeline-what">
                    {historyHeadline(entry)}
                  </p>
                  {entry.note && entry.kind !== "action" ? (
                    <p className="ecc-iss-timeline-note">{entry.note}</p>
                  ) : null}
                  {entry.fromStatus &&
                  entry.toStatus &&
                  entry.fromStatus !== entry.toStatus ? (
                    <p className="ecc-muted">
                      {ECC_ISSUE_STATUS_LABELS[entry.fromStatus]} →{" "}
                      {ECC_ISSUE_STATUS_LABELS[entry.toStatus]}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <EccEntityAuditTrail
              entityType="issue"
              entityId={selected.id}
              title="Accountability"
            />
          </div>
        </section>
      ) : null}

      {panel === "treat" && selected ? (
        <section className="ecc-iss-panel" aria-label="Treat issue">
          <header className="ecc-iss-panel-head">
            <div>
              <p className="ecc-ov-eyebrow">Treat / manage issue</p>
              <h2 className="ecc-iss-panel-title">{selected.title}</h2>
              <p className="ecc-iss-panel-sub">
                Record what was done, assign ownership, and advance the
                lifecycle using the available next steps.
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

          <div className="ecc-iss-treat-summary">
            <div>
              <p className="ecc-iss-panel-label">Current state</p>
              <p className="ecc-iss-treat-value">
                {ECC_ISSUE_STATUS_LABELS[selected.status]}
              </p>
            </div>
            <div>
              <p className="ecc-iss-panel-label">Current owner</p>
              <p className="ecc-iss-treat-value">
                {selected.currentOwnerName || "Not assigned"}
              </p>
            </div>
            <div>
              <p className="ecc-iss-panel-label">Available next steps</p>
              <p className="ecc-iss-treat-value">
                {nextStatuses.length > 0
                  ? nextStatuses
                      .map((status) => ECC_ISSUE_STATUS_LABELS[status])
                      .join(", ")
                  : "None — issue is closed"}
              </p>
            </div>
          </div>

          <div className="ecc-iss-panel-block">
            <EccIssueLifecycleRail status={selected.status} />
          </div>

          <form className="ecc-submit-form ecc-form" onSubmit={onTreat}>
            <div className="ecc-form-block ecc-iss-next-step">
              <h3 className="ecc-form-block-title">Next step</h3>
              <p className="ecc-form-hint">
                Choose an allowed lifecycle transition, or leave blank to log an
                action without changing status.
              </p>
              <div className="ecc-field ecc-iss-advance-field">
                <label htmlFor="ecc-iss-next">Advance to</label>
                <div className="ecc-iss-advance-control">
                  <select
                    id="ecc-iss-next"
                    className="ecc-iss-advance-select"
                    value={treat.toStatus}
                    onChange={(e) =>
                      setTreat((prev) => ({
                        ...prev,
                        toStatus: e.target.value as EccIssueStatus | "",
                      }))
                    }
                    disabled={nextStatuses.length === 0}
                  >
                    <option value="">Stay in current state</option>
                    {nextStatuses.map((status) => (
                      <option key={status} value={status}>
                        {ECC_ISSUE_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                  <span className="ecc-iss-advance-chevron" aria-hidden />
                </div>
              </div>
            </div>

            <div className="ecc-form-block">
              <h3 className="ecc-form-block-title">Action</h3>
              <div className="ecc-field">
                <label htmlFor="ecc-iss-treat-action">
                  What has been done / is being done
                </label>
                <textarea
                  id="ecc-iss-treat-action"
                  value={treat.actionNote}
                  onChange={(e) =>
                    setTreat((prev) => ({
                      ...prev,
                      actionNote: e.target.value,
                    }))
                  }
                  placeholder="Describe the operational action"
                />
              </div>
            </div>

            <div className="ecc-form-block">
              <h3 className="ecc-form-block-title">Owner</h3>
              <div className="ecc-form-grid">
                <div className="ecc-field">
                  <label htmlFor="ecc-iss-treat-owner">
                    Who is responsible
                  </label>
                  <input
                    id="ecc-iss-treat-owner"
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
                  <label htmlFor="ecc-iss-treat-res">Resolution notes</label>
                  <textarea
                    id="ecc-iss-treat-res"
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

          {!selected.relatedEccRequestId && linkableRequests.length > 0 ? (
            <form
              className="ecc-submit-form ecc-form"
              style={{ marginTop: "1rem" }}
              onSubmit={onLinkRequest}
            >
              <h3 className="ecc-form-block-title">Link ECC request</h3>
              <div className="ecc-field">
                <label htmlFor="ecc-iss-link-req">Request</label>
                <select
                  id="ecc-iss-link-req"
                  value={linkRequestId}
                  onChange={(e) => setLinkRequestId(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {linkableRequests.map((row) => (
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
                Link request
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {panel === "delete" && selected ? (
        <section className="ecc-iss-panel ecc-iss-panel--danger" aria-label="Delete issue">
          <header className="ecc-iss-panel-head">
            <div>
              <p className="ecc-ov-eyebrow">Delete issue</p>
              <h2 className="ecc-iss-panel-title">Confirm deletion</h2>
              <p className="ecc-iss-panel-sub">
                This permanently removes the issue from the ECC Issues register.
                Linked Daily Ops snapshots keep their historical content; only
                the issue link is cleared.
              </p>
            </div>
          </header>
          <div className="ecc-iss-delete-card">
            <p className="ecc-iss-row-title">{selected.title}</p>
            <p className="ecc-iss-row-meta">
              {selected.id}
              {" · "}
              {ECC_ISSUE_STATUS_LABELS[selected.status]}
              {" · "}
              {ECC_SEVERITY_LABELS[selected.severity]}
            </p>
          </div>
          <div className="ecc-actions">
            <button
              type="button"
              className="ecc-btn ecc-btn-danger"
              disabled={saving}
              onClick={() => void onDeleteConfirm()}
            >
              {saving ? "Deleting…" : "Delete issue"}
            </button>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={() => openDetail(selected.id)}
            >
              Cancel
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
