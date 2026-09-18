-- Live FM facilities foundation verification (single result set).
select jsonb_build_object(
  'tables', (
    select jsonb_agg(jsonb_build_object(
      'table_name', c.relname,
      'rls_enabled', c.relrowsecurity,
      'policy_count', (
        select count(*) from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
    ) order by c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('fm_facilities','fm_buildings','fm_floors','fm_rooms','fm_departments')
  ),
  'privileges', (
    select jsonb_agg(jsonb_build_object(
      'table_name', table_name,
      'anon_select', has_table_privilege('anon', format('public.%I', table_name), 'SELECT'),
      'auth_select', has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT'),
      'auth_insert', has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT'),
      'service_select', has_table_privilege('service_role', format('public.%I', table_name), 'SELECT'),
      'service_insert', has_table_privilege('service_role', format('public.%I', table_name), 'INSERT')
    ))
    from (values
      ('fm_facilities'),
      ('fm_buildings'),
      ('fm_floors'),
      ('fm_rooms'),
      ('fm_departments')
    ) as t(table_name)
  ),
  'row_counts', jsonb_build_object(
    'fm_facilities', (select count(*) from public.fm_facilities),
    'fm_buildings', (select count(*) from public.fm_buildings),
    'fm_floors', (select count(*) from public.fm_floors),
    'fm_rooms', (select count(*) from public.fm_rooms),
    'fm_departments', (select count(*) from public.fm_departments)
  ),
  'sa_in_policies', (
    select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('fm_facilities','fm_buildings','fm_floors','fm_rooms','fm_departments')
      and (
        qual ilike '%is_platform_super_admin%'
        or with_check ilike '%is_platform_super_admin%'
      )
  )
) as verification;
