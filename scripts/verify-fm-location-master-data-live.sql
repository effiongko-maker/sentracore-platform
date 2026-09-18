select
  (select count(*)::int from public.fm_facilities) as fm_facilities,
  (select count(*)::int from public.fm_buildings) as fm_buildings,
  (select count(*)::int from public.fm_floors) as fm_floors,
  (select count(*)::int from public.fm_rooms) as fm_rooms,
  (select count(*)::int from public.fm_departments) as fm_departments,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fm_floors' and column_name = 'level'
  ) as floors_level,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'fm_vendors'
  ) as fm_vendors_exists,
  (
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'code', code,
        'name', name,
        'status', status,
        'location_text', location_text,
        'facility_type', facility_type
      )
      order by code, id
    )
    from public.fm_facilities
  ) as facilities;
