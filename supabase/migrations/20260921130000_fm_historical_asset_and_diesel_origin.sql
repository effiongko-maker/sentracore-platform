-- FM historical model: explicit historical origin for assets and diesel usage (LOCAL until applied).
--
-- Same boundary philosophy as Work / Work Instructions / Incidents / generator logs:
--   record_origin = operational (default; strict) | migrated_historical (explicit migration).
-- Two importer-created false values are made representable as UNKNOWN instead:
--   * fm_assets.status      — the source Asset Register has no status column; the import had to write the schema
--                             default 'pending'. A migrated asset may now be status 'unknown'.
--   * fm_diesel_usage.generator_ref — the source MBORA diesel checklist is a whole-site tank measurement with no
--                             generator column; the import stored the SHEET NAME as a generator identity. A migrated
--                             row may now have NO generator (NULL).
-- Operational rows are unchanged: operational assets keep a valid operational status and operational diesel
-- entries still require a generator. No general nullability is introduced.

-- ---------------------------------------------------------------------------
-- 1. record_origin columns (existing rows default to 'operational')
-- ---------------------------------------------------------------------------

alter table public.fm_assets add column record_origin text not null default 'operational';
alter table public.fm_assets
  add constraint fm_assets_record_origin_check check (record_origin in ('operational', 'migrated_historical'));

alter table public.fm_diesel_usage add column record_origin text not null default 'operational';
alter table public.fm_diesel_usage
  add constraint fm_diesel_usage_record_origin_check check (record_origin in ('operational', 'migrated_historical'));

-- ---------------------------------------------------------------------------
-- 2. Backfill origin from the migration provenance ledger — the sole authority for "imported from a spreadsheet".
--    Runs BEFORE the immutability triggers exist. Only rows the ledger names are touched.
-- ---------------------------------------------------------------------------

update public.fm_assets a
set record_origin = 'migrated_historical'
from public.fm_migration_provenance p
where p.organisation_id = a.organisation_id
  and p.target_table = 'fm_assets'
  and p.target_id = a.id
  and a.record_origin = 'operational';

update public.fm_diesel_usage d
set record_origin = 'migrated_historical'
from public.fm_migration_provenance p
where p.organisation_id = d.organisation_id
  and p.target_table = 'fm_diesel_usage'
  and p.target_id = d.id
  and d.record_origin = 'operational';

create trigger fm_assets_record_origin_immutable
before update on public.fm_assets
for each row execute function public.fm_prevent_record_origin_change();

create trigger fm_diesel_usage_record_origin_immutable
before update on public.fm_diesel_usage
for each row execute function public.fm_prevent_record_origin_change();

comment on column public.fm_assets.record_origin is
  'operational (default; strict validation) | migrated_historical (explicit migration: status may be unknown). Immutable.';
comment on column public.fm_diesel_usage.record_origin is
  'operational (default; a generator is required) | migrated_historical (a whole-site tank measurement may have no generator). Immutable.';

-- ---------------------------------------------------------------------------
-- 3. Asset status: `unknown` for migrated historical assets ONLY
-- ---------------------------------------------------------------------------

alter table public.fm_assets drop constraint fm_assets_status_check;
alter table public.fm_assets
  add constraint fm_assets_status_check check (status in ('active', 'inactive', 'pending', 'suspended', 'unknown'));

alter table public.fm_assets
  add constraint fm_assets_unknown_status_historical_only
    check (status <> 'unknown' or record_origin = 'migrated_historical');

comment on column public.fm_assets.status is
  'unknown = a migrated historical asset whose source states no status. It is NOT pending; never render it as a recorded status.';

-- ---------------------------------------------------------------------------
-- 4. Diesel generator: NULL for migrated historical whole-site rows ONLY
-- ---------------------------------------------------------------------------

alter table public.fm_diesel_usage alter column generator_ref drop not null;

alter table public.fm_diesel_usage
  add constraint fm_diesel_usage_generator_required_operational
    check (generator_ref is not null or record_origin = 'migrated_historical');

comment on column public.fm_diesel_usage.generator_ref is
  'Generator identity. NULL only for a migrated historical whole-site tank row: no generator is evidenced and none is inferred.';
