"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Clock3,
  FileText,
  UserPlus,
  Users,
  UserRound,
} from "lucide-react";
import { EccOperationsService } from "../services/EccOperationsService";
import type {
  EccAgentDutyStatus,
  EccPeopleSnapshot,
  EccPerson,
  EccPersonRole,
} from "../types";
import {
  ECC_AGENT_DUTY_STATUS_LABELS,
  ECC_PERSON_ROLE_LABELS,
  ECC_SHIFT_COVERAGE_LABELS,
} from "../constants";
import { formatEccWhen } from "./eccUi";
import { EccRecentAuditFeed } from "./EccAuditTrail";

function dutyTone(
  status: string
): "ok" | "attention" | "critical" | "neutral" {
  if (status === "on_duty" || status === "signed_in") return "ok";
  if (status === "signed_out" || status === "off_duty") return "neutral";
  if (status === "absent") return "critical";
  return "attention";
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultShiftWindow(): { startsAt: string; endsAt: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + 8);
  return {
    startsAt: toDatetimeLocalValue(start),
    endsAt: toDatetimeLocalValue(end),
  };
}

function parseLocalDateTime(value: string): Date | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function EccPeoplePage() {
  const [snapshot, setSnapshot] = useState<EccPeopleSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [agentQuery, setAgentQuery] = useState("");
  const [agentStatusFilter, setAgentStatusFilter] = useState<
    "all" | EccAgentDutyStatus
  >("all");
  const [showAllAttendance, setShowAllAttendance] = useState(false);
  const [personForm, setPersonForm] = useState({
    name: "",
    role: "agent" as EccPersonRole,
    contactEmail: "",
    contactPhone: "",
  });
  const [shiftForm, setShiftForm] = useState(() => {
    const window = defaultShiftWindow();
    return {
      label: "Current shift",
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      assignedPersonIds: [] as string[],
    };
  });

  const addPersonFormRef = useRef<HTMLFormElement | null>(null);
  const shiftFormRef = useRef<HTMLFormElement | null>(null);

  async function reload() {
    const data = await EccOperationsService.getPeopleSnapshot();
    setSnapshot(data);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void reload().catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Unable to load people."
        );
      });
    });
  }, []);

  useEffect(() => {
    if (showAddPerson) {
      addPersonFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [showAddPerson]);

  useEffect(() => {
    if (showShiftForm) {
      shiftFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [showShiftForm]);

  const agentOptions = useMemo(
    () => snapshot?.agents.map((row) => row.person) ?? [],
    [snapshot]
  );

  const assignedSet = useMemo(
    () => new Set(snapshot?.currentShift.shift?.assignedPersonIds ?? []),
    [snapshot]
  );

  const visibleAgents = useMemo(() => {
    const rows = snapshot?.agents ?? [];
    const query = agentQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        agentStatusFilter !== "all" &&
        row.dutyStatus !== agentStatusFilter
      ) {
        return false;
      }
      if (!query) return true;
      return (
        row.person.name.toLowerCase().includes(query) ||
        row.person.id.toLowerCase().includes(query) ||
        (row.shiftLabel ?? "").toLowerCase().includes(query)
      );
    });
  }, [snapshot, agentQuery, agentStatusFilter]);

  const attendanceRows = useMemo(() => {
    const rows = snapshot?.recentAttendance ?? [];
    if (showAllAttendance) return rows;
    return rows.slice(0, 8);
  }, [snapshot, showAllAttendance]);

  const signedOutCount = useMemo(() => {
    const current = snapshot?.currentShift;
    if (!current?.shift) return null;
    const shiftId = current.shift.id;
    return (snapshot?.recentAttendance ?? []).filter(
      (row) =>
        row.shiftId === shiftId &&
        row.status === "signed_out" &&
        Boolean(row.signedOutAt)
    ).length;
  }, [snapshot]);

  function startAddPerson(role: EccPersonRole = "agent") {
    setPersonForm({
      name: "",
      role,
      contactEmail: "",
      contactPhone: "",
    });
    setShowAddPerson(true);
    setShowShiftForm(false);
  }

  function openShiftForm(preselectAgentIds?: string[]) {
    const current = snapshot?.currentShift.shift;
    if (current) {
      setShiftForm({
        label: current.label,
        startsAt: toDatetimeLocalValue(new Date(current.startsAt)),
        endsAt: toDatetimeLocalValue(new Date(current.endsAt)),
        assignedPersonIds:
          preselectAgentIds ?? [...current.assignedPersonIds],
      });
    } else {
      const window = defaultShiftWindow();
      setShiftForm({
        label: "Current shift",
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        assignedPersonIds: preselectAgentIds ?? [],
      });
    }
    setShowShiftForm(true);
    setShowAddPerson(false);
  }

  function toggleAssignedAgent(personId: string) {
    setShiftForm((prev) => {
      const exists = prev.assignedPersonIds.includes(personId);
      return {
        ...prev,
        assignedPersonIds: exists
          ? prev.assignedPersonIds.filter((id) => id !== personId)
          : [...prev.assignedPersonIds, personId],
      };
    });
  }

  async function onCreatePerson(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const name = personForm.name.trim();
      if (!name) throw new Error("Name is required.");
      await EccOperationsService.createPerson({
        name,
        role: personForm.role,
        contactEmail: personForm.contactEmail.trim() || undefined,
        contactPhone: personForm.contactPhone.trim() || undefined,
      });
      setPersonForm({
        name: "",
        role: "agent",
        contactEmail: "",
        contactPhone: "",
      });
      setShowAddPerson(false);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to add person.");
    } finally {
      setSaving(false);
    }
  }

  async function onEnsureShift(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const startsAt = parseLocalDateTime(shiftForm.startsAt);
      const endsAt = parseLocalDateTime(shiftForm.endsAt);
      if (!startsAt || !endsAt) {
        throw new Error("Shift start and end times are required.");
      }
      if (endsAt.getTime() <= startsAt.getTime()) {
        throw new Error("Shift end must be after shift start.");
      }
      await EccOperationsService.ensureCurrentShift({
        label: shiftForm.label.trim() || "Current shift",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        assignedPersonIds: shiftForm.assignedPersonIds,
      });
      setShowShiftForm(false);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to set shift.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAssignments() {
    setSaving(true);
    setError(null);
    try {
      await EccOperationsService.setCurrentShiftAssignments({
        assignedPersonIds: shiftForm.assignedPersonIds,
      });
      setShowShiftForm(false);
      await reload();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to update assignments."
      );
    } finally {
      setSaving(false);
    }
  }

  async function onAssignAgentToCurrentShift(personId: string) {
    const current = snapshot?.currentShift.shift;
    if (!current) {
      openShiftForm([personId]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const next = [...new Set([...current.assignedPersonIds, personId])];
      await EccOperationsService.setCurrentShiftAssignments({
        assignedPersonIds: next,
      });
      await reload();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to assign agent to shift."
      );
    } finally {
      setSaving(false);
    }
  }

  async function onSignIn(personId: string) {
    setSaving(true);
    setError(null);
    try {
      await EccOperationsService.signInPerson({ personId });
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setSaving(false);
    }
  }

  async function onSignOut(personId: string) {
    setSaving(true);
    setError(null);
    try {
      await EccOperationsService.signOutPerson({ personId });
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to sign out.");
    } finally {
      setSaving(false);
    }
  }

  if (!snapshot && !error) {
    return <p className="ecc-empty">Loading people…</p>;
  }

  if (error && !snapshot) {
    return (
      <div className="ecc-people">
        <header className="ecc-page-header">
          <div className="ecc-page-header-copy">
            <h1 className="ecc-page-title">People</h1>
            <p className="ecc-page-desc">
              Who operates this ECC, who is responsible for it, and who is
              currently on duty.
            </p>
          </div>
        </header>
        <p className="ecc-empty">{error}</p>
      </div>
    );
  }

  const managers = snapshot?.managers ?? [];
  const officers = snapshot?.relationshipOfficers ?? [];
  const current = snapshot?.currentShift;
  const hasShift = Boolean(current?.shift);

  return (
    <div className="ecc-people">
      <header className="ecc-page-header">
        <div className="ecc-page-header-copy">
          <h1 className="ecc-page-title">People</h1>
          <p className="ecc-page-desc">
            Who operates this ECC, who is responsible for it, and who is
            currently on duty.
          </p>
        </div>
        <div className="ecc-actions ecc-actions--compact">
          <button
            type="button"
            className="ecc-btn ecc-btn-secondary"
            onClick={() => {
              if (showShiftForm) {
                setShowShiftForm(false);
              } else {
                openShiftForm();
              }
            }}
          >
            {showShiftForm ? "Close shift" : "Set current shift"}
          </button>
          <button
            type="button"
            className="ecc-btn ecc-btn-primary"
            onClick={() => {
              if (showAddPerson) {
                setShowAddPerson(false);
              } else {
                startAddPerson("agent");
              }
            }}
          >
            {showAddPerson ? "Close" : "+ Add person"}
          </button>
        </div>
      </header>

      {error ? <p className="ecc-empty">{error}</p> : null}

      {showAddPerson ? (
        <form
          ref={addPersonFormRef}
          className="ecc-submit-form ecc-form"
          id="ecc-people-add-form"
          onSubmit={onCreatePerson}
        >
          <h3 className="ecc-form-block-title">Add person</h3>
          <div className="ecc-form-grid">
            <div className="ecc-field">
              <label htmlFor="ecc-ppl-name">Name</label>
              <input
                id="ecc-ppl-name"
                required
                value={personForm.name}
                onChange={(e) =>
                  setPersonForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-ppl-role">Role</label>
              <select
                id="ecc-ppl-role"
                value={personForm.role}
                onChange={(e) =>
                  setPersonForm((prev) => ({
                    ...prev,
                    role: e.target.value as EccPersonRole,
                  }))
                }
              >
                <option value="ecc_manager">ECC Manager</option>
                <option value="relationship_officer">
                  Relationship Officer
                </option>
                <option value="agent">Agent</option>
              </select>
            </div>
          </div>
          <div className="ecc-form-grid">
            <div className="ecc-field">
              <label htmlFor="ecc-ppl-email">Contact email</label>
              <input
                id="ecc-ppl-email"
                type="email"
                value={personForm.contactEmail}
                onChange={(e) =>
                  setPersonForm((prev) => ({
                    ...prev,
                    contactEmail: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-ppl-phone">Contact phone</label>
              <input
                id="ecc-ppl-phone"
                value={personForm.contactPhone}
                onChange={(e) =>
                  setPersonForm((prev) => ({
                    ...prev,
                    contactPhone: e.target.value,
                  }))
                }
              />
            </div>
          </div>
          <button
            type="submit"
            className="ecc-btn ecc-btn-primary"
            disabled={saving}
          >
            {saving ? "Saving…" : "Save person"}
          </button>
        </form>
      ) : null}

      {showShiftForm ? (
        <form
          ref={shiftFormRef}
          className="ecc-submit-form ecc-form"
          id="ecc-people-shift-form"
          onSubmit={onEnsureShift}
        >
          <h3 className="ecc-form-block-title">Current shift</h3>
          <p className="ecc-form-hint">
            Sets the active shift for attendance and coverage. Activating a new
            shift replaces the previous current shift. Use Save assignments to
            update agents on the existing current shift.
          </p>
          <div className="ecc-form-grid ecc-form-grid-3">
            <div className="ecc-field">
              <label htmlFor="ecc-shf-label">Shift label</label>
              <input
                id="ecc-shf-label"
                required
                value={shiftForm.label}
                onChange={(e) =>
                  setShiftForm((prev) => ({ ...prev, label: e.target.value }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-shf-start">Start</label>
              <input
                id="ecc-shf-start"
                type="datetime-local"
                required
                value={shiftForm.startsAt}
                onChange={(e) =>
                  setShiftForm((prev) => ({
                    ...prev,
                    startsAt: e.target.value,
                  }))
                }
              />
            </div>
            <div className="ecc-field">
              <label htmlFor="ecc-shf-end">End</label>
              <input
                id="ecc-shf-end"
                type="datetime-local"
                required
                value={shiftForm.endsAt}
                onChange={(e) =>
                  setShiftForm((prev) => ({ ...prev, endsAt: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="ecc-field">
            <label id="ecc-shf-agents-label">Agents assigned</label>
            {agentOptions.length === 0 ? (
              <p className="ecc-form-hint">
                No agents recorded yet. Add an Agent first, then assign them
                here.
              </p>
            ) : (
              <div
                className="ecc-ppl-assign-list"
                role="group"
                aria-labelledby="ecc-shf-agents-label"
              >
                {agentOptions.map((agent) => {
                  const checked = shiftForm.assignedPersonIds.includes(
                    agent.id
                  );
                  return (
                    <label key={agent.id} className="ecc-ppl-assign-option">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssignedAgent(agent.id)}
                      />
                      <span>{agent.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <div className="ecc-actions ecc-actions--compact">
            <button
              type="submit"
              className="ecc-btn ecc-btn-primary"
              disabled={saving}
            >
              {saving ? "Saving…" : hasShift ? "Replace current shift" : "Activate shift"}
            </button>
            {hasShift ? (
              <button
                type="button"
                className="ecc-btn ecc-btn-secondary"
                disabled={saving}
                onClick={() => void onSaveAssignments()}
              >
                Save assignments
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {/* 1. ECC Management */}
      <section className="ecc-ppl-card" aria-labelledby="ecc-mgmt-heading">
        <header className="ecc-ppl-card-head">
          <div>
            <h2 id="ecc-mgmt-heading" className="ecc-ppl-card-title">
              ECC Management
            </h2>
            <p className="ecc-ppl-card-lede">
              People responsible for managing and supporting the centre.
            </p>
          </div>
          <button
            type="button"
            className="ecc-ppl-text-link"
            onClick={() => startAddPerson("ecc_manager")}
          >
            Manage <span aria-hidden>›</span>
          </button>
        </header>

        <div className="ecc-ppl-mgmt-grid">
          <ManagementRolePanel
            accent="blue"
            title="ECC Manager(s)"
            description="Centre management and operational oversight."
            people={managers}
            emptyTitle="No ECC manager(s) recorded yet"
            emptyCopy="Add a person and assign the ECC Manager role."
            actionLabel="+ Add manager"
            onAdd={() => startAddPerson("ecc_manager")}
          />
          <ManagementRolePanel
            accent="green"
            title="Relationship Officer"
            description="Primary point of contact for the organisation."
            people={officers}
            emptyTitle="No relationship officer recorded yet"
            emptyCopy="Add a person and assign the Relationship Officer role."
            actionLabel="+ Add relationship officer"
            onAdd={() => startAddPerson("relationship_officer")}
          />
        </div>
      </section>

      {/* 2. Current shift + Shift coverage */}
      <div className="ecc-ppl-shift-grid">
        <section className="ecc-ppl-card" aria-labelledby="ecc-shift-heading">
          <header className="ecc-ppl-card-head ecc-ppl-card-head--stack">
            <div className="ecc-ppl-card-title-row">
              <span className="ecc-ppl-icon ecc-ppl-icon--amber" aria-hidden>
                <Clock3 className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div>
                <h2 id="ecc-shift-heading" className="ecc-ppl-card-title">
                  Current shift
                </h2>
                <p className="ecc-ppl-card-lede">
                  The active shift and operational coverage for this ECC.
                </p>
              </div>
            </div>
          </header>

          {!hasShift ? (
            <div className="ecc-ppl-empty">
              <span className="ecc-ppl-empty-icon" aria-hidden>
                <Clock3 className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <p className="ecc-ppl-empty-title">No current shift is set</p>
              <p className="ecc-ppl-empty-copy">
                Use &quot;Set current shift&quot; to start one.
              </p>
              <button
                type="button"
                className="ecc-btn ecc-btn-secondary"
                onClick={() => openShiftForm()}
              >
                Set current shift
              </button>
            </div>
          ) : (
            <div className="ecc-ppl-shift-body">
              <div className="ecc-ppl-shift-meta">
                <div>
                  <p className="ecc-ppl-metric-label">Shift</p>
                  <p className="ecc-ppl-metric-value">{current!.shift!.label}</p>
                </div>
                <div>
                  <p className="ecc-ppl-metric-label">Start</p>
                  <p className="ecc-ppl-metric-value">
                    {formatEccWhen(current!.shift!.startsAt)}
                  </p>
                </div>
                <div>
                  <p className="ecc-ppl-metric-label">End</p>
                  <p className="ecc-ppl-metric-value">
                    {formatEccWhen(current!.shift!.endsAt)}
                  </p>
                </div>
              </div>
              <div>
                <p className="ecc-ppl-metric-label">Assigned agents</p>
                <ul className="ecc-ppl-assigned-list">
                  {current!.shift!.assignedPersonIds.length === 0 ? (
                    <li className="ecc-muted">None assigned</li>
                  ) : (
                    current!.shift!.assignedPersonIds.map((id) => {
                      const agent = agentOptions.find((row) => row.id === id);
                      return <li key={id}>{agent?.name ?? id}</li>;
                    })
                  )}
                </ul>
                <button
                  type="button"
                  className="ecc-btn ecc-btn-secondary ecc-btn-sm ecc-ppl-assign-cta"
                  onClick={() => openShiftForm()}
                >
                  {current!.shift!.assignedPersonIds.length === 0
                    ? "Assign agents"
                    : "Update assignments"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section
          className="ecc-ppl-card"
          aria-labelledby="ecc-coverage-heading"
        >
          <header className="ecc-ppl-card-head ecc-ppl-card-head--stack">
            <div className="ecc-ppl-card-title-row">
              <span className="ecc-ppl-icon ecc-ppl-icon--violet" aria-hidden>
                <BarChart3 className="h-4 w-4" strokeWidth={1.75} />
              </span>
              <div>
                <h2 id="ecc-coverage-heading" className="ecc-ppl-card-title">
                  Shift coverage
                </h2>
                <p className="ecc-ppl-card-lede">
                  Live staffing for the current shift.
                </p>
              </div>
            </div>
          </header>

          <div className="ecc-ppl-coverage-grid">
            <div>
              <p className="ecc-ppl-metric-label">Assigned agents</p>
              <p className="ecc-ppl-metric-value">
                {hasShift ? current!.agentsAssigned : "—"}
              </p>
            </div>
            <div>
              <p className="ecc-ppl-metric-label">Signed in</p>
              <p className="ecc-ppl-metric-value">
                {hasShift ? current!.agentsSignedIn : "—"}
              </p>
            </div>
            <div>
              <p className="ecc-ppl-metric-label">Signed out</p>
              <p className="ecc-ppl-metric-value">
                {hasShift ? (signedOutCount ?? 0) : "—"}
              </p>
            </div>
            <div>
              <p className="ecc-ppl-metric-label">Coverage</p>
              <p className="ecc-ppl-metric-value">
                {hasShift
                  ? ECC_SHIFT_COVERAGE_LABELS[current!.coverageStatus]
                  : "—"}
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* 3. Agents */}
      <section className="ecc-ppl-card" aria-labelledby="ecc-agents-heading">
        <header className="ecc-ppl-card-head">
          <div>
            <h2 id="ecc-agents-heading" className="ecc-ppl-card-title">
              Agents
            </h2>
            <p className="ecc-ppl-card-lede">
              Operational staffing register with sign-in and sign-out.
            </p>
          </div>
          <div className="ecc-ppl-toolbar">
            <input
              type="search"
              className="ecc-ppl-search"
              placeholder="Search agents…"
              value={agentQuery}
              onChange={(e) => setAgentQuery(e.target.value)}
              aria-label="Search agents"
            />
            <select
              className="ecc-ppl-filter"
              value={agentStatusFilter}
              onChange={(e) =>
                setAgentStatusFilter(
                  e.target.value as "all" | EccAgentDutyStatus
                )
              }
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              {(
                Object.keys(ECC_AGENT_DUTY_STATUS_LABELS) as EccAgentDutyStatus[]
              ).map((status) => (
                <option key={status} value={status}>
                  {ECC_AGENT_DUTY_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="ecc-ppl-table-wrap">
          <table className="ecc-reg-table ecc-ppl-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Shift</th>
                <th>Status</th>
                <th>Sign-in</th>
                <th>Sign-out</th>
                <th className="ecc-reg-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot?.agents.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="ecc-ppl-empty ecc-ppl-empty--table">
                      <span className="ecc-ppl-empty-icon" aria-hidden>
                        <Users className="h-5 w-5" strokeWidth={1.6} />
                      </span>
                      <p className="ecc-ppl-empty-title">
                        No agents recorded yet
                      </p>
                      <p className="ecc-ppl-empty-copy">
                        Add people and assign them the Agent role.
                      </p>
                      <button
                        type="button"
                        className="ecc-btn ecc-btn-primary"
                        onClick={() => startAddPerson("agent")}
                      >
                        + Add person
                      </button>
                    </div>
                  </td>
                </tr>
              ) : visibleAgents.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="ecc-ppl-empty ecc-ppl-empty--table">
                      <p className="ecc-ppl-empty-title">No matching agents</p>
                      <p className="ecc-ppl-empty-copy">
                        Adjust search or status filter.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleAgents.map((row) => {
                  const recent = snapshot!.recentAttendance.find(
                    (entry) =>
                      entry.personId === row.person.id &&
                      entry.status === "signed_out"
                  );
                  const signedOutAt =
                    row.dutyStatus === "signed_out"
                      ? recent?.signedOutAt
                      : undefined;
                  const signedInDisplay =
                    row.signedInAt ??
                    (row.dutyStatus === "signed_out"
                      ? recent?.signedInAt
                      : undefined);
                  const isAssigned = assignedSet.has(row.person.id);
                  return (
                    <tr key={row.person.id}>
                      <td>
                        <p className="ecc-reg-title">{row.person.name}</p>
                        <p className="ecc-reg-sub">{row.person.id}</p>
                      </td>
                      <td className="ecc-reg-cell-muted">
                        {ECC_PERSON_ROLE_LABELS[row.person.role]}
                      </td>
                      <td className="ecc-reg-cell-muted">
                        {row.shiftLabel ?? "—"}
                      </td>
                      <td>
                        <span
                          className={`ecc-people-duty is-${dutyTone(row.dutyStatus)}`}
                        >
                          {ECC_AGENT_DUTY_STATUS_LABELS[row.dutyStatus]}
                        </span>
                      </td>
                      <td className="ecc-reg-cell-muted">
                        {signedInDisplay
                          ? formatEccWhen(signedInDisplay)
                          : "—"}
                      </td>
                      <td className="ecc-reg-cell-muted">
                        {signedOutAt ? formatEccWhen(signedOutAt) : "—"}
                      </td>
                      <td className="ecc-reg-actions">
                        <div className="ecc-people-signin">
                          {!isAssigned ? (
                            <button
                              type="button"
                              className="ecc-btn ecc-btn-secondary ecc-btn-sm"
                              disabled={saving}
                              onClick={() =>
                                void onAssignAgentToCurrentShift(row.person.id)
                              }
                            >
                              {hasShift ? "Assign to shift" : "Set shift"}
                            </button>
                          ) : null}
                          {row.openAttendanceId ? (
                            <>
                              <span className="ecc-people-signin-copy">
                                {row.staleOpenAttendance
                                  ? "Earlier sign-in not closed"
                                  : "Signed in"}
                                {row.signedInAt
                                  ? ` · ${formatEccWhen(row.signedInAt)}`
                                  : ""}
                              </span>
                              <button
                                type="button"
                                className="ecc-btn ecc-btn-secondary ecc-btn-sm"
                                disabled={saving}
                                onClick={() => void onSignOut(row.person.id)}
                              >
                                Sign out
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="ecc-btn ecc-btn-primary ecc-btn-sm"
                              disabled={saving || row.person.status !== "active"}
                              onClick={() => void onSignIn(row.person.id)}
                            >
                              Sign in
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Recent attendance */}
      <section
        className="ecc-ppl-card"
        aria-labelledby="ecc-attendance-heading"
      >
        <header className="ecc-ppl-card-head">
          <div>
            <h2 id="ecc-attendance-heading" className="ecc-ppl-card-title">
              Recent attendance
            </h2>
            <p className="ecc-ppl-card-lede">
              Operational attendance history for this centre.
            </p>
          </div>
          {(snapshot?.recentAttendance.length ?? 0) > 8 ? (
            <button
              type="button"
              className="ecc-ppl-text-link"
              onClick={() => setShowAllAttendance((value) => !value)}
            >
              {showAllAttendance ? "Show less" : "View all"}{" "}
              <span aria-hidden>›</span>
            </button>
          ) : null}
        </header>

        <div className="ecc-ppl-table-wrap">
          <table className="ecc-reg-table ecc-ppl-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Person</th>
                <th>Shift</th>
                <th>Sign-in</th>
                <th>Sign-out</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="ecc-ppl-empty ecc-ppl-empty--table">
                      <span className="ecc-ppl-empty-icon" aria-hidden>
                        <FileText className="h-5 w-5" strokeWidth={1.6} />
                      </span>
                      <p className="ecc-ppl-empty-title">
                        No attendance recorded yet
                      </p>
                      <p className="ecc-ppl-empty-copy">
                        Attendance records will appear here once agents sign
                        in.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                attendanceRows.map((row) => (
                  <tr key={row.id}>
                    <td className="ecc-reg-cell-muted">{row.attendanceDate}</td>
                    <td>
                      <p className="ecc-reg-title">{row.personName}</p>
                    </td>
                    <td className="ecc-reg-cell-muted">
                      {row.shiftLabel ?? "—"}
                    </td>
                    <td className="ecc-reg-cell-muted">
                      {row.signedInAt ? formatEccWhen(row.signedInAt) : "—"}
                    </td>
                    <td className="ecc-reg-cell-muted">
                      {row.signedOutAt ? formatEccWhen(row.signedOutAt) : "—"}
                    </td>
                    <td>
                      <span
                        className={`ecc-people-duty is-${dutyTone(row.status)}`}
                      >
                        {ECC_AGENT_DUTY_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <EccRecentAuditFeed
        title="People activity"
        entityTypes={["person", "shift", "attendance"]}
      />
    </div>
  );
}

function ManagementRolePanel({
  accent,
  title,
  description,
  people,
  emptyTitle,
  emptyCopy,
  actionLabel,
  onAdd,
}: {
  accent: "blue" | "green";
  title: string;
  description: string;
  people: EccPerson[];
  emptyTitle: string;
  emptyCopy: string;
  actionLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="ecc-ppl-role-panel">
      <div className="ecc-ppl-role-head">
        <span
          className={`ecc-ppl-icon ecc-ppl-icon--${accent}`}
          aria-hidden
        >
          <UserRound className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div>
          <h3 className="ecc-ppl-role-title">{title}</h3>
          <p className="ecc-ppl-role-desc">{description}</p>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="ecc-ppl-empty ecc-ppl-empty--panel">
          <span className="ecc-ppl-empty-icon" aria-hidden>
            <UserPlus className="h-5 w-5" strokeWidth={1.6} />
          </span>
          <p className="ecc-ppl-empty-title">{emptyTitle}</p>
          <p className="ecc-ppl-empty-copy">{emptyCopy}</p>
          <button
            type="button"
            className="ecc-btn ecc-btn-secondary"
            onClick={onAdd}
          >
            {actionLabel}
          </button>
        </div>
      ) : (
        <ul className="ecc-ppl-person-list">
          {people.map((person) => (
            <li key={person.id} className="ecc-ppl-person-row">
              <div>
                <p className="ecc-reg-title">{person.name}</p>
                <p className="ecc-reg-sub">
                  {person.contactEmail?.trim() ||
                    person.contactPhone?.trim() ||
                    person.id}
                </p>
              </div>
              <span
                className={`ecc-people-duty is-${person.status === "active" ? "ok" : "neutral"}`}
              >
                {person.status === "active" ? "Active" : "Inactive"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
