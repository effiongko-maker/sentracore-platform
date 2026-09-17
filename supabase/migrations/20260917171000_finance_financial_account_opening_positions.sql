-- Phase 2E: Financial Account Opening Positions.
-- Opening positions enter through accounting truth (draft FT → finance_post_transaction).
-- No mutable balance columns on finance_financial_accounts.
-- Also corrects Phase 2D RPC capability key to the canonical
-- platform_finance.create_transaction (matches TS grants / RLS).

-- ---------------------------------------------------------------------------
-- Opening Position source entity
-- ---------------------------------------------------------------------------

create table public.finance_financial_account_opening_positions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  financial_account_id uuid not null references public.finance_financial_accounts (id) on delete restrict,
  cutover_date date not null default date '2026-10-01',
  amount numeric(18, 2),
  currency text not null,
  offset_gl_account_id uuid not null references public.finance_accounts (id) on delete restrict,
  finance_transaction_id uuid references public.finance_transactions (id) on delete restrict,
  status text not null default 'draft',
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  updated_by_profile_id uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_fa_opening_positions_status_check
    check (status in ('draft', 'posted')),
  constraint finance_fa_opening_positions_currency_check
    check (char_length(trim(currency)) = 3),
  constraint finance_fa_opening_positions_amount_check
    check (
      amount is null
      or (amount > 0 and amount = round(amount, 2))
    ),
  constraint finance_fa_opening_positions_posted_complete_check
    check (
      status <> 'posted'
      or (
        amount is not null
        and amount > 0
        and finance_transaction_id is not null
      )
    ),
  -- At most ONE Opening Position per Financial Account (draft or posted).
  constraint finance_fa_opening_positions_fa_unique unique (financial_account_id)
);

create index finance_fa_opening_positions_org_company_idx
  on public.finance_financial_account_opening_positions (organisation_id, company_id);

create index finance_fa_opening_positions_status_idx
  on public.finance_financial_account_opening_positions (organisation_id, status);

create unique index finance_fa_opening_positions_ft_uidx
  on public.finance_financial_account_opening_positions (finance_transaction_id)
  where finance_transaction_id is not null;

create trigger finance_fa_opening_positions_set_updated_at
before update on public.finance_financial_account_opening_positions
for each row execute function public.set_updated_at();

comment on table public.finance_financial_account_opening_positions is
  'Phase 2E treasury cutover: opening cash/bank position per Financial Account. '
  'Posts through finance_transactions → finance_post_transaction. Not a current balance.';

-- Align organisation from company; forbid FA switch after insert.
create or replace function public.finance_fa_opening_positions_align_scope()
returns trigger
language plpgsql
as $$
declare
  v_company_org uuid;
  v_fa public.finance_financial_accounts%rowtype;
begin
  select organisation_id into v_company_org
  from public.finance_companies
  where id = new.company_id;
  if v_company_org is null then
    raise exception 'finance opening position: company % not found', new.company_id;
  end if;
  new.organisation_id := v_company_org;

  select * into v_fa
  from public.finance_financial_accounts
  where id = new.financial_account_id;
  if not found then
    raise exception 'finance opening position: financial account not found';
  end if;
  if v_fa.organisation_id <> new.organisation_id then
    raise exception 'finance opening position: financial account organisation mismatch';
  end if;
  if v_fa.company_id <> new.company_id then
    raise exception 'finance opening position: financial account company mismatch';
  end if;
  if new.currency is distinct from v_fa.currency then
    raise exception 'finance opening position: currency must equal financial account currency';
  end if;

  if tg_op = 'UPDATE' then
    if old.financial_account_id is distinct from new.financial_account_id then
      raise exception 'finance opening position: financial account cannot change';
    end if;
    if old.company_id is distinct from new.company_id then
      raise exception 'finance opening position: company cannot change';
    end if;
    if old.status = 'posted' then
      raise exception 'finance opening position: posted opening positions are immutable';
    end if;
  end if;

  return new;
end;
$$;

create trigger finance_fa_opening_positions_align_scope
before insert or update on public.finance_financial_account_opening_positions
for each row execute function public.finance_fa_opening_positions_align_scope();

