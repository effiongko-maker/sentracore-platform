-- SentraCore Finance Phase 1A: adopt the Finance Officer-supplied PayChex COA.
--
-- This is deliberately scoped to PayChex and refuses to run unless the live
-- accounting inventory is still the authorised development/test inventory.
-- Runtime posted-journal immutability remains unchanged; its two delete
-- triggers are disabled only inside this migration transaction.

create temporary table paychex_authoritative_coa (
  code text primary key,
  name text not null,
  account_type text not null,
  classification text not null
) on commit drop;

insert into paychex_authoritative_coa (code, name, account_type, classification)
values
  ('1000', 'Land & Permanent Structures', 'asset', 'non_current_asset'),
  ('1010', 'Office Furnishings & Administrative Assets', 'asset', 'non_current_asset'),
  ('1020', 'Information Technology Infrastructure', 'asset', 'non_current_asset'),
  ('1030', 'Office Electronics & Utility Appliances', 'asset', 'non_current_asset'),
  ('1040', 'Motor Vehicles', 'asset', 'non_current_asset'),
  ('1050', 'Other Specialized Non-Current Assets', 'asset', 'non_current_asset'),
  ('1060', 'Cash & Bank Balances', 'asset', 'current_asset'),
  ('1070', 'Trade Accounts Receivable (Client Billings)', 'asset', 'current_asset'),
  ('1080', 'Due From Related Parties', 'asset', 'current_asset'),
  ('1090', 'Prepaid Project & Overhead Expenses', 'asset', 'current_asset'),
  ('2000', 'Trade Accounts Payable (Subcontractors & Suppliers)', 'liability', 'current_liability'),
  ('2010', 'Client Advances & Unearned Revenue', 'liability', 'current_liability'),
  ('2020', 'Due to Related Parties', 'liability', 'current_liability'),
  ('2030', 'Statutory & Tax Liabilities', 'liability', 'current_liability'),
  ('2040', 'Dividends Declared Payable', 'liability', 'current_liability'),
  ('3000', 'Share Capital / Owner Contributions', 'equity', 'equity'),
  ('3010', 'Accumulated Earnings (Profit/Loss)', 'equity', 'equity'),
  ('4000', 'Facility Management Service Revenue', 'revenue', 'project_revenue'),
  ('4010', 'Construction Project Revenue', 'revenue', 'project_revenue'),
  ('4020', 'Procurement & Supply Chain Management Fees', 'revenue', 'project_revenue'),
  ('4030', 'Management Advisory & Consulting Services', 'revenue', 'project_revenue'),
  ('4040', 'Other Income', 'revenue', 'other_income'),
  ('5000', 'Direct Service Staff Wages & Benefits', 'expense', 'direct_expense_facility_management'),
  ('5010', 'Direct Subcontracted Services', 'expense', 'direct_expense_facility_management'),
  ('5020', 'Service Materials & Consumables', 'expense', 'direct_expense_facility_management'),
  ('5030', 'Technical Vehicle & Logistics Costs', 'expense', 'direct_expense_facility_management'),
  ('5040', 'Job-Specific Repair & Remediation', 'expense', 'direct_expense_facility_management'),
  ('5050', 'Project Renovation & Upgrades', 'expense', 'direct_expense_facility_management'),
  ('5060', 'On-Site Equipment & Appliance Costs', 'expense', 'direct_expense_facility_management'),
  ('5070', 'Diesel & Generator Fuel Costs', 'expense', 'direct_expense_facility_management'),
  ('5080', 'Client Site Utility Payments', 'expense', 'direct_expense_facility_management'),
  ('5090', 'Other Direct Service Costs', 'expense', 'direct_expense_facility_management'),
  ('5100', 'Direct Procurement Cost - Furniture & Fittings', 'expense', 'direct_expense_procurement'),
  ('5110', 'Direct Procurement Cost - IT Equipment & Peripherals', 'expense', 'direct_expense_procurement'),
  ('5120', 'Direct Procurement Cost - Network & Server Hardware', 'expense', 'direct_expense_procurement'),
  ('5130', 'Direct Procurement Cost - ISP Gadgets/Equipment', 'expense', 'direct_expense_procurement'),
  ('5140', 'Logistics & Delivery Expenses (Client-Specific)', 'expense', 'direct_expense_procurement'),
  ('5150', 'Onsite Supervision & Installation Labour', 'expense', 'direct_expense_procurement'),
  ('5160', 'Other Direct Procurement Costs', 'expense', 'direct_expense_procurement'),
  ('5170', 'Direct Job Costs - Construction Materials', 'expense', 'direct_expense_construction'),
  ('5180', 'Direct Job Costs - Subcontracted Labour', 'expense', 'direct_expense_construction'),
  ('5190', 'Direct Job Costs - Project Supervision & Management', 'expense', 'direct_expense_construction'),
  ('5200', 'Direct Job Costs - Equipment Rental & Usage', 'expense', 'direct_expense_construction'),
  ('5210', 'Direct Job Costs - Permits, Fees & Logistics', 'expense', 'direct_expense_construction'),
  ('6000', 'Administrative Office Rent Expense', 'expense', 'operating_expense_general_office'),
  ('6010', 'Office Utilities Expense', 'expense', 'operating_expense_general_office'),
  ('6020', 'Office Supplies Expense', 'expense', 'operating_expense_general_office'),
  ('6030', 'Office Equipment Repair & Maintenance', 'expense', 'operating_expense_general_office'),
  ('6040', 'Postage & Courier Expense', 'expense', 'operating_expense_general_office'),
  ('6050', 'Administrative Staff Salaries & Wages', 'expense', 'operating_expense_personnel_staff'),
  ('6060', 'Staff Bonuses & Allowances', 'expense', 'operating_expense_personnel_staff'),
  ('6070', 'Employee Professional Development', 'expense', 'operating_expense_personnel_staff'),
  ('6080', 'Business Ground Transportation Expense', 'expense', 'operating_expense_travel_communication'),
  ('6090', 'Business Airfare & Accommodation', 'expense', 'operating_expense_travel_communication'),
  ('6100', 'Telecommunication & Data Expense', 'expense', 'operating_expense_travel_communication'),
  ('6110', 'Accounting & Audit Fees', 'expense', 'operating_expense_professional_other_services'),
  ('6120', 'Software Subscriptions Expense', 'expense', 'operating_expense_professional_other_services'),
  ('6130', 'Business Meetings & Hospitality', 'expense', 'operating_expense_professional_other_services'),
  ('6140', 'Office Security & Protection Expense', 'expense', 'operating_expense_professional_other_services'),
  ('6150', 'Miscellaneous General Expenses', 'expense', 'operating_expense_professional_other_services');

