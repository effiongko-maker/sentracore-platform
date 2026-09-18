-- Align ECC table RLS with application authority.
-- Authenticated ECC business-data access requires:
--   1. an attached active profile for that organisation (not SA membership bypass)
--   2. explicit platform.ecc_operations.view
-- Super Admin, org membership, and module enablement do NOT grant ECC data.
-- service_role continues to bypass RLS (ECC Next.js repositories use admin client).

create or replace function public.has_ecc_operations_access(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_organisation_id is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.organisation_id = p_organisation_id
        and p.status = 'active'
    )
    and public.has_platform_capability(
      p_organisation_id,
      'platform.ecc_operations.view'
    );
$$;

revoke all on function public.has_ecc_operations_access(uuid) from public;
revoke all on function public.has_ecc_operations_access(uuid) from anon, authenticated;
grant execute on function public.has_ecc_operations_access(uuid) to authenticated;

comment on function public.has_ecc_operations_access(uuid) is
  'ECC business-data access: attached active profile + explicit platform.ecc_operations.view. No Super Admin bypass.';

-- ---------------------------------------------------------------------------
-- Drop existing authenticated ECC policies (all ecc_* tables)
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename like 'ecc_%'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recreate policies: organisation-attached + ECC view capability
-- ---------------------------------------------------------------------------

-- Centres
create policy ecc_centres_select on public.ecc_centres
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_centres_insert on public.ecc_centres
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_centres_update on public.ecc_centres
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

-- Daily ops
create policy ecc_daily_ops_select on public.ecc_daily_ops
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_daily_ops_insert on public.ecc_daily_ops
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

-- Issues
create policy ecc_issues_select on public.ecc_issues
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_issues_insert on public.ecc_issues
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_issues_update on public.ecc_issues
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_issues_delete on public.ecc_issues
for delete to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_issue_history_select on public.ecc_issue_history
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_issue_history_insert on public.ecc_issue_history
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

-- Requests
create policy ecc_requests_select on public.ecc_requests
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_requests_insert on public.ecc_requests
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_requests_update on public.ecc_requests
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_request_history_select on public.ecc_request_history
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_request_history_insert on public.ecc_request_history
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

-- Junctions
create policy ecc_daily_ops_issue_links_select on public.ecc_daily_ops_issue_links
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_daily_ops_issue_links_insert on public.ecc_daily_ops_issue_links
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_daily_ops_issue_links_delete on public.ecc_daily_ops_issue_links
for delete to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_daily_ops_request_links_select on public.ecc_daily_ops_request_links
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_daily_ops_request_links_insert on public.ecc_daily_ops_request_links
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_daily_ops_request_links_delete on public.ecc_daily_ops_request_links
for delete to authenticated
using (public.has_ecc_operations_access(organisation_id));

-- People / roster
create policy ecc_people_select on public.ecc_people
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_people_insert on public.ecc_people
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_people_update on public.ecc_people
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_people_delete on public.ecc_people
for delete to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_shifts_select on public.ecc_shifts
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_shifts_insert on public.ecc_shifts
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_shifts_update on public.ecc_shifts
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_shifts_delete on public.ecc_shifts
for delete to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_shift_assignments_select on public.ecc_shift_assignments
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_shift_assignments_insert on public.ecc_shift_assignments
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_shift_assignments_delete on public.ecc_shift_assignments
for delete to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_attendance_select on public.ecc_attendance
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_attendance_insert on public.ecc_attendance
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_attendance_update on public.ecc_attendance
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

-- ECC finance (operational ECC, not Platform Finance)
create policy ecc_finance_budgets_select on public.ecc_finance_budgets
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_finance_budgets_insert on public.ecc_finance_budgets
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_finance_budgets_update on public.ecc_finance_budgets
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_finance_transactions_select on public.ecc_finance_transactions
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_finance_transactions_insert on public.ecc_finance_transactions
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_finance_transactions_update on public.ecc_finance_transactions
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_finance_commitments_select on public.ecc_finance_commitments
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_finance_commitments_insert on public.ecc_finance_commitments
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));

create policy ecc_finance_commitments_update on public.ecc_finance_commitments
for update to authenticated
using (public.has_ecc_operations_access(organisation_id))
with check (public.has_ecc_operations_access(organisation_id));

-- ECC domain audit (not IAM)
create policy ecc_audit_events_select on public.ecc_audit_events
for select to authenticated
using (public.has_ecc_operations_access(organisation_id));

create policy ecc_audit_events_insert on public.ecc_audit_events
for insert to authenticated
with check (public.has_ecc_operations_access(organisation_id));
