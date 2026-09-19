"use client";

import Link from "next/link";
import { Blocks } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modals/Modal";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import type { AdminModuleRecord, OrganisationAdminRecord, OrganisationModuleResult } from "../types";
import { AdminApiError, adminCall } from "./adminApi";
import { ContextStrip, DataBoundary, Note, OrgGate, PageHead, moduleStatusMark, useAdminData } from "./ui";
import { Panel, Pill } from "./kit";

export function ModulesView() {
  return (
    <div className="ac-page">
      <ContextStrip />
      <OrgGate title="Modules" lede={LEDE}>
        {(organisation) => <ModulesBody organisation={organisation} />}
      </OrgGate>
    </div>
  );
}

const LEDE = "Which parts of SentraCore™ this organisation has available.";

function ModulesBody({ organisation }: { organisation: OrganisationAdminRecord }) {
  const { toast } = useToast();
  const state = useAdminData<AdminModuleRecord[]>(
    (signal) => adminCall<AdminModuleRecord[]>("listModules", { organisationId: organisation.id }, signal),
    [organisation.id]
  );
  const [pending, setPending] = useState<{ module: AdminModuleRecord; to: "enabled" | "disabled" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const q = `?org=${organisation.id}`;

  function close() {
    if (busy) return;
    setPending(null);
    setError(null);
  }
  async function apply() {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await adminCall<OrganisationModuleResult>("setOrganisationModule", {
        organisationId: organisation.id,
        moduleSlug: pending.module.slug,
        status: pending.to,
      });
      toast({ type: "success", title: `${pending.module.name} ${res.status}`, description: res.changed ? "Recorded in administrative history." : "No change was needed." });
      setPending(null);
      state.reload();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "The module could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="Modules" lede={LEDE} />
      <Note tone="strong">
        <span>
          <strong>Enabling a module does not give anyone access to it.</strong> Availability is set here for the whole organisation; access is granted person by person in{" "}
          <Link href={`/admin/access${q}`} style={{ color: "var(--ac-accent-ink)", fontWeight: 500 }}>Access</Link>.
        </span>
      </Note>
      <div style={{ marginTop: 16 }}>
        <DataBoundary state={state} onRetry={state.reload} what="modules" isEmpty={(d) => d.length === 0} empty={<p>The module catalogue is empty.</p>}>
          {(modules) => (
            <Panel
              title="Module catalogue"
              icon={Blocks}
              flush
              aside={<span className="ac-num">{modules.filter((m) => m.status === "enabled").length} of {modules.length} enabled</span>}
            >
              {[...modules]
                .sort((a, b) => Number(b.status === "enabled") - Number(a.status === "enabled"))
                .map((m) => {
                  const mark = moduleStatusMark(m.status);
                  const on = m.status === "enabled";
                  return (
                    <div key={m.slug} className={cn("ac-module", on ? "ac-module-on" : "ac-module-off")}>
                      <span className="ac-module-icon" aria-hidden>
                        <Blocks className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="ac-module-name">{m.name}</div>
                        {m.description ? <div className="ac-module-desc">{m.description}</div> : null}
                      </div>
                      <div className="ac-module-grants">
                        {m.peopleWithGrants === null ? (
                          <span>Grants not tracked here</span>
                        ) : (
                          <>
                            <b>{m.peopleWithGrants}</b>
                            {m.peopleWithGrants === 1 ? "person with explicit grants" : "people with explicit grants"}
                          </>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Pill tone={mark.pill}>{mark.label}</Pill>
                        {on ? (
                          <button type="button" className="ac-btn ac-btn-danger-quiet ac-btn-sm" onClick={() => setPending({ module: m, to: "disabled" })}>Disable</button>
                        ) : (
                          <button type="button" className="ac-btn ac-btn-secondary ac-btn-sm" onClick={() => setPending({ module: m, to: "enabled" })}>Enable</button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </Panel>
          )}
        </DataBoundary>
      </div>
      <Modal
        open={pending !== null}
        onClose={close}
        size="md"
        title={pending ? `${pending.to === "enabled" ? "Enable" : "Disable"} ${pending.module.name}?` : ""}
        description={organisation.name}
        footer={
          <>
            <button type="button" className="ac-btn ac-btn-secondary" onClick={close} disabled={busy}>Cancel</button>
            <button type="button" className={cn("ac-btn", pending?.to === "disabled" ? "ac-btn-danger" : "ac-btn-primary")} onClick={apply} disabled={busy}>
              {busy ? "Applying…" : pending?.to === "enabled" ? "Enable module" : "Disable module"}
            </button>
          </>
        }
      >
        {pending?.to === "enabled" ? (
          <p style={{ fontSize: 13, lineHeight: 1.55 }}>The module becomes available to the organisation. <strong>No one is granted access</strong> — people who already hold its explicit grants can then enter it; everyone else still needs a grant.</p>
        ) : (
          <p style={{ fontSize: 13, lineHeight: 1.55 }}>The module becomes unavailable to the organisation, so members cannot enter its workspace. Explicit grants are kept and apply again if the module is re-enabled.</p>
        )}
        {error ? <p className="ac-form-error" role="alert">{error}</p> : null}
      </Modal>
    </>
  );
}
