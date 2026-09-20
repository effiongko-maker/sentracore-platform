"use client";

import Link from "next/link";
import { Activity, Building2, KeyRound, UserRound } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { useToast } from "@/components/ui/Toast";
import { V1_OPERATING_ROLES, v1OperatingRoleLabel } from "@/lib/access/roles";
import type { ProfileStatus } from "@/lib/auth/types";
import { CAPABILITY_DOMAINS, describeCapability } from "../capabilityCatalog";
import { LANDING_WORKSPACES, LANDING_WORKSPACE_LABEL, type LandingWorkspace } from "@/lib/access/landingWorkspace";
import type { AccessScopeResult, LandingWorkspaceResult, AdminAuditPage, AdminFacilityAssignment, AdminPersonDetail, OffboardResult, OrganisationAdminRecord, ProfileStatusResult } from "../types";
import { AdminApiError, adminCall } from "./adminApi";
import { useAdminConsole } from "./AdminConsoleContext";
import { AuditFeed } from "./AuditFeed";
import { FinanceAccess } from "./FinanceAccess";
import { ContextStrip, DataBoundary, Note, OrgGate, PageHead, displayName, useAdminData } from "./ui";
import { Avatar, Panel, Pill, StatusPill } from "./kit";

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
  return (
    <div className="ac-page">
      <ContextStrip />
      <OrgGate title="Person" lede={LEDE}>
        {(organisation) => <PersonBody organisation={organisation} profileId={profileId} />}
      </OrgGate>
    </div>
  );
}

const LEDE = "Identity, access and operating context — administered separately.";

