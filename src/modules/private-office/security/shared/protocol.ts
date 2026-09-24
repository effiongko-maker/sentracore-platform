/**
 * Private Office production security — shared protocol vocabulary.
 *
 * Every value on the wire is either PUBLIC (salts, IVs, identifiers, public keys) or CIPHERTEXT.
 * The vault root key, recovery secret, PRF output and plaintext never appear in these shapes.
 */

export const PROTOCOL_VERSION = 1 as const;

/** HKDF `info` labels — one per purpose, so no derived key is ever reused across purposes. */
export const KDF_INFO = {
  passkeyWrap: "sentracore.private-office.v1.wrap.passkey",
  recoveryWrap: "sentracore.private-office.v1.wrap.recovery",
  data: "sentracore.private-office.v1.data",
  authority: "sentracore.private-office.v1.authority",
  keyId: "sentracore.private-office.v1.key-id",
} as const;

/** AES-GCM additional authenticated data: binds each ciphertext to its vault, purpose and slot. */
export function aad(purpose: "passkey" | "recovery" | "authority" | "item", vaultId: string, slotId: string): string {
  return `sentracore.private-office.v1|${purpose}|${vaultId}|${slotId}`;
}

/** The message an authority-key signature covers. Purpose-bound and single-use (server challenge). */
export function authorityMessage(purpose: AuthorityPurpose, vaultId: string, challenge: string, detail: string): string {
  return `sentracore.private-office.v1|authority|${purpose}|${vaultId}|${challenge}|${detail}`;
}

export type AuthorityPurpose = "recovery" | "add-passkey" | "remove-passkey" | "rotate-recovery" | "append-records";

export type B64u = string;

/** A 256-bit key wrapped by AES-256-GCM under an HKDF-SHA-256 derived key. All fields public. */
export type WrappedKey = {
  v: typeof PROTOCOL_VERSION;
  alg: "A256GCM";
  kdf: "HKDF-SHA256";
  salt: B64u;
  iv: B64u;
  ct: B64u;
};

export type EncryptedItem = {
  itemId: string;
  v: typeof PROTOCOL_VERSION;
  iv: B64u;
  ct: B64u;
  createdAt: string;
};

/** Lock / unlock timings (server lease and client lock share them). */
export const IDLE_LOCK_MS = 10 * 60 * 1000;
export const LEASE_ABSOLUTE_MS = 60 * 60 * 1000;
export const CEREMONY_TTL_MS = 5 * 60 * 1000;

export const LEASE_COOKIE = "sc_po_lease";
export const LOCK_CHANNEL = "sentracore.private-office.lock";

/** Fields the client may report about its environment. Nothing secret; the server drops anything else. */
export const DIAGNOSTIC_FIELDS = [
  "userAgent",
  "platform",
  "secureContext",
  "webauthn",
  "platformAuthenticator",
  "clientCapabilityPrf",
  "prfEnabledAtCreate",
  "prfResultsAtCreate",
  "prfResultsAtGet",
  "authenticatorAttachment",
  "credentialDeviceType",
  "credentialBackedUp",
  "aaguid",
  "userVerified",
  "transports",
  "outcome",
] as const;
export type DiagnosticField = (typeof DIAGNOSTIC_FIELDS)[number];
export type Diagnostics = Partial<Record<DiagnosticField, string | boolean | null>>;
