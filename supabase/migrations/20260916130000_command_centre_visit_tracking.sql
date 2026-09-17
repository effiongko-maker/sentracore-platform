-- Per-user Command Centre visit marker for truthful "Since Your Last Visit".
-- This is navigation state only; domain audit/event tables remain the sources
-- of truth for what changed.

create table if not exists public.command_centre_visits (
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_visited_at timestamptz not null default now(),
  primary key (organisation_id, profile_id)
);

alter table public.command_centre_visits enable row level security;

drop policy if exists command_centre_visits_select_own on public.command_centre_visits;
create policy command_centre_visits_select_own
on public.command_centre_visits for select to authenticated
using (
  profile_id = auth.uid()
  and public.has_platform_capability(
    organisation_id,
    'platform.command_centre.view'
  )
);

drop policy if exists command_centre_visits_insert_own on public.command_centre_visits;
create policy command_centre_visits_insert_own
on public.command_centre_visits for insert to authenticated
with check (
  profile_id = auth.uid()
  and public.has_platform_capability(
    organisation_id,
    'platform.command_centre.view'
  )
);

drop policy if exists command_centre_visits_update_own on public.command_centre_visits;
create policy command_centre_visits_update_own
on public.command_centre_visits for update to authenticated
using (
  profile_id = auth.uid()
  and public.has_platform_capability(
    organisation_id,
    'platform.command_centre.view'
  )
)
with check (
  profile_id = auth.uid()
  and public.has_platform_capability(
    organisation_id,
    'platform.command_centre.view'
  )
);

grant select, insert, update on public.command_centre_visits to authenticated;
grant select, insert, update on public.command_centre_visits to service_role;
revoke delete, truncate on public.command_centre_visits from authenticated, service_role;

comment on table public.command_centre_visits is
  'Per-user Command Centre visit marker. Organisational changes are derived from authoritative domain event and audit tables.';
