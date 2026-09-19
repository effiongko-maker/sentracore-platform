-- Platform IAM hardening — behavioural probe. Every write is rolled back; real
-- profiles / grants / audit rows are never left modified.
begin;

do $$
declare
  v_org uuid;
  v_sa uuid;      -- platform_super_admin actor
  v_owner uuid;   -- organisation_owner (JWT-manager) if distinct
  v_target uuid;  -- a profile that is not the actor
  v_fac uuid;
  v_before int;
  v_after int;
  v_asg uuid;
  v_status text;
begin
  select ura.profile_id into v_sa from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
   where r.slug = 'platform_super_admin' and ura.organisation_id is null limit 1;
  select p.organisation_id into v_org from public.profiles p where p.id = v_sa;
  select ura.profile_id into v_owner from public.user_role_assignments ura join public.roles r on r.id = ura.role_id
   where r.slug = 'organisation_owner' and ura.organisation_id = v_org limit 1;
  select id into v_target from public.profiles where organisation_id = v_org and id <> v_sa limit 1;
  if v_target is null then v_target := v_sa; end if;
  select id into v_fac from public.fm_facilities where organisation_id = v_org limit 1;
  if v_sa is null or v_org is null or v_owner is null then raise exception 'probe prerequisites missing'; end if;

  -- 1. Direct JWT mutation is closed — even for the organisation owner / a Super Admin JWT.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    update public.profiles set status = 'suspended' where id = v_target;
    get diagnostics v_before = row_count;
    if v_before > 0 then raise exception 'FAIL org manager changed profile status directly'; end if;
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set organisation_id = null where id = v_target;
    get diagnostics v_before = row_count;
    if v_before > 0 then raise exception 'FAIL org manager changed profile organisation directly'; end if;
  exception when insufficient_privilege then null; end;
  begin
    insert into public.platform_capability_grants (organisation_id, profile_id, capability) values (v_org, v_target, 'ops.view');
    raise exception 'FAIL direct capability grant accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.platform_capability_grants where profile_id = v_target;
    raise exception 'FAIL direct capability delete accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.organisation_modules set status = 'disabled' where organisation_id = v_org;
    raise exception 'FAIL direct module write accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.user_role_assignments (profile_id, role_id, organisation_id)
      select v_target, id, v_org from public.roles where slug = 'executive';
    raise exception 'FAIL direct role assignment accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.organisations set status = 'inactive' where id = v_org;
    raise exception 'FAIL direct organisation update accepted';
  exception when insufficient_privilege then null; end;
  -- Reads still work for the JWT user.
  perform 1 from public.organisation_modules where organisation_id = v_org limit 1;
  perform 1 from public.profiles limit 1;
  execute 'reset role';

  -- 2. The canonical control plane still works and is audited.
  select count(*) into v_before from public.platform_iam_audit_events;
  if v_target <> v_sa then
    select status::text into v_status from public.profiles where id = v_target;
    perform public.platform_iam_set_profile_status(v_sa, v_target, case when v_status = 'suspended' then 'active' else 'suspended' end::public.profile_status);
    select count(*) into v_after from public.platform_iam_audit_events;
    if v_after <= v_before then raise exception 'FAIL status change was not audited'; end if;
    perform public.platform_iam_grant_platform_capability(v_sa, v_org, v_target, 'ops.view');
    perform public.platform_iam_revoke_platform_capability(v_sa, v_org, v_target, 'ops.view');
  end if;
  begin
    perform public.platform_iam_offboard_profile(v_sa, v_sa);
    raise exception 'FAIL Super Admin offboarded themselves';
  exception when insufficient_privilege then null; end;
  begin
    perform public.platform_iam_set_profile_status(v_owner, v_target, 'suspended');
    if v_owner not in (select ura.profile_id from public.user_role_assignments ura join public.roles r on r.id=ura.role_id where r.slug='platform_super_admin') then
      raise exception 'FAIL non-Super-Admin actor changed a status via the RPC';
    end if;
  exception when insufficient_privilege then null; end;

  -- 3. Facility-assignment administration is audited (create / role / deactivate / reactivate).
  select count(*) into v_before from public.platform_iam_audit_events where object_type = 'fm_facility_assignment';
  insert into public.fm_facility_assignments (organisation_id, profile_id, facility_id, operational_role, status, created_by_profile_id, updated_by_profile_id)
    select v_org, p.id, v_fac, 'fm_staff', 'active', v_sa, v_sa from public.profiles p
     where p.organisation_id = v_org and not exists (select 1 from public.fm_facility_assignments a where a.profile_id = p.id and a.facility_id = v_fac and a.status = 'active')
     limit 1
    returning id into v_asg;
  if v_asg is null then raise exception 'probe could not create an assignment'; end if;
  update public.fm_facility_assignments set operational_role = 'liaison_officer', updated_by_profile_id = v_sa where id = v_asg;
  update public.fm_facility_assignments set status = 'inactive', updated_by_profile_id = v_sa where id = v_asg;
  update public.fm_facility_assignments set status = 'active', updated_by_profile_id = v_sa where id = v_asg;
  update public.fm_facility_assignments set updated_by_profile_id = v_sa where id = v_asg;   -- no-op change: no event
  select count(*) into v_after from public.platform_iam_audit_events where object_type = 'fm_facility_assignment';
  if v_after - v_before <> 4 then raise exception 'FAIL expected 4 assignment audit events, got %', v_after - v_before; end if;
  if not exists (select 1 from public.platform_iam_audit_events
                  where object_id = v_asg::text and action = 'facility_assignment.role_changed'
                    and actor_profile_id = v_sa and details->>'previousOperationalRole' = 'fm_staff' and details->>'operationalRole' = 'liaison_officer') then
    raise exception 'FAIL role change audit lacks actor / before-after';
  end if;
  begin
    update public.fm_facility_assignments set status = 'inactive', updated_by_profile_id = null where id = v_asg;
    raise exception 'FAIL unattributed assignment change accepted';
  exception when check_violation then null; end;
end;
$$;

rollback;

select
  (select count(*) from public.platform_iam_audit_events) as audit_rows_now,
  (select count(*) from public.fm_facility_assignments) as assignments_now,
  (select count(*) from public.platform_capability_grants) as grants_now,
  (select count(*) from public.profiles where status <> 'active') as non_active_profiles;
