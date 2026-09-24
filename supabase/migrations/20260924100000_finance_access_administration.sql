-- Platform Finance access administration from the Admin Console control plane.
--
-- Operating model: platform administrators provision Finance access in Admin Console on Finance's advice. Platform
-- Finance stays a closed operating environment and owns WHAT the access is (finance_company_access,
-- finance_capability_grants); the Admin Console administers it.
--
--   1. platform_finance.access.manage — explicit CONTROL-PLANE authority, stored in platform_capability_grants
--      (never in finance_capability_grants, whose rows are what grant Platform Finance entry). Holding it grants no
--      Platform Finance entry, no company access, no Finance capability and no Finance data. Never implied by Super
--      Admin or platform.admin_override. Registered with the existing audited platform IAM grant path so the Admin
--      Console can grant it explicitly; nobody receives it from this migration.
--   2. Audited grant / revoke functions for finance_company_access and finance_capability_grants. Each re-checks the
--      actor's explicit access.manage grant inside the database, refuses self-changes, keeps the target and company
--      inside the actor's organisation, is idempotent and writes one finance_audit_events row per actual change.
--      service_role only: the Admin Console server calls them after its own gate.
--   3. Removal of the unaudited direct client write policies on both tables (insert / delete for manage_setup
--      holders). Read policies are unchanged. All writes go through the audited functions.

