-- FM Work Orders / Job Orders as COMMERCIAL SUBMISSION PACKAGES (operational review with the FM operator).
--
-- Corrected domain:  Operations  Issue → Work (faults, interventions, repairs — the work itself)
--                    Commercial  0..many Works → WO/JO submission → payment request / client decision → payment
-- A WO/JO is a commercial/payment submission package: several pieces of Work may be submitted together as one WO/JO,
-- and a WO/JO may be created directly without any Issue or Work.
--
-- Additive and non-destructive:
--   * fm_work_instructions.work_id becomes NULLABLE. Every existing row keeps its Work; nothing is rewritten.
--     A WO/JO without a Work must be a commercial submission (it states a submission status).
--   * Submission facts on the WO/JO: date, amount, status, last follow-up. The status vocabulary is the one the
--     operator described (submitted; draft only means not yet submitted). "Followed up" is an
--     EVENT recorded in fm_commercial_follow_ups (as for Approvals), never a status, and never implies payment —
--     payment state stays with Client Payments / receipts.
--   * fm_work_instruction_works: the Works a WO/JO submits (0..many). The legacy single work_id stays as it is and is
--     read together with this table; it is not copied here.
--   * fm_work_instruction_facilities: additional facilities a WO/JO covers beyond facility_id (e.g. "Both" = NCC Annex
--     and CSIRT), the same pattern as fm_work_facilities. Never splits the amount.
--   * fm_commercial_follow_ups: follow-up/chasing history for WO/JO submissions and client payments (incl. contract
--     instalments), mirroring the Approval follow-up fields. Recording a follow-up never changes a payment state.
--   * No backfill: imported WO/JO values are presented by read-time derivation from their own source row.
-- The Order Type classification is unchanged: explicit order_type selection, never inferred from any amount.

-- ---------------------------------------------------------------------------------------------------------------
-- WO/JO submission facts
-- ---------------------------------------------------------------------------------------------------------------
alter table public.fm_work_instructions alter column work_id drop not null;

alter table public.fm_work_instructions
  add column submission_date date,
  add column submission_amount numeric(18, 2),
  add column submission_status text,
  add column last_follow_up_at timestamptz;

alter table public.fm_work_instructions
  add constraint fm_work_instructions_submission_amount_check
    check (submission_amount is null or submission_amount >= 0),
  add constraint fm_work_instructions_submission_status_check
    check (submission_status is null or submission_status in ('draft', 'submitted')),
  add constraint fm_work_instructions_work_or_submission
    check (work_id is not null or submission_status is not null);

-- With work_id nullable the facility is no longer guaranteed through the Work foreign key: anchor it directly.
alter table public.fm_work_instructions
  add constraint fm_work_instructions_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id)
    on delete restrict;

comment on column public.fm_work_instructions.work_id is
  'Legacy single Work link (kept for every existing row). NULL for a WO/JO created directly as a commercial submission; further Works are linked in fm_work_instruction_works.';
comment on column public.fm_work_instructions.submission_date is 'Date the WO/JO was submitted to the client.';
comment on column public.fm_work_instructions.submission_amount is 'Amount submitted in this WO/JO (commercial value). Never a cost, never spend.';
comment on column public.fm_work_instructions.submission_status is
  'Commercial submission status: draft | submitted; followed-up activity is displayed separately. NULL = not recorded (legacy / imported). Follow-ups are events; payment is separate.';
comment on column public.fm_work_instructions.last_follow_up_at is 'Most recent recorded follow-up (fm_commercial_follow_ups). Not a status.';

-- ---------------------------------------------------------------------------------------------------------------
-- Works submitted in a WO/JO (0..many)
-- ---------------------------------------------------------------------------------------------------------------
create table public.fm_work_instruction_works (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  work_instruction_id uuid not null,
  work_id uuid not null,
  created_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_work_instruction_works_instruction_fk
    foreign key (organisation_id, work_instruction_id)
    references public.fm_work_instructions (organisation_id, id) on delete cascade,
  constraint fm_work_instruction_works_work_fk
    foreign key (organisation_id, work_id)
    references public.fm_work (organisation_id, id) on delete restrict,
  constraint fm_work_instruction_works_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id) on delete set null (created_by_profile_id)
);
create unique index fm_work_instruction_works_uidx
  on public.fm_work_instruction_works (organisation_id, work_instruction_id, work_id);
create index fm_work_instruction_works_work_idx
  on public.fm_work_instruction_works (organisation_id, work_id);
