/**
 * Private Office signed vault identity (manifest).
 *
 * ANCHOR. The vault root key is recovered only from owner-held secrets (passkey PRF or the recovery artifact),
 * and the vault-authority private key exists only encrypted under that root key. So after a local unwrap the
 * client holds key material that no server or database writer can have produced. The owner uses that authority
 * key to sign a manifest of the vault's complete public identity; on EVERY unlock the client re-derives the
 * manifest from the identity the server returned and checks that:
 *   1. the root key it just unwrapped has the manifest's root fingerprint and vault id;
 *   2. the authority public key the server holds is the partner of the authority private key decrypted under
 *      that root (proved by a fresh local sign/verify, not by trusting the server's copy);
 *   3. that authority key signed exactly this identity: every passkey wrapper, credential public key, PRF salt,
 *      the recovery wrapper and the wrapped authority key.
 * Any substitution, addition, removal or swap of identity material that the owner did not sign is detected.
 *
 * NOT DETECTABLE without client-held state: replaying an OLDER, fully consistent identity that the owner really
 * signed (rollback), and withholding/deleting/rolling back encrypted records (availability). See the report.
 *
 * Isomorphic: the server verifies the same manifest before storing any identity change.
 */
import type { UnlockedVault } from "./vaultCrypto";
import { fromB64u, toB64u, utf8 } from "../shared/encoding";
import type { WrappedKey } from "../shared/protocol";

export type PublicPasskey = { credentialId: string; wrapperId: string; prfSalt: string; publicKey: string; wrapped: WrappedKey };

/** Everything public that defines a vault. Returned by the server on unlock/recovery; never secret. */
export type VaultIdentity = {
  vaultId: string;
  rootKeyId: string;
  authorityPublicKey: string;
  wrappedAuthorityKey: WrappedKey;
  recoveryWrapped: WrappedKey;
  passkeys: PublicPasskey[];
  manifestSequence: number;
  manifestSignature: string;
};

export type UnsignedIdentity = Omit<VaultIdentity, "manifestSignature">;

export class VaultIdentityError extends Error {}

const subtle = () => globalThis.crypto.subtle;

async function sha(text: string): Promise<string> {
  return toB64u(new Uint8Array(await subtle().digest("SHA-256", utf8(text))));
}

function wrappedText(w: WrappedKey): string {
  return `${w.v}|${w.alg}|${w.kdf}|${w.salt}|${w.iv}|${w.ct}`;
}

/** Canonical, order-independent text of an identity at a sequence. Arrays only — no key-order ambiguity. */
export async function manifestMessage(identity: UnsignedIdentity): Promise<string> {
  const passkeys = await Promise.all(
    [...identity.passkeys]
      .sort((a, b) => (a.credentialId < b.credentialId ? -1 : a.credentialId > b.credentialId ? 1 : 0))
      .map(async (p) => [p.credentialId, p.wrapperId, p.prfSalt, await sha(p.publicKey), await sha(wrappedText(p.wrapped))])
  );
  const body = [
    1,
    identity.vaultId,
    identity.manifestSequence,
    identity.rootKeyId,
    identity.authorityPublicKey,
    await sha(wrappedText(identity.wrappedAuthorityKey)),
    await sha(wrappedText(identity.recoveryWrapped)),
    passkeys,
  ];
  return `sentracore.private-office.v1|vault-manifest|${JSON.stringify(body)}`;
}

/** Owner side: sign a (next) identity with the unlocked vault's authority key. */
export async function signManifest(vault: UnlockedVault, identity: UnsignedIdentity): Promise<string> {
  if (vault.destroyed) throw new Error("Private Office is locked.");
  if (identity.vaultId !== vault.vaultId || identity.rootKeyId !== vault.rootKeyId) throw new VaultIdentityError("Identity does not belong to this vault.");
  const signature = await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, vault.authorityKey, utf8(await manifestMessage(identity)));
  return toB64u(new Uint8Array(signature));
}

async function verifyWith(publicKeySpki: string, message: string, signature: string): Promise<boolean> {
  try {
    const key = await subtle().importKey("spki", fromB64u(publicKeySpki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64u(signature), utf8(message));
  } catch {
    return false;
  }
}

/** Server side (and client pre-check): is this identity signed by its own authority key? */
export async function manifestSignatureValid(identity: VaultIdentity): Promise<boolean> {
  const { manifestSignature, ...unsigned } = identity;
  if (!Number.isInteger(unsigned.manifestSequence) || unsigned.manifestSequence < 1) return false;
  return verifyWith(identity.authorityPublicKey, await manifestMessage(unsigned), manifestSignature);
}

/**
 * Client side, on every unlock / recovery / before any identity change: the identity served must be the one the
 * owner signed, with the key material the owner's secrets just unlocked. Throws VaultIdentityError otherwise.
 */
export async function verifyVaultIdentity(vault: UnlockedVault, identity: VaultIdentity): Promise<void> {
  const fail = (why: string) => {
    throw new VaultIdentityError(`Private Office identity could not be verified (${why}).`);
  };
  if (vault.destroyed) fail("vault is locked");
  if (identity.vaultId !== vault.vaultId) fail("vault id");
  if (identity.rootKeyId !== vault.rootKeyId) fail("root key fingerprint");
  // The server's authority public key must pair with the private key decrypted under the owner's root key.
  const probe = utf8(`sentracore.private-office.v1|authority-probe|${toB64u(globalThis.crypto.getRandomValues(new Uint8Array(32)))}`);
  const proof = toB64u(new Uint8Array(await subtle().sign({ name: "ECDSA", hash: "SHA-256" }, vault.authorityKey, probe)));
  let paired = false;
  try {
    const key = await subtle().importKey("spki", fromB64u(identity.authorityPublicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    paired = await subtle().verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64u(proof), probe);
  } catch {
    paired = false;
  }
  if (!paired) fail("authority key");
  if (!(await manifestSignatureValid(identity))) fail("signed manifest");
}

/** The identity after a change, with the sequence advanced — for the owner to sign. */
export function nextIdentity(current: VaultIdentity, change: Partial<Pick<UnsignedIdentity, "passkeys" | "recoveryWrapped">>): UnsignedIdentity {
  const { manifestSignature: _previous, ...base } = current;
  void _previous;
  return { ...base, ...change, manifestSequence: current.manifestSequence + 1 };
}
