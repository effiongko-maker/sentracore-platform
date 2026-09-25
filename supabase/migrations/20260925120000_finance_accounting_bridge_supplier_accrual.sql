-- Platform Finance — Accounting Bridge Tranche 1: supplier accrual + accrued-payable settlement.
--
-- Reuses the existing architecture only: draft finance_transactions (source_type/source_id provenance, one per
-- source event), Finance review, and the canonical posting engine finance_post_transaction (balanced lines, active
-- same-organisation accounts, open covering period, posted immutability, audit). No proposal table, no second
-- ledger, no new Chart of Accounts, and no operational status is written by anything here.
--
-- 1. Capability defect: the Payment Review & Post RPCs checked 'platform_finance.accounting.create_transaction',
--    a string no application path grants. They now check the canonical 'platform_finance.create_transaction' that
--    the application, API and Admin Console already use. Bodies are otherwise unchanged.
--
-- 2. Supplier accrual. A supplier obligation is established when a Vendor Bill is decided (approved /
--    partially_approved): finance_vendor_bill_approve / _partially_approve create, in the same transaction, the
--    Payable (source_type 'vendor_bill', status 'approved', payable_amount = approved_amount) whose amount can no
--    longer change. Review & Post then recognises:
--        Dr reviewer-confirmed Expense / Asset / Prepayment account
--        Cr 2000 Trade Accounts Payable (Subcontractors & Suppliers)
--    dated at the supplier's invoice date. A decided bill without an invoice date is NOT guessed: it cannot be
--    recognised until that product decision is made (reported).
--
-- 3. Settlement. A confirmed Payment whose Payable came from a Vendor Bill settles that recognised liability:
--        Dr 2000 Trade Accounts Payable
--        Cr the source Financial Account's control GL
--    and may only post after the bill's recognition is posted. Payments whose Payable came from a Financial
--    Request are not AP settlements (no accrual exists) and keep the existing reviewer-chosen debit, except that
--    the AP control account can no longer be chosen for them.
--
-- 4. A deferred constraint trigger on finance_journal_entries enforces both treatments at commit for any path.

-- ---------------------------------------------------------------------------------------------------------------
-- 0. Supplier invoice date is required before a Vendor Bill can become a supplier obligation
-- ---------------------------------------------------------------------------------------------------------------
-- The supplier invoice date is the accrual/accounting date. A bill cannot be approved or partially approved into a
-- Payable without it; no approval, submission, creation or current date is ever substituted. A real invoice date in
-- a closed period is kept as-is: the existing period controls then block accounting posting.

create or replace function public.finance_vendor_bill_require_invoice_date_on_decision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('approved', 'partially_approved') and new.invoice_date is null then
    raise exception 'finance vendor bill: the supplier invoice date must be recorded before the bill can be approved or partially approved';
  end if;
  return new;
end;
$$;

create trigger finance_vendor_bill_require_invoice_date_on_decision
before insert or update of status, invoice_date on public.finance_vendor_bills
for each row execute function public.finance_vendor_bill_require_invoice_date_on_decision();

