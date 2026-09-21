-- FM historical model: correct the two importer-created false values (data-only; provenance-guarded).
--
-- This corrects a MIGRATION ARTEFACT, not source history. Each correction is limited to rows that the migration
-- provenance ledger names AND whose value the importer — not the source and not a person — introduced:
--   assets:  status 'pending' on a migrated asset that no person has edited (updated_by_profile_id is null).
--            Source proof: the Asset Register sheet has no status column, and the provenance transformations never
--            state a status; 'pending' is the schema default the import had to write.
--   diesel:  generator_ref equal to the row's own SOURCE SHEET NAME on a migrated row that no person has edited.
--            Source proof: the MBORA DIESEL Checklist has no generator column; a sheet name is provenance, and the
--            ledger already records it as source_sheet, so nothing is lost.
-- Opening / added / closing / consumption, condition, criticality, dates and every other value are untouched.
-- The migration is atomic and idempotent, and it ABORTS if any eligible row remains uncorrected.

do $$
declare
  fixed_assets integer;
  fixed_diesel integer;
  remaining_assets integer;
  remaining_diesel integer;
begin
  with c as (
    update public.fm_assets a
    set status = 'unknown'
    from public.fm_migration_provenance p
    where p.organisation_id = a.organisation_id
      and p.target_table = 'fm_assets'
      and p.target_id = a.id
      and a.record_origin = 'migrated_historical'
      and a.status = 'pending'
      and a.updated_by_profile_id is null
    returning a.id
  )
  select count(*) into fixed_assets from c;

  with c as (
    update public.fm_diesel_usage d
    set generator_ref = null
    from public.fm_migration_provenance p
    where p.organisation_id = d.organisation_id
      and p.target_table = 'fm_diesel_usage'
      and p.target_id = d.id
      and d.record_origin = 'migrated_historical'
      and d.generator_ref = p.source_sheet
      and d.updated_by_profile_id is null
    returning d.id
  )
  select count(*) into fixed_diesel from c;

  select count(*) into remaining_assets
  from public.fm_assets a
  join public.fm_migration_provenance p
    on p.organisation_id = a.organisation_id and p.target_table = 'fm_assets' and p.target_id = a.id
  where a.record_origin = 'migrated_historical' and a.status = 'pending' and a.updated_by_profile_id is null;

  select count(*) into remaining_diesel
  from public.fm_diesel_usage d
  join public.fm_migration_provenance p
    on p.organisation_id = d.organisation_id and p.target_table = 'fm_diesel_usage' and p.target_id = d.id
  where d.record_origin = 'migrated_historical' and d.generator_ref = p.source_sheet and d.updated_by_profile_id is null;

  if remaining_assets <> 0 or remaining_diesel <> 0 then
    raise exception 'historical correction incomplete: % asset(s) and % diesel row(s) still carry importer-created values',
      remaining_assets, remaining_diesel;
  end if;

  raise notice 'historical correction: % asset status(es) set to unknown, % diesel generator_ref(s) cleared', fixed_assets, fixed_diesel;
end $$;
