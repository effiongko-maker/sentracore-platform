"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  PlatformFinanceHistoricalFactsService,
  type PresentedHistoricalFact,
  type PresentedHistoricalFactDetail,
} from "@/services/platform-finance/PlatformFinanceHistoricalFactsService";

/** Organisation timezone — this register's dates/times are always presented here, never the viewer's local zone. */
const ORG_TIME_ZONE = "Africa/Lagos";

/** Presentation pagination only — fixed page size, no selector. Search/filter runs over the complete dataset
 * first; this only paginates the resulting matches. */
const PAGE_SIZE = 10;

function formatAmount(amount: number | null | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return "Not established";
  return `${currency} ${amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * payment_datetime is authoritative for display — date AND time-of-day, in the organisation timezone. Only a
 * genuinely NULL payment_datetime may render "Not recorded"; payment_datetime_source_text is never substituted
 * in as the primary value (it is shown separately, as source evidence).
 */
function formatPaymentDatetime(iso: string | null): string {
  if (!iso) return "Not recorded";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  const datePart = date.toLocaleDateString("en-GB", {
    timeZone: ORG_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-GB", {
    timeZone: ORG_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${datePart} · ${timePart} WAT`;
}

function spreadLabel(spread: PresentedHistoricalFact["derivedSpread"], currency: string): string | null {
  if (!spread) return null;
  const basisLabel = spread.basis === "authorised" ? "authorised" : "submitted";
  return `${formatAmount(spread.spread, currency)} (${basisLabel} − execution cost)`;
}

export function PlatformFinanceHistoricalFactsPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<PresentedHistoricalFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  // Deep link from the FM Cost Detail reference (?code=HIST-2026-000143) — read once, lazily, as the initial
  // state itself rather than via an effect that sets state on mount.
  const [selectedCode, setSelectedCode] = useState<string | null>(() => searchParams.get("code"));
  const [detail, setDetail] = useState<PresentedHistoricalFactDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const data = await PlatformFinanceHistoricalFactsService.list();
        if (!cancelled) {
          setRows(data);
          setLoading(false);
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Unable to load historical commercial facts.");
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCode) return;
    let cancelled = false;
    const run = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const data = await PlatformFinanceHistoricalFactsService.get({ code: selectedCode });
        if (!cancelled) {
          setDetail(data);
          setDetailLoading(false);
        }
      } catch (cause: unknown) {
        if (!cancelled) {
          setDetailError(cause instanceof Error ? cause.message : "Unable to load this historical commercial fact.");
          setDetailLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedCode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      `${row.code} ${row.description} ${row.commercialReference ?? ""} ${row.sourceCounterpartyText ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [query, rows]);

  // Presentation pagination over the already-filtered (complete-dataset) results. currentPage is clamped so a
  // narrower search (or any other change to the match count) never leaves the view on a now-empty page.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );
  const rangeStart = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const settledCount = rows.filter((r) => r.amountReceived != null).length;
  const withDatetimeCount = rows.filter((r) => r.paymentDatetime != null).length;
  // Never show a previous selection's detail while a different one is loading.
  const detailToShow = detail && detail.code === selectedCode ? detail : null;

  return (
    <div className="pf-requests">
      <header className="pf-ov-header">
        <div>
          <h1 className="pf-ov-title">Historical Commercial Facts</h1>
          <p className="pf-ov-desc">
            Pre-SentraCore™ client commercial facts, preserved as evidence — not native invoices, receivables or
            receipts, and not editable here. {rows.length} record{rows.length === 1 ? "" : "s"} · {settledCount}{" "}
            settled · {withDatetimeCount} with a recorded payment date/time.
          </p>
        </div>
      </header>

      <div className="pf-req-table-card">
        <div className="pf-req-toolbar">
          <label className="pf-req-search">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search code, description, reference…"
            />
          </label>
        </div>
        {loading ? <div className="pf-req-empty">Loading historical commercial facts…</div> : null}
        {error ? <div className="pf-vb-alert is-danger">{error}</div> : null}
        {!loading && !error ? (
          <>
          <div className="pf-req-table-wrap">
            <table className="pf-req-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Description</th>
                  <th>Source status</th>
                  <th>Submitted / Authorised</th>
                  <th>Received</th>
                  <th>Payment date/time</th>
                  <th>Commercial reference</th>
                  <th>Derived spread</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  pageRows.map((row) => (
                    <tr key={row.id} onClick={() => setSelectedCode(row.code)}>
                      <td>
                        <span className="pf-req-primary">{row.code}</span>
                      </td>
                      <td>{row.description}</td>
                      <td>{row.sourcePaymentStatus ?? "Not recorded"}</td>
                      <td>
                        {row.authorisedAmount != null
                          ? formatAmount(row.authorisedAmount, row.currency)
                          : row.submittedAmount != null
                            ? formatAmount(row.submittedAmount, row.currency)
                            : "Not established"}
                      </td>
                      <td>{formatAmount(row.amountReceived, row.currency)}</td>
                      <td>{formatPaymentDatetime(row.paymentDatetime)}</td>
                      <td>{row.commercialReference ?? "—"}</td>
                      <td>
                        {row.derivedSpread ? (
                          <>
                            {spreadLabel(row.derivedSpread, row.currency)}{" "}
                            <span className="pf-badge is-muted">derived</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div className="pf-req-empty">
                        {rows.length ? "No records match the current filters." : "No historical commercial facts recorded."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length ? (
            <footer className="pf-journal-pager">
              <span>
                Showing {rangeStart}–{rangeEnd} of {filtered.length}
              </span>
              <div className="pf-journal-pager-controls">
                <button
                  type="button"
                  className="pf-btn-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  {currentPage} / {pageCount}
                </span>
                <button
                  type="button"
                  className="pf-btn-secondary"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  Next
                </button>
              </div>
            </footer>
          ) : null}
          </>
        ) : null}
      </div>

      {selectedCode ? (
        <div className="pf-drawer-backdrop" onMouseDown={() => setSelectedCode(null)}>
          <aside className="pf-req-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <header className="pf-req-drawer-head">
              <div>
                <p className="pf-req-drawer-ref">HISTORICAL COMMERCIAL FACT</p>
                <h2 className="pf-req-drawer-title">{selectedCode}</h2>
              </div>
              <button className="pf-icon-btn" onClick={() => setSelectedCode(null)} aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <div className="pf-req-drawer-body">
              {detailLoading ? <p className="pf-req-empty">Loading…</p> : null}
              {detailError ? <div className="pf-vb-alert is-danger">{detailError}</div> : null}
              {detailToShow ? (
                <>
                  <div
                    className="mt-1 mb-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm"
                    role="note"
                  >
                    Historical evidence, migrated into SentraCore™. Read-only — there is no edit, correct, or
                    delete action for this record.
                  </div>

                  <section className="pf-req-drawer-section">
                    <h3>Commercial facts</h3>
                    <dl className="pf-req-dl">
                      <div>
                        <dt>Description</dt>
                        <dd>{detailToShow.description}</dd>
                      </div>
                      <div>
                        <dt>Submitted / requested amount</dt>
                        <dd>{formatAmount(detailToShow.submittedAmount, detailToShow.currency)}</dd>
                      </div>
                      <div>
                        <dt>Authorised amount</dt>
                        <dd>{formatAmount(detailToShow.authorisedAmount, detailToShow.currency)}</dd>
                      </div>
                      <div>
                        <dt>Amount received</dt>
                        <dd>{formatAmount(detailToShow.amountReceived, detailToShow.currency)}</dd>
                      </div>
                      <div>
                        <dt>Source payment status</dt>
                        <dd>{detailToShow.sourcePaymentStatus ?? "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Commercial reference</dt>
                        <dd>{detailToShow.commercialReference ?? "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Source counterparty (as stated)</dt>
                        <dd>{detailToShow.sourceCounterpartyText ?? "Not recorded"}</dd>
                      </div>
                    </dl>
                  </section>

                  <section className="pf-req-drawer-section">
                    <h3>Payment date/time</h3>
                    <dl className="pf-req-dl">
                      <div>
                        <dt>Payment date/time ({ORG_TIME_ZONE})</dt>
                        <dd>{formatPaymentDatetime(detailToShow.paymentDatetime)}</dd>
                      </div>
                      <div>
                        <dt>Raw source text</dt>
                        <dd className="font-mono text-sm">
                          {detailToShow.paymentDatetimeSourceText ?? "Not recorded"}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  {detailToShow.derivedSpread ? (
                    <section className="pf-req-drawer-section">
                      <h3>
                        Derived commercial spread <span className="pf-badge is-muted">derived, not source-stated</span>
                      </h3>
                      <dl className="pf-req-dl">
                        <div>
                          <dt>{detailToShow.derivedSpread.basis === "authorised" ? "Authorised" : "Submitted"} amount</dt>
                          <dd>{formatAmount(detailToShow.derivedSpread.commercialAmount, detailToShow.currency)}</dd>
                        </div>
                        <div>
                          <dt>FM execution cost</dt>
                          <dd>{formatAmount(detailToShow.derivedSpread.executionCost, detailToShow.currency)}</dd>
                        </div>
                        <div>
                          <dt>Spread</dt>
                          <dd>{formatAmount(detailToShow.derivedSpread.spread, detailToShow.currency)}</dd>
                        </div>
                      </dl>
                      <p className="pf-req-description">
                        Read-time only — commercial amount minus FM&apos;s execution cost for the linked Work. Never
                        stored, never a source-stated markup.
                      </p>
                    </section>
                  ) : null}

                  {detailToShow.workRef.workCode || detailToShow.workRef.workInstructionCode ? (
                    <section className="pf-req-drawer-section">
                      <h3>FM Work / Work Instruction (CERTAIN link)</h3>
                      <dl className="pf-req-dl">
                        {detailToShow.workRef.workCode ? (
                          <div>
                            <dt>Work</dt>
                            <dd>
                              {detailToShow.workRef.workCode}
                              {detailToShow.workRef.workTitle ? ` · ${detailToShow.workRef.workTitle}` : ""}
                            </dd>
                          </div>
                        ) : null}
                        {detailToShow.workRef.workInstructionCode ? (
                          <div>
                            <dt>Work Instruction</dt>
                            <dd>{detailToShow.workRef.workInstructionCode}</dd>
                          </div>
                        ) : null}
                      </dl>
                      <p className="pf-req-description">
                        FM remains authoritative for the execution cost; this is a reference only — no value is
                        copied between domains.
                      </p>
                    </section>
                  ) : null}

                  {detailToShow.provenance ? (
                    <section className="pf-req-drawer-section">
                      <h3>Source evidence</h3>
                      <dl className="pf-req-dl">
                        <div>
                          <dt>Workbook</dt>
                          <dd>{detailToShow.provenance.workbook}</dd>
                        </div>
                        <div>
                          <dt>Sheet</dt>
                          <dd>{detailToShow.provenance.sourceSheet}</dd>
                        </div>
                        <div>
                          <dt>Row</dt>
                          <dd>{detailToShow.provenance.sourceRow}</dd>
                        </div>
                        {detailToShow.provenance.sourceReference ? (
                          <div>
                            <dt>Reference</dt>
                            <dd>{detailToShow.provenance.sourceReference}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
