"use client";

import { useEffect, useState } from "react";

/**
 * The ONE-TIME display of a temporary credential to the administrator who just created / reissued it.
 *
 * The password lives only in this component's props for as long as the dialog is open. It is not written to storage,
 * not logged, not put in the URL and not re-fetchable: closing the dialog discards it, and there is no way to read it
 * again — the only remedy is to issue a new one. Copy is explicit and uses the clipboard only on request.
 */
export function TemporaryCredential({
  email,
  password,
  intro,
}: {
  email: string;
  password: string;
  intro: string;
}) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(true);

  // Never leave the credential on the clipboard indefinitely.
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 4000);
    return () => window.clearTimeout(t);
  }, [copied]);

  return (
    <div role="region" aria-label="Temporary credential">
      <p className="ac-state-title">{intro}</p>
      <div className="ac-note ac-note-critical" role="alert">
        <strong>This is the only time this password will be shown.</strong> SentraCore™ does not store it and nobody can
        retrieve it later. Give it to {email} through a channel other than email if you can. They must change it the first
        time they sign in.
      </div>
      <dl className="ac-kv">
        <dt>Sign-in email</dt>
        <dd>{email}</dd>
        <dt>Temporary password</dt>
        <dd>
          <code data-testid="temporary-password" style={{ userSelect: "all", letterSpacing: "0.03em" }}>
            {revealed ? password : "•".repeat(password.length)}
          </code>
        </dd>
      </dl>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="ac-btn ac-btn-secondary" onClick={() => setRevealed((v) => !v)}>
          {revealed ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          className="ac-btn ac-btn-secondary"
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy password"}
        </button>
      </div>
      <p className="ac-secondary" style={{ marginTop: 12 }}>
        No email was sent. If this password is lost, issue a new temporary password.
      </p>
    </div>
  );
}
