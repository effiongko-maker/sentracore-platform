do $$
declare
  org_a uuid;
  org_b uuid;
  fac_a uuid;
  fac_b uuid;
  bld uuid;
  flr uuid;
  cross_org_failed boolean := false;
  floor_mismatch_failed boolean := false;
  dept_mismatch_failed boolean := false;
begin
  insert into public.organisations (name, slug, status)
  values ('FM1B Probe A', 'fm1b-probe-a-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), 'active')
  returning id into org_a;
  insert into public.organisations (name, slug, status)
  values ('FM1B Probe B', 'fm1b-probe-b-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), 'active')
  returning id into org_b;

  insert into public.fm_facilities (organisation_id, code, name, status, facility_type, location_text)
  values (org_a, 'FAC-PROBE', 'Probe A', 'active', 'office', 'Lagos, Nigeria')
  returning id into fac_a;
  insert into public.fm_facilities (organisation_id, code, name, status)
  values (org_b, 'FAC-PROBE', 'Probe B', 'active')
  returning id into fac_b;

  begin
    insert into public.fm_buildings (organisation_id, facility_id, name, status)
    values (org_a, fac_b, 'Cross', 'active');
  exception when foreign_key_violation then
    cross_org_failed := true;
  end;
  if not cross_org_failed then
    raise exception 'fm1b probe: expected cross-org building FK failure';
  end if;

  insert into public.fm_buildings (organisation_id, facility_id, name, status)
  values (org_a, fac_a, 'Block 1', 'active')
  returning id into bld;

  insert into public.fm_floors (organisation_id, facility_id, building_id, name, status)
  values (org_a, fac_a, bld, 'Ground', 'active')
  returning id into flr;

  begin
    insert into public.fm_floors (organisation_id, facility_id, building_id, name, status)
    values (org_a, fac_b, bld, 'Bad', 'active');
  exception when foreign_key_violation then
    floor_mismatch_failed := true;
  end;
  if not floor_mismatch_failed then
    raise exception 'fm1b probe: expected facility/building mismatch FK failure';
  end if;

  insert into public.fm_rooms (organisation_id, facility_id, building_id, floor_id, name, status)
  values (org_a, fac_a, bld, flr, 'R1', 'active');

  insert into public.fm_departments (organisation_id, facility_id, name, status)
  values (org_a, fac_a, 'Ops', 'active');

  begin
    insert into public.fm_departments (organisation_id, facility_id, name, status)
    values (org_a, fac_b, 'Leak', 'active');
  exception when foreign_key_violation then
    dept_mismatch_failed := true;
  end;
  if not dept_mismatch_failed then
    raise exception 'fm1b probe: expected department cross-facility FK failure';
  end if;

  raise exception 'FM1B_PROBE_OK';
end $$;
