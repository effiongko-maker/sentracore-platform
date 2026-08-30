"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  trackOccupantRequest,
  type TrackOccupantRequestResult,
} from "../actions/trackOccupantRequest";
import { RequestStatusBadge } from "./RequestStatusBadge";
import { SubmitRequestChrome } from "./SubmitRequestChrome";

export function TrackRequestPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const initialRef = useMemo(
    () => searchParams.get("ref")?.trim() ?? "",
    [searchParams]
  );

  const [reference, setReference] = useState(initialRef);
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackOccupantRequestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await trackOccupantRequest({
        reference,
        contact,
      });
      if (!response.success) throw new Error(response.error.message);
      setResult(response.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to check status right now.";
      setError(message);
      toast({
        title: "Couldn’t find that request",
        description: message,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  function trackAnother() {
    setResult(null);
    setError(null);
    setReference("");
    setContact("");
  }

  return (
    <SubmitRequestChrome>
      <div className="sr-body sr-body-single">
        <div className="sr-main">
          <div className="sr-section-head">
            <span className="sr-section-icon">
              <Search aria-hidden />
            </span>
            <div>
              <h2 className="sr-section-title">Track a request</h2>
              <p className="sr-section-sub">
                Enter your request reference and the email or phone you used
                when submitting.
              </p>
            </div>
          </div>

          {!result ? (
            <form onSubmit={(e) => void handleCheck(e)}>
              <div className="sr-field" style={{ marginTop: 0 }}>
                <label className="sr-label" htmlFor="track-ref">
                  Reference<span className="req">*</span>
                </label>
                <input
                  id="track-ref"
                  className="sr-input"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. REQ-2026-000114"
                  autoComplete="off"
                  disabled={loading}
                />
              </div>
              <div className="sr-field">
                <label className="sr-label" htmlFor="track-contact">
                  Email or phone<span className="req">*</span>
                </label>
                <input
                  id="track-contact"
                  className="sr-input"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="The email or phone on your request"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              {error ? <p className="sr-error">{error}</p> : null}
              <div className="sr-actions">
                <Link href="/occupant-requests" className="sr-btn">
                  Submit a request
                </Link>
                <button
                  type="submit"
                  className="sr-btn sr-btn-primary"
                  disabled={loading}
                >
                  {loading ? "Checking…" : "Check status"}
                </button>
              </div>
            </form>
          ) : (
            <div className="sr-track-result" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
              <div className="sr-reference">
                <p className="sr-reference-label">Reference</p>
                <p className="sr-reference-value">{result.id}</p>
              </div>
              <dl className="sr-review">
                <div className="sr-review-row">
                  <dt>Status</dt>
                  <dd>
                    <RequestStatusBadge status={result.status} />
                    <span className="sr-status-plain">{result.statusLabel}</span>
                  </dd>
                </div>
                <div className="sr-review-row">
                  <dt>Issue</dt>
                  <dd>{result.title}</dd>
                </div>
                {result.location ? (
                  <div className="sr-review-row">
                    <dt>Location</dt>
                    <dd>{result.location}</dd>
                  </div>
                ) : null}
                <div className="sr-review-row">
                  <dt>Submitted</dt>
                  <dd>
                    {new Date(result.submittedAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </dd>
                </div>
              </dl>
              <div className="sr-actions">
                <button
                  type="button"
                  className="sr-btn"
                  onClick={trackAnother}
                >
                  Track another request
                </button>
                <Link href="/occupant-requests" className="sr-btn sr-btn-primary">
                  Submit another request
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </SubmitRequestChrome>
  );
}
