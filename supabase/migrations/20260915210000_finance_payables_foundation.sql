-- Platform Finance — Payables Slice 1 (domain foundation).
-- Schema / RLS / create primitive only.
-- Does NOT modify finance_request_approve / finance_request_partially_approve.
-- No UI, payment execution, banking, posting, Storage bucket, or vendor master.

-- ---------------------------------------------------------------------------
-- Payables (obligations — not requests, not payments, not journals)
-- ---------------------------------------------------------------------------

create table public.finance_payables (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'draft',
  currency text not null default 'NGN',
  payable_amount numeric(18, 2) not null,
  paid_amount numeric(18, 2) not null default 0,
  payee_name text not null,
  payee_type text not null,
  description text,
  due_date date,
  source_type text not null,
  source_id uuid not null,
  project_contract_ref text,
  period_id uuid references public.finance_periods (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_payables_status_check
    check (
      status in (
        'draft',
        'pending_approval',
        'approved',
        'scheduled',
        'payment_pending',
        'paid',
        'rejected',
        'cancelled',
        'disputed'
      )
    ),
  constraint finance_payables_currency_nonempty
    check (char_length(trim(currency)) > 0),
  constraint finance_payables_payee_name_nonempty
    check (char_length(trim(payee_name)) > 0),
  constraint finance_payables_payee_type_check
    check (payee_type in ('vendor', 'staff', 'other')),
  constraint finance_payables_source_type_check
    check (source_type in ('financial_request', 'vendor_bill')),
  constraint finance_payables_payable_amount_positive
    check (payable_amount > 0),
  constraint finance_payables_paid_amount_nonneg
    check (paid_amount >= 0),
  constraint finance_payables_paid_lte_payable
    check (paid_amount <= payable_amount),
  constraint finance_payables_source_unique
    unique (source_type, source_id)
);

create index finance_payables_org_status_idx
  on public.finance_payables (organisation_id, status, created_at desc);
create index finance_payables_company_status_idx
  on public.finance_payables (company_id, status, created_at desc);
create index finance_payables_due_date_idx
  on public.finance_payables (company_id, due_date)
  where due_date is not null;
create index finance_payables_source_idx
  on public.finance_payables (source_type, source_id);

create trigger finance_payables_set_updated_at
before update on public.finance_payables
for each row execute function public.set_updated_at();

create or replace function public.finance_payables_align_org()
returns trigger
language plpgsql
as $$
declare
  company_org uuid;
  period_org uuid;
  period_company uuid;
begin
  select organisation_id into company_org
  from public.finance_companies
  where id = new.company_id;

  if company_org is null then
    raise exception 'finance company % not found', new.company_id;
  end if;

  new.organisation_id := company_org;

  if new.period_id is not null then
    select organisation_id, company_id into period_org, period_company
    from public.finance_periods
    where id = new.period_id;

    if period_org is null then
      raise exception 'finance period % not found', new.period_id;
    end if;
    if period_org <> new.organisation_id then
      raise exception 'finance period % belongs to a different organisation', new.period_id;
    end if;
    if period_company <> new.company_id then
      raise exception 'finance period % belongs to a different company', new.period_id;
    end if;
  end if;

  return new;
end;
$$;

create trigger finance_payables_align_org
before insert or update of company_id, period_id, organisation_id
on public.finance_payables
for each row execute function public.finance_payables_align_org();

-- Source integrity: financial_request must exist; vendor_bill is opaque until Vendor Bill domain.
create or replace function public.finance_payables_validate_source()
returns trigger
language plpgsql
as $$
declare
  req_org uuid;
  req_company uuid;
begin
  if new.source_type = 'financial_request' then
    select organisation_id, company_id into req_org, req_company
    from public.finance_requests
    where id = new.source_id;

    if req_org is null then
      raise exception 'finance_payables: financial_request source % not found', new.source_id;
    end if;
    if req_org <> new.organisation_id then
      raise exception 'finance_payables: financial_request source belongs to a different organisation';
    end if;
    if req_company <> new.company_id then
      raise exception 'finance_payables: financial_request source belongs to a different company';
    end if;
  end if;

  return new;
end;
$$;

create trigger finance_payables_validate_source
before insert or update of source_type, source_id, company_id, organisation_id
on public.finance_payables
for each row execute function public.finance_payables_validate_source();

comment on table public.finance_payables is
  'Platform Finance obligations. Distinct from finance_requests (need), payments (settlement), and journals (posting). Outstanding = payable_amount - paid_amount (derive; do not store). No facility ownership.';

comment on column public.finance_payables.payable_amount is
  'Obligation amount. For Financial Request-originated payables (Slice 2), equals request approved_amount.';

comment on column public.finance_payables.paid_amount is
  'Amount settled via Banking/Payments later. Not Financial Request paid_amount.';

comment on column public.finance_payables.source_type is
  'financial_request | vendor_bill. Vendor Bill domain is not implemented in Slice 1; source_id is retained for future linkage.';

-- ---------------------------------------------------------------------------
-- Payable events (append-only workflow history; not finance_audit_events)
-- ---------------------------------------------------------------------------

create table public.finance_payable_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  payable_id uuid not null references public.finance_payables (id) on delete cascade,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_payable_events_type_check
    check (
      event_type in (
        'created',
        'updated',
        'submitted',
        'approved',
        'rejected',
        'scheduled',
        'payment_initiated',
        'paid',
        'cancelled',
        'disputed',
        'document_added',
        'document_removed',
        'document_superseded',
        'field_changed'
      )
    ),
  constraint finance_payable_events_from_status_check
    check (
      from_status is null
      or from_status in (
        'draft',
        'pending_approval',
        'approved',
        'scheduled',
        'payment_pending',
        'paid',
        'rejected',
        'cancelled',
        'disputed'
      )
    ),
  constraint finance_payable_events_to_status_check
    check (
      to_status is null
      or to_status in (
        'draft',
        'pending_approval',
        'approved',
        'scheduled',
        'payment_pending',
        'paid',
        'rejected',
        'cancelled',
        'disputed'
      )
    )
);

