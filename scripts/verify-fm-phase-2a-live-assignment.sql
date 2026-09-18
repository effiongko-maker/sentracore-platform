select jsonb_build_object(
  'assignments', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'profile_id', a.profile_id,
      'facility_id', a.facility_id,
      'role', a.operational_role,
      'status', a.status
    )), '[]'::jsonb)
    from public.fm_facility_assignments a
  ),
  'assignment_count', (select count(*)::int from public.fm_facility_assignments),
  'probe_orgs', (
    select count(*)::int from public.organisations where name = 'FM2A Probe Org'
  ),
  'location_children', jsonb_build_object(
    'buildings', (select count(*)::int from public.fm_buildings),
    'floors', (select count(*)::int from public.fm_floors),
    'rooms', (select count(*)::int from public.fm_rooms),
    'departments', (select count(*)::int from public.fm_departments)
  )
) as live;
