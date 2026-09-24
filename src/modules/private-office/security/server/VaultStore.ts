import type { EncryptedItem, WrappedKey } from "../shared/protocol";

/**
 * Private Office persistence model, as the protocol service sees it.
 *
 * Three kinds of state, persisted separately (see the vault foundation migration):
 *   vaults / activations   permanent identity and single-use first-enrolment authority
 *   challenges / pending / leases   short-lived, revocable security state (lease tokens stored as hashes)
 *   records                immutable encrypted envelopes, loaded only when an operation needs them
 * Everything here is public or ciphertext. Nothing can decrypt a vault.
 */

export type PasskeyWrapperRecord = {
  wrapperId: string;
  credentialId: string;
  /** WebAuthn credential public key (COSE, base64url). Verification only — never key material. */
  publicKey: string;
  counter: number;
  transports: string[];
  prfSalt: string;
  wrapped: WrappedKey;
  deviceType: string;
  backedUp: boolean;
  aaguid: string;
  createdAt: string;
};

export type VaultRecord = {
  vaultId: string;
  organisationId: string;
  ownerProfileId: string;
  webauthnUserId: string;
  generation: number;
  createdAt: string;
  rootKeyId: string;
  authorityPublicKey: string;
  wrappedAuthorityKey: WrappedKey;
  recoveryWrapped: WrappedKey;
  recoveryRotatedAt?: string;
  passkeys: PasskeyWrapperRecord[];
  /** Owner-signed manifest of this identity (see crypto/vaultIdentity.ts). Advances with every identity change. */
  manifestSequence: number;
  manifestSignature: string;
};

export type ChallengeRecord = {
  id: string;
  kind: "registration" | "authentication" | "authority";
  purpose: string;
  organisationId: string;
  profileId: string;
  sessionId: string;
  vaultId: string;
  challenge: string;
  webauthnUserId?: string;
  prfSalt?: string;
  credentialId?: string;
  detail?: string;
  /** Set only on a first-enrolment registration that followed a verified independent activation proof. */
  activationAuthorized?: boolean;
  expiresAt: number;
  used: boolean;
};

export type PendingCredentialRecord = Omit<PasskeyWrapperRecord, "wrapped" | "wrapperId" | "createdAt"> & {
  organisationId: string;
  profileId: string;
  sessionId: string;
  vaultId: string;
  webauthnUserId: string;
  registeredAt: number;
  activationAuthorized: boolean;
};

export type LeaseRecord = {
  /** SHA-256 of the lease token. The token itself exists only in the owner's HttpOnly cookie. */
  tokenHash: string;
  organisationId: string;
  profileId: string;
  sessionId: string;
  vaultId: string;
  generation: number;
  method: "passkey" | "recovery";
  issuedAt: number;
  lastActivityAt: number;
  absoluteExpiresAt: number;
  revokedAt: number | null;
};

export type ActivationRecord = { publicKey: string; consumed: boolean };

export type StoreData = {
  /** Keyed by `${organisationId}:${profileId}`. */
  vaults: Record<string, VaultRecord>;
  activations: Record<string, ActivationRecord>;
  challenges: Record<string, ChallengeRecord>;
  pendingCredentials: Record<string, PendingCredentialRecord>;
  leases: Record<string, LeaseRecord>;
  recordCounts: Record<string, number>;
  /** Present for an owner only when the transaction asked for records. Append-only. */
  records: Record<string, EncryptedItem[]>;
};

export type TransactOptions = { records?: boolean };

export function emptyStore(): StoreData {
  return { vaults: {}, activations: {}, challenges: {}, pendingCredentials: {}, leases: {}, recordCounts: {}, records: {} };
}

export interface VaultStore {
  transact<T>(fn: (data: StoreData) => T | Promise<T>, options?: TransactOptions): Promise<T>;
}

/** In-process store for verification. Same semantics; records always loaded. */
export class MemoryVaultStore implements VaultStore {
  private data = emptyStore();
  private queue: Promise<unknown> = Promise.resolve();

  transact<T>(fn: (data: StoreData) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const draft = structuredClone(this.data);
      const before = structuredClone(this.data.records);
      const result = await fn(draft);
      for (const [key, items] of Object.entries(before)) {
        if (JSON.stringify((draft.records[key] ?? []).slice(0, items.length)) !== JSON.stringify(items)) {
          throw new Error("Private Office history is immutable.");
        }
      }
      this.data = draft;
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Verification only: register an activation public key as the offline issuance ceremony would. */
  registerActivation(key: string, publicKey: string): Promise<void> {
    return this.transact((data) => {
      if (data.activations[key]) throw new Error("Activation authority already registered.");
      data.activations[key] = { publicKey, consumed: false };
    });
  }

  /** Raw persisted form, exactly as an operator would read it. */
  async dump(): Promise<string> {
    await this.queue;
    return JSON.stringify(this.data);
  }
}
