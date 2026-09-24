"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/utils/supabase/client";
import { createVault, decryptItem, destroyVault, encryptItem, signAuthority, type UnlockedVault } from "../crypto/vaultCrypto";
import { fromB64u, toB64u, utf8 } from "../shared/encoding";
import type { EncryptedItem } from "../shared/protocol";
import { authenticateWithPrf, registerWithPrf } from "./webauthnPrf";
import {
  addPasskeyFlow,
  confirmRecoveryAndEstablish,
  recoverWithArtifactFlow,
  removePasskeyFlow,
  rotateRecoveryFlow,
  unlockWithPasskeyFlow,
  type Authenticate,
  type Enrolled,
  type StagedVault,
} from "./vaultFlows";
import { startLockController, type LockController } from "./lockController";
import { derivePosition, openingPosition, type FinancialRecord, type OpeningInput } from "../../accounting/domain";

/**
 * Private Office client shell — mounted once by the Private Office layout, so moving between Overview, Accounts
 * and Notes keeps the vault unlocked; leaving Private Office (unmount), locking, inactivity, sign-out, another
 * tab's lock or a security-generation change discards every key and every decrypted record.
 *
 * Keys and plaintext exist only in this component's memory. Nothing is written to browser storage. Locking
 * Private Office never signs the owner out of SentraCore.
 */

type Status = {
  hasVault: boolean;
  generation: number | null;
  itemCount: number;
  passkeys: { credentialId: string; deviceType: string; backedUp: boolean; createdAt: string }[];
  recoveryRotatedAt: string | null;
  lease: { method: string } | null;
};
type Registration = { credentialId: string; wrapperId: string; publicKey: string };

class VaultApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function api<T>(action: string, fields: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/private-office/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...fields }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as { success?: boolean; data?: T; message?: string };
  if (!response.ok || !body.success) {
    throw new VaultApiError(
      response.status,
      response.status === 423 ? "Private Office locked. Unlock again to continue." : body.message ?? "Private Office is unavailable. Please retry."
    );
  }
  return body.data as T;
}

type VaultContext = {
  status: Status | null;
  unlocked: boolean;
  loaded: boolean;
  records: FinancialRecord[];
  busy: boolean;
  addAccount: (input: OpeningInput) => Promise<boolean>;
  addPasskey: () => void;
  removePasskey: (credentialId: string) => void;
  rotateRecovery: () => void;
};

const Ctx = createContext<VaultContext | null>(null);

export function usePrivateVault(): VaultContext {
  const value = useContext(Ctx);
  if (!value) throw new Error("Private Office shell missing.");
  return value;
}

