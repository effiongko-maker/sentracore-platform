-- Batcave Private Executive Notes V1 — the first Batcave business capability.
--
-- PRIVACY MODEL (enforced by the database, not by application filtering):
--   * a note belongs to exactly ONE profile (owner) in ONE organisation
--   * entry authority (platform.batcave.access) is NOT read authority over other people's notes:
--     the row policies below require owner_profile_id = auth.uid()
--   * there is NO service-role, admin or Super Admin path: all privileges are revoked from
--     service_role and anon, and no policy mentions Super Admin. Runtime access is only through
--     the signed-in user's own session (RLS applies).
--   * ownership and organisation are immutable after creation
--   * no audit/event stream receives note content (or note activity) — see application notes
-- Not encrypted at the field level: content is protected by database/storage controls and the
-- privileges above; a database superuser/operator could technically read rows.

create table public.batcave_notes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint batcave_notes_title_valid
    check (char_length(trim(title)) > 0 and char_length(title) <= 200),
  constraint batcave_notes_body_valid
    check (char_length(body) <= 20000)
);

create index batcave_notes_owner_updated_idx
  on public.batcave_notes (organisation_id, owner_profile_id, updated_at desc);

comment on table public.batcave_notes is
  'Private executive notes. Owner-only via RLS; no service-role or administrative access. Content must never be copied to audit, event, intelligence or reporting streams.';

create or replace function public.batcave_notes_protect_identity()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
     or new.organisation_id is distinct from old.organisation_id
     or new.owner_profile_id is distinct from old.owner_profile_id
     or new.created_at is distinct from old.created_at then
    raise exception 'batcave_notes: owner, organisation and identity are immutable' using errcode = '42501';
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger batcave_notes_protect_identity
before update on public.batcave_notes
for each row execute function public.batcave_notes_protect_identity();

-- The acting session must be an active platform-scope member of the note's organisation, with
-- Command Centre entry AND the explicit Batcave grant. Super Admin status is deliberately not
-- consulted anywhere.
create or replace function public.batcave_note_actor_ok(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.organisation_id = p_organisation_id
        and p.status = 'active'
        and p.access_scope = 'platform'
    )
    and public.has_platform_capability(p_organisation_id, 'platform.command_centre.view')
    and public.has_platform_capability(p_organisation_id, 'platform.batcave.access');
$$;

revoke all on function public.batcave_note_actor_ok(uuid) from public;
revoke all on function public.batcave_note_actor_ok(uuid) from anon;
grant execute on function public.batcave_note_actor_ok(uuid) to authenticated;

alter table public.batcave_notes enable row level security;

create policy batcave_notes_select_own on public.batcave_notes
for select to authenticated
using (owner_profile_id = auth.uid() and public.batcave_note_actor_ok(organisation_id));

create policy batcave_notes_insert_own on public.batcave_notes
for insert to authenticated
with check (owner_profile_id = auth.uid() and public.batcave_note_actor_ok(organisation_id));

create policy batcave_notes_update_own on public.batcave_notes
for update to authenticated
using (owner_profile_id = auth.uid() and public.batcave_note_actor_ok(organisation_id))
with check (owner_profile_id = auth.uid() and public.batcave_note_actor_ok(organisation_id));

create policy batcave_notes_delete_own on public.batcave_notes
for delete to authenticated
using (owner_profile_id = auth.uid() and public.batcave_note_actor_ok(organisation_id));

-- Privileges: only the signed-in user's session. service_role and anon get nothing.
revoke all on table public.batcave_notes from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.batcave_notes to authenticated;
