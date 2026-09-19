-- FM Phase 2G — FM operational Costs foundation (empty operational register).
-- The FM cost chain that the product ACTUALLY implements is four separate
-- concepts (do not collapse them):
--   Cost Record ................ what did this cost us            (fm_cost_records)
--   Cost Submission (claim) .... what are we claiming             (fm_cost_submissions
--                                + fm_cost_submission_items)
--   Reimbursement Authorization  what was authorized (per claim)  (fm_reimbursement_authorizations)
--   Reimbursement Payment ...... what was received                (fm_reimbursement_payments)
-- This is NOT Platform Finance: no ledger, journal, payable, posting or treasury
-- object is created or referenced. Compatibility APIs stay /api/cost-records,
-- /api/cost-submissions, /api/reimbursement-authorizations, /api/reimbursement-payments.
-- Server-mediated only (service role). Does NOT migrate Sheet rows (all legacy
-- rows are verification-era test data). Does NOT seed rows.
--
-- Relationships are UUID FKs — never display-code matching. No child-ID arrays:
-- the old `Cost Record IDs` list is the fm_cost_submission_items join table.
-- Transitional/legacy: none stored here (Assets/Vendors are not referenced).

-- Facility consistency for cost -> Work Instruction (the tuple must match).
alter table public.fm_work_instructions
  add constraint fm_work_instructions_org_id_facility_unique
  unique (organisation_id, id, facility_id);

-- ---------------------------------------------------------------------------
-- fm_cost_records
-- ---------------------------------------------------------------------------

create table public.fm_cost_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  recorded_at timestamptz not null default timezone('utc', now()),
  facility_id uuid not null,
  department_id uuid,
  location text not null,
  work_id uuid,
  work_instruction_id uuid,
  description text not null,
  category text not null,
  budgeted_amount numeric(16, 2),
  actual_amount numeric(16, 2) not null,
  currency text not null default 'NGN',
  reimbursability text not null default 'unknown',
  evidence_reference text not null,
  evidence_file_id text,
  evidence_file_name text,
  evidence_file_mime text,
  evidence_file_size bigint,
  evidence_file_url text,
  notes text,
  recorded_by_profile_id uuid,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_cost_records_org_id_unique unique (organisation_id, id),
  constraint fm_cost_records_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_cost_records_location_nonempty check (char_length(trim(location)) > 0),
  constraint fm_cost_records_description_nonempty check (char_length(trim(description)) > 0),
  constraint fm_cost_records_evidence_nonempty check (char_length(trim(evidence_reference)) > 0),
  constraint fm_cost_records_currency_nonempty check (char_length(trim(currency)) > 0),
  constraint fm_cost_records_category_check
    check (category in ('diesel_fuel', 'materials', 'spare_parts', 'labour', 'transportation',
                        'equipment', 'consumables', 'service', 'other')),
  constraint fm_cost_records_reimbursability_check
    check (reimbursability in ('unknown', 'reimbursable', 'non_reimbursable')),
  -- actual_amount is the sole authoritative incurred value; budgeted is a plan.
  constraint fm_cost_records_amounts_check
    check (actual_amount >= 0 and (budgeted_amount is null or budgeted_amount >= 0)),
  constraint fm_cost_records_evidence_size_check
    check (evidence_file_size is null or evidence_file_size >= 0),
  constraint fm_cost_records_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  constraint fm_cost_records_department_fk
    foreign key (organisation_id, department_id)
    references public.fm_departments (organisation_id, id) on delete set null (department_id),
  -- Optional operational context; when present the cost facility must equal the
  -- Work / Work Instruction facility (a null work_id / work_instruction_id skips it).
  constraint fm_cost_records_work_fk
    foreign key (organisation_id, work_id, facility_id)
    references public.fm_work (organisation_id, id, facility_id)
    on delete restrict on update cascade,
  constraint fm_cost_records_work_instruction_fk
    foreign key (organisation_id, work_instruction_id, facility_id)
    references public.fm_work_instructions (organisation_id, id, facility_id)
    on delete restrict on update cascade,
  constraint fm_cost_records_recorded_by_fk
    foreign key (organisation_id, recorded_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (recorded_by_profile_id),
  constraint fm_cost_records_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_cost_records_updated_by_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);

