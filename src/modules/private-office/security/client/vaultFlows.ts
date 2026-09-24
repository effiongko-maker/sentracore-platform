/**
 * Private Office client flows that handle recovery material or vault identity.
 *
 * Kept free of React and fetch so verification can run these exact functions against the real protocol and record
 * every request body. Boundary rules enforced here:
 *   - the recovery artifact / recovery secret is only ever opened locally (unlockWithRecovery); request bodies are
 *     built from explicit public fields, never by spreading objects that could carry it;
 *   - on every unlock and recovery the served identity is verified against the owner-signed manifest BEFORE the
 *     vault is used or any proof is signed for the server; any identity change is signed by the owner.
 */
import {
  destroyVault,
  replaceRecoveryWrapper,
  signAuthority,
  unlockWithPasskey,
  unlockWithRecovery,
  wrapForPasskey,
  wrapperDigest,
  type UnlockedVault,
  type VaultPublication,
} from "../crypto/vaultCrypto";
import { nextIdentity, signManifest, verifyVaultIdentity, type UnsignedIdentity, type VaultIdentity } from "../crypto/vaultIdentity";
import type { WrappedKey } from "../shared/protocol";

export type Api = <T>(action: string, fields?: Record<string, unknown>) => Promise<T>;
export type Assertion = { response: unknown; credentialId: string; prfOutput: Uint8Array<ArrayBuffer> | null };
export type Authenticate = (options: never) => Promise<Assertion>;
/** A registered, PRF-confirmed passkey (public fields + the local PRF output). */
export type Enrolled = { credentialId: string; wrapperId: string; publicKey: string; prfSalt: string; prf: Uint8Array<ArrayBuffer> };
export type StagedVault = { vault: UnlockedVault; publication: VaultPublication; registration: Omit<Enrolled, "prf"> };

async function lockQuietly(api: Api) {
  await api("lock").catch(() => undefined);
}

/**
 * First enrolment, final step. The owner's pasted copy of the recovery artifact is checked ENTIRELY in the browser
 * by opening the staged recovery wrapper with it. Only public/wrapped material and the owner's manifest signature
 * are sent to establish the vault.
 */
export async function confirmRecoveryAndEstablish(api: Api, staged: StagedVault, typedArtifact: string): Promise<VaultIdentity> {
  const { vault, publication, registration } = staged;
  const verified = await unlockWithRecovery({
    artifact: typedArtifact,
    vaultId: vault.vaultId,
    wrapped: publication.recoveryWrapped,
    wrappedAuthorityKey: publication.wrappedAuthorityKey,
  });
  const matches = verified.rootKeyId === vault.rootKeyId;
  destroyVault(verified);
  if (!matches) throw new Error("That is not the recovery artifact shown above.");
  const identity: UnsignedIdentity = {
    vaultId: vault.vaultId,
    rootKeyId: publication.rootKeyId,
    authorityPublicKey: publication.authorityPublicKey,
    wrappedAuthorityKey: publication.wrappedAuthorityKey,
    recoveryWrapped: publication.recoveryWrapped,
    passkeys: [{ credentialId: registration.credentialId, wrapperId: registration.wrapperId, prfSalt: registration.prfSalt, publicKey: registration.publicKey, wrapped: publication.passkeyWrapped }],
    manifestSequence: 1,
  };
  const manifestSignature = await signManifest(vault, identity);
  await api("vault-create", {
    input: {
      vaultId: vault.vaultId,
      credentialId: registration.credentialId,
      wrapperId: registration.wrapperId,
      rootKeyId: publication.rootKeyId,
      passkeyWrapped: publication.passkeyWrapped,
      recoveryWrapped: publication.recoveryWrapped,
      authorityPublicKey: publication.authorityPublicKey,
      wrappedAuthorityKey: publication.wrappedAuthorityKey,
      manifestSignature,
    },
  });
  return { ...identity, manifestSignature };
}

/** Passkey unlock: PRF → unwrap root locally → verify the served identity against the owner-signed manifest. */
export async function unlockWithPasskeyFlow(api: Api, authenticate: Authenticate): Promise<{ vault: UnlockedVault; identity: VaultIdentity }> {
  const ch = await api<{ challengeId: string; options: never }>("authentication-begin", { purpose: "unlock" });
  const auth = await authenticate(ch.options);
  const data = await api<{ identity: VaultIdentity }>("authentication-finish", { challengeId: ch.challengeId, response: auth.response });
  const prf = auth.prfOutput;
  if (!prf) {
    await lockQuietly(api);
    throw new Error("This passkey did not provide encrypted unlock. Use another registered passkey or your recovery artifact.");
  }
  const identity = data.identity;
  const entry = identity?.passkeys?.find((p) => p.credentialId === auth.credentialId);
  let vault: UnlockedVault | null = null;
  try {
    if (!entry) throw new Error("Private Office identity could not be verified (passkey not in identity).");
    vault = await unlockWithPasskey({
      vaultId: identity.vaultId,
      passkeyWrapperId: entry.wrapperId,
      wrapped: entry.wrapped,
      wrappedAuthorityKey: identity.wrappedAuthorityKey,
      prfOutput: prf,
      expectedRootKeyId: identity.rootKeyId,
    });
    await verifyVaultIdentity(vault, identity);
    return { vault, identity };
  } catch (error) {
    destroyVault(vault);
    await lockQuietly(api);
    throw error;
  } finally {
    prf.fill(0);
  }
}