function PersonBody({ organisation, profileId }: { organisation: OrganisationAdminRecord; profileId: string }) {
  const { actorProfileId } = useAdminConsole();
  const q = `?org=${organisation.id}`;
  const person = useAdminData<AdminPersonDetail>(
    (signal) => adminCall<AdminPersonDetail>("getPerson", { organisationId: organisation.id, profileId }, signal),
    [organisation.id, profileId]
  );
  const history = useAdminData<AdminAuditPage>(
    (signal) => adminCall<AdminAuditPage>("listAudit", { organisationId: organisation.id, profileId, limit: 6 }, signal),
    [organisation.id, profileId]
  );
  const [pending, setPending] = useState<StatusAction | null>(null);
  const [offboarding, setOffboarding] = useState(false);
  const [scoping, setScoping] = useState(false);
  const [landing, setLanding] = useState(false);
  const [assigning, setAssigning] = useState<{ assignment?: AdminFacilityAssignment } | null>(null);
  const isSelf = profileId === actorProfileId;
  const refresh = () => {
    person.reload();
    history.reload();
  };

  return (
    <DataBoundary state={person} onRetry={person.reload} what="this person">
      {(p) => {
        const activeAssignments = p.facilityAssignments.filter((a) => a.status === "active").length;
        return (
          <>
            <PageHead back={{ href: `/admin/people${q}`, label: "People" }} title={displayName(p)} lede={LEDE} />
            <Panel className="ac-hero-panel">
              <div className="ac-hero">
                <Avatar name={displayName(p)} size="lg" platform={p.isPlatformSuperAdmin} muted={p.status !== "active"} />
                <div className="ac-hero-text">
                  <h2 className="ac-hero-name">{displayName(p)}</h2>
                  <div className="ac-hero-sub">
                    <span>{p.email ?? "No email on record"}</span>
                    {p.jobTitle ? <span>· {p.jobTitle}</span> : null}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                    <StatusPill status={p.status} />
                    {p.isPlatformSuperAdmin ? <Pill tone="platform" title="Administers the platform; carries no business capability">Super Admin</Pill> : null}
                    <Pill tone="plain">{p.capabilities.length} explicit {p.capabilities.length === 1 ? "grant" : "grants"}</Pill>
                    <Pill tone="plain">{activeAssignments} active {activeAssignments === 1 ? "assignment" : "assignments"}</Pill>
                  </div>
                </div>
                <div className="ac-actions">
                  <Link href={`/admin/access${q}&person=${p.profileId}`} className="ac-btn ac-btn-secondary">
                    Manage access
                  </Link>
                  {STATUS_ACTIONS[p.status].map((a) => (
                    <button key={a.to} type="button" className="ac-btn ac-btn-secondary" disabled={isSelf} onClick={() => setPending(a)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </Panel>
            {isSelf ? (
              <div style={{ marginTop: 12 }}>
                <Note>This is your own identity. You cannot suspend, deactivate or offboard yourself.</Note>
              </div>
            ) : null}

            <div className="ac-cols ac-cols-detail" style={{ marginTop: 16 }}>
              <div className="ac-stack">
                <Panel title="Access" icon={KeyRound} aside={<Link href={`/admin/access${q}&person=${p.profileId}`}>Manage access</Link>}>
                  <dl className="ac-kv">
                    <dt>Platform authority</dt>
                    <dd>
                      {p.isPlatformSuperAdmin ? (
                        <>
                          <Pill tone="platform">Super Admin</Pill>{" "}
                          <span className="ac-secondary">administers the platform; carries no business capability</span>
                        </>
                      ) : (
                        <span className="ac-secondary">None</span>
                      )}
                    </dd>
                    <dt>Access scope</dt>
                    <dd>
                      {p.accessScope === "module" ? (
                        <>
                          <Pill tone="plain">Module-bound</Pill>{" "}
                          <span className="ac-secondary">
                            {p.homeModule === "ecc_operations" ? "ECC Operations" : p.homeModule === "facility_management" ? "Facility Management" : "Invalid home module"} only
                          </span>
                        </>
                      ) : (
                        <>
                          <span>Platform</span>{" "}
                          <span className="ac-secondary">not restricted to one module</span>
                        </>
                      )}{" "}
                      {!isSelf && !p.isPlatformSuperAdmin ? (
                        <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" onClick={() => setScoping(true)}>
                          Change
                        </button>
                      ) : null}
                    </dd>
                    <dt>Landing workspace</dt>
                    <dd>
                      {p.accessScope === "module" ? (
                        <span className="ac-secondary">Not applicable — module-bound people always start in their home module</span>
                      ) : (
                        <>
                          <span>{p.landingWorkspace && p.landingWorkspace in LANDING_WORKSPACE_LABEL ? LANDING_WORKSPACE_LABEL[p.landingWorkspace as LandingWorkspace] : "Platform Home"}</span>{" "}
                          <span className="ac-secondary">a starting-point preference; it grants no access</span>{" "}
                          {!isSelf ? (
                            <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" onClick={() => setLanding(true)}>
                              Change
                            </button>
                          ) : null}
                        </>
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
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--ac-rule)" }}>
                    <p className="ac-secondary" style={{ margin: "0 0 6px", fontWeight: 600 }}>Platform Finance access · read-only</p>
                    <FinanceAccess access={p.financeAccess} />
                    <p className="ac-secondary" style={{ marginTop: 6 }}>Finance access is managed within Platform Finance, not here.</p>
                  </div>
                </Panel>

                <Panel
                  title="Operating context"
                  icon={Building2}
                  flush
                  aside={
                    p.status === "active" ? (
                      <button type="button" className="ac-btn ac-btn-secondary ac-btn-sm" onClick={() => setAssigning({})}>
                        Assign to a facility
                      </button>
                    ) : undefined
                  }
                >
                  <div style={{ padding: "12px 16px" }}>
                    <Note>
                      Where and in what capacity this person works. An operating role such as “Facility Manager” describes context — <strong>it grants no access</strong>. Access comes only from explicit capability grants.
                    </Note>
                  </div>
                  {p.facilityAssignments.length === 0 ? (
                    <div className="ac-state">No facility assignments.</div>
                  ) : (
                    <div className="ac-table-wrap">
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
                              <td><b>{a.facilityName}</b></td>
                              <td>{v1OperatingRoleLabel(a.operationalRole as never)}</td>
                              <td><Pill tone={a.status === "active" ? "ok" : "neutral"}>{a.status === "active" ? "Active" : "Inactive"}</Pill></td>
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
                </Panel>

                <Panel title="Administrative history" icon={Activity} flush aside={<Link href={`/admin/audit${q}&person=${p.profileId}`}>All history for this person</Link>}>
                  <DataBoundary
                    state={history}
                    onRetry={history.reload}
                    what="history"
                    isEmpty={(d) => d.events.length === 0}
                    empty={<>No administrative changes have been recorded for this person.</>}
                  >
                    {(d) => <AuditFeed events={d.events} orgParam={q} />}
                  </DataBoundary>
                </Panel>
              </div>

              <div className="ac-stack">
                <Panel title="Identity" icon={UserRound}>
                  <dl className="ac-kv" style={{ gridTemplateColumns: "1fr" }}>
                    <div><dt className="ac-secondary">Status</dt><dd><StatusPill status={p.status} /></dd></div>
                    <div><dt className="ac-secondary">Email</dt><dd>{p.email ?? "No email on record"}</dd></div>
                    <div><dt className="ac-secondary">Job title <span>(descriptive)</span></dt><dd>{p.jobTitle ?? "—"}</dd></div>
                    <div><dt className="ac-secondary">Organisation</dt><dd>{p.organisationName}</dd></div>
                    <div><dt className="ac-secondary">Organisation role <span>(descriptive, not permission)</span></dt><dd>{p.organisationRoles.length ? p.organisationRoles.join(", ") : "—"}</dd></div>
                    <div><dt className="ac-secondary">Platform identity id</dt><dd className="ac-mono">{p.profileId}</dd></div>
                  </dl>
                </Panel>
              </div>
            </div>

            {!isSelf && p.status !== "inactive" ? (
              <div className="ac-danger">
                <div>
                  <p className="ac-danger-title">Offboarding</p>
                  <p>Ends this person’s platform access: revokes every capability and finance grant, deactivates their facility assignments, and disables sign-in. It is not the same as deactivating.</p>
                </div>
                <button type="button" className="ac-btn ac-btn-danger-quiet" onClick={() => setOffboarding(true)}>
                  Offboard {displayName(p)}…
                </button>
              </div>
            ) : null}

            <LandingDialog open={landing} person={p} onClose={() => setLanding(false)} onDone={refresh} />
            <ScopeDialog open={scoping} person={p} onClose={() => setScoping(false)} onDone={refresh} />
            <StatusDialog action={pending} person={p} organisationId={organisation.id} onClose={() => setPending(null)} onDone={refresh} />
            <OffboardDialog open={offboarding} person={p} onClose={() => setOffboarding(false)} onDone={refresh} />
            <AssignmentDialog state={assigning} person={p} organisationId={organisation.id} onClose={() => setAssigning(null)} onDone={refresh} />
          </>
        );
      }}
    </DataBoundary>
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

function LandingDialog({ open, person, onClose, onDone }: { open: boolean; person: AdminPersonDetail; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState<boolean>(false);
  if (open !== seed) {
    setSeed(open);
    setError(null);
    setValue(person.landingWorkspace ?? "");
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
      const res = await adminCall<LandingWorkspaceResult>("setLandingWorkspace", { profileId: person.profileId, landingWorkspace: value || null });
      toast({ type: "success", title: `Landing workspace updated for ${displayName(person)}`, description: res.changed ? "Recorded in administrative history." : "No change was needed." });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "The landing workspace could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Landing workspace"
      description={displayName(person)}
      size="md"
      footer={
        <>
          <button type="button" className="ac-btn ac-btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="ac-landing-form" className="ac-btn ac-btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="ac-landing-form" onSubmit={save}>
        <div className="ac-field">
          <label htmlFor="ac-landing-select">Where they start</label>
          <select id="ac-landing-select" className="ac-select" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="">Platform Home</option>
            {LANDING_WORKSPACES.map((w) => (
              <option key={w} value={w}>
                {LANDING_WORKSPACE_LABEL[w]}
              </option>
            ))}
          </select>
          <span className="ac-hint">Only used when they can currently enter that workspace; otherwise they see Platform Home. It never grants access.</span>
        </div>
        {error ? <p className="ac-form-error" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}

function ScopeDialog({ open, person, onClose, onDone }: { open: boolean; person: AdminPersonDetail; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [scope, setScope] = useState<"platform" | "module">("platform");
  const [home, setHome] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seed, setSeed] = useState<boolean>(false);
  if (open !== seed) {
    setSeed(open);
    setError(null);
    setScope(person.accessScope);
    setHome(person.homeModule ?? "");
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
      const res = await adminCall<AccessScopeResult>("setAccessScope", {
        profileId: person.profileId,
        accessScope: scope,
        homeModule: scope === "module" ? home : null,
      });
      toast({ type: "success", title: `Access scope updated for ${displayName(person)}`, description: res.changed ? "Recorded in administrative history." : "No change was needed." });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "The access scope could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Access scope"
      description={displayName(person)}
      size="md"
      footer={
        <>
          <button type="button" className="ac-btn ac-btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="ac-scope-form" className="ac-btn ac-btn-primary" disabled={busy || (scope === "module" && !home)}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="ac-scope-form" onSubmit={save}>
        <div className="ac-field">
          <label htmlFor="ac-scope-select">Access scope</label>
          <select id="ac-scope-select" className="ac-select" value={scope} onChange={(e) => setScope(e.target.value as "platform" | "module")}>
            <option value="platform">Platform</option>
            <option value="module">Module-bound</option>
          </select>
          <span className="ac-hint">A module-bound person can only ever reach their home module, whatever grants they hold. Grants still decide what they may do inside it.</span>
        </div>
        {scope === "module" ? (
          <div className="ac-field">
            <label htmlFor="ac-scope-home">Home module</label>
            <select id="ac-scope-home" className="ac-select" value={home} onChange={(e) => setHome(e.target.value)} required>
              <option value="">Select a module</option>
              <option value="facility_management">Facility Management</option>
              <option value="ecc_operations">ECC Operations</option>
            </select>
          </div>
        ) : null}
        {error ? <p className="ac-form-error" role="alert">{error}</p> : null}
      </form>
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
