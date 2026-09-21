"use client";

import { LANDING_OPTIONS, MODULE_BOUND_HOME_OPTIONS, workspaceEntry, workspaceLabel } from "@/lib/access/workspaceRegistry";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { useToast } from "@/components/ui/Toast";
import type { ProfileStatus } from "@/lib/auth/types";
import { v1OperatingRoleLabel } from "@/lib/access/roles";
import type { AdminPersonSummary, CreateAccountResult, OrganisationAdminRecord } from "../types";
import { FACILITY_MANAGER_OPERATING_PACKAGE } from "@/lib/access/facilityManagerPackage";
import { V1_OPERATING_ROLES } from "@/lib/access/roles";
import { TemporaryCredential } from "./TemporaryCredential";
import { AdminApiError, adminCall } from "./adminApi";
import { ContextStrip, DataBoundary, OrgGate, PageHead, displayName, useAdminData } from "./ui";
import { Avatar, Panel, Pill, StatusPill } from "./kit";

const STATUS_FILTERS: Array<{ value: "all" | ProfileStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
];

export function PeopleView() {
  return (
    <div className="ac-page">
      <ContextStrip />
      <OrgGate title="People" lede={LEDE}>
        {(organisation) => <PeopleBody organisation={organisation} />}
      </OrgGate>
    </div>
  );
}

const LEDE = "Platform identities in this organisation. Identity, access and operating context are administered separately.";

