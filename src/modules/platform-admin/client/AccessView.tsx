"use client";

import Link from "next/link";
import { Building2, ChevronRight, KeyRound, Landmark, ShieldCheck, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { v1OperatingRoleLabel } from "@/lib/access/roles";
import { cn } from "@/lib/utils";
import { CAPABILITY_DOMAINS, type CapabilityDomain } from "../capabilityCatalog";
import { PLATFORM_ADMINISTRABLE_CAPABILITIES } from "../types";
import type { AdminModuleRecord, AdminPersonDetail, AdminPersonSummary, OrganisationAdminRecord, PlatformCapabilityGrantResult } from "../types";
import { AdminApiError, adminCall } from "./adminApi";
import { FinanceAccess } from "./FinanceAccess";
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
  const person = useAdminData<AdminPersonDetail>(
    (signal) => adminCall<AdminPersonDetail>("getPerson", { organisationId, profileId }, signal),
    [organisationId, profileId]
  );
  const modules = useAdminData<AdminModuleRecord[]>(
    (signal) => adminCall<AdminModuleRecord[]>("listModules", { organisationId }, signal),
    [organisationId]
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});
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
                  <div className="ac-posture-value">{financePresent ? "Present" : "None"}<small>read-only</small></div>
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

            <Panel title="Business capabilities" icon={KeyRound} flush aside="Explicit grants — the only source of business authority">
              {CAPABILITY_DOMAINS.map((d) => {
                const count = d.capabilities.filter((c) => p.capabilities.includes(c.key)).length;
                return (
                  <DomainBlock
                    key={d.id}
                    domain={d}
                    person={p}
                    organisationId={organisationId}
                    module={modules.data?.find((m) => m.slug === d.moduleSlug) ?? null}
                    modulesFailed={modules.error !== null}
                    open={open[d.id] ?? count > 0}
                    onToggle={() => setOpen((cur) => ({ ...cur, [d.id]: !(cur[d.id] ?? count > 0) }))}
                    onChanged={() => {
                      person.reload();
                      onChanged();
                    }}
                  />
                );
              })}
            </Panel>

            <div className="ac-cols" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(20rem, 1fr))" }}>
              <Panel title="Operating context" icon={Building2} aside="Descriptive — grants nothing" flush>
                {p.facilityAssignments.length === 0 ? (
                  <p className="ac-secondary" style={{ padding: "12px 16px", margin: 0 }}>No facility assignments.</p>
                ) : (
                  p.facilityAssignments.map((a) => (
                    <div key={a.assignmentId} className="ac-cap" style={{ padding: "10px 16px" }}>
                      <span className="ac-cap-label">{a.facilityName}</span>
                      <Pill tone={a.status === "active" ? "ok" : "neutral"}>{a.status === "active" ? "Active" : "Inactive"}</Pill>
                      <span className="ac-cap-detail">{v1OperatingRoleLabel(a.operationalRole as never)} — operating role</span>
                    </div>
                  ))
                )}
                <div className="ac-panel-foot">“Facility Manager” and other operating roles describe where and how someone works. They do not give — or remove — any capability.</div>
              </Panel>

              <Panel title="Platform Finance access" icon={Landmark} aside="Read-only here">
                <FinanceAccess access={p.financeAccess} />
                <p className="ac-secondary" style={{ marginTop: 10 }}>Platform Finance access is administered inside Platform Finance. It is shown here so the full picture of a person’s access is visible.</p>
              </Panel>
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
  organisationId,
  module,
  modulesFailed,
  open,
  onToggle,
  onChanged,
}: {
  domain: CapabilityDomain;
  person: AdminPersonDetail;
  organisationId: string;
  module: AdminModuleRecord | null;
  modulesFailed: boolean;
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState<{ key: string; grant: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = useMemo(() => new Set(person.capabilities), [person.capabilities]);
  const count = domain.capabilities.filter((c) => held.has(c.key)).length;
  const moduleOff = module !== null && module.status !== "enabled";

  async function apply() {
    if (!confirming || busy) return;
    setBusy(true);
    setError(null);
    try {
      await adminCall<PlatformCapabilityGrantResult>(confirming.grant ? "grantPlatformCapability" : "revokePlatformCapability", {
        organisationId,
        profileId: person.profileId,
        capability: confirming.key,
      });
      toast({ type: "success", title: confirming.grant ? "Capability granted" : "Capability revoked", description: "Recorded in administrative history." });
      setConfirming(null);
      onChanged();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "The change could not be applied.");
    } finally {
      setBusy(false);
    }
  }

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
        <span className="ac-domain-count" aria-label={`${count} of ${domain.capabilities.length} granted`}>
          {count} / {domain.capabilities.length}
          <span className="ac-pips" aria-hidden>
            {domain.capabilities.map((c) => (
              <span key={c.key} className={cn("ac-pip", held.has(c.key) && "ac-pip-on")} />
            ))}
          </span>
        </span>
      </button>
      {open ? (
        <div id={panelId} className="ac-domain-body">
          {moduleOff ? <p className="ac-domain-warn">The module is not enabled for this organisation, so its workspace is unavailable to members. Grants are kept and apply again once it is enabled.</p> : null}
          {domain.capabilities.map((c) => {
            const isHeld = held.has(c.key);
            const isConfirming = confirming?.key === c.key;
            return (
              <div key={c.key} className="ac-cap">
                <div className="ac-cap-label">
                  {c.label} <span className="ac-cap-key">{c.key}</span>
                </div>
                <div className="ac-cap-side">
                  <Pill tone={isHeld ? "ok" : "plain"}>{isHeld ? "Granted" : "Not granted"}</Pill>
                  {isHeld ? (
                    <button type="button" className="ac-btn ac-btn-danger-quiet ac-btn-sm" disabled={busy} onClick={() => { setError(null); setConfirming({ key: c.key, grant: false }); }} aria-label={`Revoke ${c.label}`}>
                      Revoke
                    </button>
                  ) : (
                    <button type="button" className="ac-btn ac-btn-secondary ac-btn-sm" disabled={busy} onClick={() => { setError(null); setConfirming({ key: c.key, grant: true }); }} aria-label={`Grant ${c.label}`}>
                      Grant
                    </button>
                  )}
                </div>
                <span className="ac-cap-detail">{c.detail}</span>
                {isConfirming ? (
                  <div className={cn("ac-cap-confirm", !confirming.grant && "ac-cap-confirm-critical")} role="group" aria-label="Confirm change">
                    <span>
                      {confirming.grant ? "Grant" : "Revoke"} <strong>{c.label}</strong> {confirming.grant ? "to" : "from"} {displayName(person)}? Takes effect immediately and is recorded in history.
                    </span>
                    <button type="button" className={cn("ac-btn ac-btn-sm", confirming.grant ? "ac-btn-primary" : "ac-btn-danger")} onClick={apply} disabled={busy}>
                      {busy ? "Applying…" : confirming.grant ? "Confirm grant" : "Confirm revoke"}
                    </button>
                    <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" onClick={() => setConfirming(null)} disabled={busy}>
                      Cancel
                    </button>
                    {error ? <span className="ac-form-error" role="alert">{error}</span> : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
