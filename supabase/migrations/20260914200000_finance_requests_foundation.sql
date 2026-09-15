-- Platform Finance — Financial Requests Slice 1 (domain foundation).
-- Schema / RLS / integrity only. No transition RPCs, Storage, UI, or payments.

-- ---------------------------------------------------------------------------
-- Capability format: allow nested platform_finance.request.* segments
-- (Foundation used single segment: platform_finance.view)
-- ---------------------------------------------------------------------------

alter table public.finance_capability_grants
  drop constraint finance_capability_grants_capability_format;

alter table public.finance_capability_grants
  add constraint finance_capability_grants_capability_format
  check (capability ~ '^platform_finance(\.[a-z0-9_]+)+$');

-- ---------------------------------------------------------------------------
-- Request categories (org-scoped master data; not COA)
-- ---------------------------------------------------------------------------

create table public.finance_request_categories (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  slug text not null,
  name text not null,
  status text not null default 'active',
  sort_order int not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_request_categories_slug_nonempty
    check (char_length(trim(slug)) > 0),
  constraint finance_request_categories_name_nonempty
    check (char_length(trim(name)) > 0),
  constraint finance_request_categories_slug_format
    check (slug ~ '^[a-z0-9_]+$'),
  constraint finance_request_categories_status_check
    check (status in ('active', 'inactive')),
  constraint finance_request_categories_org_slug_unique
    unique (organisation_id, slug)
);

create index finance_request_categories_org_status_sort_idx
  on public.finance_request_categories (organisation_id, status, sort_order, name);

create trigger finance_request_categories_set_updated_at
before update on public.finance_request_categories
for each row execute function public.set_updated_at();

comment on table public.finance_request_categories is
  'Business-facing Financial Request categories. Not COA accounts; no accounting mapping in v1.';

insert into public.finance_request_categories (
  organisation_id, slug, name, status, sort_order
)
select
  o.id,
  v.slug,
  v.name,
  'active',
  v.sort_order
from public.organisations o
cross join (
  values
    ('diesel_fuel', 'Diesel / Fuel', 10),
    ('travel', 'Travel', 20),
    ('accommodation', 'Accommodation', 30),
    ('procurement', 'Procurement', 40),
    ('petty_cash', 'Petty Cash', 50),
    ('vendor_payment', 'Vendor Payment', 60),
    ('project_expenditure', 'Project Expenditure', 70),
    ('training', 'Training', 80),
    ('event', 'Event', 90),
    ('other_operational_expense', 'Other Operational Expense', 100)
) as v(slug, name, sort_order)
where o.slug = 'paychex'
on conflict (organisation_id, slug) do update
set
  name = excluded.name,
  status = excluded.status,
  sort_order = excluded.sort_order,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Financial requests
-- ---------------------------------------------------------------------------