comment on table public.fm_work_instruction_works is
  'Works submitted together in one WO/JO (commercial package). Optional: a WO/JO may link none. Read together with the legacy fm_work_instructions.work_id.';

-- ---------------------------------------------------------------------------------------------------------------
-- Additional facilities a WO/JO covers ("Both")
-- ---------------------------------------------------------------------------------------------------------------
create table public.fm_work_instruction_facilities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  work_instruction_id uuid not null,
  facility_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_work_instruction_facilities_instruction_fk
    foreign key (organisation_id, work_instruction_id)
    references public.fm_work_instructions (organisation_id, id) on delete cascade,
  constraint fm_work_instruction_facilities_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict
);
create unique index fm_work_instruction_facilities_uidx
  on public.fm_work_instruction_facilities (organisation_id, work_instruction_id, facility_id);
create index fm_work_instruction_facilities_facility_idx
  on public.fm_work_instruction_facilities (organisation_id, facility_id);
comment on table public.fm_work_instruction_facilities is
  'Additional facilities a WO/JO covers beyond fm_work_instructions.facility_id (e.g. Both = NCC Annex + CSIRT). Never splits the submitted amount.';

-- ---------------------------------------------------------------------------------------------------------------
-- Follow-up / chasing history (WO/JO submissions and client payments incl. contract instalments)
-- ---------------------------------------------------------------------------------------------------------------
alter table public.fm_cost_submissions add column last_follow_up_at timestamptz;
comment on column public.fm_cost_submissions.last_follow_up_at is
  'Most recent recorded follow-up (fm_commercial_follow_ups). Not a status and never a payment state.';

create table public.fm_commercial_follow_ups (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  work_instruction_id uuid,
  cost_submission_id uuid,
  followed_up_at timestamptz not null,
  method text not null,
  contact_person text,
  outcome_notes text not null,
  next_follow_up_at timestamptz,
  actor_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_commercial_follow_ups_one_target
    check (num_nonnulls(work_instruction_id, cost_submission_id) = 1),
  constraint fm_commercial_follow_ups_method_check
    check (method in ('phone', 'email', 'physical_visit', 'client_portal', 'other')),
  constraint fm_commercial_follow_ups_notes_nonempty check (char_length(trim(outcome_notes)) > 0),
  constraint fm_commercial_follow_ups_instruction_fk
    foreign key (organisation_id, work_instruction_id)
    references public.fm_work_instructions (organisation_id, id) on delete cascade,
  constraint fm_commercial_follow_ups_submission_fk
    foreign key (organisation_id, cost_submission_id)
    references public.fm_cost_submissions (organisation_id, id) on delete cascade,
  constraint fm_commercial_follow_ups_actor_fk
    foreign key (organisation_id, actor_profile_id)
    references public.profiles (organisation_id, id) on delete set null (actor_profile_id)
);
create index fm_commercial_follow_ups_instruction_idx
  on public.fm_commercial_follow_ups (organisation_id, work_instruction_id, followed_up_at desc);
create index fm_commercial_follow_ups_submission_idx
  on public.fm_commercial_follow_ups (organisation_id, cost_submission_id, followed_up_at desc);
comment on table public.fm_commercial_follow_ups is
  'Follow-up/chasing events for a WO/JO submission or a client payment. Append-only history; a follow-up is never a payment state.';

-- Append-only: follow-up history is evidence.
create or replace function public.fm_commercial_follow_ups_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'fm_commercial_follow_ups is append-only' using errcode = '42501';
end;
$$;
create trigger fm_commercial_follow_ups_append_only
before update on public.fm_commercial_follow_ups
for each row execute function public.fm_commercial_follow_ups_append_only();

-- ---------------------------------------------------------------------------------------------------------------
-- RLS — fail closed, service role only (same as every FM table)
-- ---------------------------------------------------------------------------------------------------------------
alter table public.fm_work_instruction_works enable row level security;
alter table public.fm_work_instruction_facilities enable row level security;
alter table public.fm_commercial_follow_ups enable row level security;
revoke all on table public.fm_work_instruction_works from public, anon, authenticated;
revoke all on table public.fm_work_instruction_facilities from public, anon, authenticated;
revoke all on table public.fm_commercial_follow_ups from public, anon, authenticated;
grant all on table public.fm_work_instruction_works to service_role;
grant all on table public.fm_work_instruction_facilities to service_role;
grant all on table public.fm_commercial_follow_ups to service_role;
