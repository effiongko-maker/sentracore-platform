-- Phase 2A operator bootstrap. NOT a schema migration.
-- Uses existing platform IAM RPC + assignment insert for the authorised FM operator only.
-- Idempotent. Does not create USR-* rows or grant finance.*/approvals.manage/fm.authorize_protected.

do $$
declare
  v_actor uuid := 'ee7eb825-090d-4db9-a852-feb278a69763';
  v_org uuid := '835a2e6d-a91b-413f-946a-8ed73a6027cc';
  v_facility uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_cap text;
begin
  foreach v_cap in array array[
    'ops.view',
    'ops.create',
    'ops.edit',
    'ops.submit',
    'users.view',
    'users.manage'
  ]
  loop
    perform public.platform_iam_grant_platform_capability(
      v_actor,
      v_org,
      v_actor,
      v_cap
    );
  end loop;

  if not exists (
    select 1
    from public.fm_facility_assignments
    where organisation_id = v_org
      and profile_id = v_actor
      and facility_id = v_facility
      and status = 'active'
  ) then
    insert into public.fm_facility_assignments (
      organisation_id,
      profile_id,
      facility_id,
      operational_role,
      status,
      created_by_profile_id,
      updated_by_profile_id
    ) values (
      v_org,
      v_actor,
      v_facility,
      'facility_manager',
      'active',
      v_actor,
      v_actor
    );
  end if;
end $$;

select jsonb_build_object(
  'grants', (
    select coalesce(jsonb_agg(capability order by capability), '[]'::jsonb)
    from public.platform_capability_grants
    where profile_id = 'ee7eb825-090d-4db9-a852-feb278a69763'
      and organisation_id = '835a2e6d-a91b-413f-946a-8ed73a6027cc'
  ),
  'assignment', (
    select jsonb_build_object(
      'id', id,
      'profile_id', profile_id,
      'facility_id', facility_id,
      'operational_role', operational_role,
      'status', status
    )
    from public.fm_facility_assignments
    where profile_id = 'ee7eb825-090d-4db9-a852-feb278a69763'
      and facility_id = 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0'
    order by created_at desc
    limit 1
  )
) as bootstrap;
