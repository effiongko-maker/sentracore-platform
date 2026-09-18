-- FM Phase 2A — facility assignments + FM capabilities on existing platform IAM.
-- Does NOT seed people, assignments, or USR-* rows.
-- Does NOT create fm_people / fm_users.
-- Profile remains actor identity. Assignment is operating context only.

-- ---------------------------------------------------------------------------
-- Tenant-integrity helper so assignments can FK (organisation_id, profile_id)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_org_id_unique'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_org_id_unique unique (organisation_id, id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- FM facility assignments
-- ---------------------------------------------------------------------------

create table public.fm_facility_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  profile_id uuid not null,
  facility_id uuid not null,
  operational_role text not null,
  status text not null default 'active',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_facility_assignments_org_id_unique unique (organisation_id, id),
  constraint fm_facility_assignments_role_check
    check (
      operational_role in (
        'facility_manager',
        'fm_staff',
        'liaison_officer',
        'finance',
        'ncc_client',
        'executive'
      )
    ),
  constraint fm_facility_assignments_status_check
    check (status in ('active', 'inactive')),
  constraint fm_facility_assignments_profile_fk
    foreign key (organisation_id, profile_id)
    references public.profiles (organisation_id, id)
    on delete cascade,
  constraint fm_facility_assignments_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id)
    on delete cascade
);

create unique index fm_facility_assignments_active_uidx
  on public.fm_facility_assignments (organisation_id, profile_id, facility_id)
  where status = 'active';

create index fm_facility_assignments_profile_idx
  on public.fm_facility_assignments (organisation_id, profile_id);

create index fm_facility_assignments_facility_idx
  on public.fm_facility_assignments (organisation_id, facility_id);

create trigger fm_facility_assignments_set_updated_at
before update on public.fm_facility_assignments
for each row execute function public.set_updated_at();

comment on table public.fm_facility_assignments is
  'FM operating assignment of a platform profile to a facility. Not login identity. operational_role is descriptive context and does not grant capabilities.';

comment on column public.fm_facility_assignments.operational_role is
  'V1 operating-context vocabulary. Authorization is platform_capability_grants, not this column.';

alter table public.fm_facility_assignments enable row level security;

revoke all on table public.fm_facility_assignments from public, anon, authenticated;
grant all on table public.fm_facility_assignments to service_role;

-- ---------------------------------------------------------------------------
-- Allow existing FM AccessCapability strings on platform_capability_grants.
-- Does not invent new capability names. Finance company/restricted-FA unchanged.
-- ---------------------------------------------------------------------------

alter table public.platform_capability_grants
  drop constraint if exists platform_capability_grants_capability_format;

alter table public.platform_capability_grants
  add constraint platform_capability_grants_capability_format
  check (
    capability ~ '^platform\.(command_centre|ecc_operations)(\.[a-z0-9_]+)+$'
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

comment on table public.platform_capability_grants is
  'Explicit platform-scoped grants (Command Centre, ECC Operations, FM AccessCapability). Never derived from Super Admin or job title. Organisation module enablement is separate.';

create or replace function public.platform_iam_is_allowed_platform_capability(
  p_capability text
)
returns boolean
language sql
immutable
as $$
  select p_capability in (
    'platform.ecc_operations.view',
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
-- Offboarding also ends FM assignments. Does not write Apps Script USERS.
-- ---------------------------------------------------------------------------

create or replace function public.platform_iam_offboard_profile(
  p_actor_profile_id uuid,
  p_target_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_finance_caps int := 0;
  v_platform_caps int := 0;
  v_company_access int := 0;
  v_fa_access int := 0;
  v_links int := 0;
  v_assignments int := 0;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  if p_target_profile_id = p_actor_profile_id then
    raise exception 'platform_iam: cannot offboard the acting Super Admin' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles
  where id = p_target_profile_id;

  if not found then
    raise exception 'platform_iam: target profile not found' using errcode = 'P0002';
  end if;

  delete from public.finance_capability_grants
  where profile_id = p_target_profile_id;
  get diagnostics v_finance_caps = row_count;

  delete from public.platform_capability_grants
  where profile_id = p_target_profile_id;
  get diagnostics v_platform_caps = row_count;

  delete from public.finance_company_access
  where profile_id = p_target_profile_id;
  get diagnostics v_company_access = row_count;

  delete from public.finance_financial_account_access
  where profile_id = p_target_profile_id;
  get diagnostics v_fa_access = row_count;

  update public.operational_identity_links
  set
    status = 'inactive',
    updated_at = timezone('utc', now())
  where profile_id = p_target_profile_id
    and status = 'active';
  get diagnostics v_links = row_count;

  update public.fm_facility_assignments
  set
    status = 'inactive',
    updated_at = timezone('utc', now()),
    updated_by_profile_id = p_actor_profile_id
  where profile_id = p_target_profile_id
    and status = 'active';
  get diagnostics v_assignments = row_count;

  perform set_config('sentracore.bypass_profile_acl', 'on', true);

  update public.profiles
  set
    status = 'inactive',
    updated_at = timezone('utc', now())
  where id = p_target_profile_id
    and status is distinct from 'inactive';

  perform public.platform_iam_insert_audit_event(
    v_target.organisation_id,
    p_actor_profile_id,
    'user.offboarded',
    'profile',
    p_target_profile_id::text,
    jsonb_build_object(
      'previousStatus', v_target.status,
      'status', 'inactive',
      'revoked', jsonb_build_object(
        'financeCapabilityGrants', v_finance_caps,
        'platformCapabilityGrants', v_platform_caps,
        'financeCompanyAccess', v_company_access,
        'financeFinancialAccountAccess', v_fa_access,
        'operationalIdentityLinksInactivated', v_links,
        'fmFacilityAssignmentsInactivated', v_assignments
      )
    )
  );

  return jsonb_build_object(
    'profileId', p_target_profile_id,
    'organisationId', v_target.organisation_id,
    'previousStatus', v_target.status,
    'status', 'inactive',
    'platformAccessRevoked', true,
    'revoked', jsonb_build_object(
      'financeCapabilityGrants', v_finance_caps,
      'platformCapabilityGrants', v_platform_caps,
      'financeCompanyAccess', v_company_access,
      'financeFinancialAccountAccess', v_fa_access,
      'operationalIdentityLinksInactivated', v_links,
      'fmFacilityAssignmentsInactivated', v_assignments
    )
  );
end;
$$;
