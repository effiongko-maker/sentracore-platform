-- Phase 2D forward-only fix: finance_transactions.source_id is text while
-- finance_payment_accounting_get_or_create receives a UUID payment identifier.

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

revoke all on function public.finance_payment_accounting_get_or_create(uuid, uuid) from public;
revoke all on function public.finance_payment_accounting_get_or_create(uuid, uuid) from anon, authenticated;
grant execute on function public.finance_payment_accounting_get_or_create(uuid, uuid) to service_role;
