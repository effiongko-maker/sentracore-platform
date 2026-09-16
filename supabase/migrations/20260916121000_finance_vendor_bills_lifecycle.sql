-- Platform Finance — Vendor Bill lifecycle.
--
-- Named SECURITY DEFINER transition RPCs (same shape as the Financial Request
-- transition RPCs). No generic status mutation is exposed anywhere.
--
-- Authority model:
--   INPUTTER (Finance or Staff) — platform_finance.vendor_bill.create
--     create / update draft / submit / resubmit. Never a final approver.
--   FINANCE REVIEWER — platform_finance.vendor_bill.review
--     start review / query / send to CEO. Cannot approve.
--   CEO — platform_finance.request.approve (reused; NOT a new capability)
--     approve / partially approve / reject / query.
--
-- CEO full or partial approval atomically creates the Payable
-- (source_type = 'vendor_bill', source_id = vendor bill id,
--  payable_amount = approved_amount). Rejection creates no Payable.
--
-- This migration also closes the Payable bypass: finance_payable_create can no
-- longer mint a Payable for either source type.
--
-- No banking, no payment execution, no journal posting, no vendor master, no UI.

-- ---------------------------------------------------------------------------
-- create
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_create(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_company_id uuid,
  p_billed_amount numeric,
  p_purpose text,
  p_payee_name text,
  p_payee_type text default 'vendor',
  p_description text default null,
  p_invoice_reference text default null,
  p_invoice_date date default null,
  p_goods_services_received boolean default false,
  p_due_date date default null,
  p_project_contract_ref text default null,
  p_currency text default 'NGN'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_org uuid;
  v_id uuid;
begin
  if p_actor_profile_id is null then
    raise exception 'finance_vendor_bill_create: p_actor_profile_id is required';
  end if;
  if p_organisation_id is null or p_company_id is null then
    raise exception 'finance_vendor_bill_create: organisation and company are required';
  end if;
  if p_billed_amount is null or p_billed_amount < 0 then
    raise exception 'finance_vendor_bill_create: billed_amount must be >= 0';
  end if;
  if p_purpose is null or char_length(trim(p_purpose)) = 0 then
    raise exception 'finance_vendor_bill_create: purpose is required';
  end if;
  if p_payee_name is null or char_length(trim(p_payee_name)) = 0 then
    raise exception 'finance_vendor_bill_create: payee_name is required';
  end if;
  if p_payee_type is null or p_payee_type not in ('vendor', 'staff', 'other') then
    raise exception 'finance_vendor_bill_create: invalid payee_type';
  end if;

  select organisation_id into v_company_org
  from public.finance_companies
  where id = p_company_id;

  if v_company_org is null then
    raise exception 'finance_vendor_bill_create: company not found';
  end if;
  if v_company_org <> p_organisation_id then
    raise exception 'finance_vendor_bill_create: company not in organisation';
  end if;

  if not public.finance_vendor_bill_actor_has_capability(
    p_organisation_id, p_actor_profile_id, 'platform_finance.vendor_bill.create'
  ) then
    raise exception 'finance_vendor_bill_create: missing capability platform_finance.vendor_bill.create';
  end if;

  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, p_company_id
  ) then
    raise exception 'finance_vendor_bill_create: no company access';
  end if;

  insert into public.finance_vendor_bills (
    organisation_id,
    company_id,
    inputter_profile_id,
    status,
    currency,
    billed_amount,
    approved_amount,
    payee_name,
    payee_type,
    invoice_reference,
    invoice_date,
    description,
    purpose,
    goods_services_received,
    due_date,
    project_contract_ref
  )
  values (
    p_organisation_id,
    p_company_id,
    p_actor_profile_id,
    'draft',
    coalesce(nullif(trim(p_currency), ''), 'NGN'),
    p_billed_amount,
    0,
    trim(p_payee_name),
    p_payee_type,
    nullif(trim(p_invoice_reference), ''),
    p_invoice_date,
    nullif(trim(p_description), ''),
    trim(p_purpose),
    coalesce(p_goods_services_received, false),
    p_due_date,
    nullif(trim(p_project_contract_ref), '')
  )
  returning id into v_id;

  perform public.finance_vendor_bill_append_event(
    p_organisation_id,
    v_id,
    p_actor_profile_id,
    'created',
    null,
    'draft',
    jsonb_build_object(
      'company_id', p_company_id,
      'billed_amount', p_billed_amount
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update draft (inputter only, draft only)
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_update_draft(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid,
  p_billed_amount numeric default null,
  p_purpose text default null,
  p_payee_name text default null,
  p_payee_type text default null,
  p_description text default null,
  p_invoice_reference text default null,
  p_invoice_date date default null,
  p_clear_invoice_date boolean default false,
  p_goods_services_received boolean default null,
  p_due_date date default null,
  p_clear_due_date boolean default false,
  p_project_contract_ref text default null,
  p_currency text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
  v_changed jsonb := '{}'::jsonb;
begin
  if p_actor_profile_id is null or p_vendor_bill_id is null then
    raise exception 'finance_vendor_bill_update_draft: actor and vendor bill id are required';
  end if;

  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_update_draft: vendor bill not found';
  end if;
  if v_bill.status <> 'draft' then
    raise exception 'finance_vendor_bill_update_draft: only draft vendor bills may be updated (status=%)', v_bill.status;
  end if;
  if v_bill.inputter_profile_id <> p_actor_profile_id then
    raise exception 'finance_vendor_bill_update_draft: only the inputter may update the draft';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.vendor_bill.create'
  ) then
    raise exception 'finance_vendor_bill_update_draft: missing capability platform_finance.vendor_bill.create';
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_update_draft: no company access';
  end if;

  if p_billed_amount is not null and p_billed_amount < 0 then
    raise exception 'finance_vendor_bill_update_draft: billed_amount must be >= 0';
  end if;
  if p_payee_type is not null and p_payee_type not in ('vendor', 'staff', 'other') then
    raise exception 'finance_vendor_bill_update_draft: invalid payee_type';
  end if;
  if p_purpose is not null and char_length(trim(p_purpose)) = 0 then
    raise exception 'finance_vendor_bill_update_draft: purpose cannot be empty';
  end if;
  if p_payee_name is not null and char_length(trim(p_payee_name)) = 0 then
    raise exception 'finance_vendor_bill_update_draft: payee_name cannot be empty';
  end if;

  update public.finance_vendor_bills
  set
    billed_amount = coalesce(p_billed_amount, billed_amount),
    purpose = coalesce(nullif(trim(p_purpose), ''), purpose),
    payee_name = coalesce(nullif(trim(p_payee_name), ''), payee_name),
    payee_type = coalesce(p_payee_type, payee_type),
    description = case
      when p_description is null then description
      else nullif(trim(p_description), '')
    end,
    invoice_reference = case
      when p_invoice_reference is null then invoice_reference
      else nullif(trim(p_invoice_reference), '')
    end,
    invoice_date = case
      when p_clear_invoice_date then null
      when p_invoice_date is not null then p_invoice_date
      else invoice_date
    end,
    goods_services_received = coalesce(p_goods_services_received, goods_services_received),
    due_date = case
      when p_clear_due_date then null
      when p_due_date is not null then p_due_date
      else due_date
    end,
    project_contract_ref = case
      when p_project_contract_ref is null then project_contract_ref
      else nullif(trim(p_project_contract_ref), '')
    end,
    currency = coalesce(nullif(trim(p_currency), ''), currency),
    updated_at = timezone('utc', now())
  where id = v_bill.id;

  v_changed := jsonb_strip_nulls(
    jsonb_build_object(
      'billed_amount', p_billed_amount,
      'purpose', p_purpose,
      'payee_name', p_payee_name,
      'payee_type', p_payee_type,
      'description', p_description,
      'invoice_reference', p_invoice_reference,
      'invoice_date', p_invoice_date,
      'clear_invoice_date', case when p_clear_invoice_date then true else null end,
      'goods_services_received', p_goods_services_received,
      'due_date', p_due_date,
      'clear_due_date', case when p_clear_due_date then true else null end,
      'project_contract_ref', p_project_contract_ref,
      'currency', p_currency
    )
  );

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'updated',
    'draft',
    'draft',
    jsonb_build_object('fields', v_changed)
  );

  if v_changed <> '{}'::jsonb then
    perform public.finance_vendor_bill_append_event(
      v_bill.organisation_id,
      v_bill.id,
      p_actor_profile_id,
      'field_changed',
      'draft',
      'draft',
      v_changed
    );
  end if;

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit (requires goods/services received + at least one active document)
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_submit(
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
begin
  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_submit: vendor bill not found';
  end if;
  if v_bill.status <> 'draft' then
    raise exception 'finance_vendor_bill_submit: invalid status transition from %', v_bill.status;
  end if;
  if v_bill.inputter_profile_id <> p_actor_profile_id then
    raise exception 'finance_vendor_bill_submit: only the inputter may submit';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.vendor_bill.create'
  ) then
    raise exception 'finance_vendor_bill_submit: missing capability platform_finance.vendor_bill.create';
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_submit: no company access';
  end if;
  if char_length(trim(v_bill.purpose)) = 0 or char_length(trim(v_bill.payee_name)) = 0 then
    raise exception 'finance_vendor_bill_submit: incomplete vendor bill content';
  end if;
  if v_bill.billed_amount is null or v_bill.billed_amount <= 0 then
    raise exception 'finance_vendor_bill_submit: billed_amount must be > 0';
  end if;
  if not v_bill.goods_services_received then
    raise exception 'finance_vendor_bill_submit: goods/services received confirmation is required';
  end if;
  if not public.finance_vendor_bill_has_active_document(v_bill.id) then
    raise exception 'finance_vendor_bill_submit: supporting documentation is required';
  end if;

  update public.finance_vendor_bills
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_bill.id;

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'submitted',
    'draft',
    'submitted',
    jsonb_build_object('billed_amount', v_bill.billed_amount)
  );

  perform public.finance_vendor_bill_append_audit(
    v_bill.organisation_id,
    v_bill.company_id,
    p_actor_profile_id,
    'finance.vendor_bill.submitted',
    v_bill.id,
    null,
    jsonb_build_object('from_status', 'draft', 'to_status', 'submitted')
  );

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- start review (Finance)
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_start_review(
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
begin
  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_start_review: vendor bill not found';
  end if;
  if v_bill.status <> 'submitted' then
    raise exception 'finance_vendor_bill_start_review: invalid status transition from %', v_bill.status;
  end if;
  if v_bill.inputter_profile_id = p_actor_profile_id then
    raise exception 'finance_vendor_bill_start_review: separation of duties — inputter cannot review own vendor bill';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.vendor_bill.review'
  ) then
    raise exception 'finance_vendor_bill_start_review: missing capability platform_finance.vendor_bill.review';
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_start_review: no company access';
  end if;

  update public.finance_vendor_bills
  set
    status = 'under_review',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_bill.id;

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'review_started',
    'submitted',
    'under_review',
    '{}'::jsonb
  );

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- query (Finance while under_review, CEO while pending_ceo_approval)
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_query(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid,
  p_reason text,
  p_actor_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
  v_from text;
  v_cap text;
begin
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'finance_vendor_bill_query: query reason is required';
  end if;
  if p_actor_role is null or p_actor_role not in ('finance', 'ceo') then
    raise exception 'finance_vendor_bill_query: p_actor_role must be finance or ceo';
  end if;

  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_query: vendor bill not found';
  end if;

  if p_actor_role = 'finance' then
    if v_bill.status <> 'under_review' then
      raise exception 'finance_vendor_bill_query: finance may only query under_review (status=%)', v_bill.status;
    end if;
    v_cap := 'platform_finance.vendor_bill.review';
  else
    if v_bill.status <> 'pending_ceo_approval' then
      raise exception 'finance_vendor_bill_query: ceo may only query pending_ceo_approval (status=%)', v_bill.status;
    end if;
    v_cap := 'platform_finance.request.approve';
  end if;

  if v_bill.inputter_profile_id = p_actor_profile_id then
    raise exception 'finance_vendor_bill_query: separation of duties — inputter cannot query own vendor bill as reviewer/approver';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, v_cap
  ) then
    raise exception 'finance_vendor_bill_query: missing capability %', v_cap;
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_query: no company access';
  end if;

  v_from := v_bill.status;

  update public.finance_vendor_bills
  set
    status = 'query',
    queried_at = timezone('utc', now()),
    finance_notes = case
      when p_actor_role = 'finance' then trim(p_reason)
      else finance_notes
    end,
    ceo_decision_notes = case
      when p_actor_role = 'ceo' then trim(p_reason)
      else ceo_decision_notes
    end,
    updated_at = timezone('utc', now())
  where id = v_bill.id;

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'queried',
    v_from,
    'query',
    jsonb_build_object('reason', trim(p_reason), 'actor_role', p_actor_role)
  );

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- resubmit (QUERY → RESUBMITTED → UNDER_REVIEW atomically; inputter only)
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_resubmit(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid,
  p_billed_amount numeric default null,
  p_purpose text default null,
  p_payee_name text default null,
  p_payee_type text default null,
  p_description text default null,
  p_invoice_reference text default null,
  p_invoice_date date default null,
  p_clear_invoice_date boolean default false,
  p_goods_services_received boolean default null,
  p_due_date date default null,
  p_clear_due_date boolean default false,
  p_project_contract_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
begin
  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_resubmit: vendor bill not found';
  end if;
  if v_bill.status <> 'query' then
    raise exception 'finance_vendor_bill_resubmit: invalid status transition from %', v_bill.status;
  end if;
  if v_bill.inputter_profile_id <> p_actor_profile_id then
    raise exception 'finance_vendor_bill_resubmit: only the inputter may resubmit';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.vendor_bill.create'
  ) then
    raise exception 'finance_vendor_bill_resubmit: missing capability platform_finance.vendor_bill.create';
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_resubmit: no company access';
  end if;
  if p_billed_amount is not null and p_billed_amount <= 0 then
    raise exception 'finance_vendor_bill_resubmit: billed_amount must be > 0';
  end if;
  if p_payee_type is not null and p_payee_type not in ('vendor', 'staff', 'other') then
    raise exception 'finance_vendor_bill_resubmit: invalid payee_type';
  end if;
  if not coalesce(p_goods_services_received, v_bill.goods_services_received) then
    raise exception 'finance_vendor_bill_resubmit: goods/services received confirmation is required';
  end if;
  if not public.finance_vendor_bill_has_active_document(v_bill.id) then
    raise exception 'finance_vendor_bill_resubmit: supporting documentation is required';
  end if;

  update public.finance_vendor_bills
  set
    billed_amount = coalesce(p_billed_amount, billed_amount),
    purpose = coalesce(nullif(trim(p_purpose), ''), purpose),
    payee_name = coalesce(nullif(trim(p_payee_name), ''), payee_name),
    payee_type = coalesce(p_payee_type, payee_type),
    description = case
      when p_description is null then description
      else nullif(trim(p_description), '')
    end,
    invoice_reference = case
      when p_invoice_reference is null then invoice_reference
      else nullif(trim(p_invoice_reference), '')
    end,
    invoice_date = case
      when p_clear_invoice_date then null
      when p_invoice_date is not null then p_invoice_date
      else invoice_date
    end,
    goods_services_received = coalesce(p_goods_services_received, goods_services_received),
    due_date = case
      when p_clear_due_date then null
      when p_due_date is not null then p_due_date
      else due_date
    end,
    project_contract_ref = case
      when p_project_contract_ref is null then project_contract_ref
      else nullif(trim(p_project_contract_ref), '')
    end,
    status = 'resubmitted',
    updated_at = timezone('utc', now())
  where id = v_bill.id
  returning * into v_bill;

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'resubmitted',
    'query',
    'resubmitted',
    '{}'::jsonb
  );

  update public.finance_vendor_bills
  set
    status = 'under_review',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_bill.id;

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'review_started',
    'resubmitted',
    'under_review',
    jsonb_build_object('via', 'resubmit')
  );

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- send to CEO (Finance routes; Finance never approves)
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_send_to_ceo(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid,
  p_finance_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
begin
  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_send_to_ceo: vendor bill not found';
  end if;
  if v_bill.status <> 'under_review' then
    raise exception 'finance_vendor_bill_send_to_ceo: invalid status transition from %', v_bill.status;
  end if;
  if v_bill.inputter_profile_id = p_actor_profile_id then
    raise exception 'finance_vendor_bill_send_to_ceo: separation of duties — inputter cannot route own vendor bill';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.vendor_bill.review'
  ) then
    raise exception 'finance_vendor_bill_send_to_ceo: missing capability platform_finance.vendor_bill.review';
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_send_to_ceo: no company access';
  end if;
  if not public.finance_vendor_bill_has_active_document(v_bill.id) then
    raise exception 'finance_vendor_bill_send_to_ceo: supporting documentation is required';
  end if;
  if v_bill.billed_amount is null or v_bill.billed_amount <= 0 then
    raise exception 'finance_vendor_bill_send_to_ceo: billed_amount must be > 0';
  end if;
  if not v_bill.goods_services_received then
    raise exception 'finance_vendor_bill_send_to_ceo: goods/services received confirmation is required';
  end if;

  update public.finance_vendor_bills
  set
    status = 'pending_ceo_approval',
    finance_notes = case
      when p_finance_notes is null then finance_notes
      else nullif(trim(p_finance_notes), '')
    end,
    updated_at = timezone('utc', now())
  where id = v_bill.id;

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'sent_to_ceo',
    'under_review',
    'pending_ceo_approval',
    '{}'::jsonb
  );

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal: insert approved Payable from a decided Vendor Bill (same TX)
-- ---------------------------------------------------------------------------

