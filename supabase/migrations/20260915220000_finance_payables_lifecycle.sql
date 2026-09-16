-- Platform Finance — Payables Slice 2
-- Lifecycle RPCs + atomic Financial Request CEO approval → Payable creation.
-- Does NOT implement Banking/Payments or Journal posting.
-- SCHEDULED / PAYMENT_PENDING / PAID transitions remain reserved until Banking exists.

-- ---------------------------------------------------------------------------
-- Insert approved payable from CEO-approved Financial Request (same TX)
-- ---------------------------------------------------------------------------

create or replace function public.finance_payable_insert_from_approved_request(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_approved_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
  v_payable_id uuid;
begin
  if p_approved_amount is null or p_approved_amount <= 0 then
    raise exception
      'finance_payable_insert_from_approved_request: approved amount must be > 0';
  end if;

  select * into v_req
  from public.finance_requests
  where id = p_request_id;

  if not found then
    raise exception
      'finance_payable_insert_from_approved_request: request not found';
  end if;

  if v_req.status not in ('approved', 'partially_approved') then
    raise exception
      'finance_payable_insert_from_approved_request: request must already be decided (status=%)',
      v_req.status;
  end if;

  if p_approved_amount <> v_req.approved_amount then
    raise exception
      'finance_payable_insert_from_approved_request: amount must equal request approved_amount';
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
      v_req.organisation_id,
      v_req.company_id,
      p_actor_profile_id,
      'approved',
      v_req.currency,
      p_approved_amount,
      0,
      v_req.payee_name,
      v_req.payee_type,
      v_req.description,
      v_req.required_by_date,
      'financial_request',
      v_req.id,
      v_req.project_contract_ref,
      null
    )
    returning id into v_payable_id;
  exception
    when unique_violation then
      raise exception
        'finance_payable_insert_from_approved_request: payable already exists for this financial request';
  end;

  perform public.finance_payable_append_event(
    v_req.organisation_id,
    v_payable_id,
    p_actor_profile_id,
    'created',
    null,
    'approved',
    jsonb_build_object(
      'source_type', 'financial_request',
      'source_id', v_req.id,
      'payable_amount', p_approved_amount,
      'origin', 'ceo_request_approval'
    )
  );

  perform public.finance_payable_append_event(
    v_req.organisation_id,
    v_payable_id,
    p_actor_profile_id,
    'approved',
    null,
    'approved',
    jsonb_build_object(
      'source_type', 'financial_request',
      'source_id', v_req.id,
      'payable_amount', p_approved_amount
    )
  );

  return v_payable_id;
end;
$$;

revoke all on function public.finance_payable_insert_from_approved_request(uuid, uuid, numeric)
  from public;
grant execute on function public.finance_payable_insert_from_approved_request(uuid, uuid, numeric)
  to service_role;

comment on function public.finance_payable_insert_from_approved_request(uuid, uuid, numeric) is
  'Internal Slice 2 helper: create approved payable from decided Financial Request. Invoked only inside approve RPCs (same transaction). Not a client API.';

-- ---------------------------------------------------------------------------
-- Replace CEO approve / partial approve — atomic payable creation
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_approve(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_decision_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
  v_payable_id uuid;
begin
  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_approve: request not found';
  end if;
  if v_req.status <> 'pending_ceo_approval' then
    raise exception 'finance_request_approve: invalid status transition from %', v_req.status;
  end if;
  if v_req.requester_profile_id = p_actor_profile_id then
    raise exception 'finance_request_approve: separation of duties — requester cannot approve own request';
  end if;
  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, 'platform_finance.request.approve'
  ) then
    raise exception 'finance_request_approve: missing capability platform_finance.request.approve';
  end if;
  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_approve: no company access';
  end if;
  if v_req.requested_amount is null or v_req.requested_amount <= 0 then
    raise exception 'finance_request_approve: requested_amount must be > 0 to create a payable';
  end if;

  update public.finance_requests
  set
    status = 'approved',
    approved_amount = requested_amount,
    paid_amount = 0,
    decided_at = timezone('utc', now()),
    ceo_decision_notes = case
      when p_decision_notes is null then ceo_decision_notes
      else nullif(trim(p_decision_notes), '')
    end,
    updated_at = timezone('utc', now())
  where id = v_req.id
  returning * into v_req;

  -- Payable creation MUST succeed in this same transaction or the approval rolls back.
  v_payable_id := public.finance_payable_insert_from_approved_request(
    p_actor_profile_id,
    v_req.id,
    v_req.approved_amount
  );

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'approved',
    'pending_ceo_approval',
    'approved',
    jsonb_build_object(
      'approved_amount', v_req.approved_amount,
      'requested_amount', v_req.requested_amount,
      'payable_id', v_payable_id
    )
  );

  perform public.finance_request_append_audit(
    v_req.organisation_id,
    v_req.company_id,
    p_actor_profile_id,
    'finance.request.approved',
    v_req.id,
    p_decision_notes,
    jsonb_build_object(
      'approved_amount', v_req.approved_amount,
      'requested_amount', v_req.requested_amount,
      'payable_id', v_payable_id
    )
  );

  return v_req.id;
