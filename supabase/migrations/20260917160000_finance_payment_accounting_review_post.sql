-- Phase 2D: confirmed Payment -> draft Finance Transaction -> existing posting engine.
-- No proposal table, no journal-line draft store, no Payment-confirmation coupling.

create unique index finance_transactions_payment_source_uidx
  on public.finance_transactions (source_id)
  where source_type = 'payment' and source_id is not null;

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
    'platform_finance.accounting.create_transaction'
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
    'platform_finance.accounting.create_transaction'
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

revoke all on function public.finance_post_transaction(uuid, uuid, jsonb, uuid, text) from public;
revoke all on function public.finance_post_transaction(uuid, uuid, jsonb, uuid, text) from anon, authenticated;
grant execute on function public.finance_post_transaction(uuid, uuid, jsonb, uuid, text) to service_role;