create unique index fm_cost_records_org_code_uidx on public.fm_cost_records (organisation_id, lower(code));
create index fm_cost_records_org_facility_idx on public.fm_cost_records (organisation_id, facility_id);
create index fm_cost_records_org_category_idx on public.fm_cost_records (organisation_id, category);
create index fm_cost_records_org_recorded_at_idx on public.fm_cost_records (organisation_id, recorded_at desc);
create index fm_cost_records_org_work_idx on public.fm_cost_records (organisation_id, work_id) where work_id is not null;
create index fm_cost_records_org_instruction_idx
  on public.fm_cost_records (organisation_id, work_instruction_id) where work_instruction_id is not null;

create trigger fm_cost_records_set_updated_at
before update on public.fm_cost_records
for each row execute function public.set_updated_at();

comment on table public.fm_cost_records is
  'FM operational Cost Record: what a cost incurred (NOT Platform Finance). actual_amount is authoritative; budgeted_amount is a plan. code COST-YYYY-######. Optional Work / Work Instruction context by UUID FK.';
comment on column public.fm_cost_records.evidence_file_id is
  'Metadata of a previously stored receipt (Drive id). Kept for semantics; new file upload is unavailable until evidence storage is migrated.';

-- ---------------------------------------------------------------------------
-- fm_cost_submissions (claim) + items (replaces the Cost Record IDs list)
-- ---------------------------------------------------------------------------

create table public.fm_cost_submissions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  status text not null default 'draft',
  currency text not null default 'NGN',
  claim_amount numeric(16, 2),
  markup_amount numeric(16, 2),
  markup_rate_percent numeric(9, 4),
  no_markup boolean,
  facility_id uuid,
  department_id uuid,
  period_label text,
  submission_kind text,
  package_reference text,
  package_type text,
  package_date timestamptz,
  package_notes text,
  approval_id uuid,
  submitted_at timestamptz,
  submitted_by_profile_id uuid,
  queried_at timestamptz,
  query_notes text,
  notes text,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_cost_submissions_org_id_unique unique (organisation_id, id),
  constraint fm_cost_submissions_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_cost_submissions_currency_nonempty check (char_length(trim(currency)) > 0),
  -- Submission lifecycle is its OWN state; approval / payment are separate domains.
  constraint fm_cost_submissions_status_check
    check (status in ('draft', 'submitted', 'queried', 'cancelled')),
  constraint fm_cost_submissions_amounts_check
    check ((claim_amount is null or claim_amount >= 0)
       and (markup_amount is null or markup_amount >= 0)
       and (markup_rate_percent is null or markup_rate_percent >= 0)),
  constraint fm_cost_submissions_submitted_complete
    check (status not in ('submitted', 'queried') or (submitted_at is not null and submitted_by_profile_id is not null)),
  constraint fm_cost_submissions_queried_complete
    check (status <> 'queried' or queried_at is not null),
  constraint fm_cost_submissions_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  constraint fm_cost_submissions_department_fk
    foreign key (organisation_id, department_id)
    references public.fm_departments (organisation_id, id) on delete set null (department_id),
  -- Optional relationship to the FM Approval (UUID FK; no duplicated approval state).
  constraint fm_cost_submissions_approval_fk
    foreign key (organisation_id, approval_id)
    references public.fm_approvals (organisation_id, id) on delete set null (approval_id),
  constraint fm_cost_submissions_submitted_by_fk
    foreign key (organisation_id, submitted_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (submitted_by_profile_id),
  constraint fm_cost_submissions_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_cost_submissions_updated_by_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);

create unique index fm_cost_submissions_org_code_uidx on public.fm_cost_submissions (organisation_id, lower(code));
create index fm_cost_submissions_org_status_idx on public.fm_cost_submissions (organisation_id, status);
create index fm_cost_submissions_org_created_at_idx on public.fm_cost_submissions (organisation_id, created_at desc);
create index fm_cost_submissions_org_approval_idx
  on public.fm_cost_submissions (organisation_id, approval_id) where approval_id is not null;

