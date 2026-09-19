"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { useToast } from "@/components/ui/Toast";
import type { ProfileStatus } from "@/lib/auth/types";
import { v1OperatingRoleLabel } from "@/lib/access/roles";
import type { AdminPersonSummary, InviteAttachResult } from "../types";
import { AdminApiError, adminCall } from "./adminApi";
import { useAdminConsole } from "./AdminConsoleContext";
import { ContextStrip, DataBoundary, PageHead, StatusMark, displayName, useAdminData } from "./ui";

const STATUS_FILTERS: Array<{ value: "all" | ProfileStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
  { value: "inactive", label: "Inactive" },
];

export function PeopleView() {
  const { organisation } = useAdminConsole();
  const params = useSearchParams();
  const initial = params.get("status");
  const [status, setStatus] = useState<"all" | ProfileStatus>(
    STATUS_FILTERS.some((f) => f.value === initial) ? (initial as ProfileStatus) : "all"
  );
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const state = useAdminData<AdminPersonSummary[]>(
    (signal) => adminCall<AdminPersonSummary[]>("listPeople", { organisationId: organisation!.id }, signal),
    [organisation?.id]
  );
  const q = organisation ? `?org=${organisation.id}` : "";

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (state.data ?? []).filter(
      (p) =>
        (status === "all" || p.status === status) &&
        (!needle || `${p.fullName ?? ""} ${p.email ?? ""} ${p.jobTitle ?? ""}`.toLowerCase().includes(needle))
    );
  }, [state.data, status, query]);

  return (
    <div className="ac-page">
      <ContextStrip />
      <PageHead
        title="People"
        lede="Platform identities in this organisation. Identity, access and operating context are administered separately."
        actions={
          <button type="button" className="ac-btn ac-btn-primary" disabled={!organisation} onClick={() => setInviting(true)}>
            <UserPlus className="h-4 w-4" aria-hidden />
            Invite person
          </button>
        }
      />
      {!organisation ? (
        <div className="ac-state">Select an organisation to see its people.</div>
      ) : (
        <DataBoundary state={state} onRetry={state.reload} what="people" isEmpty={(d) => d.length === 0} empty={
          <>
            <p className="ac-state-title">No people are attached to this organisation</p>
            <p>Invite the first person to begin. They receive an email invitation and are attached to {organisation.name}.</p>
          </>
        }>
          {() => (
            <>
              <div className="ac-toolbar">
                <input
                  type="search"
                  className="ac-input"
                  style={{ width: "18rem" }}
                  placeholder="Search name, email or job title"
                  aria-label="Search people"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select className="ac-select" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
                  {STATUS_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <span className="ac-secondary" role="status">
                  {rows.length} of {state.data?.length ?? 0}
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
                        <th scope="col">Platform</th>
                        <th scope="col">Access</th>
                        <th scope="col">Operating context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p) => {
                        const active = p.facilityAssignments.filter((a) => a.status === "active");
                        return (
                          <tr key={p.profileId}>
                            <td>
                              <Link className="ac-primary" href={`/admin/people/${p.profileId}${q}`}>
                                {displayName(p)}
                              </Link>
                              <div className="ac-secondary">{p.email ?? "No email on record"}</div>
                            </td>
                            <td>
                              <StatusMark status={p.status} />
                            </td>
                            <td>{p.isPlatformSuperAdmin ? <span className="ac-tag ac-tag-platform">Super Admin</span> : <span className="ac-secondary">—</span>}</td>
                            <td>
                              <span className="ac-num">{p.capabilities.length}</span>{" "}
                              <span className="ac-secondary">{p.capabilities.length === 1 ? "explicit grant" : "explicit grants"}</span>
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </DataBoundary>
      )}
      {organisation ? (
        <InviteDialog
          open={inviting}
          organisationId={organisation.id}
          organisationName={organisation.name}
          onClose={() => setInviting(false)}
          onDone={() => state.reload()}
        />
      ) : null}
    </div>
  );
}

function InviteDialog({
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteAttachResult | null>(null);

  function close() {
    if (busy) return;
    setEmail("");
    setFullName("");
    setError(null);
    setResult(null);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await adminCall<InviteAttachResult>("inviteAndAttachUser", { organisationId, email: email.trim(), fullName: fullName.trim() });
      setResult(data);
      onDone();
      toast({ type: "success", title: data.alreadyExisted ? "Person attached" : "Invitation sent", description: data.email });
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "The invitation could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite a person"
      description={`They will be invited by email and attached to ${organisationName}.`}
      size="md"
      footer={
        result ? (
          <button type="button" className="ac-btn ac-btn-primary" onClick={close}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="ac-btn ac-btn-secondary" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="ac-invite-form" className="ac-btn ac-btn-primary" disabled={busy || !email.trim() || !fullName.trim()}>
              {busy ? "Sending…" : "Send invitation"}
            </button>
          </>
        )
      }
    >
      {result ? (
        <div>
          <p className="ac-state-title">{result.alreadyExisted ? "This person already had an identity" : "Invitation sent"}</p>
          <dl className="ac-kv">
            <dt>Email</dt>
            <dd>{result.email}</dd>
            <dt>Organisation</dt>
            <dd>{organisationName}</dd>
            <dt>Invitation email</dt>
            <dd>{result.inviteSent ? "Sent" : "Not sent"}</dd>
            <dt>Attached</dt>
            <dd>{result.attached ? "Yes — attached to the organisation" : "Not yet — will attach when they accept"}</dd>
          </dl>
          {result.followUpRequired.length > 0 ? (
            <p className="ac-form-error" role="alert">
              Follow-up required: {result.followUpRequired.join(", ").replaceAll("_", " ")}.
            </p>
          ) : null}
          <p className="ac-secondary" style={{ marginTop: 12 }}>
            They have no access yet. Grant capabilities in Access once they are active.
          </p>
        </div>
      ) : (
        <form id="ac-invite-form" onSubmit={submit}>
          <div className="ac-field">
            <label htmlFor="ac-invite-name">Full name</label>
            <input id="ac-invite-name" className="ac-input" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" required />
          </div>
          <div className="ac-field">
            <label htmlFor="ac-invite-email">Work email</label>
            <input id="ac-invite-email" type="email" className="ac-input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            <span className="ac-hint">The invitation is sent to this address.</span>
          </div>
          <div className="ac-field">
            <label>Organisation</label>
            <span className="ac-secondary">{organisationName}</span>
          </div>
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
