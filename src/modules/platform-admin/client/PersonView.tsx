"use client";

import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { useToast } from "@/components/ui/Toast";
import { V1_OPERATING_ROLES, v1OperatingRoleLabel } from "@/lib/access/roles";
import type { ProfileStatus } from "@/lib/auth/types";
import { CAPABILITY_DOMAINS, describeCapability } from "../capabilityCatalog";
import type { AdminAuditPage, AdminFacilityAssignment, AdminPersonDetail, OffboardResult, ProfileStatusResult } from "../types";
import { AdminApiError, adminCall } from "./adminApi";
import { useAdminConsole } from "./AdminConsoleContext";
import { AuditFeed } from "./AuditFeed";
import { FinanceAccess } from "./FinanceAccess";
import { ContextStrip, DataBoundary, Note, PageHead, Section, StatusMark, displayName, useAdminData } from "./ui";

type StatusAction = { to: Exclude<ProfileStatus, "invited">; label: string; title: string; consequence: string; danger?: boolean };

const STATUS_ACTIONS: Record<ProfileStatus, StatusAction[]> = {
  active: [
    { to: "suspended", label: "Suspend", title: "Suspend this person?", consequence: "Sign-in is disabled and they cannot act on the platform. Their grants and assignments are kept, and you can reactivate them." },
    { to: "inactive", label: "Deactivate", title: "Deactivate this person?", consequence: "Sign-in is disabled and their profile becomes inactive. Their grants and assignments are kept, and you can reactivate them." },
  ],
  suspended: [
    { to: "active", label: "Reactivate", title: "Reactivate this person?", consequence: "Sign-in is restored. Their existing grants and assignments apply again." },
    { to: "inactive", label: "Deactivate", title: "Deactivate this person?", consequence: "Their profile becomes inactive. Sign-in stays disabled." },
  ],
  inactive: [
    { to: "active", label: "Reactivate", title: "Reactivate this person?", consequence: "Sign-in is restored. Any grants that were revoked (for example by offboarding) are not restored." },
    { to: "suspended", label: "Suspend", title: "Suspend this person?", consequence: "Their profile becomes suspended. Sign-in stays disabled." },
  ],
  invited: [
    { to: "suspended", label: "Suspend", title: "Suspend this invitation?", consequence: "The invited profile is suspended and sign-in is disabled." },
    { to: "inactive", label: "Deactivate", title: "Deactivate this invitation?", consequence: "The invited profile becomes inactive and sign-in is disabled." },
  ],
};