-- ---------------------------------------------------------------------------
-- 1. Grantable Finance capabilities: the existing operational PLATFORM_FINANCE_CAPABILITIES (not access.manage)
-- ---------------------------------------------------------------------------
create or replace function public.finance_iam_is_allowed_capability(p_capability text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_capability = any (array[
    'platform_finance.view',
    'platform_finance.manage_setup',
    'platform_finance.manage_periods',
    'platform_finance.manage_coa',
    'platform_finance.create_transaction',
    'platform_finance.post',
    'platform_finance.financial_account.view',
    'platform_finance.financial_account.manage',
    'platform_finance.request.create',
    'platform_finance.request.view_own',
    'platform_finance.request.review',
    'platform_finance.request.approve',
    'platform_finance.payable.view',
    'platform_finance.payable.create',
    'platform_finance.payable.review',
    'platform_finance.payable.approve',
    'platform_finance.vendor_bill.view',
    'platform_finance.vendor_bill.create',
    'platform_finance.vendor_bill.review',
    'platform_finance.payment.view',
    'platform_finance.payment.execute',
    'platform_finance.counterparty.view',
    'platform_finance.counterparty.manage',
    'platform_finance.invoice.view',
    'platform_finance.invoice.create',
    'platform_finance.invoice.review',
    'platform_finance.invoice.issue',
    'platform_finance.receivable.view',
    'platform_finance.receipt.view',
    'platform_finance.receipt.record',
    'platform_finance.receipt.post',
    'platform_finance.historical.view',
    'platform_finance.historical.manage'
  ]::text[]);
$$;

-- ---------------------------------------------------------------------------
-- 2. Authority check shared by every write
-- ---------------------------------------------------------------------------
create or replace function public.finance_iam_require_access_admin(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_target_profile_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_target public.profiles%rowtype;
begin
  select * into v_actor from public.profiles where id = p_actor_profile_id;
  if not found or v_actor.organisation_id is distinct from p_organisation_id or v_actor.status <> 'active' then
    raise exception 'finance_iam: actor is not an active member of the organisation' using errcode = '42501';
  end if;
  -- Exactly one authority: the explicit control-plane grant. Super Admin, platform.admin_override and Finance
  -- company membership are never consulted.
  if not exists (
    select 1 from public.platform_capability_grants
    where organisation_id = p_organisation_id
      and profile_id = p_actor_profile_id
      and capability = 'platform_finance.access.manage'
  ) then
    raise exception 'finance_iam: Finance access administration is not authorised' using errcode = '42501';
  end if;
  if p_actor_profile_id = p_target_profile_id then
    raise exception 'finance_iam: you cannot change your own Finance access' using errcode = '42501';
  end if;
  select * into v_target from public.profiles where id = p_target_profile_id;
  if not found or v_target.organisation_id is distinct from p_organisation_id then
    raise exception 'finance_iam: target profile is not a member of the organisation' using errcode = 'P0002';
  end if;
  if v_target.status <> 'active' then
    raise exception 'finance_iam: Finance access can only be changed for active accounts' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Capability grant / revoke
-- ---------------------------------------------------------------------------
create or replace function public.finance_iam_grant_capability(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_target_profile_id uuid,
  p_capability text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted uuid;
begin
  perform public.finance_iam_require_access_admin(p_actor_profile_id, p_organisation_id, p_target_profile_id);
  if not public.finance_iam_is_allowed_capability(p_capability) then
    raise exception 'finance_iam: capability % is not a Platform Finance capability', p_capability using errcode = '22023';
  end if;

  insert into public.finance_capability_grants (organisation_id, profile_id, capability)
  values (p_organisation_id, p_target_profile_id, p_capability)
  on conflict (profile_id, organisation_id, capability) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return false; -- unchanged: nothing written, nothing audited
  end if;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action, object_type, object_id, reason, details
  ) values (
    p_organisation_id, null, p_actor_profile_id, 'finance.access.capability_granted',
    'profile', p_target_profile_id::text, 'Platform Finance capability granted.',
    jsonb_build_object('target_profile_id', p_target_profile_id, 'capability', p_capability)
  );
  return true;
end;
$$;

create or replace function public.finance_iam_revoke_capability(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_target_profile_id uuid,
  p_capability text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted uuid;
begin
  perform public.finance_iam_require_access_admin(p_actor_profile_id, p_organisation_id, p_target_profile_id);

  delete from public.finance_capability_grants
  where organisation_id = p_organisation_id
    and profile_id = p_target_profile_id
    and capability = p_capability
  returning id into v_deleted;

  if v_deleted is null then
    return false;
  end if;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action, object_type, object_id, reason, details
  ) values (
    p_organisation_id, null, p_actor_profile_id, 'finance.access.capability_revoked',
    'profile', p_target_profile_id::text, 'Platform Finance capability revoked.',
    jsonb_build_object('target_profile_id', p_target_profile_id, 'capability', p_capability)
  );
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Company access grant / revoke
-- ---------------------------------------------------------------------------
create or replace function public.finance_iam_grant_company_access(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_target_profile_id uuid,
  p_company_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted uuid;
begin
  perform public.finance_iam_require_access_admin(p_actor_profile_id, p_organisation_id, p_target_profile_id);
  if not exists (
    select 1 from public.finance_companies where id = p_company_id and organisation_id = p_organisation_id
  ) then
    raise exception 'finance_iam: company is not a Finance company of the organisation' using errcode = 'P0002';
  end if;

  insert into public.finance_company_access (organisation_id, profile_id, company_id)
  values (p_organisation_id, p_target_profile_id, p_company_id)
  on conflict (profile_id, company_id) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return false;
  end if;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action, object_type, object_id, reason, details
  ) values (
    p_organisation_id, p_company_id, p_actor_profile_id, 'finance.access.company_granted',
    'profile', p_target_profile_id::text, 'Platform Finance company access granted.',
    jsonb_build_object('target_profile_id', p_target_profile_id, 'company_id', p_company_id)
  );
  return true;
end;
$$;

create or replace function public.finance_iam_revoke_company_access(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_target_profile_id uuid,
  p_company_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted uuid;
begin
  perform public.finance_iam_require_access_admin(p_actor_profile_id, p_organisation_id, p_target_profile_id);
  -- Never leave restricted financial-account access dangling in a company the person can no longer access.
  if exists (
    select 1
    from public.finance_financial_account_access a
    join public.finance_financial_accounts f on f.id = a.financial_account_id
    where a.profile_id = p_target_profile_id
      and f.company_id = p_company_id
  ) then
    raise exception 'finance_iam: remove this person''s restricted financial-account access in the company first'
      using errcode = '23514';
  end if;

  delete from public.finance_company_access
  where organisation_id = p_organisation_id
    and profile_id = p_target_profile_id
    and company_id = p_company_id
  returning id into v_deleted;

  if v_deleted is null then
    return false;
  end if;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action, object_type, object_id, reason, details
  ) values (
    p_organisation_id, p_company_id, p_actor_profile_id, 'finance.access.company_revoked',
    'profile', p_target_profile_id::text, 'Platform Finance company access revoked.',
    jsonb_build_object('target_profile_id', p_target_profile_id, 'company_id', p_company_id)
  );
  return true;
end;
$$;

revoke all on function public.finance_iam_is_allowed_capability(text) from public;
revoke all on function public.finance_iam_require_access_admin(uuid, uuid, uuid) from public;
revoke all on function public.finance_iam_grant_capability(uuid, uuid, uuid, text) from public;
revoke all on function public.finance_iam_revoke_capability(uuid, uuid, uuid, text) from public;
revoke all on function public.finance_iam_grant_company_access(uuid, uuid, uuid, uuid) from public;
revoke all on function public.finance_iam_revoke_company_access(uuid, uuid, uuid, uuid) from public;
revoke all on function public.finance_iam_is_allowed_capability(text) from anon, authenticated;
revoke all on function public.finance_iam_require_access_admin(uuid, uuid, uuid) from anon, authenticated;
revoke all on function public.finance_iam_grant_capability(uuid, uuid, uuid, text) from anon, authenticated;
revoke all on function public.finance_iam_revoke_capability(uuid, uuid, uuid, text) from anon, authenticated;
revoke all on function public.finance_iam_grant_company_access(uuid, uuid, uuid, uuid) from anon, authenticated;
revoke all on function public.finance_iam_revoke_company_access(uuid, uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.finance_iam_grant_capability(uuid, uuid, uuid, text) to service_role;
grant execute on function public.finance_iam_revoke_capability(uuid, uuid, uuid, text) to service_role;
grant execute on function public.finance_iam_grant_company_access(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.finance_iam_revoke_company_access(uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. No direct client writes: all changes go through the audited functions above.
-- ---------------------------------------------------------------------------
drop policy if exists finance_company_access_insert on public.finance_company_access;
drop policy if exists finance_company_access_delete on public.finance_company_access;
drop policy if exists finance_capability_grants_insert on public.finance_capability_grants;
drop policy if exists finance_capability_grants_delete on public.finance_capability_grants;

comment on function public.finance_iam_grant_capability(uuid, uuid, uuid, text) is
  'Audited grant of a Platform Finance capability. Requires the actor''s explicit control-plane platform_finance.access.manage; no self-change.';
comment on function public.finance_iam_grant_company_access(uuid, uuid, uuid, uuid) is
  'Audited grant of Finance company access within the organisation. Requires platform_finance.access.manage; no self-change.';

-- ---------------------------------------------------------------------------
-- 6. Register platform_finance.access.manage with the existing platform IAM grant path (Admin Console → Access).
--    Additive: every existing accepted value is unchanged. No row is granted here.
-- ---------------------------------------------------------------------------
alter table public.platform_capability_grants
  drop constraint if exists platform_capability_grants_capability_format;
alter table public.platform_capability_grants
  add constraint platform_capability_grants_capability_format
  check (
    capability ~ '^platform\.(command_centre|ecc_operations)(\.[a-z0-9_]+)+$'
    or capability = 'platform.executive.private_office.access'
    or capability = 'platform_finance.access.manage'
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
    'platform.executive.private_office.access',
    'platform_finance.access.manage',
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
