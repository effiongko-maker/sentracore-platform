-- Private Office Tranche 1 — independent activation, permanent vault identity, short-lived security state and
-- immutable encrypted records.
--
-- CONFIDENTIALITY MODEL
--   * Financial plaintext, the vault root key, the recovery secret and WebAuthn PRF output never reach this
--     database. It stores public parameters (salts, IVs, credential public keys, the vault-authority public key,
--     a root-key fingerprint), wrapped keys and ciphertext only.
--   * Nothing here can decrypt a vault — not service_role, not Super Admin, not a database operator.
--
-- AUTHORITY MODEL
--   * First enrollment requires an INDEPENDENT owner activation credential. Only its P-256 public verification key
--     is registered here, by the offline issuance ceremony (role private_office_issuer). Admin Console, the app
--     server and service_role cannot create, read back, reset or replace activation authority.
--   * Establishing the vault and consuming activation commit in ONE transaction under a per-owner lock. Activation
--     is single-use and permanent: nothing (password reset, temporary password, re-login, role or entitlement
--     change, Super Admin, platform.admin_override) can reopen first enrollment.
--   * No table is reachable by anon / authenticated / service_role. The server uses two SECURITY DEFINER functions
--     (service_role only) which re-verify, per call, that the Supabase session is live and belongs to the owner and
--     that the owner holds Executive Office entry AND the explicit Private Office grant.
--
-- SIGNED IDENTITY
--   The owner signs a manifest of the vault's complete public identity (root fingerprint, authority public key,
--   wrapped authority key, recovery wrapper, every passkey wrapper / credential key / PRF salt). The server verifies
--   it before storing any change; the client verifies it on every unlock. This database cannot verify ECDSA; it
--   only guarantees the signed sequence never decreases. Record withholding and whole-state rollback are
--   availability limits this does not claim to solve.
--
-- STORAGE SEPARATION
--   private_office_activations      independent first-enrollment authority (public key; single use)
--   private_office_vaults           permanent owner/vault identity, security generation, wrapped keys, passkey
--                                   public information — immutable identity, never deletable
--   private_office_security_state   short-lived challenges, pending registrations, unlock-lease HASHES
--   private_office_records          immutable, append-only, granular encrypted records
--
-- Private Notes (batcave_notes), Finance, IAM grants and every other table are untouched. No data is seeded.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'private_office_issuer') then
    create role private_office_issuer nologin;
  end if;
end $$;

create table public.private_office_activations (
  owner_profile_id uuid primary key references public.profiles (id) on delete restrict,
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  -- P-256 SubjectPublicKeyInfo (91 bytes DER), base64url.
  public_key text not null check (public_key ~ '^[A-Za-z0-9_-]{122}$'),
  created_at timestamptz not null default timezone('utc', now()),
  consumed_at timestamptz
);

