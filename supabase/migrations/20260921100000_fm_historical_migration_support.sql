-- FM historical migration support (LOCAL — not applied to any remote database in this phase).
--
-- Core law: STRICT FORWARD OPERATIONAL DATA vs EXPLICITLY MIGRATED HISTORICAL DATA.
-- Every relaxation below is gated on record_origin = 'migrated_historical' (or a historical-only
-- table/basis). Rows created through the product keep the default record_origin = 'operational'
-- and therefore keep every existing validation. Unknown is data: unknown lifecycle facts are stored
-- as NULL / 'unknown' — never inferred from Paid/Pending or any commercial evidence.

-- ---------------------------------------------------------------------------
-- 0. record_origin immutability helper (origin can never be changed after insert)
-- ---------------------------------------------------------------------------

create or replace function public.fm_prevent_record_origin_change()
returns trigger
language plpgsql
as $$
begin
  if new.record_origin is distinct from old.record_origin then
    raise exception 'record_origin is immutable (%.%)', tg_table_name, old.id using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. fm_work: explicit historical mechanism
-- ---------------------------------------------------------------------------

alter table public.fm_work
  add column record_origin text not null default 'operational';

alter table public.fm_work
  add constraint fm_work_record_origin_check
    check (record_origin in ('operational', 'migrated_historical'));

alter table public.fm_work alter column reported_at drop not null;  -- default now() is kept for operational inserts

alter table public.fm_work
  add constraint fm_work_operational_reported_at_required
    check (record_origin <> 'operational' or reported_at is not null);

alter table public.fm_work drop constraint fm_work_status_check;
alter table public.fm_work
  add constraint fm_work_status_check
    check (status in ('requested', 'triaged', 'scheduled', 'in_progress', 'on_hold', 'completed', 'cancelled', 'unknown'));

alter table public.fm_work
  add constraint fm_work_unknown_status_historical_only
    check (status <> 'unknown' or record_origin = 'migrated_historical');

alter table public.fm_work drop constraint fm_work_completed_requires_timestamp;
alter table public.fm_work
  add constraint fm_work_completed_requires_timestamp
    check (status <> 'completed' or completed_at is not null or record_origin = 'migrated_historical');

create trigger fm_work_record_origin_immutable
before update on public.fm_work
for each row execute function public.fm_prevent_record_origin_change();

comment on column public.fm_work.record_origin is
  'operational (default; strict validation) | migrated_historical (explicit migration: reported_at may be unknown, status may be unknown, completed may lack completed_at). Immutable.';

-- ---------------------------------------------------------------------------
-- 2. fm_work_instructions: same mechanism
-- ---------------------------------------------------------------------------

alter table public.fm_work_instructions
  add column record_origin text not null default 'operational';

alter table public.fm_work_instructions
  add constraint fm_work_instructions_record_origin_check
    check (record_origin in ('operational', 'migrated_historical'));

alter table public.fm_work_instructions alter column requested_at drop not null;

alter table public.fm_work_instructions
  add constraint fm_work_instructions_operational_requested_at_required
    check (record_origin <> 'operational' or requested_at is not null);

alter table public.fm_work_instructions drop constraint fm_work_instructions_status_check;
alter table public.fm_work_instructions
  add constraint fm_work_instructions_status_check
    check (status in ('draft', 'open', 'assigned', 'in_progress', 'on_hold', 'completed', 'cancelled', 'closed', 'unknown'));

alter table public.fm_work_instructions
  add constraint fm_work_instructions_unknown_status_historical_only
    check (status <> 'unknown' or record_origin = 'migrated_historical');

alter table public.fm_work_instructions drop constraint fm_work_instructions_completed_requires_timestamp;
alter table public.fm_work_instructions
  add constraint fm_work_instructions_completed_requires_timestamp
    check (status <> 'completed' or completed_at is not null or record_origin = 'migrated_historical');

create trigger fm_work_instructions_record_origin_immutable
before update on public.fm_work_instructions
for each row execute function public.fm_prevent_record_origin_change();

comment on column public.fm_work_instructions.record_origin is
  'operational (default; strict) | migrated_historical (requested_at / status / completion may be unknown). Immutable.';

-- ---------------------------------------------------------------------------
-- 3. fm_assets: explicit unknown condition (existing values untouched, default stays 'good')
-- ---------------------------------------------------------------------------

