"use client";

import Link from "next/link";
import { ArrowRight, Blocks, KeyRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminOverview, OrganisationAdminRecord } from "../types";
import { adminCall } from "./adminApi";
import { AuditFeed } from "./AuditFeed";
import { Panel, Pill } from "./kit";
import { ContextStrip, DataBoundary, OrgGate, PageHead, moduleStatusMark, useAdminData } from "./ui";

export function OverviewView() {
  return (
    <div className="ac-page">
      <ContextStrip />
      <OrgGate title="Overview" lede={LEDE}>
        {(organisation) => <OverviewBody organisation={organisation} />}
      </OrgGate>
    </div>
  );
}

const LEDE = "The platform control plane for this organisation: who is here, which modules are available, and what has changed.";

function OverviewBody({ organisation }: { organisation: OrganisationAdminRecord }) {
  const q = `?org=${organisation.id}`;
  const state = useAdminData<AdminOverview>((signal) => adminCall<AdminOverview>("getOverview", { organisationId: organisation.id }, signal), [organisation.id]);
  return (
    <>
      <PageHead title="Overview" lede={LEDE} />
      <DataBoundary state={state} onRetry={state.reload} what="the overview">
        {(o) => {
          const enabled = o.modules.filter((m) => m.status === "enabled");
          const unavailable = o.modules.filter((m) => m.status !== "enabled");
          const others = (["invited", "suspended", "inactive"] as const).filter((s) => o.peopleByStatus[s] > 0);
          return (
            <>
              <div className="ac-summary">
                <Link href={`/admin/people${q}`} className="ac-tile">
                  <div className="ac-tile-head">
                    <span className="ac-tile-label">People</span>
                    <span className="ac-tile-icon" aria-hidden><Users className="h-4 w-4" /></span>
                  </div>
                  <div className="ac-tile-figure">
                    <b>{o.peopleByStatus.active}</b>
                    <span>active of {o.peopleTotal}</span>
                  </div>
                  <div className="ac-tile-meta">
                    {others.length === 0 ? <span>Everyone is active</span> : others.map((s) => <span key={s}><b>{o.peopleByStatus[s]}</b> {s}</span>)}
                  </div>
                  <span className="ac-tile-go">Open people <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
                </Link>

                <Link href={`/admin/access${q}`} className={cn("ac-tile", o.activeWithoutGrants > 0 && "ac-tile-attn")}>
                  <div className="ac-tile-head">
                    <span className="ac-tile-label">Access</span>
                    <span className="ac-tile-icon" aria-hidden><KeyRound className="h-4 w-4" /></span>
                  </div>
                  <div className="ac-tile-figure">
                    <b>{o.activeWithoutGrants}</b>
                    <span>{o.activeWithoutGrants === 1 ? "active person" : "active people"} without explicit grants</span>
                  </div>
                  <div className="ac-tile-meta">
                    {o.activeWithoutGrants > 0 ? (
                      <span>They cannot act in any workspace until access is granted.</span>
                    ) : (
                      <span>Every active person (Super Admins aside) holds at least one explicit grant.</span>
                    )}
                  </div>
                  <span className="ac-tile-go">Review access <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
                </Link>

                <Link href={`/admin/modules${q}`} className="ac-tile">
                  <div className="ac-tile-head">
                    <span className="ac-tile-label">Modules</span>
                    <span className="ac-tile-icon" aria-hidden><Blocks className="h-4 w-4" /></span>
                  </div>
                  <div className="ac-tile-figure">
                    <b>{enabled.length}</b>
                    <span>of {o.modules.length} enabled</span>
                  </div>
                  <div className="ac-tile-meta">
                    {unavailable.length === 0 ? <span>All modules are available</span> : <span>Unavailable: {unavailable.map((m) => m.name).join(", ")}</span>}
                  </div>
                  <span className="ac-tile-go">Manage modules <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
                </Link>
              </div>

              <div className="ac-cols ac-cols-2">
                <Panel
                  title="Recent administrative activity"
                  icon={KeyRound}
                  flush
                  aside={<Link href={`/admin/audit${q}`}>Full history</Link>}
                >
                  {o.recentAudit.length === 0 ? (
                    <div className="ac-state">No administrative changes have been recorded for this organisation.</div>
                  ) : (
                    <AuditFeed events={o.recentAudit} compact orgParam={q} />
                  )}
                </Panel>

                <Panel
                  title="Module availability"
                  icon={Blocks}
                  flush
                  aside={<Link href={`/admin/modules${q}`}>Manage</Link>}
                  foot="Availability is organisation-wide. It never gives a person access — access is granted per person."
                >
                  {o.modules.length === 0 ? (
                    <div className="ac-state">The module catalogue is empty.</div>
                  ) : (
                    o.modules.map((m) => {
                      const mark = moduleStatusMark(m.status);
                      return (
                        <div key={m.slug} className={cn("ac-module", m.status === "enabled" ? "ac-module-on" : "ac-module-off")} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                          <div>
                            <div className="ac-module-name">{m.name}</div>
                            {m.description ? <div className="ac-module-desc">{m.description}</div> : null}
                          </div>
                          <Pill tone={mark.pill}>{mark.label}</Pill>
                        </div>
                      );
                    })
                  )}
                </Panel>
              </div>
            </>
          );
        }}
      </DataBoundary>
    </>
  );
}