create trigger fm_cost_submissions_set_updated_at
before update on public.fm_cost_submissions
for each row execute function public.set_updated_at();

comment on table public.fm_cost_submissions is
  'FM reimbursement claim package referencing Cost Records via fm_cost_submission_items. Lifecycle draft|submitted|queried|cancelled only. code SUB-YYYY-######. Not Platform Finance.';

create table public.fm_cost_submission_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  submission_id uuid not null,
  cost_record_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_cost_submission_items_submission_fk
    foreign key (organisation_id, submission_id)
    references public.fm_cost_submissions (organisation_id, id) on delete cascade,
  -- A Cost Record in a claim cannot be deleted; a Cost Record may sit in several claims.
  constraint fm_cost_submission_items_cost_fk
    foreign key (organisation_id, cost_record_id)
    references public.fm_cost_records (organisation_id, id) on delete restrict
);

create unique index fm_cost_submission_items_uidx
  on public.fm_cost_submission_items (organisation_id, submission_id, cost_record_id);
create index fm_cost_submission_items_cost_idx
  on public.fm_cost_submission_items (organisation_id, cost_record_id);

-- ---------------------------------------------------------------------------
-- fm_reimbursement_authorizations — one per claim; only a SUBMITTED claim
-- ---------------------------------------------------------------------------

create table public.fm_reimbursement_authorizations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  submission_id uuid not null,
  authorized_amount numeric(16, 2) not null,
  currency text not null default 'NGN',
  authorized_at timestamptz not null default timezone('utc', now()),
  authorized_by_profile_id uuid,
  authority_reference text,
  notes text,
  recorded_at timestamptz not null default timezone('utc', now()),
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_reimbursement_authorizations_org_id_unique unique (organisation_id, id),
  constraint fm_reimbursement_authorizations_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_reimbursement_authorizations_amount_check check (authorized_amount > 0),
  constraint fm_reimbursement_authorizations_currency_nonempty check (char_length(trim(currency)) > 0),
  constraint fm_reimbursement_authorizations_reference_nonblank
    check (authority_reference is null or char_length(trim(authority_reference)) > 0),
  constraint fm_reimbursement_authorizations_submission_fk
    foreign key (organisation_id, submission_id)
    references public.fm_cost_submissions (organisation_id, id) on delete restrict,
  constraint fm_reimbursement_authorizations_authorized_by_fk
    foreign key (organisation_id, authorized_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (authorized_by_profile_id),
  constraint fm_reimbursement_authorizations_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_reimbursement_authorizations_updated_by_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);

create unique index fm_reimbursement_authorizations_org_code_uidx
  on public.fm_reimbursement_authorizations (organisation_id, lower(code));
-- One authorization per claim (existing product behaviour: revise updates it).
create unique index fm_reimbursement_authorizations_org_submission_uidx
  on public.fm_reimbursement_authorizations (organisation_id, submission_id);

create trigger fm_reimbursement_authorizations_set_updated_at
before update on public.fm_reimbursement_authorizations
for each row execute function public.set_updated_at();

create or replace function public.validate_fm_authorization_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.fm_cost_submissions s
    where s.organisation_id = new.organisation_id and s.id = new.submission_id and s.status = 'submitted'
  ) then
    raise exception 'Only submitted claims can be authorized' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger fm_reimbursement_authorizations_submission_guard
before insert on public.fm_reimbursement_authorizations
for each row execute function public.validate_fm_authorization_submission();

comment on table public.fm_reimbursement_authorizations is
  'Reimbursement authorization against a submitted FM claim (one per claim). Distinct from the FM Approval (client work approval). authorized_amount is the outstanding basis. code AUTH-YYYY-######. Not a payment, not a posting.';

-- ---------------------------------------------------------------------------
-- fm_reimbursement_payments — amounts RECEIVED against an authorized claim
-- ---------------------------------------------------------------------------

