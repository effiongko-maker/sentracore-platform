-- Phase 2F-C: customer Receipts + many-to-many Receivable allocation.
-- Receipt posting uses finance_post_transaction; allocations never create journals.

create table public.finance_receipts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  company_id uuid not null references public.finance_companies(id) on delete restrict,
  counterparty_id uuid not null references public.organisation_counterparties(id) on delete restrict,
  destination_financial_account_id uuid not null references public.finance_financial_accounts(id) on delete restrict,
  reference text not null,
  external_reference text,
  receipt_date date not null,
  currency text not null,
  amount numeric(18,2) not null,
  status text not null default 'draft',
  counterparty_display_name text,
  destination_account_name text,
  destination_account_last4 text,
  finance_transaction_id uuid references public.finance_transactions(id) on delete restrict,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  confirmed_by_profile_id uuid references public.profiles(id) on delete restrict,
  posted_by_profile_id uuid references public.profiles(id) on delete restrict,
  confirmed_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  constraint finance_receipts_reference_nonempty check (char_length(trim(reference)) > 0),
  constraint finance_receipts_reference_unique unique(company_id, reference),
  constraint finance_receipts_amount_positive check (amount > 0 and amount = round(amount,2)),
  constraint finance_receipts_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint finance_receipts_status_check check (status in ('draft','confirmed','posted')),
  constraint finance_receipts_posted_complete check (status <> 'posted' or (finance_transaction_id is not null and posted_at is not null and posted_by_profile_id is not null))
);
create index finance_receipts_org_company_status_idx on public.finance_receipts(organisation_id,company_id,status,receipt_date desc);
create unique index finance_transactions_receipt_source_uidx on public.finance_transactions(source_id)
  where source_type='receipt' and source_id is not null;
create trigger finance_receipts_set_updated_at before update on public.finance_receipts
for each row execute function public.set_updated_at();

create table public.finance_receipt_allocations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  receipt_id uuid not null references public.finance_receipts(id) on delete restrict,
  receivable_id uuid not null references public.finance_receivables(id) on delete restrict,
  amount numeric(18,2) not null,
  created_at timestamptz not null default timezone('utc',now()),
  constraint finance_receipt_allocations_positive check (amount > 0 and amount = round(amount,2)),
  constraint finance_receipt_allocations_unique unique(receipt_id,receivable_id)
);
create index finance_receipt_allocations_receivable_idx on public.finance_receipt_allocations(receivable_id);

create or replace function public.finance_receipt_reject_frozen_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op='DELETE' and old.status in ('confirmed','posted') then raise exception 'finance receipt: confirmed and posted receipts are immutable'; end if;
  if tg_op='UPDATE' and old.status in ('confirmed','posted') and (
    old.organisation_id is distinct from new.organisation_id or old.company_id is distinct from new.company_id
    or old.counterparty_id is distinct from new.counterparty_id or old.destination_financial_account_id is distinct from new.destination_financial_account_id
    or old.reference is distinct from new.reference or old.external_reference is distinct from new.external_reference
    or old.receipt_date is distinct from new.receipt_date or old.currency is distinct from new.currency or old.amount is distinct from new.amount
    or old.counterparty_display_name is distinct from new.counterparty_display_name
    or old.destination_account_name is distinct from new.destination_account_name or old.destination_account_last4 is distinct from new.destination_account_last4
  ) then raise exception 'finance receipt: confirmed and posted receipt facts are immutable'; end if;
  return coalesce(new,old);
end; $$;
create trigger finance_receipt_no_frozen_update before update on public.finance_receipts
for each row execute function public.finance_receipt_reject_frozen_mutation();
create trigger finance_receipt_no_frozen_delete before delete on public.finance_receipts
for each row execute function public.finance_receipt_reject_frozen_mutation();

