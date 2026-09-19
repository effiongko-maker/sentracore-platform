-- FM Phase 2D — Incidents foundation (empty operational register).
-- Durable product noun: Incident. Table: fm_incidents.
-- Issues remain a derived view. There is NO fm_issues.
-- Compatibility API remains /api/incidents. Server-mediated only (service role).
-- Does NOT migrate Sheet Incident rows. Does NOT seed Incidents.
-- New Incident creation stays frozen at the product layer (Phase 18); this
-- table is the authoritative store for existing/compat operations.
--
-- Relationships (no child-ID arrays are stored):
--   Request  -> fm_incidents.source_request_id (FK)   [replaces fm_request_incident_links]
--   Work     -> fm_work.incident_id (FK)               [replaces opaque fm_work.incident_ref]
--   Parent   -> fm_incidents.parent_incident_id (self FK)
-- Transitional (legacy domains still on Sheets, opaque — never FKs):
--   asset_ref           Sheet Asset id
--   work_order_ref      primary legacy Work Order id (scalar, not an array)

-- ---------------------------------------------------------------------------
-- fm_incidents
-- ---------------------------------------------------------------------------

create table public.fm_incidents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  facility_id uuid not null,
  title text not null,
  description text,
  location_detail text,
  incident_type text not null default 'other',
  source text not null default 'manual',
  category_id text,
  severity text not null default 'medium',
  status text not null default 'reported',
  reported_via text,
  is_emergency boolean not null default false,
  people_affected integer,
  hold_reason text,
  requires_work_instruction boolean not null default false,
  source_request_id uuid,
  parent_incident_id uuid,
  asset_ref text,
  work_order_ref text,
  reported_by_profile_id uuid,
  assigned_to_profile_id uuid,
  operational_event_id uuid references public.operational_events (id) on delete set null,
  reported_at timestamptz not null default timezone('utc', now()),
  discovered_at timestamptz,
  acknowledged_at timestamptz,
  response_due_at timestamptz,
  contained_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  immediate_actions text,
  root_cause text,
  corrective_actions text,
  preventive_actions text,
  resolution_notes text,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_incidents_org_id_unique unique (organisation_id, id),
  constraint fm_incidents_title_nonempty check (char_length(trim(title)) > 0),
  constraint fm_incidents_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_incidents_type_check
    check (
      incident_type in (
        'equipment_failure', 'safety', 'security', 'utility_failure',
        'environmental', 'observation', 'service_request', 'complaint', 'other'
      )
    ),
  constraint fm_incidents_source_check
    check (
      source in (
        'manual', 'technician', 'sensor', 'tenant', 'security',
        'system', 'external', 'request'
      )
    ),
  constraint fm_incidents_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint fm_incidents_status_check
    check (
      status in (
        'reported', 'triaged', 'investigating', 'contained',
        'resolved', 'closed', 'cancelled'
      )
    ),
  constraint fm_incidents_channel_check
    check (
      reported_via is null
      or reported_via in (
        'portal', 'mobile', 'phone', 'email', 'radio', 'walk_in', 'system', 'other'
      )
    ),
  constraint fm_incidents_people_affected_check
    check (people_affected is null or people_affected >= 0),
  constraint fm_incidents_resolved_requires_timestamp
    check (status <> 'resolved' or resolved_at is not null),
  constraint fm_incidents_closed_requires_timestamp
    check (status <> 'closed' or closed_at is not null),
  constraint fm_incidents_not_own_parent
    check (parent_incident_id is null or parent_incident_id <> id),
  constraint fm_incidents_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id)
    on delete restrict,
  constraint fm_incidents_source_request_fk
    foreign key (organisation_id, source_request_id)
    references public.fm_requests (organisation_id, id)
    on delete set null (source_request_id),
  constraint fm_incidents_parent_fk
    foreign key (organisation_id, parent_incident_id)
    references public.fm_incidents (organisation_id, id)
    on delete set null (parent_incident_id),
  constraint fm_incidents_reported_by_profile_fk
    foreign key (organisation_id, reported_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (reported_by_profile_id),
  constraint fm_incidents_assigned_profile_fk
    foreign key (organisation_id, assigned_to_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (assigned_to_profile_id),
  constraint fm_incidents_created_by_profile_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (created_by_profile_id),
  constraint fm_incidents_updated_by_profile_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (updated_by_profile_id)
);

create unique index fm_incidents_org_code_uidx
  on public.fm_incidents (organisation_id, lower(code));

create index fm_incidents_org_status_idx
  on public.fm_incidents (organisation_id, status);

create index fm_incidents_org_facility_idx
  on public.fm_incidents (organisation_id, facility_id);

create index fm_incidents_org_severity_idx
  on public.fm_incidents (organisation_id, severity);

create index fm_incidents_org_reported_at_idx
  on public.fm_incidents (organisation_id, reported_at desc);

create index fm_incidents_org_assignee_idx
  on public.fm_incidents (organisation_id, assigned_to_profile_id)
  where assigned_to_profile_id is not null;

create index fm_incidents_org_source_request_idx
  on public.fm_incidents (organisation_id, source_request_id)
  where source_request_id is not null;

create index fm_incidents_org_asset_idx
  on public.fm_incidents (organisation_id, asset_ref)
  where asset_ref is not null;

create trigger fm_incidents_set_updated_at
before update on public.fm_incidents
for each row execute function public.set_updated_at();

create or replace function public.validate_fm_incident_event_organisation()
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
    raise exception 'Incident operational event must belong to the same organisation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger fm_incidents_event_organisation_guard
before insert or update of operational_event_id, organisation_id on public.fm_incidents
for each row execute function public.validate_fm_incident_event_organisation();

comment on table public.fm_incidents is
  'Canonical FM Incident register. UUID is authoritative. code is the org-scoped display reference (INC-YYYY-######). No seed rows. Sheet Incidents are frozen legacy. New Incident creation is frozen at the product layer (Phase 18). Issues are derived, not stored.';

comment on column public.fm_incidents.code is
  'Organisation-scoped display reference. Generated on create. Immutable. May coincide with frozen Sheet-era INC-* strings; those are not identities here.';

comment on column public.fm_incidents.source_request_id is
  'Request this Incident belongs to (tenant-safe FK). Request incidentIds are derived from this column — never stored on the Request.';

comment on column public.fm_incidents.asset_ref is
  'Transitional opaque Sheet Asset id until the Asset cutover. Not a foreign key.';

comment on column public.fm_incidents.work_order_ref is
  'Transitional opaque primary legacy Work Order id (scalar, not an array) until the Work Instruction cutover. Not a foreign key.';

comment on column public.fm_incidents.requires_work_instruction is
  'Declared requirement that a Work Instruction (Work Order) is needed. Distinct from whether one exists.';

-- ---------------------------------------------------------------------------
-- Work provenance: fm_work.incident_id replaces opaque incident_ref.
-- Guarded: refuses to drop populated provenance.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.fm_work where incident_ref is not null) then
    raise exception 'fm_work.incident_ref holds data; refusing to drop';
  end if;
