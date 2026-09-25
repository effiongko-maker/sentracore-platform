/**
 * Private Office Tranche 1 — production security protocol verification (no network, no Supabase).
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> npx tsx --tsconfig tsconfig.json scripts/verify-private-office-security.mts
 *
 * Runs the PRODUCTION browser cryptography, accounting domain and server protocol (SimpleWebAuthn verification,
 * independent activation, leases, authority signatures) against an in-memory store with a controllable clock and
 * a software authenticator. Database-level atomicity/guards/RLS are proven separately by
 * verify-private-office-vault-migration.mts.
 */
import { generateKeyPairSync, webcrypto } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import {
  createVault,
  decodeRecoveryArtifact,
  RecoveryArtifactError,
  unlockWithRecovery,
  decryptItem,
  destroyVault,
  encodeRecoveryArtifact,
  encryptItem,
  randomBytes,
  signAuthority,
  wrapForPasskey,
  wrapperDigest,
  type UnlockedVault,
} from "../src/modules/private-office/security/crypto/vaultCrypto";
import { fromB64u, toB64u, utf8 } from "../src/modules/private-office/security/shared/encoding";
import { IDLE_LOCK_MS, LEASE_ABSOLUTE_MS } from "../src/modules/private-office/security/shared/protocol";
import { MemoryVaultStore } from "../src/modules/private-office/security/server/VaultStore";
import { PrivateVaultService, VaultError, type VaultActor } from "../src/modules/private-office/security/server/PrivateVaultService";
import { derivePosition, openingPosition, type FinancialRecord } from "../src/modules/private-office/accounting/domain";
import { buildContentSecurityPolicy } from "../src/lib/security/securityHeaders";
import { SoftAuthenticator } from "./private-office/softAuthenticator";
import { enrolPasskey, routeApi, softAuthenticate, type Wire } from "./private-office/testClient";
import {
  addPasskeyFlow,
  confirmRecoveryAndEstablish,
  recoverWithArtifactFlow,
  removePasskeyFlow,
  rotateRecoveryFlow,
  unlockWithPasskeyFlow,
  type Api,
} from "../src/modules/private-office/security/client/vaultFlows";
import { manifestSignatureValid, nextIdentity, signManifest, VaultIdentityError, type VaultIdentity } from "../src/modules/private-office/security/crypto/vaultIdentity";