end;
$$;

create or replace function public.finance_request_partially_approve(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_approved_amount numeric,
  p_decision_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
  v_payable_id uuid;
begin
  if p_approved_amount is null then
    raise exception 'finance_request_partially_approve: approved_amount is required';
  end if;

  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_partially_approve: request not found';
  end if;
  if v_req.status <> 'pending_ceo_approval' then
    raise exception 'finance_request_partially_approve: invalid status transition from %', v_req.status;
  end if;
  if v_req.requester_profile_id = p_actor_profile_id then
    raise exception 'finance_request_partially_approve: separation of duties — requester cannot approve own request';
  end if;
  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, 'platform_finance.request.approve'
  ) then
    raise exception 'finance_request_partially_approve: missing capability platform_finance.request.approve';
  end if;
  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_partially_approve: no company access';
  end if;
  if p_approved_amount <= 0 or p_approved_amount >= v_req.requested_amount then
    raise exception
      'finance_request_partially_approve: approved_amount must satisfy 0 < amount < requested_amount';
  end if;

  update public.finance_requests
  set
    status = 'partially_approved',
    approved_amount = p_approved_amount,
    paid_amount = 0,
    decided_at = timezone('utc', now()),
    ceo_decision_notes = case
      when p_decision_notes is null then ceo_decision_notes
      else nullif(trim(p_decision_notes), '')
    end,
    updated_at = timezone('utc', now())
  where id = v_req.id
  returning * into v_req;

  v_payable_id := public.finance_payable_insert_from_approved_request(
    p_actor_profile_id,
    v_req.id,
    v_req.approved_amount
  );

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'partially_approved',
    'pending_ceo_approval',
    'partially_approved',
    jsonb_build_object(
      'approved_amount', v_req.approved_amount,
      'requested_amount', v_req.requested_amount,
      'payable_id', v_payable_id
    )
  );

  perform public.finance_request_append_audit(
    v_req.organisation_id,
    v_req.company_id,
    p_actor_profile_id,
    'finance.request.partially_approved',
    v_req.id,
    p_decision_notes,
    jsonb_build_object(
      'approved_amount', v_req.approved_amount,
      'requested_amount', v_req.requested_amount,
      'payable_id', v_payable_id
    )
  );

  return v_req.id;
end;
$$;

comment on function public.finance_request_approve(uuid, uuid, text) is
  'CEO funding authorisation. Atomically creates an approved Payable for approved_amount (= requested_amount). Does not create payment or journal posting.';

comment on function public.finance_request_partially_approve(uuid, uuid, numeric, text) is
  'CEO partial funding authorisation. Atomically creates an approved Payable for approved_amount (0 < amount < requested). Does not create payment or journal posting. requested_amount is never overwritten.';

-- finance_request_reject intentionally unchanged — creates no Payable.

revoke all on function public.finance_request_approve(uuid, uuid, text) from public;
revoke all on function public.finance_request_partially_approve(uuid, uuid, numeric, text) from public;
grant execute on function public.finance_request_approve(uuid, uuid, text)
  to service_role, authenticated;
grant execute on function public.finance_request_partially_approve(uuid, uuid, numeric, text)
  to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Payable native lifecycle (named transitions — no generic status mutation)
-- Banking states SCHEDULED / PAYMENT_PENDING / PAID are NOT transitioned here.
-- ---------------------------------------------------------------------------

