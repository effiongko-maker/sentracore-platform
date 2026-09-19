select jsonb_build_object(
  'facilities', (select count(*)::int from public.fm_facilities),
  'buildings', (select count(*)::int from public.fm_buildings),
  'floors', (select count(*)::int from public.fm_floors),
  'rooms', (select count(*)::int from public.fm_rooms),
  'departments', (select count(*)::int from public.fm_departments),
  'assignments', (select count(*)::int from public.fm_facility_assignments),
  'fm_work_exists', exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'fm_work'
  ),
  'mig_2a', exists (
    select 1 from supabase_migrations.schema_migrations
    where version = '20260918210000'
  ),
  'ncc', (
    select jsonb_build_object('id', id, 'code', code, 'name', name)
    from public.fm_facilities
    where id = 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0'
  )
) as preflight;
