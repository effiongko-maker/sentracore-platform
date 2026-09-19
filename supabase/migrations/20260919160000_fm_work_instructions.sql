-- FM Phase 2E — Work Instructions foundation (empty operational register).
-- ONE register for Work Orders and Job Orders. Table: fm_work_instructions.
-- order_type is explicit and mandatory (work_order | job_order), selected
-- manually. There is NO cost threshold: estimated_cost is independent of
-- order_type and never classifies it.
-- Compatibility API remains /api/work-orders. Server-mediated only.
-- Does NOT migrate Sheet Work Order rows. Does NOT seed rows.
--
-- Chain:  Request / Incident -> Work -> Work Instruction -> (Approval) -> cost
-- Relationships (no child-ID arrays are stored):
--   Work        fm_work_instructions.work_id (NOT NULL FK). A Work has 0..n
--               Work Instructions; a Work Instruction belongs to exactly one Work.
--   Facility    inherited from Work (composite FK keeps them equal; a Work
--               facility change cascades).
--   Incident    derived through Work (fm_work.incident_id) — not stored here.
--   Parent      parent_instruction_id (self FK)
-- Transitional (legacy domains still on Sheets, opaque — never FKs):
--   asset_ref, approval_ref

-- ---------------------------------------------------------------------------
-- fm_work: allow the (org, id, facility) composite reference used for
-- facility inheritance. Trivially unique because id is unique.
-- ---------------------------------------------------------------------------

alter table public.fm_work
  add constraint fm_work_org_id_facility_unique
  unique (organisation_id, id, facility_id);

-- ---------------------------------------------------------------------------
-- fm_work_instructions
-- ---------------------------------------------------------------------------

