-- FM Phase 1B — Facilities & Location foundation (empty house).
-- Canonical operating geography for Facility Management.
-- Does NOT seed facilities, buildings, floors, rooms, or departments.
-- Does NOT create fm_vendors (organisation-scoped; later consuming domain).
-- Does NOT migrate Sheet test rows. Does NOT invent NCC Annex / FAC-0001.
--
-- Tenant integrity: composite FKs (organisation_id, parent_id) — RLS is not enough.
-- Authority: no Super Admin business-data bypass. JWT roles have no table grants.
-- Reads/writes go through Next.js service_role after existing ops.view/create/edit.
-- ops.* remains application OperatingAccess (People register) — not a new IAM vocabulary.

-- ---------------------------------------------------------------------------
-- Facilities
-- ---------------------------------------------------------------------------

create table public.fm_facilities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'pending',
  facility_type text,
  location_text text,
  size_sqm numeric(12, 2),
  description text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_facilities_org_id_unique unique (organisation_id, id),
  constraint fm_facilities_name_nonempty check (char_length(trim(name)) > 0),
  constraint fm_facilities_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_facilities_status_check
    check (status in ('active', 'inactive', 'pending', 'suspended')),
  constraint fm_facilities_type_check
    check (
      facility_type is null
      or facility_type in (
        'headquarters',
        'campus',
        'plant',
        'warehouse',
        'hub',
        'office'
      )
    ),
  constraint fm_facilities_size_nonnegative
    check (size_sqm is null or size_sqm >= 0)
);

create unique index fm_facilities_org_code_uidx
  on public.fm_facilities (organisation_id, lower(code));

create index fm_facilities_organisation_id_idx
  on public.fm_facilities (organisation_id);

create index fm_facilities_org_status_idx
  on public.fm_facilities (organisation_id, status);

create trigger fm_facilities_set_updated_at
before update on public.fm_facilities
for each row execute function public.set_updated_at();

comment on table public.fm_facilities is
  'Canonical operating facility within an organisation. UUID is authoritative. code is org-scoped display identifier. No seed rows. FM manager is a future assignment, not a free-text column.';

comment on column public.fm_facilities.location_text is
  'Single location/address field. Product does not distinguish address from location.';

comment on column public.fm_facilities.code is
  'Organisation-scoped display code (e.g. FAC-0001). Generated on create when omitted. Immutable after create.';

-- ---------------------------------------------------------------------------
-- Buildings (facility 1 → N)
-- ---------------------------------------------------------------------------

create table public.fm_buildings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  facility_id uuid not null,
  name text not null,
  code text,
  status text not null default 'active',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_buildings_org_id_unique unique (organisation_id, id),
  constraint fm_buildings_org_id_facility_unique unique (organisation_id, id, facility_id),
  constraint fm_buildings_name_nonempty check (char_length(trim(name)) > 0),
  constraint fm_buildings_code_nonempty
    check (code is null or char_length(trim(code)) > 0),
  constraint fm_buildings_status_check
    check (status in ('active', 'inactive', 'pending', 'suspended')),
  constraint fm_buildings_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id)
    on delete cascade
);

create unique index fm_buildings_facility_name_uidx
  on public.fm_buildings (organisation_id, facility_id, lower(name));

create unique index fm_buildings_facility_code_uidx
  on public.fm_buildings (organisation_id, facility_id, lower(code))
  where code is not null;

create index fm_buildings_facility_id_idx
  on public.fm_buildings (organisation_id, facility_id);

create trigger fm_buildings_set_updated_at
before update on public.fm_buildings
for each row execute function public.set_updated_at();

comment on table public.fm_buildings is
  'Building within a facility. organisation_id is constrained to the parent facility.';

-- ---------------------------------------------------------------------------
-- Floors (building 1 → N)
-- facility_id is denormalised only so the composite FK can enforce same-org/same-facility.
-- ---------------------------------------------------------------------------

create table public.fm_floors (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  facility_id uuid not null,
  building_id uuid not null,
  name text not null,
  code text,
  status text not null default 'active',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_floors_org_id_unique unique (organisation_id, id),
  constraint fm_floors_org_id_facility_building_unique
    unique (organisation_id, id, facility_id, building_id),
  constraint fm_floors_name_nonempty check (char_length(trim(name)) > 0),
  constraint fm_floors_code_nonempty
    check (code is null or char_length(trim(code)) > 0),
  constraint fm_floors_status_check
    check (status in ('active', 'inactive', 'pending', 'suspended')),
  constraint fm_floors_building_fk
    foreign key (organisation_id, building_id, facility_id)
    references public.fm_buildings (organisation_id, id, facility_id)
    on delete cascade
);

