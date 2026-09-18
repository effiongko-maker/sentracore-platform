begin;

do $$
declare
  org_a uuid;
  org_b uuid;
  fac_a uuid;
  fac_b uuid;
  building_id uuid;
  floor_id uuid;
begin
  insert into public.organisations (name, slug, status)
  values ('FM1D Probe A', 'fm1dprobea' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'active')
  returning id into org_a;

  insert into public.organisations (name, slug, status)
  values ('FM1D Probe B', 'fm1dprobeb' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), 'active')
  returning id into org_b;

  insert into public.fm_facilities (organisation_id, code, name, status, facility_type, location_text)
  values (org_a, 'FAC-TEMP', 'Temp A', 'active', 'office', 'Lagos, Nigeria')
  returning id into fac_a;

  insert into public.fm_facilities (organisation_id, code, name, status)
  values (org_b, 'FAC-TEMP', 'Temp B', 'active')
  returning id into fac_b;

  begin
    insert into public.fm_buildings (organisation_id, facility_id, name, status, description)
    values (org_a, fac_b, 'Cross', 'active', 'no');
    raise exception 'cross-org building insert should have failed';
  exception
    when foreign_key_violation then
      null;
  end;

  insert into public.fm_buildings (organisation_id, facility_id, name, status, description)
  values (org_a, fac_a, 'Block 1', 'active', 'probe')
  returning id into building_id;

  insert into public.fm_floors (organisation_id, facility_id, building_id, name, status, level, description)
  values (org_a, fac_a, building_id, 'Ground', 'active', 'G', 'probe')
  returning id into floor_id;

  begin
    insert into public.fm_floors (organisation_id, facility_id, building_id, name, status)
    values (org_a, fac_b, building_id, 'Bad', 'active');
    raise exception 'cross-facility floor insert should have failed';
  exception
    when foreign_key_violation then
      null;
  end;

  insert into public.fm_rooms (organisation_id, facility_id, building_id, floor_id, name, status, description)
  values (org_a, fac_a, building_id, floor_id, 'R1', 'active', 'probe');

  insert into public.fm_departments (organisation_id, facility_id, name, status, description)
  values (org_a, fac_a, 'Ops', 'active', 'probe');

  begin
    insert into public.fm_departments (organisation_id, facility_id, name, status)
    values (org_a, fac_b, 'Leak', 'active');
    raise exception 'cross-org department insert should have failed';
  exception
    when foreign_key_violation then
      null;
  end;
end $$;

rollback;
