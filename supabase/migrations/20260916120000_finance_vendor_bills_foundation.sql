-- Platform Finance — Vendor Bill / External Obligation foundation.
--
-- Domain boundary:
--   Vendor Bill  = an external obligation asserted by a third party (supplier invoice).
--   Financial Request = an internal business need for money (distinct table/domain).
--   Payable      = the authorised obligation created ONLY after CEO approval.
--   Payment      = settlement (Banking — not implemented).
--   Posting      = journal (not implemented).
--
-- Vendor Bill is UPSTREAM of Payable: a Vendor Bill never *is* a Payable, and a
-- Payable is never minted directly from a Vendor Bill without CEO approval.
--
-- Inputters (Finance or Staff) hold platform_finance.vendor_bill.create.
-- Finance reviews with platform_finance.vendor_bill.review (may query; the
-- inputter resolves the query). Finance is NOT a final approver.
-- ALL obligations require CEO approval via the existing
-- platform_finance.request.approve capability — this slice deliberately does
-- NOT invent a vendor_bill.approve capability.
--
-- Schema / RLS / integrity only in this migration. Lifecycle RPCs land in
-- 20260916121000; Storage bucket lands in 20260916122000.
-- No UI, no vendor master, no banking, no posting. Payee is denormalised.

-- ---------------------------------------------------------------------------
-- Vendor bills
-- ---------------------------------------------------------------------------

create table public.finance_vendor_bills (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  inputter_profile_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'draft',
  currency text not null default 'NGN',
  billed_amount numeric(18, 2) not null default 0,
  approved_amount numeric(18, 2) not null default 0,
  payee_name text not null,
  payee_type text not null,
  invoice_reference text,
  invoice_date date,
  description text,
  purpose text not null,
  goods_services_received boolean not null default false,
  due_date date,
  project_contract_ref text,
  finance_notes text,
  ceo_decision_notes text,
  queried_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_vendor_bills_status_check
    check (
      status in (
        'draft',
        'submitted',
        'under_review',
        'query',
        'resubmitted',
        'pending_ceo_approval',
        'approved',
        'partially_approved',
        'rejected'
      )
    ),
  constraint finance_vendor_bills_currency_nonempty
    check (char_length(trim(currency)) > 0),
  constraint finance_vendor_bills_purpose_nonempty
    check (char_length(trim(purpose)) > 0),
  constraint finance_vendor_bills_payee_name_nonempty
    check (char_length(trim(payee_name)) > 0),
  constraint finance_vendor_bills_payee_type_check
    check (payee_type in ('vendor', 'staff', 'other')),
  constraint finance_vendor_bills_billed_amount_nonneg
    check (billed_amount >= 0),
  constraint finance_vendor_bills_approved_amount_nonneg
    check (approved_amount >= 0),
  -- Billed amount is the supplier's assertion and is never overwritten by a decision.
  constraint finance_vendor_bills_approved_lte_billed
    check (approved_amount <= billed_amount),
  constraint finance_vendor_bills_amount_status_invariants
    check (
      (
        status = 'approved'
        and approved_amount = billed_amount
      )
      or (
        status = 'partially_approved'
        and approved_amount > 0
        and approved_amount < billed_amount
      )
      or (
        status = 'rejected'
        and approved_amount = 0
      )
      or (
        status not in ('approved', 'partially_approved', 'rejected')
        and approved_amount = 0
      )
    )
);

create index finance_vendor_bills_org_status_idx
  on public.finance_vendor_bills (organisation_id, status, created_at desc);
create index finance_vendor_bills_company_status_idx
  on public.finance_vendor_bills (company_id, status, created_at desc);
create index finance_vendor_bills_inputter_idx
  on public.finance_vendor_bills (inputter_profile_id, created_at desc);
create index finance_vendor_bills_invoice_reference_idx
  on public.finance_vendor_bills (company_id, invoice_reference)
  where invoice_reference is not null;

create trigger finance_vendor_bills_set_updated_at
before update on public.finance_vendor_bills
for each row execute function public.set_updated_at();

