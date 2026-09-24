/**
 * Private Office production security — owner-side envelope cryptography.
 *
 * Runs ONLY in the owner's browser (and in Node for verification; Node exposes the same Web Crypto API).
 * Established primitives only, all via Web Crypto:
 *   - randomness: crypto.getRandomValues (vault root key, recovery secret, salts, IVs)
 *   - key derivation: HKDF-SHA-256 with a distinct `info` label per purpose and a fresh random salt per wrap
 *   - encryption / key wrapping: AES-256-GCM, random 96-bit IV, purpose/vault/slot-bound AAD
 *   - vault authority: ECDSA P-256 / SHA-256 key pair; private half stored only encrypted under the root key
 *
 * Each wrapping key is derived with a fresh random salt and used for exactly one encryption, so no
 * (key, IV) pair can repeat. The item data key uses random IVs (NIST SP 800-38D bound: < 2^32 messages).
 *
 * The raw root key exists only as a transient Uint8Array in this module and the in-memory UnlockedVault.
 * JavaScript gives no guaranteed memory erasure; buffers are zero-filled on lock as best effort only.
 */
import { aad, authorityMessage, KDF_INFO, PROTOCOL_VERSION, type AuthorityPurpose, type EncryptedItem, type WrappedKey } from "../shared/protocol";
import { constantTimeEqual, fromB64u, fromUtf8, toB64u, utf8 } from "../shared/encoding";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const SALT_BYTES = 32;

const subtle = () => globalThis.crypto.subtle;

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

async function hkdfAesKey(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: string): Promise<CryptoKey> {
  if (ikm.length < KEY_BYTES) throw new Error("Key material is too short.");
  const base = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: utf8(info) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function hkdfBits(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: string, bits: number): Promise<Uint8Array<ArrayBuffer>> {
  const base = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: utf8(info) }, base, bits));
}

/** Seal bytes under a freshly derived one-time wrapping key. */
async function seal(payload: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: string, aadText: string): Promise<WrappedKey> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await hkdfAesKey(ikm, salt, info);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: utf8(aadText) }, key, payload);
  return { v: PROTOCOL_VERSION, alg: "A256GCM", kdf: "HKDF-SHA256", salt: toB64u(salt), iv: toB64u(iv), ct: toB64u(new Uint8Array(ct)) };
}

/** Open a sealed payload. AES-GCM authentication failure (wrong material, tampering, wrong slot) throws. */
async function open(wrapped: WrappedKey, ikm: Uint8Array<ArrayBuffer>, info: string, aadText: string): Promise<Uint8Array<ArrayBuffer>> {
  if (wrapped.v !== PROTOCOL_VERSION || wrapped.alg !== "A256GCM" || wrapped.kdf !== "HKDF-SHA256") {
    throw new Error("Unsupported key wrapper.");
  }
  const key = await hkdfAesKey(ikm, fromB64u(wrapped.salt), info);
  try {
    return new Uint8Array(
      await subtle().decrypt({ name: "AES-GCM", iv: fromB64u(wrapped.iv), additionalData: utf8(aadText) }, key, fromB64u(wrapped.ct))
    );
  } catch {
    throw new Error("Key material did not open this vault.");
  }
}

/** Public, non-secret fingerprint of the root key: lets recovery prove it reached the ORIGINAL vault. */
async function rootKeyId(root: Uint8Array<ArrayBuffer>): Promise<string> {
  return toB64u(await hkdfBits(root, new Uint8Array(0), KDF_INFO.keyId, 128));
}

/** Memory-only unlocked state. Never serialised, never persisted, never sent anywhere. */
export type UnlockedVault = {
  readonly vaultId: string;
  readonly rootKeyId: string;
  readonly dataKey: CryptoKey;
  readonly authorityKey: CryptoKey;
  /** Needed only to add another wrapper while unlocked. Zero-filled on destroy (best effort). */
  readonly root: Uint8Array<ArrayBuffer>;
  destroyed: boolean;
};

export function destroyVault(vault: UnlockedVault | null): void {
  if (!vault || vault.destroyed) return;
  vault.root.fill(0);
  vault.destroyed = true;
}

function assertLive(vault: UnlockedVault): void {
  if (vault.destroyed) throw new Error("Private Office is locked.");
}

