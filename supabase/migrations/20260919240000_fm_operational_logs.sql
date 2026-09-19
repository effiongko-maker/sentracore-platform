-- FM Phase 2K — Operational logs foundation (empty registers).
-- The seven Sheet-backed logs are SEPARATE domains that happen to share a
-- transport. Each gets its own table shaped by its actual fields; only the
-- genuinely common columns (tenant, display code, log date, remarks, actors,
-- timestamps) repeat. No generic payload table, no sparse union table.
--
--   fm_generator_logs      generator run: start/end -> hours (derived), fuel used     [no facility in the product]
--   fm_energy_readings     meter reading (compatibility register)                     [no facility in the product]
--   fm_diesel_usage        opening + added - closing -> consumption (derived)         [facility]
--   fm_waste_logs          waste type / quantity / unit / disposal method             [facility]
--   fm_fumigation_logs     area / pest / vendor (TEXT) / next due date                [facility]
--   fm_deep_cleaning_logs  area / vendor-team (TEXT) / status (free text)             [facility]
--   fm_consumables_items + fm_consumables_updates
--                          opening + received - issued -> closing (derived); the item
--                          is a stable per-facility identity (the Sheet's carry-forward key)
--
-- Sheet rows are NOT migrated: every legacy row was written on 2026-09-10 by
-- verification scripts (verify-operational-registers-write / write-audit / audit).
-- Vendor text on fumigation / deep cleaning stays TEXT — no fk to fm_vendors.
-- Derived values (hours, consumption, closing) are STORED GENERATED columns so they
-- can never be supplied or drift. Server-mediated only (RLS on, service_role only).

-- ---------------------------------------------------------------------------
-- fm_generator_logs
-- ---------------------------------------------------------------------------
create table public.fm_generator_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  log_date date not null,
  generator text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  hours numeric(10, 2) generated always as (
    round(greatest(0, extract(epoch from (ended_at - started_at)) / 3600.0)::numeric, 2)
  ) stored,
  fuel_used numeric(12, 2) not null,
  remarks text,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_generator_logs_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_generator_logs_generator_nonempty check (char_length(trim(generator)) > 0),
  constraint fm_generator_logs_created_by_fk foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_generator_logs_updated_by_fk foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);
create unique index fm_generator_logs_org_code_uidx on public.fm_generator_logs (organisation_id, lower(code));
create index fm_generator_logs_org_date_idx on public.fm_generator_logs (organisation_id, log_date desc);

-- ---------------------------------------------------------------------------
-- fm_energy_readings
-- ---------------------------------------------------------------------------
create table public.fm_energy_readings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  log_date date not null,
  meter text not null,
  reading numeric(16, 3) not null,
  remarks text,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_energy_readings_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_energy_readings_meter_nonempty check (char_length(trim(meter)) > 0),
  constraint fm_energy_readings_created_by_fk foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_energy_readings_updated_by_fk foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);
create unique index fm_energy_readings_org_code_uidx on public.fm_energy_readings (organisation_id, lower(code));
create index fm_energy_readings_org_date_idx on public.fm_energy_readings (organisation_id, log_date desc);

-- ---------------------------------------------------------------------------
-- fm_diesel_usage
-- ---------------------------------------------------------------------------
create table public.fm_diesel_usage (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  log_date date not null,
  facility_id uuid not null,
  generator_ref text not null,
  opening_level numeric(12, 2) not null,
  added numeric(12, 2) not null default 0,
  closing_level numeric(12, 2) not null,
  consumption numeric(12, 2) generated always as (round((opening_level + added - closing_level)::numeric, 2)) stored,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_diesel_usage_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_diesel_usage_generator_nonempty check (char_length(trim(generator_ref)) > 0),
  constraint fm_diesel_usage_facility_fk foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  constraint fm_diesel_usage_created_by_fk foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_diesel_usage_updated_by_fk foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);
create unique index fm_diesel_usage_org_code_uidx on public.fm_diesel_usage (organisation_id, lower(code));
create index fm_diesel_usage_org_facility_date_idx on public.fm_diesel_usage (organisation_id, facility_id, log_date desc);

