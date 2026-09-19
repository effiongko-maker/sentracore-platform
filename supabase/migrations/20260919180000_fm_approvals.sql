-- FM Phase 2F — Approvals foundation (empty operational register).
-- FM Approval = a formal CLIENT approval request for a Work Instruction. Staff
-- create, submit and follow it up; the client's decision is RECORDED by a
-- protected action (FM step-up / System Administrator override).
-- Compatibility API remains /api/approvals. Server-mediated only.
-- Does NOT migrate Sheet Approval rows. Does NOT seed rows.
--
-- Relationships (no child-ID arrays, no duplicated context):
--   Work Instruction  fm_approvals.work_instruction_id (NOT NULL FK, UNIQUE per
--                     organisation: the product revises ONE approval per
--                     instruction — createApprovalFromWorkOrder updates the
--                     existing one). Relax by dropping the unique index.
--   Facility / Asset  derived through Work Instruction -> Work; NOT stored here.
--   Activity          fm_approval_activities (append-only child rows) replaces
--                     the JSON "Activity Log" cell.
-- Transitional: FM Costs (Sheets) reference the Approval by display code only
-- (opaque text on the Cost side). No FK is possible or created.

create table public.fm_approvals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  work_instruction_id uuid not null,
  title text not null,
  approval_type text not null default 'standard_maintenance',
  status text not null default 'draft',
  description text,
  reason text,
  cover_letter text,
  template_id text,
  client_name text,
  client_address text,
  approval_amount numeric(16, 2),
  approved_amount numeric(16, 2),
  currency text,
  requested_by_profile_id uuid,
  decided_by_profile_id uuid,
  generated_at timestamptz,
  submitted_at timestamptz,
  decision_at timestamptz,
  decision_notes text,
  decision_outcome text,
  decision_reference text,
  expires_at timestamptz,
  submission_method text,
  submitted_to text,
  submission_reference text,
  acknowledgement_file_name text,
  acknowledgement_file_mime text,
  acknowledgement_file_size bigint,
  decision_document_file_name text,
  decision_document_file_mime text,
  decision_document_file_size bigint,
  last_follow_up_at timestamptz,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_approvals_org_id_unique unique (organisation_id, id),
  constraint fm_approvals_title_nonempty check (char_length(trim(title)) > 0),
  constraint fm_approvals_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_approvals_type_check
    check (approval_type in ('standard_maintenance', 'variation', 'equipment_replacement', 'emergency')),
  constraint fm_approvals_status_check
    check (status in ('draft', 'awaiting_decision', 'approved', 'rejected', 'returned', 'cancelled', 'expired', 'closed')),
  constraint fm_approvals_outcome_check
    check (decision_outcome is null or decision_outcome in ('approved', 'rejected', 'partially_approved')),
  constraint fm_approvals_amounts_check
    check ((approval_amount is null or approval_amount >= 0) and (approved_amount is null or approved_amount >= 0)),
  constraint fm_approvals_file_sizes_check
    check (
      (acknowledgement_file_size is null or acknowledgement_file_size >= 0)
      and (decision_document_file_size is null or decision_document_file_size >= 0)
    ),
  -- An approval that reached the client carries its submission date.
  constraint fm_approvals_submitted_requires_timestamp
    check (status not in ('awaiting_decision', 'approved', 'rejected') or submitted_at is not null),
  -- A recorded decision is complete and attributable: date, outcome, and the
  -- platform profile that recorded it. Status and outcome must agree.
  constraint fm_approvals_decision_complete
    check (
      status not in ('approved', 'rejected')
      or (decision_at is not null and decision_outcome is not null and decided_by_profile_id is not null)
    ),
  constraint fm_approvals_decision_matches_status
    check (
      (status = 'rejected' and decision_outcome = 'rejected')
      or (status = 'approved' and decision_outcome in ('approved', 'partially_approved'))
      or status not in ('approved', 'rejected')
    ),
  constraint fm_approvals_work_instruction_fk
    foreign key (organisation_id, work_instruction_id)
    references public.fm_work_instructions (organisation_id, id)
    on delete restrict,
  constraint fm_approvals_requested_by_fk
    foreign key (organisation_id, requested_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (requested_by_profile_id),
  constraint fm_approvals_decided_by_fk
    foreign key (organisation_id, decided_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (decided_by_profile_id),
  constraint fm_approvals_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (created_by_profile_id),
  constraint fm_approvals_updated_by_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (updated_by_profile_id)
);

create unique index fm_approvals_org_code_uidx
  on public.fm_approvals (organisation_id, lower(code));

-- One Approval per Work Instruction (existing product behaviour).
create unique index fm_approvals_org_work_instruction_uidx
  on public.fm_approvals (organisation_id, work_instruction_id);

create index fm_approvals_org_status_idx
  on public.fm_approvals (organisation_id, status);

create index fm_approvals_org_type_idx
  on public.fm_approvals (organisation_id, approval_type);

create index fm_approvals_org_updated_at_idx
  on public.fm_approvals (organisation_id, updated_at desc);

create trigger fm_approvals_set_updated_at
before update on public.fm_approvals
for each row execute function public.set_updated_at();

comment on table public.fm_approvals is
  'Canonical FM client Approval register. UUID is authoritative. code is the org-scoped display reference (APR-YYYY-######). One Approval per Work Instruction. Facility/Asset derive through Work Instruction -> Work. Sheet Approvals are frozen legacy.';

comment on column public.fm_approvals.decided_by_profile_id is
  'Platform profile that RECORDED the client decision (protected action). Never a USR-* id, never derived from a role or title.';

-- ---------------------------------------------------------------------------
-- fm_approval_activities — append-only activity (replaces the JSON log cell)
-- ---------------------------------------------------------------------------

create table public.fm_approval_activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  approval_id uuid not null,
  action text not null,
  occurred_at timestamptz not null default timezone('utc', now()),
  summary text not null,
  actor_profile_id uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_approval_activities_action_check
    check (
      action in (
        'approval_created', 'approval_package_generated', 'approval_submitted',
        'approval_followed_up', 'approval_approved', 'approval_partially_approved',
        'approval_rejected', 'approval_cancelled', 'approval_document_uploaded',
        'approval_updated'
      )
    ),
  constraint fm_approval_activities_summary_nonempty check (char_length(trim(summary)) > 0),
  constraint fm_approval_activities_approval_fk
    foreign key (organisation_id, approval_id)
    references public.fm_approvals (organisation_id, id)
    on delete cascade,
  constraint fm_approval_activities_actor_fk
    foreign key (organisation_id, actor_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (actor_profile_id)
);

create index fm_approval_activities_approval_idx
  on public.fm_approval_activities (organisation_id, approval_id, occurred_at);

-- ---------------------------------------------------------------------------
-- Work Instruction: the opaque approval_ref is replaced by the FK above.
-- requires_approval REMAINS — the declared requirement is independent of
-- whether an Approval record exists. Guarded: refuses to drop populated data.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.fm_work_instructions where approval_ref is not null) then
    raise exception 'fm_work_instructions.approval_ref holds data; refusing to drop';
  end if;
end;
$$;

alter table public.fm_work_instructions drop column approval_ref;

-- ---------------------------------------------------------------------------
-- RLS — fail closed. No JWT table grants. No Super Admin bypass.
-- ---------------------------------------------------------------------------

alter table public.fm_approvals enable row level security;
alter table public.fm_approval_activities enable row level security;

revoke all on table public.fm_approvals from public, anon, authenticated;
revoke all on table public.fm_approval_activities from public, anon, authenticated;
grant all on table public.fm_approvals to service_role;
grant all on table public.fm_approval_activities to service_role;