-- Organisation is always derived from the mandatory company (never client-supplied).
create or replace function public.finance_vendor_bills_align_org()
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
    raise exception 'finance company % not found', new.company_id;
  end if;

  new.organisation_id := company_org;
  return new;
end;
$$;

create trigger finance_vendor_bills_align_org
before insert or update of company_id, organisation_id
on public.finance_vendor_bills
for each row execute function public.finance_vendor_bills_align_org();

comment on table public.finance_vendor_bills is
  'External obligation asserted by a third party (vendor bill / supplier invoice). UPSTREAM of finance_payables: a Payable is created only by CEO approval of a Vendor Bill. Not a Financial Request, not a Payable, not a Payment, not a journal posting. Payee is denormalised — there is no vendor master.';

comment on column public.finance_vendor_bills.billed_amount is
  'Amount asserted by the third party. Immutable after decision; never overwritten by approved_amount.';

comment on column public.finance_vendor_bills.approved_amount is
  'CEO-authorised amount. 0 until decision; = billed_amount on approved; 0 < amount < billed_amount on partially_approved; 0 on rejected.';

comment on column public.finance_vendor_bills.goods_services_received is
  'Inputter confirmation that goods/services were received. Must be true before submission.';

comment on column public.finance_vendor_bills.inputter_profile_id is
  'Finance or Staff inputter. Never the final approver (separation of duties).';

-- ---------------------------------------------------------------------------
-- Vendor bill documents (metadata; bytes land in the Storage migration)
-- ---------------------------------------------------------------------------

create table public.finance_vendor_bill_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vendor_bill_id uuid not null references public.finance_vendor_bills (id) on delete cascade,
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
  superseded_by_document_id uuid references public.finance_vendor_bill_documents (id) on delete set null,
  constraint finance_vendor_bill_documents_filename_nonempty
    check (char_length(trim(filename)) > 0),
  constraint finance_vendor_bill_documents_mime_nonempty
    check (char_length(trim(mime_type)) > 0),
  constraint finance_vendor_bill_documents_byte_size_nonneg
    check (byte_size >= 0),
  constraint finance_vendor_bill_documents_bucket_nonempty
    check (char_length(trim(storage_bucket)) > 0),
  constraint finance_vendor_bill_documents_path_nonempty
    check (char_length(trim(storage_path)) > 0),
  constraint finance_vendor_bill_documents_role_check
    check (document_role in ('supporting', 'clarification', 'other')),
  constraint finance_vendor_bill_documents_supersession_pair
    check (
      (superseded_at is null and superseded_by_document_id is null)
      or (superseded_at is not null and superseded_by_document_id is not null)
    )
);

create unique index finance_vendor_bill_documents_bucket_path_uidx
  on public.finance_vendor_bill_documents (storage_bucket, storage_path);

create index finance_vendor_bill_documents_bill_idx
  on public.finance_vendor_bill_documents (vendor_bill_id, uploaded_at desc);
create index finance_vendor_bill_documents_org_idx
  on public.finance_vendor_bill_documents (organisation_id, uploaded_at desc);

create or replace function public.finance_vendor_bill_documents_align_org()
returns trigger
language plpgsql
as $$
declare
  bill_org uuid;
begin
  select organisation_id into bill_org
  from public.finance_vendor_bills
  where id = new.vendor_bill_id;

  if bill_org is null then
    raise exception 'finance vendor bill % not found', new.vendor_bill_id;
  end if;

  new.organisation_id := bill_org;
  return new;
end;
$$;

create trigger finance_vendor_bill_documents_align_org
before insert or update of vendor_bill_id, organisation_id
on public.finance_vendor_bill_documents
for each row execute function public.finance_vendor_bill_documents_align_org();

comment on table public.finance_vendor_bill_documents is
  'Vendor Bill document metadata. Bytes live in a private Storage bucket created by the documents-storage migration. Post-submission changes use supersession. Distinct from finance_request_documents and finance_payable_documents.';