create or replace function public.finance_payable_insert_from_approved_vendor_bill(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid,
  p_approved_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
  v_payable_id uuid;
begin
  if p_approved_amount is null or p_approved_amount <= 0 then
    raise exception
      'finance_payable_insert_from_approved_vendor_bill: approved amount must be > 0';
  end if;

  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id;

  if not found then
    raise exception
      'finance_payable_insert_from_approved_vendor_bill: vendor bill not found';
  end if;

  if v_bill.status not in ('approved', 'partially_approved') then
    raise exception
      'finance_payable_insert_from_approved_vendor_bill: vendor bill must already be decided (status=%)',
      v_bill.status;
  end if;

  if p_approved_amount <> v_bill.approved_amount then
    raise exception
      'finance_payable_insert_from_approved_vendor_bill: amount must equal vendor bill approved_amount';
  end if;

  begin
    insert into public.finance_payables (
      organisation_id,
      company_id,
      created_by_profile_id,
      status,
      currency,
      payable_amount,
      paid_amount,
      payee_name,
      payee_type,
      description,
      due_date,
      source_type,
      source_id,
      project_contract_ref,
      period_id
    )
    values (
      v_bill.organisation_id,
      v_bill.company_id,
      p_actor_profile_id,
      'approved',
      v_bill.currency,
      p_approved_amount,
      0,
      v_bill.payee_name,
      v_bill.payee_type,
      coalesce(v_bill.description, v_bill.purpose),
      v_bill.due_date,
      'vendor_bill',
      v_bill.id,
      v_bill.project_contract_ref,
      null
    )
    returning id into v_payable_id;
  exception
    when unique_violation then
      raise exception
        'finance_payable_insert_from_approved_vendor_bill: payable already exists for this vendor bill';
  end;

  perform public.finance_payable_append_event(
    v_bill.organisation_id,
    v_payable_id,
    p_actor_profile_id,
    'created',
    null,
    'approved',
    jsonb_build_object(
      'source_type', 'vendor_bill',
      'source_id', v_bill.id,
      'payable_amount', p_approved_amount,
      'billed_amount', v_bill.billed_amount,
      'origin', 'ceo_vendor_bill_approval'
    )
  );

  perform public.finance_payable_append_event(
    v_bill.organisation_id,
    v_payable_id,
    p_actor_profile_id,
    'approved',
    null,
    'approved',
    jsonb_build_object(
      'source_type', 'vendor_bill',
      'source_id', v_bill.id,
      'payable_amount', p_approved_amount
    )
  );

  return v_payable_id;
end;
$$;

revoke all on function public.finance_payable_insert_from_approved_vendor_bill(uuid, uuid, numeric)
  from public;
grant execute on function public.finance_payable_insert_from_approved_vendor_bill(uuid, uuid, numeric)
  to service_role;

comment on function public.finance_payable_insert_from_approved_vendor_bill(uuid, uuid, numeric) is
  'Internal helper: create approved Payable from a decided Vendor Bill. Invoked only inside finance_vendor_bill_approve / finance_vendor_bill_partially_approve (same transaction). Not a client API.';

-- ---------------------------------------------------------------------------
-- CEO approve (full) — platform_finance.request.approve
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_approve(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid,
  p_decision_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
  v_payable_id uuid;
begin
  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_approve: vendor bill not found';
  end if;
  if v_bill.status <> 'pending_ceo_approval' then
    raise exception 'finance_vendor_bill_approve: invalid status transition from %', v_bill.status;
  end if;
  if v_bill.inputter_profile_id = p_actor_profile_id then
    raise exception 'finance_vendor_bill_approve: separation of duties — inputter cannot approve own vendor bill';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.request.approve'
  ) then
    raise exception 'finance_vendor_bill_approve: missing capability platform_finance.request.approve';
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_approve: no company access';
  end if;
  if v_bill.billed_amount is null or v_bill.billed_amount <= 0 then
    raise exception 'finance_vendor_bill_approve: billed_amount must be > 0 to create a payable';
  end if;

  update public.finance_vendor_bills
  set
    status = 'approved',
    approved_amount = billed_amount,
    decided_at = timezone('utc', now()),
    ceo_decision_notes = case
      when p_decision_notes is null then ceo_decision_notes
      else nullif(trim(p_decision_notes), '')
    end,
    updated_at = timezone('utc', now())
  where id = v_bill.id
  returning * into v_bill;

  -- Payable creation MUST succeed in this same transaction or the approval rolls back.
  v_payable_id := public.finance_payable_insert_from_approved_vendor_bill(
    p_actor_profile_id,
    v_bill.id,
    v_bill.approved_amount
  );

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'approved',
    'pending_ceo_approval',
    'approved',
    jsonb_build_object(
      'approved_amount', v_bill.approved_amount,
      'billed_amount', v_bill.billed_amount,
      'payable_id', v_payable_id
    )
  );

  perform public.finance_vendor_bill_append_audit(
    v_bill.organisation_id,
    v_bill.company_id,
    p_actor_profile_id,
    'finance.vendor_bill.approved',
    v_bill.id,
    p_decision_notes,
    jsonb_build_object(
      'approved_amount', v_bill.approved_amount,
      'billed_amount', v_bill.billed_amount,
      'payable_id', v_payable_id
    )
  );

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- CEO partial approve — 0 < amount < billed_amount
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_partially_approve(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid,
  p_approved_amount numeric,
  p_decision_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
  v_payable_id uuid;
begin
  if p_approved_amount is null then
    raise exception 'finance_vendor_bill_partially_approve: approved_amount is required';
  end if;

  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_partially_approve: vendor bill not found';
  end if;
  if v_bill.status <> 'pending_ceo_approval' then
    raise exception 'finance_vendor_bill_partially_approve: invalid status transition from %', v_bill.status;
  end if;
  if v_bill.inputter_profile_id = p_actor_profile_id then
    raise exception 'finance_vendor_bill_partially_approve: separation of duties — inputter cannot approve own vendor bill';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.request.approve'
  ) then
    raise exception 'finance_vendor_bill_partially_approve: missing capability platform_finance.request.approve';
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_partially_approve: no company access';
  end if;
  if p_approved_amount <= 0 or p_approved_amount >= v_bill.billed_amount then
    raise exception
      'finance_vendor_bill_partially_approve: approved_amount must satisfy 0 < amount < billed_amount';
  end if;

  update public.finance_vendor_bills
  set
    status = 'partially_approved',
    approved_amount = p_approved_amount,
    decided_at = timezone('utc', now()),
    ceo_decision_notes = case
      when p_decision_notes is null then ceo_decision_notes
      else nullif(trim(p_decision_notes), '')
    end,
    updated_at = timezone('utc', now())
  where id = v_bill.id
  returning * into v_bill;

  v_payable_id := public.finance_payable_insert_from_approved_vendor_bill(
    p_actor_profile_id,
    v_bill.id,
    v_bill.approved_amount
  );

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'partially_approved',
    'pending_ceo_approval',
    'partially_approved',
    jsonb_build_object(
      'approved_amount', v_bill.approved_amount,
      'billed_amount', v_bill.billed_amount,
      'payable_id', v_payable_id
    )
  );

  perform public.finance_vendor_bill_append_audit(
    v_bill.organisation_id,
    v_bill.company_id,
    p_actor_profile_id,
    'finance.vendor_bill.partially_approved',
    v_bill.id,
    p_decision_notes,
    jsonb_build_object(
      'approved_amount', v_bill.approved_amount,
      'billed_amount', v_bill.billed_amount,
      'payable_id', v_payable_id
    )
  );

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- CEO reject — creates NO payable
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_reject(
  p_actor_profile_id uuid,
  p_vendor_bill_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.finance_vendor_bills%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'finance_vendor_bill_reject: rejection reason is required';
  end if;

  select * into v_bill
  from public.finance_vendor_bills
  where id = p_vendor_bill_id
  for update;

  if not found then
    raise exception 'finance_vendor_bill_reject: vendor bill not found';
  end if;
  if v_bill.status <> 'pending_ceo_approval' then
    raise exception 'finance_vendor_bill_reject: invalid status transition from %', v_bill.status;
  end if;
  if v_bill.inputter_profile_id = p_actor_profile_id then
    raise exception 'finance_vendor_bill_reject: separation of duties — inputter cannot reject own vendor bill';
  end if;
  if not public.finance_vendor_bill_actor_has_capability(
    v_bill.organisation_id, p_actor_profile_id, 'platform_finance.request.approve'
  ) then
    raise exception 'finance_vendor_bill_reject: missing capability platform_finance.request.approve';
  end if;
  if not public.finance_vendor_bill_actor_has_company_access(
    p_actor_profile_id, v_bill.company_id
  ) then
    raise exception 'finance_vendor_bill_reject: no company access';
  end if;

  update public.finance_vendor_bills
  set
    status = 'rejected',
    approved_amount = 0,
    decided_at = timezone('utc', now()),
    ceo_decision_notes = trim(p_reason),
    updated_at = timezone('utc', now())
  where id = v_bill.id;

  perform public.finance_vendor_bill_append_event(
    v_bill.organisation_id,
    v_bill.id,
    p_actor_profile_id,
    'rejected',
    'pending_ceo_approval',
    'rejected',
    jsonb_build_object('reason', trim(p_reason), 'billed_amount', v_bill.billed_amount)
  );

  perform public.finance_vendor_bill_append_audit(
    v_bill.organisation_id,
    v_bill.company_id,
    p_actor_profile_id,
    'finance.vendor_bill.rejected',
    v_bill.id,
    trim(p_reason),
    jsonb_build_object('approved_amount', 0, 'payable_created', false)
  );

  return v_bill.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.finance_vendor_bill_create(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text) from public;
revoke all on function public.finance_vendor_bill_update_draft(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text) from public;
revoke all on function public.finance_vendor_bill_submit(uuid, uuid) from public;
revoke all on function public.finance_vendor_bill_start_review(uuid, uuid) from public;
revoke all on function public.finance_vendor_bill_query(uuid, uuid, text, text) from public;
revoke all on function public.finance_vendor_bill_resubmit(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text) from public;
revoke all on function public.finance_vendor_bill_send_to_ceo(uuid, uuid, text) from public;
revoke all on function public.finance_vendor_bill_approve(uuid, uuid, text) from public;
revoke all on function public.finance_vendor_bill_partially_approve(uuid, uuid, numeric, text) from public;
revoke all on function public.finance_vendor_bill_reject(uuid, uuid, text) from public;

grant execute on function public.finance_vendor_bill_create(uuid, uuid, uuid, numeric, text, text, text, text, text, date, boolean, date, text, text) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_update_draft(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text, text) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_submit(uuid, uuid) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_start_review(uuid, uuid) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_query(uuid, uuid, text, text) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_resubmit(uuid, uuid, numeric, text, text, text, text, text, date, boolean, boolean, date, boolean, text) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_send_to_ceo(uuid, uuid, text) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_approve(uuid, uuid, text) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_partially_approve(uuid, uuid, numeric, text) to service_role, authenticated;
grant execute on function public.finance_vendor_bill_reject(uuid, uuid, text) to service_role, authenticated;

comment on function public.finance_vendor_bill_submit(uuid, uuid) is
  'DRAFT → SUBMITTED. Requires goods_services_received = true and at least one non-superseded document.';
comment on function public.finance_vendor_bill_send_to_ceo(uuid, uuid, text) is
  'UNDER_REVIEW → PENDING_CEO_APPROVAL. Finance routing only — Finance is never a final approver.';
comment on function public.finance_vendor_bill_approve(uuid, uuid, text) is
  'CEO authorisation (platform_finance.request.approve). Sets approved_amount = billed_amount and atomically creates the vendor_bill Payable. Does not create payment or journal posting.';
comment on function public.finance_vendor_bill_partially_approve(uuid, uuid, numeric, text) is
  'CEO partial authorisation (0 < amount < billed_amount). Atomically creates the vendor_bill Payable for approved_amount. billed_amount is never overwritten.';
comment on function public.finance_vendor_bill_reject(uuid, uuid, text) is
  'CEO rejection. Terminal for the Vendor Bill domain and creates NO Payable.';

-- ---------------------------------------------------------------------------
-- Bypass prevention: no Payable may be minted outside an approval path
-- ---------------------------------------------------------------------------

/**
 * finance_payable_create is retained for signature compatibility but now
 * refuses every supported source type. Payables exist only as the product of
 * an approval decision:
 *   financial_request → finance_request_approve / finance_request_partially_approve
 *   vendor_bill       → finance_vendor_bill_approve / finance_vendor_bill_partially_approve
 * Both call their internal same-transaction insert helper.
 */
create or replace function public.finance_payable_create(
  p_actor_profile_id uuid,
  p_company_id uuid,
  p_payee_name text,
  p_payee_type text,
  p_payable_amount numeric,
  p_source_type text,
  p_source_id uuid,
  p_currency text default 'NGN',
  p_description text default null,
  p_due_date date default null,
  p_project_contract_ref text default null,
  p_period_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source_type = 'vendor_bill' then
    raise exception 'finance_payable_create: direct payable creation is disabled — vendor_bill payables are created only by finance_vendor_bill_approve / finance_vendor_bill_partially_approve after Vendor Bill → Finance review → CEO approval';
  end if;

  if p_source_type = 'financial_request' then
    raise exception 'finance_payable_create: direct payable creation is disabled — financial_request payables are created only by finance_request_approve / finance_request_partially_approve';
  end if;

  raise exception 'finance_payable_create: direct payable creation is disabled — a payable may only be created by an approval RPC (source_type=%)', coalesce(p_source_type, 'null');
end;
$$;

comment on function public.finance_payable_create(uuid, uuid, text, text, numeric, text, uuid, text, text, date, text, uuid) is
  'DISABLED bypass guard (kept for signature compatibility). Always raises. Payables are created only by finance_request_approve / finance_request_partially_approve (financial_request) or finance_vendor_bill_approve / finance_vendor_bill_partially_approve (vendor_bill).';

-- Clients may no longer mint draft payables straight into the table either.
-- With RLS enabled and no INSERT policy, authenticated inserts are rejected;
-- the approval RPCs run as SECURITY DEFINER / service_role and are unaffected.
drop policy if exists finance_payables_insert on public.finance_payables;
