/**
 * Private Office vault foundation migration — behavioural verification in a REAL Postgres (PGlite, in-process).
 * Applies 20260925010000 to a scratch database stubbed with the relevant slice of the live schema (auth.sessions,
 * profiles, organisations, capability grants, a Private Notes row), then drives it through the PRODUCTION
 * DatabaseVaultStore + PrivateVaultService. Never touches Supabase.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> npx tsx --tsconfig tsconfig.json scripts/verify-private-office-vault-migration.mts
 */
import { generateKeyPairSync, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createVault, decodeRecoveryArtifact, encryptItem, signAuthority, unlockWithPasskey, type UnlockedVault } from "../src/modules/private-office/security/crypto/vaultCrypto";
import { fromB64u, toB64u, utf8 } from "../src/modules/private-office/security/shared/encoding";
import { DatabaseVaultStore, type Rpc } from "../src/modules/private-office/security/server/DatabaseVaultStore";
import { PrivateVaultService, VaultError, type VaultActor } from "../src/modules/private-office/security/server/PrivateVaultService";
import { openingPosition, type FinancialRecord } from "../src/modules/private-office/accounting/domain";
import { SoftAuthenticator } from "./private-office/softAuthenticator";
import { signManifest, type UnsignedIdentity } from "../src/modules/private-office/security/crypto/vaultIdentity";

const MIGRATION = readFileSync("supabase/migrations/20260925010000_private_office_vault_foundation.sql", "utf8");
const ORIGIN = "https://sentracore.example";
const RP_ID = "sentracore.example";
const ORG = "0a0a0a0a-0000-4000-8000-00000000000a";
const OWNER = "11111111-1111-4111-8111-111111111111";
const EXEC = "22222222-2222-4222-8222-222222222222";
const SUPER = "33333333-3333-4333-8333-333333333333";
const S1 = "aaaaaaaa-0000-4000-8000-000000000001";
const S2 = "aaaaaaaa-0000-4000-8000-000000000002";
const S_EXEC = "aaaaaaaa-0000-4000-8000-000000000003";
const S_SUPER = "aaaaaaaa-0000-4000-8000-000000000004";
const PRIVATE_NAME = "Access Bank Treasury";

