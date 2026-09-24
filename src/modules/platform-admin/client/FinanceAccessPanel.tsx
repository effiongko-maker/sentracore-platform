"use client";

import { ChevronRight, Landmark } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { PLATFORM_FINANCE_CAPABILITY_LABELS } from "@/modules/platform-finance/constants";
import { PLATFORM_FINANCE_CAPABILITIES } from "@/modules/platform-finance/types";
import type { AdminFinanceAccess, FinanceAccessEditor, FinanceAccessUpdateResult } from "../types";
import { AdminApiError, adminCall } from "./adminApi";
import { groupFinanceCapabilities } from "./financeCapabilityGroups";
import { Panel, Pill } from "./kit";
import { Note, useAdminData } from "./ui";

/**
 * Admin Console → Person → Access → Platform Finance access.
 * Editable only when the server confirms the viewer's explicit platform_finance.access.manage grant; everyone else
 * keeps the read-only summary. Financial-account access is summarised, never edited here. Every change is persisted
 * server-side through the audited finance_iam_* functions — the browser never writes Finance access tables.
 */
export function FinanceAccessPanel({
  organisationId,
  profileId,
  access,
  onSaved,
}: {
  organisationId: string;
  profileId: string;
  access: AdminFinanceAccess;
  onSaved: () => void;
}) {
  const editor = useAdminData<FinanceAccessEditor>(
    (signal) => adminCall<FinanceAccessEditor>("getFinanceAccessEditor", { organisationId, profileId }, signal),
    [organisationId, profileId]
  );
  const data = editor.data;
  const editable = data?.canManage === true ? data : null;

  return (
    <Panel title="Platform Finance access" icon={Landmark} aside={editable ? undefined : "Read-only here"} flush>
      <FinanceAccessSummary access={access} />
      {editable ? (
        <FinanceAccessForm
          key={JSON.stringify([editable.selectedCompanyIds, editable.selectedCapabilities])}
          organisationId={organisationId}
          profileId={profileId}
          editor={editable}
          onSaved={() => {
            editor.reload();
            onSaved();
          }}
        />
      ) : (
        <>
          <FinanceAccessReadOnly access={access} />
          {editor.error ? (
            <div style={{ padding: "0 1rem 0.75rem" }}>
              <Note tone="critical">Finance access administration could not be checked: {editor.error}</Note>
            </div>
          ) : data && !data.canManage && data.reason ? (
            <div style={{ padding: "0 1rem 0.75rem" }}>
              <Note>{data.reason}</Note>
            </div>
          ) : null}
        </>
      )}
    </Panel>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const labels = PLATFORM_FINANCE_CAPABILITY_LABELS as Record<string, string>;

/** Saved state at a glance: counts first. Restricted financial-account access is summarised only. */
function FinanceAccessSummary({ access }: { access: AdminFinanceAccess }) {
  const none = access.capabilities.length === 0 && access.companies.length === 0 && access.financialAccountAccessCount === 0;
  return (
    <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--ac-line)" }}>
      {none ? (
        <span className="ac-secondary">No Platform Finance access.</span>
      ) : (
        <span className="ac-cap-edit-summary">
          <span className="ac-num">{plural(access.companies.length, "company", "companies")}</span>
          <span className="ac-secondary"> · </span>
          <span className="ac-num">{plural(access.capabilities.length, "capability", "capabilities")}</span>
          {access.financialAccountAccessCount > 0 ? (
            <>
              <span className="ac-secondary"> · </span>
              <span className="ac-num">{plural(access.financialAccountAccessCount, "restricted financial account", "restricted financial accounts")}</span>
            </>
          ) : null}
        </span>
      )}
    </div>
  );
}

/** One collapsible row in the Admin Console domain style: title, summary, "n / total" and pips. */
function Section({
  id,
  title,
  summary,
  count,
  total,
  on,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  count: number;
  total: number;
  on: boolean[];
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = `ac-finance-${id}`;
  return (
    <div className={cn("ac-domain", open && "ac-domain-open")}>
      <button type="button" className="ac-domain-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <ChevronRight className="ac-domain-chev h-4 w-4" aria-hidden />
        <span>
          <h3 className="ac-domain-title">{title}</h3>
          {summary ? <p className="ac-domain-sum">{summary}</p> : null}
        </span>
        <span />
        <span className="ac-domain-count" aria-label={`${count} of ${total} selected`}>
          {count} / {total}
          <span className="ac-pips" aria-hidden>
            {on.map((v, i) => (
              <span key={i} className={cn("ac-pip", v && "ac-pip-on")} />
            ))}
          </span>
        </span>
      </button>
      {open ? (
        <div id={panelId} className="ac-domain-body">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function namesSummary(names: string[]): string {
  if (names.length === 0) return "No companies";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

/** Read-only: the same grouped layout, without controls. */
function FinanceAccessReadOnly({ access }: { access: AdminFinanceAccess }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setOpen((cur) => ({ ...cur, [id]: !cur[id] }));
  const held = new Set(access.capabilities);
  const universe = [...new Set([...Object.values(PLATFORM_FINANCE_CAPABILITIES), ...access.capabilities])];
  if (access.capabilities.length === 0 && access.companies.length === 0) return null;
  return (
    <div>
      <div className="ac-domain">
        <div className="ac-domain-toggle" style={{ cursor: "default" }}>
          <span className="h-4 w-4" style={{ display: "inline-block" }} aria-hidden />
          <span>
            <h3 className="ac-domain-title">Company access</h3>
            <p className="ac-domain-sum">{access.companies.length ? access.companies.join(", ") : "No companies"}</p>
          </span>
          <span />
          <span className="ac-domain-count">{access.companies.length}</span>
        </div>
      </div>
      {groupFinanceCapabilities(universe).map((g) => {
        const on = g.keys.map((k) => held.has(k));
        return (
          <Section key={g.id} id={g.id} title={g.label} count={on.filter(Boolean).length} total={g.keys.length} on={on} open={!!open[g.id]} onToggle={() => toggle(g.id)}>
            {g.keys.map((k) => (
              <div key={k} className="ac-cap">
                <div className="ac-cap-label">
                  {labels[k] ?? k} <span className="ac-cap-key">{k}</span>
                </div>
                <div className="ac-cap-side">
                  <Pill tone={held.has(k) ? "ok" : "plain"}>{held.has(k) ? "Granted" : "Not granted"}</Pill>
                </div>
              </div>
            ))}
          </Section>
        );
      })}
    </div>
  );
}

function FinanceAccessForm({
  organisationId,
  profileId,
  editor,
  onSaved,
}: {
  organisationId: string;
  profileId: string;
  editor: Extract<FinanceAccessEditor, { canManage: true }>;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [companies, setCompanies] = useState(() => new Set(editor.selectedCompanyIds));
  const [capabilities, setCapabilities] = useState(() => new Set(editor.selectedCapabilities));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diff = (a: Set<string>, b: string[]) => b.filter((x) => !a.has(x)).length + [...a].filter((x) => !b.includes(x)).length;
  const changes = diff(companies, editor.selectedCompanyIds) + diff(capabilities, editor.selectedCapabilities);
  const dirty = changes > 0;
  const toggleOpen = (id: string) => setOpen((cur) => ({ ...cur, [id]: !cur[id] }));
  const setMany = (set: Set<string>, values: string[], on: boolean) => {
    const next = new Set(set);
    for (const v of values) {
      if (on) next.add(v);
      else next.delete(v);
    }
    return next;
  };

  function discard() {
    if (saving) return;
    setCompanies(new Set(editor.selectedCompanyIds));
    setCapabilities(new Set(editor.selectedCapabilities));
    setError(null);
  }

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const result = await adminCall<FinanceAccessUpdateResult>("updateFinanceAccess", {
        organisationId,
        profileId,
        companyIds: [...companies],
        financeCapabilities: [...capabilities],
      });
      toast({
        type: "success",
        title: "Platform Finance access saved",
        description: `${result.granted} granted, ${result.revoked} removed. Recorded in the Finance audit history.`,
      });
      onSaved();
    } catch (err) {
      const message = err instanceof AdminApiError ? err.message : "The Finance access change could not be saved.";
      setError(message);
      // The reload below re-renders the panel from the authoritative state, so the toast carries the message too.
      toast({ type: "error", title: "Finance access not saved", description: message });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  /** Staged marker for a changed row; unchanged rows stay quiet. */
  const staged = (was: boolean, now: boolean) =>
    was === now ? null : <Pill tone={now ? "accent" : "warn"}>{now ? "Will grant" : "Will remove"}</Pill>;

  const selectedCompanyNames = editor.companies.filter((c) => companies.has(c.id)).map((c) => c.name);
  return (
    <div>
      <Section
        id="companies"
        title="Company access"
        summary={namesSummary(selectedCompanyNames)}
        count={selectedCompanyNames.length}
        total={editor.companies.length}
        on={editor.companies.map((c) => companies.has(c.id))}
        open={!!open.companies}
        onToggle={() => toggleOpen("companies")}
      >
        {editor.companies.length === 0 ? (
          <p className="ac-secondary" style={{ padding: "0.625rem 0", margin: 0 }}>This organisation has no Finance companies.</p>
        ) : (
          <>
            <div className="ac-domain-batch-controls">
              <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" disabled={saving} onClick={() => setCompanies((s) => setMany(s, editor.companies.map((c) => c.id), true))}>
                Select all
              </button>
              <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" disabled={saving} onClick={() => setCompanies((s) => setMany(s, editor.companies.map((c) => c.id), false))}>
                Clear
              </button>
            </div>
            {editor.companies.map((c) => (
              <label key={c.id} className="ac-cap" style={{ cursor: "pointer" }}>
                <span className="ac-cap-label">
                  <input
                    type="checkbox"
                    checked={companies.has(c.id)}
                    disabled={saving}
                    onChange={(e) => setCompanies((s) => setMany(s, [c.id], e.target.checked))}
                  />
                  {c.name}
                </span>
                <span className="ac-cap-side">{staged(editor.selectedCompanyIds.includes(c.id), companies.has(c.id))}</span>
              </label>
            ))}
          </>
        )}
      </Section>

      {groupFinanceCapabilities(editor.assignableCapabilities).map((g) => {
        const on = g.keys.map((k) => capabilities.has(k));
        return (
          <Section key={g.id} id={g.id} title={g.label} count={on.filter(Boolean).length} total={g.keys.length} on={on} open={!!open[g.id]} onToggle={() => toggleOpen(g.id)}>
            <div className="ac-domain-batch-controls">
              <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" disabled={saving} onClick={() => setCapabilities((s) => setMany(s, g.keys, true))}>
                Select all
              </button>
              <button type="button" className="ac-btn ac-btn-quiet ac-btn-sm" disabled={saving} onClick={() => setCapabilities((s) => setMany(s, g.keys, false))}>
                Clear
              </button>
            </div>
            {g.keys.map((cap) => (
              <label key={cap} className="ac-cap" style={{ cursor: "pointer" }}>
                <span className="ac-cap-label">
                  <input
                    type="checkbox"
                    checked={capabilities.has(cap)}
                    disabled={saving}
                    onChange={(e) => setCapabilities((s) => setMany(s, [cap], e.target.checked))}
                  />
                  {labels[cap] ?? cap} <span className="ac-cap-key">{cap}</span>
                </span>
                <span className="ac-cap-side">{staged(editor.selectedCapabilities.includes(cap), capabilities.has(cap))}</span>
              </label>
            ))}
          </Section>
        );
      })}

      {error ? (
        <p className="ac-form-error" role="alert" style={{ padding: "10px 16px", margin: 0 }}>
          {error}
        </p>
      ) : null}
      <div className="ac-panel-foot" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <span className={dirty || saving ? "ac-cap-edit-summary" : undefined}>
          {saving ? "Saving Finance access…" : dirty ? `${plural(changes, "unsaved change", "unsaved changes")}` : "No unsaved changes."}
        </span>
        <span className="ac-cap-edit-bar">
          <button type="button" className="ac-btn ac-btn-secondary ac-btn-sm" disabled={saving || !dirty} onClick={discard}>
            Discard changes
          </button>
          <button type="button" className="ac-btn ac-btn-primary ac-btn-sm" disabled={saving || !dirty} onClick={save}>
            {saving ? "Saving…" : "Save Finance access"}
          </button>
        </span>
      </div>
    </div>
  );
}
