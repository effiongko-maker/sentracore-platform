-- Platform Finance — Financial Requests Slice 2
-- Named SECURITY DEFINER transition RPCs (Foundation posting pattern).
-- Does NOT modify 20260914200000. No Storage, payables, payments, or posting.

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_actor_has_capability(
  p_organisation_id uuid,
  p_profile_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_capability_grants g
    where g.organisation_id = p_organisation_id
      and g.profile_id = p_profile_id
      and g.capability = p_capability
  );
$$;

create or replace function public.finance_request_actor_has_company_access(
  p_profile_id uuid,
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_company_access a
    where a.company_id = p_company_id
      and a.profile_id = p_profile_id
  );
$$;

create or replace function public.finance_request_has_active_supporting_document(
  p_request_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_request_documents d
    where d.request_id = p_request_id
      and d.document_role = 'supporting'
      and d.superseded_at is null
  );
$$;

create or replace function public.finance_request_append_event(
  p_organisation_id uuid,
  p_request_id uuid,
  p_actor_profile_id uuid,
  p_event_type text,
  p_from_status text,
  p_to_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.finance_request_events (
    organisation_id,
    request_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    metadata
  )
  values (
    p_organisation_id,
    p_request_id,
    p_actor_profile_id,
    p_event_type,
    p_from_status,
    p_to_status,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.finance_request_append_audit(
  p_organisation_id uuid,
  p_company_id uuid,
  p_actor_profile_id uuid,
  p_action text,
  p_request_id uuid,
  p_reason text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.finance_audit_events (
    organisation_id,
    company_id,
    actor_profile_id,
    action,
    object_type,
    object_id,
    reason,
    details
  )
  values (
    p_organisation_id,
    p_company_id,
    p_actor_profile_id,
    p_action,
    'finance_request',
    p_request_id::text,
    p_reason,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.finance_request_actor_has_capability(uuid, uuid, text) from public;
revoke all on function public.finance_request_actor_has_company_access(uuid, uuid) from public;
revoke all on function public.finance_request_has_active_supporting_document(uuid) from public;
revoke all on function public.finance_request_append_event(uuid, uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.finance_request_append_audit(uuid, uuid, uuid, text, uuid, text, jsonb) from public;

grant execute on function public.finance_request_actor_has_capability(uuid, uuid, text) to service_role, authenticated;
grant execute on function public.finance_request_actor_has_company_access(uuid, uuid) to service_role, authenticated;
grant execute on function public.finance_request_has_active_supporting_document(uuid) to service_role, authenticated;
grant execute on function public.finance_request_append_event(uuid, uuid, uuid, text, text, text, jsonb) to service_role, authenticated;
grant execute on function public.finance_request_append_audit(uuid, uuid, uuid, text, uuid, text, jsonb) to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- create
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_create(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_company_id uuid,
  p_category_id uuid,
  p_requested_amount numeric,
  p_purpose text,
  p_description text default null,
  p_payee_name text default null,
  p_payee_type text default 'other',
  p_required_by_date date default null,
  p_external_reference text default null,
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
    raise exception 'finance_request_create: p_actor_profile_id is required';
  end if;
  if p_organisation_id is null or p_company_id is null or p_category_id is null then
    raise exception 'finance_request_create: organisation, company, and category are required';
  end if;
  if p_requested_amount is null or p_requested_amount < 0 then
    raise exception 'finance_request_create: requested_amount must be >= 0';
  end if;
  if p_purpose is null or char_length(trim(p_purpose)) = 0 then
    raise exception 'finance_request_create: purpose is required';
  end if;
  if p_payee_name is null or char_length(trim(p_payee_name)) = 0 then
    raise exception 'finance_request_create: payee_name is required';
  end if;
  if p_payee_type is null or p_payee_type not in ('vendor', 'staff', 'other') then
    raise exception 'finance_request_create: invalid payee_type';
  end if;

  select organisation_id into v_company_org
  from public.finance_companies
  where id = p_company_id;

  if v_company_org is null then
    raise exception 'finance_request_create: company not found';
  end if;
  if v_company_org <> p_organisation_id then
    raise exception 'finance_request_create: company not in organisation';
  end if;

  if not public.finance_request_actor_has_capability(
    p_organisation_id, p_actor_profile_id, 'platform_finance.request.create'
  ) then
    raise exception 'finance_request_create: missing capability platform_finance.request.create';
  end if;

  if not public.finance_request_actor_has_company_access(p_actor_profile_id, p_company_id) then
    raise exception 'finance_request_create: no company access';
  end if;

  insert into public.finance_requests (
    organisation_id,
    company_id,
    requester_profile_id,
    status,
    currency,
    requested_amount,
    approved_amount,
    paid_amount,
    category_id,
    purpose,
    description,
    payee_name,
    payee_type,
    required_by_date,
    external_reference,
    project_contract_ref
  )
  values (
    p_organisation_id,
    p_company_id,
    p_actor_profile_id,
    'draft',
    coalesce(nullif(trim(p_currency), ''), 'NGN'),
    p_requested_amount,
    0,
    0,
    p_category_id,
    trim(p_purpose),
    nullif(trim(p_description), ''),
    trim(p_payee_name),
    p_payee_type,
    p_required_by_date,
    nullif(trim(p_external_reference), ''),
    nullif(trim(p_project_contract_ref), '')
  )
  returning id into v_id;

  perform public.finance_request_append_event(
    p_organisation_id,
    v_id,
    p_actor_profile_id,
    'created',
    null,
    'draft',
    jsonb_build_object('company_id', p_company_id, 'category_id', p_category_id)
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update draft
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_update_draft(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_category_id uuid default null,
  p_requested_amount numeric default null,
  p_purpose text default null,
  p_description text default null,
  p_payee_name text default null,
  p_payee_type text default null,
  p_required_by_date date default null,
  p_clear_required_by_date boolean default false,
  p_external_reference text default null,
  p_project_contract_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
  v_changed jsonb := '{}'::jsonb;
begin
  if p_actor_profile_id is null or p_request_id is null then
    raise exception 'finance_request_update_draft: actor and request id are required';
  end if;

  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_update_draft: request not found';
  end if;

  if v_req.status <> 'draft' then
    raise exception 'finance_request_update_draft: only draft requests may be updated';
  end if;

  if v_req.requester_profile_id <> p_actor_profile_id then
    raise exception 'finance_request_update_draft: only the requester may update the draft';
  end if;

  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, 'platform_finance.request.create'
  ) then
    raise exception 'finance_request_update_draft: missing capability platform_finance.request.create';
  end if;

  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_update_draft: no company access';
  end if;

  if p_requested_amount is not null and p_requested_amount < 0 then
    raise exception 'finance_request_update_draft: requested_amount must be >= 0';
  end if;
  if p_payee_type is not null and p_payee_type not in ('vendor', 'staff', 'other') then
    raise exception 'finance_request_update_draft: invalid payee_type';
  end if;
  if p_purpose is not null and char_length(trim(p_purpose)) = 0 then
    raise exception 'finance_request_update_draft: purpose cannot be empty';
  end if;
  if p_payee_name is not null and char_length(trim(p_payee_name)) = 0 then
    raise exception 'finance_request_update_draft: payee_name cannot be empty';
  end if;

  update public.finance_requests
  set
    category_id = coalesce(p_category_id, category_id),
    requested_amount = coalesce(p_requested_amount, requested_amount),
    purpose = coalesce(nullif(trim(p_purpose), ''), purpose),
    description = case
      when p_description is null then description
      else nullif(trim(p_description), '')
    end,
    payee_name = coalesce(nullif(trim(p_payee_name), ''), payee_name),
    payee_type = coalesce(p_payee_type, payee_type),
    required_by_date = case
      when p_clear_required_by_date then null
      when p_required_by_date is not null then p_required_by_date
      else required_by_date
    end,
    external_reference = case
      when p_external_reference is null then external_reference
      else nullif(trim(p_external_reference), '')
    end,
    project_contract_ref = case
      when p_project_contract_ref is null then project_contract_ref
      else nullif(trim(p_project_contract_ref), '')
    end,
    updated_at = timezone('utc', now())
  where id = v_req.id;

  v_changed := jsonb_strip_nulls(
    jsonb_build_object(
      'category_id', p_category_id,
      'requested_amount', p_requested_amount,
      'purpose', p_purpose,
      'description', p_description,
      'payee_name', p_payee_name,
      'payee_type', p_payee_type,
      'required_by_date', p_required_by_date,
      'clear_required_by_date', case when p_clear_required_by_date then true else null end,
      'external_reference', p_external_reference,
      'project_contract_ref', p_project_contract_ref
    )
  );

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'updated',
    'draft',
    'draft',
    jsonb_build_object('fields', v_changed)
  );

  if v_changed <> '{}'::jsonb then
    perform public.finance_request_append_event(
      v_req.organisation_id,
      v_req.id,
      p_actor_profile_id,
      'field_changed',
      'draft',
      'draft',
      v_changed
    );
  end if;

  return v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_submit(
  p_actor_profile_id uuid,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
begin
  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_submit: request not found';
  end if;
  if v_req.status <> 'draft' then
    raise exception 'finance_request_submit: invalid status transition from %', v_req.status;
  end if;
  if v_req.requester_profile_id <> p_actor_profile_id then
    raise exception 'finance_request_submit: only the requester may submit';
  end if;
  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, 'platform_finance.request.create'
  ) then
    raise exception 'finance_request_submit: missing capability platform_finance.request.create';
  end if;
  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_submit: no company access';
  end if;
  if char_length(trim(v_req.purpose)) = 0 or char_length(trim(v_req.payee_name)) = 0 then
    raise exception 'finance_request_submit: incomplete request content';
  end if;
  if v_req.category_id is null then
    raise exception 'finance_request_submit: category is required';
  end if;
  if not public.finance_request_has_active_supporting_document(v_req.id) then
    raise exception 'finance_request_submit: supporting documentation is required';
  end if;

  update public.finance_requests
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'submitted',
    'draft',
    'submitted',
    '{}'::jsonb
  );

  perform public.finance_request_append_audit(
    v_req.organisation_id,
    v_req.company_id,
    p_actor_profile_id,
    'finance.request.submitted',
    v_req.id,
    null,
    jsonb_build_object('from_status', 'draft', 'to_status', 'submitted')
  );

  return v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- start review
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_start_review(
  p_actor_profile_id uuid,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
begin
  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_start_review: request not found';
  end if;
  if v_req.status <> 'submitted' then
    raise exception 'finance_request_start_review: invalid status transition from %', v_req.status;
  end if;
  if v_req.requester_profile_id = p_actor_profile_id then
    raise exception 'finance_request_start_review: separation of duties — requester cannot review own request';
  end if;
  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, 'platform_finance.request.review'
  ) then
    raise exception 'finance_request_start_review: missing capability platform_finance.request.review';
  end if;
  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_start_review: no company access';
  end if;

  update public.finance_requests
  set
    status = 'under_review',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'review_started',
    'submitted',
    'under_review',
    '{}'::jsonb
  );

  return v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- query (Finance or CEO)
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_query(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_reason text,
  p_actor_role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
  v_from text;
  v_cap text;
begin
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'finance_request_query: query reason is required';
  end if;
  if p_actor_role not in ('finance', 'ceo') then
    raise exception 'finance_request_query: p_actor_role must be finance or ceo';
  end if;

  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_query: request not found';
  end if;

  if p_actor_role = 'finance' then
    if v_req.status <> 'under_review' then
      raise exception 'finance_request_query: finance may only query under_review (status=%)', v_req.status;
    end if;
    v_cap := 'platform_finance.request.review';
  else
    if v_req.status <> 'pending_ceo_approval' then
      raise exception 'finance_request_query: ceo may only query pending_ceo_approval (status=%)', v_req.status;
    end if;
    v_cap := 'platform_finance.request.approve';
  end if;

  if v_req.requester_profile_id = p_actor_profile_id then
    raise exception 'finance_request_query: separation of duties — requester cannot query own request as reviewer/approver';
  end if;
  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, v_cap
  ) then
    raise exception 'finance_request_query: missing capability %', v_cap;
  end if;
  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_query: no company access';
  end if;

  v_from := v_req.status;

  update public.finance_requests
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
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'queried',
    v_from,
    'query',
    jsonb_build_object('reason', trim(p_reason), 'actor_role', p_actor_role)
  );

  return v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- resubmit (QUERY → RESUBMITTED → UNDER_REVIEW atomically)
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_resubmit(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_category_id uuid default null,
  p_requested_amount numeric default null,
  p_purpose text default null,
  p_description text default null,
  p_payee_name text default null,
  p_payee_type text default null,
  p_required_by_date date default null,
  p_clear_required_by_date boolean default false,
  p_external_reference text default null,
  p_project_contract_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
begin
  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_resubmit: request not found';
  end if;
  if v_req.status <> 'query' then
    raise exception 'finance_request_resubmit: invalid status transition from %', v_req.status;
  end if;
  if v_req.requester_profile_id <> p_actor_profile_id then
    raise exception 'finance_request_resubmit: only the requester may resubmit';
  end if;
  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, 'platform_finance.request.create'
  ) then
    raise exception 'finance_request_resubmit: missing capability platform_finance.request.create';
  end if;
  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_resubmit: no company access';
  end if;
  if p_requested_amount is not null and p_requested_amount < 0 then
    raise exception 'finance_request_resubmit: requested_amount must be >= 0';
  end if;
  if p_payee_type is not null and p_payee_type not in ('vendor', 'staff', 'other') then
    raise exception 'finance_request_resubmit: invalid payee_type';
  end if;

  update public.finance_requests
  set
    category_id = coalesce(p_category_id, category_id),
    requested_amount = coalesce(p_requested_amount, requested_amount),
    purpose = coalesce(nullif(trim(p_purpose), ''), purpose),
    description = case
      when p_description is null then description
      else nullif(trim(p_description), '')
    end,
    payee_name = coalesce(nullif(trim(p_payee_name), ''), payee_name),
    payee_type = coalesce(p_payee_type, payee_type),
    required_by_date = case
      when p_clear_required_by_date then null
      when p_required_by_date is not null then p_required_by_date
      else required_by_date
    end,
    external_reference = case
      when p_external_reference is null then external_reference
      else nullif(trim(p_external_reference), '')
    end,
    project_contract_ref = case
      when p_project_contract_ref is null then project_contract_ref
      else nullif(trim(p_project_contract_ref), '')
    end,
    status = 'resubmitted',
    updated_at = timezone('utc', now())
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'resubmitted',
    'query',
    'resubmitted',
    '{}'::jsonb
  );

  update public.finance_requests
  set
    status = 'under_review',
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'review_started',
    'resubmitted',
    'under_review',
    jsonb_build_object('via', 'resubmit')
  );

  return v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- send to CEO
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_send_to_ceo(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_finance_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
begin
  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_send_to_ceo: request not found';
  end if;
  if v_req.status <> 'under_review' then
    raise exception 'finance_request_send_to_ceo: invalid status transition from %', v_req.status;
  end if;
  if v_req.requester_profile_id = p_actor_profile_id then
    raise exception 'finance_request_send_to_ceo: separation of duties — requester cannot route own request';
  end if;
  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, 'platform_finance.request.review'
  ) then
    raise exception 'finance_request_send_to_ceo: missing capability platform_finance.request.review';
  end if;
  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_send_to_ceo: no company access';
  end if;
  if not public.finance_request_has_active_supporting_document(v_req.id) then
    raise exception 'finance_request_send_to_ceo: supporting documentation is required';
  end if;
  if v_req.requested_amount is null or v_req.requested_amount < 0 then
    raise exception 'finance_request_send_to_ceo: invalid requested_amount';
  end if;

  update public.finance_requests
  set
    status = 'pending_ceo_approval',
    finance_notes = case
      when p_finance_notes is null then finance_notes
      else nullif(trim(p_finance_notes), '')
    end,
    updated_at = timezone('utc', now())
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'sent_to_ceo',
    'under_review',
    'pending_ceo_approval',
    '{}'::jsonb
  );

  return v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- CEO approve (full)
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
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'approved',
    'pending_ceo_approval',
    'approved',
    jsonb_build_object(
      'approved_amount', v_req.requested_amount,
      'requested_amount', v_req.requested_amount
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
      'approved_amount', v_req.requested_amount,
      'requested_amount', v_req.requested_amount
    )
  );

  return v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- CEO partial approve