async function openUnlockedVault(vaultId: string, root: Uint8Array<ArrayBuffer>, wrappedAuthorityKey: WrappedKey): Promise<UnlockedVault> {
  const id = await rootKeyId(root);
  const dataKey = await hkdfAesKey(root, utf8(vaultId), KDF_INFO.data);
  const authorityPkcs8 = await open(wrappedAuthorityKey, root, KDF_INFO.authority, aad("authority", vaultId, "authority"));
  const authorityKey = await subtle().importKey("pkcs8", authorityPkcs8, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  authorityPkcs8.fill(0);
  return { vaultId, rootKeyId: id, dataKey, authorityKey, root, destroyed: false };
}

// ── Recovery artifact ──────────────────────────────────────────────────────────────────────────────
// SCPO-P1.<vaultId>.<rootKeyId>.<recoverySecret>.<check>
// `check` is a truncated SHA-256 over the preceding text: typo detection only, not a security control.
// The artifact is the ONLY copy of the recovery secret. The server never receives it.

const ARTIFACT_PREFIX = "SCPO-P1";

async function artifactCheck(body: string): Promise<string> {
  const digest = new Uint8Array(await subtle().digest("SHA-256", utf8(body)));
  return toB64u(digest.slice(0, 6));
}

export async function encodeRecoveryArtifact(vaultId: string, keyId: string, secret: Uint8Array): Promise<string> {
  const body = `${ARTIFACT_PREFIX}.${vaultId}.${keyId}.${toB64u(secret)}`;
  return `${body}.${await artifactCheck(body)}`;
}

export type ParsedRecoveryArtifact = { vaultId: string; rootKeyId: string; secret: Uint8Array<ArrayBuffer> };

export async function decodeRecoveryArtifact(text: string): Promise<ParsedRecoveryArtifact> {
  const invalid = () => new Error("Recovery material is not valid.");
  const parts = text.trim().replace(/\s+/g, "").split(".");
  if (parts.length !== 5 || parts[0] !== ARTIFACT_PREFIX) throw invalid();
  const [, vaultId, keyId, secretText, check] = parts as [string, string, string, string, string];
  const expected = utf8(await artifactCheck(parts.slice(0, 4).join(".")));
  if (!constantTimeEqual(expected, utf8(check))) throw invalid();
  let secret: Uint8Array<ArrayBuffer>;
  try {
    secret = fromB64u(secretText);
  } catch {
    throw invalid();
  }
  if (secret.length !== KEY_BYTES) throw invalid();
  return { vaultId, rootKeyId: keyId, secret };
}

// ── Vault lifecycle ────────────────────────────────────────────────────────────────────────────────

/** Everything the server stores for a new vault. Ciphertext and public parameters only. */
export type VaultPublication = {
  rootKeyId: string;
  passkeyWrapped: WrappedKey;
  recoveryWrapped: WrappedKey;
  authorityPublicKey: string;
  wrappedAuthorityKey: WrappedKey;
};

/**
 * Create a vault: random root key, random independent recovery secret, one passkey wrapper (from the PRF
 * output) and one recovery wrapper around the SAME root key, plus a vault-authority key pair.
 */
export async function createVault(input: { vaultId: string; passkeyWrapperId: string; prfOutput: Uint8Array<ArrayBuffer> }): Promise<{
  vault: UnlockedVault;
  recoveryArtifact: string;
  publication: VaultPublication;
}> {
  const root = randomBytes(KEY_BYTES);
  const recoverySecret = randomBytes(KEY_BYTES);
  const keyId = await rootKeyId(root);

  const passkeyWrapped = await seal(root, input.prfOutput, KDF_INFO.passkeyWrap, aad("passkey", input.vaultId, input.passkeyWrapperId));
  const recoveryWrapped = await seal(root, recoverySecret, KDF_INFO.recoveryWrap, aad("recovery", input.vaultId, "recovery"));

  const pair = await subtle().generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await subtle().exportKey("pkcs8", pair.privateKey));
  const wrappedAuthorityKey = await seal(pkcs8, root, KDF_INFO.authority, aad("authority", input.vaultId, "authority"));
  pkcs8.fill(0);
  const authorityPublicKey = toB64u(new Uint8Array(await subtle().exportKey("spki", pair.publicKey)));

  const recoveryArtifact = await encodeRecoveryArtifact(input.vaultId, keyId, recoverySecret);
  recoverySecret.fill(0);

  const vault = await openUnlockedVault(input.vaultId, root, wrappedAuthorityKey);
  return {
    vault,
    recoveryArtifact,
    publication: { rootKeyId: keyId, passkeyWrapped, recoveryWrapped, authorityPublicKey, wrappedAuthorityKey },
  };
}