create table public.private_office_vaults (
  owner_profile_id uuid primary key references public.profiles (id) on delete restrict,
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  vault_id uuid not null unique,
  root_key_id text not null check (root_key_id ~ '^[A-Za-z0-9_-]{22}$'),
  authority_public_key text not null check (authority_public_key ~ '^[A-Za-z0-9_-]{122}$'),
  generation bigint not null check (generation >= 1),
  -- Public / wrapped material only: webauthnUserId, wrappedAuthorityKey, recoveryWrapped, passkeys[], and the
  -- OWNER-SIGNED identity manifest (manifestSequence, manifestSignature). The signature is made by the vault
  -- authority key, which exists only encrypted under the root key; the client verifies it on every unlock, so
  -- identity material substituted or tampered with here is detected rather than silently used.
  -- NULL-safe: a CHECK whose expression is NULL passes, so every required key is coalesced to a failing value.
  identity jsonb not null check (
    jsonb_typeof(identity) = 'object'
    and coalesce(jsonb_typeof(identity -> 'manifestSequence'), '') = 'number'
    and coalesce((identity ->> 'manifestSequence')::numeric >= 1, false)
    and coalesce((identity ->> 'manifestSignature') ~ '^[A-Za-z0-9_-]{86}$', false)
    and coalesce(jsonb_typeof(identity -> 'passkeys'), '') = 'array'
    and coalesce(jsonb_array_length(identity -> 'passkeys') between 1 and 10, false)
    and coalesce(jsonb_typeof(identity -> 'wrappedAuthorityKey'), '') = 'object'
    and coalesce(jsonb_typeof(identity -> 'recoveryWrapped'), '') = 'object'
    and octet_length(identity::text) <= 65536
  ),
  established_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.private_office_security_state (
  owner_profile_id uuid primary key references public.profiles (id) on delete cascade,
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  revision bigint not null default 0,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 262144),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.private_office_records (
  owner_profile_id uuid not null references public.private_office_vaults (owner_profile_id) on delete restrict,
  item_id uuid not null,
  ordinal bigint not null check (ordinal >= 1),
  envelope jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (owner_profile_id, item_id),
  unique (owner_profile_id, ordinal),
  check (
    jsonb_typeof(envelope) = 'object'
    and envelope ?& array['itemId', 'v', 'iv', 'ct', 'createdAt']
    and (envelope - array['itemId', 'v', 'iv', 'ct', 'createdAt']) = '{}'::jsonb
    and envelope ->> 'itemId' = item_id::text
    and envelope ->> 'v' = '1'
    and (envelope ->> 'iv') ~ '^[A-Za-z0-9_-]{16}$'
    and (envelope ->> 'ct') ~ '^[A-Za-z0-9_-]+$'
    and length(envelope ->> 'ct') between 23 and 21846
  )
);

comment on table public.private_office_vaults is
  'Private Office permanent vault identity. Wrapped keys and public parameters only; cannot decrypt anything. Never deletable; identity immutable.';
comment on table public.private_office_records is
  'Private Office encrypted records. Opaque ciphertext envelopes; append-only and immutable. No financial plaintext.';

-- ── Integrity guards ───────────────────────────────────────────────────────────────────────────────────────────

create function public.private_office_activation_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Private Office activation authority cannot be deleted' using errcode = '42501'; end if;
  if new.owner_profile_id <> old.owner_profile_id or new.organisation_id <> old.organisation_id
     or new.public_key <> old.public_key or new.created_at <> old.created_at
     or old.consumed_at is not null or new.consumed_at is null then
    raise exception 'Private Office activation authority is single-use and immutable' using errcode = '42501';
  end if;
  return new;
end $$;

create function public.private_office_vault_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'Private Office vault identity cannot be deleted or reset' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.private_office_activations a
      where a.owner_profile_id = new.owner_profile_id and a.organisation_id = new.organisation_id and a.consumed_at is not null
    ) then
      raise exception 'Private Office vault requires consumed independent activation' using errcode = '42501';
    end if;
    if new.generation <> 1 then raise exception 'A new vault starts at security generation 1' using errcode = '42501'; end if;
    if (new.identity ->> 'manifestSequence')::bigint <> 1 then raise exception 'A new vault starts at manifest sequence 1' using errcode = '42501'; end if;
    return new;
  end if;
  if new.owner_profile_id <> old.owner_profile_id or new.organisation_id <> old.organisation_id
     or new.vault_id <> old.vault_id or new.root_key_id <> old.root_key_id
     or new.authority_public_key <> old.authority_public_key or new.established_at <> old.established_at
     or new.identity -> 'wrappedAuthorityKey' is distinct from old.identity -> 'wrappedAuthorityKey'
     or new.identity -> 'webauthnUserId' is distinct from old.identity -> 'webauthnUserId' then
    raise exception 'Established Private Office identity cannot be replaced' using errcode = '42501';
  end if;
  if new.generation < old.generation then raise exception 'Security generation cannot move backwards' using errcode = '42501'; end if;
  if (new.identity ->> 'manifestSequence')::bigint < (old.identity ->> 'manifestSequence')::bigint then
    raise exception 'Signed vault identity cannot move backwards' using errcode = '42501';
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end $$;

create function public.private_office_record_guard() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Private Office records are immutable' using errcode = '42501';
end $$;

