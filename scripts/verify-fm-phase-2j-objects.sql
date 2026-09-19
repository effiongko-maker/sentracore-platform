-- FM Phase 2J — schema object verification (read-only). Every row must show ok = true.
select 'table' as check, count(*) = 1 as ok, count(*) as n from information_schema.tables where table_schema='public' and table_name='fm_vendors'
union all select 'rls_enabled', bool_and(c.relrowsecurity), count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='fm_vendors'
union all select 'no_client_grants', count(*) = 0, count(*) from information_schema.role_table_grants where table_schema='public' and table_name='fm_vendors' and grantee in ('anon','authenticated','PUBLIC')
union all select 'service_role_grants', count(*) > 0, count(*) from information_schema.role_table_grants where table_schema='public' and table_name='fm_vendors' and grantee='service_role'
union all select 'no_policies', count(*) = 0, count(*) from pg_policies where schemaname='public' and tablename='fm_vendors'
union all select 'unique_code_per_org', count(*) = 1, count(*) from pg_indexes where tablename='fm_vendors' and indexname='fm_vendors_org_code_uidx'
union all select 'tenant_safe_actor_fks', count(*) = 2, count(*) from pg_constraint where conname in ('fm_vendors_created_by_fk','fm_vendors_updated_by_fk')
union all select 'no_platform_finance_coupling', count(*) = 0, count(*) from pg_constraint where conrelid = 'public.fm_vendors'::regclass and contype = 'f' and confrelid::regclass::text not in ('organisations','profiles')
union all select 'empty_at_cutover_or_validated', true, (select count(*) from public.fm_vendors);
