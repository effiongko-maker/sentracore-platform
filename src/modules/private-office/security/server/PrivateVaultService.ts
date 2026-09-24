import { createHash, randomBytes, randomUUID, webcrypto } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { fromB64u, toB64u, utf8 } from "../shared/encoding";
import {
  authorityMessage,
  CEREMONY_TTL_MS,
  IDLE_LOCK_MS,
  LEASE_ABSOLUTE_MS,
  PROTOCOL_VERSION,
  type AuthorityPurpose,
  type WrappedKey,
} from "../shared/protocol";
import type { ChallengeRecord, LeaseRecord, PasskeyWrapperRecord, StoreData, TransactOptions, VaultRecord, VaultStore } from "./VaultStore";
import { manifestSignatureValid, type PublicPasskey, type VaultIdentity } from "../crypto/vaultIdentity";

/**
 * Private Office production security — server protocol.
 *
 * The server is a ciphertext custodian and a gatekeeper. It verifies WebAuthn ceremonies (challenge,
 * origin, RP ID, user verification, counter), vault-authority signatures and unlock leases. It never
 * receives, derives or stores the vault root key, the recovery secret, any PRF output or any plaintext,
 * and nothing it holds is sufficient to decrypt the vault. Owner and organisation always come from the
 * authenticated actor; a client-supplied vault id is only ever compared against the actor's own vault.
 */

export type VaultActor = { organisationId: string; profileId: string; sessionId: string };
export type WebAuthnConfig = { rpID: string; rpName: string; origin: string };

export type VaultErrorCode = "INVALID" | "NOT_FOUND" | "LOCKED" | "CONFLICT";
export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode, message: string) {
    super(message);
  }
}

const KEY_WRAP_CT_BYTES = 32 + 16;
const MAX_ITEMS = 10000;
const MAX_BATCH = 50;
const MAX_ITEM_CT_BYTES = 16 * 1024;

const vaultKey = (actor: Pick<VaultActor, "organisationId" | "profileId">) => `${actor.organisationId}:${actor.profileId}`;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** What the owner's independent activation credential signs: bound to owner, organisation, session and challenge. */
export function activationMessage(actor: VaultActor, challenge: string): string {
  return `sentracore.private-office.activation.v1|${actor.organisationId}|${actor.profileId}|${actor.sessionId}|${challenge}`;
}

function assertWrapped(value: unknown, ctBytes?: number): asserts value is WrappedKey {
  const w = value as WrappedKey;
  const ok =
    !!w && Object.keys(w).every((key) => ["v", "alg", "kdf", "salt", "iv", "ct"].includes(key)) && w.v === PROTOCOL_VERSION && w.alg === "A256GCM" && w.kdf === "HKDF-SHA256" &&
    typeof w.salt === "string" && typeof w.iv === "string" && typeof w.ct === "string";
  if (!ok) throw new VaultError("INVALID", "Malformed key wrapper.");
  try {
    if (fromB64u(w.salt).length !== 32 || fromB64u(w.iv).length !== 12) throw new Error();
    const ct = fromB64u(w.ct).length;
    if (ctBytes !== undefined ? ct !== ctBytes : ct < 17 || ct > 512) throw new Error();
  } catch {
    throw new VaultError("INVALID", "Malformed key wrapper.");
  }
}

/**
 * The client must strip PRF output before any ceremony response leaves the browser. A response that still
 * carries it is refused outright, before verification, and is never stored or logged.
 */
function refusePrfOutput(response: { clientExtensionResults?: unknown }): void {
  const prf = (response.clientExtensionResults as { prf?: { results?: unknown } } | undefined)?.prf;
  if (prf && prf.results !== undefined) {
    throw new VaultError("INVALID", "PRF output must never be sent to the server.");
  }
}

async function verifyAuthoritySignature(publicKeySpki: string, message: string, signature: string): Promise<boolean> {
  try {
    const key = await webcrypto.subtle.importKey("spki", fromB64u(publicKeySpki), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64u(signature), utf8(message));
  } catch {
    return false;
  }
}

function publicPasskey(p: Pick<PasskeyWrapperRecord, "credentialId" | "wrapperId" | "prfSalt" | "publicKey" | "wrapped">): PublicPasskey {
  return { credentialId: p.credentialId, wrapperId: p.wrapperId, prfSalt: p.prfSalt, publicKey: p.publicKey, wrapped: p.wrapped };
}