-- ---------------------------------------------------------------------------
-- Vendor bill events (append-only workflow history; not finance_audit_events)
-- ---------------------------------------------------------------------------

create table public.finance_vendor_bill_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  vendor_bill_id uuid not null references public.finance_vendor_bills (id) on delete cascade,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_vendor_bill_events_type_check
    check (
      event_type in (
        'created',
        'updated',
        'submitted',
        'review_started',
        'queried',
        'resubmitted',
        'sent_to_ceo',
        'approved',
        'partially_approved',
        'rejected',
        'document_added',
        'document_removed',
        'document_superseded',
        'field_changed'
      )
    ),
  constraint finance_vendor_bill_events_from_status_check
    check (
      from_status is null
      or from_status in (
        'draft',
        'submitted',
        'under_review',
        'query',
        'resubmitted',
        'pending_ceo_approval',
        'approved',
        'partially_approved',
        'rejected'
      )
    ),
  constraint finance_vendor_bill_events_to_status_check
    check (
      to_status is null
      or to_status in (
        'draft',
        'submitted',
        'under_review',
        'query',
        'resubmitted',
        'pending_ceo_approval',
        'approved',
        'partially_approved',
        'rejected'
      )
    )
);

create index finance_vendor_bill_events_bill_created_idx
  on public.finance_vendor_bill_events (vendor_bill_id, created_at asc);
create index finance_vendor_bill_events_org_created_idx
  on public.finance_vendor_bill_events (organisation_id, created_at desc);

create or replace function public.finance_vendor_bill_events_align_org()
returns trigger
language plpgsql
as $$
declare
  bill_org uuid;
begin
  select organisation_id into bill_org
  from public.finance_vendor_bills
  where id = new.vendor_bill_id;

  if bill_org is null then
    raise exception 'finance vendor bill % not found', new.vendor_bill_id;
  end if;

  new.organisation_id := bill_org;
  return new;
end;
$$;

create trigger finance_vendor_bill_events_align_org
before insert or update of vendor_bill_id, organisation_id
on public.finance_vendor_bill_events
for each row execute function public.finance_vendor_bill_events_align_org();

-- Reject UPDATE only. DELETE remains allowed so a DRAFT hard-delete can cascade.
create or replace function public.finance_vendor_bill_events_reject_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'finance_vendor_bill_events is append-only (updates are not allowed)';
end;
$$;

create trigger finance_vendor_bill_events_no_update
before update on public.finance_vendor_bill_events
for each row execute function public.finance_vendor_bill_events_reject_update();

comment on table public.finance_vendor_bill_events is
  'Append-only Vendor Bill workflow history (no updates). DELETE allowed only to support draft hard-delete cascades. Distinct from finance_request_events, finance_payable_events, and finance_audit_events.';

-- ---------------------------------------------------------------------------
-- Helpers (mirror the request/payable helper pattern)
-- ---------------------------------------------------------------------------

