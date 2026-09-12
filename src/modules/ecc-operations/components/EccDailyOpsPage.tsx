"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EccOperationsService } from "../services/EccOperationsService";
import type {
  EccCentreOverallStatus,
  EccDailyOpsPeriod,
  EccDailyOpsRecord,
  EccDailyOpsSectionKey,
  EccIssue,
  EccIssueClassification,
  EccPriority,
  EccRequest,
  EccRequestOrigin,
  EccRequestResponsibility,
  EccSectionCondition,
  EccSeverity,
  EccStaffingStatus,
} from "../types";
import {
  ECC_CENTRE_OVERALL_STATUS_LABELS,
  ECC_DAILY_OPS_PERIOD_LABELS,
  ECC_DAILY_OPS_SECTION_LABELS,
  ECC_PRIORITY_LABELS,
  ECC_SECTION_CONDITION_LABELS,
  ECC_SEVERITY_LABELS,
  ECC_STAFFING_STATUS_LABELS,
} from "../constants";
import { DEFAULT_ECC_CENTRE } from "../types";
import { EccStatusPill, formatEccWhen } from "./eccUi";

function formatReportingDate(isoDate: string): string {
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

function NoIssuesBanner() {
  return (
    <p className="ecc-no-issues">
      <span className="ecc-no-issues-mark" aria-hidden>
        ✓
      </span>
      No issues to report
    </p>
  );
}

function SectionRaisePanel({
  sectionStatus,
  raisedIssues,
  raisedRequests,
  onRaiseIssue,
  onRaiseRequest,
}: {
  section: EccDailyOpsSectionKey;
  sectionStatus: EccSectionCondition;
  raisedIssues: EccIssue[];
  raisedRequests: EccRequest[];
  onRaiseIssue: () => void;
  onRaiseRequest: () => void;
}) {
  const needsRaise =
    sectionStatus === "issue" || sectionStatus === "disrupted";
  const hasIssue = raisedIssues.length > 0;
  const hasRequest = raisedRequests.length > 0;
  const canRaiseIssue = needsRaise && !hasIssue;
  const canRaiseRequest = needsRaise && !hasRequest;

  if (!needsRaise && !hasIssue && !hasRequest) {
    return null;
  }

  return (
    <div className="ecc-raise-callout">
      {canRaiseIssue || canRaiseRequest ? (
        <p className="ecc-raise-callout-copy">
          This section reports an operational problem on the snapshot.{" "}
          {canRaiseIssue ? (
            <>
              <strong>Raise ECC Issue</strong> creates a tracked record in the
              Issues register.
            </>
          ) : null}{" "}
          {canRaiseRequest ? (
            <>
              <strong>Raise ECC Request</strong> creates a tracked record in the
              Requests register.
            </>
          ) : null}{" "}
          This daily ops submission stays an immutable historical record.
        </p>
      ) : null}
      {hasIssue ? (
        <div className="ecc-raise-linked">
          <p className="ecc-raise-linked-label">In Issues register</p>
          <ul className="ecc-raise-linked-list">
            {raisedIssues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`/ecc-operations/issues?id=${encodeURIComponent(issue.id)}`}
                  className="ecc-link"
                >
                  {issue.title}
                </Link>
                <span className="ecc-muted"> · {issue.id}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {hasRequest ? (
        <div className="ecc-raise-linked">
          <p className="ecc-raise-linked-label">In Requests register</p>
          <ul className="ecc-raise-linked-list">
            {raisedRequests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/ecc-operations/requests?id=${encodeURIComponent(request.id)}`}
                  className="ecc-link"
                >
                  {request.title}
                </Link>
                <span className="ecc-muted"> · {request.id}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {canRaiseIssue || canRaiseRequest ? (
        <div className="ecc-actions ecc-actions--compact">
          {canRaiseIssue ? (
            <button
              type="button"
              className="ecc-btn ecc-btn-primary ecc-btn-sm"
              onClick={onRaiseIssue}
            >
              Raise ECC Issue
            </button>
          ) : null}
          {canRaiseRequest ? (
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary ecc-btn-sm"
              onClick={onRaiseRequest}
            >
              Raise ECC Request
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const OVERALL_OPTIONS: EccCentreOverallStatus[] = [
  "operational",
  "operational_with_issues",
  "disrupted",
  "down",
];
const SECTION_OPTIONS: EccSectionCondition[] = ["normal", "issue", "disrupted"];
const STAFFING_OPTIONS: EccStaffingStatus[] = [
  "ready",
  "constrained",
  "unavailable",
  "unknown",
];
const PERIOD_OPTIONS: EccDailyOpsPeriod[] = ["morning", "evening", "ad_hoc"];

type DailyOpsPanel = "register" | "detail";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function ConditionPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: EccSectionCondition;
  onChange: (next: EccSectionCondition) => void;
}) {
  return (
    <div className="ecc-condition-set" role="radiogroup" aria-labelledby={id}>
      {SECTION_OPTIONS.map((option) => (
        <label
          key={option}
          className={`ecc-condition-option${value === option ? " is-selected" : ""}`}
        >
          <input
            type="radio"
            name={id}
            checked={value === option}
            onChange={() => onChange(option)}
          />
          {ECC_SECTION_CONDITION_LABELS[option]}
        </label>
      ))}
    </div>
  );
}

const emptyForm = {
  period: "morning" as EccDailyOpsPeriod,
  reportingDate: todayDate(),
  recordedByName: "",
  overallStatus: "operational" as EccCentreOverallStatus,
  centreStatus: "normal" as EccSectionCondition,
  staffingStatus: "ready" as EccStaffingStatus,
  staffingReadiness: "",
  centreObservations: "",
  centreDisruption: "",
  callStatus: "normal" as EccSectionCondition,
  callNotes: "",
  callsReceived: "",
  callsHandled: "",
  waiting: "",
  missed: "",
  escalated: "",
  callMetricKey: "",
  callMetricValue: "",
  facilityStatus: "normal" as EccSectionCondition,
  facilityCondition: "",
  facilityPower: "",
  facilityEnvironment: "",
  facilityIssues: "",
  facilityObservations: "",
  technicalStatus: "normal" as EccSectionCondition,
  equipment: "",
  network: "",
  servers: "",
  software: "",
  callTakingSystems: "",
  technicalIncidents: "",
  technicalObservations: "",
};

export function EccDailyOpsPage() {
  const [rows, setRows] = useState<EccDailyOpsRecord[]>([]);
  const [issues, setIssues] = useState<EccIssue[]>([]);
  const [requests, setRequests] = useState<EccRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<DailyOpsPanel>("register");
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raiseNotice, setRaiseNotice] = useState<{
    kind: "issue" | "request";
    id: string;
    title: string;
  } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [raiseMode, setRaiseMode] = useState<"issue" | "request" | null>(null);
  const [raiseSection, setRaiseSection] = useState<EccDailyOpsSectionKey | null>(
    null
  );
  const raisePanelRef = useRef<HTMLDivElement | null>(null);
  const [raiseForm, setRaiseForm] = useState({
    title: "",
    description: "",
    reason: "",
    classification: "operational" as EccIssueClassification,
    severity: "medium" as EccSeverity,
    origin: "operational" as EccRequestOrigin,
    responsibility: "company" as EccRequestResponsibility,
    priority: "medium" as EccPriority,
    reporterName: "",
  });

  async function reload() {
    const [list, issueList, requestList] = await Promise.all([
      EccOperationsService.listDailyOps(),
      EccOperationsService.listIssues(),
      EccOperationsService.listRequests(),
    ]);
    setRows(list);
    setIssues(issueList);
    setRequests(requestList);
    setSelectedId((current) => {
      if (current && list.some((row) => row.id === current)) return current;
      return null;
    });
  }

  const latestId = rows[0]?.id ?? null;

  function openDetail(id: string) {
    setSelectedId(id);
    setPanel("detail");
    setRaiseMode(null);
    setRaiseSection(null);
    setError(null);
  }

  function backToRegister() {
    setPanel("register");
    setSelectedId(null);
    setRaiseMode(null);
    setRaiseSection(null);
    setError(null);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Unable to load records.");
    });
  }, []);

  useEffect(() => {
    if (!raiseMode || !raiseSection) return;
    raisePanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [raiseMode, raiseSection]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;

  const issuesForSelected = useMemo(() => {
    if (!selected) return [];
    return issues.filter(
      (issue) =>
        issue.sourceDailyOpsId === selected.id ||
        selected.linkedIssueIds.includes(issue.id)
    );
  }, [issues, selected]);

  const requestsForSelected = useMemo(() => {
    if (!selected) return [];
    return requests.filter(
      (request) =>
        request.sourceDailyOpsId === selected.id ||
        (selected.linkedRequestIds ?? []).includes(request.id)
    );
  }, [requests, selected]);

  function issuesForSection(section: EccDailyOpsSectionKey): EccIssue[] {
    return issuesForSelected.filter(
      (issue) => issue.sourceDailyOpsSection === section
    );
  }

  function requestsForSection(section: EccDailyOpsSectionKey): EccRequest[] {
    return requestsForSelected.filter(
      (request) => request.sourceDailyOpsSection === section
    );
  }

  function startRaise(
    mode: "issue" | "request",
    section: EccDailyOpsSectionKey,
    suggestedTitle: string,
    suggestedDescription: string,
    classification: EccIssueClassification
  ) {
    if (mode === "issue" && issuesForSection(section).length > 0) return;
    if (mode === "request" && requestsForSection(section).length > 0) return;
    setRaiseMode(mode);
    setRaiseSection(section);
    setRaiseForm({
      title: suggestedTitle,
      description: suggestedDescription,
      reason: suggestedDescription,
      classification,
      severity: "medium",
      origin: classification,
      responsibility: "company",
      priority: "medium",
      reporterName: selected?.recordedByName ?? "",
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.recordedByName.trim()) {
      setError("Submitted by is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const additionalMetrics: Record<string, string> = {};
      if (form.callMetricKey.trim() && form.callMetricValue.trim()) {
        additionalMetrics[form.callMetricKey.trim()] =
          form.callMetricValue.trim();
      }
      const created = await EccOperationsService.createDailyOps({
        period: form.period,
        reportingDate: form.reportingDate,
        recordedByName: form.recordedByName,
        overallStatus: form.overallStatus,
        centreOperations: {
          status: form.centreStatus,
          staffingStatus: form.staffingStatus,
          staffingReadiness: form.staffingReadiness,
          observations: form.centreObservations,
          disruptionNotes: form.centreDisruption,
          noIssuesToReport: form.centreStatus === "normal",
        },
        callOperations: {
          status: form.callStatus,
          callsReceived: form.callsReceived || undefined,
          callsHandled: form.callsHandled || undefined,
          waiting: form.waiting || undefined,
          missed: form.missed || undefined,
          escalated: form.escalated || undefined,
          additionalMetrics,
          notes: form.callNotes,
          noIssuesToReport: form.callStatus === "normal",
        },
        facility: {
          status: form.facilityStatus,
          condition: form.facilityCondition,
          power: form.facilityPower,
          environment: form.facilityEnvironment,
          issues: form.facilityIssues,
          observations: form.facilityObservations,
          noIssuesToReport: form.facilityStatus === "normal",
        },
        technical: {
          status: form.technicalStatus,
          equipment: form.equipment,
          network: form.network,
          servers: form.servers,
          software: form.software,
          callTakingSystems: form.callTakingSystems,
          incidents: form.technicalIncidents,
          observations: form.technicalObservations,
          noIssuesToReport: form.technicalStatus === "normal",
        },
      });
      setForm({ ...emptyForm, reportingDate: todayDate() });
      setShowForm(false);
      await reload();
      openDetail(created.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  async function onRaiseIssue(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !raiseSection || raiseMode !== "issue") return;
    setSaving(true);
    setError(null);
    try {
      const { issue, dailyOps } =
        await EccOperationsService.raiseIssueFromDailyOps({
          dailyOpsId: selected.id,
          section: raiseSection,
          classification: raiseForm.classification,
          severity: raiseForm.severity,
          title: raiseForm.title,
          description: raiseForm.description,
          reporterName: raiseForm.reporterName || selected.recordedByName,
        });
      setRaiseMode(null);
      setRaiseSection(null);
      setRaiseNotice({
        kind: "issue",
        id: issue.id,
        title: issue.title,
      });
      await reload();
      setSelectedId(dailyOps.id);
      setPanel("detail");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to raise issue.");
    } finally {
      setSaving(false);
    }
  }

  async function onRaiseRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !raiseSection || raiseMode !== "request") return;
    setSaving(true);
    setError(null);
    try {
      const { request, dailyOps } =
        await EccOperationsService.raiseRequestFromDailyOps({
          dailyOpsId: selected.id,
          section: raiseSection,
          title: raiseForm.title,
          reason: raiseForm.reason || raiseForm.description,
          description: raiseForm.description,
          origin: raiseForm.origin,
          responsibility: raiseForm.responsibility,
          priority: raiseForm.priority,
          requestingManagerName:
            raiseForm.reporterName || selected.recordedByName,
        });
      setRaiseMode(null);
      setRaiseSection(null);
      setRaiseNotice({
        kind: "request",
        id: request.id,
        title: request.title,
      });
      await reload();
      setSelectedId(dailyOps.id);
      setPanel("detail");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to raise request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ecc-register ecc-daily-ops">
      <header className="ecc-page-header">
        <div className="ecc-page-header-copy">
          <h1 className="ecc-page-title">Daily operations</h1>
          <p className="ecc-page-desc">
            Point-in-time operational snapshot of the ECC. Each submission is a
            historical record — later updates do not rewrite earlier ones.
          </p>
        </div>
        {panel === "register" ? (
          <button
            type="button"
            className="ecc-btn ecc-btn-primary"
            onClick={() => setShowForm((value) => !value)}
          >
            {showForm ? "Close form" : "+ Submit update"}
          </button>
        ) : (
          <button
            type="button"
            className="ecc-btn ecc-btn-secondary"
            onClick={backToRegister}
          >
            Back to register
          </button>
        )}
      </header>

      {error ? <p className="ecc-empty">{error}</p> : null}

      {raiseNotice ? (
        <div className="ecc-raise-success" role="status">
          <div>
            <p className="ecc-raise-success-title">
              {raiseNotice.kind === "issue"
                ? "ECC Issue created in the Issues register"
                : "ECC Request created in the Requests register"}
            </p>
            <p className="ecc-raise-success-copy">
              <strong>{raiseNotice.title}</strong>
              {" · "}
              {raiseNotice.id}. The daily ops snapshot was not rewritten.
            </p>
          </div>
          <div className="ecc-actions ecc-actions--compact">
            <Link
              href={
                raiseNotice.kind === "issue"
                  ? `/ecc-operations/issues?id=${encodeURIComponent(raiseNotice.id)}`
                  : `/ecc-operations/requests?id=${encodeURIComponent(raiseNotice.id)}`
              }
              className="ecc-btn ecc-btn-primary ecc-btn-sm"
            >
              {raiseNotice.kind === "issue"
                ? "Open in Issues register"
                : "Open in Requests register"}
            </Link>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary ecc-btn-sm"
              onClick={() => setRaiseNotice(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {panel === "register" && showForm ? (
        <form className="ecc-submit-form ecc-form" onSubmit={onSubmit}>
          <div className="ecc-form-block">
            <h3 className="ecc-form-block-title">Submission</h3>
            <p className="ecc-form-hint">
              Centre: {DEFAULT_ECC_CENTRE.name}. Who completes each section
              varies by centre — enter the submitting manager only.
            </p>
            <div className="ecc-form-grid ecc-form-grid-3">
              <div className="ecc-field">
                <label htmlFor="ecc-dop-period">Reporting period</label>
                <select
                  id="ecc-dop-period"
                  value={form.period}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      period: e.target.value as EccDailyOpsPeriod,
                    }))
                  }
                >
                  {PERIOD_OPTIONS.map((period) => (
                    <option key={period} value={period}>
                      {ECC_DAILY_OPS_PERIOD_LABELS[period]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-dop-date">Date</label>
                <input
                  id="ecc-dop-date"
                  type="date"
                  required
                  value={form.reportingDate}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      reportingDate: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-dop-by">Submitted by</label>
                <input
                  id="ecc-dop-by"
                  value={form.recordedByName}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      recordedByName: e.target.value,
                    }))
                  }
                  placeholder="Manager name"
                  required
                />
              </div>
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-dop-overall">Overall centre status</label>
              <select
                id="ecc-dop-overall"
                value={form.overallStatus}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    overallStatus: e.target.value as EccCentreOverallStatus,
                  }))
                }
              >
                {OVERALL_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {ECC_CENTRE_OVERALL_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ecc-form-block">
            <h3 className="ecc-form-block-title">1. Centre operations</h3>
            <ConditionPicker
              id="ecc-centre-cond"
              value={form.centreStatus}
              onChange={(centreStatus) =>
                setForm((prev) => ({ ...prev, centreStatus }))
              }
            />
            {form.centreStatus === "normal" ? (
              <NoIssuesBanner />
            ) : (
              <div className="ecc-field">
                <label htmlFor="ecc-dop-centre-dis">
                  Operational disruption / issues
                </label>
                <textarea
                  id="ecc-dop-centre-dis"
                  required
                  value={form.centreDisruption}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      centreDisruption: e.target.value,
                    }))
                  }
                />
              </div>
            )}
            <div className="ecc-form-grid">
              <div className="ecc-field">
                <label htmlFor="ecc-dop-staffing">Staffing / readiness</label>
                <select
                  id="ecc-dop-staffing"
                  value={form.staffingStatus}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      staffingStatus: e.target.value as EccStaffingStatus,
                    }))
                  }
                >
                  {STAFFING_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {ECC_STAFFING_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-dop-staff-notes">Staffing notes</label>
                <input
                  id="ecc-dop-staff-notes"
                  value={form.staffingReadiness}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      staffingReadiness: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-dop-obs">General operational observations</label>
              <textarea
                id="ecc-dop-obs"
                value={form.centreObservations}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    centreObservations: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="ecc-form-block">
            <h3 className="ecc-form-block-title">2. Call operations</h3>
            <p className="ecc-form-hint">
              Counts are placeholders until centres confirm the KPI schema.
              Additional metrics remain extensible.
            </p>
            <ConditionPicker
              id="ecc-call-cond"
              value={form.callStatus}
              onChange={(callStatus) =>
                setForm((prev) => ({ ...prev, callStatus }))
              }
            />
            {form.callStatus === "normal" ? <NoIssuesBanner /> : null}
            <div className="ecc-form-grid ecc-form-grid-5">
              {(
                [
                  ["callsReceived", "Calls received"],
                  ["callsHandled", "Calls handled"],
                  ["waiting", "Calls waiting"],
                  ["missed", "Missed calls"],
                  ["escalated", "Escalated calls"],
                ] as const
              ).map(([key, label]) => (
                <div className="ecc-field" key={key}>
                  <label htmlFor={`ecc-dop-${key}`}>{label}</label>
                  <input
                    id={`ecc-dop-${key}`}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    inputMode="numeric"
                  />
                </div>
              ))}
            </div>
            <div className="ecc-form-grid">
              <div className="ecc-field">
                <label htmlFor="ecc-dop-metric-key">Additional metric key</label>
                <input
                  id="ecc-dop-metric-key"
                  value={form.callMetricKey}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      callMetricKey: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="ecc-field">
                <label htmlFor="ecc-dop-metric-value">
                  Additional metric value
                </label>
                <input
                  id="ecc-dop-metric-value"
                  value={form.callMetricValue}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      callMetricValue: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-dop-calls">Call notes</label>
              <textarea
                id="ecc-dop-calls"
                value={form.callNotes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, callNotes: e.target.value }))
                }
              />
            </div>
          </div>

          <div className="ecc-form-block">
            <h3 className="ecc-form-block-title">3. Facility</h3>
            <ConditionPicker
              id="ecc-fac-cond"
              value={form.facilityStatus}
              onChange={(facilityStatus) =>
                setForm((prev) => ({ ...prev, facilityStatus }))
              }
            />
            {form.facilityStatus === "normal" ? (
              <NoIssuesBanner />
            ) : (
              <div className="ecc-form-grid">
                <div className="ecc-field">
                  <label htmlFor="ecc-dop-fac-cond">
                    General facility condition
                  </label>
                  <textarea
                    id="ecc-dop-fac-cond"
                    value={form.facilityCondition}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        facilityCondition: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="ecc-field">
                  <label htmlFor="ecc-dop-fac-power">Power status</label>
                  <textarea
                    id="ecc-dop-fac-power"
                    value={form.facilityPower}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        facilityPower: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="ecc-field">
                  <label htmlFor="ecc-dop-fac-env">
                    Environment / working conditions
                  </label>
                  <textarea
                    id="ecc-dop-fac-env"
                    value={form.facilityEnvironment}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        facilityEnvironment: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="ecc-field">
                  <label htmlFor="ecc-dop-fac-iss">Facility-related issues</label>
                  <textarea
                    id="ecc-dop-fac-iss"
                    required
                    value={form.facilityIssues}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        facilityIssues: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            )}
            <div className="ecc-field">
              <label htmlFor="ecc-dop-fac-obs">Other relevant observations</label>
              <textarea
                id="ecc-dop-fac-obs"
                value={form.facilityObservations}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    facilityObservations: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="ecc-form-block">
            <h3 className="ecc-form-block-title">4. Technical</h3>
            <ConditionPicker
              id="ecc-tech-cond"
              value={form.technicalStatus}
              onChange={(technicalStatus) =>
                setForm((prev) => ({ ...prev, technicalStatus }))
              }
            />
            {form.technicalStatus === "normal" ? (
              <NoIssuesBanner />
            ) : (
              <div className="ecc-form-grid">
                {(
                  [
                    ["equipment", "Equipment status"],
                    ["network", "Network status"],
                    ["servers", "Server status"],
                    ["software", "Software status"],
                    ["callTakingSystems", "Call-taking system status"],
                    ["technicalIncidents", "Technical incidents"],
                  ] as const
                ).map(([key, label]) => (
                  <div className="ecc-field" key={key}>
                    <label htmlFor={`ecc-dop-${key}`}>{label}</label>
                    <textarea
                      id={`ecc-dop-${key}`}
                      value={form[key]}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="ecc-field">
              <label htmlFor="ecc-dop-tech-obs">Technical observations</label>
              <textarea
                id="ecc-dop-tech-obs"
                value={form.technicalObservations}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    technicalObservations: e.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="ecc-actions">
            <button
              type="submit"
              className="ecc-btn ecc-btn-primary"
              disabled={saving}
            >
              {saving ? "Submitting…" : "Submit operational update"}
            </button>
          </div>
        </form>
      ) : null}


      {panel === "register" ? (
        <>
          {rows.length === 0 ? (
            showForm ? null : (
            <div className="ecc-reg-empty">
              <p className="ecc-reg-empty-title">No daily operations records yet</p>
              <p className="ecc-reg-empty-copy">
                Submit an operational update to create the first historical
                snapshot.
              </p>
              <div className="ecc-actions">
                <button
                  type="button"
                  className="ecc-btn ecc-btn-primary"
                  onClick={() => setShowForm(true)}
                >
                  + Submit update
                </button>
              </div>
            </div>
            )
          ) : (
            <div className="ecc-reg-table-wrap">
              <table className="ecc-reg-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Period</th>
                    <th>Overall status</th>
                    <th>Centre</th>
                    <th>Facility</th>
                    <th>Technical</th>
                    <th>Staffing</th>
                    <th>Submitted by</th>
                    <th>Submitted</th>
                    <th className="ecc-reg-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isLatest = row.id === latestId;
                    return (
                      <tr key={row.id}>
                        <td>
                          <p className="ecc-reg-title">
                            {formatReportingDate(row.reportingDate)}
                          </p>
                          {isLatest ? (
                            <p className="ecc-reg-sub">
                              <span className="ecc-dop-latest-badge">Latest</span>
                            </p>
                          ) : (
                            <p className="ecc-reg-sub">{row.id}</p>
                          )}
                        </td>
                        <td className="ecc-reg-cell-muted">
                          {ECC_DAILY_OPS_PERIOD_LABELS[row.period]}
                        </td>
                        <td>
                          <EccStatusPill status={row.overallStatus} withDot />
                        </td>
                        <td>
                          <EccStatusPill
                            status={row.centreOperations.status}
                            withDot
                          />
                        </td>
                        <td>
                          <EccStatusPill status={row.facility.status} withDot />
                        </td>
                        <td>
                          <EccStatusPill status={row.technical.status} withDot />
                        </td>
                        <td>
                          <EccStatusPill
                            status={row.centreOperations.staffingStatus}
                            withDot
                          />
                          {row.centreOperations.staffingReadiness.trim() ? (
                            <p className="ecc-reg-sub">
                              {row.centreOperations.staffingReadiness}
                            </p>
                          ) : null}
                        </td>
                        <td className="ecc-reg-cell-muted">
                          {row.recordedByName}
                        </td>
                        <td className="ecc-reg-cell-muted">
                          {formatEccWhen(row.recordedAt)}
                        </td>
                        <td className="ecc-reg-actions">
                          <button
                            type="button"
                            className="ecc-btn ecc-btn-secondary ecc-btn-sm"
                            onClick={() => openDetail(row.id)}
                          >
                            View
                          </button>
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
        <section className="ecc-reg-panel ecc-dop-detail" aria-label="Snapshot detail">
          <header className="ecc-reg-panel-head">
            <div>
              <p className="ecc-reg-panel-label">Daily operations snapshot</p>
              <h2 className="ecc-reg-panel-title">
                {ECC_DAILY_OPS_PERIOD_LABELS[selected.period]} operational update
              </h2>
              <p className="ecc-reg-panel-sub">
                {DEFAULT_ECC_CENTRE.name}
                {" · "}
                {formatReportingDate(selected.reportingDate)}
                {" · "}
                {selected.id}
                {selected.id === latestId ? " · Latest submission" : ""}
              </p>
            </div>
            <button
              type="button"
              className="ecc-btn ecc-btn-secondary"
              onClick={backToRegister}
            >
              Back to register
            </button>
          </header>

              <dl className="ecc-snap-meta">
                <div className="ecc-snap-meta-item">
                  <dt>Centre</dt>
                  <dd>{DEFAULT_ECC_CENTRE.name}</dd>
                </div>
                <div className="ecc-snap-meta-item">
                  <dt>Date</dt>
                  <dd>{formatReportingDate(selected.reportingDate)}</dd>
                </div>
                <div className="ecc-snap-meta-item">
                  <dt>Submitted</dt>
                  <dd>{formatEccWhen(selected.recordedAt)}</dd>
                </div>
                <div className="ecc-snap-meta-item">
                  <dt>Submitted by</dt>
                  <dd>{selected.recordedByName}</dd>
                </div>
                <div className="ecc-snap-meta-item">
                  <dt>Period</dt>
                  <dd>{ECC_DAILY_OPS_PERIOD_LABELS[selected.period]}</dd>
                </div>
                <div
                  className={`ecc-snap-meta-item ecc-snap-meta-item--status${
                    selected.overallStatus === "operational"
                      ? " is-ok"
                      : selected.overallStatus === "operational_with_issues"
                        ? " is-attention"
                        : " is-critical"
                  }`}
                >
                  <dt>Overall status</dt>
                  <dd>
                    <EccStatusPill
                      status={selected.overallStatus}
                      withDot
                    />
                  </dd>
                </div>
              </dl>
              {raiseSection &&
              raiseMode &&
              ((raiseMode === "issue" &&
                issuesForSection(raiseSection).length === 0) ||
                (raiseMode === "request" &&
                  requestsForSection(raiseSection).length === 0)) ? (
                <div
                  ref={raisePanelRef}
                  className="ecc-raise-anchor"
                  id="ecc-raise-panel"
                >
                  {raiseMode === "issue" ? (
                    <form
                      className="ecc-submit-form ecc-form ecc-raise-panel"
                      onSubmit={onRaiseIssue}
                    >
                      <h3 className="ecc-form-block-title">
                        Raise ECC Issue ·{" "}
                        {ECC_DAILY_OPS_SECTION_LABELS[raiseSection]}
                      </h3>
                      <p className="ecc-form-hint">
                        Creates an ECC Issue in the Issues register, linked to
                        this snapshot. Classification does not assign ownership
                        — managers agree who treats it. This daily ops record
                        stays unchanged.
                      </p>
                      <div className="ecc-form-grid">
                        <div className="ecc-field">
                          <label htmlFor="ecc-raise-class">Classification</label>
                          <select
                            id="ecc-raise-class"
                            value={raiseForm.classification}
                            onChange={(e) =>
                              setRaiseForm((prev) => ({
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
                          <label htmlFor="ecc-raise-sev">Severity</label>
                          <select
                            id="ecc-raise-sev"
                            value={raiseForm.severity}
                            onChange={(e) =>
                              setRaiseForm((prev) => ({
                                ...prev,
                                severity: e.target.value as EccSeverity,
                              }))
                            }
                          >
                            {(
                              Object.keys(ECC_SEVERITY_LABELS) as EccSeverity[]
                            ).map((severity) => (
                              <option key={severity} value={severity}>
                                {ECC_SEVERITY_LABELS[severity]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="ecc-field">
                        <label htmlFor="ecc-raise-title">Title</label>
                        <input
                          id="ecc-raise-title"
                          required
                          value={raiseForm.title}
                          onChange={(e) =>
                            setRaiseForm((prev) => ({
                              ...prev,
                              title: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="ecc-field">
                        <label htmlFor="ecc-raise-desc">Description</label>
                        <textarea
                          id="ecc-raise-desc"
                          required
                          value={raiseForm.description}
                          onChange={(e) =>
                            setRaiseForm((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="ecc-field">
                        <label htmlFor="ecc-raise-by">Reporter</label>
                        <input
                          id="ecc-raise-by"
                          required
                          value={raiseForm.reporterName}
                          onChange={(e) =>
                            setRaiseForm((prev) => ({
                              ...prev,
                              reporterName: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="ecc-actions">
                        <button
                          type="submit"
                          className="ecc-btn ecc-btn-primary"
                          disabled={saving}
                        >
                          {saving ? "Raising…" : "Raise issue"}
                        </button>
                        <button
                          type="button"
                          className="ecc-btn ecc-btn-secondary"
                          onClick={() => {
                            setRaiseMode(null);
                            setRaiseSection(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <form
                      className="ecc-submit-form ecc-form ecc-raise-panel"
                      onSubmit={onRaiseRequest}
                    >
                      <h3 className="ecc-form-block-title">
                        Raise ECC Request ·{" "}
                        {ECC_DAILY_OPS_SECTION_LABELS[raiseSection]}
                      </h3>
                      <p className="ecc-form-hint">
                        Creates an ECC Request in the Requests register, linked
                        to this snapshot. Does not invent approvals. This daily
                        ops record stays unchanged.
                      </p>
                      <div className="ecc-form-grid">
                        <div className="ecc-field">
                          <label htmlFor="ecc-raise-req-origin">
                            Classification
                          </label>
                          <select
                            id="ecc-raise-req-origin"
                            value={raiseForm.origin}
                            onChange={(e) =>
                              setRaiseForm((prev) => ({
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
                          <label htmlFor="ecc-raise-req-resp">
                            Responsibility
                          </label>
                          <select
                            id="ecc-raise-req-resp"
                            value={raiseForm.responsibility}
                            onChange={(e) =>
                              setRaiseForm((prev) => ({
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
                          <label htmlFor="ecc-raise-req-pri">Priority</label>
                          <select
                            id="ecc-raise-req-pri"
                            value={raiseForm.priority}
                            onChange={(e) =>
                              setRaiseForm((prev) => ({
                                ...prev,
                                priority: e.target.value as EccPriority,
                              }))
                            }
                          >
                            {(
                              Object.keys(ECC_PRIORITY_LABELS) as EccPriority[]
                            ).map((priority) => (
                              <option key={priority} value={priority}>
                                {ECC_PRIORITY_LABELS[priority]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="ecc-field">
                        <label htmlFor="ecc-raise-req-title">Request</label>
                        <input
                          id="ecc-raise-req-title"
                          required
                          value={raiseForm.title}
                          onChange={(e) =>
                            setRaiseForm((prev) => ({
                              ...prev,
                              title: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="ecc-field">
                        <label htmlFor="ecc-raise-req-reason">Reason</label>
                        <textarea
                          id="ecc-raise-req-reason"
                          required
                          value={raiseForm.reason}
                          onChange={(e) =>
                            setRaiseForm((prev) => ({
                              ...prev,
                              reason: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="ecc-field">
                        <label htmlFor="ecc-raise-req-by">
                          Requesting manager
                        </label>
                        <input
                          id="ecc-raise-req-by"
                          required
                          value={raiseForm.reporterName}
                          onChange={(e) =>
                            setRaiseForm((prev) => ({
                              ...prev,
                              reporterName: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="ecc-actions">
                        <button
                          type="submit"
                          className="ecc-btn ecc-btn-primary"
                          disabled={saving}
                        >
                          {saving ? "Raising…" : "Raise request"}
                        </button>
                        <button
                          type="button"
                          className="ecc-btn ecc-btn-secondary"
                          onClick={() => {
                            setRaiseMode(null);
                            setRaiseSection(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : null}

              <section className="ecc-snap-section">
                <header className="ecc-snap-section-head">
                  <h3 className="ecc-snap-section-title">Centre operations</h3>
                  <div className="ecc-snap-section-badges">
                    <EccStatusPill
                      status={selected.centreOperations.status}
                      withDot
                    />
                    <span className="ecc-snap-badge-pair">
                      <span className="ecc-snap-badge-label">Staffing</span>
                      <EccStatusPill
                        status={selected.centreOperations.staffingStatus}
                        withDot
                      />
                    </span>
                  </div>
                </header>
                <div className="ecc-snap-section-body">
                  {selected.centreOperations.noIssuesToReport ? (
                    <NoIssuesBanner />
                  ) : (
                    <>
                      {selected.centreOperations.disruptionNotes ? (
                        <p className="ecc-prose">
                          {selected.centreOperations.disruptionNotes}
                        </p>
                      ) : null}
                      {selected.centreOperations.staffingReadiness ? (
                        <p className="ecc-prose ecc-muted">
                          Readiness:{" "}
                          {selected.centreOperations.staffingReadiness}
                        </p>
                      ) : null}
                      <SectionRaisePanel
                        section="centre"
                        sectionStatus={selected.centreOperations.status}
                        raisedIssues={issuesForSection("centre")}
                        raisedRequests={requestsForSection("centre")}
                        onRaiseIssue={() =>
                          startRaise(
                            "issue",
                            "centre",
                            "Centre operations issue",
                            selected.centreOperations.disruptionNotes ||
                              selected.centreOperations.observations,
                            "operational"
                          )
                        }
                        onRaiseRequest={() =>
                          startRaise(
                            "request",
                            "centre",
                            "Centre operations request",
                            selected.centreOperations.disruptionNotes ||
                              selected.centreOperations.observations,
                            "operational"
                          )
                        }
                      />
                    </>
                  )}
                  {selected.centreOperations.observations ? (
                    <p className="ecc-prose">
                      {selected.centreOperations.observations}
                    </p>
                  ) : null}
                </div>
              </section>

              <section className="ecc-snap-section">
                <header className="ecc-snap-section-head">
                  <h3 className="ecc-snap-section-title">Call operations</h3>
                  <div className="ecc-snap-section-badges">
                    <EccStatusPill
                      status={selected.callOperations.status}
                      withDot
                    />
                  </div>
                </header>
                <div className="ecc-snap-section-body">
                  <p className="ecc-form-hint">
                    Counts are placeholders until centres confirm the KPI
                    schema.
                  </p>
                  <div className="ecc-metric-row">
                    {(
                      [
                        ["Received", selected.callOperations.callsReceived],
                        ["Handled", selected.callOperations.callsHandled],
                        ["Waiting", selected.callOperations.waiting],
                        ["Missed", selected.callOperations.missed],
                        ["Escalated", selected.callOperations.escalated],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="ecc-metric">
                        <p className="ecc-metric-value">{value || "—"}</p>
                        <p className="ecc-metric-label">{label}</p>
                      </div>
                    ))}
                  </div>
                  {Object.keys(selected.callOperations.additionalMetrics)
                    .length > 0 ? (
                    <div className="ecc-metric-extra">
                      {Object.entries(
                        selected.callOperations.additionalMetrics
                      ).map(([key, value]) => (
                        <span key={key}>
                          {key}: <strong>{value}</strong>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {selected.callOperations.notes ? (
                    <p className="ecc-prose">{selected.callOperations.notes}</p>
                  ) : null}
                  {selected.callOperations.status !== "normal" ? (
                    <SectionRaisePanel
                      section="call"
                      sectionStatus={selected.callOperations.status}
                      raisedIssues={issuesForSection("call")}
                      raisedRequests={requestsForSection("call")}
                      onRaiseIssue={() =>
                        startRaise(
                          "issue",
                          "call",
                          "Call operations issue",
                          selected.callOperations.notes ||
                            "Call operations reported an issue.",
                          "operational"
                        )
                      }
                      onRaiseRequest={() =>
                        startRaise(
                          "request",
                          "call",
                          "Call operations request",
                          selected.callOperations.notes ||
                            "Call operations reported an issue.",
                          "operational"
                        )
                      }
                    />
                  ) : (
                    <NoIssuesBanner />
                  )}
                </div>
              </section>

              <section className="ecc-snap-section">
                <header className="ecc-snap-section-head">
                  <h3 className="ecc-snap-section-title">Facility</h3>
                  <div className="ecc-snap-section-badges">
                    <EccStatusPill
                      status={selected.facility.status}
                      withDot
                    />
                  </div>
                </header>
                <div className="ecc-snap-section-body">
                  {selected.facility.noIssuesToReport ? (
                    <NoIssuesBanner />
                  ) : (
                    <>
                      {(
                        [
                          ["Condition", selected.facility.condition],
                          ["Power", selected.facility.power],
                          ["Environment", selected.facility.environment],
                          ["Issues", selected.facility.issues],
                          ["Observations", selected.facility.observations],
                        ] as const
                      ).map(([label, value]) =>
                        value ? (
                          <p key={label} className="ecc-prose">
                            <span className="ecc-muted">{label}: </span>
                            {value}
                          </p>
                        ) : null
                      )}
                      <SectionRaisePanel
                        section="facility"
                        sectionStatus={selected.facility.status}
                        raisedIssues={issuesForSection("facility")}
                        raisedRequests={requestsForSection("facility")}
                        onRaiseIssue={() =>
                          startRaise(
                            "issue",
                            "facility",
                            "Facility issue",
                            selected.facility.issues ||
                              selected.facility.condition ||
                              "Facility section reported an issue.",
                            "operational"
                          )
                        }
                        onRaiseRequest={() =>
                          startRaise(
                            "request",
                            "facility",
                            "Facility request",
                            selected.facility.issues ||
                              selected.facility.condition ||
                              "Facility section reported an issue.",
                            "operational"
                          )
                        }
                      />
                    </>
                  )}
                </div>
              </section>

              <section className="ecc-snap-section">
                <header className="ecc-snap-section-head">
                  <h3 className="ecc-snap-section-title">Technical</h3>
                  <div className="ecc-snap-section-badges">
                    <EccStatusPill
                      status={selected.technical.status}
                      withDot
                    />
                  </div>
                </header>
                <div className="ecc-snap-section-body">
                  {selected.technical.noIssuesToReport ? (
                    <NoIssuesBanner />
                  ) : (
                    <>
                      {(
                        [
                          ["Equipment", selected.technical.equipment],
                          ["Network", selected.technical.network],
                          ["Servers", selected.technical.servers],
                          ["Software", selected.technical.software],
                          [
                            "Call-taking systems",
                            selected.technical.callTakingSystems,
                          ],
                          ["Incidents", selected.technical.incidents],
                          ["Observations", selected.technical.observations],
                        ] as const
                      ).map(([label, value]) =>
                        value ? (
                          <p key={label} className="ecc-prose">
                            <span className="ecc-muted">{label}: </span>
                            {value}
                          </p>
                        ) : null
                      )}
                      <SectionRaisePanel
                        section="technical"
                        sectionStatus={selected.technical.status}
                        raisedIssues={issuesForSection("technical")}
                        raisedRequests={requestsForSection("technical")}
                        onRaiseIssue={() =>
                          startRaise(
                            "issue",
                            "technical",
                            "Technical issue",
                            selected.technical.incidents ||
                              selected.technical.network ||
                              "Technical section reported an issue.",
                            "technical"
                          )
                        }
                        onRaiseRequest={() =>
                          startRaise(
                            "request",
                            "technical",
                            "Technical request",
                            selected.technical.incidents ||
                              selected.technical.network ||
                              "Technical section reported an issue.",
                            "technical"
                          )
                        }
                      />
                    </>
                  )}
                </div>
              </section>

              {selected.linkedIssueIds.length > 0 ? (
                <section className="ecc-snap-section">
                  <header className="ecc-snap-section-head">
                    <h3 className="ecc-snap-section-title">Linked ECC issues</h3>
                  </header>
                  <p className="ecc-form-hint">
                    Raised into the Issues register from this snapshot. Open a
                    record to manage lifecycle and ownership.
                  </p>
                  <ul className="ecc-history">
                    {selected.linkedIssueIds.map((id) => {
                      const issue = issues.find((row) => row.id === id);
                      return (
                        <li key={id}>
                          <Link
                            href={`/ecc-operations/issues?id=${encodeURIComponent(id)}`}
                            className="ecc-link"
                          >
                            {issue?.title ?? id}
                          </Link>
                          {issue ? (
                            <span className="ecc-muted">
                              {" · "}
                              {issue.id}
                              {issue.sourceDailyOpsSection
                                ? ` · ${ECC_DAILY_OPS_SECTION_LABELS[issue.sourceDailyOpsSection]}`
                                : ""}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {(selected.linkedRequestIds?.length ?? 0) > 0 ? (
                <section className="ecc-snap-section">
                  <header className="ecc-snap-section-head">
                    <h3 className="ecc-snap-section-title">
                      Linked ECC requests
                    </h3>
                  </header>
                  <p className="ecc-form-hint">
                    Raised into the Requests register from this snapshot. Open a
                    record to manage lifecycle and ownership.
                  </p>
                  <ul className="ecc-history">
                    {selected.linkedRequestIds.map((id) => {
                      const request = requests.find((row) => row.id === id);
                      return (
                        <li key={id}>
                          <Link
                            href={`/ecc-operations/requests?id=${encodeURIComponent(id)}`}
                            className="ecc-link"
                          >
                            {request?.title ?? id}
                          </Link>
                          {request ? (
                            <span className="ecc-muted">
                              {" · "}
                              {request.id}
                              {request.sourceDailyOpsSection
                                ? ` · ${ECC_DAILY_OPS_SECTION_LABELS[request.sourceDailyOpsSection]}`
                                : ""}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

        </section>
      ) : panel === "detail" ? (
        <p className="ecc-empty">Select a submission from the register to inspect it.</p>
      ) : null}
    </div>
  );
}