create table public.finance_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  requester_profile_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'draft',
  currency text not null default 'NGN',
  requested_amount numeric(18, 2) not null default 0,
  approved_amount numeric(18, 2) not null default 0,
  paid_amount numeric(18, 2) not null default 0,
  category_id uuid not null references public.finance_request_categories (id) on delete restrict,
  purpose text not null,
  description text,
  payee_name text not null,
  payee_type text not null,
  required_by_date date,
  external_reference text,
  project_contract_ref text,
  finance_notes text,
  ceo_decision_notes text,
  queried_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_requests_status_check
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
  constraint finance_requests_currency_nonempty
    check (char_length(trim(currency)) > 0),
  constraint finance_requests_purpose_nonempty
    check (char_length(trim(purpose)) > 0),
  constraint finance_requests_payee_name_nonempty
    check (char_length(trim(payee_name)) > 0),
  constraint finance_requests_payee_type_check
    check (payee_type in ('vendor', 'staff', 'other')),
  constraint finance_requests_requested_amount_nonneg
    check (requested_amount >= 0),
  constraint finance_requests_approved_amount_nonneg
    check (approved_amount >= 0),
  constraint finance_requests_paid_amount_nonneg
    check (paid_amount >= 0),
  constraint finance_requests_approved_lte_requested
    check (approved_amount <= requested_amount),
  -- Financial Request v1 does not execute payments.
  constraint finance_requests_paid_amount_v1_zero
    check (paid_amount = 0),
  constraint finance_requests_amount_status_invariants
    check (
      (
        status = 'approved'
        and approved_amount = requested_amount
      )
      or (
        status = 'partially_approved'
        and approved_amount > 0
        and approved_amount < requested_amount
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

create index finance_requests_org_status_idx
  on public.finance_requests (organisation_id, status, created_at desc);
create index finance_requests_company_status_idx
  on public.finance_requests (company_id, status, created_at desc);
create index finance_requests_requester_idx
  on public.finance_requests (requester_profile_id, created_at desc);
create index finance_requests_category_idx
  on public.finance_requests (category_id);

create trigger finance_requests_set_updated_at
before update on public.finance_requests
for each row execute function public.set_updated_at();

create or replace function public.finance_requests_align_org()
returns trigger
language plpgsql
as $$
declare
  company_org uuid;
  category_org uuid;
begin
  select organisation_id into company_org
  from public.finance_companies
  where id = new.company_id;

  if company_org is null then
    raise exception 'finance company % not found', new.company_id;
  end if;

  new.organisation_id := company_org;

  select organisation_id into category_org
  from public.finance_request_categories
  where id = new.category_id;

  if category_org is null then
    raise exception 'finance request category % not found', new.category_id;
  end if;

  if category_org <> new.organisation_id then
    raise exception
      'finance request category % belongs to a different organisation',
      new.category_id;
  end if;

  return new;
end;
$$;

create trigger finance_requests_align_org
before insert or update of company_id, category_id, organisation_id
on public.finance_requests
for each row execute function public.finance_requests_align_org();

comment on table public.finance_requests is
  'Business need for money. Ends at CEO decision. Not a journal, payable, payment, or FM/ECC request.';

comment on column public.finance_requests.paid_amount is
  'Must remain 0 in Financial Request v1. Outstanding = approved_amount - paid_amount (derive; do not store).';

-- ---------------------------------------------------------------------------
-- Request documents (metadata only — no Storage bucket in this slice)
-- ---------------------------------------------------------------------------

create table public.finance_request_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  request_id uuid not null references public.finance_requests (id) on delete cascade,
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
  superseded_by_document_id uuid references public.finance_request_documents (id) on delete set null,
  constraint finance_request_documents_filename_nonempty
    check (char_length(trim(filename)) > 0),
  constraint finance_request_documents_mime_nonempty
    check (char_length(trim(mime_type)) > 0),
  constraint finance_request_documents_byte_size_nonneg
    check (byte_size >= 0),
  constraint finance_request_documents_bucket_nonempty
    check (char_length(trim(storage_bucket)) > 0),
  constraint finance_request_documents_path_nonempty
    check (char_length(trim(storage_path)) > 0),
  constraint finance_request_documents_role_check
    check (document_role in ('supporting', 'clarification', 'other')),
  constraint finance_request_documents_supersession_pair
    check (
      (superseded_at is null and superseded_by_document_id is null)
      or (superseded_at is not null and superseded_by_document_id is not null)
    )
);

create index finance_request_documents_request_idx
  on public.finance_request_documents (request_id, uploaded_at desc);
create index finance_request_documents_org_idx
  on public.finance_request_documents (organisation_id, uploaded_at desc);

create or replace function public.finance_request_documents_align_org()
returns trigger
language plpgsql
as $$
declare
  req_org uuid;
begin
  select organisation_id into req_org
  from public.finance_requests
  where id = new.request_id;

  if req_org is null then
    raise exception 'finance request % not found', new.request_id;
  end if;

  new.organisation_id := req_org;
  return new;
end;
$$;

create trigger finance_request_documents_align_org
before insert or update of request_id, organisation_id
on public.finance_request_documents
for each row execute function public.finance_request_documents_align_org();

comment on table public.finance_request_documents is
  'Document metadata for Financial Requests. Storage bucket/upload not created in Slice 1. Post-submit changes use supersession.';

-- ---------------------------------------------------------------------------
-- Request events (append-only workflow history; not finance_audit_events)
-- ---------------------------------------------------------------------------

create table public.finance_request_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  request_id uuid not null references public.finance_requests (id) on delete cascade,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_request_events_type_check
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
        'field_changed'
      )
    ),
  constraint finance_request_events_from_status_check
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
  constraint finance_request_events_to_status_check
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