do $$
declare
  paychex_org constant uuid := '835a2e6d-a91b-413f-946a-8ed73a6027cc';
  expected_refs constant text[] := array[
    'MJ-20260916-2D202C',
    'MJ-20260916-A41A04',
    'MJ-20260916-AFAE30'
  ];
  actual_refs text[];
  unexpected_account_fks text[];
  migration_actor uuid;
  preserved_before jsonb;
  preserved_after jsonb;
  account_total int;
  transaction_total int;
  journal_total int;
  line_total int;
begin
  if not exists (
    select 1 from public.organisations where id = paychex_org
  ) then
    raise exception 'PayChex organisation % not found', paychex_org;
  end if;

  if (select count(*) from paychex_authoritative_coa) <> 60 then
    raise exception 'authoritative COA staging inventory must contain exactly 60 accounts';
  end if;

  select count(*) into account_total
  from public.finance_accounts
  where organisation_id = paychex_org;

  select count(*) into transaction_total
  from public.finance_transactions
  where organisation_id = paychex_org;

  select count(*) into journal_total
  from public.finance_journal_entries
  where organisation_id = paychex_org;

  select count(*) into line_total
  from public.finance_journal_lines l
  join public.finance_journal_entries e on e.id = l.journal_entry_id
  where e.organisation_id = paychex_org;

  -- Safe no-op if a migration runner retries the already completed migration.
  if account_total = 60
    and transaction_total = 0
    and journal_total = 0
    and line_total = 0
    and not exists (
      select 1
      from paychex_authoritative_coa expected
      left join public.finance_accounts actual
        on actual.organisation_id = paychex_org
       and actual.code = expected.code
       and actual.name = expected.name
       and actual.account_type = expected.account_type
       and actual.classification = expected.classification
       and actual.status = 'active'
      where actual.id is null
    )
  then
    return;
  end if;

  if account_total <> 5
    or not exists (select 1 from public.finance_accounts where organisation_id = paychex_org and code = '1000' and name = 'Cash')
    or not exists (select 1 from public.finance_accounts where organisation_id = paychex_org and code = '2000' and name = 'Accounts Payable')
    or not exists (select 1 from public.finance_accounts where organisation_id = paychex_org and code = '3000' and name = 'Equity')
    or not exists (select 1 from public.finance_accounts where organisation_id = paychex_org and code = '4000' and name = 'Revenue')
    or not exists (select 1 from public.finance_accounts where organisation_id = paychex_org and code = '5000' and name = 'Operating Expense')
  then
    raise exception 'PayChex COA no longer matches the exact five-account prototype inventory';
  end if;

  if transaction_total <> 3 or journal_total <> 3 or line_total <> 6 then
    raise exception 'PayChex accounting inventory changed (expected 3 transactions, 3 journals, 6 lines; found %, %, %)',
      transaction_total, journal_total, line_total;
  end if;

  select
    array_agg(reference order by reference),
    (array_agg(created_by_profile_id order by created_at, id))[1]
    into actual_refs, migration_actor
  from public.finance_transactions
  where organisation_id = paychex_org
    and status = 'posted'
    and source_type = 'manual_journal';

  if actual_refs is distinct from expected_refs or migration_actor is null then
    raise exception 'PayChex transactions are not the exact authorised manual-journal test set (found %)', actual_refs;
  end if;

  if exists (
    select 1 from public.finance_transactions
    where organisation_id = paychex_org
      and (status <> 'posted' or source_type is distinct from 'manual_journal')
  ) then
    raise exception 'PayChex has non-authorised accounting transactions; migration refused';
  end if;

  if exists (
    select 1
    from public.finance_journal_entries e
    left join public.finance_transactions t on t.id = e.transaction_id
    where e.organisation_id = paychex_org
      and (
        e.status <> 'posted'
        or e.reference <> all(expected_refs)
        or t.id is null
        or t.organisation_id <> paychex_org
        or t.reference <> e.reference
      )
  ) then
    raise exception 'PayChex journal inventory is not the exact authorised posted test set';
  end if;

  select array_agg(format('%I.%I', ns.nspname, rel.relname) order by 1)
    into unexpected_account_fks
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where con.contype = 'f'
    and con.confrelid = 'public.finance_accounts'::regclass
    and not (ns.nspname = 'public' and rel.relname = 'finance_journal_lines');

  if unexpected_account_fks is not null then
    raise exception 'unexpected foreign-key dependencies on finance_accounts: %', unexpected_account_fks;
  end if;

  select jsonb_build_object(
    'companies', (select count(*) from public.finance_companies where organisation_id = paychex_org),
    'company_access', (select count(*) from public.finance_company_access where organisation_id = paychex_org),
    'capability_grants', (select count(*) from public.finance_capability_grants where organisation_id = paychex_org),
    'periods', (select count(*) from public.finance_periods where organisation_id = paychex_org),
    'request_categories', (select count(*) from public.finance_request_categories where organisation_id = paychex_org),
    'requests', (select count(*) from public.finance_requests where organisation_id = paychex_org),
    'request_events', (select count(*) from public.finance_request_events where organisation_id = paychex_org),
    'request_documents', (select count(*) from public.finance_request_documents where organisation_id = paychex_org),
    'vendor_bills', (select count(*) from public.finance_vendor_bills where organisation_id = paychex_org),
    'vendor_bill_events', (select count(*) from public.finance_vendor_bill_events where organisation_id = paychex_org),
    'vendor_bill_documents', (select count(*) from public.finance_vendor_bill_documents where organisation_id = paychex_org),
    'payables', (select count(*) from public.finance_payables where organisation_id = paychex_org),
    'payable_events', (select count(*) from public.finance_payable_events where organisation_id = paychex_org),
    'payable_documents', (select count(*) from public.finance_payable_documents where organisation_id = paychex_org)
  ) into preserved_before;

  -- Break the intentional transaction/journal back-reference before deleting.
  update public.finance_transactions
  set journal_entry_id = null
  where organisation_id = paychex_org;

  alter table public.finance_journal_lines
    disable trigger finance_journal_lines_no_posted_mutate;
  alter table public.finance_journal_entries
    disable trigger finance_journal_entries_no_posted_delete;

  delete from public.finance_journal_lines
  where journal_entry_id in (
    select id from public.finance_journal_entries where organisation_id = paychex_org
  );

  delete from public.finance_journal_entries
  where organisation_id = paychex_org;

  alter table public.finance_journal_entries
    enable trigger finance_journal_entries_no_posted_delete;
  alter table public.finance_journal_lines
    enable trigger finance_journal_lines_no_posted_mutate;

  delete from public.finance_transactions
  where organisation_id = paychex_org;

  delete from public.finance_accounts
  where organisation_id = paychex_org;

  insert into public.finance_accounts (
    organisation_id, code, name, account_type, classification, status
  )
  select paychex_org, code, name, account_type, classification, 'active'
  from paychex_authoritative_coa
  order by code;

  insert into public.finance_audit_events (
    organisation_id,
    company_id,
    actor_profile_id,
    action,
    object_type,
    object_id,
    reason,
    details
  ) values (
    paychex_org,
    null,
    migration_actor,
    'authoritative_coa_adopted',
    'chart_of_accounts',
    paychex_org::text,
    'Replaced prototype development scaffolding with the PayChex Finance Officer-supplied Chart of Accounts.',
    jsonb_build_object(
      'source', 'Chart of Account- Paychex 041225.pdf',
      'prototype_accounts_removed', 5,
      'manual_test_transactions_removed', 3,
      'manual_test_journals_removed', 3,
      'manual_test_journal_lines_removed', 6,
      'removed_references', expected_refs,
      'authoritative_accounts_created', 60
    )
  );

  select jsonb_build_object(
    'companies', (select count(*) from public.finance_companies where organisation_id = paychex_org),
    'company_access', (select count(*) from public.finance_company_access where organisation_id = paychex_org),
    'capability_grants', (select count(*) from public.finance_capability_grants where organisation_id = paychex_org),
    'periods', (select count(*) from public.finance_periods where organisation_id = paychex_org),
    'request_categories', (select count(*) from public.finance_request_categories where organisation_id = paychex_org),
    'requests', (select count(*) from public.finance_requests where organisation_id = paychex_org),
    'request_events', (select count(*) from public.finance_request_events where organisation_id = paychex_org),
    'request_documents', (select count(*) from public.finance_request_documents where organisation_id = paychex_org),
    'vendor_bills', (select count(*) from public.finance_vendor_bills where organisation_id = paychex_org),
    'vendor_bill_events', (select count(*) from public.finance_vendor_bill_events where organisation_id = paychex_org),
    'vendor_bill_documents', (select count(*) from public.finance_vendor_bill_documents where organisation_id = paychex_org),
    'payables', (select count(*) from public.finance_payables where organisation_id = paychex_org),
    'payable_events', (select count(*) from public.finance_payable_events where organisation_id = paychex_org),
    'payable_documents', (select count(*) from public.finance_payable_documents where organisation_id = paychex_org)
  ) into preserved_after;

  if preserved_after is distinct from preserved_before then
    raise exception 'preserved Finance data changed (before %, after %)', preserved_before, preserved_after;
  end if;

  if (select count(*) from public.finance_accounts where organisation_id = paychex_org) <> 60
    or exists (
      select 1
      from paychex_authoritative_coa expected
      left join public.finance_accounts actual
        on actual.organisation_id = paychex_org
       and actual.code = expected.code
       and actual.name = expected.name
       and actual.account_type = expected.account_type
       and actual.classification = expected.classification
       and actual.status = 'active'
      where actual.id is null
    )
  then
    raise exception 'authoritative PayChex COA postflight verification failed';
  end if;

  if exists (
    select 1 from public.finance_transactions where organisation_id = paychex_org
    union all
    select 1 from public.finance_journal_entries where organisation_id = paychex_org
    union all
    select 1
    from public.finance_journal_lines l
    join public.finance_accounts a on a.id = l.account_id
    where a.organisation_id = paychex_org
  ) then
    raise exception 'authorised PayChex test accounting records remain after migration';
  end if;
end
$$;
