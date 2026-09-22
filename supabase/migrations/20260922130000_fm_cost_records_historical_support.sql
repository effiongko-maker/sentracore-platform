-- FM Costs & Claims: explicit historical support for fm_cost_records (same pattern as fm_work / fm_work_instructions
-- / fm_generator_logs). Additive only.
--
-- Live/operational cost creation is UNCHANGED: FmCostRepository.createCost (parseCreateCostRecordInput) still
-- requires location, category and evidence_reference, and recorded_at still defaults to now() when omitted. This
-- migration only lets an explicitly migrated historical execution cost truthfully represent fields the source does
-- not establish (location, category, evidence, recorded date), instead of forcing an empty string or "other"/now().
-- reimbursability already has an 'unknown' value and default — no change needed there.

alter table public.fm_cost_records
  add column record_origin text not null default 'operational';

alter table public.fm_cost_records
  add constraint fm_cost_records_record_origin_check
    check (record_origin in ('operational', 'migrated_historical'));

create trigger fm_cost_records_record_origin_immutable
before update on public.fm_cost_records
for each row execute function public.fm_prevent_record_origin_change();

comment on column public.fm_cost_records.record_origin is
  'operational (default; strict validation via the service layer) | migrated_historical (explicit migration: location, category, evidence_reference and recorded_at may be unknown). Immutable.';

-- category: 'unknown' is representable ONLY for migrated historical rows (mirrors fm_work.priority / fm_work.status).
alter table public.fm_cost_records drop constraint fm_cost_records_category_check;
alter table public.fm_cost_records
  add constraint fm_cost_records_category_check
    check (category in ('diesel_fuel', 'materials', 'spare_parts', 'labour', 'transportation', 'equipment', 'consumables', 'service', 'other', 'unknown'));
alter table public.fm_cost_records
  add constraint fm_cost_records_unknown_category_historical_only
    check (category <> 'unknown' or record_origin = 'migrated_historical');
comment on column public.fm_cost_records.category is
  'unknown = historical record whose category the source does not establish. It is NOT "other".';

-- location, evidence_reference, recorded_at: missing stays missing (NULL) for historical rows. Still required for
-- operational rows, enforced structurally (not only by the service layer), matching the fm_work.reported_at pattern.
alter table public.fm_cost_records alter column location drop not null;
alter table public.fm_cost_records
  add constraint fm_cost_records_operational_location_required
    check (record_origin <> 'operational' or location is not null);

alter table public.fm_cost_records alter column evidence_reference drop not null;
alter table public.fm_cost_records
  add constraint fm_cost_records_operational_evidence_required
    check (record_origin <> 'operational' or evidence_reference is not null);

alter table public.fm_cost_records alter column recorded_at drop not null;  -- default now() is kept for operational inserts
alter table public.fm_cost_records
  add constraint fm_cost_records_operational_recorded_at_required
    check (record_origin <> 'operational' or recorded_at is not null);
comment on column public.fm_cost_records.recorded_at is
  'When the cost was recorded/incurred, when known. NULL for a migrated historical row whose source states no such date (a payment-advice date is NOT this date). The now() default applies to operational inserts only.';

-- Provenance: fm_cost_records may now be ledgered (additive only; every existing row and every other constraint on
-- fm_migration_provenance is unchanged).
alter table public.fm_migration_provenance
  drop constraint fm_migration_provenance_target_check;
alter table public.fm_migration_provenance
  add constraint fm_migration_provenance_target_check
    check (target_table in (
      'fm_requests', 'fm_incidents', 'fm_assets', 'fm_work', 'fm_work_instructions',
      'fm_generator_logs', 'fm_diesel_usage', 'fm_consumables_items', 'fm_consumables_register_entries',
      'fm_buildings', 'fm_floors', 'fm_rooms', 'fm_departments', 'fm_cost_records'
    ));