create or replace function public.finance_payable_update_draft(
  p_actor_profile_id uuid,
  p_payable_id uuid,
  p_payee_name text default null,
  p_payee_type text default null,
  p_payable_amount numeric default null,
  p_description text default null,
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
  v_pay public.finance_payables%rowtype;
begin
  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payable_update_draft: payable not found';
  end if;
  if v_pay.status <> 'draft' then
    raise exception 'finance_payable_update_draft: only draft payables can be updated (status=%)', v_pay.status;
  end if;
  if v_pay.source_type = 'financial_request' then
    raise exception 'finance_payable_update_draft: request-originated payables are not draft-editable';
  end if;
  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.create'
  ) then
    raise exception 'finance_payable_update_draft: missing capability platform_finance.payable.create';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_pay.company_id) then
    raise exception 'finance_payable_update_draft: no company access';
  end if;
  if v_pay.created_by_profile_id <> p_actor_profile_id then
    raise exception 'finance_payable_update_draft: only the creator can update a draft payable';
  end if;

  if p_payee_type is not null and p_payee_type not in ('vendor', 'staff', 'other') then
    raise exception 'finance_payable_update_draft: invalid payee_type';
  end if;
  if p_payable_amount is not null and p_payable_amount <= 0 then
    raise exception 'finance_payable_update_draft: payable_amount must be > 0';
  end if;

  update public.finance_payables
  set
    payee_name = case
      when p_payee_name is null then payee_name
      else trim(p_payee_name)
    end,
    payee_type = coalesce(p_payee_type, payee_type),
    payable_amount = coalesce(p_payable_amount, payable_amount),
    description = case
      when p_description is null then description
      else nullif(trim(p_description), '')
    end,
    due_date = case
      when p_clear_due_date then null
      when p_due_date is null then due_date
      else p_due_date
    end,
    project_contract_ref = case
      when p_project_contract_ref is null then project_contract_ref
      else nullif(trim(p_project_contract_ref), '')
    end,
    currency = case
      when p_currency is null then currency
      else trim(p_currency)
    end,
    updated_at = timezone('utc', now())
  where id = v_pay.id;

  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    'updated',
    'draft',
    'draft',
    '{}'::jsonb
  );

  return v_pay.id;
end;
$$;

create or replace function public.finance_payable_submit(
  p_actor_profile_id uuid,
  p_payable_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.finance_payables%rowtype;
begin
  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payable_submit: payable not found';
  end if;
  if v_pay.status <> 'draft' then
    raise exception 'finance_payable_submit: invalid status transition from %', v_pay.status;
  end if;
  if v_pay.source_type = 'financial_request' then
    raise exception 'finance_payable_submit: request-originated payables are created already approved';
  end if;
  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.create'
  ) then
    raise exception 'finance_payable_submit: missing capability platform_finance.payable.create';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_pay.company_id) then
    raise exception 'finance_payable_submit: no company access';
  end if;
  if v_pay.created_by_profile_id <> p_actor_profile_id then
    raise exception 'finance_payable_submit: only the creator can submit a draft payable';
  end if;
  if v_pay.payable_amount <= 0 then
    raise exception 'finance_payable_submit: payable_amount must be > 0';
  end if;

  update public.finance_payables
  set
    status = 'pending_approval',
    updated_at = timezone('utc', now())
  where id = v_pay.id;

  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    'submitted',
    'draft',
    'pending_approval',
    '{}'::jsonb
  );

  return v_pay.id;
end;
$$;

create or replace function public.finance_payable_start_review(
  p_actor_profile_id uuid,
  p_payable_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.finance_payables%rowtype;
begin
  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payable_start_review: payable not found';
  end if;
  if v_pay.status <> 'pending_approval' then
    raise exception 'finance_payable_start_review: invalid status transition from %', v_pay.status;
  end if;
  if v_pay.created_by_profile_id = p_actor_profile_id then
    raise exception 'finance_payable_start_review: separation of duties — creator cannot review own payable';
  end if;
  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.review'
  ) then
    raise exception 'finance_payable_start_review: missing capability platform_finance.payable.review';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_pay.company_id) then
    raise exception 'finance_payable_start_review: no company access';
  end if;

  -- Review is recorded without inventing a new status (pending_approval remains).
  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    'field_changed',
    'pending_approval',
    'pending_approval',
    jsonb_build_object('review', 'started')
  );

  return v_pay.id;
