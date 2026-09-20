-- ECC V1 stakeholder readiness:
--   1. Administrable ECC capability model (view / create / edit / manage_people / manage_finance / delete).
--   2. Close direct authenticated (JWT) writes to ECC tables — every ECC mutation is server-mediated with
--      per-action authority. platform.ecc_operations.view alone must never write.
--   3. Canonical actor identity: authenticated profile UUID stamped on new ECC operational records/history.
-- No data is modified or deleted. Historical typed names stay as they are.

-- ---------------------------------------------------------------------------
-- 1. Allowed administrable capabilities
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
-- 2. Close direct JWT writes on ecc_* tables (reads via has_ecc_operations_access are preserved)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename like 'ecc\_%' escape '\'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'ecc\_%' escape '\'
  loop
    execute format('revoke insert, update, delete, truncate on table public.%I from authenticated, anon', r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Canonical actor identity (nullable: historical rows stay unattributed by profile)
-- ---------------------------------------------------------------------------

alter table public.ecc_daily_ops
  add column if not exists recorded_by_profile_id uuid references public.profiles (id) on delete set null;

alter table public.ecc_issues
  add column if not exists reporter_profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists closed_by_profile_id uuid references public.profiles (id) on delete set null;

alter table public.ecc_issue_history
  add column if not exists by_profile_id uuid references public.profiles (id) on delete set null;

alter table public.ecc_requests
  add column if not exists requesting_profile_id uuid references public.profiles (id) on delete set null,
  add column if not exists closed_by_profile_id uuid references public.profiles (id) on delete set null;

alter table public.ecc_request_history
  add column if not exists by_profile_id uuid references public.profiles (id) on delete set null;

comment on column public.ecc_daily_ops.recorded_by_profile_id is
  'Authenticated platform profile that recorded this snapshot (server-stamped). NULL for pre-2026-09-20 rows; recorded_by_name is then a historical typed name.';
comment on column public.ecc_issues.reporter_profile_id is
  'Authenticated platform profile that raised the issue (server-stamped).';
comment on column public.ecc_requests.requesting_profile_id is
  'Authenticated platform profile that raised the request (server-stamped).';
