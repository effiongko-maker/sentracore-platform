-- Batcave foundation — IAM support ONLY. Batcave is a private executive domain; V1 has no
-- business tables and no business data. The single entry authority is an explicit platform
-- capability, independent of Command Centre / Commitments / Finance / FM / ECC authority and of
-- Super Admin. Administering the grant (Super Admin control plane) does NOT confer entry.

alter table public.platform_capability_grants
  drop constraint if exists platform_capability_grants_capability_format;

alter table public.platform_capability_grants
  add constraint platform_capability_grants_capability_format
  check (
    capability ~ '^platform\.(command_centre|ecc_operations)(\.[a-z0-9_]+)+$'
    or capability = 'platform.batcave.access'
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
    'platform.batcave.access',
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