export function PersonView({ profileId }: { profileId: string }) {
  const { organisation, actorProfileId } = useAdminConsole();
  const q = organisation ? `?org=${organisation.id}` : "";
  const person = useAdminData<AdminPersonDetail>(
    (signal) => adminCall<AdminPersonDetail>("getPerson", { organisationId: organisation!.id, profileId }, signal),
    [organisation?.id, profileId]
  );
  const history = useAdminData<AdminAuditPage>(
    (signal) => adminCall<AdminAuditPage>("listAudit", { organisationId: organisation!.id, profileId, limit: 6 }, signal),
    [organisation?.id, profileId]
  );
  const [pending, setPending] = useState<StatusAction | null>(null);
  const [offboarding, setOffboarding] = useState(false);
  const [assigning, setAssigning] = useState<{ assignment?: AdminFacilityAssignment } | null>(null);
  const isSelf = profileId === actorProfileId;
  const refresh = () => {
    person.reload();
    history.reload();
  };

  return (
    <div className="ac-page">
      <ContextStrip />
      {!organisation ? (
        <div className="ac-state">Select an organisation.</div>
      ) : (
        <DataBoundary state={person} onRetry={person.reload} what="this person">
          {(p) => (
            <>
              <PageHead
                back={{ href: `/admin/people${q}`, label: "People" }}
                title={displayName(p)}
                lede={p.email ?? undefined}
                actions={
                  <>
                    {STATUS_ACTIONS[p.status].map((a) => (
                      <button key={a.to} type="button" className="ac-btn ac-btn-secondary" disabled={isSelf} onClick={() => setPending(a)}>
                        {a.label}
                      </button>
                    ))}
                  </>
                }
              />
              {isSelf ? <Note>This is your own identity. You cannot suspend, deactivate or offboard yourself.</Note> : null}

              <div className="ac-person-grid" style={{ marginTop: isSelf ? 24 : 0 }}>
                <Section title="Identity">
                  <dl className="ac-kv">
                    <dt>Status</dt>
                    <dd><StatusMark status={p.status} /></dd>
                    <dt>Email</dt>
                    <dd>{p.email ?? "No email on record"}</dd>
                    <dt>Job title</dt>
                    <dd>{p.jobTitle ?? "—"} <span className="ac-secondary">(descriptive)</span></dd>
                    <dt>Organisation</dt>
                    <dd>{p.organisationName}</dd>
                    <dt>Organisation role</dt>
                    <dd>{p.organisationRoles.length ? p.organisationRoles.join(", ") : "—"} <span className="ac-secondary">(descriptive, not permission)</span></dd>
                    <dt>Platform identity id</dt>
                    <dd className="ac-secondary" style={{ fontFamily: "var(--font-mono, monospace)" }}>{p.profileId}</dd>
                  </dl>
                </Section>

                <Section title="Access" aside={<Link href={`/admin/access${q}${q ? "&" : "?"}person=${p.profileId}`}>Manage access</Link>}>
                  <dl className="ac-kv">
                    <dt>Platform authority</dt>
                    <dd>
                      {p.isPlatformSuperAdmin ? (
                        <>
                          <span className="ac-tag ac-tag-platform">Super Admin</span>{" "}
                          <span className="ac-secondary">administers the platform; carries no business capability</span>
                        </>
                      ) : (
                        <span className="ac-secondary">None</span>
                      )}
                    </dd>
                    <dt>Business capabilities</dt>
                    <dd>
                      {p.capabilities.length === 0 ? (
                        <span className="ac-secondary">No explicit grants</span>
                      ) : (
                        <span className="ac-num">{p.capabilities.length} explicit {p.capabilities.length === 1 ? "grant" : "grants"}</span>
                      )}
                    </dd>
                  </dl>
                  {p.capabilities.length > 0 ? <GrantSummary capabilities={p.capabilities} /> : null}
                  <div style={{ marginTop: 16 }}>
                    <p className="ac-section-title" style={{ marginBottom: 4 }}>Platform Finance access · read-only</p>
                    <FinanceAccess access={p.financeAccess} />
                    <p className="ac-secondary" style={{ marginTop: 6 }}>Finance access is managed within Platform Finance, not here.</p>
                  </div>
                </Section>

                <Section
                  className="ac-wide"
                  title="Operating context"
                  aside={
                    p.status === "active" ? (
                      <button type="button" className="ac-btn ac-btn-secondary ac-btn-sm" onClick={() => setAssigning({})}>
                        Assign to a facility
                      </button>
                    ) : undefined
                  }
                >
                  <Note>
                    Where and in what capacity this person works. An operating role such as “Facility Manager” describes context — <strong>it grants no access</strong>. Access comes only from explicit capability grants.
                  </Note>
                  {p.facilityAssignments.length === 0 ? (
                    <div className="ac-state">No facility assignments.</div>
                  ) : (
                    <div className="ac-table-wrap" style={{ marginTop: 8 }}>
                      <table className="ac-table">
                        <thead>
                          <tr>
                            <th scope="col">Facility</th>
                            <th scope="col">Operating role</th>
                            <th scope="col">Assignment</th>
                            <th scope="col"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.facilityAssignments.map((a) => (
                            <tr key={a.assignmentId}>
                              <td>{a.facilityName}</td>
                              <td>{v1OperatingRoleLabel(a.operationalRole as never)}</td>
                              <td><span className={a.status === "active" ? "ac-mark ac-mark-ok" : "ac-mark ac-mark-neutral"}>{a.status === "active" ? "Active" : "Inactive"}</span></td>
                              <td style={{ textAlign: "right" }}>
                                <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" onClick={() => setAssigning({ assignment: a })}>
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>

                <Section className="ac-wide" title="Administrative history" aside={<Link href={`/admin/audit${q}${q ? "&" : "?"}person=${p.profileId}`}>All history for this person</Link>}>
                  <DataBoundary
                    state={history}
                    onRetry={history.reload}
                    what="history"
                    isEmpty={(d) => d.events.length === 0}
                    empty={<>No administrative changes have been recorded for this person.</>}
                  >
                    {(d) => <AuditFeed events={d.events} orgParam={q} />}
                  </DataBoundary>
                </Section>
              </div>

              {!isSelf && p.status !== "inactive" ? (
                <div className="ac-danger-zone">
                  <p className="ac-section-title">Offboarding</p>
                  <p className="ac-secondary" style={{ maxWidth: "60ch", margin: "6px 0 12px" }}>
                    Ends this person’s platform access: revokes every capability and finance grant, deactivates their facility assignments, and disables sign-in. It is not the same as deactivating.
                  </p>
                  <button type="button" className="ac-btn ac-btn-danger-quiet" onClick={() => setOffboarding(true)}>
                    Offboard {displayName(p)}…
                  </button>
                </div>
              ) : null}

              <StatusDialog action={pending} person={p} organisationId={organisation.id} onClose={() => setPending(null)} onDone={refresh} />
              <OffboardDialog open={offboarding} person={p} onClose={() => setOffboarding(false)} onDone={refresh} />
              <AssignmentDialog
                state={assigning}
                person={p}
                organisationId={organisation.id}
                onClose={() => setAssigning(null)}
                onDone={refresh}
              />
            </>
          )}
        </DataBoundary>
      )}
    </div>
  );
}

function GrantSummary({ capabilities }: { capabilities: string[] }) {
  return (
    <div className="ac-cap-chips">
      {capabilities.map((c) => {
        const d = describeCapability(c);
        return (
          <span key={c} className="ac-tag" title={c}>
            {d.label}
          </span>
        );
      })}
    </div>
  );
}

function StatusDialog({
  action,
  person,
  organisationId,
  onClose,
  onDone,
}: {
  action: StatusAction | null;
  person: AdminPersonDetail;
  organisationId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  void organisationId;

  function close() {
    if (busy) return;
    setError(null);
    onClose();
  }
  async function confirm() {
    if (!action || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminCall<ProfileStatusResult>("setProfileStatus", { profileId: person.profileId, status: action.to });
      toast({
        type: res.authSignInDisabled === null || res.authSignInDisabled === (action.to !== "active") ? "success" : "warning",
        title: `${displayName(person)} is now ${res.status}`,
        description: res.changed ? undefined : "No change was needed.",
      });
      setError(null);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "The status could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={action !== null}
      onClose={close}
      title={action?.title ?? ""}
      description={displayName(person)}
      size="md"
      footer={
        <>
          <button type="button" className="ac-btn ac-btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="ac-btn ac-btn-primary" onClick={confirm} disabled={busy}>
            {busy ? "Applying…" : action?.label}
          </button>
        </>
      }
    >
      <p className="ac-secondary" style={{ fontSize: 13, lineHeight: 1.55 }}>{action?.consequence}</p>
      {error ? <p className="ac-form-error" role="alert">{error}</p> : null}
    </Modal>
  );
}

function OffboardDialog({ open, person, onClose, onDone }: { open: boolean; person: AdminPersonDetail; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const expected = displayName(person);

  function close() {
    if (busy) return;
    setTyped("");
    setError(null);
    onClose();
  }
  async function confirm() {
    if (busy || typed.trim() !== expected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminCall<OffboardResult>("offboardUser", { profileId: person.profileId });
      toast({
        type: res.fullyOffboarded ? "success" : "warning",
        title: res.fullyOffboarded ? `${expected} was offboarded` : `${expected} was offboarded — follow-up needed`,
        description: res.fullyOffboarded ? undefined : `Outstanding: ${res.followUpRequired.join(", ").replaceAll("_", " ")}`,
      });
      setTyped("");
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Offboarding could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Offboard ${expected}?`}
      description="This ends their platform access."
      size="md"
      footer={
        <>
          <button type="button" className="ac-btn ac-btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="ac-btn ac-btn-danger" onClick={confirm} disabled={busy || typed.trim() !== expected}>
            {busy ? "Offboarding…" : "Offboard"}
          </button>
        </>
      }
    >
      <ul style={{ margin: "0 0 12px 1rem", padding: 0, fontSize: 13, lineHeight: 1.6 }}>
        <li>Revokes every platform capability grant and Platform Finance grant, company and account access.</li>
        <li>Deactivates their facility assignments and operational identity link.</li>
        <li>Sets the profile to inactive and disables sign-in.</li>
        <li><strong>Revoked grants are not restored</strong> if the person is later reactivated.</li>
      </ul>
      <div className="ac-field">
        <label htmlFor="ac-offboard-confirm">Type <strong>{expected}</strong> to confirm</label>
        <input id="ac-offboard-confirm" className="ac-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </div>
      {error ? <p className="ac-form-error" role="alert">{error}</p> : null}
    </Modal>
  );
}

function AssignmentDialog({
  state,
  person,
  organisationId,
  onClose,
  onDone,
}: {
  state: { assignment?: AdminFacilityAssignment } | null;
  person: AdminPersonDetail;
  organisationId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const editing = state?.assignment;
  const [facilityId, setFacilityId] = useState("");
  const [role, setRole] = useState<string>("fm_staff");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const facilities = useAdminData<Array<{ id: string; name: string; status: string }>>(
    (signal) => (state ? adminCall("listFacilities", { organisationId }, signal) : Promise.resolve([])),
    [state !== null, organisationId]
  );
  const [seed, setSeed] = useState<string | null>(null);
  const seedKey = state ? `${editing?.assignmentId ?? "new"}` : null;
  if (seedKey !== seed) {
    setSeed(seedKey);
    setError(null);
    setFacilityId(editing?.facilityId ?? "");
    setRole(editing?.operationalRole ?? "fm_staff");
    setStatus(editing?.status ?? "active");
  }

  function close() {
    if (busy) return;
    onClose();
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminCall("setFacilityAssignment", {
        organisationId,
        profileId: person.profileId,
        facilityId: editing?.facilityId ?? facilityId,
        assignmentId: editing?.assignmentId,
        operationalRole: role,
        status,
      });
      toast({ type: "success", title: editing ? "Assignment updated" : "Assignment saved", description: "Recorded in administrative history." });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "The assignment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={state !== null}
      onClose={close}
      title={editing ? "Edit assignment" : "Assign to a facility"}
      description="Operating context only — this does not grant or remove any access."
      size="md"
      footer={
        <>
          <button type="button" className="ac-btn ac-btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="ac-assign-form" className="ac-btn ac-btn-primary" disabled={busy || (!editing && !facilityId)}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="ac-assign-form" onSubmit={save}>
        <div className="ac-field">
          <label htmlFor="ac-asg-facility">Facility</label>
          {editing ? (
            <span>{editing.facilityName}</span>
          ) : facilities.error ? (
            <p className="ac-form-error" role="alert">Couldn’t load facilities. {facilities.error}</p>
          ) : (
            <select id="ac-asg-facility" className="ac-select" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} disabled={facilities.loading} required>
              <option value="">{facilities.loading ? "Loading facilities…" : "Select a facility"}</option>
              {(facilities.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="ac-field">
          <label htmlFor="ac-asg-role">Operating role</label>
          <select id="ac-asg-role" className="ac-select" value={role} onChange={(e) => setRole(e.target.value)}>
            {V1_OPERATING_ROLES.map((r) => (
              <option key={r} value={r}>
                {v1OperatingRoleLabel(r)}
              </option>
            ))}
          </select>
          <span className="ac-hint">Describes their capacity at the facility. Permissions come only from explicit grants.</span>
        </div>
        <div className="ac-field">
          <label htmlFor="ac-asg-status">Assignment</label>
          <select id="ac-asg-status" className="ac-select" value={status} onChange={(e) => setStatus(e.target.value as "active" | "inactive")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        {error ? <p className="ac-form-error" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}

export { CAPABILITY_DOMAINS };
