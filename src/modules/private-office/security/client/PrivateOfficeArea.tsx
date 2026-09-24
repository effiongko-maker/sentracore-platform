"use client";

import { useState } from "react";
import { ACCOUNT_KINDS, derivePosition, displayAmount, type AccountKind } from "../../accounting/domain";
import { usePrivateVault } from "./PrivateOfficeShell";

/** Decrypted views. Rendered by the shell only while unlocked and after the whole ledger has validated. */

const KIND_LABEL = Object.fromEntries(ACCOUNT_KINDS.map((k) => [k.kind, k.label])) as Record<AccountKind, string>;

export function PrivateOfficeArea({ area }: { area: "overview" | "accounts" }) {
  const vault = usePrivateVault();
  if (!vault.unlocked || !vault.loaded) return null;
  const position = derivePosition(vault.records);
  const currencies = Object.keys(position.positions).sort();

  if (area === "accounts") {
    return (
      <>
        <section className="po-panel">
          <h2>Your accounts</h2>
          {position.accounts.length === 0 ? (
            <p className="po-muted">No accounts yet. Add the bank, cash and mobile-wallet balances you hold today.</p>
          ) : (
            <ul className="po-accounts">
              {position.accounts.map((account) => (
                <li key={account.id}>
                  <div>
                    <strong>{account.name}</strong>
                    <span className="po-muted">
                      {KIND_LABEL[account.accountKind]} · {account.currency} · recorded from {account.openedOn}
                    </span>
                  </div>
                  <span className="po-amount">{displayAmount(account.balance, account.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <AddAccount />
      </>
    );
  }

  return (
    <>
      <section className="po-panel">
        <h2>Recorded liquid position</h2>
        {currencies.length === 0 ? (
          <p className="po-muted">Nothing recorded yet. Start by adding your accounts and the balances you hold today.</p>
        ) : (
          <>
            <ul className="po-positions">
              {currencies.map((currency) => (
                <li key={currency}>
                  <span className="po-muted">{currency}</span>
                  <span className="po-amount po-amount--lead">{displayAmount(position.positions[currency]!, currency)}</span>
                </li>
              ))}
            </ul>
            <p className="po-muted">
              {position.accounts.length} account{position.accounts.length === 1 ? "" : "s"} · each currency shown separately, never converted ·
              balances derived from your recorded history
            </p>
          </>
        )}
      </section>
      <SecurityPanel />
    </>
  );
}

function AddAccount() {
  const { addAccount, busy } = usePrivateVault();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AccountKind>("bank");
  const [currency, setCurrency] = useState("NGN");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState("");
  return (
    <section className="po-panel">
      <h2>Add an account</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void addAccount({ name, accountKind: kind, currency, balance, date }).then((ok) => {
            if (ok) {
              setName("");
              setBalance("");
            }
          });
        }}
      >
        <label>
          Account name
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Type
          <select value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
            {ACCOUNT_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {Intl.supportedValuesOf("currency").map((code) => (
              <option key={code}>{code}</option>
            ))}
          </select>
        </label>
        <label>
          Balance held
          <input required inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="e.g. 14250000.00" autoComplete="off" />
        </label>
        <label>
          As at
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <p className="po-muted">
          This is the balance you already hold — an opening position, not income. Zero is allowed. The currency cannot be changed later.
          Overdrawn (negative) balances are not supported yet.
        </p>
        <button type="submit" disabled={busy}>
          Add account
        </button>
      </form>
    </section>
  );
}

function SecurityPanel() {
  const { status, busy, addPasskey, removePasskey, rotateRecovery } = usePrivateVault();
  return (
    <section className="po-panel">
      <details>
        <summary>Passkeys and recovery</summary>
        {status?.lease?.method === "recovery" ? (
          <p>You recovered without a passkey. Register a replacement passkey, confirm it unlocks, then remove the lost one.</p>
        ) : null}
        <ul className="po-accounts">
          {status?.passkeys.map((key, index) => (
            <li key={key.credentialId}>
              <div>
                <strong>Passkey {index + 1}</strong>
                <span className="po-muted">
                  added {key.createdAt.slice(0, 10)} · {key.backedUp ? "synced" : "this device only"}
                </span>
              </div>
              <button type="button" disabled={busy || (status?.passkeys.length ?? 0) <= 1} onClick={() => removePasskey(key.credentialId)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" disabled={busy} onClick={addPasskey}>
          {status?.lease?.method === "recovery" ? "Register replacement passkey" : "Add another passkey"}
        </button>
        <button type="button" disabled={busy} onClick={rotateRecovery}>
          Replace recovery artifact
        </button>
        <p className="po-muted">
          The last passkey cannot be removed. Replacing the recovery artifact makes the previous one stop working
          {status?.recoveryRotatedAt ? ` (last replaced ${status.recoveryRotatedAt.slice(0, 10)})` : ""}.
        </p>
      </details>
    </section>
  );
}
