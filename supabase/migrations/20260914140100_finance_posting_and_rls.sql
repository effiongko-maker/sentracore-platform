-- Platform Finance Phase 1: posting RPCs + RLS.
-- Journal posting is atomic via SECURITY DEFINER RPC (not client multi-statement).

-- ---------------------------------------------------------------------------
-- finance_post_transaction
-- ---------------------------------------------------------------------------

create or replace function public.finance_post_transaction(
  p_transaction_id uuid,
  p_actor_profile_id uuid,
  p_lines jsonb,
  p_period_id uuid default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ft public.finance_transactions%rowtype;
  v_period public.finance_periods%rowtype;
  v_company_org uuid;
  v_entry_id uuid;
  v_line jsonb;
  v_line_no int := 0;
  v_account_id uuid;
  v_debit numeric(18, 2);
  v_credit numeric(18, 2);
  v_line_desc text;
  v_sum_debit numeric(18, 2) := 0;
  v_sum_credit numeric(18, 2) := 0;
  v_account_org uuid;
  v_account_status text;
  v_line_count int;
begin
  if p_transaction_id is null then
    raise exception 'finance_post_transaction: p_transaction_id is required';
  end if;
  if p_actor_profile_id is null then
    raise exception 'finance_post_transaction: p_actor_profile_id is required';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'finance_post_transaction: p_lines must be a JSON array';
  end if;

  v_line_count := jsonb_array_length(p_lines);
  if v_line_count < 2 then
    raise exception 'finance_post_transaction: at least two journal lines are required';
  end if;

  select * into v_ft
  from public.finance_transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'finance_post_transaction: financial transaction % not found', p_transaction_id;
  end if;

  if v_ft.status = 'posted' or v_ft.journal_entry_id is not null then
    raise exception
      'finance_post_transaction: financial transaction % is already posted (journal_entry_id=%)',
      p_transaction_id,
      v_ft.journal_entry_id;
  end if;

  if v_ft.status <> 'draft' then
    raise exception
      'finance_post_transaction: financial transaction % must be draft (status=%)',
      p_transaction_id,
      v_ft.status;
  end if;

  v_company_org := v_ft.organisation_id;

  if p_period_id is not null then
    select * into v_period
    from public.finance_periods
    where id = p_period_id
    for update;

    if not found then
      raise exception 'finance_post_transaction: period % not found', p_period_id;
    end if;

    if v_period.company_id <> v_ft.company_id then
      raise exception 'finance_post_transaction: period company does not match transaction company';
    end if;

    if v_period.status <> 'open' then
      raise exception 'finance_post_transaction: period % is closed', p_period_id;
    end if;

    if v_ft.transaction_date < v_period.start_date
      or v_ft.transaction_date > v_period.end_date
    then
      raise exception
        'finance_post_transaction: transaction_date % is outside period % (% to %)',
        v_ft.transaction_date,
        p_period_id,
        v_period.start_date,
        v_period.end_date;
    end if;
  else
    select * into v_period
    from public.finance_periods
    where company_id = v_ft.company_id
      and status = 'open'
      and start_date <= v_ft.transaction_date
      and end_date >= v_ft.transaction_date
    order by start_date desc
    limit 1
    for update;

    if not found then
      raise exception
        'finance_post_transaction: no open period for company % covering %',
        v_ft.company_id,
        v_ft.transaction_date;
    end if;
  end if;

  if v_period.status = 'closed' then
    raise exception 'finance_post_transaction: cannot post into closed period %', v_period.id;
  end if;

  -- Validate lines before any inserts
  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'finance_post_transaction: each line must be a JSON object';
    end if;

    begin
      v_account_id := (v_line->>'account_id')::uuid;
    exception
      when others then
        raise exception 'finance_post_transaction: line account_id must be a uuid';
    end;

    if v_account_id is null then
      raise exception 'finance_post_transaction: line account_id is required';
    end if;

    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);

    if v_debit < 0 or v_credit < 0 then
      raise exception 'finance_post_transaction: debit and credit must be non-negative';
    end if;

    if not (
      (v_debit > 0 and v_credit = 0)
      or (v_credit > 0 and v_debit = 0)
    ) then
      raise exception
        'finance_post_transaction: each line must have exactly one of debit or credit > 0';
    end if;

    select organisation_id, status
      into v_account_org, v_account_status
    from public.finance_accounts
    where id = v_account_id;

    if not found then
      raise exception 'finance_post_transaction: account % not found', v_account_id;
    end if;

    if v_account_org <> v_company_org then
      raise exception
        'finance_post_transaction: account % organisation does not match company organisation',
        v_account_id;
    end if;

    if v_account_status <> 'active' then
      raise exception 'finance_post_transaction: account % is not active', v_account_id;
    end if;

    v_sum_debit := v_sum_debit + v_debit;
    v_sum_credit := v_sum_credit + v_credit;
  end loop;

  if v_sum_debit <> v_sum_credit then
    raise exception
      'finance_post_transaction: unbalanced entry (debit=% credit=%)',
      v_sum_debit,
      v_sum_credit;
  end if;

  insert into public.finance_journal_entries (
    organisation_id,
    company_id,
    period_id,
    transaction_id,
    entry_date,
    reference,
    description,
    status,
    posted_at,
    posted_by_profile_id
  )
  values (
    v_ft.organisation_id,
    v_ft.company_id,
    v_period.id,
    v_ft.id,
    v_ft.transaction_date,
    v_ft.reference,
    v_ft.description,
    'posted',
    timezone('utc', now()),
    p_actor_profile_id
  )
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_line_no := v_line_no + 1;
    v_account_id := (v_line->>'account_id')::uuid;
    v_debit := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    v_line_desc := nullif(trim(coalesce(v_line->>'description', '')), '');

    insert into public.finance_journal_lines (
      journal_entry_id,
      account_id,
      line_no,
      description,
      debit,
      credit
    )
    values (
      v_entry_id,
      v_account_id,
      v_line_no,
      v_line_desc,
      v_debit,
      v_credit
    );
  end loop;

  update public.finance_transactions
  set
    status = 'posted',
    journal_entry_id = v_entry_id,
    posted_at = timezone('utc', now()),
    posted_by_profile_id = p_actor_profile_id,
    updated_at = timezone('utc', now())
  where id = v_ft.id;

  insert into public.finance_audit_events (
    organisation_id,
    company_id,
    actor_profile_id,
    action,
    object_type,
    object_id,
    reason,
    details
  )
  values (
    v_ft.organisation_id,
    v_ft.company_id,
    p_actor_profile_id,
    'finance.transaction.posted',
    'finance_transaction',
    v_ft.id::text,
    p_reason,
    jsonb_build_object(
      'journal_entry_id', v_entry_id,
      'period_id', v_period.id,
      'line_count', v_line_count,
      'total_debit', v_sum_debit,
      'total_credit', v_sum_credit
    )
  );

  return v_entry_id;