create index finance_request_events_request_created_idx
  on public.finance_request_events (request_id, created_at asc);
create index finance_request_events_org_created_idx
  on public.finance_request_events (organisation_id, created_at desc);

create or replace function public.finance_request_events_align_org()
returns trigger
language plpgsql
as $$
declare
  req_org uuid;
begin
  select organisation_id into req_org
  from public.finance_requests
  where id = new.request_id;

  if req_org is null then
    raise exception 'finance request % not found', new.request_id;
  end if;

  new.organisation_id := req_org;
  return new;
end;
$$;

create trigger finance_request_events_align_org
before insert or update of request_id, organisation_id
on public.finance_request_events
for each row execute function public.finance_request_events_align_org();

-- Reject UPDATE only. DELETE remains allowed so DRAFT hard-delete can cascade
-- child history rows. Service layer must not delete events on submitted requests.
create or replace function public.finance_request_events_reject_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'finance_request_events is append-only (updates are not allowed)';
end;
$$;

create trigger finance_request_events_no_update
before update on public.finance_request_events
for each row execute function public.finance_request_events_reject_update();

comment on table public.finance_request_events is
  'Append-only Financial Request workflow history (no updates). DELETE allowed only to support draft hard-delete cascades. Distinct from finance_audit_events.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.finance_request_categories enable row level security;
alter table public.finance_requests enable row level security;
alter table public.finance_request_documents enable row level security;
alter table public.finance_request_events enable row level security;

-- Categories: org master data (select with any request capability or setup; mutate via manage_setup)
create policy finance_request_categories_select on public.finance_request_categories
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.request.create')
    or public.has_finance_capability(organisation_id, 'platform_finance.request.view_own')
    or public.has_finance_capability(organisation_id, 'platform_finance.request.review')
    or public.has_finance_capability(organisation_id, 'platform_finance.request.approve')
    or public.has_finance_capability(organisation_id, 'platform_finance.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
  )
);

create policy finance_request_categories_insert on public.finance_request_categories
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
);

create policy finance_request_categories_update on public.finance_request_categories
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
)
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.manage_setup')
);

-- Requests: own (create/view_own) OR company access + review/approve.
-- Mutations for status transitions are intentionally restrictive; service_role owns Slice 2+.
create policy finance_requests_select on public.finance_requests
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    (
      requester_profile_id = auth.uid()
      and (
        public.has_finance_capability(organisation_id, 'platform_finance.request.create')
        or public.has_finance_capability(organisation_id, 'platform_finance.request.view_own')
      )
    )
    or (
      public.has_finance_company_access(company_id)
      and (
        public.has_finance_capability(organisation_id, 'platform_finance.request.review')
        or public.has_finance_capability(organisation_id, 'platform_finance.request.approve')
      )
    )
  )
);

create policy finance_requests_insert on public.finance_requests
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and requester_profile_id = auth.uid()
  and status = 'draft'
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.request.create')
);

