-- Shared Operational Event infrastructure (append-only history).
-- Events are NOT primary business records; module tables own the domain data.
--
-- event_type convention (TEXT, not a lookup table yet):
--   <domain>.<past_tense_action>
-- Examples:
--   facility.maintenance_requested
--   facility.work_order_completed
--   ecc.call_received
--   construction.milestone_completed
--   projects.event_started

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.operational_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  module_id uuid not null references public.modules (id) on delete restrict,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  occurred_at timestamptz not null default timezone('utc', now()),
  data jsonb not null default '{}'::jsonb,
  source text not null default 'system',
  created_at timestamptz not null default timezone('utc', now()),
  constraint operational_events_event_type_nonempty
    check (char_length(trim(event_type)) > 0),
  constraint operational_events_source_allowed
    check (source in ('user', 'system', 'automation', 'integration', 'ai')),
  constraint operational_events_entity_pair
    check (
      (entity_type is null and entity_id is null)
      or (entity_type is not null and entity_id is not null)
    ),
  constraint operational_events_entity_type_nonempty
    check (
      entity_type is null
      or char_length(trim(entity_type)) > 0
    )
);

comment on table public.operational_events is
  'Append-only operational history. Records that something happened; module tables own primary business records.';

comment on column public.operational_events.event_type is
  'Namespaced past-tense type, e.g. facility.maintenance_requested (domain.action).';

comment on column public.operational_events.entity_type is
  'Polymorphic origin type (no FK). Pair with entity_id; both null or both set.';

comment on column public.operational_events.entity_id is
  'Polymorphic origin id (no FK to module tables).';

comment on column public.operational_events.data is
  'Contextual metadata only — never the primary business record.';

comment on column public.operational_events.source is
  'Provenance: user | system | automation | integration | ai.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index operational_events_org_occurred_at_idx
  on public.operational_events (organisation_id, occurred_at desc);

create index operational_events_org_module_occurred_at_idx
  on public.operational_events (organisation_id, module_id, occurred_at desc);

create index operational_events_entity_idx
  on public.operational_events (entity_type, entity_id)
  where entity_type is not null and entity_id is not null;

create index operational_events_actor_occurred_at_idx
  on public.operational_events (actor_profile_id, occurred_at desc)
  where actor_profile_id is not null;

create index operational_events_department_occurred_at_idx
  on public.operational_events (department_id, occurred_at desc)
  where department_id is not null;

create index operational_events_event_type_idx
  on public.operational_events (organisation_id, event_type);

-- ---------------------------------------------------------------------------
-- Integrity: department must belong to the event organisation
-- ---------------------------------------------------------------------------

create or replace function public.validate_operational_event_department()
returns trigger
language plpgsql
as $$
declare
  dept_org uuid;
begin
  if new.department_id is null then
    return new;
  end if;

  select organisation_id into dept_org
  from public.departments
  where id = new.department_id;

  if dept_org is null then
    raise exception 'department_id % not found', new.department_id
      using errcode = '23503';
  end if;

  if dept_org <> new.organisation_id then
    raise exception 'department_id does not belong to organisation_id'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger operational_events_validate_department
before insert on public.operational_events
for each row
execute function public.validate_operational_event_department();

-- ---------------------------------------------------------------------------
-- Actor identity: authenticated inserts cannot spoof actor_profile_id
-- ---------------------------------------------------------------------------

create or replace function public.enforce_operational_event_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.role(), '');
begin
  -- Service role / trusted server paths may set actor explicitly (including null).
  if jwt_role = 'service_role' then
    return new;
  end if;

  -- Authenticated callers: actor is always the signed-in profile.
  if jwt_role = 'authenticated' then
    if auth.uid() is null then
      raise exception 'Authenticated event insert requires auth.uid()'
        using errcode = '42501';
    end if;
    new.actor_profile_id := auth.uid();
    -- User-initiated writes default to source=user unless already a allowed non-system label.
    if new.source is null or new.source = 'system' then
      new.source := 'user';
    end if;
  end if;

  return new;
end;
$$;

create trigger operational_events_enforce_actor
before insert on public.operational_events
for each row
execute function public.enforce_operational_event_actor();

comment on function public.enforce_operational_event_actor() is
  'Forces actor_profile_id = auth.uid() for authenticated inserts; service_role may set actor freely.';

-- ---------------------------------------------------------------------------
-- Append-only: block UPDATE and DELETE for all roles
-- ---------------------------------------------------------------------------

create or replace function public.prevent_operational_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'operational_events are append-only; corrections must be new events'
    using errcode = '42501';
end;
$$;

create trigger operational_events_prevent_update
before update on public.operational_events
for each row
execute function public.prevent_operational_event_mutation();

create trigger operational_events_prevent_delete
before delete on public.operational_events
for each row
execute function public.prevent_operational_event_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.operational_events enable row level security;

-- READ: platform super admin (all) OR org member for org-wide events
-- OR org member with department access for department-scoped events.
create policy operational_events_select
on public.operational_events
for select
to authenticated
using (
  public.is_platform_super_admin()
  or (
    public.is_org_member(organisation_id)
    and (
      department_id is null
      or public.can_access_department(department_id)
    )
  )
);

-- INSERT: must belong to the organisation; department must be accessible when set.
-- Actor spoofing is blocked by enforce_operational_event_actor().
create policy operational_events_insert
on public.operational_events
for insert
to authenticated
with check (
  public.is_org_member(organisation_id)
  and (
    department_id is null
    or public.can_access_department(department_id)
  )
);

-- No UPDATE / DELETE policies for authenticated → denied under RLS.
-- Triggers additionally block mutation for all roles (including service_role).

-- ---------------------------------------------------------------------------
-- Grants (append-only surface for authenticated)
-- ---------------------------------------------------------------------------

grant select, insert on table public.operational_events to authenticated;
grant select, insert on table public.operational_events to service_role;

-- Counteract default privileges from core RLS migration (which grant update/delete).
revoke update, delete on table public.operational_events from authenticated;
revoke update, delete on table public.operational_events from service_role;
revoke all on table public.operational_events from anon;
