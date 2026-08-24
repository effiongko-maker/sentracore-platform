-- Core platform schema for SentraCore
-- Shared foundation: organisations, departments, profiles, RBAC, modules.
-- No module-specific operational tables (FM, work orders, assets, etc.).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (status vocabularies only — permissions stay data-driven later)
-- ---------------------------------------------------------------------------

create type public.entity_status as enum (
  'active',
  'inactive',
  'suspended'
);

create type public.profile_status as enum (
  'active',
  'inactive',
  'invited',
  'suspended'
);

create type public.module_status as enum (
  'active',
  'inactive',
  'deprecated'
);

create type public.organisation_module_status as enum (
  'enabled',
  'disabled',
  'preparing'
);

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Organisations (tenant / company)
-- ---------------------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  logo_url text,
  industry text,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organisations_name_nonempty check (char_length(trim(name)) > 0),
  constraint organisations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index organisations_slug_uidx on public.organisations (slug);
create index organisations_status_idx on public.organisations (status);

create trigger organisations_set_updated_at
before update on public.organisations
for each row execute function public.set_updated_at();

comment on table public.organisations is
  'Company / tenant using SentraCore. Platform-wide multi-organisation root.';

-- ---------------------------------------------------------------------------
-- 2. Departments (org-scoped business / operational units)
-- ---------------------------------------------------------------------------

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint departments_name_nonempty check (char_length(trim(name)) > 0),
  constraint departments_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index departments_org_slug_uidx
  on public.departments (organisation_id, slug);
create index departments_organisation_id_idx
  on public.departments (organisation_id);
create index departments_status_idx on public.departments (status);

create trigger departments_set_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

comment on table public.departments is
  'Department or business unit within an organisation (e.g. Facility Management).';

-- ---------------------------------------------------------------------------
-- 3. Profiles (1:1 with auth.users — no credentials duplicated)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  full_name text,
  avatar_url text,
  job_title text,
  organisation_id uuid references public.organisations (id) on delete set null,
  status public.profile_status not null default 'invited',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index profiles_organisation_id_idx on public.profiles (organisation_id);
create index profiles_status_idx on public.profiles (status);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

comment on table public.profiles is
  'Application profile for an authenticated user. auth.users remains auth SoT.';

-- ---------------------------------------------------------------------------
-- 4. Roles (global catalog — assignments carry org/department scope)
-- ---------------------------------------------------------------------------

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_platform_role boolean not null default false,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint roles_name_nonempty check (char_length(trim(name)) > 0),
  constraint roles_slug_format check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create unique index roles_slug_uidx on public.roles (slug);

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

comment on table public.roles is
  'Platform-defined role catalog. Permissions attach later; do not encode ACL in slugs.';

-- ---------------------------------------------------------------------------
-- 5. User role assignments (flexible org + optional department scope)
-- ---------------------------------------------------------------------------

create table public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  organisation_id uuid references public.organisations (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_role_assignments_scope_check check (
    -- Platform-wide roles: organisation_id and department_id must both be null
    (organisation_id is null and department_id is null)
    -- Org-scoped: organisation required; department optional
    or (organisation_id is not null)
  )
);

-- Department must belong to the same organisation when both are set
create or replace function public.validate_role_assignment_department()
returns trigger
language plpgsql
as $$
declare
  dept_org uuid;
begin
  if new.department_id is null then
    return new;
  end if;

  if new.organisation_id is null then
    raise exception 'department_id requires organisation_id';
  end if;

  select organisation_id into dept_org
  from public.departments
  where id = new.department_id;

  if dept_org is null then
    raise exception 'department_id % not found', new.department_id;
  end if;

  if dept_org <> new.organisation_id then
    raise exception 'department_id does not belong to organisation_id';
  end if;

  return new;
end;
$$;

create trigger user_role_assignments_validate_department
before insert or update on public.user_role_assignments
for each row execute function public.validate_role_assignment_department();

create unique index user_role_assignments_unique_uidx
  on public.user_role_assignments (
    profile_id,
    role_id,
    organisation_id,
    department_id
  )
  nulls not distinct;

create index user_role_assignments_profile_id_idx
  on public.user_role_assignments (profile_id);
create index user_role_assignments_organisation_id_idx
  on public.user_role_assignments (organisation_id);
create index user_role_assignments_department_id_idx
  on public.user_role_assignments (department_id);
create index user_role_assignments_role_id_idx
  on public.user_role_assignments (role_id);

comment on table public.user_role_assignments is
  'Binds a profile to a role within optional organisation and department scope.';

-- ---------------------------------------------------------------------------
-- 6. Modules (platform registry)
-- ---------------------------------------------------------------------------

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  icon text,
  status public.module_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint modules_name_nonempty check (char_length(trim(name)) > 0),
  constraint modules_slug_format check (slug ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$')
);

create unique index modules_slug_uidx on public.modules (slug);
create index modules_status_idx on public.modules (status);

create trigger modules_set_updated_at
before update on public.modules
for each row execute function public.set_updated_at();

comment on table public.modules is
  'Platform-level operational module registry (not org-specific).';

-- ---------------------------------------------------------------------------
-- 7. Organisation modules (enablement / configuration)
-- ---------------------------------------------------------------------------

create table public.organisation_modules (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete restrict,
  status public.organisation_module_status not null default 'disabled',
  enabled_at timestamptz,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organisation_modules_unique unique (organisation_id, module_id)
);

create index organisation_modules_organisation_id_idx
  on public.organisation_modules (organisation_id);
create index organisation_modules_module_id_idx
  on public.organisation_modules (module_id);
create index organisation_modules_status_idx
  on public.organisation_modules (status);

create trigger organisation_modules_set_updated_at
before update on public.organisation_modules
for each row execute function public.set_updated_at();

comment on table public.organisation_modules is
  'Which modules an organisation has enabled / preparing / disabled.';

-- ---------------------------------------------------------------------------
-- Auth → profile bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_first text := coalesce(new.raw_user_meta_data->>'first_name', '');
  meta_last text := coalesce(new.raw_user_meta_data->>'last_name', '');
  meta_full text := nullif(trim(both from coalesce(new.raw_user_meta_data->>'full_name', '')), '');
  computed_full text;
begin
  computed_full := coalesce(
    meta_full,
    nullif(trim(both from concat_ws(' ', meta_first, meta_last)), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into public.profiles (
    id,
    first_name,
    last_name,
    full_name,
    avatar_url,
    status
  )
  values (
    new.id,
    nullif(meta_first, ''),
    nullif(meta_last, ''),
    computed_full,
    new.raw_user_meta_data->>'avatar_url',
    'invited'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is
  'Creates a public.profiles row when a new auth.users row is inserted.';