create or replace function public.finance_vendor_bill_actor_has_capability(
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

create or replace function public.finance_vendor_bill_actor_has_company_access(
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

/** At least one document that has not been superseded (any role). */
create or replace function public.finance_vendor_bill_has_active_document(
  p_vendor_bill_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_vendor_bill_documents d
    where d.vendor_bill_id = p_vendor_bill_id
      and d.superseded_at is null
  );
$$;

create or replace function public.finance_vendor_bill_append_event(
  p_organisation_id uuid,
  p_vendor_bill_id uuid,
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
  insert into public.finance_vendor_bill_events (
    organisation_id,
    vendor_bill_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    metadata
  )
  values (
    p_organisation_id,
    p_vendor_bill_id,
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
 * Audit trail append for Vendor Bills.
 * finance_request_append_audit hard-codes object_type = 'finance_request',
 * so Vendor Bills get their own thin wrapper over the same append-only table.
 */
create or replace function public.finance_vendor_bill_append_audit(
  p_organisation_id uuid,
  p_company_id uuid,
  p_actor_profile_id uuid,
  p_action text,
  p_vendor_bill_id uuid,
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
    'finance_vendor_bill',
    p_vendor_bill_id::text,
    p_reason,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.finance_vendor_bill_actor_has_capability(uuid, uuid, text) from public;
revoke all on function public.finance_vendor_bill_actor_has_company_access(uuid, uuid) from public;
revoke all on function public.finance_vendor_bill_has_active_document(uuid) from public;
revoke all on function public.finance_vendor_bill_append_event(uuid, uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.finance_vendor_bill_append_audit(uuid, uuid, uuid, text, uuid, text, jsonb) from public;

grant execute on function public.finance_vendor_bill_actor_has_capability(uuid, uuid, text)
  to service_role, authenticated;
grant execute on function public.finance_vendor_bill_actor_has_company_access(uuid, uuid)
  to service_role, authenticated;
grant execute on function public.finance_vendor_bill_has_active_document(uuid)
  to service_role, authenticated;
grant execute on function public.finance_vendor_bill_append_event(uuid, uuid, uuid, text, text, text, jsonb)
  to service_role, authenticated;
grant execute on function public.finance_vendor_bill_append_audit(uuid, uuid, uuid, text, uuid, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Payable source integrity: vendor_bill sources are no longer opaque
-- ---------------------------------------------------------------------------

/**
 * finance_payables.source_id must now resolve to a real row for BOTH source
 * types, with matching organisation and company. Replaces the Payables Slice 1
 * version, which treated vendor_bill source ids as opaque placeholders.
 */
create or replace function public.finance_payables_validate_source()
returns trigger
language plpgsql
as $$
declare
  src_org uuid;
  src_company uuid;
begin
  if new.source_type = 'financial_request' then
    select organisation_id, company_id into src_org, src_company
    from public.finance_requests
    where id = new.source_id;

    if src_org is null then
      raise exception 'finance_payables: financial_request source % not found', new.source_id;
    end if;
    if src_org <> new.organisation_id then
      raise exception 'finance_payables: financial_request source belongs to a different organisation';
    end if;
    if src_company <> new.company_id then
      raise exception 'finance_payables: financial_request source belongs to a different company';
    end if;
  elsif new.source_type = 'vendor_bill' then
    select organisation_id, company_id into src_org, src_company
    from public.finance_vendor_bills
    where id = new.source_id;

    if src_org is null then
      raise exception 'finance_payables: vendor_bill source % not found', new.source_id;
    end if;
    if src_org <> new.organisation_id then
      raise exception 'finance_payables: vendor_bill source belongs to a different organisation';
    end if;
    if src_company <> new.company_id then
      raise exception 'finance_payables: vendor_bill source belongs to a different company';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.finance_payables_validate_source() is
  'Payable source integrity. Vendor Bill is upstream of Payable: vendor_bill source ids must resolve to a finance_vendor_bills row in the same organisation and company.';

comment on column public.finance_payables.source_type is
  'financial_request | vendor_bill. Both resolve to a real upstream row. Vendor Bill payables are created only by CEO approval of the Vendor Bill.';

-- ---------------------------------------------------------------------------
-- RLS (mirrors finance_requests: own rows via create/view, others via
-- company access + review/approve/view)
-- ---------------------------------------------------------------------------

alter table public.finance_vendor_bills enable row level security;
alter table public.finance_vendor_bill_documents enable row level security;
alter table public.finance_vendor_bill_events enable row level security;

create policy finance_vendor_bills_select on public.finance_vendor_bills
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    (
      inputter_profile_id = auth.uid()
      and (
        public.has_finance_capability(organisation_id, 'platform_finance.vendor_bill.create')
        or public.has_finance_capability(organisation_id, 'platform_finance.vendor_bill.view')
      )
    )
    or (
      public.has_finance_company_access(company_id)
      and (
        public.has_finance_capability(organisation_id, 'platform_finance.vendor_bill.review')
        or public.has_finance_capability(organisation_id, 'platform_finance.vendor_bill.view')
        or public.has_finance_capability(organisation_id, 'platform_finance.request.approve')
        or public.has_finance_capability(organisation_id, 'platform_finance.view')
      )
    )
  )
);

create policy finance_vendor_bills_insert on public.finance_vendor_bills
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and inputter_profile_id = auth.uid()
  and status = 'draft'
  and approved_amount = 0
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.vendor_bill.create')
);

-- Inputter may edit content only while draft / query / resubmitted.
-- Finance/CEO transitions are never performed through this policy.
create policy finance_vendor_bills_update on public.finance_vendor_bills
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and inputter_profile_id = auth.uid()
  and status in ('draft', 'query', 'resubmitted')
  and public.has_finance_capability(organisation_id, 'platform_finance.vendor_bill.create')
)
with check (
  public.is_org_member(organisation_id)
  and inputter_profile_id = auth.uid()
  and status in ('draft', 'query', 'resubmitted')
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.vendor_bill.create')
);

-- Hard delete only for drafts (no CANCELLED status in this domain).
create policy finance_vendor_bills_delete on public.finance_vendor_bills
for delete to authenticated
using (
  public.is_org_member(organisation_id)
  and inputter_profile_id = auth.uid()
  and status = 'draft'
  and public.has_finance_capability(organisation_id, 'platform_finance.vendor_bill.create')
);

create policy finance_vendor_bill_documents_select on public.finance_vendor_bill_documents
for select to authenticated
using (
  exists (
    select 1
    from public.finance_vendor_bills b
    where b.id = vendor_bill_id
      and public.is_org_member(b.organisation_id)
      and (
        (
          b.inputter_profile_id = auth.uid()
          and (
            public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.create')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.view')
          )
        )
        or (
          public.has_finance_company_access(b.company_id)
          and (
            public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.review')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.view')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.request.approve')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.view')
          )
        )
      )
  )
);