function PeopleBody({ organisation }: { organisation: OrganisationAdminRecord }) {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("status");
  const [status, setStatus] = useState<"all" | ProfileStatus>(
    STATUS_FILTERS.some((f) => f.value === initial) ? (initial as ProfileStatus) : "all"
  );
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const state = useAdminData<AdminPersonSummary[]>(
    (signal) => adminCall<AdminPersonSummary[]>("listPeople", { organisationId: organisation.id }, signal),
    [organisation.id]
  );
  const q = `?org=${organisation.id}`;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (state.data ?? []).filter(
      (p) =>
        (status === "all" || p.status === status) &&
        (!needle || `${p.fullName ?? ""} ${p.email ?? ""} ${p.jobTitle ?? ""}`.toLowerCase().includes(needle))
    );
  }, [state.data, status, query]);

  return (
    <>
      <PageHead
        title="People"
        lede={LEDE}
        actions={
          <button type="button" className="ac-btn ac-btn-primary" onClick={() => setCreating(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Create account
          </button>
        }
      />
      <DataBoundary
        state={state}
        onRetry={state.reload}
        what="people"
        isEmpty={(d) => d.length === 0}
        empty={
          <>
            <p className="ac-state-title">No people are attached to this organisation</p>
            <p>Create the first account to begin. It is created in {organisation.name} with a temporary password you give them — no email is sent.</p>
          </>
        }
      >
        {() => (
          <Panel flush>
            <div className="ac-toolbar">
              <label className="ac-search">
                <Search className="h-3.5 w-3.5" aria-hidden />
                <input type="search" className="ac-input" placeholder="Search name, email or job title" aria-label="Search people" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <select className="ac-select" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <span className="ac-toolbar-spacer" />
              <span className="ac-secondary" role="status">
                {rows.length} of {state.data?.length ?? 0} {(state.data?.length ?? 0) === 1 ? "person" : "people"}
              </span>
            </div>
            {rows.length === 0 ? (
              <div className="ac-state">No one matches these filters.</div>
            ) : (
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead>
                    <tr>
                      <th scope="col">Person</th>
                      <th scope="col">Status</th>
                      <th scope="col">Access</th>
                      <th scope="col">Operating context</th>
                      <th scope="col"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const active = p.facilityAssignments.filter((a) => a.status === "active");
                      const href = `/admin/people/${p.profileId}${q}`;
                      return (
                        <tr key={p.profileId} className="ac-row-link" onClick={() => router.push(href)}>
                          <td>
                            <div className="ac-person">
                              <Avatar name={displayName(p)} platform={p.isPlatformSuperAdmin} muted={p.status !== "active"} />
                              <div className="ac-person-text">
                                <Link href={href} onClick={(e) => e.stopPropagation()}>{displayName(p)}</Link>
                                <div className="ac-secondary">{p.email ?? "No email on record"}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              <StatusPill status={p.status} />
                              {p.isPlatformSuperAdmin ? <Pill tone="platform" title="Administers the platform; carries no business capability">Super Admin</Pill> : null}
                            </div>
                          </td>
                          <td>
                            {p.capabilities.length === 0 ? (
                              <span className="ac-secondary">No explicit grants</span>
                            ) : (
                              <span><b className="ac-num">{p.capabilities.length}</b> <span className="ac-secondary">explicit {p.capabilities.length === 1 ? "grant" : "grants"}</span></span>
                            )}
                            {p.financeAccessPresent ? <div className="ac-secondary">+ Platform Finance access</div> : null}
                          </td>
                          <td>
                            {active.length === 0 ? (
                              <span className="ac-secondary">No active assignment</span>
                            ) : (
                              <>
                                {active[0].facilityName}
                                <div className="ac-secondary">
                                  {v1OperatingRoleLabel(active[0].operationalRole as never)}
                                  {active.length > 1 ? ` · +${active.length - 1} more` : ""}
                                </div>
                              </>
                            )}
                          </td>
                          <td style={{ width: "2rem", textAlign: "right" }}>
                            <ChevronRight className="ac-chev h-4 w-4" aria-hidden />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </DataBoundary>
      <CreateAccountDialog
        open={creating}
        organisationId={organisation.id}
        organisationName={organisation.name}
        onClose={() => setCreating(false)}
        onDone={() => state.reload()}
      />
    </>
  );
}

function CreateAccountDialog({
  open,
  organisationId,
  organisationName,
  onClose,
  onDone,
}: {
  open: boolean;
  organisationId: string;
  organisationName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [scope, setScope] = useState<"platform" | "module">("module");
  const [homeModule, setHomeModule] = useState("facility_management");
  const [landing, setLanding] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [role, setRole] = useState("");
  const [pkg, setPkg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateAccountResult | null>(null);
  const facilities = useAdminData<Array<{ id: string; name: string; status: string }>>(
    (signal) => (open ? adminCall("listFacilities", { organisationId }, signal) : Promise.resolve([])),
    [open, organisationId]
  );

  function close() {
    if (busy) return;
    // Discard everything, including the one-time credential.
    setEmail("");
    setFullName("");
    setScope("module");
    setHomeModule("facility_management");
    setLanding("");
    setFacilityId("");
    setRole("");
    setPkg(false);
    setError(null);
    setResult(null);
    onClose();
  }

  const homeEntry = scope === "module" ? workspaceEntry(homeModule) : null;
  // Facility context (assignment, FM operating role, FM package) applies to Facility Management and to platform-scope
  // accounts only; ECC Operations and Platform Finance homes have none.
  const facilityContext = scope === "platform" || Boolean(homeEntry?.facilityContext);
  const packageAvailable = facilityContext && role === "facility_manager" && Boolean(facilityId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await adminCall<CreateAccountResult>("createAccount", {
        organisationId,
        email: email.trim(),
        fullName: fullName.trim(),
        accessScope: scope,
        homeModule: scope === "module" ? homeModule : null,
        landingWorkspace: scope === "platform" && landing ? landing : null,
        ...(facilityContext && facilityId && role ? { facilityId, operationalRole: role } : {}),
        capabilityPackage: pkg && packageAvailable ? "facility_manager" : null,
      });
      setResult(data);
      onDone();
      toast({ type: "success", title: "Account created", description: data.email });
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "The account could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create account"
      description={`A sign-in account in ${organisationName}. No email is sent — you give them a temporary password.`}
      size="md"
      footer={
        result ? (
          <button type="button" className="ac-btn ac-btn-primary" onClick={close}>
            I have recorded the password — close
          </button>
        ) : (
          <>
            <button type="button" className="ac-btn ac-btn-secondary" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="ac-create-form" className="ac-btn ac-btn-primary" disabled={busy || !email.trim() || !fullName.trim()}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div>
          <TemporaryCredential email={result.email} password={result.temporaryPassword} intro="Account created" />
          <dl className="ac-kv" style={{ marginTop: 12 }}>
            <dt>Organisation</dt>
            <dd>{organisationName}</dd>
            <dt>Access scope</dt>
            <dd>{result.accessScope === "module" ? `Module-bound (${workspaceLabel(result.homeModule)})` : "Platform"}</dd>
            <dt>Facility assignment</dt>
            <dd>{result.assignment ? `${v1OperatingRoleLabel(result.assignment.operationalRole as never)} (active)` : "None"}</dd>
            <dt>Capabilities granted</dt>
            <dd>{result.grantedCapabilities.length ? result.grantedCapabilities.join(", ") : "None — grant them in Access"}</dd>
            <dt>Authentication email</dt>
            <dd>None sent</dd>
          </dl>
        </div>
      ) : (
        <form id="ac-create-form" onSubmit={submit}>
          <div className="ac-field">
            <label htmlFor="ac-create-name">Full name</label>
            <input id="ac-create-name" className="ac-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" required />
          </div>
          <div className="ac-field">
            <label htmlFor="ac-create-email">Sign-in email</label>
            <input id="ac-create-email" type="email" className="ac-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            <span className="ac-hint">Their sign-in identity. No email is sent to this address by SentraCore™.</span>
          </div>
          <div className="ac-field">
            <label htmlFor="ac-create-scope">Access scope</label>
            <select id="ac-create-scope" className="ac-select" value={scope} onChange={(e) => setScope(e.target.value as "platform" | "module")}>
              <option value="module">Module-bound (one workspace)</option>
              <option value="platform">Platform</option>
            </select>
          </div>
          {scope === "module" ? (
            <div className="ac-field">
              <label htmlFor="ac-create-module">Home workspace</label>
              <select id="ac-create-module" className="ac-select" value={homeModule} onChange={(e) => { setHomeModule(e.target.value); if (!workspaceEntry(e.target.value)?.facilityContext) { setFacilityId(""); setRole(""); setPkg(false); } }}>
                {MODULE_BOUND_HOME_OPTIONS.map((w) => (
                  <option key={w.id} value={w.id}>{w.label}</option>
                ))}
              </select>
              <span className="ac-hint">
                The operating boundary and default destination. Selecting it grants no capability — authority is always explicit.
                {homeEntry ? ` ${homeEntry.note}` : ""}
              </span>
            </div>
          ) : (
            <div className="ac-field">
              <label htmlFor="ac-create-landing">Landing workspace</label>
              <select id="ac-create-landing" className="ac-select" value={landing} onChange={(e) => setLanding(e.target.value)}>
                <option value="">Default</option>
                {LANDING_OPTIONS.map((w) => (
                  <option key={w.id} value={w.id}>{w.label}</option>
                ))}
              </select>
            </div>
          )}
          {scope === "module" && homeEntry?.id === "platform_finance" ? (
            <div className="ac-field">
              <p className="ac-hint" role="note">
                <strong>Finance authority is not granted here.</strong> Platform Finance company access and platform_finance.*
                capabilities are assigned explicitly through Platform Finance&apos;s own access model. Until they are, this person
                signs in and lands in Platform Finance but sees &ldquo;No access&rdquo;. They cannot open Facility Management, ECC
                Operations, Command Centre or the Admin Console.
              </p>
            </div>
          ) : null}
          {facilityContext ? (
          <div className="ac-field">
            <label htmlFor="ac-create-facility">Facility (optional)</label>
            <select id="ac-create-facility" className="ac-select" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} disabled={facilities.loading}>
              <option value="">{facilities.loading ? "Loading facilities…" : "No facility assignment"}</option>
              {(facilities.data ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          ) : null}
          {facilityContext && facilityId ? (
            <div className="ac-field">
              <label htmlFor="ac-create-role">Operating role</label>
              <select id="ac-create-role" className="ac-select" value={role} onChange={(e) => setRole(e.target.value)} required>
                <option value="">Select a role</option>
                {V1_OPERATING_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {v1OperatingRoleLabel(r)}
                  </option>
                ))}
              </select>
              <span className="ac-hint">Describes their capacity. Permissions come only from explicit grants.</span>
            </div>
          ) : null}
          {packageAvailable ? (
            <div className="ac-field">
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <input type="checkbox" checked={pkg} onChange={(e) => setPkg(e.target.checked)} />
                <span>
                  Grant the Facility Manager operating package
                  <span className="ac-hint" style={{ display: "block" }}>
                    Ordinary FM visibility and operating authority ({FACILITY_MANAGER_OPERATING_PACKAGE.join(", ")}). Protected
                    authority — protected actions, reimbursement authorisation and payment, approvals, people administration —
                    is never included.
                  </span>
                </span>
              </label>
            </div>
          ) : null}
          {error ? (
            <p className="ac-form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Modal>
  );
}