-- Requester may edit content only while draft / query / resubmitted (no CEO/Finance transitions via client).
create policy finance_requests_update on public.finance_requests
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and requester_profile_id = auth.uid()
  and status in ('draft', 'query', 'resubmitted')
  and public.has_finance_capability(organisation_id, 'platform_finance.request.create')
)
with check (
  public.is_org_member(organisation_id)
  and requester_profile_id = auth.uid()
  and status in ('draft', 'query', 'resubmitted')
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.request.create')
);

-- Hard delete only for drafts (service layer must also enforce; no CANCELLED status).
create policy finance_requests_delete on public.finance_requests
for delete to authenticated
using (
  public.is_org_member(organisation_id)
  and requester_profile_id = auth.uid()
  and status = 'draft'
  and public.has_finance_capability(organisation_id, 'platform_finance.request.create')
);

-- Documents inherit request visibility; insert restricted; no authenticated delete (supersession later).
create policy finance_request_documents_select on public.finance_request_documents
for select to authenticated
using (
  exists (
    select 1
    from public.finance_requests r
    where r.id = request_id
      and public.is_org_member(r.organisation_id)
      and (
        (
          r.requester_profile_id = auth.uid()
          and (
            public.has_finance_capability(r.organisation_id, 'platform_finance.request.create')
            or public.has_finance_capability(r.organisation_id, 'platform_finance.request.view_own')
          )
        )
        or (
          public.has_finance_company_access(r.company_id)
          and (
            public.has_finance_capability(r.organisation_id, 'platform_finance.request.review')
            or public.has_finance_capability(r.organisation_id, 'platform_finance.request.approve')
          )
        )
      )
  )
);

create policy finance_request_documents_insert on public.finance_request_documents
for insert to authenticated
with check (
  uploaded_by_profile_id = auth.uid()
  and exists (
    select 1
    from public.finance_requests r
    where r.id = request_id
      and public.is_org_member(r.organisation_id)
      and r.requester_profile_id = auth.uid()
      and r.status in ('draft', 'query', 'resubmitted')
      and public.has_finance_capability(r.organisation_id, 'platform_finance.request.create')
  )
);

-- Events: select with request visibility; insert append-only for actors with request access; no update/delete policies.
create policy finance_request_events_select on public.finance_request_events
for select to authenticated
using (
  exists (
    select 1
    from public.finance_requests r
    where r.id = request_id
      and public.is_org_member(r.organisation_id)
      and (
        (
          r.requester_profile_id = auth.uid()
          and (
            public.has_finance_capability(r.organisation_id, 'platform_finance.request.create')
            or public.has_finance_capability(r.organisation_id, 'platform_finance.request.view_own')
          )
        )
        or (
          public.has_finance_company_access(r.company_id)
          and (
            public.has_finance_capability(r.organisation_id, 'platform_finance.request.review')
            or public.has_finance_capability(r.organisation_id, 'platform_finance.request.approve')
          )
        )
      )
  )
);

create policy finance_request_events_insert on public.finance_request_events
for insert to authenticated
with check (
  actor_profile_id = auth.uid()
  and exists (
    select 1
    from public.finance_requests r
    where r.id = request_id
      and public.is_org_member(r.organisation_id)
      and (
        (
          r.requester_profile_id = auth.uid()
          and public.has_finance_capability(r.organisation_id, 'platform_finance.request.create')
        )
        or (
          public.has_finance_company_access(r.company_id)
          and (
            public.has_finance_capability(r.organisation_id, 'platform_finance.request.review')
            or public.has_finance_capability(r.organisation_id, 'platform_finance.request.approve')
          )
        )
      )
  )
);

grant select, insert, update on table public.finance_request_categories to authenticated;
grant select, insert, update, delete on table public.finance_requests to authenticated;
grant select, insert on table public.finance_request_documents to authenticated;
grant select, insert on table public.finance_request_events to authenticated;

grant all on table public.finance_request_categories to service_role;
grant all on table public.finance_requests to service_role;
grant all on table public.finance_request_documents to service_role;
grant all on table public.finance_request_events to service_role;
