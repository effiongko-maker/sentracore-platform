"use client";

import Link from "next/link";
import { Building2, ChevronRight, KeyRound, ShieldCheck, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { v1OperatingRoleLabel } from "@/lib/access/roles";
import { cn } from "@/lib/utils";
import { CAPABILITY_DOMAINS, type CapabilityDomain } from "../capabilityCatalog";
import { PLATFORM_ADMINISTRABLE_CAPABILITIES } from "../types";
import type { AdminFacilityAssignment, AdminModuleRecord, AdminPersonDetail, AdminPersonSummary, OrganisationAdminRecord, PlatformCapabilityBatchResult } from "../types";
import { AssignmentDialog } from "./PersonView";
import { AdminApiError, adminCall } from "./adminApi";
import { FinanceAccessPanel } from "./FinanceAccessPanel";
import { ContextStrip, DataBoundary, Note, OrgGate, PageHead, displayName, moduleStatusMark, useAdminData } from "./ui";
import { Avatar, Panel, Pill, StatusPill } from "./kit";

export function AccessView() {
  return (
    <div className="ac-page">
      <ContextStrip />
      <OrgGate title="Access" lede={LEDE}>
        {(organisation) => <AccessBody organisation={organisation} />}
      </OrgGate>
    </div>
  );
}

const LEDE =
  "Access is explicit. A person can do only what has been granted to them — never what their title, operating role, facility or administrative authority might suggest.";

function AccessBody({ organisation }: { organisation: OrganisationAdminRecord }) {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("person");
  const people = useAdminData<AdminPersonSummary[]>(
    (signal) => adminCall<AdminPersonSummary[]>("listPeople", { organisationId: organisation.id }, signal),
    [organisation.id]
  );
  function pick(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("person", id);
    router.replace(`/admin/access?${next.toString()}`);
  }

  return (
    <>
      <PageHead title="Access" lede={LEDE} />
      <DataBoundary
        state={people}
        onRetry={people.reload}
        what="people"
        isEmpty={(d) => d.length === 0}
        empty={<p>No people are attached to this organisation, so there is no access to administer.</p>}
      >
        {(list) => {
          const current = list.find((p) => p.profileId === selected) ?? list[0];
          return (
            <div className="ac-split">
              <Panel title="People" icon={Users} flush className="ac-rail" aside={<span className="ac-num">{list.length}</span>}>
                <nav aria-label="People">
                  {list.map((p) => (
                    <button key={p.profileId} type="button" className="ac-pick" aria-current={p.profileId === current.profileId} onClick={() => pick(p.profileId)}>
                      <Avatar name={displayName(p)} size="sm" platform={p.isPlatformSuperAdmin} muted={p.status !== "active"} />
                      <span className="ac-pick-text">
                        <span className="ac-pick-name">{displayName(p)}</span>
                        <span className="ac-pick-meta">
                          {p.isPlatformSuperAdmin ? "Super Admin" : p.status === "active" ? "Active" : p.status[0].toUpperCase() + p.status.slice(1)}
                          {p.isPlatformSuperAdmin && p.status !== "active" ? ` · ${p.status}` : ""}
                        </span>
                      </span>
                      <span className="ac-pick-count" title="Explicit grants">{p.capabilities.length}</span>
                    </button>
                  ))}
                </nav>
              </Panel>
              <PersonAccess key={current.profileId} organisationId={organisation.id} profileId={current.profileId} onChanged={people.reload} />
            </div>
          );
        }}
      </DataBoundary>
    </>
  );
}

function PersonAccess({ organisationId, profileId, onChanged }: { organisationId: string; profileId: string; onChanged: () => void }) {
  const { toast } = useToast();
  const person = useAdminData<AdminPersonDetail>(
    (signal) => adminCall<AdminPersonDetail>("getPerson", { organisationId, profileId }, signal),
    [organisationId, profileId]
  );
  const modules = useAdminData<AdminModuleRecord[]>(
    (signal) => adminCall<AdminModuleRecord[]>("listModules", { organisationId }, signal),
    [organisationId]
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Batch access-edit state. pending holds ONLY capabilities whose staged state differs from what is
  // currently persisted (p.capabilities) — toggling a row back to its original value removes its entry, so
  // "no pending changes" is always just an empty map, never inferred from anything else.
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const held = useMemo(() => new Set(person.data?.capabilities ?? []), [person.data?.capabilities]);

  // Operating context (facility assignments) — the existing audited assignment workflow; never touches grants.
  const [assigning, setAssigning] = useState<{ assignment?: AdminFacilityAssignment } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  async function removeAssignment(a: AdminFacilityAssignment) {
    if (!window.confirm(`Remove ${a.facilityName} from this person's operating context? Their capability grants are not changed.`)) return;
    setRemoving(a.assignmentId);
    try {
      await adminCall("setFacilityAssignment", {
        organisationId,
        profileId,
        facilityId: a.facilityId,
        assignmentId: a.assignmentId,
        operationalRole: a.operationalRole,
        status: "inactive",
      });
      toast({ type: "success", title: `${a.facilityName} removed`, description: "Recorded in administrative history. Capability grants unchanged." });
      person.reload();
      onChanged();
    } catch (err) {
      toast({ type: "error", title: "The assignment could not be removed", description: err instanceof AdminApiError ? err.message : undefined });
    } finally {
      setRemoving(null);
    }
  }

  function startEdit() {
    setPending(new Map());
    setSaveError(null);
    setEditing(true);
  }
  function cancelEdit() {
    // Discards every staged change; no backend call. The persisted state (held) was never touched.
    setPending(new Map());
    setSaveError(null);
    setEditing(false);
  }
  function toggleCapability(key: string) {
    if (saving) return;
    setPending((cur) => {
      const next = new Map(cur);
      const originalHeld = held.has(key);
      const proposedHeld = next.has(key) ? next.get(key)! : originalHeld;
      const flipped = !proposedHeld;
      if (flipped === originalHeld) next.delete(key);
      else next.set(key, flipped);
      return next;
    });
  }
  function setDomainAll(keys: string[], value: boolean) {
    if (saving) return;
    setPending((cur) => {
      const next = new Map(cur);
      for (const key of keys) {
        const originalHeld = held.has(key);
        if (value === originalHeld) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  }

  const grantList = [...pending.entries()].filter(([, v]) => v).map(([k]) => k);
  const revokeList = [...pending.entries()].filter(([, v]) => !v).map(([k]) => k);
  const pendingCount = pending.size;

  async function saveChanges() {
    if (saving || pendingCount === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await adminCall<PlatformCapabilityBatchResult>("batchUpdateCapabilities", {
        organisationId,
        profileId,
        grantCapabilities: grantList,
        revokeCapabilities: revokeList,
      });
      // Always reload after the call, whether it fully succeeded or not, so the UI reflects the authoritative
      // backend state rather than an assumed one.
      await person.reload();
      onChanged();
      if (result.failed.length > 0) {
        // Reconcile: keep only the items that genuinely still need applying (the ones that failed); drop the
        // ones that succeeded, since the reload above already reflects them.
        setPending((cur) => {
          const next = new Map<string, boolean>();
          for (const f of result.failed) {
            if (cur.has(f.capability)) next.set(f.capability, cur.get(f.capability)!);
          }
          return next;
        });
        setSaveError(
          `${result.failed.length} of ${grantList.length + revokeList.length} change${grantList.length + revokeList.length === 1 ? "" : "s"} could not be applied: ` +
            result.failed.map((f) => `${f.capability} (${f.action}) — ${f.message}`).join("; ")
        );
        toast({ type: "error", title: "Some changes could not be applied", description: "Review the remaining pending changes below." });
        // Stay in edit mode so the administrator can see and retry the failed items.
      } else {
        setPending(new Map());
        setEditing(false);
        toast({
          type: "success",
          title: "Access updated",
          description: `${result.granted.length} granted · ${result.revoked.length} revoked. Recorded in administrative history.`,
        });
      }
    } catch (err) {
      // The whole call failed before anything could be attempted (e.g. validation) — nothing was written, so
      // there is nothing to reconcile; the staged changes are preserved for the administrator to retry/adjust.
      setSaveError(err instanceof AdminApiError ? err.message : "The batch change could not be applied.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DataBoundary state={person} onRetry={person.reload} what="this person’s access">
      {(p) => {
        const activeAssignments = p.facilityAssignments.filter((a) => a.status === "active").length;
        const financePresent = p.financeAccess.capabilities.length > 0 || p.financeAccess.companies.length > 0 || p.financeAccess.financialAccountAccessCount > 0;
        return (
          <div className="ac-stack">
            <Panel>
              <div className="ac-subject">
                <Avatar name={displayName(p)} platform={p.isPlatformSuperAdmin} muted={p.status !== "active"} />
                <div className="ac-subject-text">
                  <h2 className="ac-subject-name">{displayName(p)}</h2>
                  <span className="ac-secondary">{p.email ?? "No email on record"}</span>
                </div>
                <StatusPill status={p.status} />
                <Link href={`/admin/people/${p.profileId}?org=${organisationId}`} className="ac-btn ac-btn-secondary ac-btn-sm">
                  Person details
                </Link>
              </div>
              <div className="ac-posture" role="list" aria-label="Access posture">
                <div className="ac-posture-cell" role="listitem">
                  <div className="ac-posture-label">Platform authority</div>
                  <div className="ac-posture-value">{p.isPlatformSuperAdmin ? "Super Admin" : "None"}</div>
                </div>
                <div className="ac-posture-cell" role="listitem">
                  <div className="ac-posture-label">Explicit grants</div>
                  <div className="ac-posture-value">{p.capabilities.length}<small>of {PLATFORM_ADMINISTRABLE_CAPABILITIES.length}</small></div>
                </div>
                <div className="ac-posture-cell" role="listitem">
                  <div className="ac-posture-label">Active assignments</div>
                  <div className="ac-posture-value">{activeAssignments}<small>context only</small></div>
                </div>
                <div className="ac-posture-cell" role="listitem">
                  <div className="ac-posture-label">Platform Finance</div>
                  <div className="ac-posture-value">{financePresent ? "Present" : "None"}<small>see below</small></div>
                </div>
              </div>
            </Panel>

            {p.status !== "active" ? <Note tone="strong">This person is {p.status}, so they cannot act on the platform regardless of grants.</Note> : null}

            <Panel title="Platform authority" icon={ShieldCheck} aside="Read-only" flush>
              {p.isPlatformSuperAdmin ? (
                <div className="ac-cap" style={{ padding: "12px 16px" }}>
                  <span className="ac-cap-label"><Pill tone="platform">Super Admin</Pill></span>
                  <span className="ac-secondary">Read-only</span>
                  <span className="ac-cap-detail">Administers the platform: people, access grants, modules and history. It carries no business capability — those need explicit grants below. It cannot be changed from this console.</span>
                </div>
              ) : (
                <p className="ac-secondary" style={{ padding: "12px 16px", margin: 0 }}>Not a platform administrator.</p>
              )}
            </Panel>

            <Panel
              title="Business capabilities"
              icon={KeyRound}
              flush
              aside={
                editing ? (
                  <span className="ac-cap-edit-bar">
                    {pendingCount > 0 ? (
                      <span className="ac-cap-edit-summary">
                        {grantList.length > 0 ? `${grantList.length} to grant` : null}
                        {grantList.length > 0 && revokeList.length > 0 ? " · " : null}
                        {revokeList.length > 0 ? `${revokeList.length} to revoke` : null}
                      </span>
                    ) : (
                      <span className="ac-cap-edit-summary ac-secondary">No pending changes</span>
                    )}
                    <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" onClick={cancelEdit} disabled={saving}>
                      Cancel
                    </button>
                    <button type="button" className="ac-btn ac-btn-primary ac-btn-sm" onClick={saveChanges} disabled={saving || pendingCount === 0}>
                      {saving ? "Saving…" : "Save changes"}
                    </button>
                  </span>
                ) : (
                  <span className="ac-cap-edit-bar">
                    <span className="ac-secondary">Explicit grants — the only source of business authority</span>
                    <button type="button" className="ac-btn ac-btn-secondary ac-btn-sm" onClick={startEdit}>
                      Edit access
                    </button>
                  </span>
                )
              }
            >
              {saveError ? (
                <p className="ac-form-error" role="alert" style={{ padding: "10px 16px", margin: 0 }}>
                  {saveError}
                </p>
              ) : null}
              {CAPABILITY_DOMAINS.map((d) => {
                const count = d.capabilities.filter((c) => {
                  const proposed = pending.has(c.key) ? pending.get(c.key)! : p.capabilities.includes(c.key);
                  return proposed;
                }).length;
                return (
                  <DomainBlock
                    key={d.id}
                    domain={d}
                    person={p}
                    module={modules.data?.find((m) => m.slug === d.moduleSlug) ?? null}
                    modulesFailed={modules.error !== null}
                    open={open[d.id] ?? count > 0}
                    onToggle={() => setOpen((cur) => ({ ...cur, [d.id]: !(cur[d.id] ?? count > 0) }))}
                    editing={editing}
                    saving={saving}
                    pending={pending}
                    onToggleCapability={toggleCapability}
                    onSetDomainAll={setDomainAll}
                  />
                );
              })}
            </Panel>

            <div className="ac-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))" }}>
              <Panel
                title="Operating context"
                icon={Building2}
                aside={
                  p.status === "active" ? (
                    <button type="button" className="ac-btn ac-btn-secondary ac-btn-sm" onClick={() => setAssigning({})}>
                      Add facility
                    </button>
                  ) : (
                    "Descriptive — grants nothing"
                  )
                }
                flush
              >
                {(() => {
                  const active = p.facilityAssignments.filter((a) => a.status === "active");
                  const inactive = p.facilityAssignments.filter((a) => a.status !== "active");
                  return (
                    <>
                      <p className="ac-secondary" style={{ padding: "12px 16px 4px", margin: 0 }}>
                        {active.length === 0
                          ? "No active facility assignment."
                          : `Operates at ${active.length === 1 ? "1 facility" : `${active.length} facilities`}: ${active.map((a) => a.facilityName).join(", ")}.`}
                      </p>
                      {active.map((a) => (
                        <div key={a.assignmentId} className="ac-cap" style={{ padding: "10px 16px" }}>
                          <span className="ac-cap-label">{a.facilityName}</span>
                          <Pill tone="ok">Active</Pill>
                          <span className="ac-cap-detail">{v1OperatingRoleLabel(a.operationalRole as never)} — operating role</span>
                          {p.status === "active" ? (
                            <button
                              type="button"
                              className="ac-btn ac-btn-quiet ac-btn-sm"
                              disabled={removing === a.assignmentId}
                              onClick={() => void removeAssignment(a)}
                            >
                              {removing === a.assignmentId ? "Removing…" : "Remove"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                      {inactive.length ? (
                        <p className="ac-secondary" style={{ padding: "6px 16px 10px", margin: 0 }}>
                          Previously assigned (inactive): {inactive.map((a) => a.facilityName).join(", ")}
                        </p>
                      ) : null}
                    </>
                  );
                })()}
                <div className="ac-panel-foot">“Facility Manager” and other operating roles describe where and how someone works. They do not give — or remove — any capability.</div>
              </Panel>
              <AssignmentDialog
                state={assigning}
                person={p}
                organisationId={organisationId}
                onClose={() => setAssigning(null)}
                onDone={() => {
                  person.reload();
                  onChanged();
                }}
              />

              <FinanceAccessPanel organisationId={organisationId} profileId={p.profileId} access={p.financeAccess} onSaved={person.reload} />
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}

function DomainBlock({
  domain,
  person,
  module,
  modulesFailed,
  open,
  onToggle,
  editing,
  saving,
  pending,
  onToggleCapability,
  onSetDomainAll,
}: {
  domain: CapabilityDomain;
  person: AdminPersonDetail;
  module: AdminModuleRecord | null;
  modulesFailed: boolean;
  open: boolean;
  onToggle: () => void;
  editing: boolean;
  saving: boolean;
  pending: Map<string, boolean>;
  onToggleCapability: (key: string) => void;
  onSetDomainAll: (keys: string[], value: boolean) => void;
}) {
  const held = useMemo(() => new Set(person.capabilities), [person.capabilities]);
  const proposedHeld = (key: string) => (pending.has(key) ? pending.get(key)! : held.has(key));
  const count = domain.capabilities.filter((c) => proposedHeld(c.key)).length;
  const moduleOff = module !== null && module.status !== "enabled";
  const domainKeys = domain.capabilities.map((c) => c.key);

  const mark = module ? moduleStatusMark(module.status) : null;
  const panelId = `ac-domain-${domain.id}`;
  return (
    <div className={cn("ac-domain", open && "ac-domain-open")}>
      <button type="button" className="ac-domain-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <ChevronRight className="ac-domain-chev h-4 w-4" aria-hidden />
        <span>
          <h3 className="ac-domain-title">{domain.label}</h3>
          <p className="ac-domain-sum">{domain.summary}</p>
        </span>
        <span>
          {domain.moduleSlug ? (
            modulesFailed ? (
              <Pill tone="plain">Module state unavailable</Pill>
            ) : mark ? (
              <Pill tone={mark.pill} title="Organisation-level module availability">Module {mark.label.toLowerCase()}</Pill>
            ) : null
          ) : null}
        </span>
        <span className="ac-domain-count" aria-label={`${count} of ${domain.capabilities.length} granted${editing ? " (proposed)" : ""}`}>
          {count} / {domain.capabilities.length}
          <span className="ac-pips" aria-hidden>
            {domain.capabilities.map((c) => (
              <span key={c.key} className={cn("ac-pip", proposedHeld(c.key) && "ac-pip-on")} />
            ))}
          </span>
        </span>
      </button>
      {open ? (
        <div id={panelId} className="ac-domain-body">
          {moduleOff ? <p className="ac-domain-warn">The module is not enabled for this organisation, so its workspace is unavailable to members. Grants are kept and apply again once it is enabled.</p> : null}
          {editing ? (
            <div className="ac-domain-batch-controls">
              <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" disabled={saving} onClick={() => onSetDomainAll(domainKeys, true)}>
                Select all
              </button>
              <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" disabled={saving} onClick={() => onSetDomainAll(domainKeys, false)}>
                Clear
              </button>
            </div>
          ) : null}
          {domain.capabilities.map((c) => {
            const originalHeld = held.has(c.key);
            const proposed = proposedHeld(c.key);
            const isStaged = pending.has(c.key);
            // Four distinct states: currently granted (unchanged) / will be granted / will be revoked /
            // unchanged, not granted. Never collapsed into a plain on/off.
            const tone = isStaged ? (proposed ? "accent" : "warn") : proposed ? "ok" : "plain";
            const label = isStaged ? (proposed ? "Will grant" : "Will revoke") : proposed ? "Granted" : "Not granted";
            return (
              <div key={c.key} className={cn("ac-cap", isStaged && "ac-cap-staged")}>
                <div className="ac-cap-label">
                  {c.label} <span className="ac-cap-key">{c.key}</span>
                </div>
                <div className="ac-cap-side">
                  <Pill tone={tone}>{label}</Pill>
                  {editing ? (
                    <button
                      type="button"
                      className={cn("ac-btn ac-btn-sm", proposed ? "ac-btn-danger-quiet" : "ac-btn-secondary")}
                      disabled={saving}
                      onClick={() => onToggleCapability(c.key)}
                      aria-pressed={proposed !== originalHeld}
                      aria-label={proposed ? `Stage revoke for ${c.label}` : `Stage grant for ${c.label}`}
                    >
                      {proposed ? "Revoke" : "Grant"}
                    </button>
                  ) : null}
                </div>
                <span className="ac-cap-detail">{c.detail}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
