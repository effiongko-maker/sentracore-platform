-- FM Phase 2B — Work foundation (empty operational register).
-- Durable product noun: Work. Table: fm_work.
-- Compatibility API remains /api/maintenance. No fm_maintenance table.
-- Does NOT migrate Sheet Maintenance rows. Does NOT seed Work.
-- Assignee identity: profiles.id. No USR-* columns.
-- Cross-domain Request/Incident/Asset refs are transitional opaque text — no FKs
-- to nonexistent FM tables. Work Instruction child ID arrays are not stored.

-- ---------------------------------------------------------------------------
-- fm_work
-- ---------------------------------------------------------------------------

create table public.fm_work (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  facility_id uuid not null,
  title text not null,
  description text,
  work_kind text,
  source text not null,
  priority text not null,
  status text not null default 'requested',
  asset_ref text,
  source_request_ref text,
  incident_ref text,
  assigned_to_profile_id uuid,
  reported_by_profile_id uuid,
  hold_reason text,
  requires_work_instruction boolean not null default false,
  operational_event_id uuid references public.operational_events (id) on delete set null,
  reported_at timestamptz not null default timezone('utc', now()),
  due_at timestamptz,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  completion_notes text,
  category_id text,
  department text,
  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_work_org_id_unique unique (organisation_id, id),
  constraint fm_work_title_nonempty check (char_length(trim(title)) > 0),
  constraint fm_work_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_work_kind_check
    check (
      work_kind is null
      or work_kind in (
        'preventive',
        'corrective',
        'inspection',
        'predictive',
        'routine',
        'other'
      )
    ),
  constraint fm_work_source_check
    check (
      source in (
        'manual',
        'request',
        'incident',
        'event',
        'schedule',
        'system'
      )
    ),
  constraint fm_work_priority_check
    check (priority in ('low', 'medium', 'high', 'critical')),
  constraint fm_work_status_check
    check (
      status in (
        'requested',
        'triaged',
        'scheduled',
        'in_progress',
        'on_hold',
        'completed',
        'cancelled'
      )
    ),
  constraint fm_work_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id)
    on delete restrict,
  constraint fm_work_assigned_profile_fk
    foreign key (organisation_id, assigned_to_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (assigned_to_profile_id),
  constraint fm_work_reported_by_profile_fk
    foreign key (organisation_id, reported_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (reported_by_profile_id),
  constraint fm_work_completed_requires_timestamp
    check (
      status <> 'completed'
      or completed_at is not null
    )
);

create unique index fm_work_org_code_uidx
  on public.fm_work (organisation_id, lower(code));

create index fm_work_organisation_id_idx
  on public.fm_work (organisation_id);

create index fm_work_org_status_idx
  on public.fm_work (organisation_id, status);

create index fm_work_org_facility_idx
  on public.fm_work (organisation_id, facility_id);

create index fm_work_org_assignee_idx
  on public.fm_work (organisation_id, assigned_to_profile_id)
  where assigned_to_profile_id is not null;

create index fm_work_org_reported_at_idx
  on public.fm_work (organisation_id, reported_at desc);

create trigger fm_work_set_updated_at
before update on public.fm_work
for each row execute function public.set_updated_at();

comment on table public.fm_work is
  'Canonical FM Work register. UUID is authoritative. code is org-scoped display identifier (WRK-YYYY-######). No seed rows. Sheet Maintenance is frozen legacy.';

comment on column public.fm_work.code is
  'Organisation-scoped display code. Generated on create. Immutable after create.';

comment on column public.fm_work.work_kind is
  'Optional work classification. Nullable — never invent corrective when absent.';

comment on column public.fm_work.requires_work_instruction is
  'Declared operational requirement that Work may need a Work Instruction. Distinct from whether an instruction row currently exists.';

comment on column public.fm_work.assigned_to_profile_id is
  'Platform profile UUID assignee. Not USR-*, not assignment id, not email.';

comment on column public.fm_work.asset_ref is
  'Transitional opaque Asset reference until Asset cutover. Not a foreign key.';

comment on column public.fm_work.source_request_ref is
  'Transitional opaque Request reference until Request cutover. Not a foreign key.';

comment on column public.fm_work.incident_ref is
  'Transitional opaque Incident reference until Incident cutover. Not a foreign key.';

-- ---------------------------------------------------------------------------
-- RLS — fail closed. No JWT table grants. No Super Admin bypass.
-- ---------------------------------------------------------------------------

alter table public.fm_work enable row level security;

revoke all on table public.fm_work from public, anon, authenticated;
grant all on table public.fm_work to service_role;
