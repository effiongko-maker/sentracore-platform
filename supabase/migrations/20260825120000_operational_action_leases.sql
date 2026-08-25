-- Operational action leases: cross-request idempotency for Sheets-backed workflows.
-- Sheets remains the entity source of truth. This table only serialises concurrent
-- first-time create/link attempts so two requests cannot both create linked records.

create table if not exists public.operational_action_leases (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  scope_key text not null,
  status text not null
    check (status in ('in_progress', 'completed', 'failed')),
  result_entity_type text,
  result_entity_id text,
  error_message text,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint operational_action_leases_scope_key_nonempty
    check (char_length(trim(scope_key)) > 0),
  constraint operational_action_leases_org_scope_unique
    unique (organisation_id, scope_key)
);

comment on table public.operational_action_leases is
  'Short-lived idempotency leases for operational create/link actions. Not an entity store — Google Sheets remains source of truth for incidents/maintenance/work orders.';

create index if not exists operational_action_leases_status_idx
  on public.operational_action_leases (status, updated_at);

alter table public.operational_action_leases enable row level security;

-- Service role / server actions use admin client; no authenticated client access needed.
revoke all on table public.operational_action_leases from anon, authenticated;
grant select, insert, update, delete on table public.operational_action_leases to service_role;