const ORIGIN = "https://sentracore.example";
const RP_ID = "sentracore.example";
const ORG = "0a0a0a0a-0000-4000-8000-00000000000a";
const OWNER = "11111111-1111-4111-8111-111111111111";

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message}`);
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
async function rejects(fn: () => Promise<unknown>, code: string | RegExp, message: string) {
  try {
    await fn();
  } catch (error) {
    const ok = typeof code === "string" ? error instanceof VaultError && error.code === code : code.test((error as Error).message);
    if (ok) return;
    throw new Error(`${message}: unexpected error ${(error as Error).message}`);
  }
  throw new Error(`${message}: expected refusal`);
}

// ── fixture ────────────────────────────────────────────────────────────────────────────────────────────────
let clock = Date.parse("2026-09-25T09:00:00Z");
const store = new MemoryVaultStore();
const raw = new PrivateVaultService(store, { origin: ORIGIN, rpID: RP_ID, rpName: "test" }, () => clock);
const wire: string[] = [];
/** Records every request argument and response body exactly as it would cross the API (lease → cookie). */
const service = new Proxy(raw, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value !== "function") return value;
    return async (...args: unknown[]) => {
      wire.push(JSON.stringify(args));
      const result = await value.apply(target, args);
      const body = { ...((result ?? {}) as Record<string, unknown>) };
      delete body.leaseToken;
      wire.push(JSON.stringify(body));
      return result;
    };
  },
}) as PrivateVaultService;

const actor = (profile: string, session: string, org = ORG): VaultActor => ({ organisationId: org, profileId: profile, sessionId: session });
const owner = actor(OWNER, "session-owner-1");
const secrets: Array<{ label: string; value: string }> = [];
function rememberSecret(label: string, bytes: Uint8Array) {
  secrets.push({ label, value: toB64u(bytes) }, { label: `${label} (hex)`, value: Buffer.from(bytes).toString("hex") });
}

/** The offline issuance ceremony (as scripts/private-office/issue-owner-activation.mjs does it). */
function issueActivation(profile: string, org = ORG) {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKey = pair.publicKey.export({ format: "der", type: "spki" }).toString("base64url");
  const privateKey = pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url");
  secrets.push({ label: "activation private key", value: privateKey });
  return { publicKey, credential: `SCPO-A1.${org}.${profile}.${privateKey}` };
}

/** Browser side of activation, as the shell does it: sign the server's session-bound message locally. */
async function signActivation(credential: string, message: string): Promise<string> {
  const parts = credential.split(".");
  const key = await webcrypto.subtle.importKey("pkcs8", fromB64u(parts[3]!), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return toB64u(new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(message))));
}

async function enrol(who: VaultActor, auth: SoftAuthenticator, purpose: "create" | "add", options: { lease?: string; activation?: { challengeId: string; signature: string } } = {}) {
  const begin = await service.beginRegistration(who, purpose, options.lease, options.activation);
  const reg = await auth.register(begin.options as never);
  const registered = await service.finishRegistration(who, begin.challengeId, reg.response as never);
  let prf = reg.prfOutput;
  if (!prf && reg.prfEnabled) {
    const confirm = await service.beginAuthentication(who, "confirm-prf", registered.credentialId);
    const a = await auth.assert(confirm.options as never);
    await service.finishAuthentication(who, confirm.challengeId, a.response as never);
    prf = a.prfOutput;
  }
  return { begin, registered, prf: prf ? new Uint8Array(prf) : null };
}

async function activate(who: VaultActor, credential: string) {
  const ch = await service.beginActivation(who);
  return { challengeId: ch.challengeId, signature: await signActivation(credential, ch.message) };
}

/** Network-level record of every request/response the real client flows produce. */
const flowWire: Wire = { requests: [], responses: [] };
function client(who: VaultActor, lease: string | null = null) {
  const jar = { lease };
  return { api: routeApi(service, who, jar, flowWire), jar };
}

async function unlock(who: VaultActor, auth: SoftAuthenticator) {
  const { api, jar } = client(who);
  const { vault } = await unlockWithPasskeyFlow(api, softAuthenticate(auth));
  return { vault, lease: jar.lease! };
}

async function recover(who: VaultActor, artifact: string) {
  const { api, jar } = client(who);
  const { vault } = await recoverWithArtifactFlow(api, artifact);
  return { vault, lease: jar.lease! };
}

/** Client append, as the shell does it: encrypt locally, sign (expectedCount, envelopes) with vault authority. */
async function appendRecords(who: VaultActor, lease: string, vault: UnlockedVault, records: FinancialRecord[], expectedCount: number) {
  const items = await Promise.all(records.map((r) => encryptItem(vault, r.id, JSON.stringify(r))));
  const digest = toB64u(new Uint8Array(await webcrypto.subtle.digest("SHA-256", utf8(JSON.stringify({ expectedCount, items })))));
  const ch = await service.beginAuthority(who, lease, "append-records");
  return service.appendRecords(who, lease, { items, expectedCount, challengeId: ch.challengeId, signature: await signAuthority(vault, "append-records", ch.challenge, digest) });
}

async function readLedger(who: VaultActor, lease: string, vault: UnlockedVault): Promise<FinancialRecord[]> {
  const { items } = await service.listItems(who, lease);
  return Promise.all(items.map(async (item) => JSON.parse(await decryptItem(vault, item)) as FinancialRecord));
}

// ── Enrolment / activation ─────────────────────────────────────────────────────────────────────────────────
const authA = new SoftAuthenticator({ origin: ORIGIN, rpID: RP_ID, prfAtCreate: true, backedUp: true });
const ownerActivation = issueActivation(OWNER);
let established!: { vault: UnlockedVault; artifact: string; lease: string };
let ownerLease = "";
const PRIVATE_NAME = "Zenith Salary Account";
const PRIVATE_AMOUNT = "14250000.75";

await check("normal authenticated session alone cannot begin first enrolment (no activation authority registered)", async () => {
  await rejects(() => service.beginActivation(owner), "INVALID", "activation without registered authority");
  await rejects(() => service.beginRegistration(owner, "create"), "INVALID", "registration without activation");
});

await store.registerActivation(`${ORG}:${OWNER}`, ownerActivation.publicKey);

await check("temporary password / any session without the independent credential cannot establish the vault", async () => {
  const temp = actor(OWNER, "session-temporary-password");
  await rejects(() => service.beginRegistration(temp, "create"), "INVALID", "registration without proof");
  const ch = await service.beginActivation(temp);
  const forger = issueActivation(OWNER);
  await rejects(async () => service.beginRegistration(temp, "create", null, { challengeId: ch.challengeId, signature: await signActivation(forger.credential, ch.message) }), "INVALID", "self-issued credential accepted");
  await rejects(() => service.createVault(temp, { vaultId: crypto.randomUUID(), credentialId: "x", wrapperId: "x", rootKeyId: "x", passkeyWrapped: {}, recoveryWrapped: {}, authorityPublicKey: "x", wrappedAuthorityKey: {}, manifestSignature: "x" }), "INVALID", "direct vault creation");
  assert(!(await service.status(temp)).hasVault, "no vault");
});

await check("activation signature is bound to session, challenge and owner; replay fails", async () => {
  const s1 = actor(OWNER, "session-a");
  const s2 = actor(OWNER, "session-b");
  const ch = await service.beginActivation(s1);
  const signature = await signActivation(ownerActivation.credential, ch.message);
  await rejects(() => service.beginRegistration(s2, "create", null, { challengeId: ch.challengeId, signature }), "INVALID", "proof used from another session");
  const ch2 = await service.beginActivation(s1);
  const wrongMessage = await signActivation(ownerActivation.credential, ch2.message.replace("session-a", "session-b"));
  await rejects(() => service.beginRegistration(s1, "create", null, { challengeId: ch2.challengeId, signature: wrongMessage }), "INVALID", "signature over another session's message");
  const ch3 = await service.beginActivation(s1);
  const good = await signActivation(ownerActivation.credential, ch3.message);
  await service.beginRegistration(s1, "create", null, { challengeId: ch3.challengeId, signature: good });
  await rejects(() => service.beginRegistration(s1, "create", null, { challengeId: ch3.challengeId, signature: good }), "INVALID", "replayed activation proof");
  assert(ch.message.includes(`|${ORG}|${OWNER}|session-a|`), "message binds organisation, owner and session");
  const other = issueActivation("22222222-2222-4222-8222-222222222222");
  const ch4 = await service.beginActivation(s1);
  await rejects(async () => service.beginRegistration(s1, "create", null, { challengeId: ch4.challengeId, signature: await signActivation(other.credential, ch4.message) }), "INVALID", "another owner's credential accepted");
});

await check("an 'add passkey' registration can never establish a first vault", async () => {
  const s = actor(OWNER, "session-add-trick");
  await rejects(() => service.beginRegistration(s, "add", null), "LOCKED", "add without an established, unlocked vault");
});

await check("concurrent first enrolment establishes exactly one vault identity", async () => {
  const racers = [actor(OWNER, "session-race-1"), actor(OWNER, "session-race-2")];
  const prepared = await Promise.all(
    racers.map(async (who) => {
      const auth = new SoftAuthenticator({ origin: ORIGIN, rpID: RP_ID, prfAtCreate: true });
      const c = client(who);
      const enrolled = await enrolPasskey(c.api, auth, "create", await activate(who, ownerActivation.credential));
      const created = await createVault({ vaultId: enrolled.vaultId, passkeyWrapperId: enrolled.wrapperId, prfOutput: enrolled.prf });
      rememberSecret("root key", created.vault.root);
      const staged = { vault: created.vault, publication: created.publication, registration: { credentialId: enrolled.credentialId, wrapperId: enrolled.wrapperId, publicKey: enrolled.publicKey, prfSalt: enrolled.prfSalt } };
      return { who, auth, c, begin: { vaultId: enrolled.vaultId }, created, staged };
    })
  );
  const outcomes = await Promise.allSettled(prepared.map((p) => confirmRecoveryAndEstablish(p.c.api, p.staged, p.created.recoveryArtifact)));
  assert(outcomes.filter((o) => o.status === "fulfilled").length === 1, "exactly one establishment succeeds");
  const loser = outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult;
  assert(loser.reason instanceof VaultError && ["CONFLICT", "INVALID"].includes(loser.reason.code), "the other is refused");
  const winnerIndex = outcomes.findIndex((o) => o.status === "fulfilled");
  const status = await service.status(owner);
  assert(status.hasVault && status.vaultId === prepared[winnerIndex]!.begin.vaultId, "one vault identity");
  const dump = JSON.parse(await store.dump());
  assert(dump.activations[`${ORG}:${OWNER}`].consumed === true && Object.keys(dump.vaults).length === 1, "activation consumed with establishment");
  // Continue the suite with the winning vault.
  const w = prepared[winnerIndex]!;
  established = { vault: w.created.vault, artifact: w.created.recoveryArtifact, lease: w.c.jar.lease! };
  rememberSecret("recovery secret", (await decodeRecoveryArtifact(established.artifact)).secret);
  ownerLease = established.lease;
  (globalThis as { __winnerAuth?: SoftAuthenticator }).__winnerAuth = w.auth;
  owner.sessionId = w.who.sessionId;
});

const winnerAuth = () => (globalThis as { __winnerAuth?: SoftAuthenticator }).__winnerAuth!;

await check("first-enrolment authority cannot reopen after establishment (any session, any path)", async () => {
  for (const who of [owner, actor(OWNER, "session-after-reset"), actor(OWNER, "session-after-regrant")]) {
    await rejects(() => service.beginActivation(who), "CONFLICT", "activation reopened");
    await rejects(() => service.beginRegistration(who, "create"), "CONFLICT", "first registration reopened");
  }
});

// ── Encrypted accounting records ───────────────────────────────────────────────────────────────────────────
await check("encrypted accounting records round-trip; the server stores only ciphertext and enforces batch integrity", async () => {
  const bank = openingPosition({ name: PRIVATE_NAME, accountKind: "bank", currency: "NGN", balance: PRIVATE_AMOUNT, date: "2026-09-01" });
  const cash = openingPosition({ name: "Home safe", accountKind: "cash", currency: "USD", balance: "0", date: "2026-09-01" });
  await appendRecords(owner, ownerLease, established.vault, bank, 0);
  await appendRecords(owner, ownerLease, established.vault, cash, 2);
  const ledger = await readLedger(owner, ownerLease, established.vault);
  const position = derivePosition(ledger);
  assert(position.positions.NGN === "1425000075" && position.positions.USD === "0", "balances derive from the decrypted ledger");
  await rejects(() => appendRecords(owner, ownerLease, established.vault, openingPosition({ name: "x", accountKind: "cash", currency: "NGN", balance: "1", date: "2026-09-01" }), 1), "CONFLICT", "stale expectedCount accepted");
  const items = await Promise.all(openingPosition({ name: "y", accountKind: "cash", currency: "NGN", balance: "1", date: "2026-09-01" }).map((r) => encryptItem(established.vault, r.id, JSON.stringify(r))));
  const ch = await service.beginAuthority(owner, ownerLease, "append-records");
  const signedDigest = toB64u(new Uint8Array(await webcrypto.subtle.digest("SHA-256", utf8(JSON.stringify({ expectedCount: 4, items })))));
  const signature = await signAuthority(established.vault, "append-records", ch.challenge, signedDigest);
  const swapped = [{ ...items[0]!, ct: items[1]!.ct }, items[1]!];
  await rejects(() => service.appendRecords(owner, ownerLease, { items: swapped, expectedCount: 4, challengeId: ch.challengeId, signature }), "INVALID", "envelope changed after signing");
  const ch2 = await service.beginAuthority(owner, ownerLease, "append-records");
  await rejects(() => service.appendRecords(owner, ownerLease, { items, expectedCount: 4, challengeId: ch2.challengeId, signature: toB64u(randomBytes(64)) }), "INVALID", "forged vault authority");
  await rejects(() => service.appendRecords(owner, null, { items, expectedCount: 4, challengeId: ch2.challengeId, signature }), "LOCKED", "append while locked");
});

// ── Lock / lease / generation ──────────────────────────────────────────────────────────────────────────────
await check("stale leases fail: no lease, idle, absolute, explicit lock, sign-out, other session, generation change", async () => {
  await rejects(() => service.listItems(owner, null), "LOCKED", "no lease");
  const t0 = clock;
  clock = t0 + IDLE_LOCK_MS - 60_000;
  await service.touch(owner, ownerLease, false); // background: validates, never extends
  clock = t0 + IDLE_LOCK_MS;
  await rejects(() => service.listItems(owner, ownerLease), "LOCKED", "idle timeout");
  let u = await unlock(owner, winnerAuth());
  const t1 = clock;
  for (let m = 9; m < 60; m += 9) {
    clock = t1 + m * 60_000;
    await service.touch(owner, u.lease, true);
  }
  clock = t1 + LEASE_ABSOLUTE_MS;
  await rejects(() => service.listItems(owner, u.lease), "LOCKED", "absolute lifetime");
  u = await unlock(owner, winnerAuth());
  await service.lock(owner, u.lease);
  await rejects(() => service.listItems(owner, u.lease), "LOCKED", "explicit lock");
  u = await unlock(owner, winnerAuth());
  await service.revokeSession(owner.sessionId);
  await rejects(() => service.listItems(owner, u.lease), "LOCKED", "sign-out");
  u = await unlock(owner, winnerAuth());
  await rejects(() => service.listItems(actor(OWNER, "session-other"), u.lease), "LOCKED", "lease replayed from another session");
  const stale = u.lease;
  const r = await recover(actor(OWNER, owner.sessionId), established.artifact); // recovery = security event
  await rejects(() => service.listItems(owner, stale), "LOCKED", "pre-recovery lease after generation change");
  ownerLease = r.lease;
  destroyVault(u.vault);
  destroyVault(r.vault);
});

await check("password reset does not unlock, replace or re-key an established vault", async () => {
  const afterReset = actor(OWNER, "session-after-password-reset");
  await rejects(() => service.listItems(afterReset, ownerLease), "LOCKED", "old lease survives");
  await rejects(() => service.beginActivation(afterReset), "CONFLICT", "enrolment reopened");
  await rejects(() => service.beginRegistration(afterReset, "add", null), "LOCKED", "add passkey without unlock");
  const u = await unlock(afterReset, winnerAuth());
  const intruder = new SoftAuthenticator({ origin: ORIGIN, rpID: RP_ID, prfAtCreate: true });
  const { registered, prf } = await enrol(afterReset, intruder, "add", { lease: u.lease });
  const wrapped = await wrapForPasskey(u.vault, registered.wrapperId, prf!);
  const ch = await service.beginAuthority(afterReset, u.lease, "add-passkey");
  const foreign = await createVault({ vaultId: u.vault.vaultId, passkeyWrapperId: "x", prfOutput: randomBytes(32) });
  const current = await service.identity(afterReset, u.lease);
  const forgedNext = nextIdentity(current, { passkeys: [...current.passkeys, { credentialId: registered.credentialId, wrapperId: registered.wrapperId, prfSalt: "x", publicKey: "x", wrapped }] });
  await rejects(async () => service.addPasskey(afterReset, u.lease, { credentialId: registered.credentialId, wrapperId: registered.wrapperId, wrapped, wrapperDigest: await wrapperDigest(wrapped), challengeId: ch.challengeId, signature: await signAuthority(foreign.vault, "add-passkey", ch.challenge, "x"), manifestSignature: toB64u(randomBytes(64)) }), "INVALID", "wrapper added without vault authority");
  void forgedNext;
  destroyVault(foreign.vault);
  destroyVault(u.vault);
});

// ── Recovery lifecycle ─────────────────────────────────────────────────────────────────────────────────────
await check("recovery rotation keeps the root key and ciphertext; the old artifact stops opening the vault; last passkey cannot be removed", async () => {
  const s = actor(OWNER, "session-rotate");
  const u = await unlock(s, winnerAuth());
  const before = (await service.listItems(s, u.lease)).items.map((i) => i.ct).join();
  const rc = client(s, u.lease);
  const newArtifact = await rotateRecoveryFlow(rc.api, u.vault, softAuthenticate(winnerAuth()));
  rememberSecret("recovery secret", (await decodeRecoveryArtifact(newArtifact)).secret);
  const replacement = { recoveryArtifact: newArtifact };
  await rejects(() => recover(s, established.artifact), /did not open/, "old artifact still opens");
  const r = await recover(s, replacement.recoveryArtifact);
  assert(r.vault.rootKeyId === established.vault.rootKeyId, "same root key");
  const after = (await service.listItems(s, r.lease)).items.map((i) => i.ct).join();
  assert(before === after, "ciphertext never rewritten");
  assert(derivePosition(await readLedger(s, r.lease, r.vault)).positions.NGN === "1425000075", "same ledger");
  await rejects(() => removePasskeyFlow(client(s, r.lease).api, r.vault, winnerAuth().id), "INVALID", "last passkey removed");
  ownerLease = r.lease;
  destroyVault(u.vault);
  destroyVault(r.vault);
  established.artifact = replacement.recoveryArtifact;
});

await check("invalid recovery material cannot unlock or obtain a lease", async () => {
  const s = actor(OWNER, "session-bad-recovery");
  const parsed = await decodeRecoveryArtifact(established.artifact);
  await rejects(async () => recover(s, await encodeRecoveryArtifact(parsed.vaultId, parsed.rootKeyId, randomBytes(32))), /did not open/, "wrong secret");
  const b = await service.beginRecovery(s);
  await rejects(() => service.completeRecovery(s, b.challengeId, toB64u(randomBytes(64))), "INVALID", "forged recovery signature");
  await rejects(() => service.completeRecovery(s, b.challengeId, toB64u(randomBytes(64))), "INVALID", "challenge reused after failure");
});

// ── Isolation / authority ──────────────────────────────────────────────────────────────────────────────────
await check("owner isolation: other users, other Executive Office users and other organisations see nothing and cannot use the owner's lease", async () => {
  for (const intruder of [actor("22222222-2222-4222-8222-222222222222", "s-x"), actor("33333333-3333-4333-8333-333333333333", owner.sessionId), actor(OWNER, owner.sessionId, "0b0b0b0b-0000-4000-8000-00000000000b")]) {
    const s = await service.status(intruder, ownerLease);
    assert(!s.hasVault && s.lease === null, "no visibility");
    await rejects(() => service.listItems(intruder, ownerLease), "LOCKED", "lease crossed owners");
    await rejects(() => service.beginRecovery(intruder), "NOT_FOUND", "recovery material crossed owners");
    await rejects(() => service.beginActivation(intruder), "INVALID", "activation crossed owners");
  }
});

await check("Super Admin / platform.admin_override confer no Private Office or vault authority (every layer)", async () => {
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*--.*$/gm, "");
  const layers = [
    "src/modules/private-office/server/requirePrivateOfficeAccess.ts",
    "src/modules/private-office/security/server/vaultGate.ts",
    "src/modules/private-office/security/server/PrivateVaultService.ts",
    "src/modules/private-office/security/server/DatabaseVaultStore.ts",
    "src/app/api/private-office/vault/route.ts",
    "supabase/migrations/20260925010000_private_office_vault_foundation.sql",
  ].map((f) => strip(readFileSync(resolve(f), "utf8"))).join("\n");
  assert(!/isSuperAdmin|isPlatformSuperAdmin|admin_override|super_admin|roleSlugs/i.test(layers), "no role or override consulted");
  const sql = readFileSync(resolve("supabase/migrations/20260925010000_private_office_vault_foundation.sql"), "utf8");
  assert(/capability = 'platform\.command_centre\.view'/.test(sql) && /capability = 'platform\.executive\.private_office\.access'/.test(sql), "database requires both explicit grants");
  const admin = ["src/modules/platform-admin", "src/app/api/platform-admin", "src/app/api/admin"].flatMap((d) => {
    try {
      return readdirRecursive(d);
    } catch {
      return [];
    }
  }).map((f) => readFileSync(f, "utf8")).join("\n");
  assert(!/private_office_activations|private_office_vaults|issue-owner-activation|SCPO-A1|private_office_commit|private_office_load/.test(admin), "Admin Console has no activation / vault capability");
});

// ── Secret boundary ────────────────────────────────────────────────────────────────────────────────────────
await check("no root key, recovery secret, PRF output, activation private key or financial plaintext in API payloads or persistence", async () => {
  for (const out of [...winnerAuth().prfOutputs, ...authA.prfOutputs]) rememberSecret("PRF output", out);
  const dump = await store.dump();
  for (const [where, text] of Object.entries({ "API payloads": wire.join("\n") + flowWire.requests.join("\n") + flowWire.responses.join("\n"), "server persistence": dump })) {
    for (const plain of [PRIVATE_NAME, PRIVATE_AMOUNT, "1425000075", "Home safe", "opening_position", "opening-balance-equity"]) {
      assert(!text.includes(plain), `financial plaintext "${plain}" in ${where}`);
    }
    for (const s of secrets) assert(!text.includes(s.value), `${s.label} in ${where}`);
  }
  assert(secrets.length >= 10, "secrets collected for the scan");
  assert(!/"results"/.test(wire.join("")), "no PRF results on the wire");
});

await check("unsupported PRF fails closed; PRF output sent by a client is refused", async () => {
  const s = actor(OWNER, "session-rotate"); // the session that holds the current lease
  const noPrf = new SoftAuthenticator({ origin: ORIGIN, rpID: RP_ID, prf: false });
  const enrolled = await enrol(s, noPrf, "add", { lease: ownerLease });
  assert(enrolled.prf === null, "no PRF output from a non-PRF authenticator — the client has nothing to wrap with");
  assert((await service.status(s, ownerLease)).passkeys.length === 1, "a registration alone never adds an unlock path");
  const shell = readFileSync(resolve("src/modules/private-office/security/client/PrivateOfficeShell.tsx"), "utf8");
  assert(/if \(!prf\) throw new Error\("This passkey cannot provide encrypted unlock/.test(shell) && /there is no weaker fallback/.test(shell), "enrolment stops without PRF");
  const flows = readFileSync(resolve("src/modules/private-office/security/client/vaultFlows.ts"), "utf8");
  assert(/if \(!prf\) \{\s*await lockQuietly\(api\);/.test(flows), "unlock stops (and drops the lease) without PRF");
  const bb = await raw.beginRegistration(s, "add", ownerLease);
  const reg = await new SoftAuthenticator({ origin: ORIGIN, rpID: RP_ID }).register(bb.options as never);
  const leak = { ...reg.response, clientExtensionResults: { prf: { results: { first: toB64u(randomBytes(32)) } } } };
  // Deliberate leak attempt goes to the unrecorded service so the payload scan stays about real traffic.
  await rejects(() => raw.finishRegistration(s, bb.challengeId, leak as never), /PRF output must never be sent/, "PRF output accepted");
});

// ── Signed vault identity: substitution / tampering is detected ────────────────────────────────────────────
/** A hostile server/database: serves an altered identity on unlock, recovery or identity-get. */
function tamperingApi(who: VaultActor, mutate: (identity: VaultIdentity) => Promise<VaultIdentity> | VaultIdentity) {
  const { api, jar } = client(who);
  const hostile: Api = (async (action: string, fields?: Record<string, unknown>) => {
    const data = (await api(action, fields)) as Record<string, unknown>;
    if (action === "authentication-finish" && data?.identity) return { ...data, identity: await mutate(structuredClone(data.identity as VaultIdentity)) };
    if (action === "recovery-begin") return { ...data, identity: await mutate(structuredClone(data.identity as VaultIdentity)) };
    if (action === "identity-get") return mutate(structuredClone(data as unknown as VaultIdentity));
    return data;
  }) as Api;
  return { api: hostile, jar };
}

await check("signed identity: an untampered identity verifies on passkey unlock, recovery and before every change", async () => {
  const s = actor(OWNER, "session-identity");
  const u = await unlock(s, winnerAuth());
  const identity = await service.identity(s, u.lease);
  assert(identity.manifestSequence >= 2 && (await manifestSignatureValid(identity)), "stored manifest is owner-signed (sequence advanced by the rotation)");
  destroyVault(u.vault);
});

await check("signed identity: substituted or tampered identity material is DETECTED and refused, the vault is dropped and the lease revoked", async () => {
  const attacker = await createVault({ vaultId: established.vault.vaultId, passkeyWrapperId: crypto.randomUUID(), prfOutput: randomBytes(32) });
  const attackerSign = async (identity: VaultIdentity) => ({ ...identity, manifestSignature: await signManifest(attacker.vault, { ...identity, rootKeyId: attacker.vault.rootKeyId, vaultId: attacker.vault.vaultId }) });
  const cases: Array<[string, (i: VaultIdentity) => Promise<VaultIdentity> | VaultIdentity]> = [
    ["authority public key swapped (manifest re-signed by the attacker's key)", async (i) => {
      const swapped = { ...i, authorityPublicKey: attacker.publication.authorityPublicKey };
      const { manifestSignature: _m, ...unsigned } = swapped;
      void _m;
      return { ...swapped, manifestSignature: await signManifest({ ...attacker.vault, vaultId: i.vaultId, rootKeyId: i.rootKeyId } as never, unsigned) };
    }],
    ["extra passkey wrapper injected", (i) => ({ ...i, passkeys: [...i.passkeys, { ...i.passkeys[0]!, credentialId: "injected", wrapperId: crypto.randomUUID() }] })],
    ["recovery wrapper substituted", (i) => ({ ...i, recoveryWrapped: attacker.publication.recoveryWrapped })],
    ["credential public key swapped", (i) => ({ ...i, passkeys: i.passkeys.map((p) => ({ ...p, publicKey: toB64u(randomBytes(77)) })) })],
    ["manifest signature altered", (i) => ({ ...i, manifestSignature: i.manifestSignature.slice(0, 10) + (i.manifestSignature[10] === "A" ? "B" : "A") + i.manifestSignature.slice(11) })],
    ["manifest sequence altered", (i) => ({ ...i, manifestSequence: i.manifestSequence + 1 })],
    ["root key fingerprint altered", (i) => ({ ...i, rootKeyId: attacker.publication.rootKeyId })],
    ["wrapped authority key substituted", (i) => ({ ...i, wrappedAuthorityKey: attacker.publication.wrappedAuthorityKey })],
    ["PRF salt altered", (i) => ({ ...i, passkeys: i.passkeys.map((p) => ({ ...p, prfSalt: toB64u(randomBytes(32)) })) })],
    ["entire vault substituted (attacker root, authority and signed manifest)", async () => attackerSign({
      vaultId: attacker.vault.vaultId, rootKeyId: attacker.publication.rootKeyId, authorityPublicKey: attacker.publication.authorityPublicKey,
      wrappedAuthorityKey: attacker.publication.wrappedAuthorityKey, recoveryWrapped: attacker.publication.recoveryWrapped,
      passkeys: [{ credentialId: winnerAuth().id, wrapperId: crypto.randomUUID(), prfSalt: toB64u(randomBytes(32)), publicKey: "x", wrapped: attacker.publication.passkeyWrapped }],
      manifestSequence: 1, manifestSignature: "",
    })],
  ];
  for (const [name, mutate] of cases) {
    const s = actor(OWNER, `session-tamper-${name.length}`);
    const hostile = tamperingApi(s, mutate);
    let refused = false;
    try {
      const r = await unlockWithPasskeyFlow(hostile.api, softAuthenticate(winnerAuth()));
      destroyVault(r.vault);
    } catch {
      refused = true;
    }
    assert(refused, `passkey unlock accepted: ${name}`);
    assert(hostile.jar.lease === null, `lease not revoked after refusal: ${name}`);
  }
  // Recovery path: the identity is verified BEFORE any recovery proof is signed for the server.
  const rs = actor(OWNER, "session-tamper-recovery");
  const rh = tamperingApi(rs, (i) => ({ ...i, passkeys: [...i.passkeys, { ...i.passkeys[0]!, credentialId: "injected" }] }));
  const before = flowWire.requests.length;
  await rejects(() => recoverWithArtifactFlow(rh.api, established.artifact), /identity could not be verified/, "recovery accepted a tampered identity");
  assert(!flowWire.requests.slice(before).some((r) => r.includes('"recovery-finish"')), "no recovery proof sent to a tampered identity");
  // Changes: the client refuses to sign a change on top of a tampered identity.
  const cs = actor(OWNER, "session-tamper-change");
  const u = await unlock(cs, winnerAuth());
  const ch = tamperingApi(cs, (i) => ({ ...i, recoveryWrapped: attacker.publication.recoveryWrapped }));
  ch.jar.lease = u.lease;
  await rejects(() => removePasskeyFlow(ch.api, u.vault, winnerAuth().id), /identity could not be verified/, "signed a change over a tampered identity");
  assert(VaultIdentityError.name === "VaultIdentityError", "typed identity error");
  destroyVault(u.vault);
  destroyVault(attacker.vault);
});

await check("signed identity: the server refuses identity changes the owner did not sign at the next sequence", async () => {
  const s = actor(OWNER, "session-sign-rules");
  const u = await unlock(s, winnerAuth());
  const current = await service.identity(s, u.lease);
  const newAuth = new SoftAuthenticator({ origin: ORIGIN, rpID: RP_ID, prfAtCreate: true });
  const c = client(s, u.lease);
  const enrolled = await enrolPasskey(c.api, newAuth, "add");
  const wrapped = await wrapForPasskey(u.vault, enrolled.wrapperId, enrolled.prf);
  const digest = await wrapperDigest(wrapped);
  const entry = { credentialId: enrolled.credentialId, wrapperId: enrolled.wrapperId, prfSalt: enrolled.prfSalt, publicKey: enrolled.publicKey, wrapped };
  const add = async (manifestSignature: string) => {
    const ch = await service.beginAuthority(s, c.jar.lease, "add-passkey");
    return service.addPasskey(s, c.jar.lease, { credentialId: enrolled.credentialId, wrapperId: enrolled.wrapperId, wrapped, wrapperDigest: digest, challengeId: ch.challengeId, signature: await signAuthority(u.vault, "add-passkey", ch.challenge, `${enrolled.credentialId}|${enrolled.wrapperId}|${digest}`), manifestSignature });
  };
  const skipAhead = { ...nextIdentity(current, { passkeys: [...current.passkeys, entry] }), manifestSequence: current.manifestSequence + 2 };
  await rejects(async () => add(await signManifest(u.vault, skipAhead)), "INVALID", "sequence skip accepted");
  await rejects(async () => add(await signManifest(u.vault, nextIdentity(current, { passkeys: current.passkeys }))), "INVALID", "manifest not matching the change accepted");
  const foreign = await createVault({ vaultId: u.vault.vaultId, passkeyWrapperId: "x", prfOutput: randomBytes(32) });
  await rejects(async () => add(await signManifest({ ...foreign.vault, rootKeyId: u.vault.rootKeyId } as never, nextIdentity(current, { passkeys: [...current.passkeys, entry] }))), "INVALID", "manifest by a foreign key accepted");
  const added = await add(await signManifest(u.vault, nextIdentity(current, { passkeys: [...current.passkeys, entry] })));
  c.jar.lease = added.leaseToken; // identity change bumps the security generation and re-issues this session's lease
  const after = await service.identity(s, c.jar.lease);
  assert(after.manifestSequence === current.manifestSequence + 1 && after.passkeys.length === 2 && (await manifestSignatureValid(after)), "correctly signed change stored");
  // The real client flows produce correct signatures end to end.
  const u2 = await unlock(actor(OWNER, "session-sign-rules-2"), newAuth);
  await removePasskeyFlow(client(actor(OWNER, "session-sign-rules-2"), u2.lease).api, u2.vault, newAuth.id);
  destroyVault(u.vault);
  destroyVault(u2.vault);
  destroyVault(foreign.vault);
  void addPasskeyFlow;
});

await check("signed identity LIMIT (documented, not claimed): replay of an older owner-signed identity is not detectable without client-held state", async () => {
  const s = actor(OWNER, "session-rollback");
  const u = await unlock(s, winnerAuth());
  const current = await service.identity(s, u.lease);
  const olderButSigned = nextIdentity(current, {});
  const replayed = { ...olderButSigned, manifestSequence: current.manifestSequence - 1, manifestSignature: "" };
  replayed.manifestSignature = await signManifest(u.vault, replayed);
  const r = tamperingApi(actor(OWNER, "session-rollback-2"), () => replayed);
  const result = await unlockWithPasskeyFlow(r.api, softAuthenticate(winnerAuth()));
  assert(result.identity.manifestSequence === current.manifestSequence - 1, "an older signed identity is accepted — rollback/withholding is an availability limit, reported as such");
  destroyVault(result.vault);
  destroyVault(u.vault);
});

// ── Recovery confirmation boundary ─────────────────────────────────────────────────────────────────────────
await check("recovery artifact / secret never cross the network: setup confirmation, recovery and rotation are browser-local", async () => {
  const other = "55555555-5555-4555-8555-555555555555";
  const who = actor(other, "session-boundary");
  const activation = issueActivation(other);
  await store.registerActivation(`${ORG}:${other}`, activation.publicKey);
  const c = client(who);
  const auth = new SoftAuthenticator({ origin: ORIGIN, rpID: RP_ID, prfAtCreate: true });
  const enrolled = await enrolPasskey(c.api, auth, "create", await activate(who, activation.credential));
  const created = await createVault({ vaultId: enrolled.vaultId, passkeyWrapperId: enrolled.wrapperId, prfOutput: enrolled.prf });
  const staged = { vault: created.vault, publication: created.publication, registration: { credentialId: enrolled.credentialId, wrapperId: enrolled.wrapperId, publicKey: enrolled.publicKey, prfSalt: enrolled.prfSalt } };
  const secret = (await decodeRecoveryArtifact(created.recoveryArtifact)).secret;
  const forbidden = [created.recoveryArtifact, created.recoveryArtifact.split(".")[3]!, toB64u(secret), Buffer.from(secret).toString("hex")];

  const start = flowWire.requests.length;
  const wrong = await encodeRecoveryArtifact(created.vault.vaultId, created.publication.rootKeyId, randomBytes(32));
  await rejects(() => confirmRecoveryAndEstablish(c.api, staged, wrong), /did not open|not the recovery artifact/, "wrong confirmation accepted");
  assert(flowWire.requests.length === start, "a failed confirmation makes NO request at all (checked locally)");
  await confirmRecoveryAndEstablish(c.api, staged, created.recoveryArtifact);
  const establishRequest = flowWire.requests.slice(start).find((r) => r.includes('"vault-create"'))!;
  assert(establishRequest && Object.keys(JSON.parse(establishRequest).input).sort().join() === "authorityPublicKey,credentialId,manifestSignature,passkeyWrapped,recoveryWrapped,rootKeyId,vaultId,wrappedAuthorityKey,wrapperId", "establishment sends only public/wrapped fields and the owner's manifest signature");

  await c.api("lock");
  const r = await recoverWithArtifactFlow(c.api, created.recoveryArtifact);
  const rotated = await rotateRecoveryFlow(c.api, r.vault, softAuthenticate(auth));
  const rotatedSecret = (await decodeRecoveryArtifact(rotated)).secret;
  forbidden.push(rotated, rotated.split(".")[3]!, toB64u(rotatedSecret), Buffer.from(rotatedSecret).toString("hex"));
  const sent = flowWire.requests.slice(start).join("\n") + flowWire.responses.slice(start).join("\n");
  for (const value of forbidden) assert(!sent.includes(value), "recovery artifact / secret on the wire");
  const dump = await store.dump();
  for (const value of forbidden) assert(!dump.includes(value), "recovery artifact / secret in server persistence");
  destroyVault(r.vault);
  destroyVault(created.vault);

  // Static: the only code that holds the typed artifact passes it to local unwrap functions — never to api()/fetch.
  const code = (f: string) => readFileSync(resolve(f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const shell = code("src/modules/private-office/security/client/PrivateOfficeShell.tsx");
  const flows = code("src/modules/private-office/security/client/vaultFlows.ts");
  for (const [name, text] of [["shell", shell], ["flows", flows]] as const) {
    for (const call of text.match(/api(<[^>]*>)?\("[a-z-]+"[\s\S]*?\);/g) ?? []) {
      // Identifiers only: string literals such as "rotate-recovery" are action names, not data.
      assert(!/\b(artifact|typedArtifact|recovery|confirmRecovery|recoveryArtifact|secret)\b/.test(call.replace(/"[^"]*"/g, '""')), `${name}: an api() call references recovery material: ${call.slice(0, 80)}`);
    }
  }
  assert(!/\.\.\.staged\b|\.\.\.publication\b|\.\.\.registration\b/.test(flows), "request bodies are built from explicit fields, never spread objects");
  assert(!/fetch\(/.test(flows) && (shell.match(/fetch\(/g) ?? []).length === 1 && /fetch\("\/api\/private-office\/vault"/.test(shell), "the only network path is the vault API helper");
  assert(!/console\.|sendBeacon|navigator\.sendBeacon|analytics|telemetry|audit/i.test(shell + flows), "no logging, beacons, telemetry or audit from the client");
  const route = code("src/app/api/private-office/vault/route.ts");
  assert(!/console\.|audit|recordOperationalEvent|emitActionEvent/i.test(route), "the API route logs and audits nothing");
});

// ── Recovery key copy/paste hardening ──────────────────────────────────────────────────────────────────────
await check("recovery key copy/paste: presentation artifacts are tolerated, anything that changes the key is refused with a distinct reason", async () => {
  const { vault, recoveryArtifact: key, publication } = await createVault({ vaultId: crypto.randomUUID(), passkeyWrapperId: crypto.randomUUID(), prfOutput: randomBytes(32) });
  const opens = async (text: string) => {
    const v = await unlockWithRecovery({ artifact: text, vaultId: vault.vaultId, wrapped: publication.recoveryWrapped, wrappedAuthorityKey: publication.wrappedAuthorityKey });
    const same = v.rootKeyId === vault.rootKeyId;
    destroyVault(v);
    return same;
  };
  const problem = async (text: string) => {
    try {
      await decodeRecoveryArtifact(text);
      return "accepted";
    } catch (e) {
      return e instanceof RecoveryArtifactError ? e.problem : `unexpected: ${(e as Error).message}`;
    }
  };
  // A key whose hyphen-bearing sections exercise the dash rules: the UUID always contains hyphens.
  const accepted: Array<[string, string]> = [
    ["clean round trip", key],
    ["surrounding whitespace / CRLF", `  \t${key}\r\n\n`],
    ["hard-wrapped lines", key.replace(/(.{40})/g, "$1\n")],
    ["non-breaking spaces", key.replace(/(.{30})/g, "$1 ")],
    ["zero-width characters", [...key].map((c, i) => (i % 17 === 0 ? `${c}${["​", "‌", "‍", "⁠", "﻿"][i % 5]}` : c)).join("")],
    ["soft hyphens", key.replace(/(.{25})/g, "$1­")],
    ...["‐", "‑", "‒", "–", "—", "―", "−"].map((d) => [`Unicode dash U+${d.charCodeAt(0).toString(16).toUpperCase()}`, key.replace(/-/g, d)] as [string, string]),
  ];
  for (const [name, text] of accepted) {
    assert((await problem(text)) === "accepted" && (await opens(text)), `${name}: should open the same vault`);
  }
  const letterIndex = [...key].findIndex((c, i) => i > 60 && /[a-zA-Z]/.test(c));
  const flipped = key.slice(0, letterIndex) + (key[letterIndex] === key[letterIndex]!.toLowerCase() ? key[letterIndex]!.toUpperCase() : key[letterIndex]!.toLowerCase()) + key.slice(letterIndex + 1);
  const checkStart = key.lastIndexOf(".") + 1;
  const corruptCheck = key.slice(0, checkStart) + (key[checkStart] === "A" ? "B" : "A") + key.slice(checkStart + 1);
  const rejected: Array<[string, string, string]> = [
    ["password manager text before the key (was hidden by a password field)", `AutoFilledStrongPw-1${key}`, "malformed"],
    ["activation credential pasted instead", `SCPO-A1.${crypto.randomUUID()}.${crypto.randomUUID()}.${toB64u(randomBytes(138))}`, "wrong-artifact"],
    ["prototype recovery key pasted instead", key.replace("SCPO-P1.", "SCPO-R1."), "wrong-artifact"],
    ["unrelated text", "correct horse battery staple", "wrong-artifact"],
    ["truncated", key.slice(0, -3), "malformed"],
    ["extra trailing text", `${key}X`, "malformed"],
    ["missing section", key.split(".").filter((_, i) => i !== 2).join("."), "malformed"],
    ["changed case of one character", flipped, "altered"],
    ["changed case of everything", key.toLowerCase(), "wrong-artifact"],
    ["checksum corrupted", corruptCheck, "altered"],
    ["secret corrupted", key.slice(0, 80) + (key[80] === "A" ? "B" : "A") + key.slice(81), "altered"],
  ];
  for (const [name, text, expected] of rejected) {
    const got = await problem(text);
    assert(got === expected, `${name}: expected ${expected}, got ${got}`);
  }
  const messages = new Set<string>();
  for (const [, text] of rejected) {
    try {
      await decodeRecoveryArtifact(text);
    } catch (e) {
      messages.add((e as Error).message.split(":")[0]!.split("(")[0]!.trim());
    }
  }
  assert(messages.size >= 3, "the owner sees distinct explanations for wrong key, malformed text and an altered copy");
  destroyVault(vault);

  // UI: both recovery-key inputs are visible, unmanaged plain-text fields; the generated key has a copy button.
  const shell = readFileSync(resolve("src/modules/private-office/security/client/PrivateOfficeShell.tsx"), "utf8");
  const field = /function RecoveryKeyField[\s\S]*?\n}\n/.exec(shell)?.[0] ?? "";
  assert(/<textarea/.test(field) && !/type="password"/.test(field), "recovery key field is a visible textarea");
  for (const attr of ['autoComplete="off"', 'autoCorrect="off"', 'autoCapitalize="off"', "spellCheck={false}", 'data-1p-ignore="true"', 'data-lpignore="true"', 'data-bwignore="true"']) {
    assert(field.includes(attr), `recovery key field sets ${attr}`);
  }
  assert(!/name="[^"]*pass/i.test(field), "field name does not invite password managers");
  assert((shell.match(/<RecoveryKeyField /g) ?? []).length === 2 && !/value=\{(recovery|confirmRecovery)\}[^>]*type="password"|type="password"[^>]*value=\{(recovery|confirmRecovery)\}/.test(shell), "recovery unlock and setup confirmation both use it; neither is a password field");
  assert(/<CopyRecoveryKey value=\{artifact\} \/>/.test(shell) && /navigator\.clipboard\.writeText\(value\)/.test(shell), "copy recovery key button");
});

// ── Browser security baseline ──────────────────────────────────────────────────────────────────────────────
await check("CSP: per-request nonce + strict-dynamic, no inline/eval script in production, framing and plugins denied", () => {
  const prod = buildContentSecurityPolicy({ nonce: "abc", isDev: false, supabaseUrl: "https://ref.supabase.co" });
  const script = /script-src ([^;]+)/.exec(prod)![1]!;
  assert(script.includes("'nonce-abc'") && script.includes("'strict-dynamic'") && !/unsafe-inline|unsafe-eval|\*|https:/.test(script), "script-src strict");
  assert(/frame-ancestors 'none'/.test(prod) && /object-src 'none'/.test(prod) && /base-uri 'none'/.test(prod) && /upgrade-insecure-requests/.test(prod), "baseline directives");
  assert(/connect-src 'self' https:\/\/ref\.supabase\.co wss:\/\/ref\.supabase\.co$/.test(/connect-src [^;]+/.exec(prod)![0]), "connect only to self + Supabase");
  const proxy = readFileSync(resolve("src/proxy.ts"), "utf8");
  assert(/generateNonce\(\)/.test(proxy) && /response\.headers\.set\("Content-Security-Policy"/.test(proxy), "proxy applies the nonce CSP");
  const layout = readFileSync(resolve("src/app/layout.tsx"), "utf8");
  assert(/await connection\(\)/.test(layout), "documents render per request so the nonce applies");
  const config = readFileSync(resolve("next.config.ts"), "utf8");
  assert(/staticSecurityHeaders/.test(config), "static security headers configured");
});

// ── Structure ──────────────────────────────────────────────────────────────────────────────────────────────
await check("structure: same-origin JSON, HttpOnly/SameSite=Strict lease cookie never in a body, no logging or browser storage, Notes untouched", () => {
  const read = (f: string) => readFileSync(resolve(f), "utf8");
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const route = read("src/app/api/private-office/vault/route.ts");
  assert(/request\.headers\.get\("origin"\) === expected/.test(route) && /sec-fetch-site/.test(route), "same-origin enforcement");
  assert(/httpOnly: true/.test(route) && /sameSite: "strict"/.test(route) && /path: COOKIE_PATH/.test(route), "lease cookie attributes");
  for (const action of ["finishAuthentication", "createVault", "completeRecovery", "addPasskey", "removePasskey", "rotateRecovery"]) {
    assert(new RegExp(`withLease\\(await service\\.${action}\\(`).test(route), `${action} lease moved into the cookie`);
  }
  const files = ["shared/protocol.ts", "shared/encoding.ts", "crypto/vaultCrypto.ts", "server/VaultStore.ts", "server/DatabaseVaultStore.ts", "server/PrivateVaultService.ts", "server/vaultGate.ts", "client/webauthnPrf.ts", "client/lockController.ts", "client/PrivateOfficeShell.tsx", "client/PrivateOfficeArea.tsx"];
  const all = files.map((f) => code(read(`src/modules/private-office/security/${f}`))).join("\n") + code(route) + code(read("src/modules/private-office/accounting/domain.ts"));
  assert(!/console\.(log|info|warn|error|debug)/.test(all), "no logging");
  assert(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(all), "no browser storage of keys or plaintext");
  assert(!/batcave|PrivateOfficeNotes/i.test(all), "vault code does not touch Private Notes");
  assert(!/Math\.random/.test(all), "no non-cryptographic randomness");
  const shell = read("src/modules/private-office/security/client/PrivateOfficeShell.tsx");
  assert(!/signOut\(/.test(shell), "locking never signs the owner out of SentraCore");
  const layout = read("src/app/(app)/command-centre/private-office/layout.tsx");
  assert(/<PrivateOfficeShell>/.test(layout), "one shell per Private Office visit (tab changes do not lock)");
});

function readdirRecursive(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? readdirRecursive(path) : [path];
  });
}

console.log(failures === 0 ? "\nPRIVATE OFFICE SECURITY: PASS" : `\nPRIVATE OFFICE SECURITY: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