create or replace function public.finance_receipt_allocation_guard()
returns trigger language plpgsql set search_path=public as $$
declare v_receipt public.finance_receipts%rowtype; v_recv public.finance_receivables%rowtype;
begin
  select * into v_receipt from public.finance_receipts where id=coalesce(new.receipt_id,old.receipt_id);
  if v_receipt.status <> 'draft' then raise exception 'finance receipt allocation: receipt is frozen'; end if;
  if tg_op <> 'DELETE' then
    select * into v_recv from public.finance_receivables where id=new.receivable_id;
    if not found then raise exception 'finance receipt allocation: receivable not found'; end if;
    if v_recv.organisation_id<>v_receipt.organisation_id or v_recv.company_id<>v_receipt.company_id
      or v_recv.counterparty_id<>v_receipt.counterparty_id or v_recv.currency<>v_receipt.currency then
      raise exception 'finance receipt allocation: receivable identity mismatch';
    end if;
    new.organisation_id:=v_receipt.organisation_id;
    return new;
  end if;
  return old;
end; $$;
create trigger finance_receipt_allocation_guard before insert or update or delete on public.finance_receipt_allocations
for each row execute function public.finance_receipt_allocation_guard();

create or replace function public.finance_receipt_actor_can_use_account(p_actor uuid,p_account uuid,p_company uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.finance_financial_accounts a
    where a.id=p_account and a.company_id=p_company and a.status='active'
      and public.finance_payable_actor_has_company_access(p_actor,a.company_id)
      and public.finance_payable_actor_has_capability(a.organisation_id,p_actor,'platform_finance.financial_account.view')
      and (a.visibility_policy='company' or exists(select 1 from public.finance_financial_account_access g where g.financial_account_id=a.id and g.profile_id=p_actor)));
$$;