exception
  when unique_violation then
    raise exception
      'finance_post_transaction: financial transaction % already has a journal entry',
      p_transaction_id;
end;
$$;

comment on function public.finance_post_transaction(uuid, uuid, jsonb, uuid, text) is
  'Atomically post a draft FinancialTransaction into an immutable Journal entry.';

-- ---------------------------------------------------------------------------
-- finance_close_period
-- ---------------------------------------------------------------------------

create or replace function public.finance_close_period(
  p_period_id uuid,
  p_actor_profile_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.finance_periods%rowtype;
begin
  if p_period_id is null then
    raise exception 'finance_close_period: p_period_id is required';
  end if;
  if p_actor_profile_id is null then
    raise exception 'finance_close_period: p_actor_profile_id is required';
  end if;

  select * into v_period
  from public.finance_periods
  where id = p_period_id
  for update;

  if not found then
    raise exception 'finance_close_period: period % not found', p_period_id;
  end if;

  if v_period.status = 'closed' then
    raise exception 'finance_close_period: period % is already closed', p_period_id;
  end if;

  update public.finance_periods
  set
    status = 'closed',
    closed_at = timezone('utc', now()),
    closed_by_profile_id = p_actor_profile_id,
    updated_at = timezone('utc', now())
  where id = p_period_id;

  insert into public.finance_audit_events (
    organisation_id,
    company_id,
    actor_profile_id,
    action,
    object_type,
    object_id,
    reason,
    details
  )
  values (
    v_period.organisation_id,
    v_period.company_id,
    p_actor_profile_id,
    'finance.period.closed',
    'finance_period',
    p_period_id::text,
    p_reason,
    jsonb_build_object(
      'year', v_period.year,
      'month', v_period.month,
      'start_date', v_period.start_date,
      'end_date', v_period.end_date
    )
  );

  return p_period_id;
end;
$$;

comment on function public.finance_close_period(uuid, uuid, text) is
  'Close an open finance period. No reopen in v1.';

revoke all on function public.finance_post_transaction(uuid, uuid, jsonb, uuid, text) from public;
revoke all on function public.finance_close_period(uuid, uuid, text) from public;
grant execute on function public.finance_post_transaction(uuid, uuid, jsonb, uuid, text) to service_role;
grant execute on function public.finance_close_period(uuid, uuid, text) to service_role;
-- App gates via requirePlatformFinanceAccess then createAdminClient; authenticated execute optional.
grant execute on function public.finance_post_transaction(uuid, uuid, jsonb, uuid, text) to authenticated;
grant execute on function public.finance_close_period(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.finance_companies enable row level security;
alter table public.finance_company_access enable row level security;
alter table public.finance_capability_grants enable row level security;
alter table public.finance_accounts enable row level security;
alter table public.finance_periods enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_journal_entries enable row level security;
alter table public.finance_journal_lines enable row level security;
alter table public.finance_audit_events enable row level security;

-- Companies: SA / view / manage_setup may list for setup; company access also selects.
create policy finance_companies_select on public.finance_companies
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.is_platform_super_admin()
    or public.has_finance_company_access(id)
    or public.has_finance_capability(organisation_id, 'platform_finance.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
  )
);

create policy finance_companies_insert on public.finance_companies
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
);