create index finance_payable_events_payable_created_idx
  on public.finance_payable_events (payable_id, created_at asc);
create index finance_payable_events_org_created_idx
  on public.finance_payable_events (organisation_id, created_at desc);

create or replace function public.finance_payable_events_align_org()
returns trigger
language plpgsql
as $$
declare
  payable_org uuid;
begin
  select organisation_id into payable_org
  from public.finance_payables
  where id = new.payable_id;

  if payable_org is null then
    raise exception 'finance payable % not found', new.payable_id;
  end if;

  new.organisation_id := payable_org;
  return new;
end;
$$;

create trigger finance_payable_events_align_org
before insert or update of payable_id, organisation_id
on public.finance_payable_events
for each row execute function public.finance_payable_events_align_org();

create or replace function public.finance_payable_events_reject_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'finance_payable_events is append-only (updates are not allowed)';
end;
$$;

create trigger finance_payable_events_no_update
before update on public.finance_payable_events
for each row execute function public.finance_payable_events_reject_update();

comment on table public.finance_payable_events is
  'Append-only Payables workflow history. Distinct from finance_request_events and finance_audit_events.';

-- ---------------------------------------------------------------------------
-- Payable documents (metadata boundary only — no Storage bucket / upload in Slice 1)
-- Reuses Finance private-storage principles; path/ownership is payable-scoped.
-- ---------------------------------------------------------------------------

create table public.finance_payable_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  payable_id uuid not null references public.finance_payables (id) on delete cascade,
  uploaded_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  filename text not null,
  mime_type text not null,
  byte_size bigint not null,
  storage_bucket text not null,
  storage_path text not null,
  checksum text,
  document_role text not null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  superseded_at timestamptz,
  superseded_by_document_id uuid references public.finance_payable_documents (id) on delete set null,
  constraint finance_payable_documents_filename_nonempty
    check (char_length(trim(filename)) > 0),
  constraint finance_payable_documents_mime_nonempty
    check (char_length(trim(mime_type)) > 0),
  constraint finance_payable_documents_byte_size_nonneg
    check (byte_size >= 0),
  constraint finance_payable_documents_bucket_nonempty
    check (char_length(trim(storage_bucket)) > 0),
  constraint finance_payable_documents_path_nonempty
    check (char_length(trim(storage_path)) > 0),
  constraint finance_payable_documents_role_check
    check (document_role in ('supporting', 'clarification', 'other')),
  constraint finance_payable_documents_supersession_pair
    check (
      (superseded_at is null and superseded_by_document_id is null)
      or (superseded_at is not null and superseded_by_document_id is not null)
    )
);