let failures = 0;
async function check(name: string, fn: () => Promise<void>) {
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

const db = new PGlite();
/** Autocommit: each statement is its own transaction, so a refused statement leaves nothing behind. */
async function sqlRejects(sql: string, params: unknown[] = []): Promise<string | null> {
  try {
    await db.query(sql, params);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create table auth.sessions (id uuid primary key, user_id uuid not null, not_after timestamptz);
  create table public.organisations (id uuid primary key, status text not null default 'active');
  create table public.profiles (id uuid primary key, organisation_id uuid references public.organisations(id), status text not null default 'active', access_scope text not null default 'platform');
  create table public.platform_capability_grants (id serial primary key, organisation_id uuid, profile_id uuid, capability text);
  create table public.batcave_notes (id uuid primary key default gen_random_uuid(), organisation_id uuid, owner_profile_id uuid, title text, body text);
  insert into public.organisations (id) values ('${ORG}');
  insert into public.profiles (id, organisation_id) values ('${OWNER}', '${ORG}'), ('${EXEC}', '${ORG}'), ('${SUPER}', '${ORG}');
  insert into auth.sessions (id, user_id) values ('${S1}', '${OWNER}'), ('${S2}', '${OWNER}'), ('${S_EXEC}', '${EXEC}'), ('${S_SUPER}', '${SUPER}');
  insert into public.platform_capability_grants (organisation_id, profile_id, capability) values
    ('${ORG}', '${OWNER}', 'platform.command_centre.view'), ('${ORG}', '${OWNER}', 'platform.executive.private_office.access'),
    ('${ORG}', '${EXEC}', 'platform.command_centre.view'), ('${ORG}', '${EXEC}', 'platform.executive.private_office.access'),
    ('${ORG}', '${SUPER}', 'platform.command_centre.view');
  insert into public.batcave_notes (organisation_id, owner_profile_id, title, body) values ('${ORG}', '${OWNER}', 'Existing note', 'Plaintext note body');
`);
const notesBefore = JSON.stringify((await db.query("select * from public.batcave_notes order by id")).rows);
await db.exec(MIGRATION);

/** Calls the migration's functions exactly as PostgREST would for service_role. */
const rpc: Rpc = async (fn, params) => {
  try {
    await db.exec("set role service_role");
    const text =
      fn === "private_office_load"
        ? "select public.private_office_load($1::uuid, $2::uuid, $3::uuid, $4::boolean) as r"
        : "select public.private_office_commit($1::uuid, $2::uuid, $3::uuid, $4::bigint, $5::jsonb, $6::jsonb, $7::jsonb, $8::boolean) as r";
    const args =
      fn === "private_office_load"
        ? [params.p_owner, params.p_org, params.p_session, params.p_with_records]
        : [params.p_owner, params.p_org, params.p_session, params.p_revision, params.p_vault === null ? null : JSON.stringify(params.p_vault), JSON.stringify(params.p_state), JSON.stringify(params.p_records), params.p_establish];
    const result = await db.query<{ r: unknown }>(text, args);
    return { data: result.rows[0]!.r, error: null };
  } catch (e) {
    return { data: null, error: { code: (e as { code?: string }).code, message: (e as Error).message } };
  } finally {
    await db.exec("reset role");
  }
};

const actor = (profileId: string, sessionId: string): VaultActor => ({ organisationId: ORG, profileId, sessionId });
const service = (who: VaultActor) => new PrivateVaultService(new DatabaseVaultStore(who, rpc), { origin: ORIGIN, rpID: RP_ID, rpName: "test" });

function issueActivation(profile: string) {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    publicKey: pair.publicKey.export({ format: "der", type: "spki" }).toString("base64url"),
    privateKey: pair.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64url"),
    profile,
  };
}
async function signActivation(privateKey: string, message: string) {
  const key = await webcrypto.subtle.importKey("pkcs8", fromB64u(privateKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  return toB64u(new Uint8Array(await webcrypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(message))));
}
async function registerActivationAsIssuer(owner: string, publicKey: string) {
  await db.exec("set role private_office_issuer");
  try {
    await db.query("insert into public.private_office_activations (owner_profile_id, organisation_id, public_key) values ($1, $2, $3)", [owner, ORG, publicKey]);
  } finally {
    await db.exec("reset role");
  }
}

async function prepareEnrolment(who: VaultActor, privateKey: string) {
  const svc = service(who);
  const ch = await svc.beginActivation(who);
  const proof = { challengeId: ch.challengeId, signature: await signActivation(privateKey, ch.message) };
  const auth = new SoftAuthenticator({ origin: ORIGIN, rpID: RP_ID, prfAtCreate: true });
  const begin = await svc.beginRegistration(who, "create", null, proof);
  const reg = await auth.register(begin.options as never);
  const registered = await svc.finishRegistration(who, begin.challengeId, reg.response as never);
  const created = await createVault({ vaultId: begin.vaultId, passkeyWrapperId: registered.wrapperId, prfOutput: new Uint8Array(reg.prfOutput!) });
  // The owner signs the vault's identity manifest (sequence 1), exactly as the client establishment flow does.
  const identity: UnsignedIdentity = {
    vaultId: begin.vaultId,
    rootKeyId: created.publication.rootKeyId,
    authorityPublicKey: created.publication.authorityPublicKey,
    wrappedAuthorityKey: created.publication.wrappedAuthorityKey,
    recoveryWrapped: created.publication.recoveryWrapped,
    passkeys: [{ credentialId: registered.credentialId, wrapperId: registered.wrapperId, prfSalt: begin.prfSalt, publicKey: registered.publicKey, wrapped: created.publication.passkeyWrapped }],
    manifestSequence: 1,
  };
  const manifestSignature = await signManifest(created.vault, identity);
  return { svc, auth, begin, registered, created, input: { vaultId: begin.vaultId, credentialId: registered.credentialId, wrapperId: registered.wrapperId, ...created.publication, manifestSignature } };
}

const ownerActivation = issueActivation(OWNER);
const owner1 = actor(OWNER, S1);
let ownerAuth!: SoftAuthenticator;
let ownerVault!: UnlockedVault;
let ownerArtifact = "";
let ownerLease = "";

await check("schema: four separated tables, RLS on, no table privilege for anon/authenticated/service_role, functions service_role only", async () => {
  const tables = ["private_office_activations", "private_office_vaults", "private_office_security_state", "private_office_records"];
  const rls = await db.query<{ relname: string; relrowsecurity: boolean }>("select relname, relrowsecurity from pg_class where relname = any($1)", [tables]);
  assert(rls.rows.length === 4 && rls.rows.every((r) => r.relrowsecurity), "RLS enabled on all four");
  for (const role of ["anon", "authenticated", "service_role"]) {
    for (const t of tables) {
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        const has = await db.query<{ ok: boolean }>(`select has_table_privilege($1, 'public.${t}', $2) as ok`, [role, priv]);
        assert(!has.rows[0]!.ok, `${role} has ${priv} on ${t}`);
      }
    }
  }
  const fn = async (role: string, sig: string) => (await db.query<{ ok: boolean }>(`select has_function_privilege($1, '${sig}', 'EXECUTE') as ok`, [role])).rows[0]!.ok;
  for (const sig of ["public.private_office_load(uuid,uuid,uuid,boolean)", "public.private_office_commit(uuid,uuid,uuid,bigint,jsonb,jsonb,jsonb,boolean)"]) {
    assert(await fn("service_role", sig), `service_role can execute ${sig}`);
    assert(!(await fn("authenticated", sig)) && !(await fn("anon", sig)), `browser roles cannot execute ${sig}`);
  }
  assert(!(await fn("service_role", "public.private_office_assert_actor(uuid,uuid,uuid)")), "helper not directly callable");
  await db.exec("set role service_role");
  const direct = await sqlRejects("select * from public.private_office_vaults");
  await db.exec("reset role");
  assert(direct && /permission denied/.test(direct), "service_role cannot read vault tables directly");
});

await check("activation issuance: the offline issuer can register a public key once; it cannot read, change or pre-consume it", async () => {
  await registerActivationAsIssuer(OWNER, ownerActivation.publicKey);
  await db.exec("set role private_office_issuer");
  const read = await sqlRejects("select public_key from public.private_office_activations");
  const preconsumed = await sqlRejects(`insert into public.private_office_activations (owner_profile_id, organisation_id, public_key, consumed_at) values ('${EXEC}', '${ORG}', '${ownerActivation.publicKey}', now())`);
  await db.exec("reset role");
  assert(read && /permission denied/.test(read), "issuer cannot read back");
  assert(preconsumed && /permission denied/.test(preconsumed), "issuer cannot set consumption");
  assert(await sqlRejects("insert into public.private_office_activations (owner_profile_id, organisation_id, public_key) values ($1, $2, $3)", [OWNER, ORG, ownerActivation.publicKey]), "second activation for the same owner refused");
  const bad = await sqlRejects("insert into public.private_office_activations (owner_profile_id, organisation_id, public_key) values ($1, $2, 'not-a-key')", [EXEC, ORG]);
  assert(bad && /check/.test(bad), "malformed public key refused");
});

await check("actor check: live owner session + both explicit grants required; Super Admin-style identity without the grant refused", async () => {
  const load = (owner: string, session: string) => rpc("private_office_load", { p_owner: owner, p_org: ORG, p_session: session, p_with_records: false });
  assert(!(await load(OWNER, S1)).error, "owner with live session and grants");
  assert((await load(OWNER, S_EXEC)).error, "someone else's session");
  assert((await load(OWNER, "aaaaaaaa-0000-4000-8000-00000000ffff")).error, "unknown session");
  assert((await load(SUPER, S_SUPER)).error, "command_centre.view without the Private Office grant");
  await db.exec(`update auth.sessions set not_after = now() - interval '1 minute' where id = '${S2}'`);
  assert((await load(OWNER, S2)).error, "expired session");
  await db.exec(`update auth.sessions set not_after = null where id = '${S2}'`);
});

await check("normal session alone and the temporary-password path cannot establish a vault", async () => {
  const svc = service(owner1);
  try {
    await svc.beginRegistration(owner1, "create");
    throw new Error("registration without activation proof");
  } catch (e) {
    assert(e instanceof VaultError && e.code === "INVALID", `unexpected: ${(e as Error).message}`);
  }
  const vaultRow = { vaultId: crypto.randomUUID(), rootKeyId: "A".repeat(22), authorityPublicKey: ownerActivation.publicKey, generation: 1, webauthnUserId: "x", passkeys: [{}], wrappedAuthorityKey: {}, recoveryWrapped: {} };
  const load = await rpc("private_office_load", { p_owner: OWNER, p_org: ORG, p_session: S1, p_with_records: false });
  const revision = (load.data as { revision: number }).revision;
  const noEstablish = await rpc("private_office_commit", { p_owner: OWNER, p_org: ORG, p_session: S1, p_revision: revision, p_vault: vaultRow, p_state: {}, p_records: [], p_establish: false });
  assert(noEstablish.error, "a vault cannot be written without the establishment path");
  const direct = await sqlRejects("insert into public.private_office_vaults (owner_profile_id, organisation_id, vault_id, root_key_id, authority_public_key, generation, identity) values ($1, $2, $3, $4, $5, 1, $6)", [OWNER, ORG, vaultRow.vaultId, vaultRow.rootKeyId, vaultRow.authorityPublicKey, JSON.stringify({ passkeys: [{}], wrappedAuthorityKey: {}, recoveryWrapped: {} })]);
  assert(direct && /consumed independent activation/.test(direct), "even a superuser insert needs consumed activation");
});

await check("concurrent first enrolment through the database: exactly one vault identity; activation consumed atomically with it", async () => {
  const a = await prepareEnrolment(actor(OWNER, S1), ownerActivation.privateKey);
  const b = await prepareEnrolment(actor(OWNER, S2), ownerActivation.privateKey);
  const results = await Promise.allSettled([a.svc.createVault(actor(OWNER, S1), a.input), b.svc.createVault(actor(OWNER, S2), b.input)]);
  const wins = results.filter((r) => r.status === "fulfilled");
  assert(wins.length === 1, `exactly one establishment (got ${wins.length})`);
  const vaults = await db.query<{ vault_id: string }>("select vault_id from public.private_office_vaults where owner_profile_id = $1", [OWNER]);
  const activation = await db.query<{ consumed_at: string | null }>("select consumed_at from public.private_office_activations where owner_profile_id = $1", [OWNER]);
  assert(vaults.rows.length === 1 && activation.rows[0]!.consumed_at !== null, "one vault row and consumed activation");
  const winner = results[0]!.status === "fulfilled" ? a : b;
  assert(vaults.rows[0]!.vault_id === winner.begin.vaultId, "the persisted identity is the winner's");
  ownerAuth = winner.auth;
  ownerVault = winner.created.vault;
  ownerArtifact = winner.created.recoveryArtifact;
  ownerLease = ((results[0]!.status === "fulfilled" ? results[0] : results[1]) as PromiseFulfilledResult<{ leaseToken: string }>).value.leaseToken;
  owner1.sessionId = winner === a ? S1 : S2;
});

await check("optimistic concurrency: a commit against a stale revision is refused with 40001 (retried from fresh state)", async () => {
  const params = { p_owner: OWNER, p_org: ORG, p_session: S1, p_with_records: false };
  const first = (await rpc("private_office_load", params)).data as { revision: number; state: object };
  const second = (await rpc("private_office_load", params)).data as { revision: number; state: object };
  assert(first.revision === second.revision, "both writers loaded the same revision");
  const commit = (revision: number, state: object) => rpc("private_office_commit", { p_owner: OWNER, p_org: ORG, p_session: S1, p_revision: revision, p_vault: null, p_state: state, p_records: [], p_establish: false });
  assert(!(await commit(first.revision, first.state)).error, "first writer commits");
  const stale = await commit(second.revision, second.state);
  assert(stale.error?.code === "40001", `second writer refused as concurrent (got ${stale.error?.code})`);
});

await check("atomicity: a failed establishment leaves activation unconsumed and no vault", async () => {
  const other = issueActivation(EXEC);
  await registerActivationAsIssuer(EXEC, other.publicKey);
  const e = await prepareEnrolment(actor(EXEC, S_EXEC), other.privateKey);
  const load = await rpc("private_office_load", { p_owner: EXEC, p_org: ORG, p_session: S_EXEC, p_with_records: false });
  const revision = (load.data as { revision: number }).revision;
  const badVault = { ...e.input, generation: 7, webauthnUserId: "x", passkeys: [], createdAt: "now" };
  const failed = await rpc("private_office_commit", { p_owner: EXEC, p_org: ORG, p_session: S_EXEC, p_revision: revision, p_vault: badVault, p_state: {}, p_records: [], p_establish: true });
  assert(failed.error, "invalid establishment refused");
  const activation = await db.query<{ consumed_at: string | null }>("select consumed_at from public.private_office_activations where owner_profile_id = $1", [EXEC]);
  const vaults = await db.query("select 1 from public.private_office_vaults where owner_profile_id = $1", [EXEC]);
  assert(activation.rows[0]!.consumed_at === null && vaults.rows.length === 0, "rolled back together");
  await e.svc.createVault(actor(EXEC, S_EXEC), e.input);
  const after = await db.query<{ consumed_at: string | null }>("select consumed_at from public.private_office_activations where owner_profile_id = $1", [EXEC]);
  assert(after.rows[0]!.consumed_at !== null, "a valid retry then establishes and consumes");
});

await check("established identity is permanent: no delete, no reset, no replacement, no generation rollback; activation cannot be reopened", async () => {
  for (const [sql, why] of [
    ["delete from public.private_office_vaults where owner_profile_id = $1", "delete vault"],
    ["update public.private_office_vaults set vault_id = gen_random_uuid() where owner_profile_id = $1", "replace vault id"],
    ["update public.private_office_vaults set root_key_id = 'BBBBBBBBBBBBBBBBBBBBBB' where owner_profile_id = $1", "replace root key id"],
    ["update public.private_office_vaults set identity = jsonb_set(identity, '{wrappedAuthorityKey}', '{}') where owner_profile_id = $1", "replace authority key"],
    ["update public.private_office_vaults set generation = 0 where owner_profile_id = $1", "generation rollback"],
    ["update public.private_office_activations set consumed_at = null where owner_profile_id = $1", "reopen activation"],
    ["update public.private_office_vaults set identity = jsonb_set(identity, '{manifestSequence}', '0') where owner_profile_id = $1", "manifest sequence below 1"],
    ["update public.private_office_vaults set identity = identity - 'manifestSignature' where owner_profile_id = $1", "unsigned identity"],
    ["update public.private_office_vaults set identity = jsonb_set(identity, '{manifestSignature}', '\"short\"') where owner_profile_id = $1", "malformed manifest signature"],
    ["delete from public.private_office_activations where owner_profile_id = $1", "delete activation"],
  ] as const) {
    assert(await sqlRejects(sql, [OWNER]), `${why} was allowed`);
  }
  const svc = service(actor(OWNER, S1));
  for (const call of [() => svc.beginActivation(actor(OWNER, S1)), () => svc.beginRegistration(actor(OWNER, S1), "create")]) {
    try {
      await call();
      throw new Error("first enrolment reopened");
    } catch (e) {
      assert(e instanceof VaultError && e.code === "CONFLICT", `unexpected: ${(e as Error).message}`);
    }
  }
});

await check("signed identity at rest: the stored vault carries the owner's manifest; its sequence can never move backwards", async () => {
  const row = await db.query<{ seq: string; sig: string }>("select identity ->> 'manifestSequence' as seq, identity ->> 'manifestSignature' as sig from public.private_office_vaults where owner_profile_id = $1", [OWNER]);
  assert(row.rows[0]!.seq === "1" && /^[A-Za-z0-9_-]{86}$/.test(row.rows[0]!.sig), "established at sequence 1 with a signature");
  await db.exec(`update public.private_office_vaults set identity = jsonb_set(identity, '{manifestSequence}', '3') where owner_profile_id = '${OWNER}'`);
  const back = await sqlRejects("update public.private_office_vaults set identity = jsonb_set(identity, '{manifestSequence}', '2') where owner_profile_id = $1", [OWNER]);
  assert(back && /cannot move backwards/.test(back), "manifest sequence rolled back");
  await db.exec(`update public.private_office_vaults set identity = jsonb_set(identity, '{manifestSequence}', '1') where owner_profile_id = '${OWNER}'`).catch(() => undefined);
});

await check("encrypted records: immutable, append-only, strict opaque envelopes; plaintext-bearing envelopes refused", async () => {
  const who = actor(OWNER, owner1.sessionId);
  const svc = service(who);
  const records: FinancialRecord[] = openingPosition({ name: PRIVATE_NAME, accountKind: "bank", currency: "NGN", balance: "5000000", date: "2026-09-01" });
  const items = await Promise.all(records.map((r) => encryptItem(ownerVault, r.id, JSON.stringify(r))));
  const digest = toB64u(new Uint8Array(await webcrypto.subtle.digest("SHA-256", utf8(JSON.stringify({ expectedCount: 0, items })))));
  const ch = await svc.beginAuthority(who, ownerLease, "append-records");
  await svc.appendRecords(who, ownerLease, { items, expectedCount: 0, challengeId: ch.challengeId, signature: await signAuthority(ownerVault, "append-records", ch.challenge, digest) });
  const listed = await svc.listItems(who, ownerLease);
  assert(listed.items.length === 2 && listed.items[0]!.ct === items[0]!.ct, "records persisted and listed in order");
  assert(await sqlRejects("update public.private_office_records set envelope = envelope where owner_profile_id = $1", [OWNER]), "record update allowed");
  assert(await sqlRejects("delete from public.private_office_records where owner_profile_id = $1", [OWNER]), "record delete allowed");
  const leaky = { itemId: crypto.randomUUID(), v: 1, iv: "AAAAAAAAAAAAAAAA", ct: "A".repeat(40), createdAt: "x", name: PRIVATE_NAME };
  assert(await sqlRejects("insert into public.private_office_records (owner_profile_id, item_id, ordinal, envelope) values ($1, $2, 99, $3)", [OWNER, leaky.itemId, JSON.stringify(leaky)]), "envelope with a plaintext field accepted");
});

await check("sign-out and entitlement revocation end access; regrant does not reopen enrolment or reset the vault", async () => {
  const who = actor(OWNER, owner1.sessionId);
  await db.exec(`delete from public.platform_capability_grants where profile_id = '${OWNER}' and capability = 'platform.executive.private_office.access'`);
  const revoked = await rpc("private_office_load", { p_owner: OWNER, p_org: ORG, p_session: who.sessionId, p_with_records: false });
  assert(revoked.error, "revoked entitlement still loads");
  await db.exec(`insert into public.platform_capability_grants (organisation_id, profile_id, capability) values ('${ORG}', '${OWNER}', 'platform.executive.private_office.access')`);
  const svc = service(who);
  const status = await svc.status(who, ownerLease);
  assert(status.hasVault, "vault survives revoke/regrant");
  try {
    await svc.beginActivation(who);
    throw new Error("regrant reopened enrolment");
  } catch (e) {
    assert(e instanceof VaultError && e.code === "CONFLICT", `unexpected: ${(e as Error).message}`);
  }
  // Unlock still requires the passkey (PRF) — entitlement alone decrypts nothing.
  const begin = await svc.beginAuthentication(who, "unlock");
  const asserted = await ownerAuth.assert(begin.options as never);
  const res = await svc.finishAuthentication(who, begin.challengeId, asserted.response as never);
  if (res.purpose !== "unlock") throw new Error("unexpected");
  const vault = await unlockWithPasskey({ vaultId: res.vaultId, passkeyWrapperId: res.wrapperId, wrapped: res.wrapped, wrappedAuthorityKey: res.wrappedAuthorityKey, prfOutput: new Uint8Array(asserted.prfOutput!), expectedRootKeyId: res.rootKeyId });
  assert(vault.rootKeyId === ownerVault.rootKeyId, "same vault");
  await db.exec(`delete from auth.sessions where id = '${who.sessionId}'`);
  const afterSignOut = await rpc("private_office_load", { p_owner: OWNER, p_org: ORG, p_session: who.sessionId, p_with_records: false });
  assert(afterSignOut.error, "signed-out session still reaches the vault");
});

await check("database holds no financial plaintext or secret; Private Notes rows unchanged", async () => {
  const everything = JSON.stringify([
    (await db.query("select * from public.private_office_activations")).rows,
    (await db.query("select * from public.private_office_vaults")).rows,
    (await db.query("select * from public.private_office_security_state")).rows,
    (await db.query("select * from public.private_office_records")).rows,
  ]);
  for (const plain of [PRIVATE_NAME, "5000000", "opening_position", "opening-balance-equity"]) assert(!everything.includes(plain), `plaintext "${plain}" stored`);
  for (const secret of [toB64u(ownerVault.root), toB64u((await decodeRecoveryArtifact(ownerArtifact)).secret), ownerActivation.privateKey, ...ownerAuth.prfOutputs.map((o) => toB64u(o))]) {
    assert(!everything.includes(secret), "secret material stored");
  }
  assert(JSON.stringify((await db.query("select * from public.batcave_notes order by id")).rows) === notesBefore, "Private Notes changed");
  assert(!/batcave_notes/.test(MIGRATION.replace(/^--.*$/gm, "")), "migration does not reference Private Notes");
});

console.log(failures === 0 ? "\nPRIVATE OFFICE VAULT MIGRATION: PASS" : `\nPRIVATE OFFICE VAULT MIGRATION: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
