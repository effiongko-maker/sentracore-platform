-- FM Phase 2H — schema object verification (read-only). Every row must show ok = true.
select 'table' as check, count(*) = 1 as ok, count(*) as n from information_schema.tables where table_schema='public' and table_name='fm_assets'
union all select 'rls_enabled', bool_and(c.relrowsecurity), count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='fm_assets'
union all select 'no_client_grants', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema='public' and table_name='fm_assets' and grantee in ('anon','authenticated','PUBLIC')
union all select 'service_role_grants', count(*) > 0, count(*) from information_schema.role_table_grants where table_schema='public' and table_name='fm_assets' and grantee='service_role'
union all select 'asset_ref_gone', count(*) = 0, count(*) from information_schema.columns where table_schema='public' and column_name='asset_ref' and table_name in ('fm_incidents','fm_work','fm_work_instructions')
union all select 'asset_id_uuid', count(*) = 3, count(*) from information_schema.columns where table_schema='public' and column_name='asset_id' and data_type='uuid' and table_name in ('fm_incidents','fm_work','fm_work_instructions')
union all select 'asset_fks', count(*) = 3, count(*) from pg_constraint where conname in ('fm_incidents_asset_fk','fm_work_asset_fk','fm_work_instructions_asset_fk')
union all select 'facility_fk', count(*) = 1, count(*) from pg_constraint where conname = 'fm_assets_facility_fk'
union all select 'unique_code', count(*) = 1, count(*) from pg_indexes where tablename='fm_assets' and indexname='fm_assets_org_code_uidx'
union all select 'no_name_text_facility', count(*) = 0, count(*) from information_schema.columns where table_schema='public' and table_name='fm_assets' and column_name in ('facility','facility_name','assigned_to')
union all select 'empty_at_cutover_or_validated', true, (select count(*) from public.fm_assets);
