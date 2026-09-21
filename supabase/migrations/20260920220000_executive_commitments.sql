-- Executive Commitments V1 — obligations and delegated follow-ups an authorised executive
-- explicitly tracks. Deliberately SMALL: current-state table + append-only history.
--   * identities are canonical platform profiles (never names / ECC people / emails)
--   * created_by (who placed it in the register) is distinct from assignee (who owns the action)
--   * lifecycle: open -> completed | cancelled (no hard delete, no reopen)
--   * due_date is a DATE in the organisation's calendar; overdue is DERIVED, never stored
--   * assignment grants NO authority: commitments.view / .manage are explicit platform capabilities
--   * all mutation goes through the RPCs below (mutation + audit event in one transaction)
-- Organisational obligation register — NOT Batcave-private.

create table public.executive_commitments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  title text not null,
  description text,
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  assignee_profile_id uuid not null references public.profiles (id) on delete restrict,
  due_date date,
  status text not null default 'open',
  completed_at timestamptz,
  completed_by_profile_id uuid references public.profiles (id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by_profile_id uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint executive_commitments_title_valid
    check (char_length(trim(title)) > 0 and char_length(title) <= 200),
  constraint executive_commitments_description_valid
    check (description is null or (char_length(trim(description)) > 0 and char_length(description) <= 2000)),
  constraint executive_commitments_status_valid
    check (status in ('open', 'completed', 'cancelled')),
  constraint executive_commitments_lifecycle_consistent
    check (
      (status = 'open' and completed_at is null and completed_by_profile_id is null
        and cancelled_at is null and cancelled_by_profile_id is null)
      or (status = 'completed' and completed_at is not null and completed_by_profile_id is not null
        and cancelled_at is null and cancelled_by_profile_id is null)
      or (status = 'cancelled' and cancelled_at is not null and cancelled_by_profile_id is not null
        and completed_at is null and completed_by_profile_id is null)
    )
);

create index executive_commitments_org_status_due_idx
  on public.executive_commitments (organisation_id, status, due_date);
create index executive_commitments_assignee_idx
  on public.executive_commitments (organisation_id, assignee_profile_id, status);
create index executive_commitments_creator_idx
  on public.executive_commitments (organisation_id, created_by_profile_id, status);

comment on table public.executive_commitments is
  'Executive Commitments register (current state). Assignment is data ownership, never IAM authority. Overdue is derived from due_date in the organisation calendar.';

create table public.executive_commitment_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  commitment_id uuid not null references public.executive_commitments (id) on delete restrict,
  event_type text not null,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint executive_commitment_events_type_valid
    check (event_type in ('created', 'edited', 'completed', 'cancelled'))
);

create index executive_commitment_events_commitment_idx
  on public.executive_commitment_events (commitment_id, created_at);

create or replace function public.executive_commitment_events_reject_mutate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'executive_commitment_events is append-only';
end;
$$;

create trigger executive_commitment_events_append_only
before update or delete on public.executive_commitment_events
for each row execute function public.executive_commitment_events_reject_mutate();

-- Defence in depth: creator and assignee must belong to the commitment's organisation.
create or replace function public.executive_commitments_validate_parties()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.created_by_profile_id and p.organisation_id = new.organisation_id) then
    raise exception 'executive_commitments: creator is not a member of the organisation' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.assignee_profile_id and p.organisation_id = new.organisation_id) then
    raise exception 'executive_commitments: assignee is not a member of the organisation' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger executive_commitments_validate_parties
before insert or update of organisation_id, created_by_profile_id, assignee_profile_id on public.executive_commitments
for each row execute function public.executive_commitments_validate_parties();

-- ---------------------------------------------------------------------------
-- RLS + privileges: reads only, and only with the explicit capability; no direct writes for anyone.
-- ---------------------------------------------------------------------------

alter table public.executive_commitments enable row level security;
alter table public.executive_commitment_events enable row level security;

create policy executive_commitments_select on public.executive_commitments
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_platform_capability(organisation_id, 'platform.command_centre.commitments.view')
  and (created_by_profile_id = auth.uid() or assignee_profile_id = auth.uid())
);

create policy executive_commitment_events_select on public.executive_commitment_events
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_platform_capability(organisation_id, 'platform.command_centre.commitments.view')
  and exists (
    select 1 from public.executive_commitments c
    where c.id = commitment_id
      and (c.created_by_profile_id = auth.uid() or c.assignee_profile_id = auth.uid())
  )
);