/** Unlock through a passkey wrapper using the PRF output of that credential. */
export async function unlockWithPasskey(input: {
  vaultId: string;
  passkeyWrapperId: string;
  wrapped: WrappedKey;
  wrappedAuthorityKey: WrappedKey;
  prfOutput: Uint8Array<ArrayBuffer>;
  expectedRootKeyId: string;
}): Promise<UnlockedVault> {
  const root = await open(input.wrapped, input.prfOutput, KDF_INFO.passkeyWrap, aad("passkey", input.vaultId, input.passkeyWrapperId));
  const vault = await openUnlockedVault(input.vaultId, root, input.wrappedAuthorityKey);
  if (vault.rootKeyId !== input.expectedRootKeyId) {
    destroyVault(vault);
    throw new Error("Key material did not open this vault.");
  }
  return vault;
}

/**
 * Unlock through the recovery wrapper. Independent of every passkey: needs only the artifact and the
 * stored recovery wrapper. Refuses unless the recovered root key is the one the artifact was issued for.
 */
export async function unlockWithRecovery(input: {
  artifact: string;
  vaultId: string;
  wrapped: WrappedKey;
  wrappedAuthorityKey: WrappedKey;
}): Promise<UnlockedVault> {
  const parsed = await decodeRecoveryArtifact(input.artifact);
  if (parsed.vaultId !== input.vaultId) throw new Error("Recovery material is for a different vault.");
  try {
    const root = await open(input.wrapped, parsed.secret, KDF_INFO.recoveryWrap, aad("recovery", input.vaultId, "recovery"));
    const vault = await openUnlockedVault(input.vaultId, root, input.wrappedAuthorityKey);
    if (vault.rootKeyId !== parsed.rootKeyId) {
      destroyVault(vault);
      throw new Error("Recovered key is not the original vault key.");
    }
    return vault;
  } finally {
    parsed.secret.fill(0);
  }
}

/** Replace recovery protection only: never generate a root or rewrite encrypted items. */
export async function replaceRecoveryWrapper(vault: UnlockedVault): Promise<{ recoveryArtifact: string; wrapped: WrappedKey }> {
  assertLive(vault);
  const secret = randomBytes(KEY_BYTES);
  try {
    const wrapped = await seal(vault.root, secret, KDF_INFO.recoveryWrap, aad("recovery", vault.vaultId, "recovery"));
    const recoveryArtifact = await encodeRecoveryArtifact(vault.vaultId, vault.rootKeyId, secret);
    assertLive(vault);
    return { recoveryArtifact, wrapped };
  } finally {
    secret.fill(0);
  }
}

/** Wrap the (unlocked) root key for an additional passkey. */
export async function wrapForPasskey(vault: UnlockedVault, passkeyWrapperId: string, prfOutput: Uint8Array<ArrayBuffer>): Promise<WrappedKey> {
  assertLive(vault);
  return seal(vault.root, prfOutput, KDF_INFO.passkeyWrap, aad("passkey", vault.vaultId, passkeyWrapperId));
}

export async function signAuthority(vault: UnlockedVault, purpose: AuthorityPurpose, challenge: string, detail: string): Promise<string> {
  assertLive(vault);
  const signature = await subtle().sign(
    { name: "ECDSA", hash: "SHA-256" },
    vault.authorityKey,
    utf8(authorityMessage(purpose, vault.vaultId, challenge, detail))
  );
  return toB64u(new Uint8Array(signature));
}

export async function encryptItem(vault: UnlockedVault, itemId: string, plaintext: string): Promise<Pick<EncryptedItem, "itemId" | "v" | "iv" | "ct">> {
  assertLive(vault);
  const iv = randomBytes(IV_BYTES);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: utf8(aad("item", vault.vaultId, itemId)) }, vault.dataKey, utf8(plaintext));
  return { itemId, v: PROTOCOL_VERSION, iv: toB64u(iv), ct: toB64u(new Uint8Array(ct)) };
}

export async function decryptItem(vault: UnlockedVault, item: Pick<EncryptedItem, "itemId" | "iv" | "ct">): Promise<string> {
  assertLive(vault);
  const plain = await subtle().decrypt(
    { name: "AES-GCM", iv: fromB64u(item.iv), additionalData: utf8(aad("item", vault.vaultId, item.itemId)) },
    vault.dataKey,
    fromB64u(item.ct)
  );
  return fromUtf8(plain);
}

/** Wire hash of a wrapper, so an authority signature commits to the exact wrapper being added. */
export async function wrapperDigest(wrapped: WrappedKey): Promise<string> {
  const text = `${wrapped.v}|${wrapped.alg}|${wrapped.kdf}|${wrapped.salt}|${wrapped.iv}|${wrapped.ct}`;
  return toB64u(new Uint8Array(await subtle().digest("SHA-256", utf8(text))));
}