-- Backstop for every path (validated: no existing decided bill lacks an invoice date).
alter table public.finance_vendor_bills
  add constraint finance_vendor_bills_decided_invoice_date_required
  check (status not in ('approved', 'partially_approved') or invoice_date is not null);

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Canonical capability for Payment Review & Post
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.finance_payment_accounting_get_or_create(
  p_actor_profile_id uuid,
  p_payment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.finance_payments%rowtype;
  v_payable public.finance_payables%rowtype;
  v_transaction_id uuid;
begin
  select * into v_payment from public.finance_payments
  where id = p_payment_id and status = 'confirmed';
  if not found then raise exception 'finance_payment_accounting: confirmed payment not found'; end if;
  if not public.finance_payable_actor_has_capability(
    v_payment.organisation_id, p_actor_profile_id,
    'platform_finance.create_transaction'
  ) then raise exception 'finance_payment_accounting: missing create_transaction capability'; end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_payment.company_id) then
    raise exception 'finance_payment_accounting: no company access';
  end if;

  select id into v_transaction_id
  from public.finance_transactions
  where source_type = 'payment' and source_id = p_payment_id::text;
  if found then return v_transaction_id; end if;

  select * into v_payable from public.finance_payables where id = v_payment.payable_id;
  insert into public.finance_transactions (
    organisation_id, company_id, reference, transaction_date,
    transaction_type, description, amount, currency, status,
    source_type, source_id, metadata, created_by_profile_id
  ) values (
    v_payment.organisation_id, v_payment.company_id,
    'PAY-' || upper(replace(v_payment.id::text, '-', '')),
    v_payment.payment_date, 'payment',
    'Payment to ' || coalesce(nullif(trim(v_payable.payee_name), ''), 'payee'),
    v_payment.amount, v_payment.currency, 'draft', 'payment', v_payment.id,
    jsonb_build_object('channel', 'platform_finance.payment_review'),
    p_actor_profile_id
  )
  on conflict (source_id) where source_type = 'payment' and source_id is not null
  do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    select id into strict v_transaction_id from public.finance_transactions
    where source_type = 'payment' and source_id = p_payment_id::text;
  end if;
  return v_transaction_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Account resolvers / eligibility (existing Chart of Accounts only)
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.finance_supplier_ap_control_account_id(p_organisation_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.finance_accounts
  where organisation_id = p_organisation_id
    and code = '2000'
    and account_type = 'liability'
    and classification = 'current_liability'
    and status = 'active';
  if v_id is null then
    raise exception 'finance supplier accounting: Trade Accounts Payable (2000) is unavailable';
  end if;
  return v_id;
end;
$$;

-- Supplier-bill debit: an active Expense, or a current / non-current Asset (e.g. 1090 Prepaid, 1000-1050 fixed
-- assets) — never Revenue, Equity or a Liability, never the AR control (1070), never a cash/bank control account.
create or replace function public.finance_supplier_bill_debit_account_eligible(
  p_organisation_id uuid,
  p_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_accounts a
    where a.id = p_account_id
      and a.organisation_id = p_organisation_id
      and a.status = 'active'
      and (
        a.account_type = 'expense'
        or (a.account_type = 'asset' and a.classification in ('current_asset', 'non_current_asset'))
      )
      and a.code <> '1070'
      and not exists (
        select 1 from public.finance_financial_accounts fa
        where fa.control_gl_account_id = a.id
      )
  );
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Supplier bill recognition (accrual)
-- ---------------------------------------------------------------------------------------------------------------

create unique index finance_transactions_vendor_bill_source_uidx
  on public.finance_transactions (source_id)
  where source_type = 'vendor_bill' and source_id is not null;

-- Authoritative lineage of a decided Vendor Bill and its supplier obligation. Raises unless recognisable.
create or replace function public.finance_vendor_bill_accounting_lineage(p_vendor_bill_id uuid)
returns public.finance_payables
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
  v_payable public.finance_payables%rowtype;
begin
  select * into v_bill from public.finance_vendor_bills where id = p_vendor_bill_id;
  if not found or v_bill.status not in ('approved', 'partially_approved') then
    raise exception 'finance_supplier_accrual: decided vendor bill not found';
  end if;
  select * into v_payable from public.finance_payables
  where source_type = 'vendor_bill' and source_id = v_bill.id;
  if not found then
    raise exception 'finance_supplier_accrual: no supplier obligation exists for this vendor bill';
  end if;
  if v_payable.status not in ('approved', 'partially_paid', 'paid')
     or v_payable.payable_amount <> v_bill.approved_amount
     or v_payable.currency <> v_bill.currency
     or v_payable.company_id <> v_bill.company_id
     or v_payable.organisation_id <> v_bill.organisation_id then
    raise exception 'finance_supplier_accrual: supplier obligation lineage is invalid';
  end if;
  if v_bill.invoice_date is null then
    raise exception 'finance_supplier_accrual: the supplier invoice date is not recorded on this vendor bill';
  end if;
  return v_payable;
end;
$$;

create or replace function public.finance_vendor_bill_accounting_get_or_create(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
  v_payable public.finance_payables%rowtype;
  v_transaction_id uuid;
begin
  select * into v_bill from public.finance_vendor_bills where id = p_vendor_bill_id;
  if not found then raise exception 'finance_supplier_accrual: decided vendor bill not found'; end if;
  if not public.finance_payable_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.create_transaction'
  ) then raise exception 'finance_supplier_accrual: missing create_transaction capability'; end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_bill.company_id) then
    raise exception 'finance_supplier_accrual: no company access';
  end if;

  select id into v_transaction_id from public.finance_transactions
  where source_type = 'vendor_bill' and source_id = p_vendor_bill_id::text;
  if found then return v_transaction_id; end if;

  v_payable := public.finance_vendor_bill_accounting_lineage(p_vendor_bill_id);

  insert into public.finance_transactions (
    organisation_id, company_id, reference, transaction_date,
    transaction_type, description, amount, currency, status,
    source_type, source_id, metadata, created_by_profile_id
  ) values (
    v_bill.organisation_id, v_bill.company_id,
    'VB-' || upper(replace(v_bill.id::text, '-', '')),
    v_bill.invoice_date, 'other',
    'Supplier bill — ' || coalesce(nullif(trim(v_bill.payee_name), ''), 'supplier')
      || coalesce(' · ' || nullif(trim(v_bill.invoice_reference), ''), ''),
    v_payable.payable_amount, v_bill.currency, 'draft',
    'vendor_bill', v_bill.id::text,
    jsonb_build_object('channel', 'platform_finance.supplier_bill_recognition', 'payable_id', v_payable.id),
    p_actor_profile_id
  )
  on conflict (source_id) where source_type = 'vendor_bill' and source_id is not null
  do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    select id into strict v_transaction_id from public.finance_transactions
    where source_type = 'vendor_bill' and source_id = p_vendor_bill_id::text;
  end if;
  return v_transaction_id;
