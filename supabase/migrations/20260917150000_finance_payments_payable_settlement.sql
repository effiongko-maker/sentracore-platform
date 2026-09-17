-- SentraCore Finance Phase 2C: Payments + Payable settlement.
-- Confirmed external disbursements against approved Payables.
-- No journals, no finance_post_transaction, no balances, no receipts/transfers.

-- ---------------------------------------------------------------------------
-- Capabilities
-- ---------------------------------------------------------------------------

insert into public.finance_capability_grants (
  organisation_id, profile_id, capability
)
select organisation_id, profile_id, 'platform_finance.payment.view'
from public.finance_capability_grants
where capability = 'platform_finance.payable.view'
on conflict (profile_id, organisation_id, capability) do nothing;

insert into public.finance_capability_grants (
  organisation_id, profile_id, capability
)
select organisation_id, profile_id, 'platform_finance.payment.execute'
from public.finance_capability_grants
where capability = 'platform_finance.payable.review'
on conflict (profile_id, organisation_id, capability) do nothing;

-- ---------------------------------------------------------------------------
-- Payable status: add partially_paid
-- ---------------------------------------------------------------------------

alter table public.finance_payables
  drop constraint if exists finance_payables_status_check;

alter table public.finance_payables
  add constraint finance_payables_status_check
  check (
    status in (
      'draft',
      'pending_approval',
      'approved',
      'partially_paid',
      'scheduled',
      'payment_pending',
      'paid',
      'rejected',
      'cancelled',
      'disputed'
    )
  );

alter table public.finance_payable_events
  drop constraint if exists finance_payable_events_type_check;

alter table public.finance_payable_events
  add constraint finance_payable_events_type_check
  check (
    event_type in (
      'created',
      'updated',
      'submitted',
      'approved',
      'rejected',
      'scheduled',
      'payment_initiated',
      'partially_paid',
      'paid',
      'cancelled',
      'disputed',
      'document_added',
      'document_removed',
      'document_superseded',
      'field_changed'
    )
  );

alter table public.finance_payable_events
  drop constraint if exists finance_payable_events_from_status_check;

alter table public.finance_payable_events
  add constraint finance_payable_events_from_status_check
  check (
    from_status is null
    or from_status in (
      'draft',
      'pending_approval',
      'approved',
      'partially_paid',
      'scheduled',
      'payment_pending',
      'paid',
      'rejected',
      'cancelled',
      'disputed'
    )
  );

alter table public.finance_payable_events
  drop constraint if exists finance_payable_events_to_status_check;

alter table public.finance_payable_events
  add constraint finance_payable_events_to_status_check
  check (
    to_status is null
    or to_status in (
      'draft',
      'pending_approval',
      'approved',
      'partially_paid',
      'scheduled',
      'payment_pending',
      'paid',
      'rejected',
      'cancelled',
      'disputed'
    )
  );

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create table public.finance_payments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  payable_id uuid not null references public.finance_payables (id) on delete restrict,
  source_financial_account_id uuid not null
    references public.finance_financial_accounts (id) on delete restrict,
  amount numeric(18, 2) not null,
  currency text not null,
  payment_date date not null,
  external_reference text,
  status text not null default 'confirmed',
  recorded_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_payments_amount_positive check (amount > 0),
  constraint finance_payments_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint finance_payments_status_check check (status = 'confirmed'),
  constraint finance_payments_external_reference_nonempty
    check (external_reference is null or char_length(trim(external_reference)) > 0)
);

create index finance_payments_payable_created_idx
  on public.finance_payments (payable_id, created_at asc);
create index finance_payments_org_created_idx
  on public.finance_payments (organisation_id, created_at desc);
create index finance_payments_company_idx
  on public.finance_payments (company_id, payment_date desc);
create index finance_payments_source_account_idx
  on public.finance_payments (source_financial_account_id);

comment on table public.finance_payments is
  'Confirmed external corporate disbursements against Payables. Not journals. Not receipts/transfers. Beneficiary destination remains on the Payable snapshot.';

