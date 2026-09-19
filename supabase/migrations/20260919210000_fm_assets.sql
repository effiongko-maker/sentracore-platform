-- FM Phase 2H — Assets foundation (empty operational register).
-- Table: fm_assets. Server-mediated only (RLS on, service_role grants only).
-- Does NOT migrate Sheet Asset rows (13 legacy rows are development/test data).
--
-- Identity:   UUID is authoritative. code (AST-YYYY-######) is the org-scoped
--             display reference only — never a relationship key.
-- Facility:   NOT NULL UUID, tenant-safe FK (replaces the Sheet's facility NAME text).
-- Actor:      assigned_to_profile_id is a profile UUID (replaces free-text names).
-- Relations:  fm_incidents / fm_work / fm_work_instructions .asset_id replace the
--             opaque asset_ref text. An Asset's facility must equal the referencing
--             record's facility (composite FK).
-- Not modelled (no existing behaviour): building/floor/room, maintenance history,
-- vendor, evidence documents.

create table public.fm_assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  facility_id uuid not null,
  name text not null,
  category text not null default 'other',
  manufacturer text,
  model text,
  serial_number text,
  install_date date,
  warranty_expiry date,
  oem_id text,
  condition text not null default 'good',
  status text not null default 'pending',
  criticality text not null default 'unassessed',
  assigned_to_profile_id uuid,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_assets_org_id_unique unique (organisation_id, id),
  constraint fm_assets_org_id_facility_unique unique (organisation_id, id, facility_id),
  constraint fm_assets_name_nonempty check (char_length(trim(name)) > 0),
  constraint fm_assets_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_assets_category_check
    check (category in ('hvac', 'power', 'electrical', 'mechanical', 'vertical_transport', 'fire_safety', 'it', 'other')),
  constraint fm_assets_condition_check check (condition in ('excellent', 'good', 'fair', 'poor')),
  constraint fm_assets_status_check check (status in ('active', 'inactive', 'pending', 'suspended')),
  constraint fm_assets_criticality_check
    check (criticality in ('unassessed', 'low', 'medium', 'high', 'critical')),
  constraint fm_assets_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id)
    on delete restrict,
  constraint fm_assets_assigned_fk
    foreign key (organisation_id, assigned_to_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (assigned_to_profile_id),
  constraint fm_assets_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (created_by_profile_id),
  constraint fm_assets_updated_by_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (updated_by_profile_id)
);

create unique index fm_assets_org_code_uidx on public.fm_assets (organisation_id, lower(code));
create index fm_assets_org_facility_idx on public.fm_assets (organisation_id, facility_id);
create index fm_assets_org_status_idx on public.fm_assets (organisation_id, status);
create index fm_assets_org_category_idx on public.fm_assets (organisation_id, category);
create index fm_assets_org_created_idx on public.fm_assets (organisation_id, created_at desc);
create index fm_assets_org_assignee_idx on public.fm_assets (organisation_id, assigned_to_profile_id)
  where assigned_to_profile_id is not null;

create trigger fm_assets_set_updated_at
before update on public.fm_assets
for each row execute function public.set_updated_at();

comment on table public.fm_assets is
  'Canonical FM Asset register. UUID is authoritative; code (AST-YYYY-######) is the org-scoped display reference. Never deleted — status inactive is the soft-deactivation. Sheet Assets are frozen legacy.';
comment on column public.fm_assets.facility_id is
  'Facility UUID (tenant-safe FK). The Sheet stored the facility NAME; names are never relational identity.';
comment on column public.fm_assets.assigned_to_profile_id is
  'Assigned person as a profile UUID (the Sheet stored a free-text name).';

-- ---------------------------------------------------------------------------
-- Replace the opaque asset_ref text on the three operational tables.
-- Guarded: refuses to drop populated data (no relationship reconstruction).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.fm_incidents where asset_ref is not null)
     or exists (select 1 from public.fm_work where asset_ref is not null)
     or exists (select 1 from public.fm_work_instructions where asset_ref is not null) then
    raise exception 'asset_ref holds data; refusing to drop';
  end if;
end;
$$;

alter table public.fm_incidents drop column asset_ref;
alter table public.fm_work drop column asset_ref;
alter table public.fm_work_instructions drop column asset_ref;

alter table public.fm_incidents add column asset_id uuid;
alter table public.fm_work add column asset_id uuid;
alter table public.fm_work_instructions add column asset_id uuid;

-- Asset facility must equal the referencing record's facility. A null asset_id
-- skips the check (MATCH SIMPLE). Assets are never deleted (restrict).
alter table public.fm_incidents
  add constraint fm_incidents_asset_fk
  foreign key (organisation_id, asset_id, facility_id)
  references public.fm_assets (organisation_id, id, facility_id)
  on delete restrict;
alter table public.fm_work
  add constraint fm_work_asset_fk
  foreign key (organisation_id, asset_id, facility_id)
  references public.fm_assets (organisation_id, id, facility_id)
  on delete restrict;
alter table public.fm_work_instructions
  add constraint fm_work_instructions_asset_fk
  foreign key (organisation_id, asset_id, facility_id)
  references public.fm_assets (organisation_id, id, facility_id)
  on delete restrict;

create index fm_incidents_org_asset_idx on public.fm_incidents (organisation_id, asset_id) where asset_id is not null;
create index fm_work_org_asset_idx on public.fm_work (organisation_id, asset_id) where asset_id is not null;
create index fm_work_instructions_org_asset_idx on public.fm_work_instructions (organisation_id, asset_id) where asset_id is not null;

comment on column public.fm_incidents.asset_id is 'Asset this incident concerns (UUID FK; same facility). Optional.';
comment on column public.fm_work.asset_id is 'Asset this Work concerns (UUID FK; same facility). Optional.';
comment on column public.fm_work_instructions.asset_id is 'Asset this instruction concerns (UUID FK; same facility). Optional.';

-- ---------------------------------------------------------------------------
-- RLS — fail closed. No JWT table grants. No Super Admin bypass.
-- ---------------------------------------------------------------------------

alter table public.fm_assets enable row level security;
revoke all on table public.fm_assets from public, anon, authenticated;
grant all on table public.fm_assets to service_role;