end;
$$;

create or replace function public.finance_vendor_bill_accounting_set_debit(
  p_actor_profile_id uuid,
  p_transaction_id uuid,
  p_debit_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ft public.finance_transactions%rowtype;
begin
  select * into v_ft from public.finance_transactions where id = p_transaction_id for update;
  if not found or v_ft.source_type <> 'vendor_bill' then
    raise exception 'finance_supplier_accrual: supplier bill transaction not found';
  end if;
  if v_ft.status <> 'draft' then raise exception 'finance_supplier_accrual: transaction is not draft'; end if;
  if not public.finance_payable_actor_has_capability(
    v_ft.organisation_id, p_actor_profile_id, 'platform_finance.create_transaction'
  ) then raise exception 'finance_supplier_accrual: missing create_transaction capability'; end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_ft.company_id) then
    raise exception 'finance_supplier_accrual: no company access';
  end if;
  if not public.finance_supplier_bill_debit_account_eligible(v_ft.organisation_id, p_debit_account_id) then
    raise exception 'finance_supplier_accrual: debit account must be an active Expense or Asset account (not revenue, equity, liability, AR or a cash/bank control account)';
  end if;
  update public.finance_transactions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('debit_account_id', p_debit_account_id)
  where id = v_ft.id;
  return v_ft.id;
end;
$$;

