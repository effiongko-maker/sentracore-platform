"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { v1OperatingRoleLabel } from "@/lib/access/roles";
import { cn } from "@/lib/utils";
import { CAPABILITY_DOMAINS, type CapabilityDomain } from "../capabilityCatalog";
import type { AdminModuleRecord, AdminPersonDetail, AdminPersonSummary, PlatformCapabilityGrantResult } from "../types";
import { AdminApiError, adminCall } from "./adminApi";
import { useAdminConsole } from "./AdminConsoleContext";
import { FinanceAccess } from "./FinanceAccess";
import { ContextStrip, DataBoundary, Note, PageHead, Section, StatusMark, displayName, moduleStatusMark, useAdminData } from "./ui";

export function AccessView() {
  const { organisation } = useAdminConsole();
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("person");
  const people = useAdminData<AdminPersonSummary[]>(
    (signal) => adminCall<AdminPersonSummary[]>("listPeople", { organisationId: organisation!.id }, signal),
    [organisation?.id]
  );
  function pick(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("person", id);
    router.replace(`/admin/access?${next.toString()}`);
  }

  return (
    <div className="ac-page">
      <ContextStrip />
      <PageHead
        title="Access"
        lede="Access is explicit. A person can do only what has been granted to them — never what their title, operating role, facility or administrative authority might suggest."
      />
      {!organisation ? (
        <div className="ac-state">Select an organisation.</div>
      ) : (
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
                <nav className="ac-people-pick" aria-label="People">
                  {list.map((p) => (
                    <button key={p.profileId} type="button" className="ac-pick" aria-current={p.profileId === current.profileId} onClick={() => pick(p.profileId)}>
                      <span className="ac-pick-name">{displayName(p)}</span>
                      <span className="ac-pick-meta">
                        {p.capabilities.length} {p.capabilities.length === 1 ? "grant" : "grants"}
                        {p.isPlatformSuperAdmin ? " · Super Admin" : ""}
                        {p.status !== "active" ? ` · ${p.status}` : ""}
                      </span>
                    </button>
                  ))}
                </nav>
                <PersonAccess key={current.profileId} organisationId={organisation.id} profileId={current.profileId} onChanged={people.reload} />
              </div>
            );
          }}
        </DataBoundary>
      )}
    </div>
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
  return (
    <DataBoundary state={person} onRetry={person.reload} what="this person’s access">
      {(p) => (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", alignItems: "baseline" }}>
            <h2 className="ac-title" style={{ fontSize: "1.25rem" }}>{displayName(p)}</h2>
            <StatusMark status={p.status} />
            <Link href={`/admin/people/${p.profileId}?org=${organisationId}`} className="ac-secondary" style={{ textDecoration: "underline" }}>
              Person details
            </Link>
          </div>
          {p.status !== "active" ? <div style={{ marginTop: 12 }}><Note tone="strong">This person is {p.status}, so they cannot act on the platform regardless of grants.</Note></div> : null}

          <Section title="Platform authority" className="ac-domain">
            {p.isPlatformSuperAdmin ? (
              <div className="ac-cap">
                <div>
                  <span className="ac-cap-label"><span className="ac-tag ac-tag-platform">Super Admin</span></span>
                </div>
                <span className="ac-secondary">Read-only</span>
                <span className="ac-cap-detail">Administers the platform: people, access grants, modules and history. It carries no business capability — those need explicit grants below. It cannot be changed from this console.</span>
              </div>
            ) : (
              <p className="ac-secondary" style={{ padding: "10px 0" }}>Not a platform administrator.</p>
            )}
          </Section>

          <Section title="Business capabilities" className="ac-domain" aside="Explicit grants — the only source of business authority">
            {CAPABILITY_DOMAINS.map((d) => (
              <DomainBlock
                key={d.id}
                domain={d}
                person={p}
                organisationId={organisationId}
                module={modules.data?.find((m) => m.slug === d.moduleSlug) ?? null}
                modulesFailed={modules.error !== null}
                onChanged={() => {
                  person.reload();
                  onChanged();
                }}
              />
            ))}
          </Section>

          <Section title="Operating context" className="ac-domain" aside="Descriptive — grants nothing">
            {p.facilityAssignments.length === 0 ? (
              <p className="ac-secondary" style={{ padding: "10px 0" }}>No facility assignments.</p>
            ) : (
              p.facilityAssignments.map((a) => (
                <div key={a.assignmentId} className="ac-cap">
                  <span className="ac-cap-label">{a.facilityName}</span>
                  <span className={cn("ac-mark", a.status === "active" ? "ac-mark-ok" : "ac-mark-neutral")}>{a.status === "active" ? "Active" : "Inactive"}</span>
                  <span className="ac-cap-detail">{v1OperatingRoleLabel(a.operationalRole as never)} — operating role</span>
                </div>
              ))
            )}
            <div style={{ marginTop: 8 }}>
              <Note>“Facility Manager” and other operating roles describe where and how someone works. They do not give — or remove — any capability.</Note>
            </div>
          </Section>

          <Section title="Platform Finance access" className="ac-domain" aside="Read-only here">
            <FinanceAccess access={p.financeAccess} />
            <div style={{ marginTop: 8 }}>
              <Note>Platform Finance access is administered inside Platform Finance. It is shown here so the full picture of a person’s access is visible.</Note>
            </div>
          </Section>
        </div>
      )}
    </DataBoundary>
  );
}

function DomainBlock({
  domain,
  person,
  organisationId,
  module,
  modulesFailed,
  onChanged,
}: {
  domain: CapabilityDomain;
  person: AdminPersonDetail;
  organisationId: string;
  module: AdminModuleRecord | null;
  modulesFailed: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState<{ key: string; grant: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = useMemo(() => new Set(person.capabilities), [person.capabilities]);
  const count = domain.capabilities.filter((c) => held.has(c.key)).length;

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
  return (
    <div className="ac-domain">
      <div className="ac-domain-head">
        <h3 className="ac-domain-title">{domain.label}</h3>
        <span className="ac-secondary">{count} of {domain.capabilities.length} granted</span>
        {domain.moduleSlug ? (
          modulesFailed ? (
            <span className="ac-secondary">Module state unavailable</span>
          ) : mark ? (
            <span className={cn("ac-mark", mark.tone)} title="Organisation-level module availability">Module {mark.label.toLowerCase()}</span>
          ) : null
        ) : null}
      </div>
      <p className="ac-domain-sum">{domain.summary}</p>
      {module && module.status !== "enabled" ? (
        <p className="ac-secondary" style={{ marginTop: 4 }}>The module is not enabled for this organisation, so these grants have no effect until it is.</p>
      ) : null}
      {domain.capabilities.map((c) => {
        const isHeld = held.has(c.key);
        const isConfirming = confirming?.key === c.key;
        return (
          <div key={c.key} className={cn("ac-cap", isHeld && "ac-cap-granted")}>
            <div>
              <span className="ac-cap-label">{c.label}</span> <span className="ac-cap-key">{c.key}</span>
            </div>
            <div>
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
  );
}
