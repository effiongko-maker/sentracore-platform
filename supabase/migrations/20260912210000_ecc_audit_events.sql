-- ECC Audit Trail — organisation-scoped accountability events.
-- Append-only historical records. Authenticated clients cannot update/delete.

create table public.ecc_audit_events (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text,
  actor_user_id uuid,
  actor_name text not null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_audit_events_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_audit_events_action_nonempty check (char_length(trim(action)) > 0),
  constraint ecc_audit_events_entity_type_nonempty check (char_length(trim(entity_type)) > 0),
  constraint ecc_audit_events_entity_id_nonempty check (char_length(trim(entity_id)) > 0),
  constraint ecc_audit_events_description_nonempty check (char_length(trim(description)) > 0),
  constraint ecc_audit_events_actor_name_nonempty check (char_length(trim(actor_name)) > 0),
  constraint ecc_audit_events_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_audit_events_org_created_idx
  on public.ecc_audit_events (organisation_id, created_at desc);

create index ecc_audit_events_org_entity_idx
  on public.ecc_audit_events (organisation_id, entity_type, entity_id, created_at desc);

create index ecc_audit_events_org_centre_idx
  on public.ecc_audit_events (organisation_id, centre_id, created_at desc)
  where centre_id is not null;

create index ecc_audit_events_org_action_idx
  on public.ecc_audit_events (organisation_id, action, created_at desc);

create or replace function public.ecc_audit_events_reject_mutate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ecc_audit_events is append-only';
end;
$$;

create trigger ecc_audit_events_no_update
before update on public.ecc_audit_events
for each row execute function public.ecc_audit_events_reject_mutate();

create trigger ecc_audit_events_no_delete
before delete on public.ecc_audit_events
for each row execute function public.ecc_audit_events_reject_mutate();

comment on table public.ecc_audit_events is
  'ECC Operations accountability trail. Append-only; who/what/when for centre operations.';

alter table public.ecc_audit_events enable row level security;

create policy ecc_audit_events_select on public.ecc_audit_events
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_audit_events_insert on public.ecc_audit_events
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Immutable: no update/delete grants for authenticated.
grant select, insert on public.ecc_audit_events to authenticated;
grant all on public.ecc_audit_events to service_role;
