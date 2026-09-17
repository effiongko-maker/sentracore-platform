-- SentraCore Finance Phase 2B: optional beneficiary Payment Destinations.
-- Full account numbers are application-encrypted before reaching PostgreSQL.
-- This migration adds no payment execution, destination master, or COA changes.

alter table public.finance_requests
  add column payment_method text,
  add column payment_bank_name text,
  add column payment_account_name text,
  add column payment_account_number_last4 text,
  add column payment_account_number_ciphertext text,
  add column payment_account_number_iv text,
  add column payment_account_number_auth_tag text,
  add column payment_encryption_key_version integer,
  add constraint finance_requests_payment_destination_complete check (
    (
      payment_method is null
      and payment_bank_name is null
      and payment_account_name is null
      and payment_account_number_last4 is null
      and payment_account_number_ciphertext is null
      and payment_account_number_iv is null
      and payment_account_number_auth_tag is null
      and payment_encryption_key_version is null
    ) or (
      payment_method is not null
      and payment_bank_name is not null
      and payment_account_name is not null
      and payment_account_number_last4 is not null
      and payment_account_number_ciphertext is not null
      and payment_account_number_iv is not null
      and payment_account_number_auth_tag is not null
      and payment_encryption_key_version is not null
      and
      payment_method = 'bank_transfer'
      and char_length(trim(payment_bank_name)) > 0
      and char_length(trim(payment_account_name)) > 0
      and payment_account_number_last4 ~ '^[0-9]{4}$'
      and char_length(payment_account_number_ciphertext) > 0
      and char_length(payment_account_number_iv) > 0
      and char_length(payment_account_number_auth_tag) > 0
      and payment_encryption_key_version > 0
    )
  );

alter table public.finance_vendor_bills
  add column payment_method text,
  add column payment_bank_name text,
  add column payment_account_name text,
  add column payment_account_number_last4 text,
  add column payment_account_number_ciphertext text,
  add column payment_account_number_iv text,
  add column payment_account_number_auth_tag text,
  add column payment_encryption_key_version integer,
  add constraint finance_vendor_bills_payment_destination_complete check (
    (
      payment_method is null
      and payment_bank_name is null
      and payment_account_name is null
      and payment_account_number_last4 is null
      and payment_account_number_ciphertext is null
      and payment_account_number_iv is null
      and payment_account_number_auth_tag is null
      and payment_encryption_key_version is null
    ) or (
      payment_method is not null
      and payment_bank_name is not null
      and payment_account_name is not null
      and payment_account_number_last4 is not null
      and payment_account_number_ciphertext is not null
      and payment_account_number_iv is not null
      and payment_account_number_auth_tag is not null
      and payment_encryption_key_version is not null
      and
      payment_method = 'bank_transfer'
      and char_length(trim(payment_bank_name)) > 0
      and char_length(trim(payment_account_name)) > 0
      and payment_account_number_last4 ~ '^[0-9]{4}$'
      and char_length(payment_account_number_ciphertext) > 0
      and char_length(payment_account_number_iv) > 0
      and char_length(payment_account_number_auth_tag) > 0
      and payment_encryption_key_version > 0
    )
  );

alter table public.finance_payables
  add column payment_method text,
  add column payment_bank_name text,
  add column payment_account_name text,
  add column payment_account_number_last4 text,
  add column payment_account_number_ciphertext text,
  add column payment_account_number_iv text,
  add column payment_account_number_auth_tag text,
  add column payment_encryption_key_version integer,
  add constraint finance_payables_payment_destination_complete check (
    (
      payment_method is null
      and payment_bank_name is null
      and payment_account_name is null
      and payment_account_number_last4 is null
      and payment_account_number_ciphertext is null
      and payment_account_number_iv is null
      and payment_account_number_auth_tag is null
      and payment_encryption_key_version is null
    ) or (
      payment_method is not null
      and payment_bank_name is not null
      and payment_account_name is not null
      and payment_account_number_last4 is not null
      and payment_account_number_ciphertext is not null
      and payment_account_number_iv is not null
      and payment_account_number_auth_tag is not null
      and payment_encryption_key_version is not null
      and
      payment_method = 'bank_transfer'
      and char_length(trim(payment_bank_name)) > 0
      and char_length(trim(payment_account_name)) > 0
      and payment_account_number_last4 ~ '^[0-9]{4}$'
      and char_length(payment_account_number_ciphertext) > 0
      and char_length(payment_account_number_iv) > 0
      and char_length(payment_account_number_auth_tag) > 0
      and payment_encryption_key_version > 0
    )
  );