create or replace function public.finance_fa_opening_positions_reject_posted_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'posted' then
    raise exception 'finance opening position: posted opening positions cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger finance_fa_opening_positions_reject_posted_delete
before delete on public.finance_financial_account_opening_positions
for each row execute function public.finance_fa_opening_positions_reject_posted_delete();

-- One FT per Opening Position source.
create unique index finance_transactions_opening_position_source_uidx
  on public.finance_transactions (source_id)
  where source_type = 'financial_account_opening_position' and source_id is not null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.finance_opening_balance_clearing_account_id(
  p_organisation_id uuid
)
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
    and code = '3020'
    and name = 'Opening Balance Clearing'
    and account_type = 'equity'
    and status = 'active';
  if v_id is null then
    raise exception 'finance opening position: Opening Balance Clearing (3020) is unavailable';
  end if;
  return v_id;
end;
$$;

revoke all on function public.finance_opening_balance_clearing_account_id(uuid) from public;
revoke all on function public.finance_opening_balance_clearing_account_id(uuid) from anon, authenticated;
grant execute on function public.finance_opening_balance_clearing_account_id(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPCs (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.finance_opening_position_get_or_create(
  p_actor_profile_id uuid,
  p_financial_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fa public.finance_financial_accounts%rowtype;
  v_opening public.finance_financial_account_opening_positions%rowtype;
  v_transaction_id uuid;
  v_offset_id uuid;
  v_opening_id uuid;
begin
  select * into v_fa
  from public.finance_financial_accounts
  where id = p_financial_account_id;
  if not found then
    raise exception 'finance opening position: financial account not found';
  end if;

  if not public.finance_payable_actor_has_capability(
    v_fa.organisation_id,
    p_actor_profile_id,
    'platform_finance.create_transaction'
  ) then
    raise exception 'finance opening position: missing create_transaction capability';
  end if;

  if not public.finance_payable_actor_has_company_access(
    p_actor_profile_id,
    v_fa.company_id
  ) then
    raise exception 'finance opening position: no company access';
  end if;

  -- Restricted FA existence confidentiality is enforced in the application
  -- layer before this service_role RPC is invoked.

  select * into v_opening
  from public.finance_financial_account_opening_positions
  where financial_account_id = p_financial_account_id;
  if found then
    if v_opening.finance_transaction_id is null then
      select id into v_transaction_id
      from public.finance_transactions
      where source_type = 'financial_account_opening_position'
        and source_id = v_opening.id::text;
      if v_transaction_id is null then
        insert into public.finance_transactions (
          organisation_id, company_id, reference, transaction_date,
          transaction_type, description, amount, currency, status,
          source_type, source_id, metadata, created_by_profile_id
        ) values (
          v_opening.organisation_id, v_opening.company_id,
          'OPN-' || upper(replace(v_opening.id::text, '-', '')),
          v_opening.cutover_date, 'foundation',
          'Opening position — financial account cutover',
          v_opening.amount, v_opening.currency, 'draft',
          'financial_account_opening_position', v_opening.id::text,
          jsonb_build_object('channel', 'platform_finance.opening_position'),
          p_actor_profile_id
        )
        on conflict (source_id) where source_type = 'financial_account_opening_position' and source_id is not null
        do nothing
        returning id into v_transaction_id;
        if v_transaction_id is null then
          select id into strict v_transaction_id
          from public.finance_transactions
          where source_type = 'financial_account_opening_position'
            and source_id = v_opening.id::text;
        end if;
      end if;
      update public.finance_financial_account_opening_positions
      set finance_transaction_id = v_transaction_id,
          updated_by_profile_id = p_actor_profile_id
      where id = v_opening.id
        and finance_transaction_id is null;
    end if;
    return v_opening.id;
  end if;

  v_offset_id := public.finance_opening_balance_clearing_account_id(v_fa.organisation_id);

  insert into public.finance_financial_account_opening_positions (
    organisation_id,
    company_id,
    financial_account_id,
    cutover_date,
    amount,
    currency,
    offset_gl_account_id,
    status,
    created_by_profile_id,
    updated_by_profile_id
  ) values (
    v_fa.organisation_id,
    v_fa.company_id,
    v_fa.id,
    date '2026-10-01',
    null,
    v_fa.currency,
    v_offset_id,
    'draft',
    p_actor_profile_id,
    p_actor_profile_id
  )
  on conflict (financial_account_id) do nothing
  returning id into v_opening_id;

  if v_opening_id is null then
    select id into strict v_opening_id
    from public.finance_financial_account_opening_positions
    where financial_account_id = p_financial_account_id;
    return v_opening_id;
  end if;

  insert into public.finance_transactions (
    organisation_id,
    company_id,
    reference,
    transaction_date,
    transaction_type,
    description,
    amount,
    currency,
    status,
    source_type,
    source_id,
    metadata,
    created_by_profile_id
  ) values (
    v_fa.organisation_id,
    v_fa.company_id,
    'OPN-' || upper(replace(v_opening_id::text, '-', '')),
    date '2026-10-01',
    'foundation',
    'Opening position — financial account cutover',
    null,
    v_fa.currency,
    'draft',
    'financial_account_opening_position',
    v_opening_id::text,
    jsonb_build_object('channel', 'platform_finance.opening_position'),
    p_actor_profile_id
  )
  on conflict (source_id) where source_type = 'financial_account_opening_position' and source_id is not null
  do nothing
  returning id into v_transaction_id;

  if v_transaction_id is null then
    select id into strict v_transaction_id
    from public.finance_transactions
    where source_type = 'financial_account_opening_position'
      and source_id = v_opening_id::text;
  end if;

  update public.finance_financial_account_opening_positions
  set finance_transaction_id = v_transaction_id,
      updated_by_profile_id = p_actor_profile_id
  where id = v_opening_id
    and finance_transaction_id is null;

  return v_opening_id;
end;
$$;

create or replace function public.finance_opening_position_update_draft(
  p_actor_profile_id uuid,
  p_opening_position_id uuid,
  p_amount numeric,
  p_cutover_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening public.finance_financial_account_opening_positions%rowtype;
  v_cutover date;
begin
  select * into v_opening
  from public.finance_financial_account_opening_positions
  where id = p_opening_position_id
  for update;
  if not found then
    raise exception 'finance opening position: not found';
  end if;
  if v_opening.status <> 'draft' then
    raise exception 'finance opening position: only draft openings can be updated';
  end if;

  if not public.finance_payable_actor_has_capability(
    v_opening.organisation_id,
    p_actor_profile_id,
    'platform_finance.create_transaction'
  ) then
    raise exception 'finance opening position: missing create_transaction capability';
  end if;
  if not public.finance_payable_actor_has_company_access(
    p_actor_profile_id,
    v_opening.company_id
  ) then
    raise exception 'finance opening position: no company access';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'finance opening position: amount must be a positive money amount';
  end if;

  v_cutover := coalesce(p_cutover_date, v_opening.cutover_date);
  if v_cutover is null then
    raise exception 'finance opening position: cutover date is required';
  end if;

  -- Offset is policy-locked to Opening Balance Clearing for Phase 2E v1.
  if v_opening.offset_gl_account_id
     is distinct from public.finance_opening_balance_clearing_account_id(v_opening.organisation_id)
  then
    update public.finance_financial_account_opening_positions
    set offset_gl_account_id = public.finance_opening_balance_clearing_account_id(v_opening.organisation_id)
    where id = v_opening.id;
  end if;

  update public.finance_financial_account_opening_positions
  set
    amount = p_amount,
    cutover_date = v_cutover,
    updated_by_profile_id = p_actor_profile_id
  where id = v_opening.id;

  if v_opening.finance_transaction_id is not null then
    update public.finance_transactions
    set
      amount = p_amount,
      transaction_date = v_cutover,
      currency = v_opening.currency,
      description = 'Opening position — financial account cutover',
      updated_at = timezone('utc', now())
    where id = v_opening.finance_transaction_id
      and status = 'draft'
      and source_type = 'financial_account_opening_position'
      and source_id = v_opening.id::text;
  end if;

  return v_opening.id;
end;
$$;

create or replace function public.finance_opening_position_mark_posted(
  p_actor_profile_id uuid,
  p_opening_position_id uuid,
  p_finance_transaction_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening public.finance_financial_account_opening_positions%rowtype;
  v_ft public.finance_transactions%rowtype;
begin
  select * into v_opening
  from public.finance_financial_account_opening_positions
  where id = p_opening_position_id
  for update;
  if not found then
    raise exception 'finance opening position: not found';
  end if;

  if not public.finance_payable_actor_has_capability(
    v_opening.organisation_id,
    p_actor_profile_id,
    'platform_finance.post'
  ) then
    raise exception 'finance opening position: missing post capability';
  end if;

  if v_opening.status = 'posted' then
    if v_opening.finance_transaction_id = p_finance_transaction_id then
      return v_opening.id;
    end if;
    raise exception 'finance opening position: already posted';
  end if;

  select * into v_ft
  from public.finance_transactions
  where id = p_finance_transaction_id;
  if not found
     or v_ft.source_type <> 'financial_account_opening_position'
     or v_ft.source_id <> v_opening.id::text
     or v_ft.status <> 'posted'
  then
    raise exception 'finance opening position: posted finance transaction lineage is invalid';
  end if;

  if v_opening.finance_transaction_id is distinct from p_finance_transaction_id then
    raise exception 'finance opening position: finance transaction mismatch';
  end if;

  update public.finance_financial_account_opening_positions
  set
    status = 'posted',
    updated_by_profile_id = p_actor_profile_id
  where id = v_opening.id
    and status = 'draft';

  return v_opening.id;
end;
$$;

revoke all on function public.finance_opening_position_get_or_create(uuid, uuid) from public;
revoke all on function public.finance_opening_position_get_or_create(uuid, uuid) from anon, authenticated;
grant execute on function public.finance_opening_position_get_or_create(uuid, uuid) to service_role;

revoke all on function public.finance_opening_position_update_draft(uuid, uuid, numeric, date) from public;
revoke all on function public.finance_opening_position_update_draft(uuid, uuid, numeric, date) from anon, authenticated;
grant execute on function public.finance_opening_position_update_draft(uuid, uuid, numeric, date) to service_role;

revoke all on function public.finance_opening_position_mark_posted(uuid, uuid, uuid) from public;
revoke all on function public.finance_opening_position_mark_posted(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.finance_opening_position_mark_posted(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.finance_financial_account_opening_positions enable row level security;

create policy finance_fa_opening_positions_select
on public.finance_financial_account_opening_positions
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.financial_account.view')
  and public.can_view_finance_financial_account(financial_account_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.create_transaction')
    or public.has_finance_capability(organisation_id, 'platform_finance.post')
    or public.has_finance_capability(organisation_id, 'platform_finance.view')
  )
);

-- No direct insert/update/delete for authenticated — mutations via service_role RPCs.

-- ---------------------------------------------------------------------------
-- Phase 2D capability key correction (canonical create_transaction)
-- ---------------------------------------------------------------------------

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
    v_payment.amount, v_payment.currency, 'draft', 'payment', v_payment.id::text,
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
  select * into v_account from public.finance_accounts where id = p_debit_account_id;
  if not found or v_account.organisation_id <> v_ft.organisation_id or v_account.status <> 'active' then
    raise exception 'finance_payment_accounting: debit account is unavailable';
  end if;
  update public.finance_transactions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('debit_account_id', p_debit_account_id)
  where id = v_ft.id;
  return v_ft.id;
end;
$$;

revoke all on function public.finance_payment_accounting_get_or_create(uuid, uuid) from public;
revoke all on function public.finance_payment_accounting_get_or_create(uuid, uuid) from anon, authenticated;
grant execute on function public.finance_payment_accounting_get_or_create(uuid, uuid) to service_role;

revoke all on function public.finance_payment_accounting_set_debit(uuid, uuid, uuid) from public;
revoke all on function public.finance_payment_accounting_set_debit(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.finance_payment_accounting_set_debit(uuid, uuid, uuid) to service_role;
