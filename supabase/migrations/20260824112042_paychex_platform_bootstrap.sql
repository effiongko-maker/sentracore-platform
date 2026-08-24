-- SentraCore bootstrap: global roles/modules + PayChex tenant seed.
-- Idempotent on unique slugs / (organisation_id, slug|module_id) keys.
-- Safe to re-apply; does not create operational FM tables or users.

-- ---------------------------------------------------------------------------
-- Roles (global catalog)
-- ---------------------------------------------------------------------------

insert into public.roles (name, slug, description, is_platform_role, status)
values
  (
    'Platform Super Admin',
    'platform_super_admin',
    'Beacon / SentraCore operator with cross-organisation platform access.',
    true,
    'active'
  ),
  (
    'Organisation Owner',
    'organisation_owner',
    'Primary commercial / administrative owner of an organisation tenant.',
    false,
    'active'
  ),
  (
    'Executive',
    'executive',
    'Organisation-level executive with broad visibility across departments.',
    false,
    'active'
  ),
  (
    'Department Head',
    'department_head',
    'Leads a department / business unit within an organisation.',
    false,
    'active'
  ),
  (
    'Manager',
    'manager',
    'Manages teams or workflows within a department scope.',
    false,
    'active'
  ),
  (
    'Officer',
    'officer',
    'Professional / coordinating role within operational workflows.',
    false,
    'active'
  ),
  (
    'Operational Staff',
    'operational_staff',
    'Front-line operational user executing day-to-day work.',
    false,
    'active'
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_platform_role = excluded.is_platform_role,
  status = excluded.status,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Modules (platform registry)
-- ---------------------------------------------------------------------------

insert into public.modules (name, slug, description, icon, status)
values
  (
    'Facility Management',
    'facility_management',
    'Facilities, assets, maintenance, work orders, and site operations.',
    'building-2',
    'active'
  ),
  (
    'ECC Operations',
    'ecc_operations',
    'Emergency / command centre operational workflows.',
    'siren',
    'active'
  ),
  (
    'Construction',
    'construction',
    'Construction programme and site delivery operations.',
    'hard-hat',
    'active'
  ),
  (
    'Projects & Events',
    'projects_events',
    'Projects, events, and programme coordination.',
    'calendar-days',
    'active'
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  status = excluded.status,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Organisation: PayChex
-- ---------------------------------------------------------------------------

insert into public.organisations (name, slug, industry, status)
values (
  'PayChex International Marketing Limited',
  'paychex',
  'Facilities & corporate services',
  'active'
)
on conflict (slug) do update
set
  name = excluded.name,
  industry = excluded.industry,
  status = excluded.status,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Departments for PayChex
-- ---------------------------------------------------------------------------

insert into public.departments (organisation_id, name, slug, description, status)
select
  o.id,
  v.name,
  v.slug,
  v.description,
  'active'::public.entity_status
from public.organisations o
cross join (
  values
    (
      'Facility Management',
      'facility-management',
      'Facilities operations and estate services.'
    ),
    (
      'ECC Operations',
      'ecc-operations',
      'Emergency / command centre operations.'
    ),
    (
      'Construction',
      'construction',
      'Construction and capital works.'
    ),
    (
      'Projects & Events',
      'projects-events',
      'Projects, events, and programme delivery.'
    )
) as v(name, slug, description)
where o.slug = 'paychex'
on conflict (organisation_id, slug) do update
set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Module enablement for PayChex
-- Facility Management: enabled
-- ECC / Construction / Projects & Events: registered as disabled (not operational)
-- ---------------------------------------------------------------------------

insert into public.organisation_modules (
  organisation_id,
  module_id,
  status,
  enabled_at,
  configuration
)
select
  o.id,
  m.id,
  'enabled'::public.organisation_module_status,
  timezone('utc', now()),
  '{}'::jsonb
from public.organisations o
join public.modules m on m.slug = 'facility_management'
where o.slug = 'paychex'
on conflict (organisation_id, module_id) do update
set
  status = excluded.status,
  enabled_at = coalesce(public.organisation_modules.enabled_at, excluded.enabled_at),
  updated_at = timezone('utc', now());

insert into public.organisation_modules (
  organisation_id,
  module_id,
  status,
  enabled_at,
  configuration
)
select
  o.id,
  m.id,
  'disabled'::public.organisation_module_status,
  null,
  '{}'::jsonb
from public.organisations o
join public.modules m
  on m.slug in ('ecc_operations', 'construction', 'projects_events')
where o.slug = 'paychex'
on conflict (organisation_id, module_id) do nothing;
