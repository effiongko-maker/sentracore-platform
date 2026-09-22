-- Rename the Batcave capability to its canonical production key under the executive namespace:
--   platform.batcave.access -> platform.executive.private_office.access
--
-- Minimum-safe, forward-only migration: existing grants are MOVED (not dropped and recreated),
-- IAM integrity (format constraint + the allowed-capability function) stays enforced throughout, and
-- batcave_note_actor_ok — the function gating the private-notes RLS policies — is updated to check the
-- new key so existing grantees are not silently locked out once their grant row moves. No table, policy,
-- trigger, index or function is renamed; this migration only touches the capability STRING value.

-- Step 1: widen the format check to accept BOTH the old and new key, so the UPDATE below is never rejected.
alter table public.platform_capability_grants
  drop constraint if exists platform_capability_grants_capability_format;
alter table public.platform_capability_grants
  add constraint platform_capability_grants_capability_format
  check (
    capability ~ '^platform\.(command_centre|ecc_operations)(\.[a-z0-9_]+)+$'
    or capability = 'platform.batcave.access'
    or capability = 'platform.executive.private_office.access'
    or capability in (
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
    )
  );

-- Step 2: move any existing grant rows to the new key. Idempotent — a second run affects 0 rows.
update public.platform_capability_grants
  set capability = 'platform.executive.private_office.access'
  where capability = 'platform.batcave.access';

-- Step 3: narrow the format check to the final state — the old key is no longer valid for new writes.
alter table public.platform_capability_grants
  drop constraint platform_capability_grants_capability_format;
alter table public.platform_capability_grants
  add constraint platform_capability_grants_capability_format
  check (
    capability ~ '^platform\.(command_centre|ecc_operations)(\.[a-z0-9_]+)+$'
    or capability = 'platform.executive.private_office.access'
    or capability in (
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
    )
  );

-- Step 4: the runtime allowlist used by the grant/revoke RPCs (platform_iam_grant_platform_capability /
-- platform_iam_revoke_platform_capability). Additive replace — every other entry is unchanged.
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
    'platform.executive.private_office.access',
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

-- Step 5: the private-notes RLS gate (table public.batcave_notes and its policies/trigger keep their
-- existing names — only this function body's capability string is updated). Without this step, an
-- existing grantee's row would move to the new key at Step 2 but this function would still check for the
-- old key, silently denying their own notes.
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
    and public.has_platform_capability(p_organisation_id, 'platform.executive.private_office.access');
$$;

revoke all on function public.batcave_note_actor_ok(uuid) from public;
revoke all on function public.batcave_note_actor_ok(uuid) from anon;
grant execute on function public.batcave_note_actor_ok(uuid) to authenticated;
