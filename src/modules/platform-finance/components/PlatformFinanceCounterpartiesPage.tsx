"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PlatformFinanceCounterpartiesService } from "@/services/platform-finance/PlatformFinanceCounterpartiesService";
import type { OrganisationCounterparty } from "@/modules/platform-finance/domain/counterparties";
import type { CounterpartyCapabilities } from "@/modules/platform-finance/server/PlatformFinanceCounterpartiesServerService";

export function PlatformFinanceCounterpartiesPage() {
  const [rows, setRows] = useState<OrganisationCounterparty[]>([]);
  const [caps, setCaps] = useState<CounterpartyCapabilities | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [saving, setSaving] = useState(false);

  async function reload() {
    const [list, nextCaps] = await Promise.all([
      PlatformFinanceCounterpartiesService.list(),
      PlatformFinanceCounterpartiesService.getMyCapabilities(),
    ]);
    setRows(list);
    setCaps(nextCaps);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(reload)
      .then(() => {
        if (!cancelled) setBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unable to load counterparties.");
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      await PlatformFinanceCounterpartiesService.create({
        displayName,
        legalName: legalName.trim() || null,
        taxRegistrationId: taxId.trim() || null,
        roles: ["customer"],
        status: "active",
      });
      setDisplayName("");
      setLegalName("");
      setTaxId("");
      setCreating(false);
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to create counterparty.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(row: OrganisationCounterparty) {
    setError(null);
    try {
      await PlatformFinanceCounterpartiesService.update(row.id, {
        status: row.status === "active" ? "inactive" : "active",
      });
      await reload();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unable to update counterparty.");
    }
  }

  return (
    <div className="pf-page">
      <header className="pf-page-header">
        <div>
          <Link className="pf-back" href="/platform-finance/invoices">
            <ArrowLeft size={16} /> Invoices
          </Link>
          <h1>Counterparties</h1>
          <p>Organisation master identity for customers (and later vendors).</p>
        </div>
        <div className="pf-page-actions">
          {caps?.manage ? (
            <button type="button" className="pf-btn is-primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> New counterparty
            </button>
          ) : null}
        </div>
      </header>

      {busy ? <p className="pf-state-message">Loading…</p> : null}
      {error ? (
        <p className="pf-form-error" role="alert">
          {error}
        </p>
      ) : null}

      {creating ? (
        <section className="pf-rev-card" style={{ marginBottom: 16 }}>
          <h3>New counterparty</h3>
          <label className="pf-field">
            <span>Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="pf-field">
            <span>Legal name</span>
            <input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </label>
          <label className="pf-field">
            <span>Tax registration ID (optional)</span>
            <input value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </label>
          <div className="pf-page-actions">
            <button type="button" className="pf-btn is-ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="pf-btn is-primary"
              disabled={saving || !displayName.trim()}
              onClick={() => void create()}
            >
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </section>
      ) : null}

      {!busy ? (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roles</th>
                <th>Tax ID</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="pf-empty">
                    No counterparties yet.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.displayName}</strong>
                      {row.legalName ? <div className="pf-payd-muted">{row.legalName}</div> : null}
                    </td>
                    <td>{row.roles.join(", ")}</td>
                    <td>{row.taxRegistrationId ?? "—"}</td>
                    <td>{row.status}</td>
                    <td>
                      {caps?.manage ? (
                        <button
                          type="button"
                          className="pf-btn is-ghost"
                          onClick={() => void toggleStatus(row)}
                        >
                          {row.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
