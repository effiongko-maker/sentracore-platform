-- Action Engine v1.5: human recommendation decisions (append-only history).
-- Current org decision = latest row by created_at for
-- (organisation_id, recommendation_action_run_id, recommendation_id).

create type public.recommendation_decision_value as enum (
  'accepted',
  'dismissed',
  'deferred'
);

create table public.recommendation_decisions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  operational_event_id uuid not null references public.operational_events (id) on delete cascade,
  recommendation_action_run_id uuid not null references public.action_runs (id) on delete cascade,
  recommendation_id text not null,
  decision public.recommendation_decision_value not null,
  reason text,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint recommendation_decisions_recommendation_id_nonempty
    check (char_length(trim(recommendation_id)) > 0),
  constraint recommendation_decisions_reason_nonempty_when_set
    check (reason is null or char_length(trim(reason)) > 0)
);

comment on table public.recommendation_decisions is
  'Append-only human decisions on Action Engine recommendations. Current state = latest created_at per org + action_run + recommendation_id.';

comment on column public.recommendation_decisions.recommendation_id is
  'Stable DecisionReadyRecommendation.id (ActionRecommendation.key) from the referenced action_run.result.';

comment on column public.recommendation_decisions.recommendation_action_run_id is
  'action_runs row for facility.generate_incident_recommendations (or equivalent).';

-- Current-decision lookup
create index recommendation_decisions_current_idx
  on public.recommendation_decisions (
    organisation_id,
    recommendation_action_run_id,
    recommendation_id,
    created_at desc
  );

create index recommendation_decisions_event_idx
  on public.recommendation_decisions (operational_event_id, created_at desc);

create index recommendation_decisions_actor_idx
  on public.recommendation_decisions (actor_profile_id, created_at desc);

-- Integrity: action_run must belong to the same org + operational event
create or replace function public.recommendation_decisions_enforce_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  run_org uuid;
  run_event uuid;
  run_key text;
begin
  select organisation_id, operational_event_id, action_key
    into run_org, run_event, run_key
  from public.action_runs
  where id = new.recommendation_action_run_id;

  if run_org is null then
    raise exception 'recommendation_action_run_id not found';
  end if;

  if run_org is distinct from new.organisation_id then
    raise exception 'recommendation decision organisation_id must match action_runs.organisation_id';
  end if;

  if run_event is distinct from new.operational_event_id then
    raise exception 'recommendation decision operational_event_id must match action_runs.operational_event_id';
  end if;

  if run_key is distinct from 'facility.generate_incident_recommendations' then
    raise exception 'recommendation_action_run_id must reference facility.generate_incident_recommendations';
  end if;

  return new;
end;
$$;

create trigger recommendation_decisions_enforce_refs
before insert on public.recommendation_decisions
for each row execute function public.recommendation_decisions_enforce_refs();

-- Force actor to auth.uid() for authenticated inserts (never trust client).
create or replace function public.recommendation_decisions_enforce_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.actor_profile_id := auth.uid();
  end if;

  if new.actor_profile_id is null then
    raise exception 'actor_profile_id is required';
  end if;

  return new;
end;
$$;

create trigger recommendation_decisions_enforce_actor
before insert on public.recommendation_decisions
for each row execute function public.recommendation_decisions_enforce_actor();

-- Append-only: block update/delete
create or replace function public.recommendation_decisions_prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'recommendation_decisions are append-only; create a new decision row instead';
end;
$$;

create trigger recommendation_decisions_prevent_update
before update on public.recommendation_decisions
for each row execute function public.recommendation_decisions_prevent_mutation();

create trigger recommendation_decisions_prevent_delete
before delete on public.recommendation_decisions
for each row execute function public.recommendation_decisions_prevent_mutation();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.recommendation_decisions enable row level security;

create policy recommendation_decisions_select
on public.recommendation_decisions
for select
to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy recommendation_decisions_insert
on public.recommendation_decisions
for insert
to authenticated
with check (
  (public.is_platform_super_admin() or public.is_org_member(organisation_id))
  and actor_profile_id = auth.uid()
);

grant select, insert on table public.recommendation_decisions to authenticated;
grant select, insert on table public.recommendation_decisions to service_role;

revoke update, delete, truncate on table public.recommendation_decisions from authenticated;
revoke update, delete, truncate on table public.recommendation_decisions from service_role;
revoke all on table public.recommendation_decisions from anon;
