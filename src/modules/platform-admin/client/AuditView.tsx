"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AUDIT_CATEGORY_LABELS, type AuditCategory } from "../auditDescribe";
import type { AdminAuditEntry, AdminAuditPage, AdminPersonSummary, OrganisationAdminRecord } from "../types";
import { AdminApiError, adminCall } from "./adminApi";
import { AuditFeed } from "./AuditFeed";
import { ContextStrip, OrgGate, PageHead, displayName, useAdminData } from "./ui";
import { Panel } from "./kit";

export function AuditView() {
  return (
    <div className="ac-page">
      <ContextStrip />
      <OrgGate title="Audit" lede={LEDE}>
        {(organisation) => <AuditBody organisation={organisation} />}
      </OrgGate>
    </div>
  );
}

const LEDE = "The administrative history of this organisation: who changed what, for whom, and when. Operational activity is not shown here.";

function AuditBody({ organisation }: { organisation: OrganisationAdminRecord }) {
  const params = useSearchParams();
  const [category, setCategory] = useState<"" | AuditCategory>("");
  const [profileId, setProfileId] = useState(params.get("person") ?? "");
  const [older, setOlder] = useState<{ key: string; events: AdminAuditEntry[]; next: string | null } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const people = useAdminData<AdminPersonSummary[]>(
    (signal) => adminCall<AdminPersonSummary[]>("listPeople", { organisationId: organisation.id }, signal),
    [organisation.id]
  );
  const key = `${organisation.id}|${category}|${profileId}`;
  const first = useAdminData<AdminAuditPage>(
    (signal) => adminCall<AdminAuditPage>("listAudit", { organisationId: organisation.id, category: category || undefined, profileId: profileId || undefined }, signal),
    [organisation.id, category, profileId]
  );
  const q = `?org=${organisation.id}`;
  const olderHere = older && older.key === key ? older : null;
  const events = first.data ? [...first.data.events, ...(olderHere?.events ?? [])] : null;
  const next = olderHere ? olderHere.next : first.data?.nextBefore ?? null;
  const error = first.error;

  async function more() {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await adminCall<AdminAuditPage>("listAudit", { organisationId: organisation.id, category: category || undefined, profileId: profileId || undefined, before: next });
      setOlder({ key, events: [...(olderHere?.events ?? []), ...page.events], next: page.nextBefore });
    } catch (err) {
      setMoreError(err instanceof AdminApiError ? err.message : "Unable to load older history.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHead title="Audit" lede={LEDE} />
      <Panel flush>
        <div className="ac-toolbar">
          <select className="ac-select" aria-label="Filter by kind of change" value={category} onChange={(e) => setCategory(e.target.value as "" | AuditCategory)}>
            <option value="">All changes</option>
            {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((c) => (
              <option key={c} value={c}>{AUDIT_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <select className="ac-select" aria-label="Filter by person" value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={people.data === null && people.error === null}>
            <option value="">Everyone</option>
            {(people.data ?? []).map((p) => (
              <option key={p.profileId} value={p.profileId}>{displayName(p)}</option>
            ))}
            {profileId && !(people.data ?? []).some((p) => p.profileId === profileId) ? <option value={profileId}>Selected person</option> : null}
          </select>
          {people.error ? <span className="ac-form-error" role="alert">People filter unavailable.</span> : null}
          <span className="ac-toolbar-spacer" />
          {events ? <span className="ac-secondary" role="status">{events.length} shown{next ? " · more available" : ""}</span> : null}
        </div>
        {error && !events ? (
          <div className="ac-state ac-state-error" role="alert">
            <p className="ac-state-title">Couldn’t load administrative history</p>
            <p>{error} This is a failure to load — it does not mean nothing has happened.</p>
            <button type="button" className="ac-btn ac-btn-secondary" onClick={first.reload}>Retry</button>
          </div>
        ) : events === null ? (
          <div className="ac-state" role="status">Loading history…</div>
        ) : events.length === 0 ? (
          <div className="ac-state">
            <p className="ac-state-title">No matching changes</p>
            <p>{category || profileId ? "Nothing has been recorded for these filters." : "No administrative changes have been recorded for this organisation."}</p>
          </div>
        ) : (
          <>
            <AuditFeed events={events} orgParam={q} />
            <div className="ac-panel-foot" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {moreError ? <span className="ac-form-error" role="alert">{moreError}</span> : null}
              {next ? (
                <button type="button" className="ac-btn ac-btn-secondary ac-btn-sm" onClick={more} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load older changes"}
                </button>
              ) : (
                <span>End of history.</span>
              )}
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