create trigger private_office_activation_guard before update or delete on public.private_office_activations
  for each row execute function public.private_office_activation_guard();
create trigger private_office_vault_guard before insert or update or delete on public.private_office_vaults
  for each row execute function public.private_office_vault_guard();
create trigger private_office_record_guard before update or delete on public.private_office_records
  for each row execute function public.private_office_record_guard();

-- ── Access boundary ────────────────────────────────────────────────────────────────────────────────────────────

alter table public.private_office_activations enable row level security;
alter table public.private_office_vaults enable row level security;
alter table public.private_office_security_state enable row level security;
alter table public.private_office_records enable row level security;

-- No policies for anon / authenticated / service_role: RLS denies, and no table privileges are granted.
revoke all on table public.private_office_activations, public.private_office_vaults,
  public.private_office_security_state, public.private_office_records
  from public, anon, authenticated, service_role;

-- The offline issuance ceremony may register a public verification key once; it can read or change nothing.
grant insert (owner_profile_id, organisation_id, public_key) on public.private_office_activations to private_office_issuer;
create policy private_office_independent_activation_issuance on public.private_office_activations
  for insert to private_office_issuer with check (consumed_at is null);

-- Live, owner-bound Supabase session + explicit grants. Super Admin / platform.admin_override never consulted.
create function public.private_office_assert_actor(p_owner uuid, p_org uuid, p_session uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_owner is null or p_org is null or p_session is null
    or not exists (
      select 1 from auth.sessions s
      where s.id = p_session and s.user_id = p_owner and (s.not_after is null or s.not_after > now())
    )
    or not exists (
      select 1 from public.profiles p join public.organisations o on o.id = p.organisation_id
      where p.id = p_owner and p.organisation_id = p_org and p.status = 'active' and p.access_scope = 'platform' and o.status = 'active'
    )
    or not exists (
      select 1 from public.platform_capability_grants
      where profile_id = p_owner and organisation_id = p_org and capability = 'platform.command_centre.view'
    )
    or not exists (
      select 1 from public.platform_capability_grants
      where profile_id = p_owner and organisation_id = p_org and capability = 'platform.executive.private_office.access'
    ) then
    raise exception 'Private Office unavailable' using errcode = '42501';
  end if;
end $$;

create function public.private_office_load(p_owner uuid, p_org uuid, p_session uuid, p_with_records boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  st public.private_office_security_state;
  v public.private_office_vaults;
  a public.private_office_activations;
begin
  perform public.private_office_assert_actor(p_owner, p_org, p_session);
  select * into st from public.private_office_security_state where owner_profile_id = p_owner and organisation_id = p_org;
  select * into v from public.private_office_vaults where owner_profile_id = p_owner and organisation_id = p_org;
  select * into a from public.private_office_activations where owner_profile_id = p_owner and organisation_id = p_org;
  return jsonb_build_object(
    'revision', coalesce(st.revision, 0),
    'state', coalesce(st.state, '{}'::jsonb),
    'activation', case when a.owner_profile_id is null then null
                       else jsonb_build_object('publicKey', a.public_key, 'consumed', a.consumed_at is not null) end,
    'vault', case when v.owner_profile_id is null then null
                  else v.identity || jsonb_build_object(
                    'vaultId', v.vault_id, 'rootKeyId', v.root_key_id, 'authorityPublicKey', v.authority_public_key,
                    'generation', v.generation, 'establishedAt', v.established_at) end,
    'recordCount', (select count(*) from public.private_office_records where owner_profile_id = p_owner),
    'records', case when p_with_records then coalesce(
                 (select jsonb_agg(envelope order by ordinal) from public.private_office_records where owner_profile_id = p_owner),
                 '[]'::jsonb) else null end
  );
end $$;

create function public.private_office_commit(
  p_owner uuid, p_org uuid, p_session uuid, p_revision bigint,
  p_vault jsonb, p_state jsonb, p_records jsonb, p_establish boolean
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  st public.private_office_security_state;
  existing public.private_office_vaults;
  v_identity jsonb;
  n bigint;
  rec jsonb;
begin
  perform public.private_office_assert_actor(p_owner, p_org, p_session);
  -- One owner, one writer: concurrent enrollments/changes serialise here; stale revisions are refused.
  perform pg_advisory_xact_lock(hashtextextended('private_office:' || p_owner::text, 0));
  insert into public.private_office_security_state (owner_profile_id, organisation_id)
    values (p_owner, p_org) on conflict (owner_profile_id) do nothing;
  select * into st from public.private_office_security_state where owner_profile_id = p_owner for update;
  if st.organisation_id <> p_org then raise exception 'Private Office unavailable' using errcode = '42501'; end if;
  if st.revision <> p_revision then raise exception 'Concurrent Private Office change' using errcode = '40001'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' or jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Invalid Private Office change' using errcode = '22023';
  end if;

  select * into existing from public.private_office_vaults where owner_profile_id = p_owner;

  if p_vault is not null then
    v_identity := p_vault - array['vaultId', 'rootKeyId', 'authorityPublicKey', 'generation', 'establishedAt', 'ownerProfileId', 'organisationId'];
    if p_establish then
      if existing.owner_profile_id is not null then
        raise exception 'Private Office is already established' using errcode = '23505';
      end if;
      update public.private_office_activations set consumed_at = timezone('utc', now())
        where owner_profile_id = p_owner and organisation_id = p_org and consumed_at is null;
      if not found then raise exception 'Independent owner activation is unavailable' using errcode = '42501'; end if;
      insert into public.private_office_vaults (owner_profile_id, organisation_id, vault_id, root_key_id, authority_public_key, generation, identity)
        values (p_owner, p_org, (p_vault ->> 'vaultId')::uuid, p_vault ->> 'rootKeyId', p_vault ->> 'authorityPublicKey',
                (p_vault ->> 'generation')::bigint, v_identity);
    else
      if existing.owner_profile_id is null then raise exception 'Independent owner activation required' using errcode = '42501'; end if;
      if (p_vault ->> 'vaultId')::uuid <> existing.vault_id then
        raise exception 'Established Private Office identity cannot be replaced' using errcode = '42501';
      end if;
      update public.private_office_vaults
        set generation = (p_vault ->> 'generation')::bigint, identity = v_identity,
            root_key_id = p_vault ->> 'rootKeyId', authority_public_key = p_vault ->> 'authorityPublicKey'
        where owner_profile_id = p_owner;
    end if;
  elsif p_establish then
    raise exception 'Invalid Private Office change' using errcode = '22023';
  end if;

  if jsonb_array_length(p_records) > 0 then
    if not exists (select 1 from public.private_office_vaults where owner_profile_id = p_owner) then
      raise exception 'Private Office is not established' using errcode = '42501';
    end if;
    select count(*) into n from public.private_office_records where owner_profile_id = p_owner;
    if n + jsonb_array_length(p_records) > 10000 then raise exception 'Private Office record limit reached' using errcode = '54000'; end if;
    for rec in select value from jsonb_array_elements(p_records) loop
      n := n + 1;
      insert into public.private_office_records (owner_profile_id, item_id, ordinal, envelope)
        values (p_owner, (rec ->> 'itemId')::uuid, n, rec);
    end loop;
  end if;

  update public.private_office_security_state
    set state = p_state, revision = revision + 1, updated_at = timezone('utc', now())
    where owner_profile_id = p_owner;
  return st.revision + 1;
end $$;

revoke all on function
  public.private_office_activation_guard(), public.private_office_vault_guard(), public.private_office_record_guard(),
  public.private_office_assert_actor(uuid, uuid, uuid),
  public.private_office_load(uuid, uuid, uuid, boolean),
  public.private_office_commit(uuid, uuid, uuid, bigint, jsonb, jsonb, jsonb, boolean)
  from public, anon, authenticated, service_role;
grant execute on function
  public.private_office_load(uuid, uuid, uuid, boolean),
  public.private_office_commit(uuid, uuid, uuid, bigint, jsonb, jsonb, jsonb, boolean)
  to service_role;