end;
$$;

create or replace function public.finance_payable_approve(
  p_actor_profile_id uuid,
  p_payable_id uuid,
  p_decision_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.finance_payables%rowtype;
begin
  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payable_approve: payable not found';
  end if;
  if v_pay.status <> 'pending_approval' then
    raise exception 'finance_payable_approve: invalid status transition from %', v_pay.status;
  end if;
  if v_pay.created_by_profile_id = p_actor_profile_id then
    raise exception 'finance_payable_approve: separation of duties — creator cannot approve own payable';
  end if;
  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.approve'
  ) then
    raise exception 'finance_payable_approve: missing capability platform_finance.payable.approve';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_pay.company_id) then
    raise exception 'finance_payable_approve: no company access';
  end if;
  if v_pay.payable_amount <= 0 then
    raise exception 'finance_payable_approve: payable_amount must be > 0';
  end if;

  update public.finance_payables
  set
    status = 'approved',
    updated_at = timezone('utc', now())
  where id = v_pay.id;

  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    'approved',
    'pending_approval',
    'approved',
    jsonb_build_object(
      'payable_amount', v_pay.payable_amount,
      'notes', nullif(trim(coalesce(p_decision_notes, '')), '')
    )
  );

  return v_pay.id;
end;
$$;

create or replace function public.finance_payable_partially_approve(
  p_actor_profile_id uuid,
  p_payable_id uuid,
  p_approved_amount numeric,
  p_decision_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.finance_payables%rowtype;
  v_prior numeric(18, 2);
begin
  if p_approved_amount is null then
    raise exception 'finance_payable_partially_approve: approved_amount is required';
  end if;

  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payable_partially_approve: payable not found';
  end if;
  if v_pay.status <> 'pending_approval' then
    raise exception 'finance_payable_partially_approve: invalid status transition from %', v_pay.status;
  end if;
  if v_pay.created_by_profile_id = p_actor_profile_id then
    raise exception 'finance_payable_partially_approve: separation of duties — creator cannot approve own payable';
  end if;
  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.approve'
  ) then
    raise exception 'finance_payable_partially_approve: missing capability platform_finance.payable.approve';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_pay.company_id) then
    raise exception 'finance_payable_partially_approve: no company access';
  end if;
  if p_approved_amount <= 0 or p_approved_amount >= v_pay.payable_amount then
    raise exception
      'finance_payable_partially_approve: approved_amount must satisfy 0 < amount < payable_amount';
  end if;

  v_prior := v_pay.payable_amount;

  update public.finance_payables
  set
    status = 'approved',
    payable_amount = p_approved_amount,
    updated_at = timezone('utc', now())
  where id = v_pay.id;

  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    'approved',
    'pending_approval',
    'approved',
    jsonb_build_object(
      'partial', true,
      'prior_payable_amount', v_prior,
      'payable_amount', p_approved_amount,
      'notes', nullif(trim(coalesce(p_decision_notes, '')), '')
    )
  );

  return v_pay.id;
end;
$$;

create or replace function public.finance_payable_reject(
  p_actor_profile_id uuid,
  p_payable_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.finance_payables%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'finance_payable_reject: rejection reason is required';
  end if;

  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payable_reject: payable not found';
  end if;
  if v_pay.status <> 'pending_approval' then
    raise exception 'finance_payable_reject: invalid status transition from %', v_pay.status;
  end if;
  if v_pay.created_by_profile_id = p_actor_profile_id then
    raise exception 'finance_payable_reject: separation of duties — creator cannot reject own payable';
  end if;
  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.approve'
  ) then
    raise exception 'finance_payable_reject: missing capability platform_finance.payable.approve';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_pay.company_id) then
    raise exception 'finance_payable_reject: no company access';
  end if;

  update public.finance_payables
  set
    status = 'rejected',
    updated_at = timezone('utc', now())
  where id = v_pay.id;

  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    'rejected',
    'pending_approval',
    'rejected',
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_pay.id;
end;
$$;