/**
 * Recovery unlock. The artifact never leaves this function: it opens the recovery wrapper locally; the identity is
 * verified before the recovery proof (a signature, not the artifact) is sent.
 */
export async function recoverWithArtifactFlow(api: Api, artifact: string): Promise<{ vault: UnlockedVault; identity: VaultIdentity }> {
  const ch = await api<{ challengeId: string; challenge: string; identity: VaultIdentity }>("recovery-begin");
  const identity = ch.identity;
  let vault: UnlockedVault | null = null;
  try {
    vault = await unlockWithRecovery({ artifact, vaultId: identity.vaultId, wrapped: identity.recoveryWrapped, wrappedAuthorityKey: identity.wrappedAuthorityKey });
    await verifyVaultIdentity(vault, identity);
    const signature = await signAuthority(vault, "recovery", ch.challenge, "recovery");
    await api("recovery-finish", { challengeId: ch.challengeId, signature });
    return { vault, identity };
  } catch (error) {
    destroyVault(vault);
    throw error;
  }
}

/** The current identity, verified — the only base an owner-signed change may be built on. */
export async function verifiedIdentity(api: Api, vault: UnlockedVault): Promise<VaultIdentity> {
  const identity = await api<VaultIdentity>("identity-get");
  await verifyVaultIdentity(vault, identity);
  return identity;
}

export async function addPasskeyFlow(api: Api, vault: UnlockedVault, enrolled: Enrolled): Promise<void> {
  const current = await verifiedIdentity(api, vault);
  let wrapped: WrappedKey;
  try {
    wrapped = await wrapForPasskey(vault, enrolled.wrapperId, enrolled.prf);
  } finally {
    enrolled.prf.fill(0);
  }
  const digest = await wrapperDigest(wrapped);
  const next = nextIdentity(current, {
    passkeys: [...current.passkeys, { credentialId: enrolled.credentialId, wrapperId: enrolled.wrapperId, prfSalt: enrolled.prfSalt, publicKey: enrolled.publicKey, wrapped }],
  });
  const ch = await api<{ challengeId: string; challenge: string }>("authority-begin", { purpose: "add-passkey" });
  await api("passkey-add", {
    input: {
      credentialId: enrolled.credentialId,
      wrapperId: enrolled.wrapperId,
      wrapped,
      wrapperDigest: digest,
      challengeId: ch.challengeId,
      signature: await signAuthority(vault, "add-passkey", ch.challenge, `${enrolled.credentialId}|${enrolled.wrapperId}|${digest}`),
      manifestSignature: await signManifest(vault, next),
    },
  });
}

export async function removePasskeyFlow(api: Api, vault: UnlockedVault, credentialId: string): Promise<void> {
  const current = await verifiedIdentity(api, vault);
  const next = nextIdentity(current, { passkeys: current.passkeys.filter((p) => p.credentialId !== credentialId) });
  const ch = await api<{ challengeId: string; challenge: string }>("authority-begin", { purpose: "remove-passkey" });
  await api("passkey-remove", {
    input: {
      credentialId,
      challengeId: ch.challengeId,
      signature: await signAuthority(vault, "remove-passkey", ch.challenge, credentialId),
      manifestSignature: await signManifest(vault, next),
    },
  });
}

/**
 * Replace the recovery artifact. The new artifact is generated and returned locally for the owner to save; only the
 * new recovery WRAPPER and signatures are sent. Requires a fresh passkey assertion.
 */
export async function rotateRecoveryFlow(api: Api, vault: UnlockedVault, authenticate: Authenticate): Promise<string> {
  const current = await verifiedIdentity(api, vault);
  const ch = await api<{ challengeId: string; options: never }>("authentication-begin", { purpose: "rotate-recovery" });
  const auth = await authenticate(ch.options);
  auth.prfOutput?.fill(0);
  const proof = await api<{ challengeId: string; challenge: string }>("authentication-finish", { challengeId: ch.challengeId, response: auth.response });
  const replacement = await replaceRecoveryWrapper(vault);
  const digest = await wrapperDigest(replacement.wrapped);
  const next = nextIdentity(current, { recoveryWrapped: replacement.wrapped });
  await api("recovery-rotate", {
    input: {
      wrapped: replacement.wrapped,
      wrapperDigest: digest,
      challengeId: proof.challengeId,
      signature: await signAuthority(vault, "rotate-recovery", proof.challenge, digest),
      manifestSignature: await signManifest(vault, next),
    },
  });
  return replacement.recoveryArtifact;
}