create unique index fm_floors_building_name_uidx
  on public.fm_floors (organisation_id, building_id, lower(name));

create unique index fm_floors_building_code_uidx
  on public.fm_floors (organisation_id, building_id, lower(code))
  where code is not null;

create index fm_floors_building_id_idx
  on public.fm_floors (organisation_id, building_id);

create index fm_floors_facility_id_idx
  on public.fm_floors (organisation_id, facility_id);

create trigger fm_floors_set_updated_at
before update on public.fm_floors
for each row execute function public.set_updated_at();

comment on table public.fm_floors is
  'Floor within a building. facility_id must match the parent building via composite FK.';

-- ---------------------------------------------------------------------------
-- Rooms (floor 1 → N)
-- ---------------------------------------------------------------------------

create table public.fm_rooms (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  facility_id uuid not null,
  building_id uuid not null,
  floor_id uuid not null,
  name text not null,
  code text,
  status text not null default 'active',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_rooms_org_id_unique unique (organisation_id, id),
  constraint fm_rooms_name_nonempty check (char_length(trim(name)) > 0),
  constraint fm_rooms_code_nonempty
    check (code is null or char_length(trim(code)) > 0),
  constraint fm_rooms_status_check
    check (status in ('active', 'inactive', 'pending', 'suspended')),
  constraint fm_rooms_floor_fk
    foreign key (organisation_id, floor_id, facility_id, building_id)
    references public.fm_floors (organisation_id, id, facility_id, building_id)
    on delete cascade
);

create unique index fm_rooms_floor_name_uidx
  on public.fm_rooms (organisation_id, floor_id, lower(name));

create unique index fm_rooms_floor_code_uidx
  on public.fm_rooms (organisation_id, floor_id, lower(code))
  where code is not null;

create index fm_rooms_floor_id_idx
  on public.fm_rooms (organisation_id, floor_id);

create index fm_rooms_facility_id_idx
  on public.fm_rooms (organisation_id, facility_id);

create trigger fm_rooms_set_updated_at
before update on public.fm_rooms
for each row execute function public.set_updated_at();

comment on table public.fm_rooms is
  'Room/location within a floor. Parent facility/building are constrained via composite FK to the floor.';

-- ---------------------------------------------------------------------------
-- Departments (facility-scoped; NOT part of building/floor/room hierarchy)
-- Distinct from public.departments (org-scoped platform business units).
-- ---------------------------------------------------------------------------

create table public.fm_departments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  facility_id uuid not null,
  name text not null,
  code text,
  status text not null default 'active',
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_departments_org_id_unique unique (organisation_id, id),
  constraint fm_departments_name_nonempty check (char_length(trim(name)) > 0),
  constraint fm_departments_code_nonempty
    check (code is null or char_length(trim(code)) > 0),
  constraint fm_departments_status_check
    check (status in ('active', 'inactive', 'pending', 'suspended')),
  constraint fm_departments_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id)
    on delete cascade
);

create unique index fm_departments_facility_name_uidx
  on public.fm_departments (organisation_id, facility_id, lower(name));

create unique index fm_departments_facility_code_uidx
  on public.fm_departments (organisation_id, facility_id, lower(code))
  where code is not null;

create index fm_departments_facility_id_idx
  on public.fm_departments (organisation_id, facility_id);

create trigger fm_departments_set_updated_at
before update on public.fm_departments
for each row execute function public.set_updated_at();

comment on table public.fm_departments is
  'Facility-scoped operational department. Not public.departments and not part of the building/floor/room tree.';

-- ---------------------------------------------------------------------------
-- RLS — fail closed. No JWT table grants. No Super Admin bypass.
-- ---------------------------------------------------------------------------

alter table public.fm_facilities enable row level security;
alter table public.fm_buildings enable row level security;
alter table public.fm_floors enable row level security;
alter table public.fm_rooms enable row level security;
alter table public.fm_departments enable row level security;

revoke all on table public.fm_facilities from public, anon, authenticated;
revoke all on table public.fm_buildings from public, anon, authenticated;
revoke all on table public.fm_floors from public, anon, authenticated;
revoke all on table public.fm_rooms from public, anon, authenticated;
revoke all on table public.fm_departments from public, anon, authenticated;

grant all on table public.fm_facilities to service_role;
grant all on table public.fm_buildings to service_role;
grant all on table public.fm_floors to service_role;
grant all on table public.fm_rooms to service_role;
grant all on table public.fm_departments to service_role;