create or replace function public.finance_vendor_bill_accounting_post(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ft public.finance_transactions%rowtype;
  v_payable public.finance_payables%rowtype;
  v_bill public.finance_vendor_bills%rowtype;
  v_debit uuid;
  v_ap uuid;
begin
  select * into v_ft from public.finance_transactions
  where source_type = 'vendor_bill' and source_id = p_vendor_bill_id::text
  for update;
  if not found then raise exception 'finance_supplier_accrual: start the accounting review first'; end if;
  if not public.finance_payable_actor_has_capability(
    v_ft.organisation_id, p_actor_profile_id, 'platform_finance.post'
  ) or not public.finance_payable_actor_has_capability(
    v_ft.organisation_id, p_actor_profile_id, 'platform_finance.create_transaction'
  ) then raise exception 'finance_supplier_accrual: missing post authority'; end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_ft.company_id) then
    raise exception 'finance_supplier_accrual: no company access';
  end if;
  if v_ft.status = 'posted' and v_ft.journal_entry_id is not null then
    return v_ft.journal_entry_id;
  end if;

  v_payable := public.finance_vendor_bill_accounting_lineage(p_vendor_bill_id);
  select * into v_bill from public.finance_vendor_bills where id = p_vendor_bill_id;
  if v_ft.amount <> v_payable.payable_amount or v_ft.currency <> v_bill.currency
     or v_ft.transaction_date <> v_bill.invoice_date or v_ft.company_id <> v_bill.company_id then
    raise exception 'finance_supplier_accrual: accounting transaction no longer matches the supplier obligation';
  end if;

  v_debit := nullif(v_ft.metadata->>'debit_account_id', '')::uuid;
  if v_debit is null then raise exception 'finance_supplier_accrual: select the debit classification first'; end if;
  if not public.finance_supplier_bill_debit_account_eligible(v_ft.organisation_id, v_debit) then
    raise exception 'finance_supplier_accrual: debit account is no longer eligible';
  end if;
  v_ap := public.finance_supplier_ap_control_account_id(v_ft.organisation_id);

  return public.finance_post_transaction(
    v_ft.id,
    p_actor_profile_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_debit, 'debit', v_ft.amount, 'credit', 0, 'description', v_ft.description),
      jsonb_build_object('account_id', v_ap, 'debit', 0, 'credit', v_ft.amount, 'description', v_ft.description)
    ),
    null,
    'Supplier bill recognised through Review & Post.'
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Payments: accrued-AP settlement vs non-AP (Financial Request) payments
-- ---------------------------------------------------------------------------------------------------------------

-- The reviewer-chosen debit applies ONLY to payments that do not settle a recognised supplier bill.
create or replace function public.finance_payment_accounting_set_debit(
  p_actor_profile_id uuid,
  p_transaction_id uuid,
  p_debit_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ft public.finance_transactions%rowtype;
  v_account public.finance_accounts%rowtype;
  v_payable_source text;
begin
  select * into v_ft from public.finance_transactions
  where id = p_transaction_id for update;
  if not found or v_ft.source_type <> 'payment' or v_ft.transaction_type <> 'payment' then
    raise exception 'finance_payment_accounting: payment transaction not found';
  end if;
  if v_ft.status <> 'draft' then raise exception 'finance_payment_accounting: transaction is not draft'; end if;
  if not public.finance_payable_actor_has_capability(
    v_ft.organisation_id, p_actor_profile_id,
    'platform_finance.create_transaction'
  ) then raise exception 'finance_payment_accounting: missing create_transaction capability'; end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_ft.company_id) then
    raise exception 'finance_payment_accounting: no company access';
  end if;

  select py.source_type into v_payable_source
  from public.finance_payments pa join public.finance_payables py on py.id = pa.payable_id
  where pa.id::text = v_ft.source_id;
  if v_payable_source = 'vendor_bill' then
    raise exception 'finance_payment_accounting: this payment settles a recognised supplier bill; its debit is Trade Accounts Payable and cannot be chosen';
  end if;

  select * into v_account from public.finance_accounts where id = p_debit_account_id;
  if not found or v_account.organisation_id <> v_ft.organisation_id or v_account.status <> 'active' then
    raise exception 'finance_payment_accounting: debit account is unavailable';
  end if;
  if v_account.code = '2000' and v_account.account_type = 'liability' then
    raise exception 'finance_payment_accounting: Trade Accounts Payable can only be debited by settling a recognised supplier bill';
  end if;

  update public.finance_transactions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('debit_account_id', p_debit_account_id)
  where id = v_ft.id;
  return v_ft.id;
end;
$$;