/** The complete public identity of a vault — exactly what the owner's manifest signs. */
export function publicIdentity(vault: VaultRecord): VaultIdentity {
  return {
    vaultId: vault.vaultId,
    rootKeyId: vault.rootKeyId,
    authorityPublicKey: vault.authorityPublicKey,
    wrappedAuthorityKey: vault.wrappedAuthorityKey,
    recoveryWrapped: vault.recoveryWrapped,
    passkeys: vault.passkeys.map(publicPasskey),
    manifestSequence: vault.manifestSequence,
    manifestSignature: vault.manifestSignature,
  };
}

/** Refuse any identity the owner's authority key has not signed at exactly the next sequence. */
async function requireSignedIdentity(identity: VaultIdentity, expectedSequence: number): Promise<void> {
  if (typeof identity.manifestSignature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(identity.manifestSignature) || identity.manifestSequence !== expectedSequence || !(await manifestSignatureValid(identity))) {
    throw new VaultError("INVALID", "The vault identity was not signed by the owner.");
  }
}

export class PrivateVaultService {
  constructor(
    private readonly store: VaultStore,
    private readonly webauthn: WebAuthnConfig,
    private readonly now: () => number = Date.now
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Commit even when the operation is refused, so a presented challenge is consumed on failure too.
   * Every operation performs all of its checks before its first state change.
   */
  private async mutate<T>(fn: (data: StoreData) => T | Promise<T>, options?: TransactOptions): Promise<T> {
    const outcome = await this.store.transact(async (data) => {
      try {
        return { ok: true as const, value: await fn(data) };
      } catch (error) {
        return { ok: false as const, error };
      }
    }, options);
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  }

  private ownVault(data: StoreData, actor: VaultActor): VaultRecord | null {
    return data.vaults[vaultKey(actor)] ?? null;
  }

  private takeChallenge(data: StoreData, actor: VaultActor, id: string, kind: ChallengeRecord["kind"]): ChallengeRecord {
    const record = data.challenges[id];
    // Single use: consumed whether or not the rest of the ceremony succeeds.
    if (record) delete data.challenges[id];
    if (
      !record || record.kind !== kind || record.used || record.expiresAt <= this.now() ||
      record.organisationId !== actor.organisationId || record.profileId !== actor.profileId || record.sessionId !== actor.sessionId
    ) {
      throw new VaultError("INVALID", "Challenge is not valid.");
    }
    return record;
  }

  private putChallenge(data: StoreData, actor: VaultActor, fields: Omit<ChallengeRecord, "id" | "organisationId" | "profileId" | "sessionId" | "expiresAt" | "used">): ChallengeRecord {
    const now = this.now();
    for (const [id, c] of Object.entries(data.challenges)) if (c.expiresAt <= now) delete data.challenges[id];
    for (const [id, pending] of Object.entries(data.pendingCredentials)) if (now - pending.registeredAt > CEREMONY_TTL_MS * 2) delete data.pendingCredentials[id];
    for (const [id, lease] of Object.entries(data.leases)) if (lease.revokedAt !== null || now >= lease.absoluteExpiresAt) delete data.leases[id];
    if (Object.keys(data.challenges).length >= 30) throw new VaultError("INVALID", "Too many pending security operations. Please wait.");
    const record: ChallengeRecord = {
      ...fields,
      id: randomUUID(),
      organisationId: actor.organisationId,
      profileId: actor.profileId,
      sessionId: actor.sessionId,
      expiresAt: now + CEREMONY_TTL_MS,
      used: false,
    };
    data.challenges[record.id] = record;
    return record;
  }

  private issueLease(data: StoreData, actor: VaultActor, vault: VaultRecord, method: LeaseRecord["method"]): string {
    const token = toB64u(randomBytes(32));
    const now = this.now();
    data.leases[hashToken(token)] = {
      tokenHash: hashToken(token),
      organisationId: actor.organisationId,
      profileId: actor.profileId,
      sessionId: actor.sessionId,
      vaultId: vault.vaultId,
      generation: vault.generation,
      method,
      issuedAt: now,
      lastActivityAt: now,
      absoluteExpiresAt: now + LEASE_ABSOLUTE_MS,
      revokedAt: null,
    };
    return token;
  }

  /** Any unlock-security change: every existing lease for the vault stops working immediately. */
  private bumpGeneration(data: StoreData, vault: VaultRecord): void {
    vault.generation += 1;
    // Outstanding recovery/authentication proofs must not cross security generations.
    for (const [id, challenge] of Object.entries(data.challenges)) if (challenge.vaultId === vault.vaultId) delete data.challenges[id];
    for (const [id, pending] of Object.entries(data.pendingCredentials)) if (pending.vaultId === vault.vaultId) delete data.pendingCredentials[id];
    const now = this.now();
    for (const lease of Object.values(data.leases)) if (lease.vaultId === vault.vaultId && lease.revokedAt === null) lease.revokedAt = now;
  }

  private leaseProblem(data: StoreData, actor: VaultActor, token: string | null | undefined): string | null {
    if (!token) return "no lease";
    const lease = data.leases[hashToken(token)];
    const vault = this.ownVault(data, actor);
    const now = this.now();
    if (!lease) return "unknown lease";
    if (lease.revokedAt !== null) return "revoked";
    if (lease.organisationId !== actor.organisationId || lease.profileId !== actor.profileId) return "different owner";
    if (lease.sessionId !== actor.sessionId) return "different session";
    if (!vault || vault.vaultId !== lease.vaultId) return "no vault";
    if (lease.generation !== vault.generation) return "security generation changed";
    if (now >= lease.lastActivityAt + IDLE_LOCK_MS) return "idle timeout";
    if (now >= lease.absoluteExpiresAt) return "absolute timeout";
    return null;
  }

  private requireLease(data: StoreData, actor: VaultActor, token: string | null | undefined): { lease: LeaseRecord; vault: VaultRecord } {
    const problem = this.leaseProblem(data, actor, token);
    if (problem) throw new VaultError("LOCKED", "Private Office is locked.");
    return { lease: data.leases[hashToken(token!)]!, vault: this.ownVault(data, actor)! };
  }

  // ── status / lease ─────────────────────────────────────────────────────────────────────────────

  status(actor: VaultActor, leaseToken?: string | null) {
    return this.mutate((data) => {
      const vault = this.ownVault(data, actor);
      const problem = this.leaseProblem(data, actor, leaseToken);
      const lease = problem ? null : data.leases[hashToken(leaseToken!)]!;
      return {
        hasVault: Boolean(vault),
        vaultId: vault?.vaultId ?? null,
        generation: vault?.generation ?? null,
        passkeys: vault?.passkeys.map((p) => ({ credentialId: p.credentialId, deviceType: p.deviceType, backedUp: p.backedUp, createdAt: p.createdAt })) ?? [],
        itemCount: data.recordCounts[vaultKey(actor)] ?? 0,
        recoveryConfigured: Boolean(vault?.recoveryWrapped),
        recoveryRotatedAt: vault?.recoveryRotatedAt ?? null,
        lease: lease ? { method: lease.method, idleExpiresAt: lease.lastActivityAt + IDLE_LOCK_MS, absoluteExpiresAt: lease.absoluteExpiresAt } : null,
      };
    });
  }

  /** Extends the idle window ONLY for genuine user activity. Background calls validate without extending. */
  touch(actor: VaultActor, leaseToken: string | null | undefined, userActive: boolean) {
    return this.mutate((data) => {
      const { lease } = this.requireLease(data, actor, leaseToken);
      if (userActive) lease.lastActivityAt = Math.min(this.now(), lease.absoluteExpiresAt);
      return { idleExpiresAt: lease.lastActivityAt + IDLE_LOCK_MS, absoluteExpiresAt: lease.absoluteExpiresAt };
    });
  }

  lock(actor: VaultActor, leaseToken: string | null | undefined) {
    return this.mutate((data) => {
      if (!leaseToken) return { locked: true };
      const lease = data.leases[hashToken(leaseToken)];
      if (lease && lease.profileId === actor.profileId && lease.organisationId === actor.organisationId && lease.revokedAt === null) {
        lease.revokedAt = this.now();
      }
      return { locked: true };
    });
  }

  /** Normal SentraCore logout / session end: revoke every lease bound to that session. */
  revokeSession(sessionId: string) {
    return this.mutate((data) => {
      let revoked = 0;
      for (const lease of Object.values(data.leases)) {
        if (lease.sessionId === sessionId && lease.revokedAt === null) {
          lease.revokedAt = this.now();
          revoked += 1;
        }
      }
      return { revoked };
    });
  }

  // ── WebAuthn registration ──────────────────────────────────────────────────────────────────────

  beginActivation(actor: VaultActor) {
    return this.mutate((data) => {
      if (this.ownVault(data, actor)) throw new VaultError("CONFLICT", "Private Office is already established.");
      const activation = data.activations[vaultKey(actor)];
      if (!activation || activation.consumed) throw new VaultError("INVALID", "Independent owner activation is required.");
      const proof = this.putChallenge(data, actor, { kind: "authority", purpose: "activation", vaultId: "activation", challenge: toB64u(randomBytes(32)) });
      return { challengeId: proof.id, message: activationMessage(actor, proof.challenge) };
    });
  }

  beginRegistration(actor: VaultActor, purpose: "create" | "add", leaseToken?: string | null, activation?: { challengeId: string; signature: string }) {
    return this.mutate(async (data) => {
      const existing = this.ownVault(data, actor);
      let vaultId: string;
      let webauthnUserId: string;
      if (purpose === "create") {
        // An established vault can never be replaced by creating another — not by the owner, an
        // administrator, or anyone who reset the owner's SentraCore password.
        if (existing) throw new VaultError("CONFLICT", "A Private Office vault already exists.");
        const authority = data.activations[vaultKey(actor)];
        if (!authority || authority.consumed || !activation) throw new VaultError("INVALID", "Independent owner activation is required.");
        const proof = this.takeChallenge(data, actor, activation.challengeId, "authority");
        if (proof.purpose !== "activation" || !await verifyAuthoritySignature(authority.publicKey, activationMessage(actor, proof.challenge), activation.signature)) throw new VaultError("INVALID", "Owner activation was not verified.");
        vaultId = randomUUID();
        webauthnUserId = toB64u(randomBytes(32));
      } else {
        const { vault } = this.requireLease(data, actor, leaseToken);
        vaultId = vault.vaultId;
        webauthnUserId = vault.webauthnUserId;
      }
      const prfSalt = toB64u(randomBytes(32));
      const options = await generateRegistrationOptions({
        rpName: this.webauthn.rpName,
        rpID: this.webauthn.rpID,
        userName: "Private Office",
        userDisplayName: "Private Office",
        userID: fromB64u(webauthnUserId),
        attestationType: "none",
        authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
        excludeCredentials: (existing?.passkeys ?? []).map((p) => ({ id: p.credentialId, transports: p.transports })),
        // Salt travels as base64url; the browser converts it to bytes. The PRF OUTPUT never returns here.
        extensions: { prf: { eval: { first: prfSalt } } } as never,
      });
      const challenge = this.putChallenge(data, actor, {
        kind: "registration", purpose, vaultId, challenge: options.challenge, webauthnUserId, prfSalt,
        activationAuthorized: purpose === "create",
      });
      return { challengeId: challenge.id, vaultId, prfSalt, options };
    });
  }

  finishRegistration(actor: VaultActor, challengeId: string, response: RegistrationResponseJSON) {
    refusePrfOutput(response);
    return this.mutate(async (data) => {
      const challenge = this.takeChallenge(data, actor, challengeId, "registration");
      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: { ...response, clientExtensionResults: {} },
          expectedChallenge: challenge.challenge,
          expectedOrigin: this.webauthn.origin,
          expectedRPID: this.webauthn.rpID,
          requireUserVerification: true,
        });
      } catch {
        throw new VaultError("INVALID", "Passkey registration could not be verified.");
      }
      if (!verification.verified) throw new VaultError("INVALID", "Passkey registration could not be verified.");
      const info = verification.registrationInfo;
      data.pendingCredentials[info.credential.id] = {
        credentialId: info.credential.id,
        publicKey: toB64u(info.credential.publicKey),
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        prfSalt: challenge.prfSalt!,
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        aaguid: info.aaguid,
        organisationId: actor.organisationId,
        profileId: actor.profileId,
        sessionId: actor.sessionId,
        vaultId: challenge.vaultId,
        webauthnUserId: challenge.webauthnUserId!,
        registeredAt: this.now(),
        activationAuthorized: challenge.purpose === "create" && challenge.activationAuthorized === true,
      };
      return {
        credentialId: info.credential.id,
        /** Public COSE key, so the owner can sign it into the vault manifest. */
        publicKey: toB64u(info.credential.publicKey),
        wrapperId: randomUUID(),
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        aaguid: info.aaguid,
        userVerified: info.userVerified,
      };
    });
  }

  // ── WebAuthn authentication ────────────────────────────────────────────────────────────────────

  /**
   * "unlock": any of the vault's passkeys, each with its own PRF salt.
   * "confirm-prf": a just-registered (pending) credential, used when the authenticator did not return a
   * PRF result during registration.
   */
  beginAuthentication(actor: VaultActor, purpose: "unlock" | "confirm-prf" | "rotate-recovery", credentialId?: string, leaseToken?: string | null) {
    return this.mutate(async (data) => {
      let vaultId: string;
      let allow: Array<{ id: string; transports?: string[]; prfSalt: string }>;
      if (purpose === "rotate-recovery") this.requireLease(data, actor, leaseToken);
      if (purpose === "unlock" || purpose === "rotate-recovery") {
        const vault = this.ownVault(data, actor);
        if (!vault || vault.passkeys.length === 0) throw new VaultError("NOT_FOUND", "No passkey can unlock this vault.");
        vaultId = vault.vaultId;
        allow = vault.passkeys.map((p) => ({ id: p.credentialId, transports: p.transports, prfSalt: p.prfSalt }));
      } else {
        const pending = credentialId ? data.pendingCredentials[credentialId] : undefined;
        if (!pending || pending.profileId !== actor.profileId || pending.organisationId !== actor.organisationId || pending.sessionId !== actor.sessionId) {
          throw new VaultError("NOT_FOUND", "Unknown credential.");
        }
        vaultId = pending.vaultId;
        allow = [{ id: pending.credentialId, transports: pending.transports, prfSalt: pending.prfSalt }];
      }
      const options = await generateAuthenticationOptions({
        rpID: this.webauthn.rpID,
        allowCredentials: allow.map(({ id, transports }) => ({ id, transports })),
        userVerification: "required",
        extensions: { prf: { evalByCredential: Object.fromEntries(allow.map((a) => [a.id, { first: a.prfSalt }])) } } as never,
      });
      const challenge = this.putChallenge(data, actor, { kind: "authentication", purpose, vaultId, challenge: options.challenge, credentialId });
      return { challengeId: challenge.id, options };
    });
  }

  finishAuthentication(actor: VaultActor, challengeId: string, response: AuthenticationResponseJSON, leaseToken?: string | null) {
    refusePrfOutput(response);
    return this.mutate(async (data) => {
      const challenge = this.takeChallenge(data, actor, challengeId, "authentication");
      const vault = this.ownVault(data, actor);
      if (challenge.purpose === "rotate-recovery") this.requireLease(data, actor, leaseToken);
      const stored =
        challenge.purpose === "unlock" || challenge.purpose === "rotate-recovery"
          ? vault?.passkeys.find((p) => p.credentialId === response.id)
          : challenge.credentialId === response.id
            ? data.pendingCredentials[response.id]
            : undefined;
      if (!stored) throw new VaultError("INVALID", "Passkey is not enrolled for this vault.");
      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: { ...response, clientExtensionResults: {} },
          expectedChallenge: challenge.challenge,
          expectedOrigin: this.webauthn.origin,
          expectedRPID: this.webauthn.rpID,
          credential: { id: stored.credentialId, publicKey: fromB64u(stored.publicKey), counter: stored.counter, transports: stored.transports },
          requireUserVerification: true,
        });
      } catch {
        throw new VaultError("INVALID", "Passkey could not be verified.");
      }
      if (!verification.verified) throw new VaultError("INVALID", "Passkey could not be verified.");
      stored.counter = verification.authenticationInfo.newCounter;

      if (challenge.purpose === "confirm-prf") return { purpose: "confirm-prf" as const };

      if (challenge.purpose === "rotate-recovery") {
        const proof = this.putChallenge(data, actor, {
          kind: "authority", purpose: "rotate-recovery", vaultId: vault!.vaultId,
          challenge: toB64u(randomBytes(32)),
        });
        return { purpose: "rotate-recovery" as const, challengeId: proof.id, challenge: proof.challenge };
      }

      const wrapper = vault!.passkeys.find((p) => p.credentialId === response.id)!;
      return {
        purpose: "unlock" as const,
        leaseToken: this.issueLease(data, actor, vault!, "passkey"),
        vaultId: vault!.vaultId,
        generation: vault!.generation,
        rootKeyId: vault!.rootKeyId,
        wrapperId: wrapper.wrapperId,
        wrapped: wrapper.wrapped,
        wrappedAuthorityKey: vault!.wrappedAuthorityKey,
        identity: publicIdentity(vault!),
      };
    });
  }

  // ── vault creation ─────────────────────────────────────────────────────────────────────────────

  createVault(actor: VaultActor, input: {
    vaultId: string;
    credentialId: string;
    wrapperId: string;
    rootKeyId: string;
    passkeyWrapped: unknown;
    recoveryWrapped: unknown;
    authorityPublicKey: string;
    wrappedAuthorityKey: unknown;
    manifestSignature: string;
  }) {
    return this.mutate(async (data) => {
      if (this.ownVault(data, actor)) throw new VaultError("CONFLICT", "A Private Office vault already exists.");
      const pending = data.pendingCredentials[input.credentialId];
      if (
        !pending || pending.organisationId !== actor.organisationId || pending.profileId !== actor.profileId ||
        pending.sessionId !== actor.sessionId || pending.vaultId !== input.vaultId || this.now() - pending.registeredAt > CEREMONY_TTL_MS * 2 ||
        !pending.activationAuthorized
      ) {
        throw new VaultError("INVALID", "A fresh passkey registration is required.");
      }
      const activation = data.activations[vaultKey(actor)];
      if (!activation || activation.consumed) throw new VaultError("INVALID", "Owner activation is required.");
      assertWrapped(input.passkeyWrapped, KEY_WRAP_CT_BYTES);
      assertWrapped(input.recoveryWrapped, KEY_WRAP_CT_BYTES);
      assertWrapped(input.wrappedAuthorityKey);
      if (typeof input.rootKeyId !== "string" || fromB64u(input.rootKeyId).length !== 16) throw new VaultError("INVALID", "Malformed key id.");
      if (typeof input.authorityPublicKey !== "string" || fromB64u(input.authorityPublicKey).length !== 91) {
        throw new VaultError("INVALID", "Malformed authority key.");
      }
      await requireSignedIdentity({
        vaultId: input.vaultId,
        rootKeyId: input.rootKeyId,
        authorityPublicKey: input.authorityPublicKey,
        wrappedAuthorityKey: input.wrappedAuthorityKey,
        recoveryWrapped: input.recoveryWrapped,
        passkeys: [publicPasskey({ ...pending, wrapperId: input.wrapperId, wrapped: input.passkeyWrapped })],
        manifestSequence: 1,
        manifestSignature: input.manifestSignature,
      }, 1);
      const now = new Date(this.now()).toISOString();
      const vault: VaultRecord = {
        manifestSequence: 1,
        manifestSignature: input.manifestSignature,
        vaultId: input.vaultId,
        organisationId: actor.organisationId,
        ownerProfileId: actor.profileId,
        webauthnUserId: pending.webauthnUserId,
        generation: 1,
        createdAt: now,
        rootKeyId: input.rootKeyId,
        authorityPublicKey: input.authorityPublicKey,
        wrappedAuthorityKey: input.wrappedAuthorityKey,
        recoveryWrapped: input.recoveryWrapped,
        passkeys: [{
          wrapperId: input.wrapperId,
          credentialId: pending.credentialId,
          publicKey: pending.publicKey,
          counter: pending.counter,
          transports: pending.transports,
          prfSalt: pending.prfSalt,
          wrapped: input.passkeyWrapped,
          deviceType: pending.deviceType,
          backedUp: pending.backedUp,
          aaguid: pending.aaguid,
          createdAt: now,
        }],
      };
      // Consumed in the same commit that establishes the vault; the database enforces the same atomically.
      activation.consumed = true;
      data.vaults[vaultKey(actor)] = vault;
      data.recordCounts[vaultKey(actor)] = 0;
      delete data.pendingCredentials[input.credentialId];
      return { leaseToken: this.issueLease(data, actor, vault, "passkey"), generation: vault.generation };
    });
  }

  // ── vault authority (recovery, wrapper changes) ────────────────────────────────────────────────

  /**
   * Recovery: hands the owner the recovery WRAPPER (ciphertext) and a single-use challenge. Only the
   * holder of the recovery artifact can open the wrapper and so sign the challenge with the vault key.
   */
  beginRecovery(actor: VaultActor) {
    return this.mutate((data) => {
      const vault = this.ownVault(data, actor);
      if (!vault) throw new VaultError("NOT_FOUND", "No Private Office vault.");
      const challenge = this.putChallenge(data, actor, { kind: "authority", purpose: "recovery", vaultId: vault.vaultId, challenge: toB64u(randomBytes(32)), detail: "recovery" });
      return {
        challengeId: challenge.id,
        challenge: challenge.challenge,
        vaultId: vault.vaultId,
        recoveryWrapped: vault.recoveryWrapped,
        wrappedAuthorityKey: vault.wrappedAuthorityKey,
        identity: publicIdentity(vault),
      };
    });
  }

  /** The current public identity, for the owner to verify before signing a change. Requires an unlocked lease. */
  identity(actor: VaultActor, leaseToken: string | null | undefined) {
    return this.mutate((data) => publicIdentity(this.requireLease(data, actor, leaseToken).vault));
  }

  completeRecovery(actor: VaultActor, challengeId: string, signature: string) {
    return this.mutate(async (data) => {
      const challenge = this.takeChallenge(data, actor, challengeId, "authority");
      const vault = this.ownVault(data, actor);
      if (!vault || challenge.purpose !== "recovery" || challenge.vaultId !== vault.vaultId) throw new VaultError("INVALID", "Challenge is not valid.");
      const ok = await verifyAuthoritySignature(vault.authorityPublicKey, authorityMessage("recovery", vault.vaultId, challenge.challenge, "recovery"), signature);
      if (!ok) throw new VaultError("INVALID", "Recovery proof was not accepted.");
      // Recovery is an unlock-security event: other sessions' leases end.
      this.bumpGeneration(data, vault);
      return { leaseToken: this.issueLease(data, actor, vault, "recovery"), generation: vault.generation };
    });
  }

  beginAuthority(actor: VaultActor, leaseToken: string | null | undefined, purpose: Exclude<AuthorityPurpose, "recovery">) {
    return this.mutate((data) => {
      const { vault } = this.requireLease(data, actor, leaseToken);
      if (purpose === "rotate-recovery") throw new VaultError("INVALID", "Fresh passkey verification is required.");
      const challenge = this.putChallenge(data, actor, { kind: "authority", purpose, vaultId: vault.vaultId, challenge: toB64u(randomBytes(32)) });
      return { challengeId: challenge.id, challenge: challenge.challenge };
    });
  }

  private async takeAuthority(data: StoreData, actor: VaultActor, vault: VaultRecord, challengeId: string, purpose: AuthorityPurpose, detail: string, signature: string) {
    const challenge = this.takeChallenge(data, actor, challengeId, "authority");
    if (challenge.purpose !== purpose || challenge.vaultId !== vault.vaultId) throw new VaultError("INVALID", "Challenge is not valid.");
    const ok = await verifyAuthoritySignature(vault.authorityPublicKey, authorityMessage(purpose, vault.vaultId, challenge.challenge, detail), signature);
    if (!ok) throw new VaultError("INVALID", "Vault authority was not proven.");
  }

  /** Adding a passkey needs an unlocked lease, a fresh registration AND a vault-authority signature. */
  addPasskey(actor: VaultActor, leaseToken: string | null | undefined, input: {
    credentialId: string;
    wrapperId: string;
    wrapped: unknown;
    wrapperDigest: string;
    challengeId: string;
    signature: string;
    manifestSignature: string;
  }) {
    return this.mutate(async (data) => {
      const { vault } = this.requireLease(data, actor, leaseToken);
      const pending = data.pendingCredentials[input.credentialId];
      if (!pending || pending.profileId !== actor.profileId || pending.organisationId !== actor.organisationId || pending.sessionId !== actor.sessionId || pending.vaultId !== vault.vaultId || this.now() - pending.registeredAt > CEREMONY_TTL_MS * 2) {
        throw new VaultError("INVALID", "A fresh passkey registration is required.");
      }
      assertWrapped(input.wrapped, KEY_WRAP_CT_BYTES);
      const digest = createHash("sha256")
        .update(`${input.wrapped.v}|${input.wrapped.alg}|${input.wrapped.kdf}|${input.wrapped.salt}|${input.wrapped.iv}|${input.wrapped.ct}`)
        .digest();
      if (toB64u(digest) !== input.wrapperDigest) throw new VaultError("INVALID", "Wrapper digest mismatch.");
      await this.takeAuthority(data, actor, vault, input.challengeId, "add-passkey", `${input.credentialId}|${input.wrapperId}|${input.wrapperDigest}`, input.signature);
      if (vault.passkeys.length >= 10 || vault.passkeys.some((p) => p.credentialId === pending.credentialId)) throw new VaultError("INVALID", "Passkey cannot be added.");
      const { v, alg, kdf, salt, iv, ct } = input.wrapped;
      const wrapped = { v, alg, kdf, salt, iv, ct };
      const next = publicIdentity(vault);
      next.passkeys = [...next.passkeys, publicPasskey({ ...pending, wrapperId: input.wrapperId, wrapped })];
      next.manifestSequence = vault.manifestSequence + 1;
      next.manifestSignature = input.manifestSignature;
      await requireSignedIdentity(next, vault.manifestSequence + 1);
      vault.manifestSequence = next.manifestSequence;
      vault.manifestSignature = next.manifestSignature;
      vault.passkeys.push({
        wrapperId: input.wrapperId,
        credentialId: pending.credentialId,
        publicKey: pending.publicKey,
        counter: pending.counter,
        transports: pending.transports,
        prfSalt: pending.prfSalt,
        wrapped,
        deviceType: pending.deviceType,
        backedUp: pending.backedUp,
        aaguid: pending.aaguid,
        createdAt: new Date(this.now()).toISOString(),
      });
      delete data.pendingCredentials[input.credentialId];
      this.bumpGeneration(data, vault);
      return { leaseToken: this.issueLease(data, actor, vault, "passkey"), generation: vault.generation };
    });
  }

  /** A lease is insufficient: proof is minted ONLY by a fresh UV passkey assertion. */
  rotateRecovery(actor: VaultActor, leaseToken: string | null | undefined, input: {
    wrapped: unknown; wrapperDigest: string; challengeId: string; signature: string; manifestSignature: string;
  }) {
    return this.mutate(async (data) => {
      const { vault } = this.requireLease(data, actor, leaseToken);
      assertWrapped(input.wrapped, KEY_WRAP_CT_BYTES);
      const digest = toB64u(createHash("sha256").update(`${input.wrapped.v}|${input.wrapped.alg}|${input.wrapped.kdf}|${input.wrapped.salt}|${input.wrapped.iv}|${input.wrapped.ct}`).digest());
      if (digest !== input.wrapperDigest) throw new VaultError("INVALID", "Wrapper digest mismatch.");
      await this.takeAuthority(data, actor, vault, input.challengeId, "rotate-recovery", digest, input.signature);
      // Copy only the public envelope fields; never persist arbitrary request properties.
      const { v, alg, kdf, salt, iv, ct } = input.wrapped;
      const next = publicIdentity(vault);
      next.recoveryWrapped = { v, alg, kdf, salt, iv, ct };
      next.manifestSequence = vault.manifestSequence + 1;
      next.manifestSignature = input.manifestSignature;
      await requireSignedIdentity(next, vault.manifestSequence + 1);
      vault.manifestSequence = next.manifestSequence;
      vault.manifestSignature = next.manifestSignature;
      vault.recoveryWrapped = next.recoveryWrapped;
      vault.recoveryRotatedAt = new Date(this.now()).toISOString();
      this.bumpGeneration(data, vault);
      return { leaseToken: this.issueLease(data, actor, vault, "passkey"), generation: vault.generation };
    });
  }

  removePasskey(actor: VaultActor, leaseToken: string | null | undefined, input: { credentialId: string; challengeId: string; signature: string; manifestSignature: string }) {
    return this.mutate(async (data) => {
      const { lease, vault } = this.requireLease(data, actor, leaseToken);
      if (!vault.passkeys.some((p) => p.credentialId === input.credentialId)) throw new VaultError("NOT_FOUND", "Unknown passkey.");
      await this.takeAuthority(data, actor, vault, input.challengeId, "remove-passkey", input.credentialId, input.signature);
      if (vault.passkeys.length <= 1) throw new VaultError("INVALID", "Add and verify a replacement passkey before removing the last one.");
      const next = publicIdentity(vault);
      next.passkeys = next.passkeys.filter((p) => p.credentialId !== input.credentialId);
      next.manifestSequence = vault.manifestSequence + 1;
      next.manifestSignature = input.manifestSignature;
      await requireSignedIdentity(next, vault.manifestSequence + 1);
      vault.manifestSequence = next.manifestSequence;
      vault.manifestSignature = next.manifestSignature;
      vault.passkeys = vault.passkeys.filter((p) => p.credentialId !== input.credentialId);
      this.bumpGeneration(data, vault);
      return { leaseToken: this.issueLease(data, actor, vault, lease.method), generation: vault.generation };
    });
  }

  // ── disposable encrypted content ───────────────────────────────────────────────────────────────

  listItems(actor: VaultActor, leaseToken: string | null | undefined) {
    return this.mutate((data) => {
      const { vault } = this.requireLease(data, actor, leaseToken);
      return { vaultId: vault.vaultId, generation: vault.generation, items: data.records[vaultKey(actor)] ?? [] };
    }, { records: true });
  }

  /** Atomic immutable ciphertext batch. The owner signature binds every envelope and expected revision. */
  appendRecords(actor: VaultActor, leaseToken: string | null | undefined, input: {
    items: Array<{ itemId: string; v: number; iv: string; ct: string }>;
    expectedCount: number; challengeId: string; signature: string;
  }) {
    return this.mutate(async (data) => {
      const { vault } = this.requireLease(data, actor, leaseToken);
      const existing = (data.records[vaultKey(actor)] ??= []);
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_BATCH) throw new VaultError("INVALID", "Invalid encrypted record batch.");
      if (existing.length !== input.expectedCount || existing.length + input.items.length > MAX_ITEMS) throw new VaultError("CONFLICT", "Records changed. Reload and try again.");
      const ids = new Set(existing.map((item) => item.itemId));
      const clean = input.items.map((item) => {
        if (!/^[0-9a-f-]{36}$/.test(item.itemId) || item.v !== PROTOCOL_VERSION || fromB64u(item.iv).length !== 12 || fromB64u(item.ct).length < 17 || fromB64u(item.ct).length > MAX_ITEM_CT_BYTES || ids.has(item.itemId)) throw new VaultError("INVALID", "Invalid encrypted record.");
        ids.add(item.itemId);
        return { itemId: item.itemId, v: PROTOCOL_VERSION, iv: item.iv, ct: item.ct };
      });
      const digest = toB64u(createHash("sha256").update(JSON.stringify({ expectedCount: input.expectedCount, items: clean })).digest());
      await this.takeAuthority(data, actor, vault, input.challengeId, "append-records", digest, input.signature);
      existing.push(...clean.map((item) => ({ ...item, createdAt: new Date(this.now()).toISOString() })));
      data.recordCounts[vaultKey(actor)] = existing.length;
      return { count: existing.length };
    }, { records: true });
  }

}