create or replace function public.finance_receipt_replace_allocations(p_receipt uuid,p_allocations jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare v_item jsonb;
begin
  if p_allocations is null or jsonb_typeof(p_allocations)<>'array' then raise exception 'finance receipt: allocations must be an array'; end if;
  delete from public.finance_receipt_allocations where receipt_id=p_receipt;
  for v_item in select * from jsonb_array_elements(p_allocations) loop
    insert into public.finance_receipt_allocations(receipt_id,receivable_id,amount)
    values(p_receipt,(v_item->>'receivable_id')::uuid,(v_item->>'amount')::numeric);
  end loop;
end; $$;

create or replace function public.finance_receipt_create_draft(
 p_actor uuid,p_organisation uuid,p_company uuid,p_counterparty uuid,p_account uuid,
 p_reference text,p_external_reference text,p_receipt_date date,p_currency text,p_amount numeric,p_allocations jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_account public.finance_financial_accounts%rowtype;
begin
  if not public.finance_payable_actor_has_capability(p_organisation,p_actor,'platform_finance.receipt.record') then raise exception 'finance receipt: missing record authority'; end if;
  if not public.finance_receipt_actor_can_use_account(p_actor,p_account,p_company) then raise exception 'finance receipt: destination account unavailable'; end if;
  select * into v_account from public.finance_financial_accounts where id=p_account;
  if v_account.organisation_id<>p_organisation or v_account.currency<>upper(p_currency) then raise exception 'finance receipt: destination account unavailable'; end if;
  insert into public.finance_receipts(organisation_id,company_id,counterparty_id,destination_financial_account_id,reference,external_reference,receipt_date,currency,amount,created_by_profile_id)
  values(p_organisation,p_company,p_counterparty,p_account,trim(p_reference),nullif(trim(p_external_reference),''),p_receipt_date,upper(p_currency),p_amount,p_actor)
  returning id into v_id;
  perform public.finance_receipt_replace_allocations(v_id,p_allocations);
  insert into public.finance_audit_events(organisation_id,company_id,actor_profile_id,action,object_type,object_id)
  values(p_organisation,p_company,p_actor,'finance.receipt.created','finance_receipt',v_id::text);
  return v_id;
end; $$;

create or replace function public.finance_receipt_confirm(p_actor uuid,p_receipt uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_r public.finance_receipts%rowtype; v_a record; v_sum numeric(18,2); v_committed numeric(18,2); v_cp text; v_fa public.finance_financial_accounts%rowtype;
begin
  select * into v_r from public.finance_receipts where id=p_receipt for update;
  if not found or v_r.status<>'draft' then raise exception 'finance receipt: only draft may be confirmed'; end if;
  if not public.finance_payable_actor_has_capability(v_r.organisation_id,p_actor,'platform_finance.receipt.record') then raise exception 'finance receipt: missing record authority'; end if;
  if not public.finance_receipt_actor_can_use_account(p_actor,v_r.destination_financial_account_id,v_r.company_id) then raise exception 'finance receipt: destination account unavailable'; end if;
  select * into v_fa from public.finance_financial_accounts where id=v_r.destination_financial_account_id;
  if v_fa.currency<>v_r.currency then raise exception 'finance receipt: destination account unavailable'; end if;
  select coalesce(sum(amount),0) into v_sum from public.finance_receipt_allocations where receipt_id=p_receipt;
  if v_sum<>v_r.amount then raise exception 'finance receipt: allocations must equal receipt amount'; end if;
  for v_a in select a.receivable_id,a.amount,r.original_amount from public.finance_receipt_allocations a join public.finance_receivables r on r.id=a.receivable_id where a.receipt_id=p_receipt order by a.receivable_id loop
    perform 1 from public.finance_receivables where id=v_a.receivable_id for update;
    select coalesce(sum(a2.amount),0) into v_committed from public.finance_receipt_allocations a2 join public.finance_receipts r2 on r2.id=a2.receipt_id
      where a2.receivable_id=v_a.receivable_id and r2.status in ('confirmed','posted');
    if v_committed+v_a.amount>v_a.original_amount then raise exception 'finance receipt: allocation exceeds available capacity'; end if;
  end loop;
  select display_name into v_cp from public.organisation_counterparties where id=v_r.counterparty_id;
  update public.finance_receipts set status='confirmed',counterparty_display_name=v_cp,destination_account_name=v_fa.name,destination_account_last4=v_fa.account_number_last4,confirmed_by_profile_id=p_actor,confirmed_at=timezone('utc',now()) where id=p_receipt;
  insert into public.finance_audit_events(organisation_id,company_id,actor_profile_id,action,object_type,object_id)
  values(v_r.organisation_id,v_r.company_id,p_actor,'finance.receipt.confirmed','finance_receipt',p_receipt::text);
  return p_receipt;
end; $$;

create or replace function public.finance_receipt_accounting_get_or_create(p_actor uuid,p_receipt uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_r public.finance_receipts%rowtype; v_ft uuid;
begin
  select * into v_r from public.finance_receipts where id=p_receipt for update;
  if not found or v_r.status not in ('confirmed','posted') then raise exception 'finance receipt: receipt must be confirmed'; end if;
  if not public.finance_payable_actor_has_capability(v_r.organisation_id,p_actor,'platform_finance.receipt.post') then raise exception 'finance receipt: missing post authority'; end if;
  if not public.finance_payable_actor_has_company_access(p_actor,v_r.company_id) then raise exception 'finance receipt: no company access'; end if;
  select id into v_ft from public.finance_transactions where source_type='receipt' and source_id=p_receipt::text;
  if v_ft is null then
    insert into public.finance_transactions(organisation_id,company_id,reference,transaction_date,transaction_type,description,amount,currency,status,source_type,source_id,metadata,created_by_profile_id)
    values(v_r.organisation_id,v_r.company_id,v_r.reference,v_r.receipt_date,'receipt','Customer receipt '||v_r.reference,v_r.amount,v_r.currency,'draft','receipt',p_receipt::text,jsonb_build_object('channel','platform_finance.receipt'),p_actor)
    on conflict(source_id) where source_type='receipt' and source_id is not null do nothing returning id into v_ft;
    if v_ft is null then select id into v_ft from public.finance_transactions where source_type='receipt' and source_id=p_receipt::text; end if;
    insert into public.finance_audit_events(organisation_id,company_id,actor_profile_id,action,object_type,object_id)
    values(v_r.organisation_id,v_r.company_id,p_actor,'finance.receipt.accounting_reviewed','finance_receipt',p_receipt::text);
  end if;
  update public.finance_receipts set finance_transaction_id=v_ft where id=p_receipt;
  return v_ft;
end; $$;

create or replace function public.finance_receipt_post(p_actor uuid,p_receipt uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_r public.finance_receipts%rowtype; v_fa public.finance_financial_accounts%rowtype; v_ft uuid; v_ar uuid; v_je uuid; v_period uuid;
begin
  select * into v_r from public.finance_receipts where id=p_receipt for update;
  if not found then raise exception 'finance receipt: not found'; end if;
  if v_r.status='posted' then return v_r.id; end if;
  if v_r.status<>'confirmed' then raise exception 'finance receipt: receipt must be confirmed'; end if;
  if not public.finance_payable_actor_has_capability(v_r.organisation_id,p_actor,'platform_finance.receipt.post')
    or not public.finance_payable_actor_has_capability(v_r.organisation_id,p_actor,'platform_finance.post') then raise exception 'finance receipt: missing canonical posting authority'; end if;
  if not public.finance_receipt_actor_can_use_account(p_actor,v_r.destination_financial_account_id,v_r.company_id) then raise exception 'finance receipt: destination account unavailable'; end if;
  select * into v_fa from public.finance_financial_accounts where id=v_r.destination_financial_account_id;
  v_ar:=public.finance_invoice_ar_control_account_id(v_r.organisation_id);
  v_ft:=public.finance_receipt_accounting_get_or_create(p_actor,p_receipt);
  select id into v_period from public.finance_periods where company_id=v_r.company_id and status='open' and start_date<=v_r.receipt_date and end_date>=v_r.receipt_date order by start_date desc limit 1;
  if v_period is null then raise exception 'finance receipt: no open accounting period covers receipt date'; end if;
  v_je:=public.finance_post_transaction(v_ft,p_actor,jsonb_build_array(
    jsonb_build_object('account_id',v_fa.control_gl_account_id,'debit',v_r.amount,'credit',0,'description','Receipt '||v_r.reference||' — destination'),
    jsonb_build_object('account_id',v_ar,'debit',0,'credit',v_r.amount,'description','Receipt '||v_r.reference||' — Trade AR')
  ),v_period,'Customer receipt posted.');
  update public.finance_receipts set status='posted',finance_transaction_id=v_ft,posted_by_profile_id=p_actor,posted_at=timezone('utc',now()) where id=p_receipt;
  insert into public.finance_audit_events(organisation_id,company_id,actor_profile_id,action,object_type,object_id,details)
  values(v_r.organisation_id,v_r.company_id,p_actor,'finance.receipt.posted','finance_receipt',p_receipt::text,jsonb_build_object('finance_transaction_id',v_ft,'journal_entry_id',v_je));
  return p_receipt;
end; $$;

insert into public.finance_capability_grants(organisation_id,profile_id,capability)
select organisation_id,profile_id,'platform_finance.receipt.view' from public.finance_capability_grants where capability='platform_finance.receivable.view' on conflict do nothing;
insert into public.finance_capability_grants(organisation_id,profile_id,capability)
select organisation_id,profile_id,'platform_finance.receipt.record' from public.finance_capability_grants where capability='platform_finance.invoice.create' on conflict do nothing;
insert into public.finance_capability_grants(organisation_id,profile_id,capability)
select organisation_id,profile_id,'platform_finance.receipt.post' from public.finance_capability_grants where capability='platform_finance.post' on conflict do nothing;

alter table public.finance_receipts enable row level security;
alter table public.finance_receipt_allocations enable row level security;
create policy finance_receipts_select on public.finance_receipts for select to authenticated using(public.is_org_member(organisation_id) and public.has_finance_company_access(company_id) and public.has_finance_capability(organisation_id,'platform_finance.receipt.view'));
create policy finance_receipt_allocations_select on public.finance_receipt_allocations for select to authenticated using(exists(select 1 from public.finance_receipts r where r.id=receipt_id and public.is_org_member(r.organisation_id) and public.has_finance_company_access(r.company_id) and public.has_finance_capability(r.organisation_id,'platform_finance.receipt.view')));
grant select on public.finance_receipts,public.finance_receipt_allocations to authenticated;
grant all on public.finance_receipts,public.finance_receipt_allocations to service_role;
revoke all on function public.finance_receipt_create_draft(uuid,uuid,uuid,uuid,uuid,text,text,date,text,numeric,jsonb) from public,anon,authenticated;
revoke all on function public.finance_receipt_confirm(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finance_receipt_accounting_get_or_create(uuid,uuid) from public,anon,authenticated;
revoke all on function public.finance_receipt_post(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finance_receipt_create_draft(uuid,uuid,uuid,uuid,uuid,text,text,date,text,numeric,jsonb) to service_role;
grant execute on function public.finance_receipt_confirm(uuid,uuid) to service_role;
grant execute on function public.finance_receipt_accounting_get_or_create(uuid,uuid) to service_role;
grant execute on function public.finance_receipt_post(uuid,uuid) to service_role;