create table public.fm_work_instructions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  order_type text not null,
  work_id uuid not null,
  facility_id uuid not null,
  title text not null,
  description text,
  instruction_text text,
  work_category text not null default 'corrective',
  maintenance_type text,
  source text not null default 'manual',
  category_id text,
  asset_ref text,
  parent_instruction_id uuid,
  reported_by_profile_id uuid,
  assigned_to_profile_id uuid,
  status text not null default 'open',
  priority text not null default 'medium',
  hold_reason text,
  requested_at timestamptz not null default timezone('utc', now()),
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  due_at timestamptz,
  sla_due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  estimated_hours numeric(10, 2),
  actual_hours numeric(10, 2),
  estimated_cost numeric(16, 2),
  actual_cost numeric(16, 2),
  downtime_minutes integer,
  completion_notes text,
  work_performed text,
  requires_approval boolean not null default false,
  approval_ref text,
  operational_event_id uuid references public.operational_events (id) on delete set null,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_work_instructions_org_id_unique unique (organisation_id, id),
  constraint fm_work_instructions_title_nonempty check (char_length(trim(title)) > 0),
  constraint fm_work_instructions_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_work_instructions_order_type_check
    check (order_type in ('work_order', 'job_order')),
  constraint fm_work_instructions_category_check
    check (
      work_category in (
        'corrective', 'preventive', 'inspection', 'reactive', 'project', 'other'
      )
    ),
  constraint fm_work_instructions_maintenance_type_check
    check (maintenance_type is null or maintenance_type in ('planned', 'unplanned')),
  constraint fm_work_instructions_source_check
    check (
      source in (
        'manual', 'preventive_schedule', 'incident', 'inspection', 'request', 'system'
      )
    ),
  constraint fm_work_instructions_status_check
    check (
      status in (
        'draft', 'open', 'assigned', 'in_progress', 'on_hold',
        'completed', 'cancelled', 'closed'
      )
    ),
  constraint fm_work_instructions_priority_check
    check (priority in ('low', 'medium', 'high', 'critical')),
  constraint fm_work_instructions_estimated_cost_check
    check (estimated_cost is null or estimated_cost >= 0),
  constraint fm_work_instructions_actual_cost_check
    check (actual_cost is null or actual_cost >= 0),
  constraint fm_work_instructions_hours_check
    check (
      (estimated_hours is null or estimated_hours >= 0)
      and (actual_hours is null or actual_hours >= 0)
    ),
  constraint fm_work_instructions_downtime_check
    check (downtime_minutes is null or downtime_minutes >= 0),
  constraint fm_work_instructions_completed_requires_timestamp
    check (status <> 'completed' or completed_at is not null),
  constraint fm_work_instructions_not_own_parent
    check (parent_instruction_id is null or parent_instruction_id <> id),
  -- Work (and through it, facility) — tenant-safe. Facility is INHERITED:
  -- this composite reference forces facility_id to equal the Work's facility.
  constraint fm_work_instructions_work_fk
    foreign key (organisation_id, work_id, facility_id)
    references public.fm_work (organisation_id, id, facility_id)
    on delete restrict
    on update cascade,
  constraint fm_work_instructions_parent_fk
    foreign key (organisation_id, parent_instruction_id)
    references public.fm_work_instructions (organisation_id, id)
    on delete set null (parent_instruction_id),
  constraint fm_work_instructions_reported_by_fk
    foreign key (organisation_id, reported_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (reported_by_profile_id),
  constraint fm_work_instructions_assigned_fk
    foreign key (organisation_id, assigned_to_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (assigned_to_profile_id),
  constraint fm_work_instructions_created_by_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (created_by_profile_id),
  constraint fm_work_instructions_updated_by_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (updated_by_profile_id)
);

create unique index fm_work_instructions_org_code_uidx
  on public.fm_work_instructions (organisation_id, lower(code));

create index fm_work_instructions_org_status_idx
  on public.fm_work_instructions (organisation_id, status);

create index fm_work_instructions_org_work_idx
  on public.fm_work_instructions (organisation_id, work_id);

create index fm_work_instructions_org_facility_idx
  on public.fm_work_instructions (organisation_id, facility_id);

create index fm_work_instructions_org_order_type_idx
  on public.fm_work_instructions (organisation_id, order_type);

create index fm_work_instructions_org_assignee_idx
  on public.fm_work_instructions (organisation_id, assigned_to_profile_id)
  where assigned_to_profile_id is not null;

create index fm_work_instructions_org_requested_at_idx
  on public.fm_work_instructions (organisation_id, requested_at desc);

create index fm_work_instructions_org_due_idx
  on public.fm_work_instructions (organisation_id, due_at)
  where due_at is not null;

create index fm_work_instructions_org_asset_idx
  on public.fm_work_instructions (organisation_id, asset_ref)
  where asset_ref is not null;

create trigger fm_work_instructions_set_updated_at
before update on public.fm_work_instructions
for each row execute function public.set_updated_at();

create or replace function public.validate_fm_work_instruction_event_organisation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.operational_event_id is not null and not exists (
    select 1 from public.operational_events e
    where e.id = new.operational_event_id
      and e.organisation_id = new.organisation_id
  ) then
    raise exception 'Work Instruction operational event must belong to the same organisation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger fm_work_instructions_event_organisation_guard
before insert or update of operational_event_id, organisation_id on public.fm_work_instructions
for each row execute function public.validate_fm_work_instruction_event_organisation();

comment on table public.fm_work_instructions is
  'Canonical FM Work Instruction register (Work Orders and Job Orders). UUID is authoritative. code is the org-scoped display reference (WO-YYYY-######). order_type is explicit and mandatory; there is no cost threshold. Sheet Work Orders are frozen legacy.';

comment on column public.fm_work_instructions.order_type is
  'Explicit manual selection: work_order | job_order. Never inferred from estimated_cost or any amount.';

comment on column public.fm_work_instructions.estimated_cost is
  'Independent financial attribute. Never classifies order_type.';

comment on column public.fm_work_instructions.work_id is
  'The Work this instruction belongs to (NOT NULL). Incident context is derived through fm_work.incident_id.';

comment on column public.fm_work_instructions.facility_id is
  'Inherited from the Work via the composite FK (kept equal; cascades on Work facility change).';

comment on column public.fm_work_instructions.asset_ref is
  'Transitional opaque Sheet Asset id until the Asset cutover. Not a foreign key.';

comment on column public.fm_work_instructions.approval_ref is
  'Transitional opaque legacy Approval id (APR-*) until the Approval cutover. Not a foreign key.';

-- ---------------------------------------------------------------------------
-- The opaque Work Order ref on Incident is obsolete: Incident -> Work -> Work
-- Instruction is fully relational. requires_work_instruction remains.
-- Guarded: refuses to drop populated data.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.fm_incidents where work_order_ref is not null) then
    raise exception 'fm_incidents.work_order_ref holds data; refusing to drop';
  end if;
end;
$$;

alter table public.fm_incidents drop column work_order_ref;

-- ---------------------------------------------------------------------------
-- RLS — fail closed. No JWT table grants. No Super Admin bypass.
-- ---------------------------------------------------------------------------

alter table public.fm_work_instructions enable row level security;

revoke all on table public.fm_work_instructions from public, anon, authenticated;
grant all on table public.fm_work_instructions to service_role;
