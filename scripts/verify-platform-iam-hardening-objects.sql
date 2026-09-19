-- Platform IAM hardening — schema/policy verification (read-only). Every row must show ok = true.
select 'no_direct_write_policies' as check, count(*) = 0 as ok, count(*) as n
from pg_policies where schemaname = 'public' and (
  (tablename = 'platform_capability_grants' and cmd in ('INSERT','DELETE','UPDATE','ALL')) or
  (tablename = 'organisation_modules' and cmd in ('INSERT','DELETE','UPDATE','ALL')) or
  (tablename = 'user_role_assignments' and cmd in ('INSERT','DELETE','UPDATE','ALL')) or
  (tablename = 'organisations' and cmd in ('INSERT','DELETE','UPDATE','ALL')))
union all select 'no_client_write_grants', count(*) = 0, count(*)
from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  and table_name in ('platform_capability_grants','organisation_modules','user_role_assignments','organisations')
union all select 'reads_preserved', count(*) >= 4, count(*)
from pg_policies where schemaname = 'public' and cmd = 'SELECT'
  and tablename in ('platform_capability_grants','organisation_modules','user_role_assignments','organisations')
union all select 'profile_guard_bypass_only', position('is_platform_super_admin' in pg_get_functiondef('public.enforce_profile_update_guardrails()'::regprocedure)) = 0
  and position('can_manage_organisation' in pg_get_functiondef('public.enforce_profile_update_guardrails()'::regprocedure)) = 0, 1
union all select 'assignment_audit_trigger', count(*) = 1, count(*) from pg_trigger where tgname = 'fm_facility_assignments_audit' and not tgisinternal
union all select 'audit_fn_not_client_callable', count(*) = 0, count(*)
from information_schema.routine_privileges where routine_name = 'audit_fm_facility_assignment_change' and grantee in ('anon','authenticated','PUBLIC')
union all select 'audit_still_append_only', count(*) = 2, count(*) from pg_trigger where tgrelid = 'public.platform_iam_audit_events'::regclass and not tgisinternal;
