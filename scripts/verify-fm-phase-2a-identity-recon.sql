select jsonb_build_object(
  'facility', (
    select jsonb_build_object(
      'id', f.id,
      'code', f.code,
      'name', f.name,
      'organisation_id', f.organisation_id,
      'organisation_name', o.name,
      'organisation_slug', o.slug
    )
    from public.fm_facilities f
    join public.organisations o on o.id = f.organisation_id
  ),
  'location_counts', jsonb_build_object(
    'facilities', (select count(*)::int from public.fm_facilities),
    'buildings', (select count(*)::int from public.fm_buildings),
    'floors', (select count(*)::int from public.fm_floors),
    'rooms', (select count(*)::int from public.fm_rooms),
    'departments', (select count(*)::int from public.fm_departments)
  ),
  'profiles', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'status', p.status,
      'organisation_id', p.organisation_id,
      'job_title', p.job_title,
      'is_platform_super_admin', exists (
        select 1
        from public.user_role_assignments ura
        join public.roles r on r.id = ura.role_id
        where ura.profile_id = p.id
          and r.slug = 'platform_super_admin'
          and ura.organisation_id is null
      )
    ) order by p.created_at, p.id), '[]'::jsonb)
    from public.profiles p
  ),
  'platform_capability_grants', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'profile_id', g.profile_id,
      'organisation_id', g.organisation_id,
      'capability', g.capability
    ) order by g.profile_id, g.capability), '[]'::jsonb)
    from public.platform_capability_grants g
  ),
  'operational_identity_links', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'profile_id', l.profile_id,
      'identity_domain', l.identity_domain,
      'external_identity_id', l.external_identity_id,
      'status', l.status
    ) order by l.profile_id), '[]'::jsonb)
    from public.operational_identity_links l
  ),
  'fm_module_enabled_orgs', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'organisation_id', om.organisation_id,
      'status', om.status
    )), '[]'::jsonb)
    from public.organisation_modules om
    join public.modules m on m.id = om.module_id
    where m.slug = 'facility_management'
  ),
  'admin_tables', jsonb_build_object(
    'profiles', exists (select 1 from information_schema.tables where table_schema='public' and table_name='profiles'),
    'platform_capability_grants', exists (select 1 from information_schema.tables where table_schema='public' and table_name='platform_capability_grants'),
    'platform_iam_audit_events', exists (select 1 from information_schema.tables where table_schema='public' and table_name='platform_iam_audit_events'),
    'fm_facility_assignments', exists (select 1 from information_schema.tables where table_schema='public' and table_name='fm_facility_assignments')
  )
) as recon;
