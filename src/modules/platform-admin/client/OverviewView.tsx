"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AdminOverview } from "../types";
import { adminCall } from "./adminApi";
import { useAdminConsole } from "./AdminConsoleContext";
import { AuditFeed } from "./AuditFeed";
import { ContextStrip, DataBoundary, Note, PageHead, Section, moduleStatusMark, useAdminData } from "./ui";

export function OverviewView() {
  const { organisation, loading: orgLoading, error: orgError, reload } = useAdminConsole();
  const q = organisation ? `?org=${organisation.id}` : "";
  const state = useAdminData<AdminOverview>(
    (signal) => adminCall<AdminOverview>("getOverview", { organisationId: organisation!.id }, signal),
    [organisation?.id]
  );
  return (
    <div className="ac-page">
      <ContextStrip />
      <PageHead
        title="Overview"
        lede="The platform control plane for this organisation: who is here, which modules are available, and what has changed."
      />
      {orgError ? (
        <div className="ac-state ac-state-error" role="alert">
          <p className="ac-state-title">Couldn’t load organisations</p>
          <p>{orgError}</p>
          <button type="button" className="ac-btn ac-btn-secondary" onClick={reload}>
            Retry
          </button>
        </div>
      ) : orgLoading ? (
        <div className="ac-state" role="status">Loading organisation…</div>
      ) : !organisation ? (
        <div className="ac-state">
          <p className="ac-state-title">No organisation exists yet</p>
          <p>Organisations are created during platform bootstrap. There is nothing to administer until one exists.</p>
        </div>
      ) : (
        <DataBoundary state={state} onRetry={state.reload} what="the overview">
          {(o) => (
            <div className="ac-overview-grid">
              <div>
                <Section title="People" aside={<Link href={`/admin/people${q}`}>Open people</Link>}>
                  <div className="ac-people-line">
                    {(["active", "invited", "suspended", "inactive"] as const).map((s) => (
                      <Link key={s} href={`/admin/people${q}${q ? "&" : "?"}status=${s}`} aria-label={`${o.peopleByStatus[s]} ${s}`}>
                        <b>{o.peopleByStatus[s]}</b>
                        {s[0].toUpperCase() + s.slice(1)}
                      </Link>
                    ))}
                  </div>
                  {o.peopleTotal === 0 ? <p className="ac-secondary" style={{ marginTop: 12 }}>No people are attached to this organisation.</p> : null}
                  {o.activeWithoutGrants > 0 ? (
                    <div style={{ marginTop: 16 }}>
                      <Note tone="strong">
                        <strong>{o.activeWithoutGrants}</strong> active {o.activeWithoutGrants === 1 ? "person holds" : "people hold"} no explicit capability grants, so{" "}
                        {o.activeWithoutGrants === 1 ? "they cannot" : "they cannot"} act in any workspace yet.{" "}
                        <Link href={`/admin/access${q}`} style={{ color: "var(--ac-accent)" }}>Review access</Link>
                      </Note>
                    </div>
                  ) : null}
                </Section>

                <Section title="Modules" aside={<Link href={`/admin/modules${q}`}>Manage modules</Link>}>
                  {o.modules.length === 0 ? (
                    <div className="ac-state">The module catalogue is empty.</div>
                  ) : (
                    o.modules.map((m) => {
                      const mark = moduleStatusMark(m.status);
                      return (
                        <div key={m.slug} className="ac-module-row">
                          <span className="ac-module-name">{m.name}</span>
                          <span className={cn("ac-mark", mark.tone)}>{mark.label}</span>
                          {m.description ? <span className="ac-module-desc">{m.description}</span> : null}
                        </div>
                      );
                    })
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Note>Module availability is organisation-wide. It never gives a person access — access is granted per person.</Note>
                  </div>
                </Section>
              </div>

              <Section title="Recent administrative activity" aside={<Link href={`/admin/audit${q}`}>Full history</Link>}>
                {o.recentAudit.length === 0 ? (
                  <div className="ac-state">No administrative changes have been recorded for this organisation.</div>
                ) : (
                  <AuditFeed events={o.recentAudit} compact orgParam={q} />
                )}
              </Section>
            </div>
          )}
        </DataBoundary>
      )}
    </div>
  );
}