export function PrivateOfficeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inNotes = pathname.startsWith("/command-centre/private-office/notes");
  const live = useRef<UnlockedVault | null>(null);
  const pending = useRef<StagedVault | null>(null);
  const controller = useRef<LockController | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activation, setActivation] = useState("");
  const [artifact, setArtifact] = useState("");
  const [recovery, setRecovery] = useState("");
  const [confirmRecovery, setConfirmRecovery] = useState("");
  const [settingUp, setSettingUp] = useState(false);

  const refresh = useCallback(async () => setStatus(await api<Status>("status")), []);

  /** Every lock path ends here: keys and plaintext dropped, server lease revoked. The SentraCore session stays. */
  const lockNow = useCallback((reason?: string) => {
    controller.current?.stop();
    controller.current = null;
    destroyVault(live.current);
    destroyVault(pending.current?.vault ?? null);
    live.current = null;
    pending.current = null;
    setUnlocked(false);
    setRecords([]);
    setLoaded(false);
    setArtifact("");
    setRecovery("");
    setActivation("");
    setConfirmRecovery("");
    setSettingUp(false);
    if (reason === "inactivity") setNotice("Private Office locked after inactivity.");
    else if (reason === "another-tab") setNotice("Private Office was locked in another tab.");
    else if (reason === "lease-refused") setNotice("Private Office locked. Unlock again to continue.");
    void api("lock").catch(() => undefined).then(() => refresh().catch(() => undefined));
  }, [refresh]);

  const attach = useCallback((vault: UnlockedVault) => {
    controller.current?.stop();
    live.current = vault;
    setUnlocked(true);
    setNotice("");
    controller.current = startLockController({
      onLock: (reason) => lockNow(reason),
      touch: () => api("touch", { userActive: true }).then(() => true, () => false),
      subscribeSignOut: (callback) => {
        const { data } = createClient().auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") callback();
        });
        return () => data.subscription.unsubscribe();
      },
    });
  }, [lockNow]);

  useEffect(() => {
    let alive = true;
    // Keys are memory-only: a fresh mount is always locked, so any surviving lease is revoked first.
    void api("lock")
      .then(() => (alive ? refresh() : undefined))
      .catch(() => {
        if (alive) setError("Private Office is not available right now. Your Notes remain accessible.");
      });
    return () => {
      alive = false;
      controller.current?.stop();
      destroyVault(live.current);
      destroyVault(pending.current?.vault ?? null);
      void api("lock").catch(() => undefined);
    };
  }, [refresh]);

  async function run(task: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await task();
      await refresh();
      return true;
    } catch (e) {
      if (e instanceof VaultApiError && e.status === 423 && live.current) controller.current?.lock("lease-refused");
      setError(e instanceof Error ? e.message : "Private Office operation failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function read(vault: UnlockedVault) {
    const data = await api<{ items: EncryptedItem[] }>("items-list");
    const decoded = await Promise.all(
      data.items.map(async (item) => {
        const record = JSON.parse(await decryptItem(vault, item)) as FinancialRecord;
        if (record.id !== item.itemId || record.schema !== 1 || !["account", "journal"].includes(record.kind)) {
          throw new Error("Unsupported encrypted financial record.");
        }
        return record;
      })
    );
    derivePosition(decoded); // the whole ledger must validate before anything is shown
    if (live.current !== vault || vault.destroyed) return;
    setRecords(decoded);
    setLoaded(true);
  }

  const authenticate: Authenticate = (options) => authenticateWithPrf(options);

  /** Register a passkey and obtain its PRF output locally, or fail closed. */
  async function enroll(purpose: "create" | "add", proof?: { challengeId: string; signature: string }): Promise<Enrolled & { vaultId: string }> {
    const begin = await api<{ challengeId: string; vaultId: string; prfSalt: string; options: never }>("registration-begin", { purpose, activation: proof });
    const reg = await registerWithPrf(begin.options, begin.prfSalt);
    const registered = await api<Registration>("registration-finish", { challengeId: begin.challengeId, response: reg.response });
    let prf = reg.prfOutput;
    if (!prf && reg.prfEnabled !== false) {
      const ch = await api<{ challengeId: string; options: never }>("authentication-begin", { purpose: "confirm-prf", credentialId: registered.credentialId });
      const auth = await authenticateWithPrf(ch.options);
      await api("authentication-finish", { challengeId: ch.challengeId, response: auth.response });
      prf = auth.prfOutput;
    }
    if (!prf) throw new Error("This passkey cannot provide encrypted unlock on this browser. Use a PRF-capable passkey; there is no weaker fallback.");
    return { vaultId: begin.vaultId, credentialId: registered.credentialId, wrapperId: registered.wrapperId, publicKey: registered.publicKey, prfSalt: begin.prfSalt, prf };
  }

  const setup = () =>
    run(async () => {
      const parts = activation.trim().split(".");
      if (parts.length !== 4 || parts[0] !== "SCPO-A1") throw new Error("Enter the owner activation credential from your independent onboarding.");
      const ch = await api<{ challengeId: string; message: string }>("activation-begin");
      if (!ch.message.startsWith(`sentracore.private-office.activation.v1|${parts[1]}|${parts[2]}|`)) throw new Error("This activation credential belongs to a different owner.");
      const bytes = fromB64u(parts[3]!);
      let signature: string;
      try {
        const key = await crypto.subtle.importKey("pkcs8", bytes, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
        signature = toB64u(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(ch.message))));
      } catch {
        throw new Error("The activation credential could not be used.");
      } finally {
        bytes.fill(0);
        setActivation("");
      }
      const enrolled = await enroll("create", { challengeId: ch.challengeId, signature });
      const created = await createVault({ vaultId: enrolled.vaultId, passkeyWrapperId: enrolled.wrapperId, prfOutput: enrolled.prf });
      enrolled.prf.fill(0);
      pending.current = {
        vault: created.vault,
        publication: created.publication,
        registration: { credentialId: enrolled.credentialId, wrapperId: enrolled.wrapperId, publicKey: enrolled.publicKey, prfSalt: enrolled.prfSalt },
      };
      setArtifact(created.recoveryArtifact);
      setSettingUp(true);
    });

  // The pasted copy is checked locally inside confirmRecoveryAndEstablish; it is never sent anywhere.
  const confirmSetup = () =>
    run(async () => {
      const staged = pending.current;
      if (!staged) throw new Error("Start setup again.");
      try {
        await confirmRecoveryAndEstablish(api, staged, confirmRecovery);
      } finally {
        setConfirmRecovery("");
      }
      pending.current = null;
      setArtifact("");
      setSettingUp(false);
      attach(staged.vault);
      await read(staged.vault);
    });

  const unlock = () =>
    run(async () => {
      const { vault } = await unlockWithPasskeyFlow(api, authenticate);
      attach(vault);
      await read(vault);
    });

  const recover = () =>
    run(async () => {
      try {
        const { vault } = await recoverWithArtifactFlow(api, recovery);
        attach(vault);
        await read(vault);
      } finally {
        setRecovery("");
      }
    });

  const addPasskey = () =>
    void run(async () => {
      const vault = live.current;
      if (!vault) throw new Error("Unlock first.");
      await addPasskeyFlow(api, vault, await enroll("add"));
    });

  const removePasskey = (credentialId: string) =>
    void run(async () => {
      const vault = live.current;
      if (!vault) throw new Error("Unlock first.");
      await removePasskeyFlow(api, vault, credentialId);
    });

  const rotateRecovery = () =>
    void run(async () => {
      const vault = live.current;
      if (!vault) throw new Error("Unlock first.");
      const replacementArtifact = await rotateRecoveryFlow(api, vault, authenticate);
      if (live.current === vault && !vault.destroyed) setArtifact(replacementArtifact);
    });

  const addAccount = (input: OpeningInput) =>
    run(async () => {
      const vault = live.current;
      if (!vault || !loaded) throw new Error("Unlock and load your records first.");
      const additions = openingPosition(input);
      derivePosition([...records, ...additions]); // the resulting ledger must still validate
      const items = await Promise.all(additions.map((record) => encryptItem(vault, record.id, JSON.stringify(record))));
      const expectedCount = records.length;
      const digest = toB64u(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8(JSON.stringify({ expectedCount, items })))));
      const ch = await api<{ challengeId: string; challenge: string }>("authority-begin", { purpose: "append-records" });
      await api("records-append", { input: { items, expectedCount, challengeId: ch.challengeId, signature: await signAuthority(vault, "append-records", ch.challenge, digest) } });
      await read(vault);
    });

  const context: VaultContext = { status, unlocked, loaded, records, busy, addAccount, addPasskey, removePasskey, rotateRecovery };
  const nav = [
    { href: "/command-centre/private-office", label: "Overview", active: pathname === "/command-centre/private-office" },
    { href: "/command-centre/private-office/accounts", label: "Accounts", active: pathname.startsWith("/command-centre/private-office/accounts") },
    { href: "/command-centre/private-office/notes", label: "Notes", active: inNotes },
  ];

  return (
    <Ctx.Provider value={context}>
      <div className="po-vault">
        <header className="po-head">
          <div>
            <p className="po-eyebrow">Executive Office</p>
            <h1>Private Office</h1>
          </div>
          <div className="po-state">
            <span className={unlocked ? "po-state-dot po-state-dot--open" : "po-state-dot"} aria-hidden />
            <span>{unlocked ? "Unlocked on this device" : "Locked"}</span>
            {unlocked ? (
              <button type="button" onClick={() => controller.current?.lock("explicit")}>
                Lock
              </button>
            ) : null}
          </div>
        </header>
        <nav aria-label="Private Office" className="po-nav">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>

        {error ? <p role="alert" className="po-alert">{error}</p> : null}
        {notice && !error ? <p role="status" className="po-notice">{notice}</p> : null}

        {inNotes ? (
          children
        ) : (
          <>
            {!status && !error ? <p className="po-muted">Checking Private Office…</p> : null}

            {!unlocked && status && !status.hasVault && !settingUp ? (
              <section className="po-panel">
                <h2>Establish your Private Office</h2>
                <p>
                  Enter the owner activation credential delivered to you through independent onboarding. SentraCore administrators cannot issue,
                  retrieve or reset it. You will then register a passkey and receive a recovery artifact.
                </p>
                <label>
                  Owner activation credential
                  <input type="password" autoComplete="off" spellCheck={false} value={activation} onChange={(e) => setActivation(e.target.value)} />
                </label>
                <button type="button" disabled={busy || !activation} onClick={() => void setup()}>
                  Verify owner and register passkey
                </button>
              </section>
            ) : null}

            {!unlocked && status?.hasVault ? (
              <section className="po-panel">
                <h2>Your financial information is locked</h2>
                <p className="po-muted">Unlocking uses your passkey on this device. Your SentraCore session is not affected.</p>
                <button type="button" disabled={busy} onClick={() => void unlock()}>
                  Unlock with passkey
                </button>
                <details>
                  <summary>Recover with your recovery artifact</summary>
                  <label>
                    Recovery artifact
                    <input type="password" autoComplete="off" spellCheck={false} value={recovery} onChange={(e) => setRecovery(e.target.value)} />
                  </label>
                  <button type="button" disabled={busy || !recovery} onClick={() => void recover()}>
                    Recover Private Office
                  </button>
                </details>
              </section>
            ) : null}

            {artifact ? (
              <section className="po-panel po-panel--warning">
                <h2>Save your recovery artifact now</h2>
                <p>
                  SentraCore cannot show or retrieve this again. Store it somewhere independent of this device. If you lose every passkey and this
                  artifact, your encrypted information cannot be recovered by anyone.
                </p>
                <textarea readOnly value={artifact} aria-label="Recovery artifact" />
                {settingUp ? (
                  <>
                    <label>
                      Paste your saved copy to confirm you have it
                      <input type="password" autoComplete="off" spellCheck={false} value={confirmRecovery} onChange={(e) => setConfirmRecovery(e.target.value)} />
                    </label>
                    <button type="button" disabled={busy || !confirmRecovery} onClick={() => void confirmSetup()}>
                      Confirm and establish Private Office
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setArtifact("")}>
                    I have saved it
                  </button>
                )}
              </section>
            ) : null}

            {unlocked ? (loaded ? children : <p className="po-muted">Decrypting your records…</p>) : null}
          </>
        )}

        <footer className="po-foot">
          <p>
            Financial contents are encrypted in your browser before they are stored. Notes use separate owner-only storage and are not yet
            encrypted with your Private Office key.
          </p>
          <Link href="/command-centre">Back to Executive Office</Link>
        </footer>
      </div>
    </Ctx.Provider>
  );
}