create or replace function public.finance_payment_accounting_settle_accrued(
  p_actor_profile_id uuid,
  p_payment_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.finance_payments%rowtype;
  v_payable public.finance_payables%rowtype;
  v_accrual public.finance_transactions%rowtype;
  v_ft public.finance_transactions%rowtype;
  v_fa public.finance_financial_accounts%rowtype;
  v_control public.finance_accounts%rowtype;
  v_ft_id uuid;
  v_ap uuid;
begin
  select * into v_payment from public.finance_payments where id = p_payment_id and status = 'confirmed';
  if not found then raise exception 'finance_payment_accounting: confirmed payment not found'; end if;
  if not public.finance_payable_actor_has_capability(
    v_payment.organisation_id, p_actor_profile_id, 'platform_finance.post'
  ) then raise exception 'finance_payment_accounting: missing post authority'; end if;

  select * into v_payable from public.finance_payables where id = v_payment.payable_id;
  if not found or v_payable.source_type <> 'vendor_bill' then
    raise exception 'finance_payment_accounting: this payment does not settle a recognised supplier bill';
  end if;
  select * into v_accrual from public.finance_transactions
  where source_type = 'vendor_bill' and source_id = v_payable.source_id::text;
  if not found or v_accrual.status <> 'posted' or v_accrual.journal_entry_id is null then
    raise exception 'finance_payment_accounting: the supplier bill must be recognised (posted) before its payment can be posted';
  end if;

  -- Creates the draft (and checks create_transaction + company access) when it does not exist yet.
  v_ft_id := public.finance_payment_accounting_get_or_create(p_actor_profile_id, p_payment_id);
  select * into v_ft from public.finance_transactions where id = v_ft_id for update;
  if v_ft.status = 'posted' and v_ft.journal_entry_id is not null then
    return v_ft.journal_entry_id;
  end if;
  if v_ft.amount <> v_payment.amount or v_ft.currency <> v_payment.currency
     or v_ft.transaction_date <> v_payment.payment_date or v_ft.company_id <> v_payment.company_id then
    raise exception 'finance_payment_accounting: payment accounting lineage is invalid';
  end if;

  select * into v_fa from public.finance_financial_accounts where id = v_payment.source_financial_account_id;
  if not found or v_fa.status <> 'active' or v_fa.company_id <> v_payment.company_id or v_fa.currency <> v_payment.currency then
    raise exception 'finance_payment_accounting: the payment source Financial Account is no longer valid for posting';
  end if;
  select * into v_control from public.finance_accounts where id = v_fa.control_gl_account_id;
  if not found or v_control.status <> 'active' or v_control.account_type <> 'asset' or v_control.classification <> 'current_asset' then
    raise exception 'finance_payment_accounting: the source Financial Account control GL is not valid';
  end if;
  v_ap := public.finance_supplier_ap_control_account_id(v_payment.organisation_id);

  update public.finance_transactions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'debit_account_id', v_ap,
    'settles', 'accrued_supplier_liability',
    'vendor_bill_id', v_payable.source_id
  )
  where id = v_ft.id;

  return public.finance_post_transaction(
    v_ft.id,
    p_actor_profile_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_ap, 'debit', v_payment.amount, 'credit', 0, 'description', v_ft.description),
      jsonb_build_object('account_id', v_control.id, 'debit', 0, 'credit', v_payment.amount, 'description', v_ft.description)
    ),
    null,
    'Supplier payment settles recognised Trade Accounts Payable.'
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Treatment guard: enforced at commit for any posting path
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.finance_journal_source_treatment_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ft public.finance_transactions%rowtype;
  v_payable public.finance_payables%rowtype;
  v_payment public.finance_payments%rowtype;
  v_ap uuid;
  v_control uuid;
  v_lines int;
  v_bad int;
