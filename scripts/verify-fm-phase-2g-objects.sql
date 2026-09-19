-- FM Phase 2G — schema object verification (read-only). Every row must show ok = true.
select 'tables' as check, count(*) = 5 as ok, count(*) as n
from information_schema.tables
where table_schema = 'public'
  and table_name in ('fm_cost_records','fm_cost_submissions','fm_cost_submission_items','fm_reimbursement_authorizations','fm_reimbursement_payments')
union all
select 'rls_enabled', bool_and(c.relrowsecurity), count(*)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('fm_cost_records','fm_cost_submissions','fm_cost_submission_items','fm_reimbursement_authorizations','fm_reimbursement_payments')
union all
select 'no_client_grants', count(*) = 0, count(*)
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated','PUBLIC')
  and table_name in ('fm_cost_records','fm_cost_submissions','fm_cost_submission_items','fm_reimbursement_authorizations','fm_reimbursement_payments')
union all
select 'service_role_grants', count(distinct table_name) = 5, count(distinct table_name)
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'service_role'
  and table_name in ('fm_cost_records','fm_cost_submissions','fm_cost_submission_items','fm_reimbursement_authorizations','fm_reimbursement_payments')
union all
select 'composite_fks', count(*) >= 8, count(*)
from pg_constraint
where conname in ('fm_cost_records_work_fk','fm_cost_records_work_instruction_fk')
   or conname like 'fm_cost_submission_items_%fk'
   or conname like 'fm_reimbursement_%fk'
union all
select 'triggers', count(*) >= 2, count(*)
from pg_trigger where not tgisinternal and tgname in ('fm_reimbursement_payments_guard','fm_reimbursement_authorizations_submission_guard')
union all
select 'one_auth_per_claim', count(*) = 1, count(*)
from pg_indexes where tablename = 'fm_reimbursement_authorizations' and indexdef ilike '%unique%' and indexdef ilike '%submission_id%'
union all
select 'no_child_id_arrays', count(*) = 0, count(*)
from information_schema.columns
where table_schema = 'public' and table_name in ('fm_cost_records','fm_cost_submissions','fm_cost_submission_items','fm_reimbursement_authorizations','fm_reimbursement_payments')
  and data_type = 'ARRAY'
union all
select 'wi_composite_unique', count(*) = 1, count(*)
from pg_constraint where conname = 'fm_work_instructions_org_id_facility_unique'
union all
select 'empty_at_cutover_or_validated', true, (select count(*) from public.fm_cost_records);
