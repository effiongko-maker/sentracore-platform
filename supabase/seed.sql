-- Development seed for SentraCore core platform.
-- Idempotent on slug / unique keys (safe for local reset + reseed).

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
    'Platform Finance',
    'platform_finance',
    'Organisation-wide multi-company financial operations and accounting.',
    'wallet',
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
-- Enable Facility Management for PayChex only
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

-- Platform Finance module gate for PayChex (workspace catalogue stays in_development).
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
  jsonb_build_object('phase', 'foundation')
from public.organisations o
join public.modules m on m.slug = 'platform_finance'
where o.slug = 'paychex'
on conflict (organisation_id, module_id) do update
set
  status = excluded.status,
  enabled_at = coalesce(public.organisation_modules.enabled_at, excluded.enabled_at),
  configuration = excluded.configuration,
  updated_at = timezone('utc', now());

-- Finance companies under PayChex Group (idempotent; mirrors foundation migration)
insert into public.finance_companies (organisation_id, code, name, status)
select
  o.id,
  v.code,
  v.name,
  'active'::public.entity_status
from public.organisations o
cross join (
  values
    ('PAYCHEX', 'PayChex'),
    ('FORNIDO', 'Fornido'),
    ('TRIVNET', 'Trivnet'),
    ('DIAMOND_HEIRS', 'Diamond Heirs'),
    ('INOVATIVA', 'Inovativa'),
    ('ICEPYRAMID', 'IcePyramid'),
    ('FAMILY_DEPOT', 'Family Depot'),
    ('KAFAKUWO', 'Kafakuwo'),
    ('LECOLLECTIF', 'LeCollectIF'),
    ('NOUVELTECH', 'NouvelTech'),
    ('REIDACCESS', 'Reidaccess'),
    ('TELEMIX', 'Telemix')
) as v(code, name)
where o.slug = 'paychex'
on conflict (organisation_id, code) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());

-- Platform developer / QA access for PayChex organisation owners / platform
-- super admins. Explicit grants only (not derived from Super Admin).
-- Role-based; does not hard-code profile UUIDs.
-- Source of truth for capability lists:
--   scripts/lib/platform-developer-access-bundle.ts
-- Note: platform_super_admin assignments are platform-scoped (organisation_id null).
insert into public.finance_capability_grants (
  organisation_id,
  profile_id,
  capability
)
select distinct
  o.id,
  p.id,
  c.capability
from public.organisations o
join public.profiles p on p.organisation_id = o.id
join public.user_role_assignments ura on ura.profile_id = p.id
join public.roles r on r.id = ura.role_id
cross join (
  values
    ('platform_finance.view'),
    ('platform_finance.manage_setup'),
    ('platform_finance.manage_periods'),
    ('platform_finance.manage_coa'),
    ('platform_finance.create_transaction'),
    ('platform_finance.post'),
    ('platform_finance.request.create'),
    ('platform_finance.request.view_own'),
    ('platform_finance.request.review'),
    ('platform_finance.request.approve'),
    ('platform_finance.payable.view'),
    ('platform_finance.payable.create'),
    ('platform_finance.payable.review'),
    ('platform_finance.payable.approve'),
    ('platform_finance.vendor_bill.view'),
    ('platform_finance.vendor_bill.create'),
    ('platform_finance.vendor_bill.review'),
    ('platform_finance.counterparty.view'),
    ('platform_finance.counterparty.manage'),
    ('platform_finance.invoice.view'),
    ('platform_finance.invoice.create'),
    ('platform_finance.invoice.review'),
    ('platform_finance.invoice.issue'),
    ('platform_finance.receivable.view'),
    ('platform_finance.receipt.view'),
    ('platform_finance.receipt.record'),
    ('platform_finance.receipt.post')
) as c(capability)
where o.slug = 'paychex'
  and r.slug = 'organisation_owner'
  and ura.organisation_id = o.id
on conflict (profile_id, organisation_id, capability) do nothing;

insert into public.platform_capability_grants (
  organisation_id,
  profile_id,
  capability
)
select distinct
  o.id,
  p.id,
  c.capability
from public.organisations o
join public.profiles p on p.organisation_id = o.id
join public.user_role_assignments ura on ura.profile_id = p.id
join public.roles r on r.id = ura.role_id
cross join (
  values
    ('platform.command_centre.view'),
    ('platform.command_centre.decide')
) as c(capability)
where o.slug = 'paychex'
  and (
    (r.slug = 'organisation_owner' and ura.organisation_id = o.id)
    or (r.slug = 'platform_super_admin' and ura.organisation_id is null)
  )
on conflict (profile_id, organisation_id, capability) do nothing;

insert into public.finance_company_access (
  organisation_id,
  profile_id,
  company_id
)
select distinct
  o.id,
  p.id,
  fc.id
from public.organisations o
join public.profiles p on p.organisation_id = o.id
join public.user_role_assignments ura on ura.profile_id = p.id
join public.roles r on r.id = ura.role_id
join public.finance_companies fc on fc.organisation_id = o.id
where o.slug = 'paychex'
  and r.slug = 'organisation_owner'
  and ura.organisation_id = o.id
  and fc.status = 'active'
on conflict (profile_id, company_id) do nothing;
