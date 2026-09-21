-- FM Master Data bootstrap: extend the migration-provenance target allowlist (additive only).
--
-- fm_migration_provenance may now also ledger the canonical Master Data entities reconstructed from genuine workbook
-- rows: fm_buildings, fm_floors, fm_rooms, fm_departments. Nothing else changes: no column, no other constraint, no
-- existing row. The ledger stays append-only, hash/identifier-only, and one target per (source row, target table).
-- Owner-confirmed structural decisions that have no workbook row are recorded at BATCH level (fm_migration_batches.sources),
-- never as a fabricated source row.

alter table public.fm_migration_provenance
  drop constraint fm_migration_provenance_target_check;

alter table public.fm_migration_provenance
  add constraint fm_migration_provenance_target_check
    check (target_table in (
      'fm_requests', 'fm_incidents', 'fm_assets', 'fm_work', 'fm_work_instructions',
      'fm_generator_logs', 'fm_diesel_usage', 'fm_consumables_items', 'fm_consumables_register_entries',
      'fm_buildings', 'fm_floors', 'fm_rooms', 'fm_departments'
    ));