create or replace function public.finance_payable_query(
  p_actor_profile_id uuid,
  p_payable_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.finance_payables%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'finance_payable_query: query reason is required';
  end if;

  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payable_query: payable not found';
  end if;
  if v_pay.status <> 'pending_approval' then
    raise exception 'finance_payable_query: invalid status transition from %', v_pay.status;
  end if;
  if v_pay.created_by_profile_id = p_actor_profile_id then
    raise exception 'finance_payable_query: separation of duties — creator cannot query own payable as reviewer';
  end if;
  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.review'
  ) then
    raise exception 'finance_payable_query: missing capability platform_finance.payable.review';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_pay.company_id) then
    raise exception 'finance_payable_query: no company access';
  end if;

  -- Return to draft for creator revision (no invented QUERY status).
  update public.finance_payables
  set
    status = 'draft',
    updated_at = timezone('utc', now())
  where id = v_pay.id;

  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    'field_changed',
    'pending_approval',
    'draft',
    jsonb_build_object('query_reason', trim(p_reason))
  );

  return v_pay.id;
end;
$$;

create or replace function public.finance_payable_cancel(
  p_actor_profile_id uuid,
  p_payable_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.finance_payables%rowtype;
  v_from text;
begin
  select * into v_pay
  from public.finance_payables
  where id = p_payable_id
  for update;

  if not found then
    raise exception 'finance_payable_cancel: payable not found';
  end if;
  if v_pay.status not in ('draft', 'pending_approval') then
    raise exception 'finance_payable_cancel: invalid status transition from %', v_pay.status;
  end if;
  if not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.create'
  )
  and not public.finance_payable_actor_has_capability(
    v_pay.organisation_id, p_actor_profile_id, 'platform_finance.payable.review'
  ) then
    raise exception 'finance_payable_cancel: missing capability';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_pay.company_id) then
    raise exception 'finance_payable_cancel: no company access';
  end if;

  v_from := v_pay.status;

  update public.finance_payables
  set
    status = 'cancelled',
    updated_at = timezone('utc', now())
  where id = v_pay.id;

  perform public.finance_payable_append_event(
    v_pay.organisation_id,
    v_pay.id,
    p_actor_profile_id,
    'cancelled',
    v_from,
    'cancelled',
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  );

  return v_pay.id;
end;
$$;

revoke all on function public.finance_payable_update_draft(uuid, uuid, text, text, numeric, text, date, boolean, text, text) from public;
revoke all on function public.finance_payable_submit(uuid, uuid) from public;
revoke all on function public.finance_payable_start_review(uuid, uuid) from public;
revoke all on function public.finance_payable_approve(uuid, uuid, text) from public;
revoke all on function public.finance_payable_partially_approve(uuid, uuid, numeric, text) from public;
revoke all on function public.finance_payable_reject(uuid, uuid, text) from public;
revoke all on function public.finance_payable_query(uuid, uuid, text) from public;
revoke all on function public.finance_payable_cancel(uuid, uuid, text) from public;

grant execute on function public.finance_payable_update_draft(uuid, uuid, text, text, numeric, text, date, boolean, text, text)
  to service_role, authenticated;
grant execute on function public.finance_payable_submit(uuid, uuid)
  to service_role, authenticated;
grant execute on function public.finance_payable_start_review(uuid, uuid)
  to service_role, authenticated;
grant execute on function public.finance_payable_approve(uuid, uuid, text)
  to service_role, authenticated;
grant execute on function public.finance_payable_partially_approve(uuid, uuid, numeric, text)
  to service_role, authenticated;
grant execute on function public.finance_payable_reject(uuid, uuid, text)
  to service_role, authenticated;
grant execute on function public.finance_payable_query(uuid, uuid, text)
  to service_role, authenticated;
grant execute on function public.finance_payable_cancel(uuid, uuid, text)
  to service_role, authenticated;

comment on function public.finance_payable_submit(uuid, uuid) is
  'DRAFT → PENDING_APPROVAL. Not used for request-originated payables.';
comment on function public.finance_payable_approve(uuid, uuid, text) is
  'PENDING_APPROVAL → APPROVED (native payable path). Does not create payment or journal.';
comment on function public.finance_payable_start_review(uuid, uuid) is
  'Records Finance review activity while remaining PENDING_APPROVAL (no invented under_review status).';