create or replace function public.finance_payments_align_org()
returns trigger
language plpgsql
as $$
declare
  company_org uuid;
begin
  select organisation_id into company_org
  from public.finance_companies
  where id = new.company_id;

  if company_org is null then
    raise exception 'finance_payments: company % not found', new.company_id;
  end if;

  new.organisation_id := company_org;
  return new;
end;
$$;

create trigger finance_payments_align_org
before insert or update on public.finance_payments
for each row execute function public.finance_payments_align_org();

create trigger finance_payments_set_updated_at
before update on public.finance_payments
for each row execute function public.set_updated_at();

alter table public.finance_payments enable row level security;

create policy finance_payments_select
on public.finance_payments
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.payment.view')
  and public.has_finance_company_access(company_id)
);

-- Mutations are service-role RPC only.
revoke insert, update, delete on table public.finance_payments from authenticated;
grant select on table public.finance_payments to authenticated;
grant all on table public.finance_payments to service_role;

-- ---------------------------------------------------------------------------
-- Actor may use Financial Account for payment (profile-scoped; no auth.uid)
-- ---------------------------------------------------------------------------

create or replace function public.finance_payment_actor_can_use_financial_account(
  p_actor_profile_id uuid,
  p_financial_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_financial_accounts a
    where a.id = p_financial_account_id
      and a.status = 'active'
      and public.finance_payable_actor_has_capability(
        a.organisation_id,
        p_actor_profile_id,
        'platform_finance.payment.execute'
      )
      and public.finance_payable_actor_has_company_access(
        p_actor_profile_id,
        a.company_id
      )
      and (
        a.visibility_policy = 'company'
        or exists (
          select 1
          from public.finance_financial_account_access g
          where g.financial_account_id = a.id
            and g.profile_id = p_actor_profile_id
        )
      )
  );
$$;

revoke all on function public.finance_payment_actor_can_use_financial_account(uuid, uuid)
  from public;
revoke all on function public.finance_payment_actor_can_use_financial_account(uuid, uuid)
  from anon, authenticated;
