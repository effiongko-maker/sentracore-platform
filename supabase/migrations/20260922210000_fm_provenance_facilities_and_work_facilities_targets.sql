-- Additive only: widen the governed provenance target check to also accept fm_facilities (CSIRT facility
-- creation, owner-confirmed) and fm_work_facilities (multi-facility Work scope links). No existing target or
-- row is affected.
alter table public.fm_migration_provenance
  drop constraint fm_migration_provenance_target_check;
alter table public.fm_migration_provenance
  add constraint fm_migration_provenance_target_check
    check (target_table in (
      'fm_requests', 'fm_incidents', 'fm_assets', 'fm_work', 'fm_work_instructions',
      'fm_generator_logs', 'fm_diesel_usage', 'fm_consumables_items', 'fm_consumables_register_entries',
      'fm_buildings', 'fm_floors', 'fm_rooms', 'fm_departments', 'fm_cost_records',
      'platform_finance_historical_commercial_facts', 'fm_facilities', 'fm_work_facilities'
    ));