-- ---------------------------------------------------------------------------
-- fm_waste_logs
-- ---------------------------------------------------------------------------
create table public.fm_waste_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  log_date date not null,
  facility_id uuid not null,
  waste_type text not null,
  quantity numeric(14, 3) not null,
  unit text not null,
  disposal_method text not null,
  remarks text,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_waste_logs_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_waste_logs_required_text check (
    char_length(trim(waste_type)) > 0 and char_length(trim(unit)) > 0 and char_length(trim(disposal_method)) > 0
  ),
  constraint fm_waste_logs_facility_fk foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  constraint fm_waste_logs_created_by_fk foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_waste_logs_updated_by_fk foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);
create unique index fm_waste_logs_org_code_uidx on public.fm_waste_logs (organisation_id, lower(code));
create index fm_waste_logs_org_facility_date_idx on public.fm_waste_logs (organisation_id, facility_id, log_date desc);

-- ---------------------------------------------------------------------------
-- fm_fumigation_logs  (vendor_name is a free-text label — NOT a fk to fm_vendors)
-- ---------------------------------------------------------------------------
create table public.fm_fumigation_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  log_date date not null,
  facility_id uuid not null,
  area_treated text not null,
  pest_type text not null,
  vendor_name text not null,
  next_due_date date not null,
  remarks text,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_fumigation_logs_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_fumigation_logs_required_text check (
    char_length(trim(area_treated)) > 0 and char_length(trim(pest_type)) > 0 and char_length(trim(vendor_name)) > 0
  ),
  constraint fm_fumigation_logs_facility_fk foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  constraint fm_fumigation_logs_created_by_fk foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_fumigation_logs_updated_by_fk foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);
create unique index fm_fumigation_logs_org_code_uidx on public.fm_fumigation_logs (organisation_id, lower(code));
create index fm_fumigation_logs_org_facility_date_idx on public.fm_fumigation_logs (organisation_id, facility_id, log_date desc);
create index fm_fumigation_logs_org_next_due_idx on public.fm_fumigation_logs (organisation_id, next_due_date);

-- ---------------------------------------------------------------------------
-- fm_deep_cleaning_logs  (vendor_team is a free-text label; status is free text
-- in the product — the Sheet defines no enum)
-- ---------------------------------------------------------------------------
create table public.fm_deep_cleaning_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  log_date date not null,
  facility_id uuid not null,
  area text not null,
  vendor_team text not null,
  status text not null,
  remarks text,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_deep_cleaning_logs_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_deep_cleaning_logs_required_text check (
    char_length(trim(area)) > 0 and char_length(trim(vendor_team)) > 0 and char_length(trim(status)) > 0
  ),
  constraint fm_deep_cleaning_logs_facility_fk foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  constraint fm_deep_cleaning_logs_created_by_fk foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_deep_cleaning_logs_updated_by_fk foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);
create unique index fm_deep_cleaning_logs_org_code_uidx on public.fm_deep_cleaning_logs (organisation_id, lower(code));
create index fm_deep_cleaning_logs_org_facility_date_idx on public.fm_deep_cleaning_logs (organisation_id, facility_id, log_date desc);

-- ---------------------------------------------------------------------------
-- Consumables: a per-facility item identity + its dated stock updates.
-- The item is the Sheet's implicit carry-forward key (facility + item name); making it
-- explicit gives updates a real relationship instead of repeated name matching.
-- ---------------------------------------------------------------------------
create table public.fm_consumables_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  facility_id uuid not null,
  name text not null,
  created_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_consumables_items_org_id_unique unique (organisation_id, id),
  constraint fm_consumables_items_org_id_facility_unique unique (organisation_id, id, facility_id),
  constraint fm_consumables_items_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_consumables_items_name_nonempty check (char_length(trim(name)) > 0),
  constraint fm_consumables_items_facility_fk foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  constraint fm_consumables_items_created_by_fk foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id)
);
create unique index fm_consumables_items_org_code_uidx on public.fm_consumables_items (organisation_id, lower(code));
create unique index fm_consumables_items_facility_name_uidx on public.fm_consumables_items (organisation_id, facility_id, lower(name));