begin
  select * into v_ft from public.finance_transactions where id = new.transaction_id;
  if not found or v_ft.source_type not in ('vendor_bill', 'payment') then
    return null;
  end if;
  select count(*) into v_lines from public.finance_journal_lines where journal_entry_id = new.id;
  -- Non-raising lookup: organisations without the AP control account keep their existing payment behaviour.
  select id into v_ap from public.finance_accounts
  where organisation_id = v_ft.organisation_id and code = '2000' and account_type = 'liability'
    and classification = 'current_liability' and status = 'active';

  if v_ft.source_type = 'vendor_bill' then
    if v_ap is null then raise exception 'finance supplier accrual journal requires Trade Accounts Payable (2000)'; end if;
    select count(*) into v_bad from public.finance_journal_lines l
    where l.journal_entry_id = new.id
      and not (
        (l.credit = v_ft.amount and l.debit = 0 and l.account_id = v_ap)
        or (l.debit = v_ft.amount and l.credit = 0
            and public.finance_supplier_bill_debit_account_eligible(v_ft.organisation_id, l.account_id))
      );
    if v_lines <> 2 or v_bad <> 0
       or not exists (select 1 from public.finance_journal_lines where journal_entry_id = new.id and account_id = v_ap and credit = v_ft.amount) then
      raise exception 'finance supplier accrual journal must be Dr eligible Expense/Asset, Cr Trade Accounts Payable (2000)';
    end if;
    return null;
  end if;

  -- source_type = 'payment'
  select * into v_payment from public.finance_payments where id::text = v_ft.source_id;
  select * into v_payable from public.finance_payables where id = v_payment.payable_id;
  if v_payable.source_type = 'vendor_bill' then
    if v_ap is null then raise exception 'finance supplier payment settlement requires Trade Accounts Payable (2000)'; end if;
    select fa.control_gl_account_id into v_control
    from public.finance_financial_accounts fa where fa.id = v_payment.source_financial_account_id;
    if v_lines <> 2
       or not exists (select 1 from public.finance_journal_lines where journal_entry_id = new.id and account_id = v_ap and debit = v_payment.amount and credit = 0)
       or not exists (select 1 from public.finance_journal_lines where journal_entry_id = new.id and account_id = v_control and credit = v_payment.amount and debit = 0) then
      raise exception 'finance supplier payment settling a recognised bill must be Dr Trade Accounts Payable (2000), Cr the source Financial Account control GL';
    end if;
  elsif v_ap is not null and exists (select 1 from public.finance_journal_lines where journal_entry_id = new.id and account_id = v_ap and debit > 0) then
    raise exception 'finance payment: Trade Accounts Payable can only be debited by settling a recognised supplier bill';
  end if;
  return null;
end;
$$;

create constraint trigger finance_journal_source_treatment_guard
after insert on public.finance_journal_entries
deferrable initially deferred
for each row execute function public.finance_journal_source_treatment_guard();

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges: service_role only (the application server), like every existing Finance accounting RPC.
-- ---------------------------------------------------------------------------------------------------------------

revoke all on function
  public.finance_payment_accounting_get_or_create(uuid, uuid),
  public.finance_payment_accounting_set_debit(uuid, uuid, uuid),
  public.finance_payment_accounting_settle_accrued(uuid, uuid),
  public.finance_supplier_ap_control_account_id(uuid),
  public.finance_supplier_bill_debit_account_eligible(uuid, uuid),
  public.finance_vendor_bill_accounting_lineage(uuid),
  public.finance_vendor_bill_accounting_get_or_create(uuid, uuid),
  public.finance_vendor_bill_accounting_set_debit(uuid, uuid, uuid),
  public.finance_vendor_bill_accounting_post(uuid, uuid),
  public.finance_journal_source_treatment_guard(),
  public.finance_vendor_bill_require_invoice_date_on_decision()
  from public, anon, authenticated;
grant execute on function
  public.finance_payment_accounting_get_or_create(uuid, uuid),
  public.finance_payment_accounting_set_debit(uuid, uuid, uuid),
  public.finance_payment_accounting_settle_accrued(uuid, uuid),
  public.finance_supplier_ap_control_account_id(uuid),
  public.finance_supplier_bill_debit_account_eligible(uuid, uuid),
  public.finance_vendor_bill_accounting_get_or_create(uuid, uuid),
  public.finance_vendor_bill_accounting_set_debit(uuid, uuid, uuid),
  public.finance_vendor_bill_accounting_post(uuid, uuid)
  to service_role;