-- ---------------------------------------------------------------------------

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
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'partially_approved',
    'pending_ceo_approval',
    'partially_approved',
    jsonb_build_object(
      'approved_amount', p_approved_amount,
      'requested_amount', v_req.requested_amount
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
      'approved_amount', p_approved_amount,
      'requested_amount', v_req.requested_amount
    )
  );

  return v_req.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- CEO reject
-- ---------------------------------------------------------------------------

create or replace function public.finance_request_reject(
  p_actor_profile_id uuid,
  p_request_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.finance_requests%rowtype;
begin
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'finance_request_reject: rejection reason is required';
  end if;

  select * into v_req
  from public.finance_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'finance_request_reject: request not found';
  end if;
  if v_req.status <> 'pending_ceo_approval' then
    raise exception 'finance_request_reject: invalid status transition from %', v_req.status;
  end if;
  if v_req.requester_profile_id = p_actor_profile_id then
    raise exception 'finance_request_reject: separation of duties — requester cannot reject own request';
  end if;
  if not public.finance_request_actor_has_capability(
    v_req.organisation_id, p_actor_profile_id, 'platform_finance.request.approve'
  ) then
    raise exception 'finance_request_reject: missing capability platform_finance.request.approve';
  end if;
  if not public.finance_request_actor_has_company_access(p_actor_profile_id, v_req.company_id) then
    raise exception 'finance_request_reject: no company access';
  end if;

  update public.finance_requests
  set
    status = 'rejected',
    approved_amount = 0,
    paid_amount = 0,
    decided_at = timezone('utc', now()),
    ceo_decision_notes = trim(p_reason),
    updated_at = timezone('utc', now())
  where id = v_req.id;

  perform public.finance_request_append_event(
    v_req.organisation_id,
    v_req.id,
    p_actor_profile_id,
    'rejected',
    'pending_ceo_approval',
    'rejected',
    jsonb_build_object('reason', trim(p_reason))
  );

  perform public.finance_request_append_audit(
    v_req.organisation_id,
    v_req.company_id,
    p_actor_profile_id,
    'finance.request.rejected',
    v_req.id,
    trim(p_reason),
    jsonb_build_object('approved_amount', 0)
  );

  return v_req.id;
end;
$$;

-- Grants (app gates via requirePlatformFinanceAccess then createAdminClient)
revoke all on function public.finance_request_create(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text) from public;
revoke all on function public.finance_request_update_draft(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text) from public;
revoke all on function public.finance_request_submit(uuid, uuid) from public;
revoke all on function public.finance_request_start_review(uuid, uuid) from public;
revoke all on function public.finance_request_query(uuid, uuid, text, text) from public;
revoke all on function public.finance_request_resubmit(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text) from public;
revoke all on function public.finance_request_send_to_ceo(uuid, uuid, text) from public;
revoke all on function public.finance_request_approve(uuid, uuid, text) from public;
revoke all on function public.finance_request_partially_approve(uuid, uuid, numeric, text) from public;
revoke all on function public.finance_request_reject(uuid, uuid, text) from public;

grant execute on function public.finance_request_create(uuid, uuid, uuid, uuid, numeric, text, text, text, text, date, text, text, text) to service_role, authenticated;
grant execute on function public.finance_request_update_draft(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text) to service_role, authenticated;
grant execute on function public.finance_request_submit(uuid, uuid) to service_role, authenticated;
grant execute on function public.finance_request_start_review(uuid, uuid) to service_role, authenticated;
grant execute on function public.finance_request_query(uuid, uuid, text, text) to service_role, authenticated;
grant execute on function public.finance_request_resubmit(uuid, uuid, uuid, numeric, text, text, text, text, date, boolean, text, text) to service_role, authenticated;
grant execute on function public.finance_request_send_to_ceo(uuid, uuid, text) to service_role, authenticated;
grant execute on function public.finance_request_approve(uuid, uuid, text) to service_role, authenticated;
grant execute on function public.finance_request_partially_approve(uuid, uuid, numeric, text) to service_role, authenticated;
grant execute on function public.finance_request_reject(uuid, uuid, text) to service_role, authenticated;

comment on function public.finance_request_approve(uuid, uuid, text) is
  'CEO funding authorisation only. Does not create payable, payment, or journal posting.';
comment on function public.finance_request_partially_approve(uuid, uuid, numeric, text) is
  'CEO partial funding authorisation only. Does not create payable, payment, or journal posting.';
comment on function public.finance_request_reject(uuid, uuid, text) is
  'CEO rejection is terminal for the Financial Request domain in v1.';