create table public.fm_consumables_updates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  log_date date not null,
  facility_id uuid not null,
  item_id uuid not null,
  opening numeric(14, 2) not null,
  received numeric(14, 2) not null default 0,
  issued numeric(14, 2) not null,
  closing numeric(14, 2) generated always as (round((opening + received - issued)::numeric, 2)) stored,
  reorder_level numeric(14, 2),
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_consumables_updates_code_nonempty check (char_length(trim(code)) > 0),
  -- The update's facility must equal its item's facility.
  constraint fm_consumables_updates_item_fk foreign key (organisation_id, item_id, facility_id)
    references public.fm_consumables_items (organisation_id, id, facility_id) on delete restrict,
  constraint fm_consumables_updates_facility_fk foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  constraint fm_consumables_updates_created_by_fk foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_consumables_updates_updated_by_fk foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);
create unique index fm_consumables_updates_org_code_uidx on public.fm_consumables_updates (organisation_id, lower(code));
create index fm_consumables_updates_org_facility_date_idx on public.fm_consumables_updates (organisation_id, facility_id, log_date desc);
create index fm_consumables_updates_org_item_date_idx on public.fm_consumables_updates (organisation_id, item_id, log_date desc);

-- updated_at triggers + RLS (fail closed; service_role only)
create trigger fm_generator_logs_set_updated_at before update on public.fm_generator_logs for each row execute function public.set_updated_at();
create trigger fm_energy_readings_set_updated_at before update on public.fm_energy_readings for each row execute function public.set_updated_at();
create trigger fm_diesel_usage_set_updated_at before update on public.fm_diesel_usage for each row execute function public.set_updated_at();
create trigger fm_waste_logs_set_updated_at before update on public.fm_waste_logs for each row execute function public.set_updated_at();
create trigger fm_fumigation_logs_set_updated_at before update on public.fm_fumigation_logs for each row execute function public.set_updated_at();
create trigger fm_deep_cleaning_logs_set_updated_at before update on public.fm_deep_cleaning_logs for each row execute function public.set_updated_at();
create trigger fm_consumables_updates_set_updated_at before update on public.fm_consumables_updates for each row execute function public.set_updated_at();

alter table public.fm_generator_logs enable row level security;
alter table public.fm_energy_readings enable row level security;
alter table public.fm_diesel_usage enable row level security;
alter table public.fm_waste_logs enable row level security;
alter table public.fm_fumigation_logs enable row level security;
alter table public.fm_deep_cleaning_logs enable row level security;
alter table public.fm_consumables_items enable row level security;
alter table public.fm_consumables_updates enable row level security;

revoke all on table public.fm_generator_logs, public.fm_energy_readings, public.fm_diesel_usage, public.fm_waste_logs,
  public.fm_fumigation_logs, public.fm_deep_cleaning_logs, public.fm_consumables_items, public.fm_consumables_updates
  from public, anon, authenticated;
grant all on table public.fm_generator_logs, public.fm_energy_readings, public.fm_diesel_usage, public.fm_waste_logs,
  public.fm_fumigation_logs, public.fm_deep_cleaning_logs, public.fm_consumables_items, public.fm_consumables_updates
  to service_role;

comment on table public.fm_generator_logs is 'FM generator run log. hours is GENERATED from started_at/ended_at. Not facility-scoped in the product. Sheet GeneratorLogs is frozen legacy.';
comment on table public.fm_diesel_usage is 'FM diesel usage. consumption is GENERATED (opening + added - closing). generator_ref is an opaque label — no generator register exists.';
comment on table public.fm_fumigation_logs is 'FM fumigation log. vendor_name is free text — deliberately NOT linked to fm_vendors.';
comment on table public.fm_deep_cleaning_logs is 'FM deep-cleaning log. vendor_team and status are free text (no enum in the product).';
comment on table public.fm_consumables_updates is 'FM consumables stock update. closing is GENERATED (opening + received - issued). item_id is a per-facility item identity.';