create unique index finance_payable_documents_bucket_path_uidx
  on public.finance_payable_documents (storage_bucket, storage_path);

create index finance_payable_documents_payable_idx
  on public.finance_payable_documents (payable_id, uploaded_at desc);
create index finance_payable_documents_org_idx
  on public.finance_payable_documents (organisation_id, uploaded_at desc);

create or replace function public.finance_payable_documents_align_org()
returns trigger
language plpgsql
as $$
declare
  payable_org uuid;
begin
  select organisation_id into payable_org
  from public.finance_payables
  where id = new.payable_id;

  if payable_org is null then
    raise exception 'finance payable % not found', new.payable_id;
  end if;

  new.organisation_id := payable_org;
  return new;
end;
$$;

create trigger finance_payable_documents_align_org
before insert or update of payable_id, organisation_id
on public.finance_payable_documents
for each row execute function public.finance_payable_documents_align_org();

comment on table public.finance_payable_documents is
  'Payables document metadata. Distinct from finance_request_documents. Storage upload/signed-URL workflow is Slice 4; no new bucket in Slice 1.';

-- ---------------------------------------------------------------------------
-- Helpers + create primitive (extension point for Slice 2 approval wiring)
-- ---------------------------------------------------------------------------

create or replace function public.finance_payable_actor_has_capability(
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

create or replace function public.finance_payable_actor_has_company_access(
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
    where a.profile_id = p_profile_id
      and a.company_id = p_company_id
  );
$$;

create or replace function public.finance_payable_append_event(
  p_organisation_id uuid,
  p_payable_id uuid,
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
  insert into public.finance_payable_events (
    organisation_id,
    payable_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    metadata
  )
  values (
    p_organisation_id,
    p_payable_id,
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

/**
 * Slice 1 creation primitive.
 * Creates a draft payable from a source reference.
 * Does NOT call or modify Financial Request approval RPCs.
 * Slice 2 will invoke a related path atomically from CEO approval.
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
declare
  v_company public.finance_companies%rowtype;
  v_payable_id uuid;
begin
  if p_actor_profile_id is null then
    raise exception 'finance_payable_create: actor is required';
  end if;
  if p_payee_name is null or char_length(trim(p_payee_name)) = 0 then
    raise exception 'finance_payable_create: payee_name is required';
  end if;
  if p_payee_type is null or p_payee_type not in ('vendor', 'staff', 'other') then
    raise exception 'finance_payable_create: invalid payee_type';
  end if;
  if p_payable_amount is null or p_payable_amount <= 0 then
    raise exception 'finance_payable_create: payable_amount must be > 0';
  end if;
  if p_source_type is null or p_source_type not in ('financial_request', 'vendor_bill') then
    raise exception 'finance_payable_create: invalid source_type';
  end if;
  if p_source_id is null then
    raise exception 'finance_payable_create: source_id is required';
  end if;
  if p_currency is null or char_length(trim(p_currency)) = 0 then
    raise exception 'finance_payable_create: currency is required';
  end if;

  select * into v_company
  from public.finance_companies
  where id = p_company_id;

  if not found then
    raise exception 'finance_payable_create: company not found';
  end if;

  if not public.finance_payable_actor_has_capability(
    v_company.organisation_id,
    p_actor_profile_id,
    'platform_finance.payable.create'
  ) then
    raise exception 'finance_payable_create: missing capability platform_finance.payable.create';
  end if;

  if not public.finance_payable_actor_has_company_access(
    p_actor_profile_id,
    p_company_id
  ) then
    raise exception 'finance_payable_create: no company access';
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
      v_company.organisation_id,
      p_company_id,
      p_actor_profile_id,
      'draft',
      trim(p_currency),
      p_payable_amount,
      0,
      trim(p_payee_name),
      p_payee_type,
      nullif(trim(coalesce(p_description, '')), ''),
      p_due_date,
      p_source_type,
      p_source_id,
      nullif(trim(coalesce(p_project_contract_ref, '')), ''),
      p_period_id
    )
    returning id into v_payable_id;
  exception
    when unique_violation then
      raise exception 'finance_payable_create: payable already exists for source';
  end;

  perform public.finance_payable_append_event(
    v_company.organisation_id,
    v_payable_id,
    p_actor_profile_id,
    'created',
    null,
    'draft',
    jsonb_build_object(
      'source_type', p_source_type,
      'source_id', p_source_id,
      'payable_amount', p_payable_amount
    )
  );

  return v_payable_id;
end;
$$;

revoke all on function public.finance_payable_actor_has_capability(uuid, uuid, text) from public;
revoke all on function public.finance_payable_actor_has_company_access(uuid, uuid) from public;
revoke all on function public.finance_payable_append_event(uuid, uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.finance_payable_create(uuid, uuid, text, text, numeric, text, uuid, text, text, date, text, uuid) from public;

grant execute on function public.finance_payable_actor_has_capability(uuid, uuid, text)
  to service_role, authenticated;
grant execute on function public.finance_payable_actor_has_company_access(uuid, uuid)
  to service_role, authenticated;
grant execute on function public.finance_payable_append_event(uuid, uuid, uuid, text, text, text, jsonb)
  to service_role, authenticated;
grant execute on function public.finance_payable_create(uuid, uuid, text, text, numeric, text, uuid, text, text, date, text, uuid)
  to service_role, authenticated;

comment on function public.finance_payable_create(uuid, uuid, text, text, numeric, text, uuid, text, text, date, text, uuid) is
  'Slice 1 creation primitive. Creates draft payable + created event. Does not modify Financial Request approval RPCs. Slice 2 wires CEO approval → payable atomically.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.finance_payables enable row level security;
alter table public.finance_payable_events enable row level security;
alter table public.finance_payable_documents enable row level security;

create policy finance_payables_select on public.finance_payables
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.payable.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.payable.create')
    or public.has_finance_capability(organisation_id, 'platform_finance.payable.review')
    or public.has_finance_capability(organisation_id, 'platform_finance.payable.approve')
    or public.has_finance_capability(organisation_id, 'platform_finance.view')
  )
);

-- Client inserts restricted to draft + create cap; lifecycle mutations via SECURITY DEFINER RPCs (Slice 2+).
create policy finance_payables_insert on public.finance_payables
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and created_by_profile_id = auth.uid()
  and status = 'draft'
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.payable.create')
);

create policy finance_payables_update on public.finance_payables
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and created_by_profile_id = auth.uid()
  and status = 'draft'
  and public.has_finance_capability(organisation_id, 'platform_finance.payable.create')
)
with check (
  public.is_org_member(organisation_id)
  and created_by_profile_id = auth.uid()
  and status = 'draft'
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.payable.create')
);

create policy finance_payables_delete on public.finance_payables
for delete to authenticated
using (
  public.is_org_member(organisation_id)
  and created_by_profile_id = auth.uid()
  and status = 'draft'
  and public.has_finance_capability(organisation_id, 'platform_finance.payable.create')
);

create policy finance_payable_events_select on public.finance_payable_events
for select to authenticated
using (
  exists (
    select 1
    from public.finance_payables p
    where p.id = payable_id
      and public.is_org_member(p.organisation_id)
      and public.has_finance_company_access(p.company_id)
      and (
        public.has_finance_capability(p.organisation_id, 'platform_finance.payable.view')
        or public.has_finance_capability(p.organisation_id, 'platform_finance.payable.create')
        or public.has_finance_capability(p.organisation_id, 'platform_finance.payable.review')
        or public.has_finance_capability(p.organisation_id, 'platform_finance.payable.approve')
        or public.has_finance_capability(p.organisation_id, 'platform_finance.view')
      )
  )
);

create policy finance_payable_documents_select on public.finance_payable_documents
for select to authenticated
using (
  exists (
    select 1
    from public.finance_payables p
    where p.id = payable_id
      and public.is_org_member(p.organisation_id)
      and public.has_finance_company_access(p.company_id)
      and (
        public.has_finance_capability(p.organisation_id, 'platform_finance.payable.view')
        or public.has_finance_capability(p.organisation_id, 'platform_finance.payable.create')
        or public.has_finance_capability(p.organisation_id, 'platform_finance.payable.review')
        or public.has_finance_capability(p.organisation_id, 'platform_finance.payable.approve')
        or public.has_finance_capability(p.organisation_id, 'platform_finance.view')
      )
  )
);

-- No authenticated insert/update/delete on documents in Slice 1 (upload is Slice 4 via service path).
-- No authenticated insert on events (append via SECURITY DEFINER helpers / future RPCs).