create policy finance_vendor_bill_documents_insert on public.finance_vendor_bill_documents
for insert to authenticated
with check (
  uploaded_by_profile_id = auth.uid()
  and exists (
    select 1
    from public.finance_vendor_bills b
    where b.id = vendor_bill_id
      and public.is_org_member(b.organisation_id)
      and b.inputter_profile_id = auth.uid()
      and b.status in ('draft', 'query', 'resubmitted')
      and public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.create')
  )
);

create policy finance_vendor_bill_events_select on public.finance_vendor_bill_events
for select to authenticated
using (
  exists (
    select 1
    from public.finance_vendor_bills b
    where b.id = vendor_bill_id
      and public.is_org_member(b.organisation_id)
      and (
        (
          b.inputter_profile_id = auth.uid()
          and (
            public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.create')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.view')
          )
        )
        or (
          public.has_finance_company_access(b.company_id)
          and (
            public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.review')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.view')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.request.approve')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.view')
          )
        )
      )
  )
);

create policy finance_vendor_bill_events_insert on public.finance_vendor_bill_events
for insert to authenticated
with check (
  actor_profile_id = auth.uid()
  and exists (
    select 1
    from public.finance_vendor_bills b
    where b.id = vendor_bill_id
      and public.is_org_member(b.organisation_id)
      and (
        (
          b.inputter_profile_id = auth.uid()
          and public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.create')
        )
        or (
          public.has_finance_company_access(b.company_id)
          and (
            public.has_finance_capability(b.organisation_id, 'platform_finance.vendor_bill.review')
            or public.has_finance_capability(b.organisation_id, 'platform_finance.request.approve')
          )
        )
      )
  )
);

grant select, insert, update, delete on table public.finance_vendor_bills to authenticated;
grant select, insert on table public.finance_vendor_bill_documents to authenticated;
grant select, insert on table public.finance_vendor_bill_events to authenticated;

grant all on table public.finance_vendor_bills to service_role;
grant all on table public.finance_vendor_bill_documents to service_role;
grant all on table public.finance_vendor_bill_events to service_role;