alter table public.fm_assets drop constraint fm_assets_condition_check;
alter table public.fm_assets
  add constraint fm_assets_condition_check
    check (condition in ('excellent', 'good', 'fair', 'poor', 'unknown'));

comment on column public.fm_assets.condition is
  'unknown = condition not assessed/recorded. It is NOT good; never render or count it as healthy.';

-- ---------------------------------------------------------------------------
-- 4. fm_generator_logs: represent hour-meter facts without inventing clock times
-- ---------------------------------------------------------------------------

alter table public.fm_generator_logs
  add column log_basis text not null default 'clock_times',
  add column start_meter_reading numeric(12, 1),
  add column end_meter_reading numeric(12, 1),
  add column asset_id uuid,
  add column record_origin text not null default 'operational';

alter table public.fm_generator_logs
  add constraint fm_generator_logs_log_basis_check check (log_basis in ('clock_times', 'hour_meter')),
  add constraint fm_generator_logs_record_origin_check check (record_origin in ('operational', 'migrated_historical')),
  add constraint fm_generator_logs_asset_fk
    foreign key (organisation_id, asset_id)
    references public.fm_assets (organisation_id, id)
    on delete set null (asset_id);

alter table public.fm_generator_logs
  alter column started_at drop not null,
  alter column ended_at drop not null,
  alter column fuel_used drop not null;

-- runtime is DERIVED: clock basis from timestamps (unchanged), hour-meter basis from readings.
alter table public.fm_generator_logs drop column hours;
alter table public.fm_generator_logs
  add column hours numeric(10, 2) generated always as (
    case
      when log_basis = 'hour_meter' then round(greatest(0, end_meter_reading - start_meter_reading)::numeric, 2)
      else round(greatest(0, extract(epoch from (ended_at - started_at)) / 3600.0)::numeric, 2)
    end
  ) stored;

alter table public.fm_generator_logs
  add constraint fm_generator_logs_clock_basis_strict
    check (
      log_basis <> 'clock_times'
      or (started_at is not null and ended_at is not null and fuel_used is not null
          and start_meter_reading is null and end_meter_reading is null)
    ),
  add constraint fm_generator_logs_hour_meter_basis
    check (
      log_basis <> 'hour_meter'
      or (start_meter_reading is not null and end_meter_reading is not null
          and end_meter_reading >= start_meter_reading
          and started_at is null and ended_at is null
          and record_origin = 'migrated_historical')
    );

create trigger fm_generator_logs_record_origin_immutable
before update on public.fm_generator_logs
for each row execute function public.fm_prevent_record_origin_change();

comment on column public.fm_generator_logs.fuel_used is
  'Nullable ONLY for hour_meter basis: NULL = fuel not recorded (unknown), never zero.';
comment on column public.fm_generator_logs.log_basis is
  'clock_times (operational; started_at/ended_at/fuel_used required) | hour_meter (historical; meter readings, no invented clock times).';

-- ---------------------------------------------------------------------------
-- 5. Historical consumables register evidence (NOT a dated update / issuance transaction)
-- ---------------------------------------------------------------------------

create table public.fm_consumables_register_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  facility_id uuid not null,
  item_id uuid not null,
  record_origin text not null default 'migrated_historical',
  -- The register carries no transaction date. NULL = unknown.
  snapshot_date date,
  opening_quantity numeric(14, 2),
  opening_unit text,
  received_quantity numeric(14, 2),
  received_unit text,
  issued_quantity numeric(14, 2),
  issued_unit text,
  closing_quantity numeric(14, 2),
  closing_unit text,
  reorder_level_quantity numeric(14, 2),
  reorder_level_unit text,
  -- Source cell text preserved verbatim per field (e.g. '19 Gallons', '-', '12pcs').
  raw_opening text,
  raw_received text,
  raw_issued text,
  raw_closing text,
  raw_reorder_level text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_consumables_register_entries_origin_check check (record_origin = 'migrated_historical'),
  constraint fm_consumables_register_entries_item_fk
    foreign key (organisation_id, item_id, facility_id)
    references public.fm_consumables_items (organisation_id, id, facility_id) on delete restrict,
  constraint fm_consumables_register_entries_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  -- A quantity and its unit travel together; units are explicit per field and never reconciled across fields.
  constraint fm_consumables_register_entries_opening_unit check ((opening_quantity is null) = (opening_unit is null)),
  constraint fm_consumables_register_entries_received_unit check ((received_quantity is null) = (received_unit is null)),
  constraint fm_consumables_register_entries_issued_unit check ((issued_quantity is null) = (issued_unit is null)),
  constraint fm_consumables_register_entries_closing_unit check ((closing_quantity is null) = (closing_unit is null)),
  constraint fm_consumables_register_entries_reorder_unit check ((reorder_level_quantity is null) = (reorder_level_unit is null)),
  constraint fm_consumables_register_entries_nonnegative check (
    coalesce(opening_quantity, 0) >= 0 and coalesce(received_quantity, 0) >= 0
    and coalesce(issued_quantity, 0) >= 0 and coalesce(closing_quantity, 0) >= 0
    and coalesce(reorder_level_quantity, 0) >= 0
  )
);