revoke all on table public.executive_commitments from anon, authenticated, service_role;
revoke all on table public.executive_commitment_events from anon, authenticated, service_role;
grant select on table public.executive_commitments to authenticated, service_role;
grant select on table public.executive_commitment_events to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Capabilities: explicit, administrable through the existing IAM control plane.
-- ---------------------------------------------------------------------------

create or replace function public.platform_iam_is_allowed_platform_capability(
  p_capability text
)
returns boolean
language sql
immutable
as $$
  select p_capability in (
    'platform.ecc_operations.view',
    'platform.ecc_operations.create',
    'platform.ecc_operations.edit',
    'platform.ecc_operations.manage_people',
    'platform.ecc_operations.manage_finance',
    'platform.ecc_operations.delete',
    'platform.command_centre.view',
    'platform.command_centre.decide',
    'platform.command_centre.commitments.view',
    'platform.command_centre.commitments.manage',
    'ops.view',
    'ops.create',
    'ops.edit',
    'ops.submit',
    'users.view',
    'users.manage',
    'requests.view',
    'finance.view',
    'finance.create',
    'finance.submit',
    'finance.authorize',
    'finance.pay',
    'approvals.manage',
    'fm.authorize_protected'
  );
$$;

revoke all on function public.platform_iam_is_allowed_platform_capability(text) from public;
revoke all on function public.platform_iam_is_allowed_platform_capability(text) from anon, authenticated;
grant execute on function public.platform_iam_is_allowed_platform_capability(text) to service_role;

-- ---------------------------------------------------------------------------
-- Mutation RPCs (service-role only; the server layer authorises the capability first).
-- Each validates identities and writes the mutation + its audit event atomically.
-- ---------------------------------------------------------------------------

create or replace function public.executive_commitment_assert_active_member(
  p_profile_id uuid,
  p_organisation_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.organisation_id = p_organisation_id
      and p.status = 'active'
  ) then
    raise exception 'executive_commitments: % must be an active member of the organisation', p_role
      using errcode = case when p_role = 'actor' then '42501' else '22023' end;
  end if;
end;
$$;