end;
$$;

alter table public.fm_work
  add column incident_id uuid;

alter table public.fm_work
  add constraint fm_work_incident_fk
    foreign key (organisation_id, incident_id)
    references public.fm_incidents (organisation_id, id)
    on delete set null (incident_id);

create index fm_work_org_incident_idx
  on public.fm_work (organisation_id, incident_id)
  where incident_id is not null;

alter table public.fm_work
  drop column incident_ref;

comment on column public.fm_work.incident_id is
  'Incident this Work treats (tenant-safe FK to fm_incidents). Incident maintenanceIds are derived from this column — never stored on the Incident.';

-- ---------------------------------------------------------------------------
-- Retire the Phase 2C transitional Request↔Incident bridge.
-- fm_incidents.source_request_id is the relational replacement.
-- Guarded: refuses to drop a populated bridge.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.fm_request_incident_links) then
    raise exception 'fm_request_incident_links holds data; refusing to drop';
  end if;
end;
$$;

drop table public.fm_request_incident_links;

-- ---------------------------------------------------------------------------
-- RLS — fail closed. No JWT table grants. No Super Admin bypass.
-- ---------------------------------------------------------------------------

alter table public.fm_incidents enable row level security;

revoke all on table public.fm_incidents from public, anon, authenticated;
grant all on table public.fm_incidents to service_role;
