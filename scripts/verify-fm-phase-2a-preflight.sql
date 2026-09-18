select
  (select count(*)::int from public.fm_facilities) as fm_facilities,
  (select count(*)::int from public.fm_buildings) as fm_buildings,
  (select count(*)::int from public.fm_floors) as fm_floors,
  (select count(*)::int from public.fm_rooms) as fm_rooms,
  (select count(*)::int from public.fm_departments) as fm_departments,
  (
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'code', code,
        'name', name,
        'status', status
      )
      order by code, id
    )
    from public.fm_facilities
  ) as facilities,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) as profiles_exists,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'operational_identity_links'
  ) as operational_identity_links_exists,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'fm_facility_assignments'
  ) as fm_facility_assignments_exists;