comment on column public.finance_requests.payment_account_number_ciphertext is
  'AES-256-GCM ciphertext produced by the server. Never plaintext and never exposed to ordinary clients.';
comment on column public.finance_vendor_bills.payment_account_number_ciphertext is
  'AES-256-GCM ciphertext produced by the server. Never plaintext and never exposed to ordinary clients.';
comment on column public.finance_payables.payment_account_number_ciphertext is
  'Independent encrypted destination snapshot copied atomically at approval.';

-- Validate and apply one explicit preserve / replace / remove operation. These
-- helpers are service-role-only: authenticated clients cannot nominate crypto.
create or replace function public.finance_request_apply_payment_destination(
  p_request_id uuid,
  p_actor_profile_id uuid,
  p_action text,
  p_destination jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
begin
  if p_action not in ('preserve', 'replace', 'remove') then
    raise exception 'invalid payment destination action';
  end if;
  if p_action = 'preserve' then
    if p_destination is not null then raise exception 'preserve must not include destination data'; end if;
    return;
  end if;

  select * into v_req from public.finance_requests where id = p_request_id for update;
  if not found then raise exception 'financial request not found'; end if;

  if p_action = 'remove' then
    if p_destination is not null then raise exception 'remove must not include destination data'; end if;
    update public.finance_requests set
      payment_method = null, payment_bank_name = null, payment_account_name = null,
      payment_account_number_last4 = null, payment_account_number_ciphertext = null,
      payment_account_number_iv = null, payment_account_number_auth_tag = null,
      payment_encryption_key_version = null
    where id = p_request_id;
  else
    if p_destination is null or p_destination ? 'account_number' then
      raise exception 'complete encrypted payment destination is required';
    end if;
    update public.finance_requests set
      payment_method = p_destination->>'payment_method',
      payment_bank_name = nullif(trim(p_destination->>'bank_name'), ''),
      payment_account_name = nullif(trim(p_destination->>'account_name'), ''),
      payment_account_number_last4 = p_destination->>'account_number_last4',
      payment_account_number_ciphertext = p_destination->>'account_number_ciphertext',
      payment_account_number_iv = p_destination->>'account_number_iv',
      payment_account_number_auth_tag = p_destination->>'account_number_auth_tag',
      payment_encryption_key_version = (p_destination->>'encryption_key_version')::integer
    where id = p_request_id;
  end if;

  perform public.finance_request_append_event(
    v_req.organisation_id, v_req.id, p_actor_profile_id, 'field_changed',
    v_req.status, v_req.status,
    jsonb_build_object('field', 'payment_destination', 'action', p_action)
  );
end;
$$;

create or replace function public.finance_vendor_bill_apply_payment_destination(
  p_vendor_bill_id uuid,
  p_actor_profile_id uuid,
  p_action text,
  p_destination jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
begin
  if p_action not in ('preserve', 'replace', 'remove') then
    raise exception 'invalid payment destination action';
  end if;
  if p_action = 'preserve' then
    if p_destination is not null then raise exception 'preserve must not include destination data'; end if;
    return;
  end if;

  select * into v_bill from public.finance_vendor_bills where id = p_vendor_bill_id for update;
  if not found then raise exception 'vendor bill not found'; end if;

  if p_action = 'remove' then
    if p_destination is not null then raise exception 'remove must not include destination data'; end if;
    update public.finance_vendor_bills set
      payment_method = null, payment_bank_name = null, payment_account_name = null,
      payment_account_number_last4 = null, payment_account_number_ciphertext = null,
      payment_account_number_iv = null, payment_account_number_auth_tag = null,
      payment_encryption_key_version = null
    where id = p_vendor_bill_id;
  else
    if p_destination is null or p_destination ? 'account_number' then
      raise exception 'complete encrypted payment destination is required';
    end if;
    update public.finance_vendor_bills set
      payment_method = p_destination->>'payment_method',
      payment_bank_name = nullif(trim(p_destination->>'bank_name'), ''),
      payment_account_name = nullif(trim(p_destination->>'account_name'), ''),
      payment_account_number_last4 = p_destination->>'account_number_last4',
      payment_account_number_ciphertext = p_destination->>'account_number_ciphertext',
      payment_account_number_iv = p_destination->>'account_number_iv',
      payment_account_number_auth_tag = p_destination->>'account_number_auth_tag',
      payment_encryption_key_version = (p_destination->>'encryption_key_version')::integer
    where id = p_vendor_bill_id;
  end if;

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id, v_bill.id, p_actor_profile_id, 'field_changed',
    v_bill.status, v_bill.status,
    jsonb_build_object('field', 'payment_destination', 'action', p_action)
  );
end;
$$;

-- Atomic wrappers preserve the established lifecycle functions while adding a
-- destination write in the same PostgreSQL transaction.
create or replace function public.finance_request_create_with_payment_destination(
  p_actor_profile_id uuid, p_organisation_id uuid, p_company_id uuid,
  p_category_id uuid, p_requested_amount numeric, p_purpose text,
  p_description text default null, p_payee_name text default null,
  p_payee_type text default 'other', p_required_by_date date default null,
  p_external_reference text default null, p_project_contract_ref text default null,
  p_currency text default 'NGN', p_destination jsonb default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.finance_request_create(
    p_actor_profile_id, p_organisation_id, p_company_id, p_category_id,
    p_requested_amount, p_purpose, p_description, p_payee_name, p_payee_type,
    p_required_by_date, p_external_reference, p_project_contract_ref, p_currency
  );
  if p_destination is not null then
    perform public.finance_request_apply_payment_destination(v_id, p_actor_profile_id, 'replace', p_destination);
  end if;
  return v_id;
end; $$;

create or replace function public.finance_request_update_draft_with_payment_destination(
  p_actor_profile_id uuid, p_request_id uuid, p_category_id uuid default null,
  p_requested_amount numeric default null, p_purpose text default null,
  p_description text default null, p_payee_name text default null,
  p_payee_type text default null, p_required_by_date date default null,
  p_clear_required_by_date boolean default false, p_external_reference text default null,
  p_project_contract_ref text default null, p_destination_action text default 'preserve',
  p_destination jsonb default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.finance_request_update_draft(
    p_actor_profile_id, p_request_id, p_category_id, p_requested_amount, p_purpose,
    p_description, p_payee_name, p_payee_type, p_required_by_date,
    p_clear_required_by_date, p_external_reference, p_project_contract_ref
  );
  perform public.finance_request_apply_payment_destination(v_id, p_actor_profile_id, p_destination_action, p_destination);
  return v_id;
end; $$;

create or replace function public.finance_request_resubmit_with_payment_destination(
  p_actor_profile_id uuid, p_request_id uuid, p_category_id uuid default null,
  p_requested_amount numeric default null, p_purpose text default null,
  p_description text default null, p_payee_name text default null,
  p_payee_type text default null, p_required_by_date date default null,
  p_clear_required_by_date boolean default false, p_external_reference text default null,
  p_project_contract_ref text default null, p_destination_action text default 'preserve',
  p_destination jsonb default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.finance_request_apply_payment_destination(p_request_id, p_actor_profile_id, p_destination_action, p_destination);
  v_id := public.finance_request_resubmit(
    p_actor_profile_id, p_request_id, p_category_id, p_requested_amount, p_purpose,
    p_description, p_payee_name, p_payee_type, p_required_by_date,
    p_clear_required_by_date, p_external_reference, p_project_contract_ref
  );
  return v_id;
end; $$;

create or replace function public.finance_vendor_bill_create_with_payment_destination(
  p_actor_profile_id uuid, p_organisation_id uuid, p_company_id uuid,
  p_billed_amount numeric, p_purpose text, p_payee_name text,
  p_payee_type text default 'vendor', p_description text default null,
  p_invoice_reference text default null, p_invoice_date date default null,
  p_goods_services_received boolean default false, p_due_date date default null,
  p_project_contract_ref text default null, p_currency text default 'NGN',
  p_destination jsonb default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.finance_vendor_bill_create(
    p_actor_profile_id, p_organisation_id, p_company_id, p_billed_amount,
    p_purpose, p_payee_name, p_payee_type, p_description, p_invoice_reference,
    p_invoice_date, p_goods_services_received, p_due_date, p_project_contract_ref,
    p_currency
  );
  if p_destination is not null then
    perform public.finance_vendor_bill_apply_payment_destination(v_id, p_actor_profile_id, 'replace', p_destination);
  end if;
  return v_id;
end; $$;

create or replace function public.finance_vendor_bill_update_draft_with_payment_destination(
  p_actor_profile_id uuid, p_vendor_bill_id uuid, p_billed_amount numeric default null,
  p_purpose text default null, p_payee_name text default null,
  p_payee_type text default null, p_description text default null,
  p_invoice_reference text default null, p_invoice_date date default null,
  p_clear_invoice_date boolean default false, p_goods_services_received boolean default null,
  p_due_date date default null, p_clear_due_date boolean default false,
  p_project_contract_ref text default null, p_currency text default null,
  p_destination_action text default 'preserve', p_destination jsonb default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := public.finance_vendor_bill_update_draft(
    p_actor_profile_id, p_vendor_bill_id, p_billed_amount, p_purpose, p_payee_name,
    p_payee_type, p_description, p_invoice_reference, p_invoice_date,
    p_clear_invoice_date, p_goods_services_received, p_due_date, p_clear_due_date,
    p_project_contract_ref, p_currency
  );
  perform public.finance_vendor_bill_apply_payment_destination(v_id, p_actor_profile_id, p_destination_action, p_destination);
  return v_id;
end; $$;

create or replace function public.finance_vendor_bill_resubmit_with_payment_destination(
  p_actor_profile_id uuid, p_vendor_bill_id uuid, p_billed_amount numeric default null,
  p_purpose text default null, p_payee_name text default null,
  p_payee_type text default null, p_description text default null,
  p_invoice_reference text default null, p_invoice_date date default null,
  p_clear_invoice_date boolean default false, p_goods_services_received boolean default null,
  p_due_date date default null, p_clear_due_date boolean default false,
  p_project_contract_ref text default null, p_destination_action text default 'preserve',
  p_destination jsonb default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.finance_vendor_bill_apply_payment_destination(p_vendor_bill_id, p_actor_profile_id, p_destination_action, p_destination);
  v_id := public.finance_vendor_bill_resubmit(
    p_actor_profile_id, p_vendor_bill_id, p_billed_amount, p_purpose, p_payee_name,
    p_payee_type, p_description, p_invoice_reference, p_invoice_date,
    p_clear_invoice_date, p_goods_services_received, p_due_date, p_clear_due_date,
    p_project_contract_ref
  );
  return v_id;
end; $$;

-- Payable destination is an immutable value snapshot, populated inside the
-- same INSERT transaction used by both CEO approval/mint paths.
create or replace function public.finance_payables_snapshot_payment_destination()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.source_type = 'financial_request' then
    select payment_method, payment_bank_name, payment_account_name,
      payment_account_number_last4, payment_account_number_ciphertext,
      payment_account_number_iv, payment_account_number_auth_tag,
      payment_encryption_key_version
    into new.payment_method, new.payment_bank_name, new.payment_account_name,
      new.payment_account_number_last4, new.payment_account_number_ciphertext,
      new.payment_account_number_iv, new.payment_account_number_auth_tag,
      new.payment_encryption_key_version
    from public.finance_requests where id = new.source_id;
  elsif new.source_type = 'vendor_bill' then
    select payment_method, payment_bank_name, payment_account_name,
      payment_account_number_last4, payment_account_number_ciphertext,
      payment_account_number_iv, payment_account_number_auth_tag,
      payment_encryption_key_version
    into new.payment_method, new.payment_bank_name, new.payment_account_name,
      new.payment_account_number_last4, new.payment_account_number_ciphertext,
      new.payment_account_number_iv, new.payment_account_number_auth_tag,
      new.payment_encryption_key_version
    from public.finance_vendor_bills where id = new.source_id;
  end if;
  return new;
end; $$;

create trigger finance_payables_snapshot_payment_destination
before insert on public.finance_payables
for each row execute function public.finance_payables_snapshot_payment_destination();

create or replace function public.finance_payables_reject_destination_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'approved payable payment destination snapshots are immutable';
end; $$;

create trigger finance_payables_no_destination_update
before update of payment_method, payment_bank_name, payment_account_name,
  payment_account_number_last4, payment_account_number_ciphertext,
  payment_account_number_iv, payment_account_number_auth_tag,
  payment_encryption_key_version on public.finance_payables
for each row execute function public.finance_payables_reject_destination_mutation();

-- Do not allow direct Data API reads of cryptographic columns. Existing RLS
-- still governs the following safe column projections.
revoke select on table public.finance_requests from authenticated;
revoke insert, update on table public.finance_requests from authenticated;
grant select (
  id, organisation_id, company_id, requester_profile_id, status, currency,
  requested_amount, approved_amount, paid_amount, category_id, purpose,
  description, payee_name, payee_type, required_by_date, external_reference,
  project_contract_ref, finance_notes, ceo_decision_notes, queried_at,
  submitted_at, reviewed_at, decided_at, created_at, updated_at,
  payment_method, payment_bank_name, payment_account_name,
  payment_account_number_last4
) on public.finance_requests to authenticated;

revoke select on table public.finance_vendor_bills from authenticated;
revoke insert, update on table public.finance_vendor_bills from authenticated;
grant select (
  id, organisation_id, company_id, inputter_profile_id, status, currency,
  billed_amount, approved_amount, payee_name, payee_type, invoice_reference,
  invoice_date, description, purpose, goods_services_received, due_date,
  project_contract_ref, finance_notes, ceo_decision_notes, queried_at,
  submitted_at, reviewed_at, decided_at, created_at, updated_at,
  payment_method, payment_bank_name, payment_account_name,
  payment_account_number_last4
) on public.finance_vendor_bills to authenticated;

revoke select on table public.finance_payables from authenticated;
grant select (
  id, organisation_id, company_id, created_by_profile_id, status, currency,
  payable_amount, paid_amount, payee_name, payee_type, description, due_date,
  source_type, source_id, project_contract_ref, period_id, created_at, updated_at,
  payment_method, payment_bank_name, payment_account_name,
  payment_account_number_last4
) on public.finance_payables to authenticated;

revoke all on function public.finance_request_apply_payment_destination(uuid, uuid, text, jsonb) from public;
revoke all on function public.finance_vendor_bill_apply_payment_destination(uuid, uuid, text, jsonb) from public;
revoke all on function public.finance_request_create_with_payment_destination(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text, jsonb) from public;
revoke all on function public.finance_request_create_with_payment_destination(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text, jsonb) from anon, authenticated;
revoke all on function public.finance_request_update_draft_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb) from public;
revoke all on function public.finance_request_update_draft_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb) from anon, authenticated;
revoke all on function public.finance_request_resubmit_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb) from public;
revoke all on function public.finance_request_resubmit_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb) from anon, authenticated;
revoke all on function public.finance_vendor_bill_create_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text, jsonb) from public;
revoke all on function public.finance_vendor_bill_create_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text, jsonb) from anon, authenticated;
revoke all on function public.finance_vendor_bill_update_draft_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, text, jsonb) from public;
revoke all on function public.finance_vendor_bill_update_draft_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, text, jsonb) from anon, authenticated;
revoke all on function public.finance_vendor_bill_resubmit_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, jsonb) from public;
revoke all on function public.finance_vendor_bill_resubmit_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, jsonb) from anon, authenticated;

grant execute on function public.finance_request_create_with_payment_destination(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text, jsonb) to service_role;
grant execute on function public.finance_request_update_draft_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb) to service_role;
grant execute on function public.finance_request_resubmit_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text, text, jsonb) to service_role;
grant execute on function public.finance_vendor_bill_create_with_payment_destination(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text, jsonb) to service_role;
grant execute on function public.finance_vendor_bill_update_draft_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, text, jsonb) to service_role;
grant execute on function public.finance_vendor_bill_resubmit_with_payment_destination(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text, jsonb) to service_role;

-- No client reveal/decrypt function exists. No key material is stored here.
