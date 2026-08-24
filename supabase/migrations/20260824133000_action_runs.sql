-- Downstream Action Engine execution records (not AI).
-- Proves: operational_event → consumer → action_run
-- Domain actions must never depend on these succeeding.

create type public.action_run_status as enum (
  'pending',
  'running',
  'succeeded',
  'failed'
);

create table public.action_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  operational_event_id uuid not null references public.operational_events (id) on delete cascade,
  action_key text not null,
  status public.action_run_status not null default 'pending',
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint action_runs_action_key_nonempty
    check (char_length(trim(action_key)) > 0)
);

comment on table public.action_runs is
  'Execution log for downstream consumers triggered by operational_events. Not an AI table.';

comment on column public.action_runs.action_key is
  'Stable consumer/action key, e.g. system.acknowledge_event.';

comment on column public.action_runs.input is
  'Compact snapshot of what the consumer received (event metadata).';

comment on column public.action_runs.result is
  'Compact consumer outcome payload.';

create index action_runs_org_created_at_idx
  on public.action_runs (organisation_id, created_at desc);

create index action_runs_event_id_idx
  on public.action_runs (operational_event_id);

create index action_runs_action_key_idx
  on public.action_runs (organisation_id, action_key);

create index action_runs_status_idx
  on public.action_runs (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.action_runs enable row level security;

create policy action_runs_select
on public.action_runs
for select
to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Authenticated inserts are restricted; consumers typically use service_role.
create policy action_runs_insert_org_member
on public.action_runs
for insert
to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- No ordinary updates/deletes (append-style execution log for v1).
-- Completions are written in a single insert with status=succeeded|failed.

grant select, insert on table public.action_runs to authenticated;
grant select, insert on table public.action_runs to service_role;

revoke update, delete, truncate on table public.action_runs from authenticated;
revoke update, delete, truncate on table public.action_runs from service_role;
revoke all on table public.action_runs from anon;