create table public.fm_reimbursement_payments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  submission_id uuid not null,
  received_amount numeric(16, 2) not null,
  currency text not null default 'NGN',
  received_at timestamptz not null default timezone('utc', now()),
  reference text,
  method text,
  evidence_reference text,
  notes text,
  recorded_at timestamptz not null default timezone('utc', now()),
  recorded_by_profile_id uuid,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_reimbursement_payments_org_id_unique unique (organisation_id, id),
  constraint fm_reimbursement_payments_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_reimbursement_payments_amount_check check (received_amount > 0),
  constraint fm_reimbursement_payments_currency_nonempty check (char_length(trim(currency)) > 0),
  constraint fm_reimbursement_payments_submission_fk
    foreign key (organisation_id, submission_id)
    references public.fm_cost_submissions (organisation_id, id) on delete restrict,
  constraint fm_reimbursement_payments_recorded_by_fk
    foreign key (organisation_id, recorded_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (recorded_by_profile_id),
  constraint fm_reimbursement_payments_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id),
  constraint fm_reimbursement_payments_updated_by_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (updated_by_profile_id)
);

create unique index fm_reimbursement_payments_org_code_uidx
  on public.fm_reimbursement_payments (organisation_id, lower(code));
create index fm_reimbursement_payments_org_submission_idx
  on public.fm_reimbursement_payments (organisation_id, submission_id);

create trigger fm_reimbursement_payments_set_updated_at
before update on public.fm_reimbursement_payments
for each row execute function public.set_updated_at();

-- Monetary integrity, enforced in the database so concurrent receipts cannot
-- overshoot: the claim must be submitted/queried, an authorization must exist,
-- and cumulative received must not exceed authorized_amount. The authorization
-- row is locked FOR UPDATE to serialise concurrent payments.
create or replace function public.validate_fm_reimbursement_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_authorized numeric;
  v_paid numeric;
begin
  select s.status into v_status from public.fm_cost_submissions s
   where s.organisation_id = new.organisation_id and s.id = new.submission_id;
  if v_status is null or v_status not in ('submitted', 'queried') then
    raise exception 'Payments can only be recorded against submitted or queried claims'
      using errcode = '23514';
  end if;
  select a.authorized_amount into v_authorized from public.fm_reimbursement_authorizations a
   where a.organisation_id = new.organisation_id and a.submission_id = new.submission_id
   for update;
  if v_authorized is null then
    raise exception 'A reimbursement authorization is required before recording a payment'
      using errcode = '23514';
  end if;
  select coalesce(sum(p.received_amount), 0) into v_paid from public.fm_reimbursement_payments p
   where p.organisation_id = new.organisation_id and p.submission_id = new.submission_id and p.id <> new.id;
  if v_paid + new.received_amount > v_authorized then
    raise exception 'Payment exceeds outstanding authorized amount (outstanding %, attempted %)',
      greatest(v_authorized - v_paid, 0), new.received_amount
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger fm_reimbursement_payments_guard
before insert or update of received_amount, submission_id on public.fm_reimbursement_payments
for each row execute function public.validate_fm_reimbursement_payment();

comment on table public.fm_reimbursement_payments is
  'Reimbursement amount RECEIVED against an authorized FM claim (multiple receipts allowed; cumulative <= authorized_amount, DB-enforced). code PAY-YYYY-######. Not a treasury/ledger posting.';

-- ---------------------------------------------------------------------------
-- RLS — fail closed. No JWT table grants. No Super Admin bypass.
-- ---------------------------------------------------------------------------

alter table public.fm_cost_records enable row level security;
alter table public.fm_cost_submissions enable row level security;
alter table public.fm_cost_submission_items enable row level security;
alter table public.fm_reimbursement_authorizations enable row level security;
alter table public.fm_reimbursement_payments enable row level security;

revoke all on table public.fm_cost_records from public, anon, authenticated;
revoke all on table public.fm_cost_submissions from public, anon, authenticated;
revoke all on table public.fm_cost_submission_items from public, anon, authenticated;
revoke all on table public.fm_reimbursement_authorizations from public, anon, authenticated;
revoke all on table public.fm_reimbursement_payments from public, anon, authenticated;
grant all on table public.fm_cost_records to service_role;
grant all on table public.fm_cost_submissions to service_role;
grant all on table public.fm_cost_submission_items to service_role;
grant all on table public.fm_reimbursement_authorizations to service_role;
grant all on table public.fm_reimbursement_payments to service_role;