grant execute on function public.finance_payment_actor_can_use_financial_account(uuid, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Atomic confirm payment + settle payable
-- ---------------------------------------------------------------------------

create or replace function public.finance_payment_confirm_against_payable(
  p_actor_profile_id uuid,
  p_payable_id uuid,
  p_source_financial_account_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_external_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.finance_payables%rowtype;
  v_account public.finance_financial_accounts%rowtype;
  v_outstanding numeric(18, 2);
  v_new_paid numeric(18, 2);
  v_from_status text;
  v_to_status text;
  v_payment_id uuid;
  v_event_type text;
begin
  if p_actor_profile_id is null or p_payable_id is null
     or p_source_financial_account_id is null or p_payment_date is null then
    raise exception 'finance_payment_confirm_against_payable: required arguments missing';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'finance_payment_confirm_against_payable: amount must be > 0';
  end if;

  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payment_confirm_against_payable: payable not found';
  end if;

  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id,
    p_actor_profile_id,
    'platform_finance.payment.execute'
  ) then
    raise exception
      'finance_payment_confirm_against_payable: missing capability platform_finance.payment.execute';
  end if;

  if not public.finance_payable_actor_has_company_access(
    p_actor_profile_id,
    v_pay.company_id
  ) then
    raise exception 'finance_payment_confirm_against_payable: no company access';
  end if;

  if v_pay.status not in ('approved', 'partially_paid') then
    raise exception
      'finance_payment_confirm_against_payable: payable status % is not payable',
      v_pay.status;
  end if;

  if v_pay.payment_method is null
     or v_pay.payment_bank_name is null
     or v_pay.payment_account_name is null
     or v_pay.payment_account_number_last4 is null
     or v_pay.payment_account_number_ciphertext is null
     or v_pay.payment_account_number_iv is null
     or v_pay.payment_account_number_auth_tag is null
     or v_pay.payment_encryption_key_version is null then
    raise exception
      'finance_payment_confirm_against_payable: payable payment destination is incomplete';
  end if;

  v_outstanding := v_pay.payable_amount - v_pay.paid_amount;
  if p_amount > v_outstanding then
    raise exception
      'finance_payment_confirm_against_payable: amount % exceeds outstanding %',
      p_amount, v_outstanding;
  end if;

  select * into v_account
  from public.finance_financial_accounts
  where id = p_source_financial_account_id
  for update;

  if not found then
    raise exception
      'finance_payment_confirm_against_payable: financial account not found';
  end if;

  if v_account.organisation_id is distinct from v_pay.organisation_id then
    raise exception
      'finance_payment_confirm_against_payable: financial account organisation mismatch';
  end if;

  if v_account.company_id is distinct from v_pay.company_id then
    raise exception
      'finance_payment_confirm_against_payable: financial account company mismatch';
  end if;

  if v_account.currency is distinct from v_pay.currency then
    raise exception
      'finance_payment_confirm_against_payable: financial account currency mismatch';
  end if;

  if v_account.status is distinct from 'active' then
    raise exception
      'finance_payment_confirm_against_payable: financial account is not active';
  end if;

  if not public.finance_payment_actor_can_use_financial_account(
    p_actor_profile_id,
    v_account.id
  ) then
    raise exception
      'finance_payment_confirm_against_payable: financial account not usable by actor';
  end if;

  v_from_status := v_pay.status;
  v_new_paid := v_pay.paid_amount + p_amount;
  if v_new_paid = v_pay.payable_amount then
    v_to_status := 'paid';
    v_event_type := 'paid';
  else
    v_to_status := 'partially_paid';
    v_event_type := 'partially_paid';
  end if;

  insert into public.finance_payments (
    organisation_id,
    company_id,
    payable_id,
    source_financial_account_id,
    amount,
    currency,
    payment_date,
    external_reference,
    status,
    recorded_by_profile_id
  )
  values (
    v_pay.organisation_id,
    v_pay.company_id,
    v_pay.id,
    v_account.id,
    p_amount,
    v_pay.currency,
    p_payment_date,
    nullif(trim(p_external_reference), ''),
    'confirmed',
    p_actor_profile_id
  )
  returning id into v_payment_id;

  update public.finance_payables
  set
    paid_amount = v_new_paid,
    status = v_to_status,
    updated_at = timezone('utc', now())
  where id = v_pay.id;

  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    v_event_type,
    v_from_status,
    v_to_status,
    jsonb_build_object(
      'payment_id', v_payment_id,
      'amount', p_amount,
      'paid_amount', v_new_paid,
      'outstanding_amount', v_pay.payable_amount - v_new_paid,
      'source_financial_account_id', v_account.id,
      'payment_date', p_payment_date,
      'destination_last4', v_pay.payment_account_number_last4
    )
  );

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action,
    object_type, object_id, reason, details
  ) values (
    v_pay.organisation_id,
    v_pay.company_id,
    p_actor_profile_id,
    'finance.payment.confirmed',
    'finance_payment',
    v_payment_id::text,
    'External corporate disbursement recorded against payable.',
    jsonb_build_object(
      'payable_id', v_pay.id,
      'amount', p_amount,
      'currency', v_pay.currency,
      'payable_status', v_to_status,
      'source_financial_account_id', v_account.id,
      'destination_last4', v_pay.payment_account_number_last4
    )
  );

  return v_payment_id;
end;
$$;

revoke all on function public.finance_payment_confirm_against_payable(
  uuid, uuid, uuid, numeric, date, text
) from public;
revoke all on function public.finance_payment_confirm_against_payable(
  uuid, uuid, uuid, numeric, date, text
) from anon, authenticated;
grant execute on function public.finance_payment_confirm_against_payable(
  uuid, uuid, uuid, numeric, date, text
) to service_role;

comment on function public.finance_payment_confirm_against_payable(
  uuid, uuid, uuid, numeric, date, text
) is
  'Phase 2C: atomically record a confirmed external payment and settle the Payable. service_role only. Does not post journals.';
