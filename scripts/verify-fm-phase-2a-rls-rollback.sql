begin;

do $$
declare
  v_profile uuid;
  v_org uuid;
  v_other uuid;
  v_fac uuid;
  v_annex uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_ok boolean := false;
begin
  select id, organisation_id into v_profile, v_org
  from public.profiles
  where id = 'ee7eb825-090d-4db9-a852-feb278a69763';

  if v_profile is null then
    raise exception 'operator profile missing';
  end if;

  insert into public.organisations (name, slug, status)
  values ('FM2A Probe Org', 'fm2a-' || replace(gen_random_uuid()::text, '-', ''), 'active')
  returning id into v_other;

  insert into public.fm_facilities (
    organisation_id, code, name, status, facility_type, location_text
  ) values (
    v_other, 'FAC-TEMP', 'Temp', 'active', 'office', 'Lagos, Nigeria'
  ) returning id into v_fac;

  begin
    insert into public.fm_facility_assignments (
      organisation_id, profile_id, facility_id, operational_role, status
    ) values (v_other, v_profile, v_fac, 'facility_manager', 'active');
    raise exception 'cross-org profile assignment should have failed';
  exception
    when foreign_key_violation then
      null;
  end;

  begin
    insert into public.fm_facility_assignments (
      organisation_id, profile_id, facility_id, operational_role, status
    ) values (v_org, v_profile, v_fac, 'facility_manager', 'active');
    raise exception 'cross-org facility assignment should have failed';
  exception
    when foreign_key_violation then
      null;
  end;

  if not exists (
    select 1 from public.fm_facility_assignments
    where organisation_id = v_org
      and profile_id = v_profile
      and facility_id = v_annex
      and status = 'active'
  ) then
    insert into public.fm_facility_assignments (
      organisation_id, profile_id, facility_id, operational_role, status
    ) values (v_org, v_profile, v_annex, 'fm_staff', 'active');
  end if;

  begin
    insert into public.fm_facility_assignments (
      organisation_id, profile_id, facility_id, operational_role, status
    ) values (v_org, v_profile, v_annex, 'facility_manager', 'active');
    raise exception 'duplicate active assignment should have failed';
  exception
    when unique_violation then
      v_ok := true;
  end;

  if not v_ok then
    raise exception 'duplicate active assignment was not rejected';
  end if;

  if (
    (select count(*) from public.fm_buildings) +
    (select count(*) from public.fm_floors) +
    (select count(*) from public.fm_rooms) +
    (select count(*) from public.fm_departments)
  ) <> 0 then
    raise exception 'location children were created';
  end if;
end $$;

rollback;

select 'rolled_back' as status;