create or replace function public.executive_commitment_create(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_title text,
  p_description text,
  p_assignee_profile_id uuid,
  p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
  v_row public.executive_commitments%rowtype;
begin
  perform public.executive_commitment_assert_active_member(p_actor_profile_id, p_organisation_id, 'actor');
  perform public.executive_commitment_assert_active_member(p_assignee_profile_id, p_organisation_id, 'assignee');
  if v_title is null then
    raise exception 'executive_commitments: a title is required' using errcode = '22023';
  end if;

  insert into public.executive_commitments (
    organisation_id, title, description, created_by_profile_id, assignee_profile_id, due_date
  ) values (
    p_organisation_id, v_title, v_desc, p_actor_profile_id, p_assignee_profile_id, p_due_date
  ) returning * into v_row;

  insert into public.executive_commitment_events (organisation_id, commitment_id, event_type, actor_profile_id, details)
  values (
    p_organisation_id, v_row.id, 'created', p_actor_profile_id,
    jsonb_build_object('title', v_row.title, 'assigneeProfileId', v_row.assignee_profile_id, 'dueDate', v_row.due_date)
  );

  return jsonb_build_object('commitment', to_jsonb(v_row), 'changed', true);
end;
$$;

create or replace function public.executive_commitment_update(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_commitment_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.executive_commitments%rowtype;
  v_title text;
  v_desc text;
  v_assignee uuid;
  v_due date;
  v_diff jsonb := '{}'::jsonb;
begin
  perform public.executive_commitment_assert_active_member(p_actor_profile_id, p_organisation_id, 'actor');
  select * into v_row from public.executive_commitments
   where id = p_commitment_id and organisation_id = p_organisation_id for update;
  if not found then
    raise exception 'executive_commitments: commitment not found' using errcode = 'P0002';
  end if;
  if v_row.created_by_profile_id <> p_actor_profile_id and v_row.assignee_profile_id <> p_actor_profile_id then
    raise exception 'executive_commitments: only the creator or assignee may change a commitment' using errcode = '42501';
  end if;
  if v_row.status <> 'open' then
    raise exception 'executive_commitments: only an open commitment can be edited' using errcode = '22023';
  end if;

  v_title := v_row.title; v_desc := v_row.description; v_assignee := v_row.assignee_profile_id; v_due := v_row.due_date;

  if p_changes ? 'title' then
    v_title := nullif(trim(coalesce(p_changes->>'title', '')), '');
    if v_title is null then
      raise exception 'executive_commitments: a title is required' using errcode = '22023';
    end if;
  end if;
  if p_changes ? 'description' then
    v_desc := nullif(trim(coalesce(p_changes->>'description', '')), '');
  end if;
  if p_changes ? 'assigneeProfileId' then
    v_assignee := (p_changes->>'assigneeProfileId')::uuid;
    perform public.executive_commitment_assert_active_member(v_assignee, p_organisation_id, 'assignee');
  end if;
  if p_changes ? 'dueDate' then
    v_due := (p_changes->>'dueDate')::date;
  end if;

  if v_title is distinct from v_row.title then v_diff := v_diff || jsonb_build_object('title', jsonb_build_object('from', v_row.title, 'to', v_title)); end if;
  if v_desc is distinct from v_row.description then v_diff := v_diff || jsonb_build_object('description', jsonb_build_object('changed', true)); end if;
  if v_assignee is distinct from v_row.assignee_profile_id then v_diff := v_diff || jsonb_build_object('assigneeProfileId', jsonb_build_object('from', v_row.assignee_profile_id, 'to', v_assignee)); end if;
  if v_due is distinct from v_row.due_date then v_diff := v_diff || jsonb_build_object('dueDate', jsonb_build_object('from', v_row.due_date, 'to', v_due)); end if;

  if v_diff = '{}'::jsonb then
    return jsonb_build_object('commitment', to_jsonb(v_row), 'changed', false);
  end if;

  update public.executive_commitments
     set title = v_title, description = v_desc, assignee_profile_id = v_assignee, due_date = v_due,
         updated_at = timezone('utc', now())
   where id = p_commitment_id
   returning * into v_row;

  insert into public.executive_commitment_events (organisation_id, commitment_id, event_type, actor_profile_id, details)
  values (p_organisation_id, p_commitment_id, 'edited', p_actor_profile_id, jsonb_build_object('changes', v_diff));

  return jsonb_build_object('commitment', to_jsonb(v_row), 'changed', true);
end;
$$;

create or replace function public.executive_commitment_close(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_commitment_id uuid,
  p_outcome text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.executive_commitments%rowtype;
begin
  if p_outcome not in ('completed', 'cancelled') then
    raise exception 'executive_commitments: outcome must be completed or cancelled' using errcode = '22023';
  end if;
  perform public.executive_commitment_assert_active_member(p_actor_profile_id, p_organisation_id, 'actor');
  select * into v_row from public.executive_commitments
   where id = p_commitment_id and organisation_id = p_organisation_id for update;
  if not found then
    raise exception 'executive_commitments: commitment not found' using errcode = 'P0002';
  end if;
  if v_row.created_by_profile_id <> p_actor_profile_id and v_row.assignee_profile_id <> p_actor_profile_id then
    raise exception 'executive_commitments: only the creator or assignee may change a commitment' using errcode = '42501';
  end if;
  if v_row.status <> 'open' then
    raise exception 'executive_commitments: commitment is already %', v_row.status using errcode = '22023';
  end if;

  if p_outcome = 'completed' then
    update public.executive_commitments
       set status = 'completed', completed_at = timezone('utc', now()), completed_by_profile_id = p_actor_profile_id,
           updated_at = timezone('utc', now())
     where id = p_commitment_id returning * into v_row;
  else
    update public.executive_commitments
       set status = 'cancelled', cancelled_at = timezone('utc', now()), cancelled_by_profile_id = p_actor_profile_id,
           updated_at = timezone('utc', now())
     where id = p_commitment_id returning * into v_row;
  end if;

  insert into public.executive_commitment_events (organisation_id, commitment_id, event_type, actor_profile_id, details)
  values (p_organisation_id, p_commitment_id, p_outcome, p_actor_profile_id, jsonb_build_object('title', v_row.title));

  return jsonb_build_object('commitment', to_jsonb(v_row), 'changed', true);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'executive_commitment_assert_active_member(uuid, uuid, text)',
    'executive_commitment_create(uuid, uuid, text, text, uuid, date)',
    'executive_commitment_update(uuid, uuid, uuid, jsonb)',
    'executive_commitment_close(uuid, uuid, uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