create policy finance_companies_update on public.finance_companies
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
)
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
);

-- Company access grants
create policy finance_company_access_select on public.finance_company_access
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    profile_id = auth.uid()
    or public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
  )
);

create policy finance_company_access_insert on public.finance_company_access
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
);

create policy finance_company_access_delete on public.finance_company_access
for delete to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
);

-- Capability grants
create policy finance_capability_grants_select on public.finance_capability_grants
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    profile_id = auth.uid()
    or public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
  )
);

create policy finance_capability_grants_insert on public.finance_capability_grants
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
);

create policy finance_capability_grants_delete on public.finance_capability_grants
for delete to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
);

-- Chart of Accounts (organisation-level)
create policy finance_accounts_select on public.finance_accounts
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.manage_coa')
  )
);

create policy finance_accounts_insert on public.finance_accounts
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_coa')
);

create policy finance_accounts_update on public.finance_accounts
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_coa')
)
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_coa')
);

-- Periods (company-scoped — company access required; no SA blanket bypass)
create policy finance_periods_select on public.finance_periods
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
);

create policy finance_periods_insert on public.finance_periods
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_periods')
);

create policy finance_periods_update on public.finance_periods
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_periods')
)
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_periods')
);

-- Financial transactions (company access required)
create policy finance_transactions_select on public.finance_transactions
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
);

create policy finance_transactions_insert on public.finance_transactions
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.create_transaction')
);

create policy finance_transactions_update on public.finance_transactions
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.create_transaction')
    or public.has_finance_capability(organisation_id, 'platform_finance.post')
  )
)
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
);

-- Journal entries: select with company access; no authenticated update/delete (RPC + service_role)
create policy finance_journal_entries_select on public.finance_journal_entries
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
);

create policy finance_journal_entries_insert on public.finance_journal_entries
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.post')
);

-- Journal lines
create policy finance_journal_lines_select on public.finance_journal_lines
for select to authenticated
using (
  exists (
    select 1
    from public.finance_journal_entries e
    where e.id = journal_entry_id
      and public.is_org_member(e.organisation_id)
      and public.has_finance_company_access(e.company_id)
  )
);

create policy finance_journal_lines_insert on public.finance_journal_lines
for insert to authenticated
with check (
  exists (
    select 1
    from public.finance_journal_entries e
    where e.id = journal_entry_id
      and public.is_org_member(e.organisation_id)
      and public.has_finance_company_access(e.company_id)
      and public.has_finance_capability(e.organisation_id, 'platform_finance.post')
  )
);

-- Audit: select with company access (or org-level when company null); insert only; no update/delete
create policy finance_audit_events_select on public.finance_audit_events
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    company_id is null
    or public.has_finance_company_access(company_id)
  )
);

create policy finance_audit_events_insert on public.finance_audit_events
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and (
    company_id is null
    or public.has_finance_company_access(company_id)
  )
);

-- Grants (no update/delete on audit or posted journals for authenticated)
grant select, insert, update on table public.finance_companies to authenticated;
grant select, insert, delete on table public.finance_company_access to authenticated;
grant select, insert, delete on table public.finance_capability_grants to authenticated;
grant select, insert, update on table public.finance_accounts to authenticated;
grant select, insert, update on table public.finance_periods to authenticated;
grant select, insert, update on table public.finance_transactions to authenticated;
grant select, insert on table public.finance_journal_entries to authenticated;
grant select, insert on table public.finance_journal_lines to authenticated;
grant select, insert on table public.finance_audit_events to authenticated;

grant all on table public.finance_companies to service_role;
grant all on table public.finance_company_access to service_role;
grant all on table public.finance_capability_grants to service_role;
grant all on table public.finance_accounts to service_role;
grant all on table public.finance_periods to service_role;
grant all on table public.finance_transactions to service_role;
grant all on table public.finance_journal_entries to service_role;
grant all on table public.finance_journal_lines to service_role;
grant all on table public.finance_audit_events to service_role;

grant select on public.finance_general_ledger_v to authenticated, service_role;
grant select on public.finance_trial_balance_v to authenticated, service_role;