create index fm_consumables_register_entries_item_idx
  on public.fm_consumables_register_entries (organisation_id, item_id);

comment on table public.fm_consumables_register_entries is
  'Historical consumables REGISTER evidence: opening/received/issued/closing/reorder as recorded, with explicit units and NO derived balance. Distinct from fm_consumables_updates (dated operational transactions with generated closing). closing is stored only when the source states it.';

-- ---------------------------------------------------------------------------
-- 6. Centralised, append-only migration provenance (not a second source of operational truth)
-- ---------------------------------------------------------------------------

create table public.fm_migration_batches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  batch_key text not null,
  rules_version text not null,
  -- [{ "workbook": "...", "file": "...", "sha256": "<64 hex>" }]
  sources jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_migration_batches_key_unique unique (organisation_id, batch_key),
  constraint fm_migration_batches_org_id_unique unique (organisation_id, id),
  constraint fm_migration_batches_key_nonempty check (char_length(trim(batch_key)) > 0)
);

create table public.fm_migration_provenance (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  batch_id uuid not null,
  workbook text not null,
  workbook_sha256 text not null,
  source_sheet text not null,
  source_row integer not null,
  source_reference text,
  -- Immutable fingerprint of the source row payload (hash only — no operational values are copied here).
  fingerprint text not null,
  target_table text not null,
  target_id uuid not null,
  classification text not null,
  transformations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_migration_provenance_batch_fk
    foreign key (organisation_id, batch_id) references public.fm_migration_batches (organisation_id, id) on delete restrict,
  constraint fm_migration_provenance_sha_check check (workbook_sha256 ~ '^[0-9a-f]{64}$' and fingerprint ~ '^[0-9a-f]{64}$'),
  constraint fm_migration_provenance_row_check check (source_row > 0),
  constraint fm_migration_provenance_target_check
    check (target_table in (
      'fm_requests', 'fm_incidents', 'fm_assets', 'fm_work', 'fm_work_instructions',
      'fm_generator_logs', 'fm_diesel_usage', 'fm_consumables_items', 'fm_consumables_register_entries'
    )),
  constraint fm_migration_provenance_class_check
    check (classification in ('IMPORT', 'TRANSFORM_IMPORT', 'BOOTSTRAP')),
  -- Deterministic rerun / idempotency: one target per (immutable source row, target table).
  constraint fm_migration_provenance_source_unique
    unique (organisation_id, workbook_sha256, source_sheet, source_row, target_table),
  constraint fm_migration_provenance_target_unique
    unique (organisation_id, target_table, target_id)
);

create index fm_migration_provenance_batch_idx on public.fm_migration_provenance (organisation_id, batch_id);

create or replace function public.fm_migration_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;

create trigger fm_migration_batches_append_only
before update or delete on public.fm_migration_batches
for each row execute function public.fm_migration_append_only();
create trigger fm_migration_provenance_append_only
before update or delete on public.fm_migration_provenance
for each row execute function public.fm_migration_append_only();

comment on table public.fm_migration_provenance is
  'Audit/idempotency ledger linking an imported FM record to its immutable source row. Holds hashes and identifiers only — never operational values; the target table remains the sole operational truth.';

alter table public.fm_consumables_register_entries enable row level security;
alter table public.fm_migration_batches enable row level security;
alter table public.fm_migration_provenance enable row level security;

revoke all on table public.fm_consumables_register_entries, public.fm_migration_batches, public.fm_migration_provenance
  from public, anon, authenticated;
grant select, insert on table public.fm_consumables_register_entries to service_role;
grant select, insert on table public.fm_migration_batches, public.fm_migration_provenance to service_role;
